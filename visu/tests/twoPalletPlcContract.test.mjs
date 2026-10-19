// Static contracts and limited ST fragments: no CODESYS or equipment runtime.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { compileSt } from './helpers/geometryStRuntime.mjs';
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

const twinRunPermissions = read('PLC_PRG.RunTwoPallet.st');
function pairedCyclePermissions(magazine, manual, owner = magazine, overrides = {}) {
  const values = {
    uiTwin: magazine, 'CELL_MANAGER.uiReturnMagazine': owner,
    'GVL_MAGAZINE.astPartStatus[uiTwin].xBusy': false,
    'GVL_MAGAZINE.astPartStatus[uiTwin].xDisablePending': false,
    'GVL_MAGAZINE.astAutoCommand[uiTwin].xExecute': false,
    'GVL_MAGAZINE.astCommand[uiTwin].xExecute': false,
    'GVL_ROBOT.Status.xBusy': false, xMotionBusy: false, 'GVL_ROBOT.Status.uiMagazineContext': 0,
    'GVL_CELL_MANAGER.Status.uiActiveMagazine': 0, 'GVL_CELL_MANAGER.Diag.eState': 0,
    'E_CELL_STATE.MAGAZINE': 7, 'E_CELL_STATE.RELEASE_MAGAZINE': 8,
    xSelected: true, xConfigValid: true, xSafe: true, xManual: manual, xConnection: true, xIdle: true,
    'GVL_CELL_CONTROL.xManual': manual, 'GVL_CELL_MANAGER.Status.xRunning': false,
    xRobotMagazineReady: true, xPointsConfigured: true, xContradiction: false, xPairValid: true, xExchange: true,
    'Input.xIoMapped': true, 'Input.xAxisBound': true, 'Input.xStandstill': true,
    'Input.xPowered': true, 'Input.xDriveError': false, 'Input.xHomed': true,
    'Input.xLiftDown': true, 'Input.xLiftUp': false, 'Error.dwErrorActive': 0,
    'Status.xConfirmed': true, 'Status.xEnabled': false, 'Status.xHomeRequired': false,
    'Status.uiRobotPallet': 2, uiCandidate: 2, uiSelected: 2, xStopRequest: false, xOtherLoaded: true,
    ...overrides,
  };
  values.xTwinRobotOperation = plcPermission('xTwinRobotOperation', values, twinRunPermissions);
  values.xTwinRobotSwapWindow = plcPermission('xTwinRobotSwapWindow', values, twinRunPermissions);
  values.xRobotOperation = values.xTwinRobotOperation;
  values.xRobotSwapWindow = values.xTwinRobotSwapWindow;
  const manualArgument = twinRunPermissions.match(/\bxManual := ([^,\r\n]+)/)[1];
  values.xManual = stBoolean(manualArgument, values);
  const editArgument = twinRunPermissions.match(/\bxActivePalletEditAllowed := ([^,\r\n]+)/)[1];
  values.xActivePalletEditAllowed = stBoolean(editArgument, values);
  for (const permission of ['xBase', 'xManualSetupAllowed', 'xRecovery', 'xPneumaticBase', 'xPneumaticRecovery',
    'Status.xConfirmAllowed', 'Status.xStartAllowed', 'xEnableBaseAllowed', 'Status.xEnableAllowed',
    'Status.xSwapAllowed', 'xAutoSwapAllowed', 'Status.xPowerAllowed', 'Status.xLowerAllowed',
    'Status.xRaiseAllowed', 'Status.xLockAllowed', 'Status.xStopAllowed', 'Status.xHomeAllowed',
    'Status.xMoveAllowed', 'Status.xJogAllowed', 'Status.xTeachOperatorAllowed', 'Status.xTeachWorkAllowed',
    'Status.xConfigAllowed', 'Status.xEdit1Allowed', 'Status.xEdit2Allowed']) {
    values[permission] = plcPermission(permission, values);
  }
  return values;
}

