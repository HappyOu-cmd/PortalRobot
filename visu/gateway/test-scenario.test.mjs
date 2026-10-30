import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { freshScenario } from '../src/components/tests/testWorkbenchState.ts';
import { normalizeScenarioState, scenarioWrites, writeScenarioBuffer } from './test-scenario.mjs';
import { validateTestRun } from './test-contract.mjs';
import { TestStore } from './test-store.mjs';

test('v3 preserves all four inventories and never counts a projection as the operator pallet', () => {
  const s = freshScenario(1).initialState;
  s.magazines[0].operatorSlots[95].content = 2;
  s.magazines[1].slots[95].content = 1;
  s.magazines[1].operatorSlots[0].content = 2;
  const normalized = normalizeScenarioState(s);
  assert.equal(normalized.magazines[0].operatorSlots[95].content, 2);
  assert.equal(normalized.magazines[1].slots[95].content, 1);
  assert.equal(normalized.magazines[1].operatorSlots[0].content, 2);
  assert.notEqual(normalized.magazines[0].operatorSlots, normalized.magazines[0].slots);
  assert.deepEqual(normalizeScenarioState(normalized), normalized);
  assert.equal(scenarioWrites(s).find(x => x.path === 'stTestScenario.aauiOperatorSlotContent[1,96]').value, 2);
  for (const m of [1, 2]) for (let slot = 97; slot <= 120; slot++) {
    for (const field of ['aauiSlotContent', 'aauiOperatorSlotContent']) {
      assert.equal(scenarioWrites(s).find(x => x.path === `stTestScenario.${field}[${m},${slot}]`).value, 0);
    }
  }
});

test('v3 rejects lost operator inventories, dimensions, divergent types and non-integer writes', () => {
  const bad = change => { const s = freshScenario(1).initialState; change(s); return () => normalizeScenarioState(s); };
  assert.throws(bad(s => delete s.magazines[1].operatorSlots), /96 слотов/);
  assert.throws(bad(s => s.magazines[0].slots.push({ content: 0, productType: 1 })), /96 слотов/);
  assert.throws(bad(s => { s.magazines[1].operatorSlots[10].productType = 2; }), /Тип слота 11/);
  assert.throws(bad(s => { s.grippers[0].content = 1.5; }), /Некорректное поле/);
  assert.throws(bad(s => { s.faultMasks.robot = -1; }), /Некорректное поле/);
});

test('buffer commit is last; write failures and invalid shape cannot publish an Apply marker', async () => {
  const state = freshScenario(1).initialState;
  const calls = [];
  const expected = scenarioWrites(state);
  await writeScenarioBuffer(state, { previousSequence: 0xffffffff,
    write: async value => { calls.push(value); }, commit: async seq => { calls.push({ commit: seq }); } });
  assert.deepEqual(calls.slice(0, -1), expected);
  assert.deepEqual(calls.at(-1), { commit: 1 });
  let committed = false, writes = 0;
  await assert.rejects(writeScenarioBuffer(state, { write: async () => { if (++writes === 50) throw new Error('write failure'); }, commit: async () => { committed = true; } }), /write failure/);
  assert.equal(committed, false);
  writes = 0;
  await assert.rejects(writeScenarioBuffer({ ...state, magazines: [] }, { write: async () => { writes++; }, commit: async () => { committed = true; } }));
  assert.equal(writes, 0);
  assert.equal(committed, false);
});

const config = { suite: 'smoke', magazineMode: 1, environment: 'simulation', robotInterface: 'softmotion', speedProfile: 'realtime', seed: 1, count: 10 };
const ready = () => ({ uiMagazineMode: 1, uiTestEnvironmentApplied: 1, 'stTestObservability.uiSchemaVersion': 3,
  'astTwinStatus[1].xConfirmed': true, 'astTwinStatus[2].xConfirmed': true,
  'astTwinStatus[1].uiRobotPallet': 1, 'astTwinStatus[2].uiRobotPallet': 2 });

