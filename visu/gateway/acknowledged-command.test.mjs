import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { AcknowledgedCommand } from './acknowledged-command.mjs';
import { pulsePaths, pulseProtocols, settingPaths, settingProtocol, payloadProtocols } from './command-contract.mjs';

function fixture({ scans = 2, result = 1 } = {}) {
  const protocol = settingProtocol;
  const state = { [protocol.request]: 0, [protocol.ack]: 0, [protocol.result]: 0, udiHmiCommandClockMs: 100 };
  const writes = [];
  let time = 0;
  const channel = new AcknowledgedCommand({
    read: async (paths) => Object.fromEntries(paths.map((path) => [path, state[path]])),
    write: async (path, value) => { state[path] = value; writes.push([path, value]); },
    now: () => time, timeoutMs: 160,
    pause: async (ms) => {
      time += ms;
      if (--scans === 0) { state[protocol.result] = result; state[protocol.ack] = state[protocol.request]; }
    },
  });
  return { state, writes, channel, protocol };
}

test('payload, PLC timestamp and commit are sent once; result is read after Ack', async () => {
  const f = fixture();
  const reads = [];
  const read = f.channel.read;
  f.channel.read = async (paths) => { reads.push(paths); return read(paths); };
  await f.channel.run(f.protocol, () => f.channel.write('draft', 45), (result) => assert.equal(result, 1));
  assert.deepEqual(f.writes, [['draft', 45], [f.protocol.issued, 100], [f.protocol.request, 1]]);
  assert.deepEqual(reads.at(-2), [f.protocol.ack]);
  assert.deepEqual(reads.at(-1), [f.protocol.result]);
});

test('timeout and gateway restart never overwrite an outstanding request', async () => {
  const f = fixture({ scans: 100 });
  await assert.rejects(f.channel.run(f.protocol), /не подтвердил/);
  const restarted = new AcknowledgedCommand({ read: f.channel.read, write: f.channel.write });
  let prepared = false;
  await assert.rejects(restarted.run(f.protocol, async () => { prepared = true; }), /не подтверждена/);
  assert.equal(prepared, false);
  assert.equal(f.writes.length, 2);
});

test('concurrent calls cannot change a prepared payload', async () => {
  const f = fixture();
  const first = f.channel.run(f.protocol);
  await assert.rejects(f.channel.run(f.protocol), /предыдущую/);
  await first;
});

test('sequence wrap skips zero', async () => {
  const f = fixture();
  f.state[f.protocol.request] = f.state[f.protocol.ack] = 0xffffffff;
  await f.channel.run(f.protocol);
  assert.equal(f.state[f.protocol.ack], 1);
});

for (const result of [2, 3, 4]) test(`settings rejection ${result} is returned, not success`, async () => {
  const f = fixture({ result });
  await assert.rejects(f.channel.run(f.protocol, undefined, (value) => {
    if (value !== 1) throw new Error(`rejected:${value}`);
  }), new RegExp(`rejected:${result}`));
  assert.equal(f.writes.filter(([path]) => path === f.protocol.request).length, 1);
});

test('ambiguous commit failure protects the request after reconnect', async () => {
  const f = fixture();
  const write = f.channel.write;
  f.channel.write = async (path, value) => {
    await write(path, value);
    if (path === f.protocol.request) throw new Error('connection lost');
  };
  await assert.rejects(f.channel.run(f.protocol), /connection lost/);
  await assert.rejects(f.channel.run(f.protocol), /не подтверждена/);
  assert.equal(f.writes.length, 2);
});

test('preparation failure does not publish a command sequence', async () => {
  const f = fixture();
  await assert.rejects(f.channel.run(f.protocol, async () => { throw new Error('payload failed'); }), /payload failed/);
  assert.deepEqual(f.writes, []);
});

test('shared axis payload is protected before writes, including after restart', async () => {
  const payload = payloadProtocols({ command: 'robot.axis.target', machine: 2 });
  const f = fixture();
  for (const protocol of payload.protocols) f.state[protocol.request] = f.state[protocol.ack] = 0;
  f.state[payload.protocols[1].request] = 1;
  let wrote = false;
  await assert.rejects(f.channel.exclusive(payload.key, payload.protocols, async () => { wrote = true; }), /не подтверждена/);
  assert.equal(wrote, false);
});

test('Stop is independent of an outstanding ordinary command and payload lock', async () => {
  const f = fixture({ scans: 100 });
  const stop = pulseProtocols.get('xPointCheckStop');
  f.state[stop.request] = f.state[stop.ack] = 0;
  const write = f.channel.write;
  f.channel.write = async (path, value) => {
    await write(path, value);
    if (path === stop.request) { f.state[stop.result] = 1; f.state[stop.ack] = value; }
  };
  const ordinary = f.channel.run(f.protocol);
  f.channel.busy.add('payload-test-scenario');
  await f.channel.run(stop);
  await assert.rejects(ordinary, /не подтвердил/);
  assert.equal(f.state[stop.ack], 1);
  assert.equal(payloadProtocols({ command: 'robot.point.stop' }), null);
  assert.equal(payloadProtocols({ command: 'robot.stop' }), null);
  assert.equal(payloadProtocols({ command: 'cell.stop' }), null);
  assert.equal(payloadProtocols({ command: 'magazine.stop', magazine: 1 }), null);
});

