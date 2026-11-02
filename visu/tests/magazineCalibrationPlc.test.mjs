import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSt, conversions, defaultsFromSt, readPlc } from './helpers/geometryStRuntime.mjs';

const declarations = readPlc('PLC_PRG.st');
const input = readPlc('PLC_PRG.ReadHmiInputs.st');
const motion = readPlc('PLC_PRG.RunRobot.st');
const vector = () => ({ X: 0, Y: 0, Z: 0 });
const point = (X = 0, Y = 0, Z = 0) => ({ Name: '', X, Y, Z, MagazineSafeZ: -30, MagazineChangeZ: -60, SpeedFactor: .5, xConfigured: true });
const emptyFrame = () => ({ stAxisX: vector(), stAxisY: vector(), stAxisZ: vector(), xReady: false, uiReason: 0 });
const names = readPlc('ST/ST_POINT/E_POINT_NAME.st').replace(/\/\/[^\r\n]*/g, '').split('(')[1].split(')')[0].split(',').map(name => name.trim());
const E_POINT_NAME = Object.fromEntries(names.map((name, index) => [name, index]));
const calculate = compileSt(readPlc('FB/F_MAGAZINE_FRAME.st'));
const invalidate = compileSt(readPlc('PLC_PRG.InvalidateMagazineCalibration.st'));
const refresh = compileSt(readPlc('PLC_PRG.RunMagazineCalibration.st'));
const generateTarget = compileSt(motion.slice(motion.indexOf('// Единственный владелец временных точек'), motion.indexOf('// Внешний контроллер включается')));
const settingStart = input.indexOf('// Допуск принадлежит конкретному магазину');
const applySetting = compileSt(input.slice(settingStart, input.indexOf('// =============================================================================', settingStart)));
const edit = compileSt('xPointEditorAllHomed :=' + input.split('xPointEditorAllHomed :=')[1].split('// Плоский OPC UA-интерфейс')[0]);

