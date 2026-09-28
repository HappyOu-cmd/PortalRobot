import assert from 'node:assert/strict';
import test from 'node:test';
import { executeTwinCommand, twinConfigTypes, twinSymbols } from './two-pallet-channel.mjs';
import { AcknowledgedCommand } from './acknowledged-command.mjs';
import { CellEventClassifier, describeOperatorCommand } from './cell-events.mjs';

function fixture(result = 1) {
  const plc = { udiTwinCommandSeq: 0, udiTwinAckSeq: 0, uiTwinResult: 0, udiHmiCommandClockMs: 100 };
  const writes = []; let time = 0;
  const write = async (path, value) => { plc[path] = value; writes.push([path, value]); };
  const channel = new AcknowledgedCommand({ read: async () => ({ ...plc }), write, now: () => time,
    pause: async () => { time += 40; plc.uiTwinResult = result; plc.udiTwinAckSeq = plc.udiTwinCommandSeq; } });
  return { plc, writes, channel, write: (path, _type, value) => write(path, value), types: { UInt16: 1, UInt32: 2, Boolean: 3, Double: 4 } };
}
test('twin command payload and confirmation revision precede the fresh timestamp and commit', async () => {
  const f = fixture(); await executeTwinCommand({ command: 'twin.command', magazine: 2, action: 2, value: 1, revision: 42 }, f);
  assert.deepEqual(f.writes.slice(-3), [['stTwinRequest.udiRevision', 42], ['udiTwinIssuedAtMs', 100], ['udiTwinCommandSeq', 1]]);
  assert.equal(f.plc['stTwinRequest.uiMagazine'], 2); assert.equal(f.plc.udiTwinAckSeq, 1);
});
test('shared twin command channel refuses concurrent or unacknowledged requests', async () => {
  const f = fixture(); const first = executeTwinCommand({ command: 'twin.mode', value: 1 }, f);
  await assert.rejects(executeTwinCommand({ command: 'twin.command', magazine: 1, action: 9 }, f), /предыдущ/); await first;
  const writes = f.writes.length; f.plc.udiTwinCommandSeq = 10;
  await assert.rejects(executeTwinCommand({ command: 'twin.mode', value: 0 }, f), /Предыдущ/); assert.equal(f.writes.length, writes);
});
test('PLC rejection and expired commands are never reported as accepted', async () => {
  for (const result of [2, 4]) await assert.rejects(executeTwinCommand({ command: 'twin.command', magazine: 1, action: 8 }, fixture(result)), result === 4 ? /устарела/ : /отклонил/);
});
test('coordinate teaching commands use the acknowledged twin channel', async () => {
  for (const action of [25, 26]) {
    const f = fixture(); await executeTwinCommand({ command: 'twin.command', magazine: 1, action }, f);
    assert.equal(f.plc['stTwinRequest.uiCommand'], action); assert.equal(f.plc.udiTwinAckSeq, 1);
  }
});
test('operator start and rejection use the acknowledged twin channel', async () => {
  for (const action of [27, 28]) {
    const f = fixture(); await executeTwinCommand({ command: 'twin.command', magazine: 1, action, value: 2, revision: 7 }, f);
    assert.equal(f.plc['stTwinRequest.uiCommand'], action); assert.equal(f.plc.udiTwinAckSeq, 1);
  }
  const invalid = fixture();
  await assert.rejects(executeTwinCommand({ command: 'twin.command', magazine: 1, action: 34 }, invalid), /Неверная команд/);
  assert.deepEqual(invalid.writes, []);
});
test('independent lock and stop commands use the acknowledged twin channel', async () => {
  for (const action of [29, 30, 31, 32]) {
    const f = fixture(); await executeTwinCommand({ command: 'twin.command', magazine: 1, action }, f);
    assert.equal(f.plc['stTwinRequest.uiCommand'], action); assert.equal(f.plc.udiTwinAckSeq, 1);
  }
});
test('invalid slot, revision and incomplete parameters cause no writes', async () => {
  for (const data of [{ action: 23, slot: 97, content: 1, productType: 1 }, { action: 2, revision: -1 }, { action: 24, twinConfig: {} }]) {
    const f = fixture(); await assert.rejects(executeTwinCommand({ command: 'twin.command', magazine: 1, ...data }, f)); assert.deepEqual(f.writes, []);
  }
  assert.equal(new Set(twinSymbols).size, twinSymbols.length);
  assert.ok(twinSymbols.includes('astTwinStore[2].astPallet[2].aSlots[96].eDetailType'));
});

const twinConfig = () => Object.fromEntries(Object.entries(twinConfigTypes)
  .map(([key, type]) => [key, type === 'Boolean' ? true : key === 'uiP1Signals' ? 42 : key === 'uiP2Signals' ? 21 : 100]));

test('complete P1/P2 reed patterns are written before the configuration transaction commits', async () => {
  const f = fixture(); const config = twinConfig();
  await executeTwinCommand({ command: 'twin.command', magazine: 2, action: 24, twinConfig: config }, f);
  for (const field of Object.keys(twinConfigTypes)) assert.equal(f.plc[`stTwinRequest.Config.${field}`], config[field]);
  assert.deepEqual(f.writes.slice(-2), [['udiTwinIssuedAtMs', 100], ['udiTwinCommandSeq', 1]]);
  assert.equal(f.plc.udiTwinAckSeq, 1);
  for (const magazine of [1, 2]) for (const field of ['uiP1Signals', 'uiP2Signals', 'xSignalPatternsConfigured']) {
    assert.ok(twinSymbols.includes(`astTwinConfig[${magazine}].${field}`));
  }
});

test('out-of-range, fractional or missing reed patterns are rejected before writing any PLC tag', async () => {
  for (const patch of [{ uiP1Signals: -1 }, { uiP2Signals: 64 }, { uiP1Signals: 1.5 }, { uiP2Signals: undefined }, { xSignalPatternsConfigured: 1 }]) {
    const f = fixture();
    await assert.rejects(executeTwinCommand({ command: 'twin.command', magazine: 1, action: 24, twinConfig: { ...twinConfig(), ...patch } }, f), /Некорректный параметр/);
    assert.deepEqual(f.writes, []);
  }
});
test('journal identifies the physical pallet and does not log active-pallet swaps as inventory edits', () => {
  const classifier = new CellEventClassifier(); const base = { uiMagazineMode: 1, 'astTwinStatus[1].uiRobotPallet': 1,
    'astMagazineInventory[1].aSlots[1].eDetailType': 1, 'astTwinStore[1].astPallet[2].aSlots[96].eDetailType': 0 };
  classifier.process(base, 1);
  const swapped = { ...base, 'astTwinStatus[1].uiRobotPallet': 2, 'astMagazineInventory[1].aSlots[1].eDetailType': 0 };
  const events = classifier.process(swapped, 2); assert.ok(events.some((e) => e.eventType === 'pallet-state')); assert.ok(!events.some((e) => e.eventType === 'slot-content'));
  const edited = classifier.process({ ...swapped, 'astTwinStore[1].astPallet[2].aSlots[96].eDetailType': 2 }, 3).find((e) => e.eventType === 'slot-content');
  assert.equal(edited.details.magazine, 1); assert.equal(edited.details.pallet, 2); assert.equal(edited.details.slots[0].slot, 96);
  assert.equal(describeOperatorCommand({ command: 'twin.command', magazine: 2, action: 8 }).label, 'Магазин 2: Home');
});
