import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeIoSnapshot, parseIoEvent, readStableIo, IoJournalIngestor, ioArchiveEvent } from './physical-io.mjs';
import { IoOverrideChannel } from './io-override-channel.mjs';
import { CellEventStore, describeOperatorCommand } from './cell-events.mjs';

function fifo(sequence = 0, epoch = 7, clockMs = sequence + 10) {
  const values = { udiIoBootCounter: epoch, udiIoJournalRevision: sequence * 2,
    udiIoJournalSequence: sequence, uiIoJournalCount: Math.min(sequence, 100),
    uiIoJournalHead: sequence ? ((sequence - 1) % 100) + 1 : 0, sIoClockMs: String(clockMs),
    xIoOverrideAllowed: true, uiIoOverrideBlockReason: 0, uiIoForcedCount: 0, xPhysicalIoMappingVerified: true,
    xIoDoOverrideAllowed: true, uiIoDoBlockReason: 0, xIoEmergencyStopActive: false, xIoEmergencyResetAllowed: false,
    xIoManualControlActive: true, xIoManualStartAllowed: false };
  for (const name of ['adwIoRawDi', 'adwIoUsedDi', 'adwIoForcedDi']) for (let word = 1; word <= 3; word++) values[`${name}[${word}]`] = 0;
  for (const name of ['adwIoDo', 'adwIoDoAllowed', 'adwIoDoOnAllowed', 'adwIoForcedDo', 'adwIoInhibitedDo']) for (let word = 1; word <= 2; word++) values[`${name}[${word}]`] = 0;
  for (let i = Math.max(1, sequence - 99); i <= sequence; i++) values[`asIoJournal[${((i - 1) % 100) + 1}]`] = `${i};${i};1;79;2;${i % 2};${(i + 1) % 2}`;
  return values;
}

test('empty FIFO is not a fabricated set of 131 startup edges', () => {
  const data = decodeIoSnapshot(fifo(), 1000);
  assert.deepEqual(data.history, []);
  assert.equal(data.rawDi.length, 84);
  assert.equal(data.outputs.length, 50);
  assert.equal(data.manualActive, true);
  assert.equal(data.manualStartAllowed, false);
});

test('bit 31 and the last DI/DO bits are unsigned and independent', () => {
  const values = fifo();
  values['adwIoRawDi[1]'] = 0x80000000;
  values['adwIoUsedDi[3]'] = 1 << 19;
  values['adwIoForcedDi[3]'] = 1 << 19;
  values['adwIoDo[2]'] = 1 << 17;
  values['adwIoDoAllowed[1]'] = 0x80000000;
  values['adwIoDoOnAllowed[1]'] = 0;
  values['adwIoForcedDo[2]'] = 1 << 17;
  values['adwIoInhibitedDo[1]'] = 1 << 30;
  const data = decodeIoSnapshot(values, 1000);
  assert.equal(data.rawDi[31], true);
  assert.equal(data.rawDi[30], false);
  assert.equal(data.usedDi[83], true);
  assert.equal(data.forcedDi[83], true);
  assert.equal(data.outputs[49], true);
  assert.equal(data.allowedDo[31], true); assert.equal(data.allowedDoOn[31], false);
  assert.equal(data.forcedDo[49], true); assert.equal(data.inhibitedDo[30], true);
});

test('125 edges return exactly the newest 100 in FIFO order', () => {
  const data = decodeIoSnapshot(fifo(125), 10000);
  assert.equal(data.history.length, 100);
  assert.deepEqual(data.history.map((event) => event.sequence), Array.from({ length: 100 }, (_, i) => i + 26));
  assert.equal(data.history[0].timestampMs, 10000 - (135 - 26));
});

test('partial or malformed FIFO and unrelated signal IDs are rejected', () => {
  const values = fifo(1);
  assert.throws(() => parseIoEvent('1;10;1;85;1;0;1'));
  assert.throws(() => parseIoEvent('1;10;2;50;2;0;1'));
  assert.throws(() => parseIoEvent('1;10;1;79;1;false;true'));
  assert.throws(() => decodeIoSnapshot({ ...values, 'asIoJournal[1]': '2;1;1;79;2;0;1' }));
  assert.throws(() => decodeIoSnapshot({ ...values, 'adwIoRawDi[1]': -1 }));
  assert.throws(() => decodeIoSnapshot({ ...values, uiIoJournalHead: 2 }));
});

