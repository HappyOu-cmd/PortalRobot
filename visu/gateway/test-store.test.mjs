import assert from 'node:assert/strict';
import test from 'node:test';
import { TestStore, normalizeScenarioState } from './test-store.mjs';

const initialState = () => ({ typeCount: 1, machines: [{state: 1, productType: 1}, {state: 0, productType: 1}, {state: 0, productType: 1}], slots: Array.from({ length: 120 }, () => ({ content: 0, productType: 1 })), grippers: [{content: 0, productType: 0}, {content: 0, productType: 0}], orientation: 0 });

test('migrates legacy one-magazine scenarios to schema v3', () => {
  const state = normalizeScenarioState({ ...initialState(), magazineEnabled: true, faultMasks: { magazine: 3 } });
  assert.equal(state.magazines.length, 2);
  assert.equal(state.magazineMode, 0);
  assert.equal(state.magazines[0].enabled, true);
  assert.equal(state.magazines[1].enabled, false);
  assert.deepEqual(state.faultMasks.magazines, [3, 0]);
});

test('rejects incomplete twin pallet state and unknown schemas', () => {
  assert.throws(() => normalizeScenarioState({ ...initialState(), magazineMode: 1 }), /два магазина/);
  const store = new TestStore();
  assert.throws(() => store.saveScenario({ name: 'Twin', schemaVersion: 4, initialState: initialState() }), /Неподдерживаемая версия/);
  store.close();
});

test('keeps two magazines and rejects divergent shared slot types', () => {
  const legacy = normalizeScenarioState({ ...initialState(), magazineEnabled: true });
  legacy.magazines[1].enabled = true;
  legacy.magazines[1].slots[0].content = 2;
  assert.equal(normalizeScenarioState(legacy).magazines[1].slots[0].content, 2);
  legacy.magazines[1].slots[0].productType = 2;
  assert.throws(() => normalizeScenarioState(legacy), /Тип слота 1/);
});

test('scenario CRUD and compact run results', () => {
  const store = new TestStore();
  const saved = store.saveScenario({ name: 'Smoke', initialState: initialState(), expectations: {} });
  assert.equal(saved.schemaVersion, 3);
  assert.equal(saved.initialState.magazines.length, 2);
  assert.equal(store.listScenarios().length, 1);
  assert.equal(store.saveScenario({ ...saved, name: 'Smoke edited' }, saved.id).name, 'Smoke edited');
  const run = store.createRun({ suite: 'smoke', environment: 'simulation', robotInterface: 'softmotion', count: 10 });
  store.progress(run.id, { caseCount: 1 });
  store.addCase(run.id, { caseIndex: 1, name: 'case', status: 'PASS', durationMs: 12 });
  assert.equal(store.finishRun(run.id).status, 'PASS');
  assert.equal(store.getRun(run.id).cases.length, 1);
  const failed = store.createRun({ suite: 'generated', environment: 'simulation', robotInterface: 'softmotion', count: 1 });
  store.addCase(failed.id, { caseIndex: 1, name: 'bad case', status: 'FAIL', reason: 'inventory mismatch' });
  store.finishRun(failed.id);
  assert.equal(store.listRuns()[0].lastFailure, 'inventory mismatch');
  assert.equal(store.deleteScenario(saved.id), true);
  store.close();
});

test('run history keeps the newest creation first when start timestamps are equal', () => {
  const store = new TestStore();
  try {
    const config = { suite: 'smoke', environment: 'simulation', robotInterface: 'softmotion' };
    const first = store.createRun(config);
    const second = store.createRun(config);
    const older = store.createRun(config);
    // Controlled timestamps in this in-memory fixture reproduce the same-ms race.
    store.db.prepare('UPDATE test_run SET started_at=2000 WHERE id IN (?, ?)').run(first.id, second.id);
    store.db.prepare('UPDATE test_run SET started_at=1000 WHERE id=?').run(older.id);
    store.addCase(second.id, { caseIndex: 1, name: 'failed', status: 'FAIL', reason: 'inventory mismatch' });
    store.finishRun(second.id);
    assert.deepEqual(store.listRuns().map(run => run.id), [second.id, first.id, older.id]);
    assert.equal(store.listRuns()[0].lastFailure, 'inventory mismatch');
    assert.deepEqual(store.listRuns(2).map(run => run.id), [second.id, first.id]);
  } finally { store.close(); }
});

test('marks an unfinished run as interrupted after gateway restart', () => {
  const store = new TestStore();
  const run = store.createRun({ suite: 'smoke', environment: 'simulation', robotInterface: 'softmotion' });
  store.progress(run.id, { status: 'RUNNING', stage: 'connected', caseIndex: 0, caseCount: 10 });

  assert.equal(store.recoverInterruptedRuns(), 1);
  const recovered = store.getRun(run.id);
  assert.equal(recovered.status, 'ERROR');
  assert.equal(recovered.stage, 'finished');
  assert.match(recovered.error, /перезапущен/);
  assert.ok(recovered.finishedAt);
  store.close();
});