function frame(stOrigin, stCalibration, rows = 12, columns = 8, px = 50, py = 80) {
  const state = { ...defaultsFromSt(readPlc('FB/F_MAGAZINE_FRAME.st')), stOrigin, stCalibration,
    uiRows: rows, uiColumns: columns, lrPitchX: px, lrPitchY: py, stFrame: emptyFrame(),
    stVectorAB: vector(), stVectorAC: vector(), stPlaneNormal: vector(), SQRT: Math.sqrt, ABS: Math.abs, F_MAGAZINE_FRAME: emptyFrame() };
  calculate(state);
  return state.F_MAGAZINE_FRAME;
}
function fixture() {
  const config = () => ({ uiMethod: 3, astReference: [null, point(1000, 850, 200), point(120, 500, 200)] });
  const state = { ...defaultsFromSt(declarations), ...conversions, E_POINT_NAME,
    UINT_TO_LREAL: Number, LREAL_TO_UINT: Number, INT_TO_UINT: Number,
    E_CELL_TEST_ENVIRONMENT: { NORMAL: 0, SC500_BENCH: 2 },
    WRN_POINT_EDIT_REJECTED: 15, WRN_POINT_CHECK_REJECTED: 16,
    xHmiConnectionAlive: true, xFresh: true, xPointTableReady: true,
    alrRobotSoftwareMinPosition: [null, -10000, -10000, -10000],
    alrRobotSoftwareMaxPosition: [null, 10000, 10000, 10000],
    xMagazineCalibrationEditAllowed: [null, true, true], astMagazineFrame: [null, emptyFrame(), emptyFrame()],
    axMagazinePointsReady: [null, false, false], stMagazineReferenceDraft: point(),
    Persistent_Value: { astRetainPoints: [null, ...Array.from({ length: 15 }, () => point(1000, 500, 200))],
      astMagazineCalibration: [null, config(), config()] },
    GVL_POINT: { Points: Array.from({ length: 101 }, () => point(1000, 500, 200)) },
    GVL_CELL_SETTINGS: { MagazineRows: 12, MagazineColumns: 8, xCellSettingsChangeAllowed: true, eTestEnvironment: 0 },
    GVL_MAGAZINE: { astStatus: [null, { xEnabled: false, xBusy: false }, { xEnabled: false, xBusy: false }] },
    GVL_TWO_PALLET: { astStatus: [null, { xEnabled: false, xBusy: false }, { xEnabled: false, xBusy: false }] },
    GVL_CELL_CONTROL: { xManual: true, xGlobalError: false }, GVL_CELL_MANAGER: { Status: { xRunning: false } },
    GVL_ROBOT: { Status: { xBusy: false, uiMagazineContext: 0 } },
    GVL_MOTION_MANAGER: { stMotionManager: { Status: { xError: false } } },
    GVL_POINT_MANAGER: { PointManager: { Diag: { xXLimitValid: true, xYLimitValid: true, xZLimitValid: true } } },
    GVL_AXIS: { arrAxis: [null, ...[1, 2, 3].map(() => ({ Status: { xHomed: true } }))] },
    GVL_AXIS_GROUP: { AxisGroup: { Status: { xPositionValid: true } } },
    GVL_HMI: { MagazinePitchX: 50, MagazinePitchY: 80, xModbusMode: false,
      astMagazineCalibrationStatus: [null, {}, {}], udiPointEditorCommandSeq: 9, uiPointEditorCommand: 2,
      uiPointEditorIndex: 15, uiPointEditorCalibrationMethod: 3,
      alrPointEditorDraftXYZ: [null, 1000, 850, 200], lrPointEditorDraftSpeedFactor: .5,
      lrPointEditorDraftMagazineSafeZ: 0, lrPointEditorDraftMagazineChangeZ: 0,
      stPointEditorResultPoint: point(), udiCellSettingCommandSeq: 1, udiCellSettingAckSeq: 0,
      uiCellSettingIndex: 40, lrCellSettingRequest: 1, uiCellSettingResult: 0 },
  };
  state.F_MAGAZINE_FRAME = args => frame(args.stOrigin, args.stCalibration, args.uiRows, args.uiColumns, args.lrPitchX, args.lrPitchY);
  state.InvalidateMagazineCalibration = ({ uiMagazine }) => { state.uiMagazine = uiMagazine; invalidate(state); };
  state.IsHmiCommandFresh = () => state.xFresh;
  return state;
}
function target(state, slot, magazine = 1, name = 'MAGAZINE_IN_SLOT') {
  state.stSelectedMagazineCommand = { uiMagazineId: magazine, iActiveSlot: slot, eSetPoint: E_POINT_NAME[name] };
  state.stRobotHmiCommand = { eSetPoint: E_POINT_NAME.NONE };
  generateTarget(state);
  return state.GVL_POINT.Points[E_POINT_NAME[name]];
}
function xyz(point) { return [point.X, point.Y, point.Z]; }
function close(actual, expected) { actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-8, `${actual} != ${expected}`)); }

test('one-point calibration preserves world axes and all 96/120 slot targets with vertical offsets', () => {
  for (const columns of [8, 10]) {
    const state = fixture(); state.GVL_CELL_SETTINGS.MagazineColumns = columns;
    for (const magazine of [1, 2]) state.Persistent_Value.astMagazineCalibration[magazine].uiMethod = 1;
    refresh(state);
    for (const magazine of [1, 2]) for (let slot = 1; slot <= 12 * columns; slot++) {
      const x = 1000 + ((slot - 1) % columns) * 50, y = 500 + Math.floor((slot - 1) / columns) * 80;
      close(xyz(target(state, slot, magazine)), [x, y, 200]);
      close(xyz(target(state, slot, magazine, 'MAGAZINE_SAFE')), [x, y, 170]);
      close(xyz(target(state, slot, magazine, 'MAGAZINE_CHANGE')), [x, y, 140]);
    }
  }
});

test('three-point calibration maps known corners and slot 23 after a 90 degree turn for each magazine', () => {
  const state = fixture(); refresh(state);
  for (const magazine of [1, 2]) {
    for (const [slot, expected] of [[1, [1000, 500, 200]], [8, [1000, 850, 200]], [89, [120, 500, 200]], [96, [120, 850, 200]], [23, [840, 800, 200]]]) {
      close(xyz(target(state, slot, magazine)), expected);
    }
  }
});

