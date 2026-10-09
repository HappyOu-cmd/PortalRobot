import assert from 'node:assert/strict';
import test from 'node:test';
import { requireStaticMagazineMode, resolveStaticTestSelection } from './test-contract.mjs';

const saved = {
  id: 7, name: 'Сохранённый', description: 'Проверка', schemaVersion: 2,
  initialState: { magazineMode: 0 }, expectations: {},
};
const lookup = (id) => id === 7 ? saved : null;

test('static suite refuses twin and unknown magazine modes before PLC writes', () => {
  assert.doesNotThrow(() => requireStaticMagazineMode(0));
  assert.throws(() => requireStaticMagazineMode(1), /двухпалетный тип/);
  assert.throws(() => requireStaticMagazineMode(undefined), /неизвестен/);
});

test('saved scenario selection rejects missing, repeated and incompatible records', () => {
  assert.deepEqual(resolveStaticTestSelection({ suite: 'smoke', scenarioIds: [7] }, lookup), {
    suite: 'smoke', fixedCaseIndex: null, scenarios: [{
      name: saved.name, description: saved.description, schemaVersion: 2,
      initialState: saved.initialState, expectations: saved.expectations,
    }],
  });
  assert.throws(() => resolveStaticTestSelection({ suite: 'smoke', scenarioIds: [8] }, lookup), /не найден/);
  assert.throws(() => resolveStaticTestSelection({ suite: 'smoke', scenarioIds: [7, 7] }, lookup), /повторяющийся/);
  assert.throws(() => resolveStaticTestSelection({ suite: 'smoke', scenarioIds: [7] }, () => ({ ...saved, initialState: { magazineMode: 1 } })), /статичной схеме/);
  assert.throws(() => resolveStaticTestSelection({ suite: 'twin' }, lookup), /Неизвестный набор/);
});

test('one fixed case uses a positive suite index and excludes saved scenarios', () => {
  assert.deepEqual(resolveStaticTestSelection({ suite: 'regression', fixedCaseIndex: 75 }, lookup), {
    suite: 'regression', fixedCaseIndex: 75, scenarios: [],
  });
  assert.throws(() => resolveStaticTestSelection({ suite: 'smoke', fixedCaseIndex: 0 }, lookup), /положительным/);
  assert.throws(() => resolveStaticTestSelection({ suite: 'generated', fixedCaseIndex: 1 }, lookup), /только для/);
  assert.throws(() => resolveStaticTestSelection({ suite: 'smoke', fixedCaseIndex: 1, scenarioIds: [7] }, lookup), /одновременно/);
});