test('a stopped paired cycle can re-enable its confirmed magazine without releasing the return reservation', () => {
  const branch = fb.slice(fb.indexOf('ELSIF Command.xEnable THEN'), fb.indexOf('ELSIF Command.xConfirm THEN'));
  const enable = compileSt(branch.replace(/^ELSIF/, 'IF') + '\nEND_IF;');
  for (const magazine of [1, 2]) for (const manual of [false, true]) {
    const permissions = pairedCyclePermissions(magazine, manual);
    assert.equal(permissions['Status.xEnableAllowed'], true);
    const state = { Command: { xEnable: true }, xAccepted: false,
      Status: { xEnableAllowed: permissions['Status.xEnableAllowed'], xEnabled: false, xConfirmed: true,
        uiRobotPallet: 2, udiRevision: 7 }, CELL_MANAGER: { uiReturnMagazine: magazine },
      Input: { lrPosition: 200 }, Output: { xMove: false, xHome: false, xStop: false } };
    enable(state);
    assert.equal(state.xAccepted, true);
    assert.equal(state.Status.xEnabled, true);
    assert.equal(state.Status.xConfirmed, true);
    assert.equal(state.Status.uiRobotPallet, 2);
    assert.equal(state.Status.udiRevision, 7);
    assert.equal(state.CELL_MANAGER.uiReturnMagazine, magazine);
    assert.equal(state.Input.lrPosition, 200);
    assert.deepEqual(state.Output, { xMove: false, xHome: false, xStop: false });
  }
});

test('a stopped disabled magazine permits manual recovery and robot-pallet edits despite a return preference', () => {
  const manualPermissions = ['xRecovery', 'xPneumaticBase', 'Status.xConfirmAllowed', 'Status.xStartAllowed',
    'Status.xSwapAllowed', 'Status.xPowerAllowed', 'Status.xLowerAllowed', 'Status.xRaiseAllowed',
    'Status.xLockAllowed', 'Status.xStopAllowed', 'Status.xHomeAllowed', 'Status.xMoveAllowed',
    'Status.xJogAllowed', 'Status.xTeachOperatorAllowed', 'Status.xTeachWorkAllowed', 'Status.xEdit2Allowed'];
  for (const magazine of [1, 2]) {
    const stopped = pairedCyclePermissions(magazine, true);
    for (const permission of manualPermissions) assert.equal(stopped[permission], true, permission);
    assert.equal(stopped.xAutoSwapAllowed, false);
    assert.equal(stopped['Status.xEdit1Allowed'], true);
    const automatic = pairedCyclePermissions(magazine, false);
    for (const permission of manualPermissions) assert.equal(automatic[permission], false, permission);
    assert.equal(automatic['Status.xEdit1Allowed'], true);
    const enabled = pairedCyclePermissions(magazine, true, magazine, { 'Status.xEnabled': true });
    for (const permission of manualPermissions) assert.equal(enabled[permission], false, permission);
    assert.equal(pairedCyclePermissions(magazine, true, magazine, { 'Input.xPowered': false })['Status.xConfigAllowed'], true);
    for (const conflict of [{ xSafe: false }, { 'GVL_CELL_MANAGER.Status.xRunning': true },
      { 'GVL_MAGAZINE.astPartStatus[uiTwin].xBusy': true },
      { 'GVL_MAGAZINE.astAutoCommand[uiTwin].xExecute': true }]) {
      const blocked = pairedCyclePermissions(magazine, true, magazine, conflict);
      assert.equal(blocked['Status.xLowerAllowed'], false);
      assert.equal(blocked['Status.xMoveAllowed'], false);
    }
  }
});

test('manual exchange ignores the return preference but automatic exchange waits for its release', () => {
  const interrupt = compileSt(fb.slice(fb.indexOf('IF xSelected\n\tAND NOT xIdle'),
    fb.indexOf('IF xSelected AND (xTrustedAtScanStart OR xAutomaticState)')));
  for (const manual of [false, true]) for (const released of [false, true]) for (const busy of [false, true]) {
    const state = { xSelected: true, xIdle: false, xBase: !busy, xManualPneumaticState: false,
      xPneumaticBase: false, xManualState: false, xConnection: true, xStopRequest: false,
      xAutomaticState: true, xExchangeStartedManual: manual, xManual: manual,
      xRobotSwapWindow: released && !busy, xRobotOperation: busy, Status: { xEnabled: !manual },
      Error: { dwErrorActive: 0 }, ERR_SEQUENCE_INTERRUPTED: 0x2000,
      Diag: { eState: 30 }, E_TWO_PALLET_STATE: { IDLE: 0 }, Output: { xStop: false } };
    interrupt(state);
    assert.equal(state.Output.xStop, busy || (!manual && !released));
  }
});