test('a spatial frame changes XYZ and approach Z while the second magazine keeps its own one-point calibration', () => {
  const state = fixture();
  const origin = point(100, 200, 300);
  state.GVL_POINT.Points[22] = origin;
  state.Persistent_Value.astMagazineCalibration[1].astReference = [null, point(436, 452, 300), point(-216.8, 622.4, 696)];
  state.Persistent_Value.astMagazineCalibration[2].uiMethod = 1;
  state.GVL_HMI.MagazinePitchX = 60; state.GVL_HMI.MagazinePitchY = 60;
  refresh(state);
  close(xyz(target(state, 19)), [138.4, 348.8, 372]);
  close(xyz(target(state, 19, 1, 'MAGAZINE_SAFE')), [138.4, 348.8, 342]);
  close(xyz(target(state, 19, 1, 'MAGAZINE_CHANGE')), [138.4, 348.8, 312]);
  close(xyz(target(state, 19, 2)), [1120, 620, 200]);
});

test('normalization removes reference skew without introducing size or tilt tolerances', () => {
  const result = frame(point(), { uiMethod: 3, astReference: [null, point(10, 10, 0), point(15, 25, 30)] });
  assert.equal(result.xReady, true);
  for (const axis of [result.stAxisX, result.stAxisY, result.stAxisZ]) assert.ok(Math.abs(Math.hypot(...xyz(axis)) - 1) < 1e-12);
  assert.ok(Math.abs(result.stAxisX.X * result.stAxisY.X + result.stAxisX.Y * result.stAxisY.Y + result.stAxisX.Z * result.stAxisY.Z) < 1e-12);
});

test('missing references, coincident points and collinear points cannot reuse an old valid target', () => {
  for (const mode of ['missing-b', 'missing-c', 'same-point', 'collinear']) {
    const state = fixture(); refresh(state); assert.equal(target(state, 23).xConfigured, true);
    const config = state.Persistent_Value.astMagazineCalibration[1];
    if (mode === 'missing-b') config.astReference[1].xConfigured = false;
    if (mode === 'missing-c') config.astReference[2].xConfigured = false;
    if (mode === 'same-point') config.astReference[1] = point(1000, 500, 200);
    if (mode === 'collinear') config.astReference[2] = point(1000, 1200, 200);
    refresh(state);
    assert.equal(state.axMagazinePointsReady[1], false);
    assert.equal(state.axMagazinePointsReady[2], true);
    assert.equal(target(state, 23).xConfigured, false);
  }
});

test('missing origin offsets and unsupported Modbus three-point mode block only the affected calibration', () => {
  const state = fixture(); state.Persistent_Value.astMagazineCalibration[2].uiMethod = 1;
  state.GVL_HMI.xModbusMode = true; refresh(state);
  assert.equal(state.axMagazinePointsReady[1], false);
  assert.equal(state.GVL_HMI.astMagazineCalibrationStatus[1].uiReason, 5);
  assert.equal(state.axMagazinePointsReady[2], true);
  state.GVL_HMI.xModbusMode = false;
  state.GVL_POINT.Points[22].MagazineSafeZ = 0; refresh(state);
  assert.equal(state.axMagazinePointsReady[1], false);
  assert.equal(state.GVL_HMI.astMagazineCalibrationStatus[1].uiReason, 1);
});

test('invalidation clears A B C atomically and preserves coordinates and the other magazine', () => {
  const state = fixture(); refresh(state);
  const before = structuredClone(state.Persistent_Value);
  state.InvalidateMagazineCalibration({ uiMagazine: 1 });
  assert.equal(state.Persistent_Value.astRetainPoints[14].xConfigured, false);
  assert.deepEqual(state.Persistent_Value.astMagazineCalibration[1].astReference.slice(1).map(p => p.xConfigured), [false, false]);
  assert.deepEqual(xyz(state.Persistent_Value.astRetainPoints[14]), xyz(before.astRetainPoints[14]));
  assert.deepEqual(state.Persistent_Value.astMagazineCalibration[2], before.astMagazineCalibration[2]);
  assert.equal(state.Persistent_Value.astRetainPoints[15].xConfigured, true);
  assert.equal(state.GVL_HMI.astMagazineCalibrationStatus[1].xReady, false);
});

