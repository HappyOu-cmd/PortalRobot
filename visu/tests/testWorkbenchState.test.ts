import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseCase, freshScenario, normalizeScenario, runBlockedReason, runProgress, type TestStatus } from '../src/components/tests/testWorkbenchState.ts';

const ready = (): TestStatus => ({ available: true, activeRunId: null,
  plc: { connected: true, magazineMode: 1, testSchemaVersion: 3, twinConfirmed: [true, true], appliedEnvironment: 1,
    requestedEnvironment: 1, environmentChangeAllowed: true, simulatorActive: false, robotReady: true, rejectReason: 0 } });

test('workbench does not advertise runnable tests for a stale contract or unknown pallet state', () => {
  assert.equal(runBlockedReason(ready(), 'smoke', 'softmotion', 'simulation'), '');
  for (const patch of [{ testSchemaVersion: 2 }, { magazineMode: null }, { twinConfirmed: [] }, { twinConfirmed: [true, false] }, { appliedEnvironment: 0 }]) {
    const status = ready(); Object.assign(status.plc!, patch);
    assert.notEqual(runBlockedReason(status, 'smoke', 'softmotion', 'simulation'), '');
  }
  assert.match(runBlockedReason(ready(), 'general', 'softmotion', 'simulation'), /статичные/);
  assert.match(runBlockedReason(ready(), 'geometry', 'python-modbus', 'simulation'), /SoftMotion/);
  assert.match(runBlockedReason(ready(), 'smoke', 'softmotion', 'simulation', [freshScenario(0)]), /не совпадает/);
  const savedGeneral = freshScenario(0); savedGeneral.expectations.testKind = 'general-four-batches';
  const staticStatus = ready(); staticStatus.plc!.magazineMode = 0;
  assert.match(runBlockedReason(staticStatus, 'smoke', 'sc500-modbus', 'sc500_bench', [savedGeneral]), /симуляцию/);
  for (const suite of ['acceptance', 'recovery']) {
    assert.equal(runBlockedReason(staticStatus, suite, 'softmotion', 'simulation'), '');
    assert.match(runBlockedReason(staticStatus, suite, 'python-modbus', 'simulation'), /SoftMotion/);
    assert.match(runBlockedReason(staticStatus, suite, 'sc500-modbus', 'sc500_bench'), /SoftMotion/);
  }
});

test('all new inventories are independent and legacy captures retain their slot contents', () => {
  const twin = freshScenario(1);
  twin.initialState.magazines[0].operatorSlots![0].content = 2;
  assert.equal(twin.initialState.magazines[1].slots[0].content, 0);
  assert.equal(twin.initialState.magazines[0].slots[0].content, 1);
  const source = freshScenario(0);
  const legacy = source as unknown as { initialState: Record<string, unknown> };
  legacy.initialState.slots = source.initialState.magazines[0].slots;
  legacy.initialState.magazineEnabled = true;
  delete legacy.initialState.magazines;
  delete legacy.initialState.geometry;
  const result = normalizeScenario(source);
  assert.equal(result.schemaVersion, 3);
  assert.equal(result.initialState.magazines[0].slots[0].content, 1);
  assert.equal(result.initialState.magazines[1].slots[0].content, 0);
  assert.deepEqual(result.initialState.geometry.calls, [false, false, false]);
});

test('diagnostics initially focuses the failure and preserves an explicitly selected success', () => {
  const cases = [{ caseIndex: 1, name: 'OK', status: 'PASS' }, { caseIndex: 2, name: 'Error', status: 'FAIL' }, { caseIndex: 3, name: 'OK2', status: 'PASS' }];
  assert.equal(chooseCase(cases, null)?.caseIndex, 2);
  assert.equal(chooseCase(cases, 1)?.caseIndex, 1);
  assert.equal(chooseCase([], null), undefined);
  assert.equal(runProgress(null), 0);
});