test('an actual robot operation still blocks magazine re-enable while an unrelated reservation does not', () => {
  for (const magazine of [1, 2]) {
    assert.equal(pairedCyclePermissions(magazine, false, 3 - magazine)['Status.xEnableAllowed'], true);
    const conflicts = [
      { 'GVL_MAGAZINE.astPartStatus[uiTwin].xBusy': true },
      { 'GVL_MAGAZINE.astPartStatus[uiTwin].xDisablePending': true },
      { 'GVL_MAGAZINE.astAutoCommand[uiTwin].xExecute': true },
      { 'GVL_MAGAZINE.astCommand[uiTwin].xExecute': true },
      { 'GVL_ROBOT.Status.xBusy': true, 'GVL_ROBOT.Status.uiMagazineContext': magazine },
      { xMotionBusy: true, 'GVL_ROBOT.Status.uiMagazineContext': magazine },
      { 'GVL_CELL_MANAGER.Status.uiActiveMagazine': magazine, 'GVL_CELL_MANAGER.Diag.eState': 7 },
      { 'GVL_CELL_MANAGER.Status.uiActiveMagazine': magazine, 'GVL_CELL_MANAGER.Diag.eState': 8 },
    ];
    for (const conflict of conflicts) {
      assert.equal(pairedCyclePermissions(magazine, false, magazine, conflict)['Status.xEnableAllowed'], false);
    }
  }
});

test('automatic exchange waits for the final return but permits robot work through the peer magazine', () => {
  for (const magazine of [1, 2]) {
    const enabled = { 'Status.xEnabled': true };
    assert.equal(pairedCyclePermissions(magazine, false, magazine, enabled).xAutoSwapAllowed, false);
    assert.equal(pairedCyclePermissions(magazine, false, 0, enabled).xAutoSwapAllowed, true);
    const elsewhere = { ...enabled, 'GVL_ROBOT.Status.xBusy': true, xMotionBusy: true,
      'GVL_ROBOT.Status.uiMagazineContext': 3 - magazine };
    assert.equal(pairedCyclePermissions(magazine, false, 3 - magazine, elsewhere).xAutoSwapAllowed, true);
    assert.equal(pairedCyclePermissions(magazine, false, 0,
      { ...elsewhere, 'GVL_ROBOT.Status.uiMagazineContext': magazine }).xAutoSwapAllowed, false);
  }
});

test('PLC explains busy operations, enabled manual setup and the automatic return wait separately', () => {
  const explain = compileSt(fb.slice(fb.indexOf('Diag.uiReason := UINT#0;'), fb.indexOf('// Аварии механизма')));
  const state = { xSelected: true, xConfigValid: true, xSafe: true, xConnection: true,
    xContradiction: false, xPairValid: true, xWork: true, xIdle: true, xRobotOperation: false,
    xRobotSwapWindow: true, xRobotMagazineReady: true, xPointsConfigured: true, xManual: false,
    uiSignals: 26, uiSelectedSignals: 26, Diag: { uiReason: 0 }, Error: { dwErrorActive: 0 },
    Status: { xHomeRequired: false, xConfirmed: true, xEnabled: false }, Input: { xAxisBound: true, xIoMapped: true,
      xDriveError: false, xPowered: true, xHomed: true, xStandstill: true } };
  explain(state); assert.equal(state.Diag.uiReason, 0);
  state.xRobotSwapWindow = false;
  explain(state); assert.equal(state.Diag.uiReason, 23);
  state.xManual = true;
  explain(state); assert.equal(state.Diag.uiReason, 0);
  state.Status.xEnabled = true;
  explain(state); assert.equal(state.Diag.uiReason, 21);
  state.xRobotOperation = true;
  explain(state); assert.equal(state.Diag.uiReason, 5);
});

