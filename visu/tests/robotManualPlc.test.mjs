import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSt, conversions, defaultsFromSt, readPlc } from './helpers/geometryStRuntime.mjs';

// Execute the actual ST permission, dispatch and feedback branches. This limited
// harness does not run FB_ROBOT, movement, OPC UA or a CODESYS scan.
const source = readPlc('PLC_PRG.RunRobot.st');
function section(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Missing ST section: ${start}`);
  return source.slice(first, last);
}
const attempt = compileSt(source.match(/xHmiRobotActionAttempt :=[^;]+;/)[0]);
const dispatch = compileSt(section('xHmiRobotActionBaseAllowed :=', '// Общая ошибка запрещает'));
const feedback = compileSt(section('xHmiRobotStatusPointTargetAllowed :=', 'IF uiRobotInterfaceWarningCode'));
function enumeration(file) {
  const names = readPlc(file).replace(/\/\/[^\r\n]*/g, '').split('(')[1].split(')')[0].split(',').map(name => name.trim());
  return Object.fromEntries(names.map((name, value) => [name, value]));
}
const enums = {
  E_POINT_NAME: enumeration('ST/ST_POINT/E_POINT_NAME.st'),
  E_ROBOT_ACTION: enumeration('ST/ST_ROBOT/E_ROBOT_ACTION.st'),
  E_GRIPPER_STATE: enumeration('ST/ST_GRIPPER/E_GRIPPER_STATE.st'),
  E_HMI_MANUAL_REJECT: enumeration('ST/ST_HMI/E_HMI_MANUAL_REJECT.st'),
};
function state(point, magazine = 1, slot = 1) {
  return {
    ...defaultsFromSt(readPlc('PLC_PRG.st')), ...conversions, ...enums,
    WRN_HMI_MANUAL_REJECTED: 12,
    xRobotHmiPermit: true, xHmiConnectionAlive: true,
    xDrivesReady: true, xDrivesPowered: true,
    eHmiRobotStatusAction: enums.E_ROBOT_ACTION.MOVE_TO_POINT,
    eHmiRobotStatusPoint: enums.E_POINT_NAME[point],
    stRobotHmiCommand: { xExecute: false, eAction: enums.E_ROBOT_ACTION.MOVE_TO_POINT,
      eSetPoint: enums.E_POINT_NAME[point], iActiveSlot: slot, uiMagazineId: magazine },
    GVL_HMI: { xModbusMode: false, xRobotManualExecute: false, stRobotCommand: { xExecute: false },
      uiRobotManualSlot: slot, uiRobotManualMagazine: magazine, stRobotHmiStatus: {} },
    GVL_CELL_CONTROL: { xGlobalError: false },
    GVL_CELL_SETTINGS: { MagazineRows: 12, MagazineColumns: 10 },
    GVL_ROBOT: { Status: { xBusy: false, xError: false },
      GripperError: { dwAlarmActive: 0 }, GripperDiag: { eState: enums.E_GRIPPER_STATE.IDLE },
      Diag: { eActiveAction: 0, eActivePoint: 0, stWarning: { uiCode: 0, udiSequence: 0 } } },
    GVL_ROBOT_MODBUS: { Status: { xReady: true } },
    GVL_POINT_MANAGER: { PointManager: { Diag: { xXLimitValid: true, xYLimitValid: true, xZLimitValid: true } } },
    GVL_MACHINE: { Status: [null, ...[1, 2, 3].map(() => ({ stIo: { xDoorOpen: false, xDoorClosed: true } }))] },
    GVL_TWO_PALLET: { uiMode: 1, astStatus: [null, { xReady: false }, { xReady: false }] },
    GVL_GEOMETRY_CONTROL: { xSupported: true, astStatus: [null, { xConfigured: false }, { xConfigured: false }] },
    GEOMETRY: [null, { xRunOutput: false }, { xRunOutput: false }],
    axTwinMagazineExchangeInProgress: [null, false, false],
    rtHmiRobotAction: { Q: false }, previousAttempt: false,
  };
}
function scan(s, execute = false, legacy = false) {
  s.GVL_HMI.xRobotManualExecute = execute && !legacy;
  s.GVL_HMI.stRobotCommand.xExecute = execute && legacy;
  s.stRobotHmiCommand.xExecute = execute && legacy;
  attempt(s);
  dispatch(s);
  // Stub only the standard R_TRIG; permission and warning logic come from ST.
  s.rtHmiRobotAction.Q = s.xHmiRobotActionAttempt && !s.previousAttempt;
  s.previousAttempt = s.xHmiRobotActionAttempt;
  feedback(s);
}
function rejectAndRearm(s, legacy = false) {
  const warningSeq = s.GVL_ROBOT.Diag.stWarning.udiSequence;
  scan(s, true, legacy);
  assert.equal(s.stRobotHmiCommand.xExecute, false, 'unsafe command must not reach FB_ROBOT');
  assert.equal(s.GVL_ROBOT.Diag.stWarning.uiCode, 12);
  assert.equal(s.GVL_ROBOT.Diag.stWarning.udiSequence, warningSeq + 1);
  // Keep the same target and its blocking condition through several idle scans.
  for (let i = 0; i < 5; i++) {
    scan(s);
    assert.equal(s.GVL_HMI.stRobotHmiStatus.xPointsAllowed, true, 'last rejected target must not latch the button');
    assert.equal(s.GVL_HMI.stRobotHmiStatus.eRejectReason, enums.E_HMI_MANUAL_REJECT.NONE);
    assert.equal(s.stRobotHmiCommand.xExecute, false, 'an idle scan must not retry the rejected request');
    assert.equal(s.GVL_ROBOT.Diag.stWarning.udiSequence, warningSeq + 1);
  }
}

test('closed hatches reject all machine entry targets and rearm numeric and legacy requests', () => {
  for (const modbus of [false, true]) for (const legacy of [false, true]) {
    for (const machine of [1, 2, 3]) for (const target of ['INSIDE', 'CHUCK_APROACH', 'CHUCK_POSITION']) {
      // INSIDE is retained only in the typed legacy channel.
      if (target === 'INSIDE' && !legacy) continue;
      const s = state(`MACHINE_${machine}_${target}`);
      s.GVL_HMI.xModbusMode = modbus;
      rejectAndRearm(s, legacy);
      rejectAndRearm(s, legacy);
      assert.equal(s.GVL_ROBOT.Diag.stWarning.udiSequence, 2);
    }
  }
});

test('opening the hatch accepts the same target without a different move or warning reset', () => {
  for (const machine of [1, 2, 3]) {
    const s = state(`MACHINE_${machine}_CHUCK_POSITION`);
    rejectAndRearm(s);
    Object.assign(s.GVL_MACHINE.Status[machine].stIo, { xDoorOpen: true, xDoorClosed: false });
    scan(s, true);
    assert.equal(s.stRobotHmiCommand.xExecute, true);
    assert.equal(s.GVL_HMI.stRobotHmiStatus.xPointsAllowed, true);
    assert.equal(s.GVL_ROBOT.Diag.stWarning.udiSequence, 1, 'acceptance must not require clearing W12');
  }
});

test('all three targets in either unready two-pallet magazine reject and rearm', () => {
  for (const magazine of [1, 2]) for (const point of ['MAGAZINE_SAFE', 'MAGAZINE_IN_SLOT', 'MAGAZINE_CHANGE']) {
    const s = state(point, magazine);
    rejectAndRearm(s);
    rejectAndRearm(s);
    s.GVL_TWO_PALLET.astStatus[magazine].xReady = true;
    scan(s, true);
    assert.equal(s.stRobotHmiCommand.xExecute, true);
    assert.equal(s.GVL_ROBOT.Diag.stWarning.udiSequence, 2);
  }
});

test('magazine exchange and Modbus restrictions still reject new requests after the button rearms', () => {
  for (const magazine of [1, 2]) for (const modbus of [false, true]) {
    const s = state('MAGAZINE_SAFE', magazine);
    s.GVL_TWO_PALLET.astStatus[magazine].xReady = true;
    if (modbus) s.GVL_HMI.xModbusMode = true;
    else s.axTwinMagazineExchangeInProgress[magazine] = true;
    rejectAndRearm(s);
    rejectAndRearm(s);
  }
});

test('invalid magazine or slot rejects the transaction without latching point availability', () => {
  for (const [magazine, slot] of [[0, 1], [3, 1], [1, 0], [1, 121]]) {
    const s = state('MAGAZINE_IN_SLOT', magazine, slot);
    s.GVL_TWO_PALLET.uiMode = 0;
    rejectAndRearm(s);
  }
});

test('real base restrictions keep the button unavailable after rejection and release only when removed', () => {
  const restrictions = [
    s => { s.xRobotHmiPermit = false; },
    s => { s.xHmiConnectionAlive = false; },
    s => { s.xPointCheckActive = true; },
    s => { s.GVL_CELL_CONTROL.xGlobalError = true; },
    s => { s.GVL_ROBOT.Status.xBusy = true; },
    s => { s.GVL_ROBOT.Status.xError = true; },
    s => { s.xDrivesReady = false; },
    s => { s.xMotionBusy = true; },
    s => { s.xDriveError = true; },
    s => { s.GVL_POINT_MANAGER.PointManager.Diag.xXLimitValid = false; },
    s => { s.GVL_HMI.xModbusMode = true; s.GVL_ROBOT_MODBUS.Status.xReady = false; },
  ];
  for (const restrict of restrictions) {
    const s = state('MACHINE_1_ABOVE');
    const release = state('MACHINE_1_ABOVE');
    restrict(s);
    scan(s, true);
    assert.equal(s.stRobotHmiCommand.xExecute, false);
    scan(s);
    assert.equal(s.GVL_HMI.stRobotHmiStatus.xPointsAllowed, false);
    Object.assign(s, release);
    scan(s);
    assert.equal(s.GVL_HMI.stRobotHmiStatus.xPointsAllowed, true);
  }
});
