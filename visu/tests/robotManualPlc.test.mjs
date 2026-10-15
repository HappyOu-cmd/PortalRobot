import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSt, conversions, defaultsFromSt, readPlc } from './helpers/geometryStRuntime.mjs';

// Execute actual ST permission, dispatch, feedback and FB_ROBOT command selection.
// This limited harness does not run movement, OPC UA or a complete CODESYS scan.
const source = readPlc('PLC_PRG.RunRobot.st');
function section(start, end, text = source) {
  const first = text.indexOf(start), last = text.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Missing ST section: ${start}`);
  return text.slice(first, last);
}
const attempt = compileSt(source.match(/xHmiRobotActionAttempt :=[^;]+;/)[0]);
const dispatch = compileSt(section('xHmiRobotActionBaseAllowed :=', '// Общая ошибка запрещает'));
const feedback = compileSt(section('xHmiRobotStatusPointTargetAllowed :=', 'IF uiRobotInterfaceWarningCode'));
const selectCommand = compileSt(section('IF NOT xManual THEN', '// Внешний Stop', readPlc('FB/FB_ROBOT.st')));
const pointCheckPermission = compileSt(section('FOR uiPointCheckLoop :=', 'IF xPointCheckRequest THEN'));
const pointCheckDispatch = compileSt(section('IF xPointCheckRequest THEN', '// Потеря разрешений во время проверки'));
const pointCheckRun = compileSt(section('IF xPointCheckActive THEN', '\nROBOT('));
function enumeration(file) {
  const names = readPlc(file).replace(/\/\/[^\r\n]*/g, '').split('(')[1].split(')')[0].split(',').map(name => name.trim());
  return Object.fromEntries(names.map((name, value) => [name, value]));
}
const enums = {
  E_POINT_NAME: enumeration('ST/ST_POINT/E_POINT_NAME.st'),
  E_ROBOT_ACTION: enumeration('ST/ST_ROBOT/E_ROBOT_ACTION.st'),
  E_ROBOT_STATE: enumeration('ST/ST_ROBOT/E_ROBOT_STATE.st'),
  E_MOTION_MANAGER_STATE: enumeration('ST/ST_MOTION_MANAGER/E_MOTION_MANAGER_STATE.st'),
  E_GRIPPER_STATE: enumeration('ST/ST_GRIPPER/E_GRIPPER_STATE.st'),
  E_HMI_MANUAL_REJECT: enumeration('ST/ST_HMI/E_HMI_MANUAL_REJECT.st'),
};
function state(point, magazine = 1, slot = 1) {
  return {
    ...defaultsFromSt(readPlc('PLC_PRG.st')), ...conversions, ...enums,
    WRN_HMI_MANUAL_REJECTED: 12, WRN_POINT_CHECK_REJECTED: 16, WRN_POINT_CHECK_INTERRUPTED: 17,
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
      Diag: { eState: enums.E_ROBOT_STATE.IDLE, eActiveAction: 0, eActivePoint: 0, stWarning: { uiCode: 0, udiSequence: 0 } } },
    GVL_MOTION_MANAGER: { stMotionManager: { Diag: { eState: enums.E_MOTION_MANAGER_STATE.IDLE } } },
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

test('all manual magazine targets ignore readiness and exchange in both modes and interfaces', () => {
  for (const mode of [0, 1]) for (const modbus of [false, true]) for (const legacy of [false, true]) {
    for (const magazine of [1, 2]) for (const point of ['MAGAZINE_SAFE', 'MAGAZINE_IN_SLOT', 'MAGAZINE_CHANGE']) {
      const s = state(point, magazine);
      s.GVL_TWO_PALLET.uiMode = mode;
      s.GVL_HMI.xModbusMode = modbus;
      Object.assign(s.GVL_TWO_PALLET.astStatus[magazine], {
        xReady: false, xEnabled: false, xConfirmed: false, xBusy: true, xError: true,
      });
      s.axTwinMagazineExchangeInProgress[magazine] = true;
      scan(s, true, legacy);
      assert.equal(s.stRobotHmiCommand.xExecute, true);
      assert.equal(s.GVL_HMI.stRobotHmiStatus.xPointsAllowed, true);
      assert.equal(s.GVL_HMI.stRobotHmiStatus.eRejectReason, enums.E_HMI_MANUAL_REJECT.NONE);
      assert.equal(s.GVL_ROBOT.Diag.stWarning.udiSequence, 0);
    }
  }
});

test('all manual GK targets ignore station health, conveyor outputs and configuration', () => {
  for (const modbus of [false, true]) for (const legacy of [false, true]) {
    for (const station of [1, 2]) for (const target of ['SAFE', 'CHANGE', 'PLACE']) {
      const s = state(`GEOMETRY_${station}_${target}`);
      s.GVL_HMI.xModbusMode = modbus;
      s.GVL_GEOMETRY_CONTROL.xSupported = false;
      Object.assign(s.GVL_GEOMETRY_CONTROL.astStatus[station], {
        xConfigured: false, xEnabled: true, xDriveRunning: true, xResetBusy: true,
        xError: true, xOccupied: true, xReserved: true,
      });
      s.GEOMETRY[station].xRunOutput = true;
      scan(s, true, legacy);
      assert.equal(s.stRobotHmiCommand.xExecute, true);
      assert.equal(s.GVL_HMI.stRobotHmiStatus.xPointsAllowed, true);
      assert.equal(s.GVL_HMI.stRobotHmiStatus.eRejectReason, enums.E_HMI_MANUAL_REJECT.NONE);
      assert.equal(s.GVL_ROBOT.Diag.stWarning.udiSequence, 0);
    }
  }
});

test('machine readiness never blocks manual targets; only entry requires an open hatch', () => {
  for (const modbus of [false, true]) for (const legacy of [false, true]) {
    for (const machine of [1, 2, 3]) for (const target of ['ABOVE', 'INSIDE', 'CHUCK_APROACH', 'CHUCK_POSITION']) {
      if (target === 'INSIDE' && !legacy) continue;
      const s = state(`MACHINE_${machine}_${target}`);
      s.GVL_HMI.xModbusMode = modbus;
      Object.assign(s.GVL_MACHINE.Status[machine], { xReady: false, xEnabled: false, xBusy: true, xError: true });
      if (target !== 'ABOVE') Object.assign(s.GVL_MACHINE.Status[machine].stIo, { xDoorOpen: true, xDoorClosed: false });
      scan(s, true, legacy);
      assert.equal(s.stRobotHmiCommand.xExecute, true);
      assert.equal(s.GVL_HMI.stRobotHmiStatus.xPointsAllowed, true);
      assert.equal(s.GVL_ROBOT.Diag.stWarning.udiSequence, 0);
    }
  }
});

test('unknown or contradictory hatches still reject machine entry', () => {
  for (const machine of [1, 2, 3]) for (const [open, closed] of [[false, false], [true, true]]) {
    const s = state(`MACHINE_${machine}_CHUCK_POSITION`);
    Object.assign(s.GVL_MACHINE.Status[machine].stIo, { xDoorOpen: open, xDoorClosed: closed });
    rejectAndRearm(s);
  }
});

test('FB_ROBOT exchange interlock bypasses HMI only and preserves automatic magazine ownership', () => {
  for (const modbus of [false, true]) for (const magazine of [1, 2]) for (const exchanging of [1, 2]) {
    for (const point of ['MAGAZINE_SAFE', 'MAGAZINE_IN_SLOT', 'MAGAZINE_CHANGE']) {
      for (const owner of ['hmi', 'magazine', 'cell', 'machine-1', 'machine-2', 'machine-3']) {
        const command = { xExecute: false, xStop: false, eAction: enums.E_ROBOT_ACTION.MOVE_TO_POINT,
          eSetPoint: enums.E_POINT_NAME[point], uiMagazineId: magazine, iActiveSlot: 1 };
        const s = { ...enums, xManual: owner === 'hmi' || owner === 'magazine', xMode: modbus,
          eState: enums.E_ROBOT_STATE.IDLE, xMagazineCommandActive: false, xMagazineTargetInhibit: false,
          xExternalCommandInhibit: false, xTestAbort: false,
          axMagazineExchangeInProgress: [null, exchanging === 1, exchanging === 2], Command: { ...command },
          stHmiCommand: { ...command, xExecute: owner === 'hmi' },
          stMagazineCommand: { ...command, xExecute: owner === 'magazine' },
          stCellCommand: { ...command, xExecute: owner === 'cell' },
          stMachine_1_Command: { ...command, xExecute: owner === 'machine-1' },
          stMachine_2_Command: { ...command, xExecute: owner === 'machine-2' },
          stMachine_3_Command: { ...command, xExecute: owner === 'machine-3' },
        };
        selectCommand(s);
        const blocked = owner !== 'hmi' && magazine === exchanging;
        assert.equal(s.Command.xExecute, !blocked, `${owner}, target=${magazine}, exchange=${exchanging}`);
        assert.equal(s.xMagazineTargetInhibit, blocked);
        assert.equal(s.Command.xStop, false);
      }
    }
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

test('a new manual move or gripper request in DONE is rejected once and can be retried only after IDLE', () => {
  for (const modbus of [false, true]) for (const legacy of [false, true]) for (const gripper of [false, true]) {
    const s = state('MACHINE_1_ABOVE'); s.GVL_HMI.xModbusMode = modbus;
    s.GVL_ROBOT.Diag.eState = enums.E_ROBOT_STATE.DONE;
    if (gripper) { s.stRobotHmiCommand.eAction = enums.E_ROBOT_ACTION.CLAMP_1; s.eHmiRobotStatusAction = s.stRobotHmiCommand.eAction; }
    scan(s, true, legacy);
    assert.equal(s.stRobotHmiCommand.xExecute, false);
    assert.equal(s.GVL_ROBOT.Diag.stWarning.uiCode, 12);
    assert.equal(s.GVL_HMI.stRobotHmiStatus.xCommandBusy, true);
    assert.equal(s.GVL_HMI.stRobotHmiStatus.eRejectReason, enums.E_HMI_MANUAL_REJECT.ROBOT_BUSY);
    s.GVL_ROBOT.Diag.eState = enums.E_ROBOT_STATE.IDLE; scan(s);
    assert.equal(s.stRobotHmiCommand.xExecute, false, 'a rejected pulse cannot replay');
    scan(s, true, legacy); assert.equal(s.stRobotHmiCommand.xExecute, true);
  }
});

test('pending motion release blocks a new move but an independent healthy gripper remains available in robot ERROR', () => {
  const s = state('MACHINE_1_ABOVE');
  s.GVL_MOTION_MANAGER.stMotionManager.Diag.eState = enums.E_MOTION_MANAGER_STATE.DONE;
  scan(s, true); assert.equal(s.stRobotHmiCommand.xExecute, false);
  s.GVL_ROBOT.Diag.eState = enums.E_ROBOT_STATE.ERROR; s.GVL_ROBOT.Status.xError = true;
  s.stRobotHmiCommand.eAction = enums.E_ROBOT_ACTION.CLAMP_1; s.eHmiRobotStatusAction = s.stRobotHmiCommand.eAction;
  scan(s); scan(s, true); assert.equal(s.stRobotHmiCommand.xExecute, true);
});

function pointCheckState(index) {
  const s = state('HOME_SAFETY');
  const names = ['MACHINE_1_ABOVE', 'MACHINE_1_CHUCK_APROACH', 'MACHINE_1_CHUCK_POSITION',
    'MACHINE_2_ABOVE', 'MACHINE_2_CHUCK_APROACH', 'MACHINE_2_CHUCK_POSITION',
    'MACHINE_3_ABOVE', 'MACHINE_3_CHUCK_APROACH', 'MACHINE_3_CHUCK_POSITION',
    'HOME_SAFETY', 'MAGAZINE_1_DETAIL', 'MAGAZINE_2_DETAIL', 'GEOMETRY_1_PLACE', 'GEOMETRY_2_PLACE'];
  Object.assign(s, { INT_TO_UINT: Number, xPointEditorAllHomed: true, xPointCheckConnectionAlive: true,
    aePointCheckNames: [null, ...names.map(name => enums.E_POINT_NAME[name])],
    alrRobotSoftwareMinPosition: [null, -1000, -1000, -1000], alrRobotSoftwareMaxPosition: [null, 1000, 1000, 1000],
    stSelectedMagazineCommand: { xExecute: false, xStop: false },
    GVL_CELL_MANAGER: { Status: { xRunning: false }, Command: { stRobot: { xExecute: false, xStop: false } } },
    GVL_AXIS_GROUP: { AxisGroup: { Status: { xPositionValid: true } } },
    GVL_MOTION_MANAGER: { stMotionManager: { Status: { xError: false }, Diag: { eState: enums.E_MOTION_MANAGER_STATE.IDLE } } },
    GVL_POINT: { iEditablePointCount: 14, Points: Array.from({ length: 30 }, () => ({
      X: 100, Y: 200, Z: 300, SpeedFactor: .2, xConfigured: true,
    })) },
  });
  s.GVL_CELL_CONTROL.xManual = true;
  Object.assign(s.GVL_CELL_CONTROL, { xStart: false, xStop: false, xDisable: false });
  s.GVL_CELL_SETTINGS.rPointCheckSpeedPercent = 10;
  s.GVL_MACHINE.Command = [null, ...[1, 2, 3].map(() => ({ stRobot: { xExecute: false, xStop: false } }))];
  Object.assign(s.GVL_HMI, { uiPointEditorIndex: index, udiPointEditorCommandSeq: 9,
    xRobotStop: false, xRobotReset: false,
    axPointCheckAllowed: Array(15).fill(false), auiPointCheckRejectReason: Array(15).fill(0) });
  s.ePointEditorName = s.aePointCheckNames[index];
  return s;
}

test('point checking starts and continues at magazine and GK bases independently of equipment state', () => {
  for (const index of [11, 12, 13, 14]) {
    const s = pointCheckState(index);
    s.GVL_GEOMETRY_CONTROL.xSupported = false;
    for (const station of [1, 2]) Object.assign(s.GVL_GEOMETRY_CONTROL.astStatus[station], {
      xConfigAllowed: false, xConfigured: false, xEnabled: true, xDriveRunning: true,
      xError: true, xResetBusy: true, xOccupied: true, xReserved: true,
    });
    s.axTwinMagazineExchangeInProgress = [null, true, true];
    pointCheckPermission(s);
    assert.equal(s.GVL_HMI.axPointCheckAllowed[index], true);
    assert.equal(s.GVL_HMI.auiPointCheckRejectReason[index], 0);
    s.xPointCheckRequest = true;
    pointCheckDispatch(s);
    assert.equal(s.xPointCheckActive, true);
    assert.equal(s.GVL_HMI.uiPointEditorResult, 1);
    assert.equal(s.stRobotHmiCommand.eSetPoint, s.aePointCheckNames[index]);
    s.xIoManualActive = true;
    pointCheckRun(s);
    assert.equal(s.xPointCheckStopRequest, false);
    assert.equal(s.xPointCheckStopping, false);
    assert.equal(s.stRobotHmiCommand.xExecute, true);
    assert.equal(s.uiRobotInterfaceWarningCode, 0);
  }
});

test('point checking retains hatch permission and stops when an entry hatch closes', () => {
  for (const index of [2, 3, 5, 6, 8, 9]) {
    const s = pointCheckState(index), machine = Math.floor((index - 1) / 3) + 1;
    pointCheckPermission(s);
    assert.equal(s.GVL_HMI.auiPointCheckRejectReason[index], 18);
    Object.assign(s.GVL_MACHINE.Status[machine].stIo, { xDoorOpen: true, xDoorClosed: false });
    pointCheckPermission(s);
    assert.equal(s.GVL_HMI.axPointCheckAllowed[index], true);
    s.xPointCheckRequest = true;
    pointCheckDispatch(s);
    Object.assign(s.GVL_MACHINE.Status[machine].stIo, { xDoorOpen: false, xDoorClosed: true });
    pointCheckRun(s);
    assert.equal(s.xPointCheckStopping, true);
    assert.equal(s.stRobotHmiCommand.xExecute, false);
    assert.equal(s.stRobotHmiCommand.xStop, true);
    assert.equal(s.uiRobotInterfaceWarningCode, 17);
  }
  for (const index of [1, 4, 7]) {
    const s = pointCheckState(index);
    pointCheckPermission(s);
    assert.equal(s.GVL_HMI.axPointCheckAllowed[index], true, 'above-machine points do not require an open hatch');
  }
});

test('point checking keeps robot readiness, coordinate validation and command ownership restrictions', () => {
  const restrictions = [
    [s => { s.xHmiConnectionAlive = false; }, 3],
    [s => { s.GVL_CELL_CONTROL.xManual = false; }, 4],
    [s => { s.GVL_HMI.xModbusMode = true; }, 5],
    [s => { s.GVL_CELL_MANAGER.Status.xRunning = true; }, 6],
    [s => { s.GVL_CELL_CONTROL.xGlobalError = true; }, 7],
    [s => { s.GVL_ROBOT.Status.xBusy = true; }, 8],
    [s => { s.GVL_ROBOT.Diag.eState = enums.E_ROBOT_STATE.DONE; }, 8],
    [s => { s.xMotionBusy = true; }, 9],
    [s => { s.GVL_MOTION_MANAGER.stMotionManager.Diag.eState = enums.E_MOTION_MANAGER_STATE.DONE; }, 9],
    [s => { s.xDriveError = true; }, 10],
    [s => { s.xPointEditorAllHomed = false; }, 11],
    [s => { s.GVL_AXIS_GROUP.AxisGroup.Status.xPositionValid = false; }, 12],
    [s => { s.GVL_POINT_MANAGER.PointManager.Diag.xXLimitValid = false; }, 13],
    [s => { s.GVL_POINT.Points[s.ePointEditorName].X = 1001; }, 14],
    [s => { s.GVL_POINT.Points[s.ePointEditorName].SpeedFactor = 0; }, 15],
    [s => { s.GVL_POINT.Points[s.ePointEditorName].xConfigured = false; }, 16],
    [s => { s.xDrivesReady = false; }, 17],
    [s => { s.xPointCheckConnectionAlive = false; }, 19],
    [s => { s.stSelectedMagazineCommand.xExecute = true; }, 20],
  ];
  for (const [restrict, reason] of restrictions) {
    const s = pointCheckState(13);
    restrict(s);
    pointCheckPermission(s);
    assert.equal(s.GVL_HMI.axPointCheckAllowed[13], false);
    assert.equal(s.GVL_HMI.auiPointCheckRejectReason[13], reason);
  }
});
