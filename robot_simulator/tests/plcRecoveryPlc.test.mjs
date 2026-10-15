// Execute current ST across scans. Only transport, R_TRIG and TON are simulated;
// no CODESYS, physical I/O, gateway or working databases are accessed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { compileSt, conversions, defaultsFromSt, readPlc, ton } from '../../visu/tests/helpers/geometryStRuntime.mjs';

function between(source, from, to) {
  const a = source.indexOf(from), b = source.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, from);
  return source.slice(a, b);
}
function body(source, label) {
  const match = source.match(new RegExp(`\\n(?:\\t| {4})${label.replaceAll('.', '\\.')}:[^\\n]*`));
  assert.ok(match, label);
  const tail = source.slice(match.index + match[0].length);
  return tail.slice(0, tail.search(/\n(?:\t| {4})E_\w+\.\w+[:,]|\nEND_CASE;/));
}
function compile(source) {
  const calls = [...new Set(source.match(/\b(?:fb\w+|rt\w+|UpdateErrorView)\b/g) ?? [])];
  let prepared = source.replace(/\b(?:UINT|DWORD)#16#([\da-f_]+)/gi, (_, n) => String(parseInt(n.replaceAll('_', ''), 16)))
    .replace(/END_(IF|CASE)(?!\w)\s*;?/g, 'END_$1;')
    .replace(/\bBYTE#(\d+)/g, '$1')
    .replace(/\b(Status\.ui\w+)\s+AND\s+(\w+)/g, '$1 & $2')
    .replace(/\b(Error\.dw\w+)\s+AND\s+(\w+)/g, '$1 & $2');
  for (const name of calls) prepared = prepared.replaceAll(new RegExp(`\\b${name}\\b`, 'g'), `F_GEOMETRY_${name}`);
  const execute = compileSt(prepared);
  return s => { for (const name of calls) s[`F_GEOMETRY_${name}`] = s[name]; execute(s); };
}
function enumeration(file) {
  const text = readPlc(file).replace(/\/\/[^\r\n]*/g, '');
  let value = -1;
  return Object.fromEntries(text.slice(text.indexOf('(') + 1, text.indexOf(')')).split(',').map(entry => {
    const [name, literal] = entry.trim().split(/\s*:=\s*/);
    value = literal === undefined ? value + 1 : Number(literal.replace(/^\w+#/, ''));
    return [name, value];
  }));
}
const enums = Object.fromEntries([
  ['E_ROBOT_STATE', 'ST_ROBOT'], ['E_ROBOT_ACTION', 'ST_ROBOT'], ['E_POINT_NAME', 'ST_POINT'],
  ['E_MOTION_MANAGER_STATE', 'ST_MOTION_MANAGER'], ['E_POINT_MANAGER_STATE', 'ST_POINT_MANAGER'],
  ['E_AXIS_GROUP_STATE', 'ST_AXIS_GROUP'], ['E_MACHINE_STATE', 'ST_MACHINE'],
  ['E_MACHINE_OPERATION', 'ST_MACHINE'], ['E_MAGAZINE_STATE', 'ST_MAGAZINE'],
  ['E_MAGAZINE_OPERATION', 'ST_MAGAZINE'], ['E_CELL_MANAGER_STATE', 'ST_CELL'],
  ['E_ROBOT_MODBUS_CLIENT_STATE', 'ST_ROBOT'], ['E_ROBOT_MODBUS_EXECUTION_STATE', 'ST_ROBOT'],
  ['E_GRIPPER_STATE', 'ST_GRIPPER'],
].map(([name, folder]) => [name, enumeration(`ST/${folder}/${name}.st`)]));
function constants(source) {
  const block = source.match(/VAR CONSTANT([\s\S]*?)END_VAR/)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/(\w+)\s*:\s*\w+\s*:=\s*((?:\w+#)?16#[\da-f_]+|(?:\w+#)?\d+|T#\d+(?:MS|S))(?:\s*;)/gi)]
    .map(([, name, literal]) => [name, literal.includes('16#') ? parseInt(literal.split('16#')[1].replaceAll('_', ''), 16)
      : literal.startsWith('T#') ? Number(literal.match(/\d+/)[0]) * (literal.endsWith('MS') ? 1 : 1000)
      : Number(literal.replace(/^\w+#/, ''))]));
}
function trigger() {
  let previous = false;
  const fn = ({ CLK }) => { fn.Q = Boolean(CLK) && !previous; previous = Boolean(CLK); };
  fn.Q = false; return fn;
}
function defaults(source) {
  const declarations = source.replace(/\bLREAL\b/g, 'REAL').replace(/\b(?:SINT|INT|BYTE)\b/g, 'UINT');
  return { ...conversions, ...enums, ...constants(source), ...defaultsFromSt(declarations),
    ...defaultsFromSt(declarations, 'VAR_INPUT'), ...defaultsFromSt(declarations, 'VAR_OUTPUT'), now: 0,
    TO_UDINT: Number, TO_INT: Number, UINT_TO_DWORD: Number, DWORD_TO_DINT: v => v | 0,
    DINT_TO_LREAL: Number, LIMIT: (lo, n, hi) => Math.max(lo, Math.min(n, hi)), ADR: v => v,
    SHL: (a, n) => (a << n) >>> 0, UpdateErrorView: ({ dwError }) => ({ dwError }) };
}

const machine = readPlc('FB/FB_MACHINE.st');
const closeDoor = compile(body(machine, 'E_MACHINE_STATE.DOOR_CLOSE'));
test('closed hatch without lock confirmation times out; a locked hatch completes even on the limit scan', () => {
  for (const operator of [false, true]) for (const locked of [false, true]) {
    const s = { ...defaults(machine), eState: enums.E_MACHINE_STATE.DOOR_CLOSE,
      xOperatorClosingDoor: operator, xRobotDone: true, xRobotInsideMachine: false,
      stMachineStatus: { xDoorClosed: true, xHatchLocked: locked, xAlarm: false },
      stRobotStatus: { xBusy: false }, tonDoorCloseTimeout: { Q: true }, Error: { dwErrorActive: 0 }, Command: { stRobot: {} } };
    closeDoor(s);
    assert.equal(s.eState, locked ? (operator ? enums.E_MACHINE_STATE.OPERATOR_CHOICE_RUN : enums.E_MACHINE_STATE.NEXT) : enums.E_MACHINE_STATE.ERROR);
    assert.equal(s.Error.dwErrorActive, locked ? 0 : s.ERR_TIMEOUT_DOOR_CLOSE);
    assert.equal(s.xServiceDoorCloseDemand, false);
  }
});
test('manual hatch recovery drives unlock and open in ERROR and still requires an explicit Reset', () => {
  const permissions = compile(between(machine, 'xManualControlAllowed :=', 'xRobotResetDependencyReady :='));
  const requests = compile(between(machine, 'Command.stIo.xOpenDoor := FALSE;', 'Command.stRobot.eAction := E_ROBOT_ACTION.NONE;'));
  const outputs = compile(between(machine, 'IF ((eState <> E_MACHINE_STATE.ERROR)', '// Замок нельзя'));
  const s = { ...defaults(machine), eState: enums.E_MACHINE_STATE.ERROR, xManualMode: true,
    Error: { dwErrorActive: 8192 }, xSafetyDoorSafe: true, xRobotInsideMachine: true,
    stMachineStatus: { xDoorClosed: true, xDoorOpen: false, xHatchLocked: true, xAlarm: false, xCycleActive: false },
    stRobotStatus: { xBusy: false }, Command: { stIo: {}, stRobot: {} }, xHmiOpenHatch: true,
    rtHmiUnlockHatch: { Q: false }, rtHmiLockHatch: { Q: false } };
  for (const locked of [true, false]) {
    s.stMachineStatus.xHatchLocked = locked; permissions(s); requests(s); outputs(s);
    assert.equal(s.Command.stIo.xHatchUnLock, true);
    assert.equal(s.Command.stIo.xOpenDoor, !locked);
    assert.equal(s.eState, enums.E_MACHINE_STATE.ERROR); assert.equal(s.Error.dwErrorActive, 8192);
  }
  s.stMachineStatus.xCycleActive = true; s.xHmiOpenHatch = false;
  permissions(s); requests(s); outputs(s);
  assert.equal(s.Command.stIo.xHatchUnLock, false);
  assert.equal(s.Command.stIo.xOpenDoor, false);
});
test('direct I/O cancels cell, machine and magazine owners without clearing errors or committed stock', () => {
  for (const error of [false, true]) {
    const cSource = readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st');
    const c = { ...defaults(cSource), xIoManual: true, xRunning: true, Error: { dwErrorActive: error ? 2 : 0 },
      eState: error ? enums.E_CELL_MANAGER_STATE.ERROR : enums.E_CELL_MANAGER_STATE.SERVICE_TARGET,
      FIRST_MACHINE: 1, LAST_MACHINE: 3, axMachineStartPending: [null, true, true, true],
      uiSelectedMachine: 2, uiSelectedType: 1, eMachineOperation: 1, eMagazineOperation: 1, iTakeSlot: 8, iPutSlot: 9, iTakeOriginSlot: 8 };
    compile(between(cSource, 'IF xIoManual THEN', '// ГК не зависит'))(c);
    assert.equal(c.eState, error ? enums.E_CELL_MANAGER_STATE.ERROR : enums.E_CELL_MANAGER_STATE.IDLE);
    assert.equal(c.xRunning, false); assert.equal(c.xSafetyHomeRequired, true); assert.equal(c.uiSelectedMachine, 0);
    assert.deepEqual(c.axMachineStartPending.slice(1), [false, false, false]); assert.equal(c.Error.dwErrorActive, error ? 2 : 0);
    const m = { ...defaults(machine), xIoManual: true, eState: error ? enums.E_MACHINE_STATE.ERROR : enums.E_MACHINE_STATE.ROBOT_ACTION,
      Error: { dwErrorActive: error ? 8 : 0 }, uiIndex: 7, eActualOperation: 1, eGrantedOperation: 1, xAutoDoorOpenLatched: true };
    compile(between(machine, 'IF xIoManual THEN', 'CASE eState OF'))(m);
    assert.equal(m.eState, error ? enums.E_MACHINE_STATE.ERROR : enums.E_MACHINE_STATE.DISABLED);
    assert.equal(m.uiIndex, 0); assert.equal(m.xAutoDoorOpenLatched, false); assert.equal(m.Error.dwErrorActive, error ? 8 : 0);
    const magSource = readPlc('FB/FB_MAGAZINE.st');
    const g = { ...defaults(magSource), xIoManual: true, xExecuteRequest: true, eActualOperation: 1,
      Error: { dwErrorActive: error ? 32 : 0 }, Diag: { eState: error ? enums.E_MAGAZINE_STATE.ERROR : enums.E_MAGAZINE_STATE.ROBOT_COMMAND },
      stActiveRobotCommand: { xExecute: true }, stock: [0, 1, 2] };
    compile(between(magSource, 'IF xIoManual THEN', 'CASE Diag.eState OF'))(g);
    assert.equal(g.Diag.eState, error ? enums.E_MAGAZINE_STATE.ERROR : enums.E_MAGAZINE_STATE.DISABLED);
    assert.equal(g.xExecuteRequest, false); assert.equal(g.stActiveRobotCommand.xExecute, false);
    assert.deepEqual(g.stock, [0, 1, 2]); assert.equal(g.Error.dwErrorActive, error ? 32 : 0);
  }
});

const motionSource = readPlc('FB/FB_MOTION_MANAGER.st');
const pointSource = readPlc('FB/FB_POINT_MANAGER.st');
const runMotion = compile(motionSource), runPoint = compile(pointSource);
function motion() {
  const point = { X: 10, Y: 20, Z: 30, SpeedFactor: .2, xConfigured: true };
  const p = { ...defaults(pointSource), stPoint: point, stPointManager: {
    Command: { xExecute: false }, Status: {}, Error: { dwErrorActive: 0 }, Diag: {
      eState: enums.E_POINT_MANAGER_STATE.IDLE, xXLimitValid: true, xYLimitValid: true, xZLimitValid: true,
      lrX_MinLimit: -100, lrX_MaxLimit: 100, lrY_MinLimit: -100, lrY_MaxLimit: 100, lrZ_MinLimit: -100, lrZ_MaxLimit: 100 } } };
  const s = { ...defaults(motionSource), stPoint: Array(32).fill(point), curPoint: point, curPointName: 0,
    stPointManager: p.stPointManager, rtReset: trigger(), FaultRequest: {},
    stMotionManager: { Command: { xExecute: true, xStop: false, xGlobalError: false, eTargetPoint: 13 }, Status: {},
      Error: { dwErrorActive: 0 }, Diag: { eState: enums.E_MOTION_MANAGER_STATE.IDLE, stWarning: { udiSequence: 0 } } },
    GroupData: { Diag: { iStep: enums.E_AXIS_GROUP_STATE.DISABLED }, Command: { xMoveDirect: false, xMoveLinear: false },
      Status: {}, MotionParam: {}, Timeouts: { tGroupTimeout: 500 } } };
  s.fbPointFaultInjector = Object.assign(() => {}, { Status: { xBusy: false, xRejected: false }, xExecute: false });
  s.fbPointManager = ({ stPointManager, stPoint }) => { p.stPointManager = stPointManager; p.stPoint = stPoint; runPoint(p); };
  s.scan = (dt = 20) => { s.now += dt; runMotion(s); };
  s.tonMotionStart = ton(s); return s;
}
test('Stop during validation or waiting for the group cancels the request and never starts later', () => {
  for (const target of [enums.E_MOTION_MANAGER_STATE.VALIDATE, enums.E_MOTION_MANAGER_STATE.MOTION_SIM]) {
    const s = motion(); for (let i = 0; s.stMotionManager.Diag.eState !== target && i < 20; i++) s.scan();
    assert.equal(s.stMotionManager.Diag.eState, target);
    s.stMotionManager.Command.xStop = true; s.scan();
    assert.equal(s.stMotionManager.Diag.eState, enums.E_MOTION_MANAGER_STATE.IDLE);
    assert.equal(s.stMotionManager.Status.xBusy, false); assert.equal(s.stPointManager.Command.xExecute, false);
    s.stMotionManager.Command.xStop = false; s.stMotionManager.Command.xExecute = false;
    s.GroupData.Diag.iStep = enums.E_AXIS_GROUP_STATE.READY;
    for (let i = 0; i < 20; i++) s.scan();
    assert.equal(s.GroupData.Command.xMoveDirect, false); assert.equal(s.stMotionManager.Error.dwErrorActive, 0);
  }
});
test('unready group produces a bounded start timeout and reset releases the command', () => {
  const s = motion(); for (let i = 0; i < 45; i++) s.scan();
  assert.equal(s.stMotionManager.Diag.eState, enums.E_MOTION_MANAGER_STATE.ERROR);
  assert.equal(s.stMotionManager.Error.dwErrorActive, s.ERR_START_TIMEOUT);
  assert.equal(s.stMotionManager.Status.xBusy, false); assert.equal(s.GroupData.Command.xMoveDirect, false);
  s.xReset = true; s.stMotionManager.Command.xExecute = false; s.scan(); s.xReset = false; s.scan();
  assert.equal(s.stMotionManager.Diag.eState, enums.E_MOTION_MANAGER_STATE.IDLE);
  assert.equal(s.stMotionManager.Error.dwErrorActive, 0);
});
test('accepted group movement outlives the start timer and completes once before release', () => {
  const s = motion(); s.GroupData.Diag.iStep = enums.E_AXIS_GROUP_STATE.READY;
  for (let i = 0; !s.GroupData.Command.xMoveDirect && i < 20; i++) s.scan();
  assert.equal(s.GroupData.Command.xMoveDirect, true);
  s.GroupData.Diag.iStep = enums.E_AXIS_GROUP_STATE.MOVING_DIRECT;
  s.scan(); s.scan(2000); assert.equal(s.stMotionManager.Error.dwErrorActive, 0);
  s.GroupData.Diag.iStep = enums.E_AXIS_GROUP_STATE.READY; s.GroupData.Status.xMoveDirectDone = true;
  s.scan(); s.scan(); assert.equal(s.stMotionManager.Status.xDone, true);
  s.stMotionManager.Command.xExecute = false; s.scan(); s.scan();
  assert.equal(s.stMotionManager.Status.xDone, false); assert.equal(s.GroupData.Command.xMoveDirect, false);
});
test('drive disable is rejected and Stop allowed throughout validation and logical movement', () => {
  const source = readPlc('PLC_PRG.RunMotion.st');
  const active = compile(between(source, 'xRobotMotionCommandActive :=', 'xDrivesPowered :='));
  const permits = compile(between(source, 'GVL_HMI.stRobotHmiStatus.xDrivesDisableAllowed :=', 'xHmiDrivesEnableAccepted :='));
  const s = { ...defaults(readPlc('PLC_PRG.st')), xRobotHmiPermit: true, xHmiConnectionAlive: true, xAnyDrivePowered: true,
    GVL_HMI: { xModbusMode: false, stRobotHmiStatus: {} }, GVL_CELL_CONTROL: { xGlobalError: false },
    GVL_ROBOT: { Diag: { eState: enums.E_ROBOT_STATE.MOTION } },
    GVL_MOTION_MANAGER: { stMotionManager: { Diag: { eState: enums.E_MOTION_MANAGER_STATE.VALIDATE } } },
    GVL_AXIS_GROUP: { AxisGroup: { Diag: { iStep: enums.E_AXIS_GROUP_STATE.READY } } } };
  active(s); permits(s); assert.equal(s.GVL_HMI.stRobotHmiStatus.xDrivesDisableAllowed, false);
  assert.equal(s.GVL_HMI.stRobotHmiStatus.xStopAllowed, true);
});

test('manual I/O takeover sends Stop to the actual group or active single-axis owner', () => {
  const source = readPlc('PLC_PRG.RunMotion.st');
  const stop = compile(between(source, 'GVL_AXIS.arrAxis[1].Command.xStop :=', 'uiManualAxisRequest :='));
  for (const owner of [0, 1, 2, 3]) {
    const s = { ...defaults(readPlc('PLC_PRG.st')), xIoManualActive: true, uiManualAxisOwner: owner,
      xGroupMotionBusy: owner === 0, GVL_HMI: { xModbusMode: false }, SIMULATION_DYNAMICS: { xMotionStopRequest: false },
      GVL_AXIS: { arrAxis: [null, { Command: {} }, { Command: {} }, { Command: {} }] }, GVL_AXIS_GROUP: { AxisGroup: { Command: {} } } };
    stop(s); assert.equal(s.GVL_AXIS_GROUP.AxisGroup.Command.xStopCmd, owner === 0);
    for (let i = 1; i <= 3; i++) assert.equal(s.GVL_AXIS.arrAxis[i].Command.xStop, owner === i);
  }
});

const robotSource = readPlc('FB/FB_ROBOT.st');
const resetRobot = compile(between(robotSource, 'rtReset(CLK := xReset);', '// Недопустимое действие'));
const clearRobot = compile(between(robotSource, 'IF ((NOT xMode AND', '\nEND_CASE;'));
const emitReset = compile(between(robotSource, 'IF xMode AND xExternalResetPending THEN', '// ====================================================='));
function robotReset() {
  const s = { ...defaults(robotSource), eState: enums.E_ROBOT_STATE.ERROR, xHmiPermit: true,
    Error: { dwErrorActive: 4, dwErrorLast: 0 }, Status: { xError: true }, Diag: { stWarning: { uiCode: 0, udiSequence: 0 } },
    stMotionManager: { Status: { xError: false } }, fbGripper: { Status: { xError: true } },
    FaultStatus: { stPoint: { xResetAllowed: true }, stGripper: { xResetAllowed: true } },
    stModbusStatus: {}, Command: { xExecute: false, xStop: false }, ModbusCommand: { xReset: false }, rtReset: trigger(),
    tSoftMotionResetTimeout: 1000 };
  s.tonSoftMotionReset = ton(s);
  s.scan = (dt = 20) => { s.now += dt; resetRobot(s); clearRobot(s); s.ModbusCommand.xReset = false; emitReset(s); };
  return s;
}
test('one Reset clears the child gripper first and then the parent without a second command', () => {
  const s = robotReset(); s.xReset = true; s.scan();
  assert.equal(s.xResetAccepted, true); assert.equal(s.xSoftMotionResetPending, true);
  assert.equal(s.Status.xError, true);
  const gripSource = readPlc('FB/FB_GRIPPER_SIMULATION.st');
  const g = { ...defaults(gripSource), Command: { xReset: s.xResetAccepted, xExecute: false },
    fbFaultInjector: {}, Status: { xError: true }, Error: { dwErrorActive: 4 }, eState: enums.E_GRIPPER_STATE.ERROR, eActiveAction: 1 };
  compile(body(gripSource, 'E_GRIPPER_STATE.ERROR').replace(/END_CASE;[\s\S]*$/, ''))(g);
  assert.equal(g.Status.xError, false);
  s.fbGripper.Status = g.Status; s.xReset = false; s.scan();
  assert.equal(s.eState, enums.E_ROBOT_STATE.IDLE); assert.equal(s.Error.dwErrorActive, 0);
  assert.equal(s.xSoftMotionResetPending, false);
});
test('a new gripper fault or reset timeout ends the attempt and never auto-clears its error', () => {
  for (const cause of ['new-fault', 'timeout']) {
    const s = robotReset(); s.xReset = true; s.scan(); s.xReset = false;
    if (cause === 'new-fault') s.FaultStatus.stGripper.xResetAllowed = false;
    s.scan(cause === 'timeout' ? 1100 : 20);
    assert.equal(s.xSoftMotionResetPending, false); assert.equal(s.Error.dwErrorActive, 4);
    assert.equal(s.Diag.stWarning.uiCode, s.WRN_RESET_GRIPPER_ERROR);
    s.fbGripper.Status.xError = false; s.scan(); assert.equal(s.Status.xError, true);
    s.xReset = true; s.scan(); assert.equal(s.Status.xError, false);
  }
});

const modbusSource = readPlc('FB/FB_ROBOT_MODBUS.st'), runModbus = compile(modbusSource);
function modbus() {
  const s = { ...defaults(modbusSource), xEnable: true, Config: { aIpAddress: [127, 0, 0, 1], uiPort: 502,
    uiUnitId: 1, tResponseTimeout: 500, tHeartbeatTimeout: 2000, tPollInterval: 20, tCommandTimeout: 30000 },
    Command: { xExecute: false, xReset: false, xStop: false }, Status: {}, auiReadRegisters: Array(17).fill(0),
    auiWriteRegisters: Array(9).fill(0), uiRegisterIndex: 0, rtReset: trigger(), rtStop: trigger(), rtReconnect: trigger(),
    eState: enums.E_ROBOT_MODBUS_CLIENT_STATE.DISABLED, writes: [], reads: [], failWrite: false, ignoreReset: false,
    remoteAlarm: true, remoteExecution: enums.E_ROBOT_MODBUS_EXECUTION_STATE.ERROR, remoteAck: 41, remoteHeartbeat: 10 };
  for (const n of ['tonPoll', 'tonPlcHeartbeat', 'tonRobotHeartbeat', 'tonCommunicationGrace', 'tonCommandTimeout', 'tonReconnect', 'tonResetAttempt']) s[n] = ton(s);
  s.fbClient = Object.assign(({ xConnect }) => { s.fbClient.xConnected = xConnect; }, { xConnected: false, xError: false });
  function request(action) {
    let previous = false;
    const fn = ({ xExecute, pData }) => {
      if (!xExecute) { fn.xDone = false; fn.xError = false; }
      else if (!previous) action(fn, pData);
      previous = xExecute;
    };
    return Object.assign(fn, { xDone: false, xBusy: false, xError: false, eErrorID: 8 });
  }
  s.fbRead = request((fn, registers) => {
    if (s.failRead && s.xResetWriteDone) { fn.xError = true; s.failRead = false; return; }
    const snapshot = [s.remoteAck, s.remoteExecution, 0, 0, 0, 0, ++s.remoteHeartbeat,
      s.remoteAlarm ? 0x1df : 0x19f, s.remoteAlarm ? 101 : 0, 0, 0, 0, 0, 0, 0, 0, 3];
    snapshot.forEach((v, i) => { registers[i] = v; }); s.reads.push(snapshot); fn.xDone = true;
  });
  s.fbWrite = request((fn, registers) => {
    s.writes.push([...registers]);
    if (s.failWrite && registers[3] === 1) { fn.xError = true; s.failWrite = false; return; }
    if (s.failClearWrite && s.xResetWriteDone && registers[3] === 0) { fn.xError = true; s.failClearWrite = false; return; }
    if (registers[3] === 1 && !s.ignoreReset) { s.remoteAlarm = false; s.remoteExecution = enums.E_ROBOT_MODBUS_EXECUTION_STATE.IDLE; }
    fn.xDone = true;
  });
  s.scan = (dt = 20) => { s.now += dt; runModbus(s); };
  return s;
}
function until(s, predicate, scans = 350) {
  for (let i = 0; !predicate() && i < scans; i++) s.scan();
  assert.ok(predicate(), `condition not reached in ${scans} scans`);
}
test('Modbus Reset succeeds only after write=1, fresh idle feedback and acknowledged write=0', () => {
  const s = modbus(); until(s, () => s.Status.xCommunicationAlive);
  s.Command.xReset = true;
  until(s, () => s.xResetWriteDone);
  assert.equal(s.Status.xResetDone, false); assert.equal(s.Status.xResetBusy, true);
  until(s, () => s.Status.xResetDone);
  assert.equal(s.Status.xResetBusy, false); assert.equal(s.Status.xResetFailed, false);
  const resetIndex = s.writes.findIndex(r => r[3] === 1);
  assert.ok(resetIndex >= 0 && s.writes.slice(resetIndex + 1).some(r => r[3] === 0));
  assert.equal(s.Status.uiExecutionState, enums.E_ROBOT_MODBUS_EXECUTION_STATE.IDLE);
});
test('lost Reset write releases the parent level after reconnect and a new operator Reset really writes again', () => {
  const a = modbus(); until(a, () => a.Status.xCommunicationAlive);
  const p = robotReset(); p.xMode = true; p.fbGripper.Status.xError = false; p.stModbusStatus = a.Status;
  const scan = () => { a.Command.xReset = p.ModbusCommand.xReset; a.scan(); p.xModbusError = a.Status.xError; p.scan(); };
  a.failWrite = true; p.xReset = true; scan(); p.xReset = false;
  for (let i = 0; i < 220; i++) scan();
  assert.equal(a.Status.xResetFailed, true); assert.equal(a.xControlClearPending, false);
  assert.equal(p.xExternalResetPending, false); assert.equal(p.ModbusCommand.xReset, false);
  assert.equal(p.Status.xError, true); assert.equal(a.Status.xCommunicationAlive, true);
  assert.equal(a.writes.filter(r => r[3] === 1).length, 1);
  assert.equal(a.writes.some(r => r[1] !== 0 || r[0] !== 0), false, 'old technology command must never replay');
  assert.equal(a.Status.uiAckSeq, 41);
  p.xReset = true; scan(); p.xReset = false;
  for (let i = 0; p.Status.xError && i < 220; i++) scan();
  assert.equal(p.Status.xError, false); assert.equal(a.Status.xResetDone, true);
  assert.equal(a.writes.filter(r => r[3] === 1).length, 2);
});
test('a held unsuccessful Modbus Reset times out once and cannot replay itself after reconnect', () => {
  const s = modbus(); s.ignoreReset = true; until(s, () => s.Status.xCommunicationAlive);
  s.Command.xReset = true; until(s, () => s.xResetWriteDone);
  s.scan(10020);
  assert.equal(s.Status.xResetFailed, true); assert.equal(s.Status.xResetBusy, false);
  for (let i = 0; i < 160; i++) s.scan();
  assert.equal(s.xResetPending, false); assert.equal(s.xControlClearPending, false);
  assert.equal(s.writes.filter(r => r[3] === 1).length, 1);
  s.Command.xReset = false; s.scan(); s.ignoreReset = false; s.Command.xReset = true;
  until(s, () => s.Status.xResetDone); assert.equal(s.Status.xResetFailed, false);
});

test('feedback loss, clear-write loss and explicit reconnect fail the attempt without replaying Reset', () => {
  for (const cause of ['read', 'clear-write', 'reconnect']) {
    const s = modbus(); until(s, () => s.Status.xCommunicationAlive);
    s.Command.xReset = true;
    s.failRead = cause === 'read'; s.failClearWrite = cause === 'clear-write';
    if (cause === 'reconnect') { s.scan(); s.xReconnect = true; s.scan(); s.xReconnect = false; }
    until(s, () => s.Status.xResetFailed);
    assert.equal(s.Status.xResetDone, false, cause);
    const resetWrites = s.writes.filter(r => r[3] === 1).length;
    for (let i = 0; i < 160; i++) s.scan();
    assert.equal(s.xResetPending, false); assert.equal(s.xControlClearPending, false);
    assert.equal(s.writes.filter(r => r[3] === 1).length, resetWrites, cause);
    s.Command.xReset = false; s.scan(); s.Command.xReset = true;
    until(s, () => s.Status.xResetDone);
    assert.equal(s.Status.xResetFailed, false, cause);
  }
});

test('Stop preempts a pending Modbus Reset and its request is delivered to the controller', () => {
  const s = modbus(); until(s, () => s.Status.xCommunicationAlive);
  s.Command.xReset = true; s.scan(); s.Command.xStop = true; s.scan(); s.Command.xStop = false;
  until(s, () => s.writes.some(r => r[2] === 1));
  assert.equal(s.Status.xResetFailed, true); assert.equal(s.Status.xResetDone, false);
  assert.equal(s.xResetInProgress, false); assert.equal(s.xResetPending, false);
});

test('new and revised recovery alarms match the catalog, reset table and PLC effect', () => {
  const catalog = JSON.parse(readFileSync(new URL('../../visu/alarm-catalog.json', import.meta.url), 'utf8'));
  const doc = readFileSync(new URL('../../DOKS/15-equipment-error-reset-table.md', import.meta.url), 'utf8');
  const warnings = readFileSync(new URL('../../DOKS/16-cell-warnings.md', import.meta.url), 'utf8');
  assert.ok(doc.includes(catalog.alarms['motion-manager'][3]));
  assert.ok(doc.includes(catalog.alarms.robot[3]));
  for (const code of [4, 5, 6, 12]) { assert.ok(doc.includes(catalog.warnings.robot[code])); assert.ok(warnings.includes(catalog.warnings.robot[code])); }
  const source = readPlc('FB/FB_ALARM_MANAGER.GetAlarmEffect.st');
  const s = { E_ALARM_SOURCE: enumeration('ST/ST_ALARM/E_ALARM_SOURCE.st'), E_ALARM_EFFECT: enumeration('ST/ST_ALARM/E_ALARM_EFFECT.st'),
    eSource: 0, uiCode: 3, xRobotStopRequired: false, xGlobalError: false, GetAlarmEffect: 0 };
  s.eSource = s.E_ALARM_SOURCE.MOTION_MANAGER; compile(source)(s);
  assert.equal(s.GetAlarmEffect, s.E_ALARM_EFFECT.ROBOT_STOP);
});