const pick = (values, paths) => Object.fromEntries(paths.map(path => [path, values[path]]));

test('a scan-changing revision does not trigger rereads of an empty or unchanged FIFO', async () => {
  const values = fifo(), calls = [];
  const read = async paths => { calls.push(paths); values.udiIoJournalRevision += 3; return pick(values, paths); };
  const first = await readStableIo(read);
  const second = await readStableIo(read, { previous: first });
  assert.equal(first.sequence, 0); assert.equal(second.sequence, 0);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(paths => !paths.some(path => path.startsWith('asIoJournal['))));
});

test('cached FIFO fetches only the new slot and keeps a complete ordered history', async () => {
  const previous = decodeIoSnapshot(fifo(5), 10000), values = fifo(6), calls = [];
  const result = await readStableIo(async paths => { calls.push(paths); return pick(values, paths); }, { previous });
  assert.deepEqual(calls[1], ['asIoJournal[6]']);
  assert.equal(calls.length, 3);
  assert.deepEqual(result.history.map(e => e.sequence), [1, 2, 3, 4, 5, 6]);
  calls.length = 0;
  await readStableIo(async paths => { calls.push(paths); return pick(values, paths); }, { previous: result });
  assert.equal(calls.length, 1);
});

test('new events during a read do not invalidate already complete immutable records', async () => {
  let reads = 0;
  const data = await readStableIo(async paths => pick(fifo(++reads === 1 ? 1 : 2), paths));
  assert.equal(data.sequence, 1);
  assert.deepEqual(data.history.map(e => e.sequence), [1]);
});

test('a boot change during reading retries without mixing journal epochs', async () => {
  let reads = 0;
  const data = await readStableIo(async paths => pick(fifo(2, ++reads === 1 ? 7 : 8), paths));
  assert.equal(data.epoch, 8); assert.equal(data.history.length, 2);
});

test('clock or sequence reset discards cached events even if the boot ID is unchanged', async () => {
  const previous = decodeIoSnapshot(fifo(5, 7, 1000)), values = fifo(2, 7, 10), calls = [];
  values['asIoJournal[1]'] = '1;1;2;1;3;0;1';
  const data = await readStableIo(async paths => { calls.push(paths); return pick(values, paths); }, { previous });
  assert.deepEqual(calls[1], ['asIoJournal[1]', 'asIoJournal[2]']);
  assert.equal(data.history[0].direction, 'DO');
});

test('overwritten records are rejected with bounded retries and cannot contaminate the cache', async () => {
  const previous = decodeIoSnapshot(fifo(5)), values = fifo(6);
  values['asIoJournal[6]'] = '106;6;1;79;2;0;1';
  let reads = 0;
  await assert.rejects(readStableIo(async paths => { reads++; return pick(values, paths); }, { previous }), /изменился/);
  assert.equal(reads, 6);
  assert.equal(previous.history.at(-1).sequence, 5);
});

test('a journal gap fetches the last 100 records and preserves explicit archive loss reporting', async () => {
  const previous = decodeIoSnapshot(fifo(5)), values = fifo(125), calls = [];
  const data = await readStableIo(async paths => { calls.push(paths); return pick(values, paths); }, { previous });
  assert.equal(calls[1].length, 100);
  assert.equal(data.history[0].sequence, 26);
  const events = [], ingest = new IoJournalIngestor({ record: e => { events.push(e); return true; } });
  ingest.consume(previous); ingest.consume(data);
  assert.equal(events.find(e => e.eventType === 'physical-io-gap').details.lost, 20);
});

test('SQLite cursor, reconnect, restart and a save interrupted after record do not duplicate edges', () => {
  const store = new CellEventStore();
  const make = () => new IoJournalIngestor({ readCursor: () => store.ioCursor(), writeCursor: (c) => store.saveIoCursor(c),
    record: (event) => store.hasEventCode(event.code) || store.record(event) });
  try {
    const data = decodeIoSnapshot(fifo(5), 10000);
    make().consume(data);
    assert.equal(store.status().events, 5);
    assert.equal(store.ioCursor().sequence, 5);
    make().consume({ ...data, observedAt: 10100, clockMs: data.clockMs + 100 });
    assert.equal(store.status().events, 5);
    const next = decodeIoSnapshot(fifo(6), 10001);
    store.record(ioArchiveEvent(next.history.at(-1), store.ioCursor()));
    make().consume(next);
    assert.equal(store.status().events, 6);
    assert.equal(store.ioCursor().sequence, 6);
    assert.equal(store.query({ eventTypes: ['physical-io'] }).count, 6);
    assert.equal(store.query({ eventTypes: ['physical-io'] }).events.length, 6);
  } finally { store.close(); }
});

