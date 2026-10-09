import assert from 'node:assert/strict';
import test from 'node:test';
import { AcknowledgedCommand } from './acknowledged-command.mjs';
import { executeGeometryCommand, geometryCallFields, geometrySymbols, GeometryControlStore, readGeometryEvents } from './geometry-control.mjs';
import { CellEventStore, describeOperatorCommand, ensureGeometryEventSource } from './cell-events.mjs';
import { DatabaseSync } from 'node:sqlite';
import { StatisticsStore } from './statistics-store.mjs';
import { readFileSync } from 'node:fs';

const call = (patch = {}) => ({ udiId: 11, uiMachine: 2, uiProductType: 3, uiStation: 1, xForced: true, uiState: 4, uiReason: 0, uiMagazine: 0, uiPallet: 0, uiSlot: 0, ...patch });

test('actual production recorder uses fixed normal/simulation counters despite partial environment updates', () => {
  const source = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('function recordProductionSnapshot('), source.indexOf('function recordSystemEvent('));
  const statistics = new StatisticsStore({ databasePath: ':memory:' });
  const values = { 'audiGeometryProducedNormal[1]': 200, 'audiGeometryProducedNormal[2]': 50, 'audiGeometryProducedSimulation[1]': 2, 'audiGeometryProducedSimulation[2]': 0,
    uiTestEnvironmentApplied: 0, 'astGeometryStatus[1].udiProducedPartsTotal': 200 };
  const events = [], run = Function('latestValues', 'statisticsStore', 'recordCellEvent', `${body}; return recordProductionSnapshot;`)(values, statistics, e => { events.push(e); return true; });
  try {
    run(100); assert.equal(events.length, 0);
    values.uiTestEnvironmentApplied = 1; run(101);
    values['astGeometryStatus[1].udiProducedPartsTotal'] = 2; run(102); assert.equal(events.length, 0);
    values['audiGeometryProducedSimulation[1]'] = 3; run(103);
    assert.equal(events.length, 1); assert.equal(events[0].details.quantity, 1); assert.equal(events[0].details.environment, 1);
    values.uiTestEnvironmentApplied = 0; values['astGeometryStatus[1].udiProducedPartsTotal'] = 200; run(104);
    values['audiGeometryProducedNormal[1]'] = 201; run(105);
    assert.equal(events.length, 2); assert.equal(events[1].details.quantity, 1); assert.equal(events[1].details.environment, 0);
  } finally { statistics.close(); }
});
function channelFixture(result = 1) {
  const plc = { udiGeometryCommandSeq: 0, udiGeometryAckSeq: 0, uiGeometryResult: 0, udiHmiCommandClockMs: 100,
    'audiGeometryStopSeq[1]': 0, 'audiGeometryStopAck[1]': 0, 'audiGeometryStopSeq[2]': 0, 'audiGeometryStopAck[2]': 0 };
  const writes = []; let time = 0;
  const write = async (path, value) => { plc[path] = value; writes.push([path, value]); };
  const channel = new AcknowledgedCommand({ read: async () => ({ ...plc }), write, now: () => time,
    pause: async () => { time += 40; plc.uiGeometryResult = result; plc.udiGeometryAckSeq = plc.udiGeometryCommandSeq; for (let i = 1; i <= 2; i++) plc[`audiGeometryStopAck[${i}]`] = plc[`audiGeometryStopSeq[${i}]`]; } });
  return { plc, writes, channel, write: (path, _type, value) => write(path, value), types: { UInt16: 1, UInt32: 2, Double: 3 } };
}
test('forced call has only machine source, payload precedes clock/commit and ACK is required', async () => {
  const f = channelFixture(); await executeGeometryCommand({ action: 8, machine: 3 }, f);
  assert.equal(f.plc['stGeometryRequest.uiStation'], 0); assert.equal(f.plc['stGeometryRequest.uiMachine'], 3);
  assert.deepEqual(f.writes.slice(-2), [['udiGeometryIssuedAtMs', 100], ['udiGeometryCommandSeq', 1]]);
  assert.equal(f.plc.udiGeometryAckSeq, 1);
});
test('STOP uses an independent station counter even when the shared channel is unacknowledged', async () => {
  const f = channelFixture(); f.plc.udiGeometryCommandSeq = 100;
  await executeGeometryCommand({ action: 6, magazine: 2 }, f);
  assert.deepEqual(f.writes, [['audiGeometryStopSeq[2]', 1]]);
});
test('PLC rejection and expiration are errors; invalid configuration and machine cause no writes', async () => {
  for (const result of [2, 4]) await assert.rejects(executeGeometryCommand({ action: 8, machine: 1 }, channelFixture(result)), /отклонил|устарела/);
  for (const message of [{ action: 8, machine: 4 }, { action: 10, value: 0 }, ...[0, -10001].map(lrSafeZ => ({ action: 11, magazine: 1, geometryConfig: { lrX: 0, lrY: 0, lrZ: 0, lrSafeZ, lrChangeZ: -100, lrSpeedFactor: .2 } }))]) {
    const f = channelFixture(); await assert.rejects(executeGeometryCommand(message, f)); assert.deepEqual(f.writes, []);
  }
  assert.equal(new Set(geometrySymbols).size, geometrySymbols.length);
});

