import assert from 'node:assert/strict';
import test from 'node:test';
import { TestStore, normalizeScenarioState } from './test-store.mjs';

const initialState = () => ({ typeCount: 1, machines: [], slots: Array.from({ length: 120 }, () => ({ content: 0, productType: 1 })), grippers: [], orientation: 0 });

test('migrates legacy one-magazine scenarios to schema v2', () => {
  const state = normalizeScenarioState({ ...initialState(), magazineEnabled: true, faultMasks: { magazine: 3 } });
  assert.equal(state.magazines.length, 2);
  assert.equal(state.magazines[0].enabled, true);
  assert.equal(state.magazines[1].enabled, false);
  assert.deepEqual(state.faultMasks.magazines, [3, 0]);
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
  assert.equal(saved.schemaVersion, 2);
  assert.equal(saved.initialState.magazines.length, 2);
  assert.equal(store.listScenarios().length, 1);
  assert.equal(store.saveScenario({ ...saved, name: 'Smoke edited' }, saved.id).name, 'Smoke edited');
  const run = store.createRun({ suite: 'smoke', environment: 'simulation', robotInterface: 'softmotion', count: 10 });
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
