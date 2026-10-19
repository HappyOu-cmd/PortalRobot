// Execute the relevant ST fragments without connecting to PLC or CODESYS.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compileSt, defaultsFromSt, readPlc } from './helpers/geometryStRuntime.mjs';

function between(source, from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `Missing ST fragment: ${from}`);
  return source.slice(start, end);
}
function assignment(source, target) {
  const start = source.indexOf(`${target} :=`);
  assert.ok(start >= 0, `Missing ST assignment: ${target}`);
  return source.slice(start, source.indexOf(';', start) + 1);
}
function enumFrom(file) {
  const source = readPlc(file).replace(/\/\/[^\r\n]*/g, '');
  const body = source.slice(source.indexOf('(') + 1, source.indexOf(')'));
  let value = -1;
  return Object.fromEntries(body.split(',').filter(name => name.trim()).map(name => {
    const [key, literal] = name.trim().split(/\s*:=\s*/);
    value = literal === undefined ? value + 1 : Number(literal.replace(/^\w+#/, ''));
    return [key, value];
  }));
}

const E_POINT_NAME = enumFrom('ST/ST_POINT/E_POINT_NAME.st');
const loadPoints = compileSt(readPlc('PLC_PRG.SetApplicationDefaults.st'));
const cellSource = readPlc('PLC_PRG.RunCellControl.st');
const checkCellPoints = compileSt(between(cellSource, 'xCellPointsReady :=', 'uiMagazine := GVL_CELL_MANAGER'));
const managerSource = readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st');
const checkStart = compileSt(between(managerSource, 'xStartCheckCellIdle :=', 'uiStartConditionsMet :='));
const pointArgument = cellSource.match(/\bxPointsConfigured := (\w+),/)[1];
const passCellPoints = compileSt(`xPointsConfigured := ${pointArgument};`);
const machineSource = readPlc('FB/FB_MACHINE.st');
const magazineSource = readPlc('FB/FB_MAGAZINE.st');
const twinSource = readPlc('FB/FB_TWO_PALLET.st');

function storage(mask = 1 | 8, home = true) {
  const point = { xConfigured: false, X: 0, Y: 0, Z: 0, SpeedFactor: .2,
    MagazineSafeZ: -300, MagazineChangeZ: -150 };
  const retained = [null, ...Array.from({ length: 15 }, () => ({ ...point }))];
  for (let machine = 0; machine < 3; machine++) {
    for (const index of [1, 3, 4]) retained[machine * 4 + index].xConfigured = Boolean(mask & (1 << machine));
  }
  retained[13].xConfigured = home;
  retained[14].xConfigured = Boolean(mask & 8);
  retained[15].xConfigured = Boolean(mask & 16);
  return {
    ...defaultsFromSt(readPlc('PLC_PRG.st')), E_POINT_NAME, ePointEditorName: E_POINT_NAME.NONE,
    xApplicationStartupInitialized: true, INT_TO_UINT: Number,
    axMachinePointsReady: [null, false, false, false], axMagazinePointsReady: [null, false, false],
    Persistent_Value: { astRetainPoints: retained, udiPointStorageVersion: 1 },
    GVL_POINT: { Points: Array.from({ length: 101 }, () => ({ ...point })),
      iPersistentPointCapacity: 15, iRequiredPointCount: 12, udiExpectedPointStorageVersion: 1 },
    GVL_MACHINE: { Status: [null, ...Array.from({ length: 3 }, () => ({ xEnabled: false }))] },
    GVL_MAGAZINE: { astStatus: [null, { xEnabled: false }, { xEnabled: false }] },
    GVL_GEOMETRY_CONTROL: { astStatus: [null, { xEnabled: false, xConfigured: Boolean(mask & 32) },
      { xEnabled: false, xConfigured: Boolean(mask & 64) }] },
  };
}
function enableMask(state, mask) {
  for (let i = 1; i <= 3; i++) state.GVL_MACHINE.Status[i].xEnabled = Boolean(mask & (1 << (i - 1)));
  for (let i = 1; i <= 2; i++) {
    state.GVL_MAGAZINE.astStatus[i].xEnabled = Boolean(mask & (1 << (i + 2)));
    state.GVL_GEOMETRY_CONTROL.astStatus[i].xEnabled = Boolean(mask & (1 << (i + 4)));
  }
}

test('cell starts with HOME_SAFETY, one configured machine and one magazine; GK remains optional', () => {
  const state = storage();
  loadPoints(state); enableMask(state, 1 | 8); checkCellPoints(state);
  assert.equal(state.xPointTableReady, false);
  assert.deepEqual(state.axMachinePointsReady.slice(1), [true, false, false]);
  assert.deepEqual(state.axMagazinePointsReady.slice(1), [true, false]);
  assert.equal(state.xCellPointsReady, true);
  Object.assign(state, {
    ...defaultsFromSt(managerSource), xPointsConfigured: false,
    eState: 0, E_CELL_MANAGER_STATE: { IDLE: 0 }, xRunning: false, xManual: false,
    xGlobalError: false, xIoManual: false, Error: { dwErrorActive: 0 }, xRobotInterfaceReady: true,
    xConfigurationValid: true, xDrivesReady: true, xRobotReady: true, xMagazineReady: true,
    stRobotStatus: { xBlankAvailable: false, xDetailAvailable: false }, uiCandidateMachine: 1,
    xSafetyHomeRequired: false, xRobotAtSafetyHome: false, xSafetyReady: true,
  });
  passCellPoints(state); checkStart(state);
  assert.equal(state.xStartCheckPointsConfigured, true);
  assert.equal(state.xReadyToStart, true);
  state.GVL_POINT.Points[E_POINT_NAME.HOME_SAFETY].xConfigured = false;
  checkCellPoints(state); passCellPoints(state); checkStart(state);
  assert.equal(state.xReadyToStart, false);
});

test('all equipment subsets require HOME_SAFETY and only the enabled equipment points', () => {
  for (const home of [false, true]) for (let configured = 0; configured < 128; configured++) {
    const state = storage(configured, home); loadPoints(state);
    for (let enabled = 0; enabled < 128; enabled++) {
      enableMask(state, enabled); checkCellPoints(state);
      assert.equal(state.xCellPointsReady, home && (enabled & ~configured) === 0,
        `home=${home}, configured=${configured}, enabled=${enabled}`);
    }
  }
});

test('each machine needs all three own points; magazine bases need both nonzero Z offsets', () => {
  for (let machine = 0; machine < 3; machine++) for (const point of [1, 3, 4]) {
    const state = storage(31);
    state.Persistent_Value.astRetainPoints[machine * 4 + point].xConfigured = false;
    loadPoints(state);
    assert.equal(state.axMachinePointsReady[machine + 1], false);
    for (let other = 1; other <= 3; other++) if (other !== machine + 1) assert.equal(state.axMachinePointsReady[other], true);
  }
  for (let magazine = 1; magazine <= 2; magazine++) for (const field of ['MagazineSafeZ', 'MagazineChangeZ']) {
    const state = storage(31);
    state.Persistent_Value.astRetainPoints[13 + magazine][field] = 0;
    loadPoints(state);
    assert.equal(state.axMagazinePointsReady[magazine], false);
    assert.equal(state.axMagazinePointsReady[3 - magazine], true);
    assert.equal(state.xPointTableReady, false);
  }
});

test('machine enable without points warns and preserves disabled state and automatic-use selection', () => {
  const warning = compileSt(between(machineSource, 'IF rtEnabledMachine.Q', '// HMI показывает xAllowed'));
  const transition = compileSt(between(machineSource, '// Включение и отключение блока', 'IF xGlobalError'));
  const power = compileSt(assignment(machineSource, 'Status.xPowerAllowed'));
  const select = compileSt(between(readPlc('PLC_PRG.RunMachines.st'), 'FOR uiMachine :=', 'MACHINE_1.stPoints'));
  const E_MACHINE_STATE = enumFrom('ST/ST_MACHINE/E_MACHINE_STATE.st');
  const E_PART_STATE = enumFrom('ST/ST_MACHINE/E_PART_STATE.st');
  for (const configured of [false, true]) for (const disable of [false, true]) {
    const state = { ...defaultsFromSt(machineSource), uiMachine: 0,
      E_MACHINE_STATE, E_PART_STATE, eState: E_MACHINE_STATE.DISABLED,
      ePartState: E_PART_STATE.EMPTY, stMachineStatus: { xAlarm: false, xCycleActive: false },
      xSafetyDoorSafe: true, xPointsConfigured: configured, xDisableRequest: disable,
      rtEnabledMachine: { Q: true }, rtDisabledMachine: { Q: disable }, WRN_ENABLE_POINTS: 11,
      Diag: { stWarning: { uiCode: 0, udiSequence: 0 } }, Status: {},
      axMachinePointsReady: [null, configured, configured, configured],
      GVL_HMI: { axMachineDisable: [null, disable, false, false], axMachineEnable: [null, true, false, false],
        axMachineUsed: [null, false, false, false] },
    };
    warning(state); transition(state); power(state); select(state);
    assert.equal(state.eState, configured && !disable ? E_MACHINE_STATE.IDLE : E_MACHINE_STATE.DISABLED);
    assert.equal(state.Diag.stWarning.uiCode, configured ? 0 : 11);
    assert.equal(state.GVL_HMI.axMachineUsed[1], configured && !disable);
    if (!configured && !disable) assert.equal(state.Status.xPowerAllowed, false);
  }
  for (let i = 1; i <= 3; i++) {
    assert.match(readPlc('PLC_PRG.RunMachines.st'), new RegExp(`xPointsConfigured := axMachinePointsReady\\[${i}\\]`));
    assert.match(readPlc('PLC_PRG.RunMachines.st'), new RegExp(`xHmiEnable := GVL_HMI.axMachineEnable\\[${i}\\],`));
  }
});

test('static magazine enable without its own base warns; ready points allow enable without other equipment', () => {
  const permission = compileSt(assignment(magazineSource, 'Status.xEnableSequenceAllowed'));
  const warning = compileSt(between(magazineSource, 'IF rtEnable.Q', 'ELSIF rtDisable.Q') + 'END_IF;');
  const transition = compileSt(between(magazineSource,
    '\n\tE_MAGAZINE_STATE.DISABLED:', '\n\tE_MAGAZINE_STATE.IDLE:').replace(/^\s*E_MAGAZINE_STATE.DISABLED:/, ''));
  const E_MAGAZINE_STATE = enumFrom('ST/ST_MAGAZINE/E_MAGAZINE_STATE.st');
  for (const configured of [false, true]) {
    const state = { ...defaultsFromSt(magazineSource), E_MAGAZINE_STATE, xIoManual: false, xPointsConfigured: configured, xGlobalError: false,
      Diag: { eState: E_MAGAZINE_STATE.DISABLED, stWarning: { uiCode: 0, udiSequence: 0 } },
      Status: { xEnableCheckNoError: true, xEnableCheckGeometry: true }, rtEnable: { Q: true },
      fbFaultInjector: { Status: { xBusy: false } }, WRN_ENABLE_POINTS: 18,
    };
    permission(state); warning(state); transition(state);
    assert.equal(state.Status.xEnableSequenceAllowed, configured);
    assert.equal(state.Diag.eState, configured ? E_MAGAZINE_STATE.IDLE : E_MAGAZINE_STATE.DISABLED);
    assert.equal(state.Diag.stWarning.uiCode, configured ? 0 : 18);
  }
  for (let i = 1; i <= 2; i++) {
    const call = between(readPlc('PLC_PRG.RunMagazine.st'), `fbMagazine${i}(`, '\n);');
    assert.match(call, new RegExp(`xPointsConfigured := axMagazinePointsReady\\[${i}\\]`));
    assert.doesNotMatch(call, /xPointTableReady/);
  }
});

test('two-pallet start and enable require own points; standalone confirmation and manual recovery remain available', () => {
  const permissions = compileSt(between(twinSource, 'Status.xConfirmAllowed :=', '// Обмен не требует'));
  const commands = compileSt(between(twinSource, 'IF Command.xStart THEN', 'ELSIF Command.xSwap THEN') + 'END_IF;');
  const warning = compileSt(between(twinSource, 'IF xCommandPresent AND NOT xAccepted THEN', 'IF xExternalCommandRejected'));
  for (const action of ['xStart', 'xEnable', 'xConfirm', 'xDisable']) for (const configured of [false, true]) {
    const state = { ...defaultsFromSt(twinSource), xPointsConfigured: configured,
      xRecovery: true, xBase: true, xIdle: true, xConnection: true,
      xRobotMagazineReady: true, uiCandidate: 1, Input: { xPowered: true }, Error: { dwErrorActive: 0 },
      Status: { xConfirmed: true, xEnabled: false, uiRobotPallet: 1, udiRevision: 5 },
      Command: { [action]: true, uiPallet: 1, udiRevision: 5 },
      Diag: { stWarning: { uiCode: 0, udiSequence: 0 } }, WRN_ENABLE_POINTS: 18,
      xCommandPresent: true, xAccepted: false,
    };
    permissions(state); commands(state); warning(state);
    const enables = action === 'xStart' || action === 'xEnable';
    assert.equal(state.xAccepted, !enables || configured, `${action}, points=${configured}`);
    assert.equal(state.Status.xEnabled, enables && configured);
    assert.equal(state.Diag.stWarning.uiCode, enables && !configured ? 18 : 0);
    assert.equal(state.Status.xConfirmAllowed, true);
  }
  const manualPermissions = between(twinSource, 'Status.xHomeAllowed :=', '// Командный интерфейс');
  assert.doesNotMatch(manualPermissions, /xPointsConfigured|xPointTableReady/);
});

test('test initialization cannot enable a machine or magazine with missing own points', () => {
  const machineInit = compileSt(between(machineSource,
    'IF (uiTestInitialState = UINT#0)', '\nEND_IF;\n\nIF stMachineStatus.xChuckClamped'));
  const magazineInit = compileSt(between(magazineSource,
    'IF xTestEnabled AND', 'Error.dwErrorActive := DWORD#0;'));
  const E_MACHINE_STATE = enumFrom('ST/ST_MACHINE/E_MACHINE_STATE.st');
  const E_PART_TYPE = enumFrom('ST/ST_MACHINE/E_PART_TYPE.st');
  const E_MAGAZINE_STATE = enumFrom('ST/ST_MAGAZINE/E_MAGAZINE_STATE.st');
  for (const configured of [false, true]) {
    for (const uiTestInitialState of [1, 2, 3]) {
      const state = { E_MACHINE_STATE, E_PART_TYPE, eState: E_MACHINE_STATE.DISABLED,
        ePartType: E_PART_TYPE.UNKNOWN, uiTestInitialState, xPointsConfigured: configured };
      machineInit(state);
      assert.equal(state.eState, configured ? E_MACHINE_STATE.IDLE : E_MACHINE_STATE.DISABLED);
    }
    const state = { E_MAGAZINE_STATE, xTestEnabled: true, xPointsConfigured: configured,
      Diag: { eState: E_MAGAZINE_STATE.DISABLED } };
    magazineInit(state);
    assert.equal(state.Diag.eState, configured ? E_MAGAZINE_STATE.IDLE : E_MAGAZINE_STATE.DISABLED);
  }
});

test('point warnings have WARNING effect and the same cause in HMI catalog and documentation', () => {
  const catalog = JSON.parse(readFileSync(new URL('../alarm-catalog.json', import.meta.url), 'utf8'));
  const resetTable = readFileSync(new URL('../../DOKS/15-equipment-error-reset-table.md', import.meta.url), 'utf8');
  const warnings = readFileSync(new URL('../../DOKS/16-cell-warnings.md', import.meta.url), 'utf8');
  for (const [sources, code] of [[['machine-1', 'machine-2', 'machine-3'], 11], [['magazine-1', 'magazine-2'], 18]]) {
    for (const source of sources) {
      assert.ok(catalog.warnings[source][code]);
      assert.ok(resetTable.includes(catalog.warnings[source][code]));
      assert.ok(warnings.includes(catalog.warnings[source][code]));
    }
  }
  assert.match(readPlc('FB/FB_ALARM_MANAGER.st'), /eSeverity := E_ALARM_SEVERITY.WARNING,\s*eEffect := E_ALARM_EFFECT.WARNING/);
});