test('GK configuration uses SAFE_Z independently of legacy CHANGE and preserves payload before ACK', async () => {
  for (const magazine of [1, 2]) for (const lrSafeZ of [-50, -10000]) for (const lrChangeZ of [-150, 0, undefined]) {
    const geometryConfig = { lrX: 100, lrY: 200, lrZ: 500, lrSafeZ, lrChangeZ, lrSpeedFactor: .1 };
    const original = { ...geometryConfig }, f = channelFixture();
    await executeGeometryCommand({ action: 11, magazine, geometryConfig }, f);
    assert.equal(f.plc['stGeometryRequest.Config.lrSafeZ'], lrSafeZ);
    assert.equal(f.plc['stGeometryRequest.Config.lrChangeZ'], lrSafeZ);
    assert.equal(f.plc['stGeometryRequest.Config.lrSpeedFactor'], .1);
    assert.equal(f.plc.udiGeometryAckSeq, 1);
    assert.deepEqual(f.writes.slice(-2), [['udiGeometryIssuedAtMs', 100], ['udiGeometryCommandSeq', 1]]);
    assert.deepEqual(geometryConfig, original);
  }
});
function fifo(sequence, sequences = [sequence]) {
  const values = { udiGeometryEventSequence: sequence, udiHmiCommandClockMs: 200 };
  for (const seq of sequences) {
    const root = `astGeometryEvents[${((seq - 1) % 100) + 1}]`;
    Object.assign(values, { [`${root}.udiSequence`]: seq, [`${root}.udiTimeMs`]: 100, [`${root}.uiEnvironment`]: 0 });
    for (const field of geometryCallFields) values[`${root}.Call.${field}`] = call()[field];
  }
  return values;
}
test('FIFO reads stable revision, skips stale slots, detects restart, and reports overwritten events', async () => {
  const values = fifo(105, Array.from({ length: 100 }, (_, i) => i + 6));
  const snapshot = await readGeometryEvents(async () => values, { sequence: 1 }); assert.equal(snapshot.events.length, 100); assert.equal(snapshot.missing, 4);
  const restart = await readGeometryEvents(async () => fifo(1), { sequence: 105 }); assert.equal(restart.reset, true); assert.equal(restart.events.length, 1);
  let reads = 0;
  await assert.rejects(readGeometryEvents(async () => { reads++; return { ...values, udiGeometryEventSequence: reads > 2 ? 106 : 105 }; }, { sequence: 104 }), /изменился/);
  const stale = fifo(2); stale['astGeometryEvents[2].udiSequence'] = 1;
  const missed = await readGeometryEvents(async () => stale, { sequence: 1 }); assert.equal(missed.events.length, 0); assert.equal(missed.missing, 1);
  const wrap = await readGeometryEvents(async () => fifo(1), { sequence: 0xffffffff }); assert.equal(wrap.reset, false); assert.equal(wrap.missing, 0);
});
test('SQLite deduplicates PLC events, filters GK1/GK2, keeps actors/revisions and refuses a stale quality edit', () => {
  const s = new GeometryControlStore({ databasePath: ':memory:', now: () => 10000 });
  const first = { sequence: 1, clockMs: 200, reset: false, events: [{ sequence: 1, timeMs: 100, environment: 0, call: call() }] };
  assert.equal(s.ingest(first).length, 1); assert.equal(s.ingest(first).length, 0);
  const row = s.query({ station: 1, history: true })[0]; assert.equal(row.machine, 2); assert.equal(row.productType, 3); assert.equal(row.createdAt, 9900); assert.equal(s.query({ station: 2 }).length, 0);
  s.setResult(row.key, 'defect', 0, { id: 1, username: 'operator', displayName: 'Оператор 1' });
  assert.throws(() => s.setResult(row.key, 'good', 0, { id: 2, username: 'other' }), /другим/);
  s.ingest({ ...first, sequence: 2, events: [{ ...first.events[0], sequence: 2, call: call({ uiState: 8 }) }] });
  assert.equal(s.query({ history: true })[0].result, 'defect'); assert.equal(s.query()[0].results[0].actorName, 'Оператор 1');
  s.ingest({ ...first, sequence: 1, reset: true }); assert.equal(s.query().length, 2); assert.equal(s.cursor().epoch, 1);
  s.close();
});
test('bypass archive and cell event preserve actual machine/type/magazine/pallet/slot', () => {
  const s = new GeometryControlStore({ databasePath: ':memory:' });
  const [event] = s.ingest({ sequence: 1, clockMs: 200, reset: false, events: [{ sequence: 1, timeMs: 100, environment: 1, call: call({ uiState: 5, uiStation: 0, uiReason: 1, uiMagazine: 2, uiPallet: 1, uiSlot: 96 }) }] });
  assert.match(event.message, /типа 3 со станка 2/); assert.match(event.message, /магазин 2, палета 1, слот 96/);
  assert.equal(s.query({ history: true })[0].slot, 96);
  const log = new CellEventStore({ databasePath: ':memory:' }); log.record(event); assert.equal(log.query({ sourceIds: [9] }).events.length, 1); log.close(); s.close();
  assert.match(describeOperatorCommand({ command: 'geometry.command', action: 8, machine: 3 }).label, /станок 3/);
});