test('invalid PLC counters fail closed before any write', async () => {
  const f = fixture();
  delete f.state[f.protocol.ack];
  await assert.rejects(f.channel.run(f.protocol), /счётчик/);
  assert.deepEqual(f.writes, []);
});

test('all mapped pulse gateway commands use the acknowledged transport', async () => {
  const source = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function executeCommandPrepared(');
  const body = source.slice(start, source.indexOf('async function executeCommand(message)', start));
  const DataType = Object.fromEntries(['Boolean', 'UInt16', 'UInt32', 'Double', 'Float', 'Int64'].map((key) => [key, key]));
  const mapStart = source.indexOf('const commandMap =');
  const mapEnd = source.indexOf('\n};', mapStart) + 3;
  const commandMap = runInNewContext(`${source.slice(mapStart, mapEnd)}\ncommandMap`, { DataType });
  const pulsed = [];
  const written = [];
  const command = runInNewContext(`${body}\nexecuteCommandPrepared`, {
    DataType, commandMap, pulseProtocols, settingPaths: [],
    writeValue: async (path) => { written.push(path); assert.ok(!pulseProtocols.has(path), `raw pulse ${path}`); },
    pulseValue: async (path) => { assert.ok(pulseProtocols.has(path), path); pulsed.push(path); return 1; },
  });
  for (const [name, definition] of Object.entries(commandMap)) if (definition.pulse) await command({ command: name });
  for (let i = 1; i <= 3; i++) {
    for (const action of ['enable', 'disable', 'reset', 'setBlank', 'setDetail', 'acceptDoor', 'rejectDoor', 'acceptRun', 'rejectRun', 'manualDoorOpen', 'manualDoorClose', 'manualHatchOpen', 'manualHatchClose', 'manualHatchUnlock', 'manualHatchLock', 'manualChuckOpen', 'manualChuckClose']) await command({ command: `machine.${action}`, machine: i });
    await command({ command: 'fault.axisJogConflict', machine: i });
    await command({ command: 'fault.machine.simReset', machine: i });
    for (const action of ['home', 'moveAbsolute', 'moveRelative']) await command({ command: `robot.axis.${action}`, machine: i, value: 1 });
  }
  for (let i = 1; i <= 2; i++) {
    for (const action of ['enable', 'disable', 'stop', 'reset', 'fill', 'clear', 'pitchX', 'pitchY', 'setSlot']) await command({ command: `magazine.${action}`, magazine: i, slot: 1, value: 2, content: 1, productType: 1 });
  }
  for (const message of [
    { command: 'robot.point.stop' }, { command: 'robot.action', action: 2 },
    { command: 'multi.typeCount', value: 2 }, { command: 'multi.machineType', machine: 1, value: 2 },
    { command: 'multi.slotType', slot: 1, value: 2 }, { command: 'cell.operatorChoice', value: 1 },
    { command: 'robot.controlMode.set', value: 0 }, { command: 'test.environment.set', value: 1 },
    { command: 'test.speed.set', value: 0 },
  ]) await command(message);
  // Scenario has its existing normalization/buffer protocol and is checked by the ST contract.
  assert.deepEqual(new Set(pulsed), new Set(pulsePaths.filter((path) => path !== 'xTestScenarioApply')));
  assert.ok(written.length > 0);
  assert.doesNotMatch(source, /setTimeout\([^\n]*writeValue[^\n]*150/);
});

test('all 13 actual gateway settings write a separate payload; rejected settings never report applied', async () => {
  const source = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function executeCommandPrepared(');
  const body = source.slice(start, source.indexOf('async function executeCommand(message)', start));
  const DataType = Object.fromEntries(['Boolean', 'UInt16', 'UInt32', 'Double', 'Float', 'Int64'].map((key) => [key, key]));
  const mapStart = source.indexOf('const commandMap =');
  const mapEnd = source.indexOf('\n};', mapStart) + 3;
  const commandMap = runInNewContext(`${source.slice(mapStart, mapEnd)}\ncommandMap`, { DataType });
  const writes = [];
  let plcResult = 1;
  const command = runInNewContext(`${body}\nexecuteCommandPrepared`, {
    DataType, commandMap, settingPaths, settingProtocol,
    writeValue: async (path, type, value) => { writes.push([path, value]); },
    commandChannel: { run: async (protocol, prepare, verify) => { assert.equal(protocol, settingProtocol); await prepare(); verify(plcResult); return 9; } },
  });
  let tested = 0;
  for (const [name, definition] of Object.entries(commandMap)) {
    const index = settingPaths.indexOf(definition.path);
    if (index < 0) continue;
    tested++;
    writes.length = 0;
    const message = { command: name, value: 12 };
    await command(message);
    assert.deepEqual(writes, [['uiCellSettingIndex', index + 1], ['lrCellSettingRequest', index < 4 ? 12 : 12000]]);
    assert.equal(message._plcApplied, true);
    assert.equal(message._plcReceipt.sequence, 9);
  }
  assert.equal(tested, 13);
  for (plcResult of [2, 3, 4]) {
    const message = { command: 'cell.settings.safetyHomeToleranceX', value: 12 };
    await assert.rejects(command(message), /отклонил/);
    assert.equal(message._plcApplied, undefined);
  }
  writes.length = 0;
  await assert.rejects(command({ command: 'cell.settings.pointCheckSpeed', value: 'NaN' }), /конечным числом/);
  assert.deepEqual(writes, []);
});
