import assert from 'node:assert/strict';
import test from 'node:test';
import { requireTestMagazineMode, resolveTestSelection, validateTestRun } from './test-contract.mjs';

const saved = {
  id: 7, name: 'Сохранённый', description: 'Проверка', schemaVersion: 2,
  initialState: { magazineMode: 0 }, expectations: {},
};
const lookup = (id) => id === 7 ? saved : null;

test('suite accepts known magazine modes and refuses mismatches before PLC writes', () => {
  assert.doesNotThrow(() => requireTestMagazineMode(0));
  assert.doesNotThrow(() => requireTestMagazineMode(1, 1));
  assert.throws(() => requireTestMagazineMode(1, 0), /не совпадает/);
  assert.throws(() => requireTestMagazineMode(undefined), /неизвестен/);
});

test('saved scenario selection rejects missing, repeated and incompatible records', () => {
  assert.deepEqual(resolveTestSelection({ suite: 'smoke', scenarioIds: [7] }, lookup), {
    suite: 'smoke', fixedCaseIndex: null, scenarios: [{
      name: saved.name, description: saved.description, schemaVersion: 2,
      initialState: saved.initialState, expectations: saved.expectations,
    }],
  });
  assert.throws(() => resolveTestSelection({ suite: 'smoke', scenarioIds: [8] }, lookup), /не найден/);
  assert.throws(() => resolveTestSelection({ suite: 'smoke', scenarioIds: [7, 7] }, lookup), /повторяющийся/);
  assert.throws(() => resolveTestSelection({ suite: 'smoke', scenarioIds: [7] }, () => ({ ...saved, initialState: { magazineMode: 1 } })), /неподдерживаемый контракт/);
  assert.throws(() => resolveTestSelection({ suite: 'twin' }, lookup), /Неизвестный набор/);
});

test('one fixed case uses a positive suite index and excludes saved scenarios', () => {
  assert.deepEqual(resolveTestSelection({ suite: 'regression', fixedCaseIndex: 75 }, lookup), {
    suite: 'regression', fixedCaseIndex: 75, scenarios: [],
  });
  assert.throws(() => resolveTestSelection({ suite: 'smoke', fixedCaseIndex: 0 }, lookup), /положительным/);
  assert.throws(() => resolveTestSelection({ suite: 'generated', fixedCaseIndex: 1 }, lookup), /только для/);
  assert.throws(() => resolveTestSelection({ suite: 'smoke', fixedCaseIndex: 1, scenarioIds: [7] }, lookup), /одновременно/);
});

test('acceptance and saved recovery reject physical/Modbus environments before starting a session', () => {
  const values = { uiMagazineMode: 0, 'stTestObservability.uiSchemaVersion': 3 };
  const config = { suite: 'acceptance', magazineMode: 0, environment: 'simulation', robotInterface: 'softmotion', speedProfile: 'realtime', seed: 1, count: 100 };
  for (const suite of ['acceptance', 'recovery']) {
    assert.equal(resolveTestSelection({ suite }, lookup).suite, suite);
    assert.doesNotThrow(() => validateTestRun({ ...config, suite }, values));
    assert.throws(() => validateTestRun({ ...config, suite, robotInterface: 'python-modbus' }, values), /SoftMotion/);
    assert.throws(() => validateTestRun({ ...config, suite, environment: 'sc500_bench', robotInterface: 'sc500-modbus' }, values), /SoftMotion/);
  }
  assert.throws(() => validateTestRun({ ...config, suite: 'smoke', robotInterface: 'python-modbus' }, values,
    [{ initialState: { magazineMode: 0 }, expectations: { testKind: 'fault-recovery' } }]), /SoftMotion/);
});

test('saved recovery refuses states incompatible with its single-type operator answers', () => {
  const values = { uiMagazineMode: 0, 'stTestObservability.uiSchemaVersion': 3 };
  const config = { suite: 'smoke', magazineMode: 0, environment: 'simulation', robotInterface: 'softmotion', speedProfile: 'fast', seed: 1, count: 1 };
  const initialState = { magazineMode: 0, typeCount: 1, grippers: [{ content: 0 }, { content: 0 }], geometry: { enabled: [false, false], calls: [false, false, false] } };
  const saved = { initialState, expectations: { testKind: 'fault-recovery' } };
  assert.doesNotThrow(() => validateTestRun(config, values, [saved]));
  for (const change of [s => { s.typeCount = 2; }, s => { s.grippers[0].content = 1; }, s => { s.geometry.enabled[0] = true; }]) {
    const state = structuredClone(initialState);
    change(state);
    assert.throws(() => validateTestRun(config, values, [{ ...saved, initialState: state }]), /один тип изделия/);
  }
});
