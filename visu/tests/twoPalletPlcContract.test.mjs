// Source contracts only: these checks do not compile or execute CODESYS/ST.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
const root = new URL('../../Portal_robot/Device/application/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const fb = read('FB/FB_TWO_PALLET.st');

// Evaluate only Boolean expressions read from the ST source, not a duplicate
// permission model. This is a static truth-table check, not a CODESYS runtime.
function stBoolean(expression, values) {
  const code = expression.replace(/\b(?:UINT|DWORD)#(\d+)\b/g, '$1')
    .replace(/\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\[\w+\])*/g, (name) => {
      const operators = { AND: '&&', OR: '||', NOT: '!', TRUE: 'true', FALSE: 'false' };
      if (name in operators) return operators[name];
      assert.ok(Object.hasOwn(values, name), `Missing ST value: ${name}`);
      assert.ok(typeof values[name] === 'boolean' || typeof values[name] === 'number');
      return JSON.stringify(values[name]);
    }).replace(/<>/g, '!==').replace(/(?<![<>!=])=(?!=)/g, '===');
  return Function(`"use strict"; return Boolean(${code});`)();
}
function plcPermission(name, values, source = fb) {
  const start = source.indexOf(`${name} :=`);
  assert.ok(start >= 0, `Missing PLC permission: ${name}`);
  const expression = source.slice(start + name.length + 3, source.indexOf(';', start));
  return stBoolean(expression, values);
}

test('both magazine modes enumerate slots along robot X before advancing Y', () => {
  const robot = read('PLC_PRG.RunRobot.st');
  const slotPoint = robot.slice(robot.indexOf('uiRobotManualMagazineIndex := SINT_TO_UINT'), robot.indexOf('// Signed-смещение добавляется к базе'));
  assert.match(slotPoint, /uiRobotManualMagazineColumn := uiRobotManualMagazineIndex MOD GVL_CELL_SETTINGS.MagazineColumns/);
  assert.match(slotPoint, /uiRobotManualMagazineRow := uiRobotManualMagazineIndex \/ GVL_CELL_SETTINGS.MagazineColumns/);
  assert.match(slotPoint, /\.X :=[\s\S]*?uiRobotManualMagazineColumn\) \* GVL_HMI.MagazinePitchX/);
  assert.match(slotPoint, /\.Y :=[\s\S]*?uiRobotManualMagazineRow\) \* GVL_HMI.MagazinePitchY/);
  assert.doesNotMatch(slotPoint, /IF GVL_TWO_PALLET.uiMode = 1 THEN/);
  const model = readFileSync(new URL('../../visu/src/three/twoPalletMagazine.ts', import.meta.url), 'utf8');
  const grid = model.slice(model.indexOf('const slotPosition ='), model.indexOf('export interface TwoPalletMagazineRig'));
  assert.match(grid, /const column = slot % D.columns/);
  assert.match(grid, /const row = Math.floor\(slot \/ D.columns\)/);
  // The +90 degree magazine rotation maps local Z (the column) to world X.
  assert.match(grid, /return \[\s*\(row[^\n]*\* D.pitchX,\s*\(column[^\n]*\* D.pitchY/);
  const scene = readFileSync(new URL('../../visu/src/three/cellScene.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(scene, /controller\.follow\(/);
});

test('PLC exchange feeds before its final lift step; manual raise only requires standstill', () => {
  const move = fb.slice(
    fb.indexOf('\n\tE_TWO_PALLET_STATE.AUTO_MOVE_TO_EXCHANGE,'),
    fb.indexOf('\n\tE_TWO_PALLET_STATE.AUTO_SELECT_PALLET,'),
  );
  assert.match(move, /NOT Input.xLiftDown\s+OR Input.xLiftUp/);
  assert.match(move, /Input.xStandstill\s+AND \(ABS\(Input.lrPosition - lrTarget\)/);
  assert.match(move, /AUTO_MOVE_TO_WORK THEN\s+Diag\.eState := E_TWO_PALLET_STATE\.AUTO_RAISE/);
  assert.doesNotMatch(move, /xLiftUpCommand := TRUE/);

  const lift = fb.slice(
    fb.indexOf('\n\tE_TWO_PALLET_STATE.AUTO_RAISE:'),
    fb.indexOf('\n\tE_TWO_PALLET_STATE.MANUAL_RAISE:'),
  );
  assert.match(lift, /IF NOT xWork\s+OR Status.xHomeRequired/);
  assert.match(lift, /IF uiSignals = uiTargetSignals THEN/);
  const manual = fb.slice(fb.indexOf('\n\tE_TWO_PALLET_STATE.MANUAL_RAISE:'), fb.indexOf('\n\tE_TWO_PALLET_STATE.MANUAL_HOME:'));
  assert.match(manual, /IF NOT Input.xStandstill OR NOT xManual OR xContradiction OR Status.xHomeRequired THEN/);
  assert.match(manual, /xLiftUpCommand := TRUE/);
  assert.doesNotMatch(manual, /xWork|xExchange|lrPosition|Input.xHomed/);
  const permission = fb.slice(fb.indexOf('Status.xRaiseAllowed :='), fb.indexOf('Status.xSelectAllowed :='));
  assert.match(permission, /xRecovery[\s\S]*?NOT xContradiction[\s\S]*?NOT Status.xHomeRequired/);
  assert.doesNotMatch(permission, /xWork|xExchange|lrPosition|Input.xHomed/);
  assert.match(fb, /xWork := xConfigValid\s+AND Input.xHomed\s+AND Input.xStandstill/);
});

test('axis references are validated before each FB call; Home requires lower reed throughout and latches Done', () => {
  const axis = read('PLC_PRG.RunTwoPalletAxis.st');
  for (const id of [1, 2]) {
    assert.match(axis, new RegExp(`IF __ISVALIDREF\\(GVL_TWO_PALLET.Axis${id}\\) THEN\\s+TWIN_AXIS_${id}\\(`));
  }
  assert.match(fb, /Status.xHomeAllowed :=[\s\S]*?Input.xLiftDown\s+AND NOT Input.xLiftUp\s+AND xPairValid/);
  assert.match(fb, /Diag\.eState = E_TWO_PALLET_STATE\.MANUAL_HOME\)[\s\S]*?OR \(Diag\.eState = E_TWO_PALLET_STATE\.MANUAL_JOG\)[\s\S]*?AND \(NOT Input.xLiftDown/);
  assert.match(fb, /IF xSeenDone\s+AND Input.xHomed\s+AND Input.xStandstill\s+AND NOT xStateEntry THEN\s+Status.xHomeRequired := FALSE/);

  const reset = fb.slice(fb.indexOf('ELSIF Command.xReset THEN'), fb.indexOf('ELSIF Command.xJogPositive'));
  assert.match(reset, /Status.xConfirmed := FALSE;\s+Status.xEnabled := FALSE/);
  assert.doesNotMatch(reset, /xHomeRequired := FALSE|xMove := TRUE|xHome := TRUE/);
});

test('PLC owns per-pallet edit permissions and does not write into FB outputs from outside', () => {
  const run = read('PLC_PRG.RunTwoPallet.st');
  assert.match(run, /xRobotOperation := xTwinRobotOperation/);
  assert.match(run, /xTwinRobotOperation := GVL_MAGAZINE.astPartStatus\[uiTwin\].xBusy[\s\S]*?xDisablePending[\s\S]*?astAutoCommand\[uiTwin\].xExecute[\s\S]*?astCommand\[uiTwin\].xExecute/);
  assert.match(run, /xActivePalletEditAllowed := NOT xTwinRobotOperation/);
  for (const id of [1, 2]) {
    assert.match(fb, new RegExp(`Status\\.xEdit${id}Allowed := xSelected`));
  }
  assert.doesNotMatch(run, /TWIN\[[^\]]+\]\.Status\.[A-Za-z0-9_]+\s*:=/);
  assert.match(run, /Command := astTwinCommand\[uiTwin\]/);
  assert.match(run, /xRobotGeometryReady := NOT GVL_HMI.xModbusMode AND xPointTableReady/);
  assert.match(run, /uiTwinSlot := 1 TO 96/);
  assert.match(run, /xStopRequest := GVL_CELL_CONTROL.xStop OR GVL_HMI.astMagazineCommand\[uiTwin\].xStop/);
  assert.match(read('PLC_PRG.RunMagazine.st'), /astStore\[uiTwin\].astPallet\[uiTwinPallet\] := GVL_DETAIL.astMagazine\[uiTwin\]/);
  const main = read('PLC_PRG.st');
  assert.ok(main.indexOf('RunTwoPallet();') < main.indexOf('RunCellControl();'));
  assert.ok(main.indexOf('RunMagazine();') < main.indexOf('RunTwoPalletAxis();'));
  assert.match(run, /NOT CELL_SAFETY.astEnclosureDoorStatus\[uiTwin \* 2\].xUnlockOutput/);
  assert.ok(fb.indexOf('Status.xEdit1Allowed :=') > fb.indexOf('IF Status.xBusy THEN'));
  assert.doesNotMatch(fb, /Status\.xEdit(?:1|2)?Allowed := FALSE/);
  const released = { 'GVL_MAGAZINE.astPartStatus[uiTwin].xBusy': false,
    'GVL_MAGAZINE.astPartStatus[uiTwin].xDisablePending': false,
    'GVL_MAGAZINE.astAutoCommand[uiTwin].xExecute': false, 'GVL_MAGAZINE.astCommand[uiTwin].xExecute': false,
    'GVL_ROBOT.Status.xBusy': false, xMotionBusy: false, 'GVL_ROBOT.Status.uiMagazineContext': 0, uiTwin: 1 };
  assert.equal(plcPermission('xTwinRobotOperation', released, run), false);
  for (const key of ['GVL_MAGAZINE.astPartStatus[uiTwin].xBusy', 'GVL_MAGAZINE.astPartStatus[uiTwin].xDisablePending',
    'GVL_MAGAZINE.astAutoCommand[uiTwin].xExecute', 'GVL_MAGAZINE.astCommand[uiTwin].xExecute']) {
    assert.equal(plcPermission('xTwinRobotOperation', { ...released, [key]: true }, run), true);
  }
  for (const motion of [{ 'GVL_ROBOT.Status.xBusy': true }, { xMotionBusy: true }]) {
    assert.equal(plcPermission('xTwinRobotOperation', { ...released, ...motion, 'GVL_ROBOT.Status.uiMagazineContext': 1 }, run), true);
    assert.equal(plcPermission('xTwinRobotOperation', { ...released, ...motion, 'GVL_ROBOT.Status.uiMagazineContext': 2 }, run), false);
  }
});

test('operator exchange is independent of the running cycle and reserves the automatic scheduler window', () => {
  const operator = fb.slice(fb.indexOf('Status.xSwapAllowed :='), fb.indexOf('xAutoSwapAllowed :='));
  assert.match(operator, /\(\(xManual AND xRobotIdle\) OR \(NOT xManual AND xRobotClear\)\)/);
  assert.doesNotMatch(operator, /xConfirmAllowed|xRecovery|xRobotGeometryReady|xRobotMagazineReady|xEnableAllowed/);
  const command = fb.slice(fb.indexOf('ELSIF Command.xSwap THEN'), fb.indexOf('ELSIF Command.xPowerOn THEN'));
  assert.match(command, /xExchangeStartedManual := xManual;\s+Diag.eState := E_TWO_PALLET_STATE.AUTO_LOWER/);
  assert.match(fb, /xAutomaticState AND \(\(xExchangeStartedManual AND \(NOT xManual OR NOT xRobotIdle\)\)\s+OR \(NOT xExchangeStartedManual AND NOT xRobotClear\)\)/);
  assert.match(fb, /IF xAutoSwap[\s\S]*?THEN\s+xExchangeStartedManual := FALSE/);
  assert.match(fb, /IF Diag.eState = E_TWO_PALLET_STATE.IDLE THEN xExchangeStartedManual := FALSE/);
  assert.match(fb, /xAutoSwapAllowed := Status\.xEnableAllowed\s+AND xRobotClear\s+AND Status\.xEnabled\s+AND xOtherLoaded/);
  assert.match(fb, /IF xAutoSwap\s+AND xAutoSwapAllowed/);
  assert.match(fb, /Status\.xEnableAllowed := xBase\s+AND xConnection[\s\S]*?AND xRobotMagazineReady/);
  assert.match(fb, /Status\.xStartAllowed := Status\.xConfirmAllowed\s+AND xRobotMagazineReady/);
  assert.doesNotMatch(fb, /xRobotEnableReady/);
  const run = read('PLC_PRG.RunTwoPallet.st');
  assert.match(run, /xRobotIdle := NOT GVL_ROBOT.Status.xBusy AND NOT xMotionBusy/);
  assert.match(run, /xRobotGeometryReady := NOT GVL_HMI\.xModbusMode AND xPointTableReady/);
  assert.match(run, /xRobotMagazineReady := GVL_MAGAZINE\.astPartStatus\[uiTwin\]\.xEnableCheckNoError[\s\S]*?xEnableCheckGeometry/);
  const magazine = read('FB/FB_MAGAZINE.st');
  const magazineEnable = magazine.slice(magazine.indexOf('Status.xEnableSequenceAllowed :='), magazine.indexOf('// Finished'));
  assert.doesNotMatch(magazineEnable, /xEnableCheckContent/);
  assert.doesNotMatch(magazineEnable, /xEnableCheckRobotReady|xEnableCheckRobotReleased/);
  assert.match(magazine, /Status\.xReady := xMechanismReady[\s\S]*?AND xRobotCanWorkWithMagazine/);
  assert.doesNotMatch(magazine, /WRN_ENABLE_ROBOT_NOT_READY/);
});

test('PLC operator exchange truth table permits automatic production only with the magazine disabled and released', () => {
  const ready = { xBase: true, xConnection: true, xIdle: true, 'Input.xStandstill': true,
    'Input.xPowered': true, 'Error.dwErrorActive': 0, 'Status.xConfirmed': true,
    uiCandidate: 1, 'Status.uiRobotPallet': 1, 'Status.xEnabled': false, xStopRequest: false,
    xManual: false, xRobotIdle: true, xRobotClear: true };
  assert.equal(plcPermission('Status.xSwapAllowed', ready), true);
  for (const blocked of [{ xBase: false }, { xConnection: false }, { xIdle: false },
    { 'Input.xStandstill': false }, { 'Input.xPowered': false }, { 'Error.dwErrorActive': 0x100 },
    { 'Status.xConfirmed': false }, { uiCandidate: 0 }, { uiCandidate: 2 },
    { 'Status.xEnabled': true }, { xStopRequest: true }, { xRobotClear: false }]) {
    assert.equal(plcPermission('Status.xSwapAllowed', { ...ready, ...blocked }), false, JSON.stringify(blocked));
  }
  assert.equal(plcPermission('Status.xSwapAllowed', { ...ready, xManual: true, xRobotClear: false }), true);
  assert.equal(plcPermission('Status.xSwapAllowed', { ...ready, xManual: true, xRobotClear: false, xRobotIdle: false }), false);
  assert.equal(plcPermission('xBase', { xSelected: true, xConfigValid: true,
    'Input.xIoMapped': true, 'Input.xAxisBound': true, xSafe: true, xRobotOperation: true }), false);
});

test('PLC inventory truth table keeps the operator pallet editable independently of mechanism and mode', () => {
  for (const robot of [1, 2]) for (const enabled of [false, true]) for (const released of [false, true]) {
    const values = { xSelected: true, 'Status.uiRobotPallet': robot, 'Status.xEnabled': enabled,
      xActivePalletEditAllowed: released };
    for (const pallet of [1, 2]) {
      assert.equal(plcPermission(`Status.xEdit${pallet}Allowed`, values),
        pallet !== robot || (!enabled && released), `${robot}/${enabled}/${released}/${pallet}`);
      assert.equal(plcPermission(`Status.xEdit${pallet}Allowed`, { ...values, xSelected: false }), false);
    }
  }
});

test('idle Stop preserves the PLC confirmation and does not start MC_Stop; an active or moving mechanism is interrupted', () => {
  const command = fb.slice(fb.indexOf('ELSIF Command.xStop THEN'), fb.indexOf('ELSIF Command.xReset THEN'));
  const cell = fb.slice(fb.indexOf('\nIF xStopRequest THEN'), fb.indexOf('// Команда могла сменить состояние'));
  for (const block of [command, cell]) {
    const condition = block.match(/IF (\(Diag\.eState[^\n]+) THEN/)?.[1];
    assert.ok(condition);
    for (const [state, powered, standstill, interrupted] of [[0, true, true, false], [20, true, true, true],
      [0, true, false, true], [0, false, false, false]]) {
      assert.equal(stBoolean(condition, { 'Diag.eState': state, 'E_TWO_PALLET_STATE.IDLE': 0,
        'Input.xPowered': powered, 'Input.xStandstill': standstill }), interrupted);
    }
    const guard = block.slice(block.indexOf('IF (Diag.eState'), block.indexOf('END_IF;'));
    assert.match(guard, /Status.xConfirmed := FALSE/);
    assert.match(guard, /Output.xStop := TRUE/);
    assert.match(guard, /ERR_SEQUENCE_INTERRUPTED/);
    assert.doesNotMatch(block.slice(block.indexOf('END_IF;')), /Status.xConfirmed := FALSE|Output.xStop := TRUE/);
  }
});

test('PLC detects all six configured reeds and switches lock and stop from independent targets', () => {
  const config = read('ST/ST_MAGAZINE/ST_TWO_PALLET_CONFIG.st');
  for (const field of ['uiP1Signals', 'uiP2Signals']) assert.match(config, new RegExp(`${field}\\s*:\\s*UINT`));
  for (const [field, bit] of [['LiftDown', 1], ['LiftUp', 2], ['LockIn', 4], ['LockOut', 8], ['StopIn', 16], ['StopOut', 32]]) {
    assert.match(fb, new RegExp(`IF Input\\.x${field} THEN uiSignals := uiSignals OR UINT#${bit}; END_IF`));
  }
  assert.match(fb, /AND \(uiSignals = uiSelectedSignals\)/);
  assert.match(fb, /xLockOutTarget := \(uiTargetSignals AND UINT#8\)/);
  assert.match(fb, /xStopOutTarget := \(uiTargetSignals AND UINT#32\)/);
  assert.match(fb, /Output.xStopOut := \(xBase AND xSelectCommand AND xStopOutTarget/);
  assert.doesNotMatch(fb, /Config.xP1LockOut|Input.xLockOut <> Input.xStopOut/);
  const method = read('FB/FB_TWO_PALLET.IsSignalConfigurationValid.st');
  for (const mask of [3, 12, 48]) for (const pallet of [1, 2]) {
    assert.ok(method.includes(`uiP${pallet}Signals AND UINT#${mask}`));
  }
  assert.match(method, /\(uiP1Signals AND UINT#60\) <> \(uiP2Signals AND UINT#60\)/);
  const run = read('PLC_PRG.RunTwoPallet.st');
  assert.match(run, /IF NOT GVL_TWO_PALLET.astActiveConfig\[uiTwin\].xSignalPatternsConfigured THEN/);
  assert.match(run, /astActiveConfig\[uiTwin\].uiP1Signals := UINT#26/);
  assert.match(run, /astActiveConfig\[uiTwin\].uiP2Signals := UINT#38/);
  assert.match(run, /stTwinRequest.uiCommand = UINT#24 THEN[\s\S]*?xSignalPatternsConfigured[\s\S]*?TWIN\[uiTwin\].IsSignalConfigurationValid/);
  assert.match(run, /axTwinConfigurationChanged\[uiTwin\] := TRUE/);
  assert.match(read('PLC_PRG.RunTwoPalletAxis.st'), /uiP1Signals := GVL_TWO_PALLET.astActiveConfig\[uiTwin\].uiP1Signals/);
});

test('resets require an active fault and cannot silently invalidate a healthy magazine', () => {
  assert.match(fb, /Status\.xResetAllowed := xRecovery\s+AND \(Error\.dwErrorActive <> DWORD#0\)/);
  assert.match(fb, /ELSIF Command\.xDriveReset THEN\s+IF Status\.xDriveResetAllowed AND Input\.xDriveError THEN/);
  assert.match(fb, /Status\.xHomeAllowed := xRecovery[\s\S]*?AND Input\.xLiftDown\s+AND NOT Input\.xLiftUp/);
});

test('manual pneumatic recovery is independent and confirmed identity survives an idle HMI timeout', () => {
  const run = read('PLC_PRG.RunTwoPallet.st');
  assert.match(fb, /Status\.xLockAllowed := xPneumaticRecovery/);
  assert.match(fb, /Status\.xStopAllowed := xPneumaticRecovery/);
  const pneumatic = fb.slice(fb.indexOf('xPneumaticBase := '), fb.indexOf('Status.uiCandidate := '));
  assert.doesNotMatch(pneumatic, /xExchange|xWork|xPairValid|xConnection|Input\.xHomed/);
  assert.match(fb, /E_TWO_PALLET_STATE\.MANUAL_LOCK:[\s\S]*?xManualLockCommand/);
  assert.match(fb, /E_TWO_PALLET_STATE\.MANUAL_STOP:[\s\S]*?xManualStopCommand/);
  assert.match(run, /xLockIn := GVL_TWO_PALLET\.auiCommand\[uiTwin\] = UINT#29/);
  assert.match(run, /xStopOut := GVL_TWO_PALLET\.auiCommand\[uiTwin\] = UINT#32/);
  const disable = fb.slice(fb.indexOf('ELSIF Command.xDisable THEN'), fb.indexOf('ELSIF Command.xSwap THEN'));
  assert.doesNotMatch(disable, /xConfirmed := FALSE/);
  assert.match(fb, /IF NOT xConnection THEN Status\.xEnabled := FALSE; END_IF/);
});

test('operator start is atomic and a negative answer raises a dedicated warning', () => {
  const run = read('PLC_PRG.RunTwoPallet.st');
  const command = read('ST/ST_MAGAZINE/ST_TWO_PALLET_COMMAND.st');
  const status = read('ST/ST_MAGAZINE/ST_TWO_PALLET_STATUS.st');
  assert.match(command, /xStart\s*:\s*BOOL/); assert.match(command, /xRejectStart\s*:\s*BOOL/);
  assert.match(status, /xStartAllowed\s*:\s*BOOL/);
  assert.match(run, /xStart := GVL_TWO_PALLET\.auiCommand\[uiTwin\] = UINT#27/);
  assert.match(run, /xRejectStart := GVL_TWO_PALLET\.auiCommand\[uiTwin\] = UINT#28/);
  assert.match(fb, /IF Command\.xStart THEN[\s\S]*?Status\.xConfirmed := TRUE;[\s\S]*?Status\.xEnabled := TRUE/);
  assert.match(fb, /ELSIF Command\.xRejectStart THEN[\s\S]*?WRN_START_REJECTED_BY_OPERATOR/);
});

test('coordinate teaching is accepted by the FB and persisted only from its output pulses', () => {
  const run = read('PLC_PRG.RunTwoPallet.st');
  assert.match(fb, /Status\.xTeachOperatorAllowed := Status\.xMoveAllowed/);
  assert.match(fb, /Command\.xTeachOperator[\s\S]*?Output\.xTeachOperator := TRUE/);
  assert.match(fb, /Command\.xTeachWork[\s\S]*?Output\.xTeachWork := TRUE/);
  assert.match(run, /astOutput\[uiTwin\]\.xTeachOperator[\s\S]*?lrExchange := GVL_TWO_PALLET\.astInput\[uiTwin\]\.lrPosition/);
  assert.match(run, /astOutput\[uiTwin\]\.xTeachWork[\s\S]*?lrWorkP1 := GVL_TWO_PALLET\.astInput\[uiTwin\]\.lrPosition[\s\S]*?lrWorkP2 := GVL_TWO_PALLET\.astInput\[uiTwin\]\.lrPosition/);
});

test('two-pallet FB uses project command, state and diagnostic structures', () => {
  const names = readdirSync(new URL('ST/ST_MAGAZINE/', root)).filter((n) => n.startsWith('ST_TWO_PALLET'));
  const files = [
    'FB/FB_TWO_PALLET.st',
    'FB/FB_TWO_PALLET.IsSignalConfigurationValid.st',
    'FB/FB_TWO_PALLET_SIMULATION.st',
    'PLC_PRG.RunTwoPallet.st',
    'PLC_PRG.RunTwoPalletAxis.st',
    'FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st',
    'ST/ST_MAGAZINE/E_TWO_PALLET_STATE.st',
    ...names.map((n) => `ST/ST_MAGAZINE/${n}`),
  ];
  for (const name of files) {
    const source = read(name).replace(/\/\/[^\n]*|\(\*[\s\S]*?\*\)|'(?:''|[^'])*'/g, '');
    for (const [open, close] of [['IF', 'END_IF'], ['CASE', 'END_CASE'], ['FOR', 'END_FOR'], ['STRUCT', 'END_STRUCT']]) {
      assert.equal((source.match(new RegExp(`\\b${open}\\b`, 'g')) ?? []).length, (source.match(new RegExp(`\\b${close}\\b`, 'g')) ?? []).length, `${name}: ${open}`);
    }
  }
  for (const [name, suffix] of [['Input', 'INPUT'], ['Output', 'OUTPUT'], ['Status', 'STATUS'], ['Config', 'CONFIG']]) {
    const fields = new Set([...read(`ST/ST_MAGAZINE/ST_TWO_PALLET_${suffix}.st`).matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]));
    for (const match of fb.matchAll(new RegExp(`\\b${name}\\.(\\w+)`, 'g'))) {
      assert.ok(fields.has(match[1]), `${name}.${match[1]} is undeclared`);
    }
  }
  for (const [name, suffix] of [['Command', 'COMMAND'], ['Diag', 'DIAG'], ['Error', 'ERRORS']]) {
    const fields = new Set([...read(`ST/ST_MAGAZINE/ST_TWO_PALLET_${suffix}.st`).matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]));
    for (const match of fb.matchAll(new RegExp(`\\b${name}\\.(\\w+)`, 'g'))) {
      assert.ok(fields.has(match[1]), `${name}.${match[1]} is undeclared`);
    }
  }
  assert.match(fb, /Command : ST_TWO_PALLET_COMMAND/);
  assert.match(fb, /Diag : ST_TWO_PALLET_DIAG/);
  assert.match(fb, /Error : ST_TWO_PALLET_ERRORS/);
  assert.match(read('ST/ST_MAGAZINE/E_TWO_PALLET_STATE.st'), /AUTO_MOVE_TO_WORK := 50/);
  assert.match(read('PLC_PRG.RunTwoPallet.st'), /Status => GVL_TWO_PALLET\.astStatus\[uiTwin\][\s\S]*?Diag => GVL_TWO_PALLET\.astDiag\[uiTwin\][\s\S]*?Error => GVL_TWO_PALLET\.astError\[uiTwin\]/);
});

test('scheduler reserves exchange windows and does not launch a robot route while pallets exchange', () => {
  const manager = read('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st');
  assert.match(manager, /IF xMagazineExchangeActive AND[\s\S]*?ELSE\s+CASE eState OF/);
  assert.match(manager, /Status.xMagazineExchangeAllowed := NOT xStopRequested/);
  const run = read('PLC_PRG.RunTwoPallet.st');
  assert.match(run, /AND GVL_CELL_MANAGER.Status.xMagazineExchangeAllowed/);
  assert.match(run, /AND NOT GVL_MACHINE.Status\[1\].xBusy AND NOT GVL_MACHINE.Status\[2\].xBusy AND NOT GVL_MACHINE.Status\[3\].xBusy/);
  assert.match(run, /GVL_MAGAZINE.astStatus\[uiTwin\].xReady := GVL_MAGAZINE.astPartStatus\[uiTwin\].xReady\s+AND GVL_TWO_PALLET.astStatus\[uiTwin\].xReady/);
});

test('all six new alarm masks resolve to both magazine catalogs and keep equipment/robot stop effects', () => {
  const catalog = JSON.parse(readFileSync(new URL('../alarm-catalog.json', import.meta.url), 'utf8'));
  for (const bit of [8, 9, 10, 11, 12, 13]) {
    assert.ok(fb.includes(`DWORD#16#${(2 ** bit).toString(16).toUpperCase()}`));
    for (const id of [1, 2]) assert.ok(catalog.alarms[`magazine-${id}`][bit]);
  }
  assert.match(read('FB/FB_ALARM_MANAGER.GetAlarmEffect.st'), /MAGAZINE_LOGIC_2:[\s\S]*?EQUIPMENT_STOP/);
  assert.ok(catalog.warnings['magazine-1']['30']);
  assert.ok(catalog.warnings['magazine-2']['30']);
  assert.ok(catalog.warnings['magazine-1']['31']);
  assert.ok(catalog.warnings['magazine-2']['31']);
});