test('cell settings select each method separately, invalidate changed calibration and consume rejected requests', () => {
  for (const magazine of [1, 2]) {
    const state = fixture(); state.GVL_HMI.uiCellSettingIndex = 39 + magazine;
    applySetting(state);
    assert.equal(state.GVL_HMI.uiCellSettingResult, 1);
    assert.equal(state.Persistent_Value.astMagazineCalibration[magazine].uiMethod, 1);
    assert.equal(state.Persistent_Value.astRetainPoints[13 + magazine].xConfigured, false);
    assert.equal(state.Persistent_Value.astRetainPoints[16 - magazine].xConfigured, true);
  }
  for (const block of ['enabled', 'busy', 'context', 'global-permission', 'point-check', 'expired', 'invalid-value']) {
    const state = fixture();
    if (block === 'enabled') state.GVL_MAGAZINE.astStatus[1].xEnabled = true;
    if (block === 'busy') state.GVL_TWO_PALLET.astStatus[1].xBusy = true;
    if (block === 'context') state.GVL_ROBOT.Status.uiMagazineContext = 1;
    if (block === 'global-permission') state.GVL_CELL_SETTINGS.xCellSettingsChangeAllowed = false;
    if (block === 'point-check') state.xPointCheckActive = true;
    if (block === 'expired') state.xFresh = false;
    if (block === 'invalid-value') state.GVL_HMI.lrCellSettingRequest = 2;
    const before = structuredClone(state.Persistent_Value); applySetting(state);
    assert.notEqual(state.GVL_HMI.uiCellSettingResult, 1, block);
    assert.equal(state.xCellSettingRejected, true, block);
    assert.deepEqual(state.Persistent_Value, before, block);
  }
});

test('reference SAVE owns its persistent point; stale method and lost permissions cannot write or invalidate', () => {
  for (const [index, magazine, reference] of [[15, 1, 1], [16, 1, 2], [17, 2, 1], [18, 2, 2]]) {
    const state = fixture(); state.GVL_HMI.uiPointEditorIndex = index;
    edit(state);
    assert.equal(state.GVL_HMI.uiPointEditorResult, 1);
    close(xyz(state.Persistent_Value.astMagazineCalibration[magazine].astReference[reference]), [1000, 850, 200]);
    assert.equal(state.GVL_HMI.udiPointEditorAckSeq, 9);
  }
  for (const command of [2, 4]) for (const stale of [false, true]) {
    const state = fixture(); state.GVL_HMI.uiPointEditorIndex = command === 4 ? 11 : 15;
    state.GVL_HMI.uiPointEditorCommand = command;
    if (stale) state.GVL_HMI.uiPointEditorCalibrationMethod = 1;
    else state.GVL_AXIS.arrAxis[1].Status.xHomed = false;
    const before = structuredClone(state.Persistent_Value); edit(state);
    assert.equal(state.GVL_HMI.uiPointEditorResult, 2);
    assert.equal(state.GVL_HMI.uiPointEditorRejectReason, stale ? 25 : 11);
    assert.deepEqual(state.Persistent_Value, before);
  }
  const state = fixture(); state.GVL_HMI.uiPointEditorIndex = 11; state.GVL_HMI.uiPointEditorCommand = 4;
  edit(state);
  assert.equal(state.GVL_HMI.uiPointEditorResult, 1);
  assert.equal(state.GVL_HMI.stPointEditorResultPoint.xConfigured, false);
  assert.equal(state.Persistent_Value.astMagazineCalibration[1].astReference[2].xConfigured, false);
});

test('PLC wiring preserves old point IDs and storage and refreshes readiness before magazine automata', () => {
  assert.deepEqual(['MAGAZINE_1_DETAIL', 'MAGAZINE_2_DETAIL', 'GEOMETRY_1_PLACE', 'GEOMETRY_2_PLACE', 'MAGAZINE_1_AXIS_X', 'MAGAZINE_1_AXIS_Y', 'MAGAZINE_2_AXIS_X', 'MAGAZINE_2_AXIS_Y'].map(name => E_POINT_NAME[name]), [22, 23, 24, 27, 30, 31, 32, 33]);
  assert.ok(declarations.indexOf('ReadHmiInputs();') < declarations.indexOf('RunMagazineCalibration();'));
  assert.ok(declarations.indexOf('RunMagazineCalibration();') < declarations.indexOf('RunTwoPallet();'));
  assert.match(readPlc('Persistent_Value.gvl.st'), /astMagazineCalibration : ARRAY \[1\.\.2\] OF ST_MAGAZINE_CALIBRATION;\s*END_VAR/);
  assert.match(readPlc('GVL/GVL_POINT.gvl.st'), /iPersistentPointCapacity : INT := 15/);
  const publish = readPlc('PLC_PRG.PublishHmi.st');
  for (const magazine of [1, 2]) assert.ok(publish.indexOf(`astMagazineCalibrationStatus[${magazine}].astPoints[3] :=`)
    < publish.indexOf(`astMagazineCalibrationStatus[${magazine}].uiMethod :=`));
});