test('v2 test buffer is static-only and mode changes invalidate magazine bases', () => {
  const buffer = read('ST/ST_TEST/ST_TEST_SCENARIO_BUFFER.st');
  const control = read('PLC_PRG.RunTestControl.st');
  const mode = read('PLC_PRG.RunTwoPallet.st');
  const globals = read('GVL/GVL_TWO_PALLET.gvl.st');
  assert.match(buffer, /aauiSlotContent : ARRAY \[1\.\.2, 1\.\.120\] OF UINT/);
  assert.match(globals, /uiMode : UINT := UINT#1/);
  assert.match(control, /xTestScenarioApplyAllowed := xTestStable\s+AND \(GVL_TWO_PALLET\.uiMode = 0\)\s*\/\/[^\r\n]*\s+AND GVL_HMI\.xTestSessionActive/);
  assert.match(mode, /xModeChangeAllowed :=[\s\S]*?NOT GVL_HMI\.xTestSessionActive/);
  assert.match(mode, /GVL_TWO_PALLET\.uiMode := stTwinRequest\.uiValue;[\s\S]*?Persistent_Value\.astRetainPoints\[13 \+ uiTwin\]\.xConfigured := FALSE/);
  assert.match(mode, /xPointTableReady := FALSE/);
});

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
  assert.match(run, /xPointsConfigured := axMagazinePointsReady\[uiTwin\]/);
  assert.match(run, /xRobotGeometryReady := NOT GVL_HMI.xModbusMode AND axMagazinePointsReady\[uiTwin\]/);
  assert.match(run, /uiTwinSlot := 1 TO 96/);
  assert.match(run, /xStopRequest := GVL_CELL_CONTROL.xStop OR xIoManualActive OR GVL_HMI.astMagazineCommand\[uiTwin\].xStop/);
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
    'GVL_ROBOT.Status.xBusy': false, xMotionBusy: false, 'GVL_ROBOT.Status.uiMagazineContext': 0, uiTwin: 1,
    'GVL_CELL_MANAGER.Status.uiActiveMagazine': 0, 'GVL_CELL_MANAGER.Diag.eState': 0,
    'CELL_MANAGER.uiReturnMagazine': 0,
    'E_CELL_STATE.MAGAZINE': 7, 'E_CELL_STATE.RELEASE_MAGAZINE': 8 };
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

test('operator exchange uses the return lock in Auto and released manual setup in Manual', () => {
  const operator = fb.slice(fb.indexOf('Status.xSwapAllowed :='), fb.indexOf('xAutoSwapAllowed :='));
  assert.match(operator, /AND \(xRobotSwapWindow OR xManual\)/);
  assert.doesNotMatch(operator, /xRobotIdle|xRobotClear/);
  assert.doesNotMatch(operator, /xConfirmAllowed|xRecovery|xRobotGeometryReady|xRobotMagazineReady|xEnableAllowed/);
  const command = fb.slice(fb.indexOf('ELSIF Command.xSwap THEN'), fb.indexOf('ELSIF Command.xPowerOn THEN'));
  assert.match(command, /xExchangeStartedManual := xManual;\s+Diag.eState := E_TWO_PALLET_STATE.AUTO_LOWER/);
  assert.match(fb, /xAutomaticState AND \(\(xExchangeStartedManual AND NOT xManual\)\s+OR \(NOT xExchangeStartedManual AND NOT xRobotSwapWindow\)\)/);
  assert.match(fb, /IF xAutoSwap[\s\S]*?THEN\s+xExchangeStartedManual := FALSE/);
  assert.match(fb, /IF Diag.eState = E_TWO_PALLET_STATE.IDLE THEN xExchangeStartedManual := FALSE/);
  assert.match(fb, /xAutoSwapAllowed := xEnableBaseAllowed\s+AND xRobotSwapWindow\s+AND Status\.xEnabled\s+AND xOtherLoaded/);
  assert.match(fb, /IF xAutoSwap\s+AND xAutoSwapAllowed/);
  assert.match(fb, /xEnableBaseAllowed := xBase[\s\S]*?AND xRobotMagazineReady[\s\S]*?Status\.xEnableAllowed := xEnableBaseAllowed AND xConnection/);
  assert.doesNotMatch(fb.slice(fb.indexOf('xAutoSwapAllowed :='), fb.indexOf('Status.xPowerAllowed :=')), /xConnection/);
  assert.doesNotMatch(operator, /xOtherLoaded/);
  assert.match(fb, /Status\.xStartAllowed := Status\.xConfirmAllowed\s+AND xRobotMagazineReady/);
  assert.doesNotMatch(fb, /xRobotEnableReady/);
  const run = read('PLC_PRG.RunTwoPallet.st');
  assert.match(run, /xTwinRobotSwapWindow := NOT xTwinRobotOperation\s+AND \(CELL_MANAGER.uiReturnMagazine <> uiTwin\);/);
  const swapWindow = run.slice(run.indexOf('xTwinRobotSwapWindow :='), run.indexOf('xTwinOtherLoaded :='));
  assert.doesNotMatch(swapWindow, /eCurrentPoint|xRobotInterfaceReady|Status\.xError|uiMagazineContext|Status\.xBusy|xMotionBusy|xMagazineExchangeAllowed/);
  const swapValues = { xTwinRobotOperation: false, 'CELL_MANAGER.uiReturnMagazine': 0, uiTwin: 1 };
  assert.equal(plcPermission('xTwinRobotSwapWindow', swapValues, run), true);
  assert.equal(plcPermission('xTwinRobotSwapWindow', { ...swapValues, xTwinRobotOperation: true }, run), false);
  assert.equal(plcPermission('xTwinRobotSwapWindow', { ...swapValues, 'CELL_MANAGER.uiReturnMagazine': 1 }, run), false);
  assert.equal(plcPermission('xTwinRobotSwapWindow', { ...swapValues, 'CELL_MANAGER.uiReturnMagazine': 2 }, run), true);
  assert.match(run, /xRobotGeometryReady := NOT GVL_HMI\.xModbusMode AND axMagazinePointsReady\[uiTwin\]/);
  assert.match(run, /xRobotMagazineReady := GVL_MAGAZINE\.astPartStatus\[uiTwin\]\.xEnableCheckNoError[\s\S]*?xEnableCheckGeometry/);
  const magazine = read('FB/FB_MAGAZINE.st');
  const magazineEnable = magazine.slice(magazine.indexOf('Status.xEnableSequenceAllowed :='), magazine.indexOf('// Finished'));
  assert.doesNotMatch(magazineEnable, /xEnableCheckContent/);
  assert.doesNotMatch(magazineEnable, /xEnableCheckRobotReady|xEnableCheckRobotReleased/);
  assert.match(magazine, /Status\.xReady := xMechanismReady[\s\S]*?AND xRobotCanWorkWithMagazine/);
  assert.doesNotMatch(magazine, /WRN_ENABLE_ROBOT_NOT_READY/);
});

