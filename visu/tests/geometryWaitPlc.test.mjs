import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSt, conversions, defaultsFromSt, emptyCall, readPlc, ton } from './helpers/geometryStRuntime.mjs';

const update = compileSt(readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.UpdateGeometryWait.st'));
const selectStation = compileSt(readPlc('FB/F_GEOMETRY_SELECT_STATION.st'));
const eligible = compileSt(readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.IsMachineEligible.st'));
const compatible = compileSt(readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.IsMachineCompatible.st'));
const selectBeforeTake = compileSt(readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.SelectMachineBeforeTake.st'));
const selectHeldBlank = compileSt(readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.SelectMachineForHeldBlank.st'));
const selectUnload = compileSt(readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.SelectMachineForUnload.st'));
const takeDetail = compileSt(readPlc('FB/F_GEOMETRY_TAKE_DETAIL.st'));
const managerSource = readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st');
const serviceStart = managerSource.indexOf('\tE_CELL_MANAGER_STATE.SERVICE_TARGET:');
const service = compileSt('CASE eState OF\n' + managerSource.slice(serviceStart,
  managerSource.indexOf('\tE_CELL_MANAGER_STATE.MACHINE_FAULT_STOP:', serviceStart))
  // Обвязка только предупреждения о типах; маршрут и вызовы исполняются из ST.
  .replace(/\bRaisePayloadRouteWarning\(/g, 'F_GEOMETRY_TEST_PAYLOAD_WARNING(') + '\nEND_CASE;');
const planGeometry = compileSt(readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.PlanGeometry.st'));
const geometryRoute = compileSt(readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.RunGeometryRoute.st'));
const commandSource = readPlc('PLC_PRG.RunGeometryControl.st');
const callStart = commandSource.indexOf('IF (stGeometryRequest.uiAction = UINT#8)');
const callCommand = compileSt(commandSource.slice(callStart,
  commandSource.indexOf('ELSIF (stGeometryRequest.uiAction = UINT#9)', callStart)) + '\nEND_IF;');

function fixture() {
  const s = { ...conversions, ...defaultsFromSt(readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.UpdateGeometryWait.st')),
    now: 0, FIRST_MACHINE: 1, LAST_MACHINE: 3,
    START_PENDING_ESTIMATE: 1000, MACHINE_SWITCH_DEADBAND: 1000, WRN_GEOMETRY_WAIT_TIMEOUT: 52,
    E_PART_STATE: { EMPTY: 0, LOADED: 1 }, E_PART_TYPE: { PART: 1, DETAIL: 2 },
    xRunning: true, xManual: false, xGlobalError: false,
    Config: { uiTypeCount: 3, auiMachineType: [null, 1, 1, 1] },
    astMachineStatus: [null, ...[1, 2, 3].map(i => ({ xEnabled: true, xError: false, xDisablePending: false,
      xBusy: false, xProcessing: false, xCanAcceptService: true, xServiceRequired: i === 1,
      ePartState: i === 1 ? 1 : 0, ePartType: i === 1 ? 2 : 0, xCycleTimeValid: false }))],
    axMachineStartPending: [null, false, false, false],
    stMagazineStatus: { stTypeStatus: { aiBlankSlot: [null, 1, 1, 1], aiFreeSlot: [null, 2, 2, 2] } },
    GVL_GEOMETRY_CONTROL: { xSupported: true, xAutoEnabled: false, xWaitWhenOccupied: true, uiLastStation: 0,
      udiNextCallId: 44, auiActiveCount: [null, 0, 0, 0], auiPeriod: [null, 20, 20, 20], tWaitWarningTimeout: 180000,
      astCalls: [null, { ...emptyCall(), udiId: 44, uiMachine: 1, uiProductType: 1, uiState: 1, xForced: true }, emptyCall(), emptyCall()],
      astStatus: [null, { xEnabled: true, xConfigured: true, xReady: false, xError: false, uiState: 4 },
        { xEnabled: false, xConfigured: true, xReady: false, xError: false, uiState: 0 }],
      stCellWarning: { uiCode: 0, udiSequence: 0 } },
    GVL_ALARM: { Command: { xResetWarnings: false } }, events: [],
    axGeometryUnloadBlocked: [null, false, false, false], audiGeometryWaitCallId: [null, 44, 0, 0],
    axGeometryWaitWarned: [null, false, false, false],
    Call: emptyCall(), EmptyCall: emptyCall(), uiMachine: 0, uiFreeStation: 0, uiCallState: 0,
    xCalled: false, xReadyDetail: false, xWaiting: false, xRaiseWarning: false,
  };
  s.atonGeometryWait = [null, ...[1, 2, 3].map(() => ton(s))];
  s.F_GEOMETRY_EVENT = ({ Call }) => { s.events.push(structuredClone(Call)); return true; };
  s.F_GEOMETRY_SELECT_STATION = args => { const local = { ...s, ...args, uiTry: 0, uiStation: 0, F_GEOMETRY_SELECT_STATION: 0 }; selectStation(local); return local.F_GEOMETRY_SELECT_STATION; };
  s.IsMachineEligible = args => { const local = { ...s, ...args, IsMachineEligible: false }; eligible(local); return local.IsMachineEligible; };
  s.IsMachineCompatible = args => { const local = { ...s, ...args, IsMachineCompatible: false }; compatible(local); return local.IsMachineCompatible; };
  s.scan = (dt = 0) => { s.now += dt; update(s); };
  return s;
}
function selected(run, name, s, currentMachine = 1) {
  const local = { ...s, [name]: 0, uiCurrentMachine: currentMachine, uiProductType: 1, uiType: 0, uiMachine: 0,
    xTimedFound: false, xCurrentTimed: false, tMinimumRemaining: 0, tCandidateRemaining: 0, tCurrentRemaining: 0 };
  run(local); return local[name];
}

const selectors = [[selectBeforeTake, 'SelectMachineBeforeTake'], [selectHeldBlank, 'SelectMachineForHeldBlank'], [selectUnload, 'SelectMachineForUnload']];
function pendingCalls(s, order, firstId = 101) {
  const g = s.GVL_GEOMETRY_CONTROL;
  g.astCalls = [null, emptyCall(), emptyCall(), emptyCall()];
  Object.assign(g.astStatus[1], { xEnabled: true, xConfigured: true, xReady: true, xError: false, uiState: 1 });
  for (const machine of [1, 2, 3]) Object.assign(s.astMachineStatus[machine], {
    xServiceRequired: true, ePartState: 1, ePartType: 2, xCycleTimeValid: true, tRemaining: 1000, tCycleExpected: 2000,
  });
  let id = firstId;
  for (const machine of order) {
    g.astCalls[machine] = { ...emptyCall(), udiId: id, uiMachine: machine, uiProductType: 1, uiState: 1, xForced: true };
    g.udiNextCallId = id;
    id = id === 0xffffffff ? 1 : id + 1;
  }
}
function take(s, machine) {
  Object.assign(s, { uiMachine: machine, uiProductType: 1, F_GEOMETRY_TAKE_DETAIL: false });
  takeDetail(s); return s.F_GEOMETRY_TAKE_DETAIL;
}

function serviceFixture(operation = 'CHANGE') {
  const s = fixture(), g = s.GVL_GEOMETRY_CONTROL;
  g.astCalls[1] = emptyCall(); g.xAutoEnabled = true; g.auiActiveCount[1] = 4;
  Object.assign(g.astStatus[1], { xReady: true, uiState: 1 });
  g.astSignals = [null, { xReserve: false }, { xReserve: false }];
  g.axCallAllowed = [null, true, true, true]; g.axCancelAllowed = [null, true, true, true];
  s.stMagazineStatus.udiProducedPartsTotal = 10;
  Object.assign(s, {
    E_MACHINE_OPERATION: { NONE: 0, LOAD: 1, CHANGE: 2, UNLOAD: 3 },
    E_CELL_MANAGER_STATE: { SERVICE_TARGET: 7, PLAN_TARGET: 1, SELECT_FALLBACK: 8, ERROR: 10,
      GEOMETRY_WAIT_FREE: 19, GEOMETRY_DELIVER: 20 },
    eState: 7, uiSelectedMachine: 1, uiSelectedType: 1, uiBlankPayloadType: 1, uiDetailPayloadType: 0,
    xMachineServiceStarted: true, xGeometryHeld: false, xGeometryDetailCounted: false,
    uiGeometryMachine: 0, uiGeometryStation: 0, uiGeometryStep: 0, uiGeometryParkStation: 0,
    uiGeometryBypassReason: 0, udiGeometryMagazineCounter: 0, uiFree: 0, uiAvailable: 0, PlanGeometry: false,
    stRobotStatus: { xDetailAvailable: false, xError: false },
    Command: { axMachineExecute: [null, false, false, false] }, Error: { dwErrorActive: 0 },
    ERR_MACHINE: 2, ERR_ROBOT: 4, F_GEOMETRY_TEST_PAYLOAD_WARNING: () => true,
    GVL_HMI: { uiGeometryResult: 0 }, GVL_MULTI_TYPE: { Config: s.Config },
  });
  s.eMachineOperation = s.E_MACHINE_OPERATION[operation];
  Object.assign(s.astMachineStatus[1], { xBusy: true, xRobotReleased: false, xServiceRejected: false });
  s.F_GEOMETRY_TAKE_DETAIL = args => {
    const local = { ...s, ...args, Call: emptyCall(), EmptyCall: emptyCall(), F_GEOMETRY_TAKE_DETAIL: false };
    takeDetail(local); return local.F_GEOMETRY_TAKE_DETAIL;
  };
  s.call = (machine = 1, action = 8) => {
    const local = { ...s, stGeometryRequest: { uiAction: action, uiMachine: machine }, uiGeometryMachine: 0,
      stGeometryCall: emptyCall(), stGeometryEmptyCall: emptyCall() };
    callCommand(local); assert.equal(s.GVL_HMI.uiGeometryResult, 1);
  };
  s.serviceScan = () => service(s);
  s.grip = () => { s.stRobotStatus.xDetailAvailable = true; s.serviceScan(); };
  s.release = () => { s.astMachineStatus[1].xRobotReleased = true; s.serviceScan(); };
  s.plan = () => { planGeometry(s); return s.PlanGeometry; };
  return s;
}

test('late forced call during CHANGE or UNLOAD routes the current detail after machine release', () => {
  for (const operation of ['CHANGE', 'UNLOAD']) {
    const s = serviceFixture(operation), g = s.GVL_GEOMETRY_CONTROL;
    s.grip(); assert.equal(g.auiActiveCount[1], 5); assert.equal(s.uiDetailPayloadType, 1);
    s.call(); const id = g.astCalls[1].udiId; s.serviceScan();
    assert.equal(s.xGeometryHeld, false); assert.equal(g.astCalls[1].uiState, 1);
    s.release();
    assert.equal(s.xGeometryHeld, true); assert.equal(s.uiGeometryMachine, 1);
    assert.equal(s.uiSelectedMachine, 0); assert.equal(g.auiActiveCount[1], 0);
    assert.equal(g.astCalls[1].udiId, id); assert.equal(g.astCalls[1].uiState, 2);
    assert.equal(s.plan(), true); assert.equal(s.eState, s.E_CELL_MANAGER_STATE.GEOMETRY_DELIVER);
    assert.equal(g.astSignals[1].xReserve, true); assert.equal(g.astCalls[1].uiStation, 1);
    assert.deepEqual(s.events.map(call => [call.udiId, call.uiState]), [[id, 1], [id, 2], [id, 3]]);
  }
});

test('a pending call arriving in the release scan is bound before target selection', () => {
  const s = serviceFixture(); s.grip(); s.call(); s.release();
  assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[1].uiState, 2);
  assert.equal(s.xGeometryHeld, true); assert.equal(s.uiGeometryMachine, 1);
  assert.equal(s.plan(), true);
});

test('release recheck binds its own late call despite an older call from another machine', () => {
  for (const operation of ['CHANGE', 'UNLOAD']) {
    const s = serviceFixture(operation), g = s.GVL_GEOMETRY_CONTROL;
    s.grip(); s.call(2); s.call(1); const calls = structuredClone(g.astCalls);
    s.release();
    assert.equal(s.xGeometryHeld, true); assert.equal(s.uiGeometryMachine, 1);
    assert.equal(g.astCalls[1].udiId, calls[1].udiId); assert.equal(g.astCalls[1].uiState, 2);
    assert.deepEqual(g.astCalls[2], calls[2]); assert.equal(g.auiActiveCount[1], 0);
    assert.equal(s.plan(), true); assert.equal(g.astCalls[1].uiStation, 1);
    assert.deepEqual(s.events.map(call => [call.uiMachine, call.uiState]), [[2, 1], [1, 1], [1, 2], [1, 3]]);
  }
});

test('absent cancelled or other-machine calls do not recount the unload on release', () => {
  for (const variant of ['absent', 'cancelled', 'other-machine']) {
    const s = serviceFixture(), g = s.GVL_GEOMETRY_CONTROL;
    s.grip();
    if (variant === 'cancelled') { s.call(); s.call(1, 12); }
    if (variant === 'other-machine') s.call(2);
    const count = g.auiActiveCount[1], calls = structuredClone(g.astCalls), events = structuredClone(s.events);
    s.serviceScan(); s.serviceScan(); s.release(); s.serviceScan();
    assert.equal(s.xGeometryHeld, false); assert.equal(s.plan(), false);
    assert.equal(g.auiActiveCount[1], count); assert.deepEqual(g.astCalls, calls); assert.deepEqual(s.events, events);
  }
});

test('a call accepted after machine release waits for the following detail', () => {
  const s = serviceFixture(); s.grip(); s.release(); s.call(); s.serviceScan();
  assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[1].uiState, 1);
  assert.equal(s.xGeometryHeld, false); assert.equal(s.plan(), false);
});

test('a previously bound call is not taken or counted again on release', () => {
  const s = serviceFixture(), g = s.GVL_GEOMETRY_CONTROL;
  s.call(); const id = g.astCalls[1].udiId; s.grip(); s.serviceScan(); s.release();
  assert.equal(s.xGeometryHeld, true); assert.equal(g.auiActiveCount[1], 0);
  assert.deepEqual(s.events.map(call => [call.udiId, call.uiState]), [[id, 1], [id, 2]]);
  assert.equal(s.plan(), true);
});

test('late calls retain occupied and unavailable GK recovery policies', () => {
  for (const wait of [true, false]) for (const available of [true, false]) {
    const s = serviceFixture(), g = s.GVL_GEOMETRY_CONTROL;
    s.grip(); s.call(); g.xWaitWhenOccupied = wait;
    Object.assign(g.astStatus[1], { xReady: false, xEnabled: available, uiState: available ? 4 : 0 });
    s.release(); assert.equal(g.astCalls[1].uiState, 2); assert.equal(s.xGeometryHeld, true);
    assert.equal(s.plan(), wait && available);
    assert.equal(s.eState, wait && available ? s.E_CELL_MANAGER_STATE.GEOMETRY_WAIT_FREE : s.E_CELL_MANAGER_STATE.PLAN_TARGET);
    assert.equal(s.uiGeometryBypassReason, wait && available ? 0 : available ? 1 : 2);
    assert.equal(g.astSignals[1].xReserve, false); assert.equal(g.astCalls[1].uiState, 2);
    assert.equal(g.stCellWarning.udiSequence, 0);
  }
});

test('late calls are not bound through machine or robot errors or a rejected service', () => {
  for (const reason of ['machine-error', 'robot-error', 'rejected']) {
    const s = serviceFixture(); s.grip(); s.call();
    if (reason === 'machine-error') s.astMachineStatus[1].xError = true;
    if (reason === 'robot-error') s.stRobotStatus.xError = true;
    if (reason === 'rejected') s.astMachineStatus[1].xServiceRejected = true;
    s.release();
    assert.equal(s.xGeometryHeld, false); assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[1].uiState, 1);
    assert.equal(s.eState, reason === 'robot-error' ? s.E_CELL_MANAGER_STATE.ERROR : s.E_CELL_MANAGER_STATE.SELECT_FALLBACK);
  }
});

function heldGeometryFixture(machine) {
  const s = serviceFixture(), g = s.GVL_GEOMETRY_CONTROL;
  Object.assign(s, { eState: s.E_CELL_MANAGER_STATE.PLAN_TARGET, uiSelectedMachine: 0,
    uiGeometryMachine: machine, xGeometryHeld: true, xMotionBusy: false, xStopRequested: false,
    xSafetyHomeRequired: false, xStoppedPoseValid: true,
    E_POINT_NAME: { GEOMETRY_1_SAFE: 25, GEOMETRY_2_SAFE: 28, GEOMETRY_1_PLACE: 24, GEOMETRY_2_PLACE: 27 },
    E_ROBOT_ACTION: { MOVE_TO_POINT: 1, UNCLAMP_2: 4, ROTATE_TO_BLANK: 6 } });
  Object.assign(s.E_CELL_MANAGER_STATE, { IDLE: 0, GEOMETRY_RELEASE_COMMAND: 21 });
  Object.assign(s.stRobotStatus, { xDetailAvailable: true, xBusy: false, xDone: false, eCurrentPoint: 0 });
  g.astCalls[machine] = { ...emptyCall(), udiId: 101, uiMachine: machine, uiProductType: 1, uiState: 2 };
  Object.assign(g.astStatus[2], { xEnabled: true, xReady: true, uiState: 1 });
  s.route = () => { s.Command.stRobot = {}; geometryRoute(s); };
  return s;
}

test('station preference follows source machine and ignores the last delivered GK', () => {
  for (const machine of [1, 2, 3]) for (const lastStation of [0, 1, 2]) {
    const s = heldGeometryFixture(machine); s.GVL_GEOMETRY_CONTROL.uiLastStation = lastStation;
    for (const requireFree of [true, false]) {
      assert.equal(s.F_GEOMETRY_SELECT_STATION({ uiMachine: machine, xRequireFree: requireFree }), machine === 3 ? 2 : 1);
    }
  }
});

test('station selection falls back for a busy disabled unconfigured faulty or recovering preferred GK', () => {
  for (const machine of [1, 2, 3]) for (const reason of [
    { xReady: false, uiState: 4 }, { xEnabled: false }, { xConfigured: false }, { xError: true },
    { uiState: 5 }, { xReady: false, xReserved: true, uiState: 2 }, { xReady: false, xDriveRunning: true, uiState: 7 },
  ]) {
    const s = heldGeometryFixture(machine), g = s.GVL_GEOMETRY_CONTROL;
    const preferred = machine === 3 ? 2 : 1, alternate = 3 - preferred;
    Object.assign(g.astStatus[preferred], reason);
    assert.equal(s.F_GEOMETRY_SELECT_STATION({ uiMachine: machine, xRequireFree: true }), alternate);
    g.astStatus[alternate].xEnabled = false;
    assert.equal(s.F_GEOMETRY_SELECT_STATION({ uiMachine: machine, xRequireFree: true }), 0);
  }
});

test('no ready GK produces no route while availability keeps the source preference', () => {
  for (const machine of [0, 1, 2, 3]) {
    const s = heldGeometryFixture(1), g = s.GVL_GEOMETRY_CONTROL;
    for (const station of [1, 2]) Object.assign(g.astStatus[station], { xReady: false, uiState: 4 });
    const preferred = machine === 3 ? 2 : 1, alternate = 3 - preferred;
    assert.equal(s.F_GEOMETRY_SELECT_STATION({ uiMachine: machine, xRequireFree: true }), 0);
    assert.equal(s.F_GEOMETRY_SELECT_STATION({ uiMachine: machine, xRequireFree: false }), preferred);
    g.astStatus[preferred].xEnabled = false;
    assert.equal(s.F_GEOMETRY_SELECT_STATION({ uiMachine: machine, xRequireFree: false }), alternate);
    g.astStatus[alternate].xEnabled = false;
    assert.equal(s.F_GEOMETRY_SELECT_STATION({ uiMachine: machine, xRequireFree: false }), 0);
    for (const station of [1, 2]) Object.assign(g.astStatus[station], { xEnabled: true, xReady: true, uiState: 1 });
    g.xSupported = false;
    for (const requireFree of [true, false]) assert.equal(s.F_GEOMETRY_SELECT_STATION({ uiMachine: machine, xRequireFree: requireFree }), 0);
  }
});

test('planner reserves the preferred free GK using the held part source after machine selection resets', () => {
  for (const machine of [1, 2, 3]) for (const lastStation of [0, 1, 2]) {
    const s = heldGeometryFixture(machine), g = s.GVL_GEOMETRY_CONTROL;
    g.uiLastStation = lastStation;
    assert.equal(s.uiSelectedMachine, 0); assert.equal(s.plan(), true);
    const preferred = machine === 3 ? 2 : 1;
    assert.equal(s.uiGeometryStation, preferred); assert.equal(g.astCalls[machine].uiStation, preferred);
    assert.equal(g.astSignals[preferred].xReserve, true); assert.equal(g.astSignals[3 - preferred].xReserve, false);
    assert.equal(g.astSignals[preferred].Call.uiMachine, machine); assert.equal(g.astCalls[machine].udiId, 101);
    assert.equal(g.astCalls[machine].uiState, 3);
  }
});

test('waiting parks near the source-preferred available GK and falls back when it is unavailable', () => {
  for (const machine of [1, 2, 3]) for (const preferredEnabled of [true, false]) {
    const s = heldGeometryFixture(machine), g = s.GVL_GEOMETRY_CONTROL;
    for (const station of [1, 2]) Object.assign(g.astStatus[station], { xReady: false, uiState: 4 });
    const preferred = machine === 3 ? 2 : 1, park = preferredEnabled ? preferred : 3 - preferred;
    g.astStatus[preferred].xEnabled = preferredEnabled;
    assert.equal(s.plan(), true); assert.equal(s.eState, s.E_CELL_MANAGER_STATE.GEOMETRY_WAIT_FREE);
    assert.equal(s.uiGeometryParkStation, park); s.route();
    assert.equal(s.Command.stRobot.xExecute, true);
    assert.equal(s.Command.stRobot.eSetPoint, s.E_POINT_NAME[`GEOMETRY_${park}_SAFE`]);
    assert.equal(g.astCalls[machine].uiState, 2); assert.equal(g.astCalls[machine].uiStation, 0);
  }
});

test('waiting replans to the source-preferred GK when both become free', () => {
  for (const machine of [1, 2, 3]) {
    const s = heldGeometryFixture(machine), g = s.GVL_GEOMETRY_CONTROL;
    for (const station of [1, 2]) Object.assign(g.astStatus[station], { xReady: false, uiState: 4 });
    s.plan(); s.stRobotStatus.eCurrentPoint = s.E_POINT_NAME[`GEOMETRY_${s.uiGeometryParkStation}_SAFE`];
    for (const station of [1, 2]) Object.assign(g.astStatus[station], { xReady: true, uiState: 1 });
    s.route(); assert.equal(s.eState, s.E_CELL_MANAGER_STATE.PLAN_TARGET);
    assert.equal(s.Command.stRobot.xExecute, undefined); assert.equal(s.plan(), true);
    assert.equal(s.uiGeometryStation, machine === 3 ? 2 : 1);
  }
});

test('waiting uses the other GK when it alone becomes ready', () => {
  for (const machine of [1, 2, 3]) {
    const s = heldGeometryFixture(machine), g = s.GVL_GEOMETRY_CONTROL;
    for (const station of [1, 2]) Object.assign(g.astStatus[station], { xReady: false, uiState: 4 });
    s.plan(); const alternate = machine === 3 ? 1 : 2;
    s.stRobotStatus.eCurrentPoint = s.E_POINT_NAME[`GEOMETRY_${s.uiGeometryParkStation}_SAFE`];
    Object.assign(g.astStatus[alternate], { xReady: true, uiState: 1 });
    s.route(); assert.equal(s.eState, s.E_CELL_MANAGER_STATE.PLAN_TARGET); assert.equal(s.plan(), true);
    assert.equal(s.uiGeometryStation, alternate);
  }
});

test('station priority preserves replanning before entry and recovery after robot interaction', () => {
  for (const machine of [1, 2, 3]) {
    const s = heldGeometryFixture(machine), g = s.GVL_GEOMETRY_CONTROL;
    s.plan(); const first = s.uiGeometryStation, alternate = 3 - first;
    g.astStatus[first].xEnabled = false; s.route();
    assert.equal(s.eState, s.E_CELL_MANAGER_STATE.PLAN_TARGET); assert.equal(g.astSignals[first].xReserve, false);
    assert.equal(g.astCalls[machine].uiState, 2); assert.equal(s.plan(), true); assert.equal(s.uiGeometryStation, alternate);
    g.astStatus[alternate].xReserved = true; g.astSignals[alternate].xRobotInteraction = true;
    g.astStatus[alternate].xError = true; s.route();
    assert.equal(s.eState, s.E_CELL_MANAGER_STATE.ERROR); assert.equal(s.xSafetyHomeRequired, true);
    assert.equal(g.astSignals[alternate].xReserve, true); assert.equal(g.astCalls[machine].uiStation, alternate);
  }
});

test('ready machines are selected in numeric order regardless of call creation order', () => {
  for (const order of [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]) {
    const s = fixture(); pendingCalls(s, order); s.Config.uiTypeCount = 1;
    const ids = s.GVL_GEOMETRY_CONTROL.astCalls.map(call => call?.udiId);
    for (const machine of [1, 2, 3]) {
      s.scan();
      for (const [run, name] of selectors) assert.equal(selected(run, name, s, 0), machine, `${name}: ${order}`);
      assert.equal(take(s, machine), true);
      Object.assign(s.astMachineStatus[machine], { ePartState: 0, ePartType: 0, xCanAcceptService: false, xServiceRequired: false });
    }
    assert.deepEqual(s.events.map(call => call.uiMachine), [1, 2, 3]);
    assert.deepEqual(s.events.map(call => call.udiId), ids.slice(1));
  }
});

test('a ready newer call overtakes an older processing call without changing either ID', () => {
  const s = fixture(); pendingCalls(s, [3, 1, 2]);
  Object.assign(s.astMachineStatus[3], { xProcessing: true, xCanAcceptService: false, xServiceRequired: false,
    ePartType: 1, tRemaining: 60000 });
  const older = structuredClone(s.GVL_GEOMETRY_CONTROL.astCalls[3]);
  s.scan();
  assert.deepEqual(s.axGeometryUnloadBlocked.slice(1), [false, false, false]);
  for (const [run, name] of selectors) assert.equal(selected(run, name, s, 3), 1, name);
  assert.equal(take(s, 1), true); assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[1].udiId, 102);
  assert.deepEqual(s.GVL_GEOMETRY_CONTROL.astCalls[3], older);
  assert.deepEqual(s.events.map(call => [call.uiMachine, call.uiState]), [[1, 2]]);
});

test('processing machines use remaining time and numeric ties regardless of call creation order', () => {
  for (const order of [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]) {
    const s = fixture(); pendingCalls(s, order); s.Config.uiTypeCount = 1;
    for (const machine of [1, 2, 3]) Object.assign(s.astMachineStatus[machine], {
      xProcessing: true, xCanAcceptService: false, xServiceRequired: false,
      ePartType: 1, tRemaining: [0, 60000, 25000, 40000][machine],
    });
    s.scan();
    for (const [run, name] of selectors) assert.equal(selected(run, name, s, 3), 2, `${name}: ${order}`);
    for (const machine of [1, 2, 3]) s.astMachineStatus[machine].tRemaining = 30000;
    for (const [run, name] of selectors) assert.equal(selected(run, name, s, 0), 1, `${name}: equal remaining time`);
    assert.equal(s.events.length, 0);
  }
});

test('two called processing machines keep the faster target and resume when any GK becomes free', () => {
  const s = fixture(); pendingCalls(s, [1, 2]); s.Config.uiTypeCount = 1;
  const g = s.GVL_GEOMETRY_CONTROL, calls = structuredClone(g.astCalls);
  Object.assign(g.astStatus[2], { xEnabled: true, xReady: true, uiState: 1 });
  for (const machine of [1, 2, 3]) Object.assign(s.astMachineStatus[machine], {
    xProcessing: true, xCanAcceptService: false, xServiceRequired: false,
    ePartType: 1, tRemaining: [0, 57000, 25000, 40000][machine],
  });
  s.scan();
  for (const [run, name] of selectors) assert.equal(selected(run, name, s, 3), 2, name);
  g.astStatus[1].xReady = false; g.astStatus[2].xReady = false; s.scan();
  assert.deepEqual(s.axGeometryUnloadBlocked.slice(1), [true, true, false]);
  for (const [run, name] of selectors) assert.equal(selected(run, name, s, 0), 3, name);
  g.astStatus[2].xReady = true; s.scan();
  for (const [run, name] of selectors) assert.equal(selected(run, name, s, 3), 2, name);
  assert.deepEqual(g.astCalls, calls); assert.equal(s.events.length, 0);
});

test('all called machines wait only for GK availability and resume without new requests', () => {
  const s = fixture(); pendingCalls(s, [3, 2, 1]);
  const g = s.GVL_GEOMETRY_CONTROL, calls = structuredClone(g.astCalls);
  g.astStatus[1].xReady = false;
  Object.assign(g.astStatus[2], { xEnabled: true, xReady: false, uiState: 4 }); s.scan();
  assert.deepEqual(s.axGeometryUnloadBlocked.slice(1), [true, true, true]);
  for (const [run, name] of selectors) assert.equal(selected(run, name, s, 0), 0, name);
  g.astStatus[2].xReady = true; s.scan();
  assert.deepEqual(s.axGeometryUnloadBlocked.slice(1), [false, false, false]);
  for (const [run, name] of selectors) assert.equal(selected(run, name, s, 0), 1, name);
  assert.deepEqual(g.astCalls, calls); assert.equal(s.events.length, 0);
});

test('ordinary and called ready machines share eligibility without a wait warning when GK is free', () => {
  const s = fixture(); pendingCalls(s, [1, 3]);
  Object.assign(s.astMachineStatus[1], { xProcessing: true, xCanAcceptService: false, xServiceRequired: false, ePartType: 1 });
  s.scan(); s.scan(600000);
  for (const [run, name] of selectors) assert.equal(selected(run, name, s, 0), 2, name);
  assert.equal(s.IsMachineEligible({ uiMachine: 2 }), true);
  assert.equal(s.IsMachineEligible({ uiMachine: 3 }), true);
  assert.equal(s.axGeometryUnloadBlocked[3], false);
  assert.equal(s.GVL_GEOMETRY_CONTROL.stCellWarning.udiSequence, 0);
  assert.equal(s.atonGeometryWait[3].ET, 0);
  s.astMachineStatus[2].xEnabled = false;
  for (const [run, name] of selectors) assert.equal(selected(run, name, s, 0), 3, name);
});

test('an empty called machine remains loadable while occupied calls wait for a free GK', () => {
  const s = fixture(); pendingCalls(s, [2, 1]);
  s.GVL_GEOMETRY_CONTROL.astStatus[1].xReady = false;
  Object.assign(s.astMachineStatus[2], { ePartState: 0, ePartType: 0, xServiceRequired: false });
  s.astMachineStatus[3].xEnabled = false; s.scan();
  assert.equal(selected(selectBeforeTake, 'SelectMachineBeforeTake', s), 2);
  assert.equal(selected(selectHeldBlank, 'SelectMachineForHeldBlank', s), 2);
  assert.equal(selected(selectUnload, 'SelectMachineForUnload', s), 0);
  assert.equal(s.axGeometryUnloadBlocked[1], true); assert.equal(s.axGeometryUnloadBlocked[2], false);
});

test('an unavailable older call does not block other called machines', () => {
  for (const patch of [{ xEnabled: false }, { xError: true }, { xDisablePending: true }]) {
    const s = fixture(); pendingCalls(s, [2, 1]); Object.assign(s.astMachineStatus[2], patch); s.scan();
    for (const [run, name] of selectors) assert.equal(selected(run, name, s, 0), 1, name);
    assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[2].uiState, 1);
    s.GVL_GEOMETRY_CONTROL.astCalls[2].uiState = 6; s.scan();
    for (const [run, name] of selectors) assert.equal(selected(run, name, s), 1, name);
  }
});

test('repeated forcing preserves call ID and cancellation does not reorder machine selection', () => {
  const source = readPlc('PLC_PRG.RunGeometryControl.st');
  const start = source.indexOf('IF (stGeometryRequest.uiAction = UINT#8)');
  const command = compileSt(source.slice(start, source.indexOf('ELSIF (stGeometryRequest.uiAction = UINT#9)', start)) + '\nEND_IF;');
  const s = fixture(); pendingCalls(s, [2, 3, 1]);
  const g = s.GVL_GEOMETRY_CONTROL; g.astCalls[2].xForced = false;
  g.axCallAllowed = [null, true, true, true]; g.axCancelAllowed = [null, true, true, true];
  Object.assign(s, { stGeometryRequest: { uiAction: 8, uiMachine: 2 }, uiGeometryMachine: 0,
    stGeometryCall: emptyCall(), stGeometryEmptyCall: emptyCall(), GVL_HMI: { uiGeometryResult: 0 },
    GVL_MULTI_TYPE: { Config: s.Config } });
  command(s); command(s); s.scan();
  assert.equal(g.astCalls[2].udiId, 101); assert.equal(g.udiNextCallId, 103);
  assert.equal(g.astCalls[2].xForced, true);
  for (const [run, name] of selectors) assert.equal(selected(run, name, s, 0), 1, name);
  s.stGeometryRequest.uiAction = 12; command(s); s.scan();
  assert.equal(g.astCalls[2].uiState, 6);
  Object.assign(s.astMachineStatus[2], { xProcessing: true, xCanAcceptService: false, xServiceRequired: false, ePartType: 1 });
  s.scan();
  for (const [run, name] of selectors) assert.equal(selected(run, name, s, 0), 1, name);
  s.stGeometryRequest.uiAction = 8; command(s); s.scan();
  assert.equal(g.astCalls[2].udiId, 104);
  for (const [run, name] of selectors) assert.equal(selected(run, name, s, 2), 1, name);
});

test('automatic calls do not prioritize an older forced call', () => {
  const s = fixture(); pendingCalls(s, [3]);
  const g = s.GVL_GEOMETRY_CONTROL; g.xAutoEnabled = true; g.auiActiveCount[1] = 19; g.auiActiveCount[2] = 19;
  s.scan();
  assert.deepEqual(g.astCalls.slice(1).map(call => call.udiId), [102, 103, 101]);
  assert.deepEqual(g.auiActiveCount.slice(1), [19, 19, 0]);
  for (const [run, name] of selectors) assert.equal(selected(run, name, s, 0), 1, name);
  assert.deepEqual(s.events.map(call => call.uiMachine), [1, 2]);
});

test('call ID rollover preserves requests without affecting machine priority', () => {
  const s = fixture(); pendingCalls(s, [3, 1, 2], 0xfffffffe);
  assert.deepEqual(s.GVL_GEOMETRY_CONTROL.astCalls.slice(1).map(call => call.udiId), [0xffffffff, 1, 0xfffffffe]);
  for (const machine of [1, 2, 3]) {
    s.scan();
    for (const [run, name] of selectors) assert.equal(selected(run, name, s, 0), machine, name);
    assert.equal(take(s, machine), true);
    Object.assign(s.astMachineStatus[machine], { ePartState: 0, ePartType: 0, xCanAcceptService: false, xServiceRequired: false });
  }
  assert.deepEqual(s.events.map(call => call.udiId), [0xffffffff, 1, 0xfffffffe]);
});

test('held blank compatibility is preserved without blocking later compatible calls', () => {
  const s = fixture(); pendingCalls(s, [3, 1, 2]);
  s.Config.auiMachineType[3] = 2; s.GVL_GEOMETRY_CONTROL.astCalls[3].uiProductType = 2;
  s.scan();
  assert.equal(selected(selectHeldBlank, 'SelectMachineForHeldBlank', s, 0), 1);
  assert.equal(selected(selectBeforeTake, 'SelectMachineBeforeTake', s), 1);
  assert.equal(selected(selectUnload, 'SelectMachineForUnload', s, 0), 1);
  s.astMachineStatus[1].xEnabled = false; s.astMachineStatus[2].xEnabled = false;
  assert.equal(selected(selectHeldBlank, 'SelectMachineForHeldBlank', s, 0), 0);
  assert.equal(selected(selectBeforeTake, 'SelectMachineBeforeTake', s), 3);
  assert.equal(selected(selectUnload, 'SelectMachineForUnload', s, 0), 3);
});

test('issued service binds its own call even when another machine was called earlier', () => {
  for (const forced of [true, false]) {
    const s = fixture(); pendingCalls(s, [1, 2]);
    const g = s.GVL_GEOMETRY_CONTROL; g.xAutoEnabled = true; g.astCalls[2].xForced = forced; g.auiActiveCount[2] = 19;
    s.astMachineStatus[2].xBusy = true; s.scan();
    assert.equal(s.axGeometryUnloadBlocked[2], false);
    assert.equal(take(s, 2), true); assert.equal(g.astCalls[2].uiState, 2);
    assert.equal(g.astCalls[2].udiId, 102); assert.equal(g.astCalls[1].uiState, 1);
    assert.equal(g.auiActiveCount[2], 0);
    assert.equal(take(s, 1), true);
    assert.deepEqual(s.events.map(call => call.udiId), [102, 101]);
  }
});

test('cadence reached during issued service binds the current detail despite an older call', () => {
  const s = fixture(); pendingCalls(s, [1]);
  const g = s.GVL_GEOMETRY_CONTROL; g.xAutoEnabled = true; g.auiActiveCount[2] = 19;
  s.astMachineStatus[2].xBusy = true; s.scan();
  assert.equal(g.astCalls[2].uiState, 0);
  assert.equal(take(s, 2), true); assert.equal(g.astCalls[2].udiId, 102); assert.equal(g.astCalls[2].uiState, 2);
  assert.equal(g.auiActiveCount[2], 0); assert.equal(g.astCalls[1].uiState, 1);
  assert.equal(take(s, 1), true);
  assert.deepEqual(s.events.map(call => [call.udiId, call.uiState]), [[102, 1], [102, 2], [101, 2]]);
});

test('older calls do not reject CHANGE or UNLOAD while a GK is free', () => {
  const source = readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st');
  const start = source.indexOf('ELSIF NOT xMachineServiceStarted AND NOT astMachineStatus[uiSelectedMachine].xBusy');
  const guard = compileSt(source.slice(start, source.indexOf('ELSIF NOT xMachineServiceStarted\n', start)).replace(/^ELSIF/, 'IF') + '\nEND_IF;');
  const s = fixture(); pendingCalls(s, [1, 2, 3]); s.scan();
  Object.assign(s, { uiSelectedMachine: 3, xMachineServiceStarted: false, eState: 9,
    E_MACHINE_OPERATION: { LOAD: 1, CHANGE: 2, UNLOAD: 3 }, E_CELL_MANAGER_STATE: { SELECT_FALLBACK: 8 } });
  for (const operation of [2, 3]) { s.eMachineOperation = operation; s.eState = 9; guard(s); assert.equal(s.eState, 9); }
  s.eMachineOperation = 1; s.eState = 9; guard(s); assert.equal(s.eState, 9);
  s.eMachineOperation = 2; s.xMachineServiceStarted = true; guard(s); assert.equal(s.eState, 9);
});

test('called detail stays in its machine and every selector can continue with another machine', () => {
  for (const waitWhenOccupied of [true, false]) {
    const s = fixture(); s.GVL_GEOMETRY_CONTROL.xWaitWhenOccupied = waitWhenOccupied;
    Object.assign(s.astMachineStatus[2], { xServiceRequired: true, ePartState: 1, ePartType: 2 });
    s.scan();
    assert.equal(s.axGeometryUnloadBlocked[1], true); assert.equal(s.IsMachineEligible({ uiMachine: 1 }), false);
    assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[1].uiState, 1); assert.equal(s.events.length, 0);
    for (const [run, name] of [[selectBeforeTake, 'SelectMachineBeforeTake'], [selectHeldBlank, 'SelectMachineForHeldBlank'], [selectUnload, 'SelectMachineForUnload']]) {
      assert.equal(selected(run, name, s), 2, name);
    }
    Object.assign(s.GVL_GEOMETRY_CONTROL.astStatus[2], { xEnabled: true, xReady: true, uiState: 1 }); s.scan();
    assert.equal(s.axGeometryUnloadBlocked[1], false);
    assert.equal(selected(selectUnload, 'SelectMachineForUnload', s), 1);
    assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[1].udiId, 44);
  }
});

test('automatic cadence creates one waiting call before unload without counting an unremoved detail', () => {
  const s = fixture(), g = s.GVL_GEOMETRY_CONTROL;
  g.astCalls[1] = emptyCall(); g.xAutoEnabled = true; g.auiActiveCount[1] = 19;
  s.scan(); s.scan(20);
  assert.equal(g.astCalls[1].uiState, 1); assert.equal(g.astCalls[1].xForced, false);
  assert.equal(g.auiActiveCount[1], 19); assert.equal(s.events.length, 1); assert.equal(s.axGeometryUnloadBlocked[1], true);
  const id = g.astCalls[1].udiId;
  Object.assign(g.astStatus[2], { xEnabled: true, xReady: true, uiState: 1 }); s.scan();
  assert.equal(s.axGeometryUnloadBlocked[1], false); assert.equal(g.astCalls[1].udiId, id);
  Object.assign(s, { uiMachine: 1, uiProductType: 1, F_GEOMETRY_TAKE_DETAIL: false }); takeDetail(s);
  assert.equal(s.F_GEOMETRY_TAKE_DETAIL, true); assert.equal(g.auiActiveCount[1], 0);
  assert.equal(g.astCalls[1].uiState, 2); assert.equal(g.astCalls[1].udiId, id); assert.equal(s.events.length, 2);
});

test('pending calls wait for enabled configured healthy GK while empty machines remain loadable', () => {
  for (const reason of [{ xEnabled: false, xReady: true }, { xConfigured: false, xReady: true },
    { xError: true, xReady: true }, { uiState: 5, xReady: true }, { xReady: false }]) {
    const s = fixture(); Object.assign(s.GVL_GEOMETRY_CONTROL.astStatus[1], reason); s.scan();
    assert.equal(s.axGeometryUnloadBlocked[1], true, JSON.stringify(reason));
    s.astMachineStatus[1].ePartState = 0; s.scan();
    assert.equal(s.IsMachineEligible({ uiMachine: 1 }), true);
  }
  const s = fixture(); s.GVL_GEOMETRY_CONTROL.astCalls[1].uiState = 6; s.scan();
  assert.equal(s.axGeometryUnloadBlocked[1], false);
  s.GVL_GEOMETRY_CONTROL.xAutoEnabled = true; s.GVL_GEOMETRY_CONTROL.auiActiveCount[1] = 18; s.scan();
  assert.equal(s.axGeometryUnloadBlocked[1], false); assert.equal(s.events.length, 0);
});

test('ready called detail raises WARNING once after the configured real-time interval and reset restarts it', () => {
  const s = fixture(), g = s.GVL_GEOMETRY_CONTROL;
  s.scan(); s.scan(179999); assert.equal(g.stCellWarning.udiSequence, 0);
  s.scan(1); assert.deepEqual(g.stCellWarning, { uiCode: 52, udiSequence: 1 });
  s.scan(600000); assert.equal(g.stCellWarning.udiSequence, 1);
  s.GVL_ALARM.Command.xResetWarnings = true; s.scan();
  assert.equal(s.atonGeometryWait[1].Q, false); assert.equal(g.stCellWarning.udiSequence, 1);
  s.GVL_ALARM.Command.xResetWarnings = false; s.scan(); s.scan(179999);
  assert.equal(g.stCellWarning.udiSequence, 1); s.scan(1); assert.equal(g.stCellWarning.udiSequence, 2);
  assert.equal(g.astCalls[1].uiState, 1); assert.equal(g.auiActiveCount[1], 0);
});

test('processing, stopped or manual cell, cancelled call, free GK and changed call ID reset the wait timer', () => {
  for (const change of [s => { s.astMachineStatus[1].xProcessing = true; }, s => { s.xRunning = false; },
    s => { s.xManual = true; }, s => { s.xGlobalError = true; }, s => { s.GVL_GEOMETRY_CONTROL.astCalls[1].uiState = 6; },
    s => { s.GVL_GEOMETRY_CONTROL.astStatus[1].xReady = true; }, s => { s.GVL_GEOMETRY_CONTROL.astCalls[1].udiId = 55; }]) {
    const s = fixture(); s.scan(); s.scan(179999); change(s); s.scan(1);
    assert.equal(s.GVL_GEOMETRY_CONTROL.stCellWarning.udiSequence, 0); assert.equal(s.atonGeometryWait[1].ET, 0);
  }
});

test('another machine never inherits the elapsed waiting time of a finished call', () => {
  const s = fixture(), g = s.GVL_GEOMETRY_CONTROL;
  s.scan(); s.scan(179000); g.astCalls[1].uiState = 6;
  g.astCalls[2] = { ...emptyCall(), udiId: 55, uiMachine: 2, uiState: 1 };
  Object.assign(s.astMachineStatus[2], { ePartState: 1, ePartType: 2, xServiceRequired: true }); s.scan(); s.scan();
  s.scan(1000); assert.equal(g.stCellWarning.udiSequence, 0); assert.equal(s.atonGeometryWait[2].ET, 1000);
  s.scan(179000); assert.equal(g.stCellWarning.udiSequence, 1);
});

test('availability is checked again before starting CHANGE or UNLOAD without interrupting an issued recipe', () => {
  const source = readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st');
  const start = source.indexOf('ELSIF NOT xMachineServiceStarted AND NOT astMachineStatus[uiSelectedMachine].xBusy');
  const guard = compileSt(source.slice(start, source.indexOf('ELSIF NOT xMachineServiceStarted\n', start)).replace(/^ELSIF/, 'IF') + '\nEND_IF;');
  const s = fixture(); s.scan();
  Object.assign(s, { uiSelectedMachine: 1, xMachineServiceStarted: false, eState: 9,
    E_MACHINE_OPERATION: { LOAD: 1, CHANGE: 2, UNLOAD: 3 }, E_CELL_MANAGER_STATE: { SELECT_FALLBACK: 8 } });
  for (const operation of [2, 3]) { s.eMachineOperation = operation; s.eState = 9; guard(s); assert.equal(s.eState, 8); }
  for (const patch of [{ eMachineOperation: 1 }, { eMachineOperation: 2, xMachineServiceStarted: true },
    { eMachineOperation: 3, xMachineServiceStarted: false }]) {
    Object.assign(s, patch, { eState: 9 }); s.astMachineStatus[1].xBusy = patch.eMachineOperation === 3;
    guard(s); assert.equal(s.eState, 9);
  }
});

test('conveyor indication follows active cell W52 and stops on warning acknowledgment', () => {
  const source = readPlc('PLC_PRG.PublishGeometryControl.st');
  const publish = compileSt(source.slice(source.indexOf('// Подсветка'), source.indexOf('GVL_HMI.astGeometryConfig')));
  const s = fixture(); s.uiGeometry = 0; s.uiWarningEvent = 0; s.xWaitWarningActive = false;
  s.E_ALARM_SOURCE = { CELL: 0 }; s.E_ALARM_SEVERITY = { WARNING: 1 };
  s.GVL_HMI = { astGeometryStatus: [null, {}, {}] };
  s.GVL_ALARM.Events = [null, ...Array.from({ length: 100 }, () => ({ xActive: false, eSource: 0, eSeverity: 1, uiCode: 0 }))];
  Object.assign(s.GVL_ALARM.Events[1], { xActive: true, uiCode: 52 }); publish(s);
  assert.equal(s.GVL_HMI.astGeometryStatus[1].xCallWaitWarning, true);
  assert.equal(s.GVL_HMI.astGeometryStatus[2].xCallWaitWarning, false);
  s.GVL_GEOMETRY_CONTROL.astStatus[1].xEnabled = false; publish(s);
  assert.equal(s.GVL_HMI.astGeometryStatus[2].xCallWaitWarning, true);
  for (const patch of [{ xActive: false }, { xActive: true, eSeverity: 0 }, { xActive: true, eSeverity: 1, eSource: 1 }]) {
    Object.assign(s.GVL_ALARM.Events[1], patch); publish(s);
    assert.equal(s.GVL_HMI.astGeometryStatus[1].xCallWaitWarning, false);
    assert.equal(s.GVL_HMI.astGeometryStatus[2].xCallWaitWarning, false);
  }
});

test('PLC timer setting accepts 1..3600 seconds only when cell settings are allowed', () => {
  const source = readPlc('PLC_PRG.RunGeometryControl.st');
  const start = source.indexOf('ELSIF (stGeometryRequest.uiAction = UINT#16)');
  const run = compileSt(source.slice(start, source.indexOf('ELSIF (stGeometryRequest.uiStation', start)).replace(/^ELSIF/, 'IF') + '\nEND_IF;');
  for (const value of [999, 1000, 180000, 3600000, 3600001]) for (const allowed of [true, false]) {
    const s = { ...conversions, stGeometryRequest: { uiAction: 16, uiMachine: 5, udiValue: value },
      GVL_GEOMETRY_CONTROL: { xSettingsAllowed: allowed, tWaitWarningTimeout: 180000 }, GVL_HMI: { uiGeometryResult: 2 } };
    run(s); const accepted = allowed && value >= 1000 && value <= 3600000;
    assert.equal(s.GVL_HMI.uiGeometryResult, accepted ? 1 : 2);
    assert.equal(s.GVL_GEOMETRY_CONTROL.tWaitWarningTimeout, accepted ? value : 180000);
  }
});