test('preflight refuses incompatible PLCs and environments before creating a run', () => {
  assert.doesNotThrow(() => validateTestRun(config, ready()));
  for (const patch of [
    { uiMagazineMode: null }, { 'stTestObservability.uiSchemaVersion': 2 }, { uiTestEnvironmentApplied: 0 },
    { 'astTwinStatus[2].xConfirmed': false }, { 'astTwinStatus[1].uiRobotPallet': 0 },
  ]) assert.throws(() => validateTestRun(config, { ...ready(), ...patch }));
  assert.throws(() => validateTestRun({ ...config, robotInterface: 'python-modbus' }, ready()), /SoftMotion/);
  assert.throws(() => validateTestRun({ ...config, suite: 'general' }, ready()), /статичные/);
  assert.throws(() => validateTestRun({ ...config, count: 1001 }, ready()), /count/);
  assert.throws(() => validateTestRun(config, ready(), [freshScenario(0)]), /не совпадает/);
  const savedGeneral = freshScenario(0); savedGeneral.expectations.testKind = 'general-four-batches';
  assert.throws(() => validateTestRun({ ...config, magazineMode: 0, environment: 'sc500_bench', robotInterface: 'sc500-modbus' }, { ...ready(), uiMagazineMode: 0 }, [savedGeneral]), /статичные магазины и симуляцию/);
});

test('saved v3 scenarios, successful evidence and failed evidence round-trip in SQLite', () => {
  const store = new TestStore();
  try {
    const scenario = store.saveScenario(freshScenario(1));
    assert.equal(scenario.schemaVersion, 3);
    assert.equal(scenario.initialState.magazines[1].operatorSlots.length, 96);
    const run = store.createRun(config);
    const diagnostics = { expectations: { expectedMagazine: 2 }, checks: [{ label: 'Магазин', expected: 2, actual: 2, passed: true }], observed: { 'udiTestScenarioAckSeq': 42 } };
    store.addCase(run.id, { caseIndex: 1, status: 'PASS', diagnostics, scenario });
    store.addCase(run.id, { caseIndex: 2, status: 'FAIL', diagnostics: { ...diagnostics, checks: [{ label: 'Магазин', expected: 2, actual: 1, passed: false }] }, scenario });
    const stored = store.getRun(run.id);
    assert.deepEqual(stored.cases[0].diagnostics, diagnostics);
    assert.equal(stored.cases[1].diagnostics.checks[0].passed, false);
    store.finishRun(run.id);
    store.requestAbort(run.id);
    assert.equal(store.getRun(run.id).status, 'FAIL');
  } finally { store.close(); }
});

test('an empty or incomplete run never becomes PASS and an aborted result stays terminal', () => {
  const store = new TestStore();
  try {
    const empty = store.createRun(config);
    assert.equal(store.finishRun(empty.id).status, 'ERROR');
    const partial = store.createRun(config);
    store.progress(partial.id, { caseCount: 2 });
    store.addCase(partial.id, { caseIndex: 1, status: 'PASS' });
    assert.equal(store.finishRun(partial.id).status, 'ERROR');
    const stopped = store.createRun(config);
    store.finishRun(stopped.id, 'ABORTED');
    assert.equal(store.requestAbort(stopped.id).status, 'ABORTED');
  } finally { store.close(); }
});

test('Python catalog crosses the gateway UTF-8 boundary with current names and counts', () => {
  const directory = fileURLToPath(new URL('../../robot_simulator/', import.meta.url));
  const bundled = fileURLToPath(new URL(process.platform === 'win32'
    ? '../../robot_simulator/.venv/Scripts/python.exe' : '../../robot_simulator/.venv/bin/python', import.meta.url));
  const result = spawnSync(process.env.TEST_RUNNER_PYTHON || (existsSync(bundled) ? bundled : 'python'), ['-m', 'robot_simulator.test_catalog'], {
    cwd: directory, windowsHide: true, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(result.status, 0, result.stderr);
  const entries = JSON.parse(result.stdout);
  assert.equal(entries.smoke[0].name, 'Загрузить пустой станок');
  assert.equal(entries.geometry.length, 8);
  assert.equal(entries.magazines.length, 8);
  assert.ok(entries.geometry.every(c => c.name.includes('ГК')));
});
