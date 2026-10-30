import assert from 'node:assert/strict';
import test from 'node:test';
import { requireTestMagazineMode, resolveTestSelection } from './test-contract.mjs';

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