test('legacy cell-event CHECK expands transactionally and preserves rows, IDs and indexes', () => {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE cell_event(id INTEGER PRIMARY KEY, source_id INTEGER NOT NULL CHECK (source_id BETWEEN 1 AND 8), message TEXT) STRICT; CREATE INDEX legacy_source ON cell_event(source_id); INSERT INTO cell_event VALUES(99,8,'old event');");
  ensureGeometryEventSource(db); ensureGeometryEventSource(db);
  db.exec("INSERT INTO cell_event VALUES(100,9,'GK event')"); assert.equal(db.prepare('SELECT message FROM cell_event WHERE id=99').get().message, 'old event');
  assert.ok(db.prepare("SELECT name FROM sqlite_schema WHERE name='legacy_source'").get()); db.close();
});
test('quality is unavailable for a queued request and independent real/simulation counters do not duplicate production', () => {
  const s = new GeometryControlStore({ databasePath: ':memory:' });
  s.ingest({ sequence: 1, clockMs: 100, reset: false, events: [{ sequence: 1, timeMs: 100, environment: 0, call: call({ uiState: 1, uiStation: 0 }) }] });
  assert.throws(() => s.setResult(s.query()[0].key, 'good', 0, { id: 1, username: 'op' }), /ещё не уложена/); s.close();
  const stats = new StatisticsStore({ databasePath: ':memory:' });
  assert.equal(stats.consumeProductionCounter(3, 10), 0); assert.equal(stats.consumeProductionCounter(5, 0), 0);
  assert.equal(stats.consumeProductionCounter(3, 11), 1); assert.equal(stats.consumeProductionCounter(5, 1), 1); assert.equal(stats.consumeProductionCounter(3, 11), 0); stats.close();
});
