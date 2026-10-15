import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseIoEvent } from '../gateway/physical-io.mjs';

const root = new URL('../../Portal_robot/Device/application/', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');
const strip = (source) => source.replace(/\(\*[\s\S]*?\*\)/g, '').replace(/\/\/[^\r\n]*/g, '');
const map = JSON.parse(readFileSync(new URL('../../DOKS/22-physical-io-map.json', import.meta.url), 'utf8'));

const outputIndices = map.channels.filter((c) => c.direction === 'DO').map((c) => c.index);

// Исполняем поддерживаемый ST-текст метода, а не отдельную копию FIFO на JavaScript.
function stProgram(text) {
  const literals = [];
  let code = strip(text).replace(/'(?:''|[^'])*'/g, (literal) => {
    literals.push(literal.slice(1, -1).replace(/''/g, "'"));
    return `stStrings[${literals.length - 1}]`;
  }).replace(/\b(?:USINT|UINT|UDINT|ULINT|DWORD)#(\d+)/g, '$1');
  code = code.replace(/CASE\s+([^\r\n]+)\s+OF([\s\S]*?)END_CASE\s*;/g, (_, selector, body) => {
    const branches = body.replace(/^\s*((?:[A-Za-z_][\w.]*|\d+)(?:\s*,\s*[A-Za-z_][\w.]*)*)\s*:\s*/gm,
      (_, labels) => `break; ${labels.split(',').map((label) => `case ${label.trim()}:`).join(' ')} `).replace(/^\s*break;/, '');
    return `switch (${selector}) { ${branches} break; }`;
  });
  code = code.replace(/(AppendIoEvent|IsHmiCommandFresh)\(([\s\S]*?)\)/g, (_, name, args) => `${name}({${args.replace(/(\w+)\s*:=/g, '$1:')}})`);
  code = code.replace(/FOR\s+(\w+)\s*:=\s*([\s\S]*?)\s+TO\s+([\s\S]*?)\s+DO/g, 'for ($1 __ST_ASSIGN__ $2; $1 <= $3; $1++) {')
    .replace(/END_FOR\s*;/g, '}')
    .replace(/ELSIF\s+([\s\S]*?)\s+THEN/g, '} else if ($1) {')
    .replace(/\bIF\s+([\s\S]*?)\s+THEN/g, 'if ($1) {')
    .replace(/\bELSE\b/g, '} else {').replace(/END_IF\s*;/g, '}');
  code = code.replace(/([A-Za-z_][\w.\[\]]*)\s*:=\s*([^;]+);/g, (_, target, value) => {
    const name = target.split('.').at(-1).replace(/\[.*$/, '');
    const converted = name.startsWith('udi') ? `((${value}) >>> 0)` : name.startsWith('ui') ? `((${value}) & 65535)`
      : name.startsWith('usi') ? `((${value}) & 255)` : value;
    return `${target} __ST_ASSIGN__ ${converted};`;
  }).replace(/\bMOD\b/g, '%').replace(/\bAND\b/g, '&&').replace(/\bOR\b/g, '||').replace(/\bNOT\b/g, '!')
    .replace(/\bTRUE\b/g, 'true').replace(/\bFALSE\b/g, 'false').replace(/<>/g, '!==').replace(/(?<![<>!:=])=(?!=)/g, '===')
    .replace(/__ST_ASSIGN__/g, '=');
  const execute = Function('state', `with (state) { ${code} }`);
  return (state) => { state.stStrings = literals; execute(state); };
}

const append = stProgram(read('PLC_PRG.AppendIoEvent.st').split('// --- BEGIN IMPLEMENTATION ---')[1]);
const outputOverrideSource = read('PLC_PRG.ApplyIoOutputOverrides.st');
const applyOutputs = stProgram(outputOverrideSource.split('// --- BEGIN IMPLEMENTATION ---')[1]);
const emergencySource = read('PLC_PRG.ResetIoEmergencyStop.st');
const readEmergency = stProgram(read('PLC_PRG.ReadIoEmergencyStop.st').split('// --- BEGIN IMPLEMENTATION ---')[1]);
const resetEmergency = stProgram(emergencySource.split('// --- BEGIN IMPLEMENTATION ---')[1]);

const overrides = read('PLC_PRG.ReadIoOverrides.st');
const readControl = stProgram(overrides.slice(overrides.indexOf('xIoBusy :=')));

function outputRuntime() {
  const s = stoppedManual();
  const bits = () => Array(51).fill(false);
  Object.assign(s, { xPhysicalOutputEnable: true, xIoRawSafetyOk: true, xIoDoRejected: false,
    xIoManualActive: false, xIoManualEndedByOperator: false, xIoOverrideRejected: false,
    uiIoRequestIndex: 0, uiIoRequestAction: 0, udiIoRequestSeq: 0, xIoRequestValue: false,
    axIoDoAllowed: bits(), axIoDoOnAllowed: bits(), axIoDoForced: bits(), axIoDoForceValue: bits(), axIoDoInhibited: bits(), axIoAutoDo: bits(), axIoOutput: bits(),
    axIoForced: Array(85).fill(false), axIoForceValue: Array(85).fill(false), axIoRawDi: Array(85).fill(false), axPhysicalRaw: Array(85).fill(false),
    axIoMagazineInvalidated: [false, false, false],
    uliIoClockMs: 100, base: bits(), events: [], fresh: true,
    GVL_CELL_SETTINGS: { eTestEnvironment: 0 }, E_CELL_TEST_ENVIRONMENT: { NORMAL: 0 },
    CELL_SAFETY: { Status: { xReady: true } },
    xIoInitialized: true, xIoSnapshotPublishing: false, xIoEmergencyResetRequested: false, xIoEmergencyResetRejected: false, udiIoEmergencyRequestSeq: 0, xPointCheckStopRequest: false,
    xRobotHmiPermit: true,
  });
  s.AppendIoEvent = (event) => s.events.push(event);
  s.IsHmiCommandFresh = () => s.fresh;
  Object.assign(s.GVL_HMI, { udiIoOverrideCommandSeq: 1, udiIoOverrideAckSeq: 1, uiIoOverrideResult: 0, uiIoOverrideIndex: 0, uiIoOverrideAction: 0,
    xIoOverrideValue: false, udiIoOverrideIssuedAtMs: 100, xModbusMode: false, xCellManualRequest: true,
    uiIoEmergencyAction: 0, udiIoEmergencyIssuedAtMs: 100, uiIoEmergencyResult: 0, udiIoJournalRevision: 0,
  });
  Object.assign(s.GVL_ROBOT, { Command: {}, ModbusCommand: {} });
  for (const signal of map.channels) s.GVL_PHYSICAL_IO[signal.variable] = signal.direction === 'DI';
  for (let n = 1; n <= 3; n++) Object.assign(s.GVL_PHYSICAL_IO, { [`xDiMachine${n}Alarm`]: false, [`xDiMachine${n}CycleActive`]: false });
  return s;
}
function outputScan(s) {
  for (const signal of map.channels.filter((signal) => signal.direction === 'DI')) {
    s.axIoRawDi[signal.index] = s.GVL_PHYSICAL_IO[signal.variable];
    s.axPhysicalRaw[signal.index] = s.axIoRawDi[signal.index];
  }
  for (const i of map.retiredDoIndices) { s.base[i] = false; s.axIoOutput[i] = false; }
  // Реальный порядок скана: подмены DI до фильтра, штатные DO, затем ручной слой.
  readControl(s);
  for (const signal of map.channels.filter((signal) => signal.direction === 'DO')) s.GVL_PHYSICAL_IO[signal.variable] = s.base[signal.index];
  applyOutputs(s);
  for (const signal of map.channels.filter((signal) => signal.direction === 'DO')) s.axIoOutput[signal.index] = s.GVL_PHYSICAL_IO[signal.variable];
}
function outputRequest(s, index, value, action = 4) {
  Object.assign(s.GVL_HMI, { uiIoOverrideAction: action, uiIoOverrideIndex: index, xIoOverrideValue: value,
    udiIoOverrideCommandSeq: s.GVL_HMI.udiIoOverrideCommandSeq + 1 });
  outputScan(s);
}
function beginManual(s) {
  outputScan(s);
  outputRequest(s, 0, false, 8);
  assert.equal(s.GVL_HMI.uiIoOverrideResult, 1);
  assert.equal(s.GVL_HMI.xIoManualControlActive, true);
}

test('actual manual I/O ST requires explicit entry, snapshots all 47 mapped outputs and keeps levels until program handover', () => {
  const s = outputRuntime();
  outputRequest(s, 24, true);
  assert.equal(s.GVL_HMI.uiIoOverrideResult, 2);
  assert.equal(s.GVL_PHYSICAL_IO.xDoSignalTowerGreenOutput, false);
  for (const i of outputIndices) s.base[i] = i % 2 === 0;
  beginManual(s);
  const snapshot = [...s.axIoOutput];
  assert.equal(s.GVL_HMI.xIoManualStartAllowed, false);
  assert.equal(s.axIoDoForced.some(Boolean), false);
  for (const i of outputIndices) s.base[i] = !snapshot[i];
  outputScan(s);
  assert.deepEqual(s.axIoOutput, snapshot);
  outputRequest(s, 24, false);
  assert.equal(s.axIoOutput[24], false);
  outputRequest(s, 0, false, 8); // Повтор входа не перезаписывает ручные значения.
  assert.equal(s.axIoOutput[24], false);
  assert.equal(s.axIoOutput[26], snapshot[26]);
  outputRequest(s, 0, false, 9);
  assert.equal(s.GVL_HMI.xIoManualControlActive, false);
  assert.deepEqual(s.axIoOutput, s.base);
  assert.equal(s.axIoDoForced.some(Boolean), false);
  assert.equal(s.events.findLast((e) => e.usiKind === 8).xNew, s.base[24]);
});

test('actual direct I/O ST ignores alarm and safety states and keeps control when manual actuation starts equipment', () => {
  const s = outputRuntime();
  s.GVL_CELL_CONTROL.xGlobalError = true;
  s.GVL_PHYSICAL_IO.xDiEmergencyStopStation1Ok = false;
  s.GVL_PHYSICAL_IO.xDiPressureRelayOkInput = false;
  s.CELL_SAFETY.Status.xReady = false;
  s.GVL_HMI.xIoEmergencyStopActive = true;
  beginManual(s);
  s.GVL_PHYSICAL_IO.xDiMachine2CycleActive = true;
  s.GVL_MACHINE.Status[2].xProcessing = true;
  s.GVL_CELL_MANAGER.Status.xBusy = true;
  outputRequest(s, 24, true);
  assert.equal(s.GVL_HMI.uiIoOverrideResult, 1);
  assert.equal(s.GVL_HMI.xIoDoOverrideAllowed, true);
  assert.equal(s.GVL_PHYSICAL_IO.xDoSignalTowerGreenOutput, true);
  outputRequest(s, 1, false, 1);
  assert.equal(s.GVL_HMI.uiIoOverrideResult, 1);
  assert.equal(s.axIoRawDi[1], true);
  assert.equal(s.axPhysicalRaw[1], false);
});

test('actual direct I/O ST returns current program levels on mode, lease, operator exit or a new emergency stop without replay', () => {
  for (const cause of ['lease', 'watchdog', 'connection', 'manual-off', 'auto-request', 'end', 'release-all', 'emergency']) {
    const s = outputRuntime(); s.base[24] = true;
    beginManual(s); outputRequest(s, 24, false); outputRequest(s, 1, false, 1);
    if (cause === 'lease') s.uliIoLeaseAgeMs = 3001;
    if (cause === 'watchdog') s.tonIoOverrideWatchdog.Q = true;
    if (cause === 'connection') s.xHmiConnectionAlive = false;
    if (cause === 'manual-off') s.GVL_CELL_CONTROL.xManual = false;
    if (cause === 'auto-request') Object.assign(s.GVL_HMI, { udiCellModeCommandSeq: 1, xCellManualRequest: false });
    if (cause === 'end' || cause === 'release-all') outputRequest(s, 0, false, cause === 'end' ? 9 : 7);
    if (cause === 'emergency') {
      Object.assign(s.GVL_HMI, { udiIoEmergencyCommandSeq: 1, uiIoEmergencyAction: 1 });
      readEmergency(s);
    }
    outputScan(s);
    assert.equal(s.GVL_HMI.xIoManualControlActive, false, cause);
    assert.equal(s.axIoForced[1], false, cause);
    assert.equal(s.axPhysicalRaw[1], true, cause); // Снято до следующей фильтрации.
    assert.equal(s.axIoDoForced[24], false, cause);
    assert.equal(s.axIoDoInhibited[24], false, cause);
    assert.equal(s.GVL_PHYSICAL_IO.xDoSignalTowerGreenOutput, true, cause);
    const event = s.events.findLast((e) => [8, 9].includes(e.usiKind));
    assert.equal(event.usiKind, ['end', 'release-all'].includes(cause) ? 8 : 9, cause);
    assert.equal(event.xNew, true, cause);
    s.uliIoLeaseAgeMs = 0; s.tonIoOverrideWatchdog.Q = false; s.xHmiConnectionAlive = true;
    s.GVL_CELL_CONTROL.xManual = true; s.GVL_HMI.udiCellModeAckSeq = s.GVL_HMI.udiCellModeCommandSeq;
    outputScan(s);
    assert.equal(s.GVL_HMI.xIoManualControlActive, false, cause);
    outputRequest(s, 24, false);
    assert.equal(s.GVL_HMI.uiIoOverrideResult, 2, cause);
  }
});

test('actual direct DO ST permits both opposite coils in every pair and uses the same permit for on/off', () => {
  for (const [a, b] of [[3, 4], [8, 9], [13, 14], [31, 32], [33, 34], [35, 36], [43, 44], [45, 46], [47, 48]]) {
    const s = outputRuntime(); s.base[a] = true; beginManual(s);
    outputRequest(s, b, true);
    assert.equal(s.GVL_HMI.uiIoOverrideResult, 1, `${a}/${b}`);
    assert.equal(s.axIoDoAllowed[b], true); assert.equal(s.axIoDoOnAllowed[b], true);
    assert.equal(s.axIoOutput[a], true); assert.equal(s.axIoOutput[b], true);
    outputRequest(s, a, false);
    assert.equal(s.axIoOutput[a], false); assert.equal(s.axIoOutput[b], true);
  }
});

test('actual direct DO ST controls all 47 mapped channels including safety reset and Modbus grippers', () => {
  const s = outputRuntime();
  s.GVL_HMI.xModbusMode = true; s.GVL_HMI.xTestSessionActive = true;
  s.xPhysicalNormal = false; s.xPhysicalOutputEnable = false; s.GVL_PHYSICAL_IO.xMappingVerified = false;
  s.GVL_CELL_SETTINGS.eTestEnvironment = 1;
  s.GVL_PHYSICAL_IO.xDiDoor3LockClosed = false;
  beginManual(s);
  for (const index of outputIndices) {
    outputRequest(s, index, true);
    assert.equal(s.GVL_HMI.uiIoOverrideResult, 1, String(index));
    assert.equal(s.axIoOutput[index], true, String(index));
  }
  assert.equal(outputIndices.every((i) => s.axIoOutput[i]), true);
  assert.deepEqual(s.axIoMagazineInvalidated, [false, true, true]);
  // Учёт вмешательства в магазин сохраняется; прямому DO он не мешает.
  const invalidate = stProgram(read('FB/FB_TWO_PALLET.st').match(/IF xIoPneumaticOverride THEN[\s\S]*?END_IF;\s*END_IF;/)[0]);
  const twin = { xIoPneumaticOverride: true, Status: { xConfirmed: true, xEnabled: true, udiRevision: 0xffffffff } };
  invalidate(twin);
  assert.deepEqual(twin.Status, { xConfirmed: false, xEnabled: false, udiRevision: 1 });
  for (const index of outputIndices) outputRequest(s, index, false);
  assert.equal(s.axIoOutput.some(Boolean), false);
});

test('removed DO IDs 37..39 reject set/release, stay zero and never append invalid FIFO events', () => {
  const s = outputRuntime(); beginManual(s);
  for (const i of [37, 38, 39]) {
    s.axIoDoForced[i] = true; s.axIoDoForceValue[i] = true;
    for (const action of [4, 5]) {
      const before = s.events.length;
      outputRequest(s, i, true, action);
      assert.equal(s.GVL_HMI.uiIoOverrideResult, 3);
      assert.equal(s.GVL_HMI.udiIoOverrideAckSeq, s.GVL_HMI.udiIoOverrideCommandSeq);
      for (const name of ['axIoOutput', 'axIoAutoDo', 'axIoDoAllowed', 'axIoDoOnAllowed', 'axIoDoForced', 'axIoDoForceValue']) assert.equal(s[name][i], false, name);
      assert.equal(s.events.length, before);
    }
  }
  outputRequest(s, 40, true);
  assert.equal(s.GVL_HMI.uiIoOverrideResult, 1);
  assert.equal(s.GVL_PHYSICAL_IO.xDoCellAlarmHorn, true);
  const record = read('PLC_PRG.RecordIoDiagnostics.st');
  const section = record.slice(record.indexOf('FOR uiIoIndex := UINT#1 TO UINT#50 DO'), record.indexOf('xIoInitialized := TRUE'));
  const publish = stProgram(section);
  Object.assign(s, { xIoInitialized: true, axIoPreviousOutput: Array(51).fill(false) });
  for (const i of [37, 38, 39]) s.axIoPreviousOutput[i] = true;
  s.events.length = 0;
  publish(s);
  assert.ok(s.events.every((e) => ![37, 38, 39].includes(e.uiIndex)));
  for (const i of [37, 38, 39]) assert.equal(s.axIoPreviousOutput[i], false);
});
test('actual direct DO ST holds start/reset levels until toggled and consumes stale or invalid requests without replay', () => {
  const s = outputRuntime(); beginManual(s);
  for (const index of [5, 10, 15, 23, 42, 50]) outputRequest(s, index, true);
  s.uliIoClockMs = 100000; outputScan(s);
  for (const index of [5, 10, 15, 23, 42, 50]) assert.equal(s.axIoOutput[index], true);
  outputRequest(s, 5, false); assert.equal(s.axIoOutput[5], false);
  s.fresh = false; outputRequest(s, 41, true);
  assert.equal(s.GVL_HMI.uiIoOverrideResult, 4);
  assert.equal(s.GVL_HMI.udiIoOverrideAckSeq, s.GVL_HMI.udiIoOverrideCommandSeq);
  s.fresh = true; outputScan(s);
  assert.equal(s.GVL_PHYSICAL_IO.xDoGk1DriveRun, false);
  outputRequest(s, 51, true); assert.equal(s.GVL_HMI.uiIoOverrideResult, 3);
  outputRequest(s, 41, true); assert.equal(s.axIoOutput[41], true);
});

test('actual emergency ST latches stop in any mode, consumes commands and reset neither starts nor replays motion', () => {
  const s = outputRuntime(); s.GVL_CELL_CONTROL.xManual = false; s.GVL_CELL_CONTROL.xStart = true; s.GVL_CELL_CONTROL.xEnable = true;
  Object.assign(s.GVL_HMI, { udiIoEmergencyCommandSeq: 1, uiIoEmergencyAction: 1, xRobotManualExecute: true });
  s.GVL_HMI.astAxisHmiCommand[1].xJogPositive = true;
  readEmergency(s); resetEmergency(s);
  assert.equal(s.GVL_HMI.xIoEmergencyStopActive, true); assert.equal(s.GVL_HMI.udiIoEmergencyAckSeq, 1);
  assert.equal(s.GVL_CELL_CONTROL.xStart, false); assert.equal(s.GVL_CELL_CONTROL.xEnable, false); assert.equal(s.GVL_CELL_CONTROL.xStop, true);
  assert.equal(s.GVL_ROBOT.ModbusCommand.xStop, true); assert.equal(s.GVL_HMI.astAxisHmiCommand[1].xJogPositive, false);
  s.xIoBusy = true; Object.assign(s.GVL_HMI, { udiIoEmergencyCommandSeq: 2, uiIoEmergencyAction: 2 });
  readEmergency(s); resetEmergency(s);
  assert.equal(s.GVL_HMI.uiIoEmergencyResult, 2); assert.equal(s.GVL_HMI.xIoEmergencyStopActive, true);
  s.xIoBusy = false; s.GVL_PHYSICAL_IO.xDiPressureRelayOkInput = false;
  s.GVL_HMI.udiIoEmergencyCommandSeq = 3; readEmergency(s); resetEmergency(s);
  assert.equal(s.GVL_HMI.uiIoEmergencyResult, 2);
  s.GVL_PHYSICAL_IO.xDiPressureRelayOkInput = true; s.fresh = false;
  s.GVL_HMI.udiIoEmergencyCommandSeq = 4; readEmergency(s); resetEmergency(s); assert.equal(s.GVL_HMI.uiIoEmergencyResult, 4);
  s.fresh = true; readEmergency(s); resetEmergency(s); assert.equal(s.GVL_HMI.xIoEmergencyStopActive, true);
  s.GVL_HMI.udiIoEmergencyCommandSeq = 5; readEmergency(s); resetEmergency(s);
  assert.equal(s.GVL_HMI.xIoEmergencyStopActive, false); assert.equal(s.GVL_HMI.uiIoEmergencyResult, 1);
  assert.equal(s.GVL_CELL_CONTROL.xStart, false); assert.equal(s.GVL_CELL_CONTROL.xEnable, false); assert.equal(s.xRobotHmiPermit, false);
});

test('actual PLC mode transaction rejects Auto during emergency with W27 and cannot replay it when the stop is reset', () => {
  const source = read('PLC_PRG.RunSafety.st');
  const mode = stProgram(source.slice(source.indexOf('uiCellModeRejectReason :='), source.indexOf('// Разрешения')));
  const s = outputRuntime(); Object.assign(s, { uiCellModeRejectReason: 0, udiCellModeCommandSnapshot: 0 });
  s.GVL_CELL_CONTROL.xGlobalError = false; s.GVL_HMI.xIoEmergencyStopActive = true;
  Object.assign(s.GVL_HMI, { xCellManualRequest: false, udiCellModeCommandSeq: 1 });
  mode(s); assert.equal(s.GVL_HMI.uiCellModeResult, 3); assert.equal(s.uiCellModeRejectReason, 3); assert.equal(s.GVL_CELL_CONTROL.xManual, true);
  s.GVL_HMI.udiCellModeAckSeq = 1; s.GVL_HMI.xIoEmergencyStopActive = false;
  mode(s); assert.equal(s.GVL_CELL_CONTROL.xManual, true);
  s.GVL_HMI.udiCellModeCommandSeq = 2; mode(s);
  assert.equal(s.GVL_HMI.uiCellModeResult, 1); assert.equal(s.GVL_CELL_CONTROL.xManual, false);
  const permit = stProgram(read('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st').match(/Status\.xAutomaticAllowed :=[^;]+;/)[0]);
  const frame = { Status: {}, xGlobalError: false, xIoEmergencyStopActive: true };
  permit(frame); assert.equal(frame.Status.xAutomaticAllowed, false);
  const catalog = JSON.parse(readFileSync(new URL('../alarm-catalog.json', import.meta.url), 'utf8'));
  for (const doc of ['15-equipment-error-reset-table.md', '16-cell-warnings.md']) assert.ok(readFileSync(new URL(`../../DOKS/${doc}`, import.meta.url), 'utf8').includes(catalog.warnings.cell['27']));
});

test('actual gripper DO handover returns the separate program level and never stores a manual level as the program command', () => {
  const s = outputRuntime(); s.base[16] = true; beginManual(s);
  outputRequest(s, 16, false);
  for (let i = 0; i < 5; i++) { outputScan(s); assert.equal(s.axIoOutput[16], false); assert.equal(s.axIoAutoDo[16], true); }
  outputRequest(s, 0, false, 9);
  assert.equal(s.GVL_PHYSICAL_IO.xDoGripper1Open, true);
  assert.equal(s.base[16], true);
});

test('actual PLC packing uses each DO bit for on/off permits, forcing and inhibition, including bit 31 and DO 50', () => {
  const source = read('PLC_PRG.RecordIoDiagnostics.st');
  const block = source.slice(source.lastIndexOf('FOR uiIoIndex := UINT#1 TO UINT#50 DO')).replace(/\bOR\b/g, '|');
  const pack = stProgram(block);
  const s = outputRuntime(); Object.assign(s, { uiIoWord: 0, uiIoBit: 0, dwIoBit: 0, SHL: (a, b) => (a << b) >>> 0 });
  for (const name of ['adwIoDo', 'adwIoDoAllowed', 'adwIoDoOnAllowed', 'adwIoForcedDo', 'adwIoInhibitedDo']) s.GVL_HMI[name] = [0, 0, 0];
  for (const name of ['axIoDoAllowed', 'axIoDoOnAllowed', 'axIoDoForced', 'axIoDoInhibited', 'axIoOutput']) { s[name][32] = true; s[name][50] = true; }
  pack(s);
  for (const name of ['adwIoDo', 'adwIoDoAllowed', 'adwIoDoOnAllowed', 'adwIoForcedDo', 'adwIoInhibitedDo']) {
    assert.equal(s.GVL_HMI[name][1] >>> 0, 0x80000000, name); assert.equal(s.GVL_HMI[name][2], 1 << 17, name);
  }
});

test('actual snapshot ST keeps revision odd throughout event append and all DI/DO mask publication', () => {
  const source = read('PLC_PRG.RecordIoDiagnostics.st').split('// --- BEGIN IMPLEMENTATION ---')[1]
    .replace(/\bOR\s+(dwIoBit|SHL\()/g, '| $1');
  const record = stProgram(source), s = outputRuntime(), r = ring();
  for (const [key, value] of Object.entries(r)) if (key !== 'GVL_HMI') s[key] = value;
  Object.assign(s.GVL_HMI, r.GVL_HMI);
  Object.assign(s, { uiIoWord: 0, uiIoBit: 0, dwIoBit: 0, SHL: (a, b) => (a << b) >>> 0,
    axIoRawDi: Array(85).fill(false), axIoUsedDi: Array(85).fill(false), axIoForced: Array(85).fill(false),
    axIoPreviousRaw: Array(85).fill(false), axIoPreviousUsed: Array(85).fill(false), axIoPreviousOutput: Array(51).fill(false),
    axPhysicalFiltered: Array(81).fill(false), axPhysicalRaw: Array(85).fill(false),
  });
  for (const name of ['adwIoRawDi', 'adwIoUsedDi', 'adwIoForcedDi', 'adwIoDo', 'adwIoDoAllowed', 'adwIoDoOnAllowed', 'adwIoForcedDo', 'adwIoInhibitedDo']) s.GVL_HMI[name] = Array(4).fill(0);
  s.AppendIoEvent = (args) => {
    assert.equal(s.GVL_HMI.udiIoJournalRevision % 2, 1);
    Object.assign(s, args); append(s);
    assert.equal(s.GVL_HMI.udiIoJournalRevision % 2, 1);
  };
  s.axIoRawDi[1] = true; s.axPhysicalFiltered[1] = true; s.GVL_PHYSICAL_IO.xDoSignalTowerGreenOutput = true;
  record(s);
  assert.equal(s.GVL_HMI.uiIoJournalCount, 3); assert.equal(s.GVL_HMI.udiIoJournalRevision, 2); assert.equal(s.xIoSnapshotPublishing, false);
  assert.equal(s.GVL_HMI.adwIoRawDi[1], 1); assert.equal(s.GVL_HMI.adwIoUsedDi[1], 1);
  assert.equal(s.GVL_HMI.adwIoDo[1], 1 << 23);
});

test('software stop reaches the actual motion owners before diagnostics and new warnings have matching catalog entries', () => {
  const source = read('PLC_PRG.st');
  assert.ok(source.indexOf('ReadIoEmergencyStop();') < source.indexOf('RunRobotModbus();'));
  assert.ok(source.indexOf('RunSafety();') < source.indexOf('ResetIoEmergencyStop();'));
  for (const file of ['PLC_PRG.RunMotion.st', 'PLC_PRG.RunRobot.st', 'PLC_PRG.RunTwoPallet.st', 'PLC_PRG.RunTwoPalletAxis.st']) assert.match(read(file), /GVL_HMI\.xIoEmergencyStopActive/, file);
  const catalog = JSON.parse(readFileSync(new URL('../alarm-catalog.json', import.meta.url), 'utf8'));
  for (const [code, name] of [[32, 'WRN_IO_DO_REJECTED'], [33, 'WRN_IO_EMERGENCY_RESET_REJECTED']]) {
    const text = catalog.warnings.cell[code]; assert.ok(text);
    assert.match(read('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st'), new RegExp(`${name}[^\\r\\n]*${code}`));
    for (const file of ['15-equipment-error-reset-table.md', '16-cell-warnings.md']) {
      const doc = readFileSync(new URL(`../../DOKS/${file}`, import.meta.url), 'utf8');
      assert.ok(doc.includes(`| Ячейка, W${code} | \`${name}\``)); assert.ok(doc.includes(text));
    }
  }
});
function ring() {
  return { GVL_HMI: { udiIoBootCounter: 7, udiIoJournalRevision: 0, udiIoJournalSequence: 0, uiIoJournalHead: 0, uiIoJournalCount: 0, asIoJournal: Array(101).fill('') },
    astIoEvent: Array.from({ length: 101 }, () => ({})), uiSlot: 0, sEvent: '', uliIoClockMs: 0,
    usiDirection: 1, uiIndex: 79, usiKind: 2, xOld: false, xNew: true, xIoSnapshotPublishing: false,
    MIN: Math.min, CONCAT: (a, b) => String(a) + String(b),
    UDINT_TO_STRING: String, ULINT_TO_STRING: String, UINT_TO_STRING: String, USINT_TO_STRING: String, BOOL_TO_USINT: Number };
}

test('actual ST append keeps newest 100 entries, wraps head and publishes matching typed/string records', () => {
  const state = ring();
  for (let i = 1; i <= 250; i++) { state.uliIoClockMs = i * 20; state.xOld = i % 2 === 0; state.xNew = !state.xOld; append(state); }
  const h = state.GVL_HMI;
  assert.equal(h.uiIoJournalCount, 100);
  assert.equal(h.uiIoJournalHead, 50);
  assert.equal(h.udiIoJournalSequence, 250);
  assert.equal(h.udiIoJournalRevision, 500);
  const events = h.asIoJournal.slice(1).map(parseIoEvent).sort((a, b) => a.sequence - b.sequence);
  assert.deepEqual(events.map((event) => event.sequence), Array.from({ length: 100 }, (_, i) => i + 151));
  assert.equal(events.at(-1).timeMs, 5000);
  assert.equal(state.astIoEvent[50].udiSequence, 250);
  assert.equal(state.astIoEvent[50].xNew, events.at(-1).newValue);
  assert.ok(h.asIoJournal.every((text) => text.length <= 96));
});

test('actual ST handles UDINT sequence/revision/boot overflow without ambiguous zero sequence', () => {
  const state = ring();
  Object.assign(state.GVL_HMI, { udiIoJournalSequence: 0xffffffff, udiIoJournalRevision: 0xfffffffe, udiIoBootCounter: 0xffffffff, uiIoJournalHead: 95, uiIoJournalCount: 100 });
  append(state);
  assert.equal(state.GVL_HMI.udiIoBootCounter, 1);
  assert.equal(state.GVL_HMI.udiIoJournalSequence, 1);
  assert.equal(state.GVL_HMI.uiIoJournalHead, 1);
  assert.equal(state.GVL_HMI.uiIoJournalCount, 1);
  assert.equal(state.GVL_HMI.udiIoJournalRevision, 0);
  assert.equal(parseIoEvent(state.GVL_HMI.asIoJournal[1]).sequence, 1);
});

const elapsed = stProgram(overrides.slice(overrides.indexOf('IF udiIoNowMs >= udiIoLastTickMs'), overrides.indexOf('tonIoOverrideWatchdog(')));
const leaseAge = stProgram(overrides.slice(overrides.indexOf('IF udiIoNowMs >= GVL_HMI.udiIoOverrideHeartbeatAtMs'), overrides.indexOf('xIoBusy :=')));

test('actual PLC clock extends TIME rollover and a heartbeat buffered during STOP expires', () => {
  const state = { udiIoNowMs: 15, udiIoLastTickMs: 0xfffffff0, uliIoClockMs: 5000, uliIoLeaseAgeMs: 0,
    GVL_HMI: { sIoClockMs: '', udiIoOverrideHeartbeatAtMs: 0xfffffff0 }, UDINT_TO_ULINT: Number, ULINT_TO_STRING: String };
  elapsed(state); leaseAge(state);
  assert.equal(state.uliIoClockMs, 5031);
  assert.equal(state.GVL_HMI.sIoClockMs, '5031');
  assert.equal(state.uliIoLeaseAgeMs, 31);
  state.udiIoNowMs = 3015;
  elapsed(state); leaseAge(state);
  assert.equal(state.uliIoClockMs, 8031);
  assert.equal(state.uliIoLeaseAgeMs, 3031);
  // PLC, остановленный дольше аренды страницы, не принимает старую отметку heartbeat как новую.
  state.udiIoNowMs = 10000;
  state.GVL_HMI.udiIoOverrideHeartbeatAtMs = 3000;
  leaseAge(state);
  assert.equal(state.uliIoLeaseAgeMs, 7000);
});

function stoppedManual() {
  const empty = () => ({ xRunning: false, xBusy: false, xStopPending: false, xProcessing: false });
  const axis = () => ({ xJogPositive: false, xJogNegative: false, xHome: false, xMoveAbsolute: false, xMoveRelative: false });
  return { xPhysicalNormal: true, xHmiConnectionAlive: true, udiIoHeartbeatSeen: 1, uliIoLeaseAgeMs: 0, tonIoOverrideWatchdog: { Q: false },
    xIoBusy: false, uiIoIndex: 0, xMotionBusy: false, xGroupMotionBusy: false, xPointCheckActive: false,
    xPointCheckRequest: false, xPowerTransitionActive: false, SIMULATION_DYNAMICS: empty(),
    GVL_CELL_MANAGER: { Status: empty() }, GVL_CELL_CONTROL: { xManual: true, xStart: false }, GVL_ROBOT: { Status: empty() },
    GVL_MACHINE: { Status: [null, empty(), empty(), empty()] }, GVL_MAGAZINE: { astStatus: [null, empty(), empty()] },
    GVL_TWO_PALLET: { astStatus: [null, empty(), empty()] },
    GVL_PHYSICAL_IO: { xMappingVerified: true, xDiMachine1CycleActive: false, xDiMachine2CycleActive: false, xDiMachine3CycleActive: false },
    GVL_HMI: { xTestSessionActive: false, xRobotManualExecute: false, stRobotCommand: { xExecute: false }, udiTwinCommandSeq: 0, udiTwinAckSeq: 0,
      xIoEmergencyStopActive: false, udiIoEmergencyCommandSeq: 0, udiIoEmergencyAckSeq: 0, udiCellModeCommandSeq: 0, udiCellModeAckSeq: 0,
      astAxisHmiCommand: [null, axis(), axis(), axis()],
      ...Object.fromEntries(['axMachineManualHatchOpen', 'axMachineManualHatchClose', 'axMachineManualHatchUnlock', 'axMachineManualHatchLock', 'axMachineManualChuckOpen', 'axMachineManualChuckClose'].map((name) => [name, [false, false, false, false]])) } };
}

test('actual PLC entry requires Manual and a live explicit request but never waits on stuck owners', () => {
  const allowed = outputRuntime(); outputScan(allowed);
  assert.equal(allowed.GVL_HMI.xIoManualStartAllowed, true);
  assert.equal(allowed.GVL_HMI.xIoOverrideAllowed, false);
  for (const change of [
    (s) => { s.GVL_CELL_CONTROL.xManual = false; },
    (s) => { s.GVL_HMI.udiCellModeCommandSeq = 1; s.GVL_HMI.xCellManualRequest = false; },
  ]) {
    const s = outputRuntime(); change(s); outputRequest(s, 0, false, 8);
    assert.equal(s.GVL_HMI.xIoManualStartAllowed, false);
    assert.equal(s.GVL_HMI.xIoManualControlActive, false);
    assert.equal(s.GVL_HMI.uiIoOverrideResult, 2);
    assert.equal(s.GVL_HMI.udiIoOverrideAckSeq, s.GVL_HMI.udiIoOverrideCommandSeq);
  }
  for (const change of [
    (s) => { s.GVL_CELL_MANAGER.Status.xRunning = true; }, (s) => { s.GVL_CELL_MANAGER.Status.xStopPending = true; },
    (s) => { s.GVL_ROBOT.Status.xBusy = true; }, (s) => { s.xMotionBusy = true; },
    (s) => { s.GVL_MACHINE.Status[3].xProcessing = true; }, (s) => { s.GVL_TWO_PALLET.astStatus[2].xBusy = true; },
    (s) => { s.GVL_HMI.astAxisHmiCommand[3].xJogPositive = true; }, (s) => { s.GVL_HMI.axMachineManualChuckClose[1] = true; },
    (s) => { s.GVL_HMI.udiTwinCommandSeq = 1; }, (s) => { s.xPointCheckRequest = true; },
    (s) => { s.GVL_PHYSICAL_IO.xDiMachine3CycleActive = true; },
  ]) {
    const s = outputRuntime(); change(s); outputRequest(s, 0, false, 8);
    assert.equal(s.GVL_HMI.xIoManualStartAllowed, false);
    assert.equal(s.GVL_HMI.xIoManualControlActive, true);
    assert.equal(s.GVL_HMI.uiIoOverrideResult, 1);
    assert.equal(s.GVL_HMI.udiIoOverrideAckSeq, s.GVL_HMI.udiIoOverrideCommandSeq);
  }
  for (const change of [
    (s) => { s.fresh = false; }, (s) => { s.xHmiConnectionAlive = false; },
    (s) => { s.tonIoOverrideWatchdog.Q = true; }, (s) => { s.uliIoLeaseAgeMs = 3001; },
  ]) {
    const s = outputRuntime(); change(s); outputRequest(s, 0, false, 8);
    assert.equal(s.GVL_HMI.uiIoOverrideResult, 4);
    assert.equal(s.GVL_HMI.xIoManualControlActive, false);
    s.fresh = true; s.xHmiConnectionAlive = true; s.tonIoOverrideWatchdog.Q = false; s.uliIoLeaseAgeMs = 0;
    outputScan(s); assert.equal(s.GVL_HMI.xIoManualControlActive, false);
  }
});

test('raw klemmas have a single reader, overrides precede filters and output capture follows hardware assignment', () => {
  const inputs = read('PLC_PRG.ReadPhysicalInputs.st');
  const capture = read('PLC_PRG.RecordIoDiagnostics.st');
  const program = read('PLC_PRG.st');
  for (const signal of map.channels) {
    const expected = signal.direction === 'DI'
      ? `axPhysicalRaw[${signal.index}] := GVL_PHYSICAL_IO.${signal.variable};`
      : `axIoOutput[${signal.index}] := GVL_PHYSICAL_IO.${signal.variable};`;
    assert.ok((signal.direction === 'DI' ? inputs : capture).includes(expected), expected);
  }
  assert.ok(inputs.indexOf('axIoRawDi[uiIoIndex] := axPhysicalRaw') < inputs.indexOf('ReadIoOverrides();'));
  assert.ok(inputs.indexOf('ReadIoOverrides();') < inputs.indexOf('afbPhysicalInputFilter[uiPhysicalInput]('));
  assert.doesNotMatch(strip(inputs + overrides + capture), /GVL_PHYSICAL_IO\.xDi\w+\s*:=/);
  assert.ok(program.indexOf('WritePhysicalOutputs();') < program.indexOf('RecordIoDiagnostics();'));
  assert.match(capture, /IF xIoInitialized AND \(axIoRawDi/);
  assert.match(capture, /xIoInitialized := TRUE/);
  assert.match(program, /astIoEvent : ARRAY \[1\.\.100\]/);
});

test('PLC auto-releases all overrides, never replays rejected requests, and publishes WARNING W31', () => {
  assert.match(overrides, /IF NOT GVL_HMI\.xIoOverrideAllowed THEN[\s\S]*?usiKind := USINT#6[\s\S]*?axIoForced\[uiIoIndex\] := FALSE/);
  assert.match(overrides, /IsHmiCommandFresh\(udiIssuedAtMs := GVL_HMI\.udiIoOverrideIssuedAtMs\)/);
  assert.match(overrides, /udiIoOverrideAckSeq := udiIoRequestSeq/);
  const manager = read('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st');
  assert.match(manager, /WRN_IO_OVERRIDE_REJECTED\s*: UINT := UINT#31/);
  assert.match(manager, /IF xIoOverrideRejected THEN[\s\S]*?Diag\.stWarning\.uiCode := WRN_IO_OVERRIDE_REJECTED/);
  assert.match(read('FB/FB_ALARM_MANAGER.st'), /eEffect := E_ALARM_EFFECT\.WARNING/);
  const catalog = JSON.parse(readFileSync(new URL('../alarm-catalog.json', import.meta.url), 'utf8'));
  const message = catalog.warnings.cell['31'];
  assert.ok(message?.includes('Ручная подмена входа отклонена'));
  for (const file of ['15-equipment-error-reset-table.md', '16-cell-warnings.md']) {
    const doc = readFileSync(new URL(`../../DOKS/${file}`, import.meta.url), 'utf8');
    assert.ok(doc.includes(`| Ячейка, W31 | \`WRN_IO_OVERRIDE_REJECTED\``));
    assert.ok(doc.includes(message));
  }
  const hmi = read('GVL/GVL_HMI.gvl.st');
  assert.match(hmi, /'read'\}\s+xIoOverrideAllowed/);
  assert.match(hmi, /asIoJournal : ARRAY \[1\.\.100\] OF STRING\(96\)/);
  assert.doesNotMatch(hmi.split('VAR_GLOBAL RETAIN')[1], /Forced|asIoJournal|OverrideValue/);
});