test('PLC exchange truth table permits robot motion elsewhere but still requires the target magazine released', () => {
  const ready = { xBase: true, xConnection: true, xIdle: true, 'Input.xStandstill': true,
    'Input.xPowered': true, 'Error.dwErrorActive': 0, 'Status.xConfirmed': true,
    uiCandidate: 1, 'Status.uiRobotPallet': 1, 'Status.xEnabled': false, xStopRequest: false,
    xManual: false, xRobotSwapWindow: true };
  assert.equal(plcPermission('Status.xSwapAllowed', ready), true);
  for (const blocked of [{ xBase: false }, { xConnection: false }, { xIdle: false },
    { 'Input.xStandstill': false }, { 'Input.xPowered': false }, { 'Error.dwErrorActive': 0x100 },
    { 'Status.xConfirmed': false }, { uiCandidate: 0 }, { uiCandidate: 2 },
    { 'Status.xEnabled': true }, { xStopRequest: true }, { xRobotSwapWindow: false }]) {
    assert.equal(plcPermission('Status.xSwapAllowed', { ...ready, ...blocked }), false, JSON.stringify(blocked));
  }
  assert.equal(plcPermission('Status.xSwapAllowed', { ...ready, xManual: true }), true);
  assert.equal(plcPermission('Status.xSwapAllowed', { ...ready, xRobotSwapWindow: false }), false);
  assert.equal(plcPermission('Status.xSwapAllowed', { ...ready, xRobotSwapWindow: false, xManual: true }), true);
  assert.equal(plcPermission('xBase', { xSelected: true, xConfigValid: true,
    'Input.xIoMapped': true, 'Input.xAxisBound': true, xSafe: true, xRobotOperation: true }), false);
});

test('pallet exchange locks only its magazine until Completed and leaves other routes available', () => {
  const run = read('PLC_PRG.RunTwoPallet.st');
  const cell = read('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st');
  const robot = read('FB/FB_ROBOT.st');
  const robotRun = read('PLC_PRG.RunRobot.st');
  assert.match(run, /axTwinMagazineExchangeInProgress\[uiTwin\] := GVL_TWO_PALLET\.astStatus\[uiTwin\]\.xBusy\s+OR GVL_TWO_PALLET\.astStatus\[uiTwin\]\.xCompleted/);
  assert.match(cell, /axMagazineExchangeInProgress : ARRAY/);
  assert.match(cell, /AND NOT axMagazineExchangeInProgress\[1\][\s\S]*?AND NOT astMagazineStatus\[1\]\.xBusy/);
  assert.match(cell, /AND NOT axMagazineExchangeInProgress\[2\][\s\S]*?AND NOT astMagazineStatus\[2\]\.xBusy/);
  assert.match(cell, /xMagazineReady :=[\s\S]*?AND NOT xActiveMagazineExchangeInProgress/);
  assert.doesNotMatch(cell, /IF xMagazineExchangeActive AND/);
  assert.match(robot, /axMagazineExchangeInProgress\[Command\.uiMagazineId\][\s\S]*?E_POINT_NAME\.MAGAZINE_SAFE[\s\S]*?E_POINT_NAME\.MAGAZINE_CHANGE[\s\S]*?E_POINT_NAME\.MAGAZINE_IN_SLOT/);
  assert.match(robot, /IF \(NOT xManual OR xMagazineCommandActive\)[\s\S]*?axMagazineExchangeInProgress\[Command\.uiMagazineId\]/);
  assert.doesNotMatch(robotRun, /xHmiRobotActionBaseAllowed := xRobotHmiPermit\s+AND NOT GVL_TWO_PALLET\.astStatus\[1\]\.xBusy/);
  assert.doesNotMatch(robotRun, /AND NOT axTwinMagazineExchangeInProgress\[stRobotHmiCommand\.uiMagazineId\]/);
});