test('overflow is an explicit gap and a new PLC boot is a separate session', () => {
  const events = [];
  const ingest = new IoJournalIngestor({ record: (event) => { events.push(event); return true; } });
  ingest.consume(decodeIoSnapshot(fifo(125), 10000));
  assert.equal(events.length, 101);
  assert.equal(events[0].eventType, 'physical-io-gap');
  assert.equal(events[0].details.lost, 25);
  ingest.consume(decodeIoSnapshot(fifo(125), 10000));
  assert.equal(events.length, 101);
  ingest.consume(decodeIoSnapshot(fifo(2, 8), 20000));
  assert.equal(events.length, 103);
  assert.equal(new Set(events.map((event) => event.code)).size, 103);
});

test('wall clock changes do not duplicate a running PLC journal; a reset clock creates a session', () => {
  const events = [];
  const ingest = new IoJournalIngestor({ record: (event) => { events.push(event); return true; } });
  ingest.consume(decodeIoSnapshot(fifo(2, 7, 1000), 10000));
  ingest.consume(decodeIoSnapshot(fifo(2, 7, 1001), 70000));
  assert.equal(events.length, 2);
  ingest.consume(decodeIoSnapshot(fifo(3, 7, 10), 71000));
  assert.equal(events.length, 5);
});

test('an unavailable archive leaves the cursor behind so buffered edges can be retried', () => {
  let available = false;
  const events = [];
  const ingest = new IoJournalIngestor({ record: (event) => { if (!available) return false; events.push(event); return true; } });
  ingest.consume(decodeIoSnapshot(fifo(3), 10000));
  assert.equal(ingest.cursor.sequence, 0);
  available = true;
  ingest.consume(decodeIoSnapshot(fifo(3), 10000));
  assert.equal(ingest.cursor.sequence, 3);
  assert.equal(events.length, 3);
});

function channelFixture({ result = 1, acknowledge = true, pending = false } = {}) {
  let time = 0;
  const fields = { udiIoOverrideCommandSeq: pending ? 2 : 1, udiIoOverrideAckSeq: 1, uiIoOverrideResult: 0, udiHmiCommandClockMs: 123 };
  const writes = [];
  const channel = new IoOverrideChannel({ read: async () => ({ ...fields }), now: () => time, pause: async (ms) => { time += ms; }, timeoutMs: 100,
    write: async (key, value) => {
      writes.push([key, value]); fields[key] = value;
      if (key === 'udiIoOverrideCommandSeq' && acknowledge) { fields.uiIoOverrideResult = result; fields.udiIoOverrideAckSeq = value; }
    } });
  return { channel, fields, writes };
}

test('payload and freshness precede Seq; only the matching Ack with applied Result succeeds', async () => {
  const { channel, writes } = channelFixture();
  assert.deepEqual(await channel.run({ action: 1, index: 79, value: true }), { sequence: 2, result: 1 });
  assert.deepEqual(writes, [['uiIoOverrideIndex', 79], ['uiIoOverrideAction', 1], ['xIoOverrideValue', true], ['udiIoOverrideIssuedAtMs', 123], ['udiIoOverrideCommandSeq', 2]]);
});

for (const [result, label] of [[2, 'запрещено'], [3, 'индекс'], [4, 'просроченную']]) test(`PLC rejection ${result} is reported after Ack`, async () => {
  await assert.rejects(channelFixture({ result }).channel.run({ action: 1, index: 80, value: false }), new RegExp(label));
});

test('an in-flight or timed-out request cannot have its payload overwritten', async () => {
  const a = channelFixture({ pending: true });
  await assert.rejects(a.channel.run({ action: 1, index: 79, value: true }));
  assert.deepEqual(a.writes, []);
  const b = channelFixture({ acknowledge: false });
  await assert.rejects(b.channel.run({ action: 1, index: 79, value: true }), /не подтвердил/);
  const count = b.writes.length;
  await assert.rejects(b.channel.run({ action: 1, index: 80, value: false }));
  assert.equal(b.writes.length, count);
});

