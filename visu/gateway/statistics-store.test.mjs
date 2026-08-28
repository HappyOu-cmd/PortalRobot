import assert from 'node:assert/strict';
import test from 'node:test';
import { StatisticsStore, StatisticsStoreError } from './statistics-store.mjs';

const operator = { id: 7, username: 'ivanov', displayName: 'Иванов', role: 'operator' };
const states = (busy = false) => ({
  robot: { category: busy ? 'robot-active' : 'robot-idle' },
  'machine-1': { category: busy ? 'machine-processing' : 'machine-idle' },
  'machine-2': { category: 'machine-idle' },
  'machine-3': { category: 'machine-idle' },
});

test('aggregates repeated operator intervals and equipment load', () => {
  let now = 1_000_000;
  const store = new StatisticsStore({ now: () => now });
  store.openOperator(operator, now);
  store.recordEquipment(states(true), now);
  for (let index = 0; index < 6; index += 1) { now += 5_000; store.recordEquipment(states(true), now); }
  store.recordEquipment(states(false), now);
  for (let index = 0; index < 6; index += 1) { now += 5_000; store.recordEquipment(states(false), now); }
  store.closeActiveOperator(now, operator.id);
  now += 60_000;
  store.openOperator(operator, now);
  store.recordEquipment(states(true), now);
  for (let index = 0; index < 12; index += 1) { now += 5_000; store.recordEquipment(states(true), now); }
  store.closeActiveOperator(now, operator.id);

  const summary = store.summary({ fromMs: 1_000_000, toMs: now, userId: operator.id });
  assert.equal(summary.responsibilityMs, 120_000);
  assert.equal(summary.equipment.find((item) => item.lane === 'machine-1').loadPercent, 75);
  assert.equal(summary.experience.xp, 2);
  store.close();
});

test('keeps unassigned time separate', () => {
  let now = 10_000;
  const store = new StatisticsStore({ now: () => now });
  now += 10_000;
  store.openOperator(operator, now);
  now += 20_000;
  store.closeActiveOperator(now);
  now += 10_000;
  const summary = store.summary({ fromMs: 10_000, toMs: now });
  assert.equal(summary.unassignedMs, 20_000);
  store.close();
});

test('rejects overlapping shift templates and versions updates', () => {
  let now = Date.UTC(2026, 0, 1);
  const store = new StatisticsStore({ now: () => now });
  const first = store.createTemplate({ name: 'День', days: [1, 2, 3, 4, 5], startMinute: 480, endMinute: 1200 });
  assert.throws(() => store.createTemplate({ name: 'Пересечение', days: [1], startMinute: 1100, endMinute: 1300 }),
    (error) => error instanceof StatisticsStoreError && error.code === 'SHIFT_OVERLAP');
  now += 1000;
  const updated = store.updateTemplate(first.id, { startMinute: 420 });
  assert.equal(updated.groupId, first.groupId);
  assert.equal(store.templates().length, 1);
  store.close();
});

test('hard deletion removes selected facts and splits intervals', () => {
  let now = 100_000;
  const store = new StatisticsStore({ now: () => now });
  store.openOperator(operator, now);
  now = 200_000;
  store.closeActiveOperator(now);
  const interval = store.intervals({ fromMs: 0, toMs: now })[0];
  const result = store.hardDeleteRange({ fromMs: 130_000, toMs: 160_000, userId: operator.id, equipment: false, facts: false });
  assert.equal(result.intervals, 1);
  const intervals = store.intervals({ fromMs: 0, toMs: now, userId: operator.id });
  assert.deepEqual(intervals.map((item) => [item.startMs, item.endMs]), [[interval.startMs, 130_000], [160_000, 200_000]]);
  store.close();
});

test('records produced parts from a persistent PLC counter and groups alarm details', () => {
  let now = 500_000;
  const store = new StatisticsStore({ now: () => now });
  store.openOperator(operator, now);
  assert.equal(store.consumeProductionCounter(1, 40, now), 0);
  now += 1_000;
  const quantity = store.consumeProductionCounter(1, 43, now);
  assert.equal(quantity, 3);
  store.recordFact({
    id: 10, timestampMs: now, sourceId: 4, eventType: 'production', status: 'completed',
    message: 'Учтено три детали', code: 'magazine:1', details: { quantity },
  });
  now += 1_000;
  store.recordFact({
    id: 11, timestampMs: now, sourceId: 7, eventType: 'alarm', status: 'active',
    message: 'Авария: Станок 1, код 7', code: '2:7',
  });
  now += 1;
  const summary = store.summary({ fromMs: 500_000, toMs: now, userId: operator.id, shiftPlan: 100 });
  assert.equal(summary.producedParts, 3);
  assert.equal(summary.shiftPlan, 100);
  assert.deepEqual(summary.alarmBreakdown, [{ code: '2:7', message: 'Авария: Станок 1, код 7', count: 1 }]);
  store.close();
});

test('reattributes equipment and context facts after an interval edit', () => {
  let now = 1_000_000;
  const secondOperator = { id: 8, username: 'petrov', displayName: 'Петров', role: 'operator' };
  const store = new StatisticsStore({ now: () => now });
  store.openOperator(operator, now);
  store.recordEquipment(states(true), now);
  now += 5_000;
  store.recordEquipment(states(true), now);
  store.recordFact({ id: 21, timestampMs: now, sourceId: 7, eventType: 'alarm', status: 'active', message: 'Авария', code: '1:1' });
  now += 5_000;
  store.recordEquipment(states(true), now);
  store.closeActiveOperator(now);
  const interval = store.intervals({ fromMs: 0, toMs: now })[0];
  store.updateInterval(interval.id, { userId: secondOperator.id, username: secondOperator.username,
    displayName: secondOperator.displayName, startMs: interval.startMs, endMs: interval.endMs });
  const oldSummary = store.summary({ fromMs: interval.startMs, toMs: interval.endMs, userId: operator.id });
  const newSummary = store.summary({ fromMs: interval.startMs, toMs: interval.endMs, userId: secondOperator.id });
  assert.equal(oldSummary.alarmsActivated, 0);
  assert.equal(newSummary.alarmsActivated, 1);
  assert.equal(oldSummary.equipment.find((item) => item.lane === 'robot').observedMs, 0);
  assert.equal(newSummary.equipment.find((item) => item.lane === 'robot').observedMs, 10_000);
  store.close();
});