test('PLC inventory truth table keeps the operator pallet editable independently of mechanism and mode', () => {
  for (const robot of [1, 2]) for (const enabled of [false, true]) for (const released of [false, true]) for (const manual of [false, true]) {
    const values = { xSelected: true, 'Status.uiRobotPallet': robot, 'Status.xEnabled': enabled,
      xActivePalletEditAllowed: released, xManual: manual };
    for (const pallet of [1, 2]) {
      assert.equal(plcPermission(`Status.xEdit${pallet}Allowed`, values),
        pallet !== robot || (manual && !enabled && released), `${robot}/${enabled}/${released}/${pallet}`);
      assert.equal(plcPermission(`Status.xEdit${pallet}Allowed`, { ...values, xSelected: false }), false);
    }
  }
});

test('idle cell Stop preserves magazine enable; own Stop disables; active or moving mechanisms are interrupted', () => {
  const command = fb.slice(fb.indexOf('ELSIF Command.xStop THEN'), fb.indexOf('ELSIF Command.xReset THEN'));
  const cell = fb.slice(fb.indexOf('\nIF xStopRequest THEN'), fb.indexOf('// Команда могла сменить состояние'));
  for (const [block, cellStop] of [[cell, true], [command.replace(/^ELSIF/, 'IF') + '\nEND_IF;', false]]) {
    const execute = compileSt(block);
    for (const enabled of [false, true]) {
      for (const [state, powered, standstill, interrupted] of [[0, true, true, false], [20, true, true, true],
        [0, true, false, true], [0, false, false, false]]) {
        const values = {
          Command: { xStop: true }, xStopRequest: true,
          Diag: { eState: state }, E_TWO_PALLET_STATE: { IDLE: 0 },
          Input: { xPowered: powered, xStandstill: standstill, lrPosition: 200 },
          Status: { xEnabled: enabled, xConfirmed: true, udiRevision: 7, xHomeRequired: false, uiRobotPallet: 2 },
          Error: { dwErrorActive: 0 }, Output: { xStop: false },
          ERR_SEQUENCE_INTERRUPTED: 0x2000, uiJogDirection: 0, xAccepted: false,
        };
        execute(values);
        assert.equal(values.Status.xEnabled, cellStop && !interrupted && enabled);
        assert.equal(values.Status.xConfirmed, !interrupted);
        assert.equal(values.Output.xStop, interrupted);
        assert.equal(values.Error.dwErrorActive, interrupted ? 0x2000 : 0);
        assert.equal(values.Diag.eState, 0);
        assert.equal(values.Status.udiRevision, 7);
        assert.equal(values.Status.xHomeRequired, false);
        assert.equal(values.Status.uiRobotPallet, 2);
        assert.equal(values.Input.lrPosition, 200);
      }
    }
  }
});

function cellRoutingFixture(mode, activeMagazine) {
  const command = () => ({ xEnable: false, xDisable: false, xStop: false, xReset: false });
  return {
    uiTwin: 1, uiMagazine: 0, E_MAGAZINE_OPERATION: { NONE: 0 },
    GVL_CELL_CONTROL: { xDisable: true, xStop: false, xReset: false },
    GVL_HMI: { astMagazineCommand: [null, command(), command()] },
    GVL_TWO_PALLET: { uiMode: mode, auiCommand: [0, 0, 0],
      astStatus: [null, { xResetAllowed: false }, { xResetAllowed: false }] },
    GVL_CELL_MANAGER: { Status: { uiActiveMagazine: activeMagazine },
      Command: { stMagazine: { xEnable: false, xDisable: false, xExecute: true, xStop: false,
        eOperation: 1, iTakeSlot: 3, iPutSlot: 0 } } },
    GVL_MAGAZINE: { astAutoCommand: [null, { xDisable: true }, { xDisable: true }] },
  };
}

