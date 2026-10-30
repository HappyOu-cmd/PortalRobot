import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSt, defaultsFromSt, readPlc } from './helpers/geometryStRuntime.mjs';
import { controllerPlcSymbols } from '../gateway/controller-plc.mjs';
import alarmCatalog from '../alarm-catalog.json' with { type: 'json' };

const source = readPlc('FB/FB_CONTROLLER_DIAGNOSTICS.st');
const execute = compileSt(source.replace(/\bULINT#/g, ''));
const emptyRequest = () => ({ udiSequence: 0, udiIssuedAtMs: 0, xCpuValid: false, xModulesValid: false,
  dwCpuCurrent1: 0, dwCpuCurrent2: 0, dwModuleCurrent: 0, xMemoryCurrent: false,
  dwCpuObserved1: 0, dwCpuObserved2: 0, dwModuleObserved: 0, xMemoryObserved: false });
function plc() {
  const status = defaultsFromSt(readPlc('ST/ST_ALARM/ST_CONTROLLER_WEB_STATUS.st').replace('STRUCT', 'VAR').replace('END_STRUCT', 'END_VAR'));
  const state = { ...defaultsFromSt(source), Request: emptyRequest(), Status: status,
    stWarning: { uiCode: 0, udiSequence: 0 }, udiNowMs: 0, now: 0, uliAgeMs: 0,
    xReset: false, xResetWarnings: false, UDINT_TO_ULINT: Number };
  state.scan = (input = {}, dt = 20) => {
    state.now += dt; state.udiNowMs = state.now >>> 0;
    Object.assign(state, { xReset: false, xResetWarnings: false }, input); execute(state);
    return state.Status;
  };
  state.frame = (payload = {}, input = {}) => {
    state.Request = { ...emptyRequest(), udiSequence: (state.Status.udiAckSeq + 1) >>> 0 || 1,
      udiIssuedAtMs: state.now >>> 0, xCpuValid: true, xModulesValid: true, ...payload };
    return state.scan(input);
  };
  return state;
}

test('PLC latches all CPU banks and module causes; reset is refused until their current codes disappear', () => {
  const p = plc();
  p.frame({ dwCpuCurrent1: 8, dwCpuCurrent2: 2, dwModuleCurrent: 4 });
  assert.equal(p.Status.xGlobalStopRequired, true);
  p.scan({ xReset: true });
  assert.equal(p.Status.xAlarmActive, true);
  assert.equal(p.Status.xResetAllowed, false);
  p.frame({ dwCpuCurrent1: 8 }); // CPU fault persists, module fault is no longer reported.
  p.scan({ xReset: true });
  assert.equal(p.Status.dwModuleAlarm, 4, 'one common reset cannot erase another active system cause');
  p.frame();
  assert.equal(p.Status.xAlarmActive, true);
  assert.equal(p.Status.xGlobalStopRequired, false, 'dependent owners must be able to prepare their reset');
  assert.equal(p.Status.xResetAllowed, true);
  p.scan({ xReset: true });
  assert.equal(p.Status.xAlarmActive, false);
  assert.deepEqual([p.Status.dwCpuAlarm1, p.Status.dwCpuAlarm2, p.Status.dwModuleAlarm], [0, 0, 0]);
});

test('lost validity or an expired gateway heartbeat cannot confirm recovery', () => {
  const p = plc();
  p.frame({ dwCpuCurrent1: 2, dwModuleCurrent: 1 });
  p.frame({ xCpuValid: false, xModulesValid: false });
  p.scan({ xReset: true });
  assert.equal(p.Status.xGlobalStopRequired, true);
  assert.equal(p.Status.xResetAllowed, false);
  p.frame();
  p.scan({}, 12_100);
  p.scan({ xReset: true });
  assert.equal(p.Status.xCpuFresh, false);
  assert.equal(p.Status.xResetAllowed, false);
  assert.equal(p.Status.xAlarmActive, true);
});

test('observed exceptions survive STOP and cannot be reset in their first registration scan', () => {
  const p = plc();
  p.frame({ dwCpuObserved1: 0x100, udiIssuedAtMs: 0 }, { xReset: true });
  assert.equal(p.Status.dwCpuAlarm1, 0x100);
  assert.equal(p.Status.xGlobalStopRequired, true);
  assert.equal(p.Status.xResetAllowed, false);
  p.scan();
  assert.equal(p.Status.xResetAllowed, true);
  p.scan({ xReset: true });
  assert.equal(p.Status.xAlarmActive, false);
  p.scan();
  assert.equal(p.Status.xAlarmActive, false, 'unchanged Ack must not replay the same observation');
});

test('stale committed packets still register history but cannot permit reset; PLC clock wrap is supported', () => {
  const p = plc();
  p.now = 10_000;
  p.frame({ dwCpuObserved2: 4, udiIssuedAtMs: 0 });
  assert.equal(p.Status.xCpuFresh, false);
  assert.equal(p.Status.dwCpuAlarm2, 4);
  p.scan({ xReset: true });
  assert.equal(p.Status.xAlarmActive, true);
  p.now = 0xfffffff0;
  p.frame(); // scan advances the 32-bit clock past wrap.
  assert.equal(p.Status.xCpuFresh, true);
  assert.equal(p.Status.xResetAllowed, true);
});

test('5C is a warning only; neither reset may erase it while 5C or missing data persists', () => {
  const p = plc();
  p.frame({ xMemoryCurrent: true, xMemoryObserved: true });
  assert.equal(p.Status.xAlarmActive, false);
  assert.equal(p.Status.xGlobalStopRequired, false);
  assert.equal(p.Status.xMemoryWarning, true);
  assert.equal(p.stWarning.udiSequence, 1);
  p.scan({ xReset: true, xResetWarnings: true });
  assert.equal(p.Status.xMemoryWarning, true);
  p.frame({ xCpuValid: false });
  p.scan({ xResetWarnings: true });
  assert.equal(p.Status.xMemoryWarning, true);
  p.frame();
  p.scan({ xReset: true });
  assert.equal(p.Status.xMemoryWarning, true, 'general alarm reset leaves warnings untouched');
  p.scan({ xResetWarnings: true });
  assert.equal(p.Status.xMemoryWarning, false);
  p.frame({ xMemoryCurrent: true });
  assert.equal(p.stWarning.udiSequence, 2);
});

test('alarm manager preserves active 5C while resetting unrelated warnings', () => {
  const body = readPlc('FB/FB_ALARM_MANAGER.st').split('// --- BEGIN IMPLEMENTATION ---')[1].split('// Менеджер не определяет причины:')[0];
  const reset = compileSt(`// --- BEGIN IMPLEMENTATION ---\n${body}`);
  const controller = { xActive: true, eSeverity: 1, eSource: 19 };
  const ordinary = { xActive: true, eSeverity: 1, eSource: 0 };
  const state = { xResetWarnings: true, xControllerWarningResetAllowed: false, uiIndex: 0,
    E_ALARM_SEVERITY: { WARNING: 1 }, E_ALARM_SOURCE: { CONTROLLER_CPU_1: 19 },
    Events: [null, controller, ordinary, ...Array.from({ length: 98 }, () => ({ xActive: false }))] };
  reset(state);
  assert.equal(controller.xActive, true);
  assert.equal(ordinary.xActive, false);
  state.xControllerWarningResetAllowed = true;
  reset(state);
  assert.equal(controller.xActive, false);
});

test('PLC integration keeps source IDs, groups writable/read-only tags and blocks Auto until reset', () => {
  const enumeration = readPlc('ST/ST_ALARM/E_ALARM_SOURCE.st').replace(/\/\/[^\n]*/g, '').split('(')[1].split(')')[0]
    .split(',').map((item) => item.trim());
  assert.deepEqual(enumeration.slice(19), ['CONTROLLER_CPU_1', 'CONTROLLER_CPU_2', 'CONTROLLER_MODULES']);
  const alarms = readPlc('PLC_PRG.RunAlarms.st');
  assert.match(alarms, /NOT CONTROLLER_DIAGNOSTICS\.Status\.xAlarmActive OR CONTROLLER_DIAGNOSTICS\.Status\.xResetAllowed/);
  assert.match(alarms, /astAlarmSource\[20\]\.dwAlarmActive := CONTROLLER_DIAGNOSTICS\.Status\.dwCpuAlarm1/);
  assert.match(alarms, /astAlarmSource\[22\]\.dwAlarmActive := CONTROLLER_DIAGNOSTICS\.Status\.dwModuleAlarm/);
  const safety = readPlc('PLC_PRG.RunSafety.st');
  assert.match(safety, /CONTROLLER_DIAGNOSTICS\.Status\.xAlarmActive THEN[\s\S]*?GVL_CELL_CONTROL\.xStart := FALSE/);
  assert.match(safety, /OR CONTROLLER_DIAGNOSTICS\.Status\.xAlarmActive THEN\s*GVL_CELL_CONTROL\.xManual := TRUE/);
  assert.match(readPlc('PLC_PRG.RunCellControl.st'), /xSafetyReady := CELL_SAFETY.Status.xReady AND NOT CONTROLLER_DIAGNOSTICS.Status.xAlarmActive/);
  assert.match(readPlc('GVL/GVL_HMI.gvl.st'), /stControllerWebRequest : ST_CONTROLLER_WEB_REQUEST;\s*\{attribute 'symbol' := 'read'\}\s*stControllerWebStatus/);
});

test('manual recovery cannot bypass a current MC522 GLOBAL_STOP at the axis power inputs', () => {
  const motion = readPlc('PLC_PRG.RunMotion.st').split('// --- BEGIN IMPLEMENTATION ---')[1].split('// Текущие состояния')[0];
  const run = compileSt(motion);
  const s = { xManualRecoveryActive: false, xHmiConnectionAlive: true,
    CONTROLLER_DIAGNOSTICS: { Status: { xGlobalStopRequired: true } },
    GVL_CELL_CONTROL: { xGlobalError: true, xManual: true }, GVL_CELL_MANAGER: { Status: { xRunning: false } },
    GVL_HMI: { xModbusMode: false }, GVL_AXIS: { arrAxis: [null, { Command: {} }, { Command: {} }, { Command: {} }] },
    GVL_AXIS_GROUP: { AxisGroup: { Command: {} } } };
  run(s);
  assert.equal(s.xManualRecoveryActive, false);
  assert.ok(s.GVL_AXIS.arrAxis.slice(1).every((axis) => axis.Command.xGlobalError && !axis.Command.xPowerPermit));
  s.CONTROLLER_DIAGNOSTICS.Status.xGlobalStopRequired = false;
  run(s);
  assert.equal(s.xManualRecoveryActive, true, 'the pre-existing recovery mode for other global causes is preserved');
});

test('every controller OPC UA path resolves to its actual PLC declaration and source IDs match the shared catalogue', () => {
  const fields = (text) => Object.fromEntries([...text.matchAll(/^\s*(\w+)\s*:\s*(\w+)/gm)].map(([, name, type]) => [name, type]));
  const root = fields(readPlc('GVL/GVL_HMI.gvl.st'));
  const types = { ST_CONTROLLER_WEB_REQUEST: fields(readPlc('ST/ST_ALARM/ST_CONTROLLER_WEB_REQUEST.st')),
    ST_CONTROLLER_WEB_STATUS: fields(readPlc('ST/ST_ALARM/ST_CONTROLLER_WEB_STATUS.st')) };
  assert.equal(new Set(controllerPlcSymbols).size, controllerPlcSymbols.length);
  for (const path of controllerPlcSymbols) {
    let declarations = root;
    for (const field of path.split('.')) {
      assert.ok(declarations && Object.hasOwn(declarations, field), `Undeclared controller OPC UA path: ${path}`);
      declarations = types[declarations[field]];
    }
  }
  assert.deepEqual(Object.keys(alarmCatalog.sources).slice(19), ['controller-cpu-1', 'controller-cpu-2', 'controller-modules']);
  for (const path of ['PLC_PRG.st', 'FB/FB_ALARM_MANAGER.st', 'FB/FB_ALARM_HORN.st']) {
    assert.match(readPlc(path), /ARRAY \[1\.\.22\] OF ST_ALARM_SOURCE_DATA/);
  }
});
