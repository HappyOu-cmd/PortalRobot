import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSt, conversions, emptyCall, readPlc } from './helpers/geometryStRuntime.mjs';
import { freshScenario } from '../src/components/tests/testWorkbenchState.ts';
import { scenarioWrites } from '../gateway/test-scenario.mjs';

const source = readPlc('PLC_PRG.RunTestControl.st');
const start = source.indexOf('IF rtTestScenarioApply.Q THEN');
const end = source.indexOf('GVL_HMI.uiTestEnvironmentApplied :=', start);
const body = source.slice(start, end)
  .replace(/DWORD#16#([0-9A-Fa-f_]+)/g, (_, hex) => String(parseInt(hex.replaceAll('_', ''), 16)))
  .replace(/\((GVL_HMI\.stTestScenario\.[\w\[\]]+) AND (\d+)\)/g, '($1 & $2)')
  .replace(/\[(\w+),\s*(\w+)\]/g, '[$1][$2]');
const apply = compileSt(body);
const array = (size, value) => [null, ...Array.from({ length: size }, value)];
const slot = () => ({ xInPosition: false, eDetailType: 0, uiProductType: 0 });
const inventory = () => ({ aSlots: array(120, slot) });
function fixture(mode, role = [1, 2]) {
  const scenario = freshScenario(mode).initialState;
  const buffer = {};
  for (const { path, value } of scenarioWrites(scenario)) {
    const fields = path.slice('stTestScenario.'.length).match(/\w+/g);
    let parent = buffer;
    for (const field of fields.slice(0, -1)) parent = parent[field] ??= {};
    parent[fields.at(-1)] = value;
  }
  buffer.udiLoadSeq = 42;
  return { ...conversions, rtTestScenarioApply: { Q: true }, uiTestSlotCount: 120, uiTestMagazine: 0,
    uiTestPallet: 0, uiTestOtherPallet: 0, uiTestType: 0, xTestTypeHasMachine: false, xTestTypeHasSlot: false, uiTestIndex: 0, uiTestFaultOwnerCount: 0, xTestScenarioValid: false, xTestInitializePulse: false,
    xTestGeometrySettingsSaved: false, xTestSavedGeometryAuto: false, xTestSavedGeometryWait: false,
    GVL_HMI: { stTestScenario: buffer, xTestScenarioApplyAllowed: true, uiTestScenarioResult: 255,
      axMachineSimAlarm: array(3, () => false), axMachineSimDoorFault: {}, axMachineSimChuckFault: {},
      axMachineTimeoutRobotMove: {}, axMachineTimeoutRobotAction: {}, axMachineTimeoutRobotRelease: {},
      axMachineTimeoutDoorOpen: {}, axMachineTimeoutDoorClose: {}, axMachineTimeoutChuckOpen: {},
      axMachineTimeoutChuckClose: {}, axMachineTimeoutCycleStart: {} },
    GVL_DETAIL: { astMagazine: array(2, inventory) },
    GVL_TWO_PALLET: { uiMode: mode, astStatus: array(2, (_, i) => ({ uiRobotPallet: role[i] })),
      astStatic: array(2, inventory), axSimulationAutoSwapEnabled: {},
      astStore: array(2, () => ({ astPallet: array(2, inventory), axLoaded: [null, false, false] })) },
    GVL_CELL_SETTINGS: { eTestEnvironment: 1 }, E_CELL_TEST_ENVIRONMENT: { NORMAL: 0, SIMULATION: 1, SC500_BENCH: 2 },
    E_DETAIL_TYPE: { NONE: 0, BLANK: 1, DETAIL: 2 }, Persistent_Value: { xAutoEnabled: true, xWaitWhenOccupied: false },
    axHmiInternalPulse: {}, adwTestMagazineFaultMask: {},
  };
}

test('actual ST accepts static inventories and acknowledges exactly their LoadSeq', () => {
  const s = fixture(0);
  s.GVL_HMI.stTestScenario.aauiSlotContent[2][120] = 2;
  apply(s);
  assert.equal(s.GVL_HMI.uiTestScenarioResult, 0);
  assert.equal(s.GVL_HMI.udiTestScenarioAckSeq, 42);
  assert.equal(s.GVL_DETAIL.astMagazine[2].aSlots[120].eDetailType, 2);
  assert.equal(s.GVL_TWO_PALLET.astStatic[2].aSlots[120].xInPosition, true);
  assert.equal(s.xTestInitializePulse, true);
});

test('actual ST maps robot and operator roles to both physical pallet identities', () => {
  for (const first of [1, 2]) for (const second of [1, 2]) {
    const roles = [first, second], s = fixture(1, roles), b = s.GVL_HMI.stTestScenario;
    b.aauiSlotContent[1][96] = 1; b.aauiOperatorSlotContent[1][96] = 2;
    b.aauiSlotContent[2][95] = 2; b.aauiOperatorSlotContent[2][95] = 1;
    b.axOperatorLoaded[1] = true; b.axAutoSwap[2] = true;
    // Stale unused tails must be cleared on all four physical pallets.
    for (const m of [1, 2]) for (const p of [1, 2]) s.GVL_TWO_PALLET.astStore[m].astPallet[p].aSlots[120] = { xInPosition: true, eDetailType: 2, uiProductType: 1 };
    apply(s);
    assert.equal(s.GVL_HMI.uiTestScenarioResult, 0);
    for (const m of [1, 2]) {
      const store = s.GVL_TWO_PALLET.astStore[m], p = roles[m - 1], i = m === 1 ? 96 : 95;
      assert.equal(store.astPallet[p].aSlots[i].eDetailType, m === 1 ? 1 : 2);
      assert.equal(store.astPallet[3 - p].aSlots[i].eDetailType, m === 1 ? 2 : 1);
      assert.equal(store.astPallet[1].aSlots[120].xInPosition, false);
      assert.equal(store.astPallet[2].aSlots[120].xInPosition, false);
    }
    assert.equal(s.GVL_TWO_PALLET.astStore[1].axLoaded[3 - first], true);
    assert.equal(s.GVL_TWO_PALLET.axSimulationAutoSwapEnabled[2], true);
  }
});

test('actual ST rejects invalid buffers atomically and still acknowledges the rejected sequence', () => {
  for (const change of [
    b => { b.uiSchemaVersion = 2; }, b => { b.uiTypeCount = 2; }, b => { b.uiMagazineMode = 0; }, b => { b.uiOrientation = 2; },
    b => { b.aauiOperatorSlotContent[2][96] = 3; }, b => { b.auiSlotType[96] = 0; },
    b => { b.auiGripperContent[1] = 2; }, b => { b.dwRobotFaultMask = 1; b.dwCellFaultMask = 1; },
  ]) {
    const s = fixture(1); change(s.GVL_HMI.stTestScenario);
    const before = structuredClone(s.GVL_TWO_PALLET.astStore);
    apply(s);
    assert.equal(s.GVL_HMI.uiTestScenarioResult, 2);
    assert.deepEqual(s.GVL_TWO_PALLET.astStore, before);
    assert.equal(s.xTestInitializePulse, false);
    assert.equal(s.GVL_HMI.udiTestScenarioAckSeq, 42);
    assert.equal(s.xTestGeometrySettingsSaved, false);
  }
  const busy = fixture(0); busy.GVL_HMI.xTestScenarioApplyAllowed = false; apply(busy);
  assert.equal(busy.GVL_HMI.uiTestScenarioResult, 1);
  assert.equal(busy.GVL_DETAIL.astMagazine[1].aSlots[1].xInPosition, false);
});

test('actual ST rejects GK payloads in bench/Modbus and keeps operator policy for restoration', () => {
  for (const [environment, modbus] of [[2, false], [1, true]]) {
    const s = fixture(0); s.GVL_HMI.stTestScenario.axGeometryEnabled[1] = true;
    s.GVL_CELL_SETTINGS.eTestEnvironment = environment; s.GVL_HMI.xModbusMode = modbus;
    apply(s); assert.equal(s.GVL_HMI.uiTestScenarioResult, 2);
  }
  const s = fixture(0); apply(s);
  assert.equal(s.xTestSavedGeometryAuto, true);
  assert.equal(s.xTestSavedGeometryWait, false);
  assert.equal(s.Persistent_Value.xAutoEnabled, false);
});

test('actual PLC permissions allow stationary powered twin loading but preserve the environment power-off gate', () => {
  const gate = compileSt(source.slice(source.indexOf('xTestStable :='), source.indexOf('// Старые OPC UA')));
  const ready = () => {
    const s = fixture(1);
    Object.assign(s, { xTestStable: false, xMotionBusy: false, SIMULATION_DYNAMICS: { xBusy: false },
      GVL_CELL_MANAGER: { Status: { xRunning: false } }, GVL_ROBOT: { Status: { xBusy: false } },
      GVL_MACHINE: { Status: array(3, () => ({ xBusy: false, xProcessing: false })) },
      GVL_MAGAZINE: { astStatus: array(2, () => ({ xBusy: false })) },
      GVL_GEOMETRY_CONTROL: { astStatus: array(2, () => ({ xDriveRunning: false, xResetBusy: false, xReserved: false })) },
      GVL_ROBOT_MODBUS: { xModeActive: false, Status: { xSimulatorActive: false } } });
    s.GVL_HMI.xTestSessionActive = true;
    s.GVL_TWO_PALLET.astInput = array(2, () => ({ xStandstill: true, xPowered: true }));
    for (const i of [1, 2]) Object.assign(s.GVL_TWO_PALLET.astStatus[i], { xConfirmed: true, xBusy: false });
    return s;
  };
  const s = ready(); gate(s);
  assert.equal(s.GVL_HMI.xTestScenarioApplyAllowed, true);
  assert.equal(s.GVL_HMI.xTestEnvironmentChangeAllowed, false);
  for (const patch of [
    s => { s.GVL_TWO_PALLET.astStatus[2].xConfirmed = false; },
    s => { s.GVL_TWO_PALLET.astStatus[1].uiRobotPallet = 0; },
    s => { s.GVL_TWO_PALLET.astInput[2].xStandstill = false; },
    s => { s.GVL_GEOMETRY_CONTROL.astStatus[1].xReserved = true; },
    s => { s.GVL_GEOMETRY_CONTROL.astStatus[2].xDriveRunning = true; },
    s => { s.GVL_MACHINE.Status[3].xProcessing = true; },
    s => { s.GVL_HMI.xTestSessionActive = false; },
    s => { s.GVL_HMI.xModbusMode = true; },
    s => { s.GVL_CELL_SETTINGS.eTestEnvironment = 0; },
  ]) {
    const blocked = ready(); patch(blocked); gate(blocked);
    assert.equal(blocked.GVL_HMI.xTestScenarioApplyAllowed, false);
  }
});

test('actual GK scenario reset preserves monotonic counters, clears only simulation memory and assigns fresh call IDs', () => {
  const geometry = readPlc('PLC_PRG.RunGeometryControl.st').replaceAll('\r\n', '\n');
  const initStart = geometry.indexOf('// Only the accepted simulation buffer');
  const reset = compileSt(geometry.slice(initStart, geometry.indexOf('FOR uiGeometry := UINT#1 TO UINT#2 DO\n\tGVL_GEOMETRY_CONTROL.auiAction', initStart)));
  const s = fixture(0);
  Object.assign(s, { xTestInitializePulse: true, uiGeometry: 0, uiGeometryMachine: 0, udiTestGeometryProduced: 0,
    stTestEmptyGeometryMemory: { xOccupied: false, udiProducedPartsTotal: 0, Part: emptyCall() }, stTestEmptyGeometryCall: emptyCall(),
    GVL_GEOMETRY_CONTROL: { astActiveMemory: array(2, (_, i) => ({ xOccupied: true, udiProducedPartsTotal: 900 + i })),
      astSimulationMemory: array(2, () => ({})), astSignals: array(2, () => ({ xReserve: true, xDeposited: true })),
      axSimulationAlarm: {}, astCalls: array(3, emptyCall), auiActiveCount: {} } });
  s.Persistent_Value.astMemory = [{ real: 'untouched' }];
  s.Persistent_Value.udiNextCallId = 0xffffffff;
  s.GVL_HMI.stTestScenario.axGeometryCall[1] = true;
  reset(s);
  assert.deepEqual(s.Persistent_Value.astMemory, [{ real: 'untouched' }]);
  for (const i of [1, 2]) {
    assert.equal(s.GVL_GEOMETRY_CONTROL.astActiveMemory[i].xOccupied, false);
    assert.equal(s.GVL_GEOMETRY_CONTROL.astActiveMemory[i].udiProducedPartsTotal, 899 + i);
    assert.equal(s.GVL_GEOMETRY_CONTROL.astSignals[i].xReserve, false);
  }
  assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[1].udiId, 1);
  assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[1].uiState, 1);
});

test('actual ST restores the saved operator policy once the test session is released', () => {
  const restore = compileSt(source.slice(source.indexOf('// Restore the operator policy')));
  const s = fixture(0); apply(s);
  s.GVL_HMI.xTestSessionActive = true; restore(s);
  assert.equal(s.Persistent_Value.xAutoEnabled, false);
  s.GVL_HMI.xTestSessionActive = false; restore(s);
  assert.equal(s.Persistent_Value.xAutoEnabled, true);
  assert.equal(s.Persistent_Value.xWaitWhenOccupied, false);
  assert.equal(s.xTestGeometrySettingsSaved, false);
});