const twinRun = read('PLC_PRG.RunTwoPallet.st');
const legacyRouting = compileSt(twinRun.slice(
  twinRun.indexOf('\n\tIF (GVL_TWO_PALLET.auiCommand[uiTwin] = 0)'),
  twinRun.indexOf('// Единственное место преобразования'),
));

test('cell Disable does not dispatch magazine Disable in either mode or to the active magazine', () => {
  const routing = read('PLC_PRG.RunCellControl.st');
  // The local executor infers types from the final field name. Use a snapshot
  // for this qualified array index so it does not treat the whole struct as UINT.
  const execute = compileSt(routing.slice(routing.lastIndexOf('FOR uiMagazine := UINT#1 TO UINT#2 DO'))
    .replaceAll('[GVL_CELL_MANAGER.Status.uiActiveMagazine]', '[uiActiveMagazine]'));
  for (const mode of [0, 1]) for (const activeMagazine of [0, 1, 2]) {
    const values = cellRoutingFixture(mode, activeMagazine);
    for (const magazine of [1, 2]) {
      values.uiTwin = magazine;
      legacyRouting(values);
      assert.equal(values.GVL_TWO_PALLET.auiCommand[magazine], 0);
    }
    values.uiActiveMagazine = values.GVL_CELL_MANAGER.Status.uiActiveMagazine;
    execute(values);
    for (const magazine of [1, 2]) {
      assert.equal(values.GVL_MAGAZINE.astAutoCommand[magazine].xDisable, false);
      assert.equal(values.GVL_MAGAZINE.astAutoCommand[magazine].xExecute, magazine === activeMagazine);
    }
  }
});

test('own magazine Disable still reaches its mechanism and preserves the confirmed arrangement', () => {
  const mapDisable = compileSt(twinRun.match(/astTwinCommand\[uiTwin\]\.xDisable :=[^;]+;/)[0]);
  const branch = fb.slice(fb.indexOf('ELSIF Command.xDisable THEN'), fb.indexOf('ELSIF Command.xSwap THEN'));
  const execute = compileSt(branch.replace(/^ELSIF/, 'IF') + '\nEND_IF;');
  for (const magazine of [1, 2]) {
    const values = cellRoutingFixture(1, 0);
    values.GVL_CELL_CONTROL.xDisable = false;
    values.GVL_HMI.astMagazineCommand[magazine].xDisable = true;
    values.astTwinCommand = [null, { xDisable: false }, { xDisable: false }];
    for (const id of [1, 2]) {
      values.uiTwin = id;
      legacyRouting(values);
      mapDisable(values);
      assert.equal(values.astTwinCommand[id].xDisable, id === magazine);
    }
    values.Command = values.astTwinCommand[magazine];
    values.Status = { xEnabled: true, xConfirmed: true };
    values.xAccepted = false;
    execute(values);
    assert.equal(values.Status.xEnabled, false);
    assert.equal(values.Status.xConfirmed, true);
    assert.equal(values.xAccepted, true);
  }
});

