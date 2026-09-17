import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { CellModeChannel } from './cell-mode-channel.mjs';

function fixture({ result = 1, scans = 2, sequence = 0 } = {}) {
  let time = 0;
  let remaining = scans;
  const plc = { xCellManual: false, xCellManualRequest: false,
    udiCellModeCommandSeq: sequence, udiCellModeAckSeq: sequence, uiCellModeResult: 0 };
  const writes = [];
  const channel = new CellModeChannel({
    read: async () => ({ ...plc }),
    write: async (path, value) => { writes.push([path, value]); plc[path] = value; },
    now: () => time,
    timeoutMs: 160,
    pause: async (ms) => {
      time += ms;
      if (--remaining === 0) {
        if (result === 1) plc.xCellManual = plc.xCellManualRequest;
        plc.uiCellModeResult = result;
        plc.udiCellModeAckSeq = plc.udiCellModeCommandSeq;
      }
    },
  });
  return { plc, writes, channel };
}

test('one request survives delayed PLC scans and returns only after its acknowledgement', async () => {
  const f = fixture();
  await f.channel.run(true);
  assert.equal(f.plc.xCellManual, true);
  assert.deepEqual(f.writes, [['xCellManualRequest', true], ['udiCellModeCommandSeq', 1]]);
});

test('repeating the current mode still requires a new PLC acknowledgement', async () => {
  const f = fixture();
  f.plc.xCellManual = true;
  await f.channel.run(true);
  assert.equal(f.plc.udiCellModeAckSeq, 1);
});

for (const [result, manual, reason] of [[2, true, /остановите/], [3, false, /авария/], [99, true, /неизвестный/]]) {
  test(`PLC rejection ${result} is not reported as success`, async () => {
    const f = fixture({ result });
    await assert.rejects(f.channel.run(manual), reason);
    assert.equal(f.plc.xCellManual, false);
    assert.equal(f.writes.length, 2);
  });
}

test('timeout never retries the command or overwrites an unacknowledged payload', async () => {
  const f = fixture({ scans: 100 });
  await assert.rejects(f.channel.run(true), /не подтвердил/);
  await assert.rejects(f.channel.run(false), /Предыдущее/);
  assert.equal(f.writes.length, 2);
  assert.equal(f.plc.xCellManualRequest, true);
});

test('a restarted gateway refuses an outstanding PLC transaction', async () => {
  const f = fixture();
  f.plc.udiCellModeCommandSeq = 12;
  await assert.rejects(f.channel.run(false), /Предыдущее/);
  assert.deepEqual(f.writes, []);
});

test('concurrent mode commands cannot interleave payload and sequence', async () => {
  const f = fixture();
  const first = f.channel.run(true);
  await assert.rejects(f.channel.run(false), /предыдущее/);
  await first;
  assert.equal(f.plc.xCellManual, true);
});

test('sequence wrap skips zero', async () => {
  const f = fixture({ sequence: 0xffffffff });
  await f.channel.run(true);
  assert.equal(f.plc.udiCellModeAckSeq, 1);
});

test('an ambiguous write failure leaves the outstanding PLC request protected', async () => {
  const f = fixture();
  const write = f.channel.write;
  f.channel.write = async (path, value) => {
    await write(path, value);
    if (path === 'udiCellModeCommandSeq') throw new Error('connection lost after write');
  };
  await assert.rejects(f.channel.run(true), /connection lost/);
  await assert.rejects(f.channel.run(false), /Предыдущее/);
  assert.equal(f.writes.length, 2);
});

test('actual gateway writeValue never invents telemetry after a successful or delayed write', async () => {
  const source = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function writeValue('), source.indexOf('async function pulseValue('));
  const latestValues = { xCellManual: false, rRobotManualSpeedPercent: 10 };
  const published = [];
  const writeValue = runInNewContext(`${body}\nwriteValue`, {
    latestValues, symbolNodes: new Map([['xCellManual', 1], ['rRobotManualSpeedPercent', 2]]),
    opcua: { session: { writeSingleNode: async () => ({ isGood: () => true }) } },
    Variant: class { constructor(value) { Object.assign(this, value); } },
    jsonValue: (value) => value, publishSnapshot: (...args) => published.push(args),
  });
  await writeValue('xCellManual', 1, true);
  await writeValue('rRobotManualSpeedPercent', 2, 100);
  assert.deepEqual(latestValues, { xCellManual: false, rRobotManualSpeedPercent: 10 });
  assert.deepEqual(published, []);
});