test('invalid DI index/type never reaches the PLC; release-all is valid and audit describes each action', async () => {
  const { channel, writes } = channelFixture();
  await assert.rejects(channel.run({ action: 1, index: 85, value: true }));
  await assert.rejects(channel.run({ action: 1, index: 79, value: 1 }));
  assert.equal(writes.length, 0);
  await channel.run({ action: 3 });
  assert.match(describeOperatorCommand({ command: 'io.override', index: 79, value: true }).label, /79: 1/);
  assert.match(describeOperatorCommand({ command: 'io.releaseAll' }).label, /Снять все/);
});

test('DO commands validate their own index range and write payload before Seq; release commands remain available', async () => {
  const { channel, writes } = channelFixture();
  await assert.rejects(channel.run({ action: 4, index: 51, value: true }));
  for (const index of [37, 38, 39]) for (const action of [4, 5]) {
    await assert.rejects(channel.run({ action, index, value: true }));
    assert.throws(() => parseIoEvent(`1;50;2;${index};3;0;1`));
  }
  await assert.rejects(channel.run({ action: 4, index: 1, value: '1' }));
  assert.equal(writes.length, 0);
  assert.deepEqual(await channel.run({ action: 4, index: 41, value: true }), { sequence: 2, result: 1 });
  assert.deepEqual(writes.slice(0, 5), [['uiIoOverrideIndex', 41], ['uiIoOverrideAction', 4], ['xIoOverrideValue', true], ['udiIoOverrideIssuedAtMs', 123], ['udiIoOverrideCommandSeq', 2]]);
  for (const action of [5, 6, 7]) await channel.run({ action, index: action === 5 ? 41 : 0 });
  assert.match(describeOperatorCommand({ command: 'io.output', index: 41, value: true }).label, /41: 1/);
});

test('emergency channel stops while the ordinary I/O channel is awaiting Ack and has a separate reset result', async () => {
  const { channel: ordinary } = channelFixture({ pending: true });
  let result = 1;
  const fields = { udiIoEmergencyCommandSeq: 4, udiIoEmergencyAckSeq: 4, uiIoEmergencyResult: 0, udiHmiCommandClockMs: 900 };
  const writes = [];
  const emergency = new IoOverrideChannel({ emergency: true, read: async () => ({ ...fields }), write: async (name, value) => {
    writes.push([name, value]); fields[name] = value;
    if (name === 'udiIoEmergencyCommandSeq') { fields.udiIoEmergencyAckSeq = value; fields.uiIoEmergencyResult = result; }
  } });
  await assert.rejects(ordinary.run({ action: 4, index: 41, value: true }));
  assert.deepEqual(await emergency.run({ action: 1 }), { sequence: 5, result: 1 });
  assert.deepEqual(writes, [['uiIoEmergencyAction', 1], ['udiIoEmergencyIssuedAtMs', 900], ['udiIoEmergencyCommandSeq', 5]]);
  result = 2; await assert.rejects(emergency.run({ action: 2 }), /снятие экстренного останова/);
  result = 1; assert.deepEqual(await emergency.run({ action: 2 }), { sequence: 7, result: 1 });
});

test('manual session begin/end use actions 8/9, fresh Seq-last payloads and explicit operator audit', async () => {
  const { channel, writes } = channelFixture();
  for (const [action, sequence] of [[8, 2], [9, 3]]) {
    assert.deepEqual(await channel.run({ action }), { sequence, result: 1 });
    assert.deepEqual(writes.slice(-5), [['uiIoOverrideIndex', 0], ['uiIoOverrideAction', action], ['xIoOverrideValue', false],
      ['udiIoOverrideIssuedAtMs', 123], ['udiIoOverrideCommandSeq', sequence]]);
  }
  assert.match(describeOperatorCommand({ command: 'io.manual.begin' }).label, /Включить прямое ручное/);
  assert.match(describeOperatorCommand({ command: 'io.manual.end' }).label, /Вернуть.*программе/);
  await assert.rejects(channel.run({ action: 10 }), /Недопустимая/);
});

test('new DO operation kinds are archived with their distinct causes and cannot masquerade as DI', () => {
  for (const [kind, cause] of [[7, 'Ручная команда DO'], [8, 'возвращён оператором'], [9, 'возвращён программе']]) {
    const edge = parseIoEvent(`1;50;2;41;${kind};1;0`);
    const event = ioArchiveEvent(edge, { epoch: 1, bootTimeMs: 1000 });
    assert.ok(event.message.includes(cause)); assert.equal(event.details.kind, kind);
    assert.throws(() => parseIoEvent(`1;50;1;41;${kind};1;0`));
  }
});