test('loss of safety, axis binding, IO mapping or power still faults and disables a confirmed magazine', () => {
  const fault = fb.match(/IF xSelected\s+AND xTrustedAtScanStart\s+AND \(NOT xSafe[\s\S]*?END_IF;/)[0];
  const disable = fb.slice(fb.lastIndexOf('IF Error.dwErrorActive <> DWORD#0 THEN'), fb.indexOf('Error.dwAlarmActive :='));
  const execute = compileSt(fault + '\n' + disable);
  for (const missing of ['xSafe', 'xAxisBound', 'xIoMapped', 'xPowered']) {
    const values = { xSelected: true, xTrustedAtScanStart: true, xSafe: true,
      Input: { xAxisBound: true, xIoMapped: true, xPowered: true },
      Status: { xEnabled: true, xConfirmed: true },
      Error: { dwErrorActive: 0, dwErrorLast: 0 }, ERR_SEQUENCE_INTERRUPTED: 0x2000 };
    if (missing === 'xSafe') values.xSafe = false;
    else values.Input[missing] = false;
    execute(values);
    assert.equal(values.Error.dwErrorActive, 0x2000);
    assert.equal(values.Error.dwErrorLast, 0x2000);
    assert.equal(values.Status.xEnabled, false);
    assert.equal(values.Status.xConfirmed, false);
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
  assert.doesNotMatch(fb, /IF NOT xConnection THEN Status\.xEnabled := FALSE; END_IF/);
  assert.match(fb, /OR \(\(NOT xConnection\) AND xManualState AND NOT xManualPneumaticState\)/);
  assert.doesNotMatch(fb.slice(fb.indexOf('Status.xReady :='), fb.indexOf('IF NOT xSelected THEN', fb.indexOf('Status.xReady :='))), /xConnection/);
});

test('only the stationary operator pallet can confirm loading and accepted manual swap clears both flags', () => {
  const run = read('PLC_PRG.RunTwoPallet.st');
  const loaded = run.slice(run.indexOf('20:', run.indexOf('IF xTwinInventoryCommand THEN')), run.indexOf('21, 22:', run.indexOf('IF xTwinInventoryCommand THEN')));
  assert.match(loaded, /astStatus\[uiTwin\]\.xLoadAllowed/);
  assert.match(loaded, /uiTwinPallet <> GVL_TWO_PALLET\.astStatus\[uiTwin\]\.uiRobotPallet/);
  assert.match(read('ST/ST_MAGAZINE/ST_TWO_PALLET_STATUS.st'), /xLoadAllowed\s*:\s*BOOL/);
  const permission = { 'Status.xConfirmed': true, 'Status.xBusy': false, xOtherLoaded: false,
    'Status.uiRobotPallet': 1, 'Status.xEdit1Allowed': false, 'Status.xEdit2Allowed': true };
  assert.equal(plcPermission('Status.xLoadAllowed', permission), true);
  for (const blocked of [{ 'Status.xConfirmed': false }, { 'Status.xBusy': true }, { xOtherLoaded: true },
    { 'Status.xEdit2Allowed': false }]) {
    assert.equal(plcPermission('Status.xLoadAllowed', { ...permission, ...blocked }), false);
  }
  assert.equal(plcPermission('Status.xLoadAllowed', { ...permission, 'Status.uiRobotPallet': 2,
    'Status.xEdit1Allowed': true, 'Status.xEdit2Allowed': false }), true);
  const manualSwap = run.slice(run.indexOf('// Ручная смена расходует'), run.indexOf('IF (uiTwinRequestResult = 2)', run.indexOf('// Ручная смена расходует')));
  assert.match(manualSwap, /astTwinCommand\[uiTwin\]\.xSwap AND GVL_TWO_PALLET\.astStatus\[uiTwin\]\.xCommandAccepted/);
  assert.match(manualSwap, /axLoaded\[1\] := FALSE;[\s\S]*?axLoaded\[2\] := FALSE/);
  assert.match(read('PLC_PRG.st'), /uiTwinRobotPalletBefore\s*:\s*UINT/);
  assert.match(run, /uiTwinRobotPalletBefore := GVL_TWO_PALLET\.astStatus\[uiTwin\]\.uiRobotPallet;[\s\S]*?TWIN\[uiTwin\]\(/);
  assert.match(run, /IF uiTwinRobotPalletBefore <> GVL_TWO_PALLET\.astStatus\[uiTwin\]\.uiRobotPallet THEN\s+GVL_TWO_PALLET\.astStore\[uiTwin\]\.axLoaded\[1\] := FALSE;\s+GVL_TWO_PALLET\.astStore\[uiTwin\]\.axLoaded\[2\] := FALSE;/);
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

test('a pallet exchange blocks only its target magazine and does not reserve the whole scheduler', () => {
  const manager = read('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st');
  assert.doesNotMatch(manager, /IF xMagazineExchangeActive AND/);
  assert.match(manager, /OR axMagazineExchangeInProgress\[uiActiveMagazine\]/);
  assert.match(manager, /AND NOT xActiveMagazineExchangeInProgress/);
  assert.match(manager, /Status.xMagazineExchangeAllowed := NOT xStopRequested/);
  const run = read('PLC_PRG.RunTwoPallet.st');
  assert.match(run, /axTwinMagazineExchangeInProgress\[uiTwin\] := GVL_TWO_PALLET\.astStatus\[uiTwin\]\.xBusy\s+OR GVL_TWO_PALLET\.astStatus\[uiTwin\]\.xCompleted/);
  assert.doesNotMatch(run, /GVL_CELL_MANAGER.Status.xMagazineExchangeAllowed|NOT GVL_MACHINE.Status\[1\]\.xBusy/);
  assert.match(read('PLC_PRG.RunCellControl.st'), /axMagazineExchangeInProgress := axTwinMagazineExchangeInProgress/);
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
