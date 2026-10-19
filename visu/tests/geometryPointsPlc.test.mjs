import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSt, defaultsFromSt, readPlc } from './helpers/geometryStRuntime.mjs';

const editor = readPlc('PLC_PRG.ReadHmiInputs.st').split('xPointEditorAllHomed :=')[1].split('// Плоский OPC UA-интерфейс')[0];
const execute = compileSt('xPointEditorAllHomed :=' + editor);
function state(index = 13, environment = 0) {
  const point = { Name: '', X: 0, Y: 0, Z: 0, MagazineSafeZ: 0, MagazineChangeZ: 0, SpeedFactor: 0, xConfigured: false };
  const config = { xConfigured: false, lrX: 0, lrY: 0, lrZ: 0, lrSafeZ: -300, lrChangeZ: -150, lrSpeedFactor: .2 };
  return { ...defaultsFromSt(readPlc('PLC_PRG.st')),
    E_POINT_NAME: { NONE: 0, MACHINE_1_ABOVE: 1, GEOMETRY_1_PLACE: 24, GEOMETRY_2_PLACE: 27, MAGAZINE_1_DETAIL: 22, MAGAZINE_2_DETAIL: 23 }, E_CELL_TEST_ENVIRONMENT: { NORMAL: 0, SC500_BENCH: 2 },
    WRN_POINT_EDIT_REJECTED: 15, WRN_POINT_CHECK_REJECTED: 16, xHmiConnectionAlive: true,
    alrRobotSoftwareMinPosition: [null, -1000, -1000, -1000], alrRobotSoftwareMaxPosition: [null, 1000, 1000, 1000],
    stGeometryConfig: { ...config }, GVL_CELL_SETTINGS: { eTestEnvironment: environment },
    GVL_AXIS: { arrAxis: [null, ...[1, 2, 3].map(() => ({ Status: { xHomed: true } }))] },
    GVL_AXIS_GROUP: { AxisGroup: { Status: { xPositionValid: true } } },
    GVL_CELL_CONTROL: { xManual: true, xGlobalError: false }, GVL_CELL_MANAGER: { Status: { xRunning: false } },
    GVL_ROBOT: { Status: { xBusy: false } }, GVL_MOTION_MANAGER: { stMotionManager: { Status: { xError: false } } },
    GVL_POINT_MANAGER: { PointManager: { Diag: { xXLimitValid: true, xYLimitValid: true, xZLimitValid: true } } },
    Persistent_Value: { astRetainPoints: [null, ...Array.from({ length: 15 }, () => ({ ...point, X: 42 }))], astConfig: [null, { ...config }, { ...config }] },
    GVL_POINT: { Points: Array.from({ length: 100 }, () => ({ ...point })) },
    GVL_GEOMETRY_CONTROL: { astStatus: [null, { xConfigAllowed: true, xPointWriteAllowed: true }, { xConfigAllowed: true, xPointWriteAllowed: true }], astSimulationConfig: [null, { ...config }, { ...config }], astActiveConfig: [null, { ...config }, { ...config }] },
    GVL_HMI: { udiPointEditorCommandSeq: 8, uiPointEditorCommand: 2, uiPointEditorIndex: index, xModbusMode: false,
      alrPointEditorDraftXYZ: [null, 100, 200, 500], lrPointEditorDraftMagazineSafeZ: -300, lrPointEditorDraftMagazineChangeZ: 0,
      lrPointEditorDraftSpeedFactor: .1, stPointEditorResultPoint: { ...point } },
  };
}

test('PLC saves both GK bases in their environment owner and preserves old Persistent storage', () => {
  for (const environment of [0, 1]) for (const index of [13, 14]) {
    const s = state(index, environment), before = structuredClone(s.Persistent_Value.astRetainPoints);
    execute(s);
    assert.equal(s.GVL_HMI.uiPointEditorResult, 1);
    assert.equal(s.GVL_HMI.udiPointEditorAckSeq, 8);
    const current = environment === 0 ? s.Persistent_Value.astConfig : s.GVL_GEOMETRY_CONTROL.astSimulationConfig;
    const other = environment === 0 ? s.GVL_GEOMETRY_CONTROL.astSimulationConfig : s.Persistent_Value.astConfig;
    assert.deepEqual([current[index - 12].lrX, current[index - 12].lrSafeZ, current[index - 12].xConfigured], [100, -300, true]);
    assert.equal(other[index - 12].xConfigured, false);
    assert.deepEqual(s.Persistent_Value.astRetainPoints, before);
    assert.equal(s.GVL_HMI.stPointEditorResultPoint.MagazineSafeZ, -300);
  }
});

test('PLC rejects unsafe SAFE_Z without changing coordinates', () => {
  for (const offset of [0, 100, -2000, Number.NaN]) {
    const s = state(); s.GVL_HMI.lrPointEditorDraftMagazineSafeZ = offset;
    execute(s); assert.equal(s.GVL_HMI.uiPointEditorRejectReason, 22);
    assert.equal(s.Persistent_Value.astConfig[1].xConfigured, false);
  }
});

test('GK SAVE and published permission ignore all technological blocks in both environments', () => {
  const publish = compileSt(readPlc('PLC_PRG.RunGeometryControl.st').match(/GVL_GEOMETRY_CONTROL\.astStatus\[uiGeometry\]\.xPointWriteAllowed :=[\s\S]*?;/)[0]);
  for (const environment of [0, 1]) for (const index of [13, 14]) {
    const s = state(index, environment);
    Object.assign(s.GVL_CELL_CONTROL, { xManual: false, xGlobalError: true });
    s.GVL_CELL_MANAGER.Status.xRunning = true;
    s.GVL_ROBOT.Status.xBusy = true;
    s.GVL_MOTION_MANAGER.stMotionManager.Status.xError = true;
    s.xMotionBusy = true; s.xDriveError = true; s.xPointCheckActive = true; s.xIoManualActive = true;
    s.GVL_AXIS.arrAxis[1].Status.xHomed = false;
    s.GVL_AXIS_GROUP.AxisGroup.Status.xPositionValid = false;
    Object.assign(s.GVL_GEOMETRY_CONTROL.astStatus[index - 12], { xPointWriteAllowed: false,
      xConfigAllowed: false, xRecoveryRequired: true, xEnabled: true, xDriveRunning: true,
      xOccupied: true, xReserved: true, xError: true, xResetBusy: true });
    const before = structuredClone(s.GVL_GEOMETRY_CONTROL.astStatus);
    execute(s);
    assert.equal(s.GVL_HMI.xPointEditorSaveAllowed, false);
    assert.equal(s.GVL_HMI.uiPointEditorResult, 1);
    assert.equal(s.GVL_HMI.uiPointEditorRejectReason, 0);
    assert.equal(s.GVL_HMI.udiPointEditorAckSeq, 8);
    const owner = environment === 0 ? s.Persistent_Value.astConfig : s.GVL_GEOMETRY_CONTROL.astSimulationConfig;
    assert.equal(owner[index - 12].lrX, 100);
    assert.deepEqual(s.GVL_GEOMETRY_CONTROL.astStatus, before);
    s.uiGeometry = index - 12; s.GVL_GEOMETRY_CONTROL.xSupported = true;
    publish(s);
    assert.equal(s.GVL_GEOMETRY_CONTROL.astStatus[index - 12].xPointWriteAllowed, true);
  }
});

test('GK SAVE still rejects lost connection, unsupported interface, missing limits and invalid data', () => {
  const cases = [
    [s => { s.xHmiConnectionAlive = false; }, 3],
    [s => { s.GVL_HMI.xModbusMode = true; }, 5],
    [s => { s.GVL_CELL_SETTINGS.eTestEnvironment = 2; }, 5],
    [s => { s.GVL_POINT_MANAGER.PointManager.Diag.xZLimitValid = false; }, 13],
    [s => { s.GVL_HMI.alrPointEditorDraftXYZ[1] = 1001; }, 14],
    [s => { s.GVL_HMI.alrPointEditorDraftXYZ[1] = Number.NaN; }, 14],
    [s => { s.GVL_HMI.lrPointEditorDraftSpeedFactor = 0.09; }, 15],
    [s => { s.GVL_HMI.lrPointEditorDraftSpeedFactor = Number.NaN; }, 15],
  ];
  for (const [configure, reason] of cases) {
    const s = state(); configure(s); const before = structuredClone(s.Persistent_Value.astConfig);
    execute(s);
    assert.equal(s.GVL_HMI.uiPointEditorResult, 2);
    assert.equal(s.GVL_HMI.uiPointEditorRejectReason, reason);
    assert.equal(s.GVL_HMI.udiPointEditorAckSeq, 8);
    assert.deepEqual(s.Persistent_Value.astConfig, before);
    assert.equal(s.uiRobotInterfaceWarningCode, s.WRN_POINT_EDIT_REJECTED);
  }
});

test('published GK write permission only requires the data channel and valid limits', () => {
  const publish = compileSt(readPlc('PLC_PRG.RunGeometryControl.st').match(/GVL_GEOMETRY_CONTROL\.astStatus\[uiGeometry\]\.xPointWriteAllowed :=[\s\S]*?;/)[0]);
  for (const configure of [
    s => { s.xHmiConnectionAlive = false; },
    s => { s.GVL_GEOMETRY_CONTROL.xSupported = false; },
    ...['xXLimitValid', 'xYLimitValid', 'xZLimitValid'].map(field => s => { s.GVL_POINT_MANAGER.PointManager.Diag[field] = false; }),
  ]) {
    const s = state(); s.uiGeometry = 1; s.GVL_GEOMETRY_CONTROL.xSupported = true;
    configure(s); publish(s);
    assert.equal(s.GVL_GEOMETRY_CONTROL.astStatus[1].xPointWriteAllowed, false);
  }
});

test('legacy geometry Config command also ignores station and robot blocks and validates the draft', () => {
  const source = readPlc('PLC_PRG.RunGeometryControl.st');
  const branch = source.slice(source.indexOf('ELSIF (stGeometryRequest.uiAction = UINT#11)'), source.indexOf('ELSIF (stGeometryRequest.uiAction = UINT#13)'));
  const save = compileSt(branch.replace(/^ELSIF/, 'IF') + '\nEND_IF;');
  for (const environment of [0, 1]) for (const station of [1, 2]) {
    const s = state(station + 12, environment);
    s.uiGeometry = station;
    s.GVL_GEOMETRY_CONTROL.xSupported = true;
    s.GVL_HMI.xPointEditorSaveAllowed = false;
    s.GVL_HMI.uiGeometryResult = 2;
    Object.assign(s.GVL_GEOMETRY_CONTROL.astStatus[station], { xPointWriteAllowed: false,
      xRecoveryRequired: true, xError: true, xResetBusy: true, xDriveRunning: true, xOccupied: true });
    Object.assign(s.GVL_CELL_CONTROL, { xManual: false, xGlobalError: true });
    s.xMotionBusy = true; s.xIoManualActive = true; s.GVL_ROBOT.Status.xBusy = true;
    s.stGeometryRequest = { uiAction: 11, Config: { ...s.stGeometryConfig, lrX: 100, lrY: 200, lrZ: 500 } };
    Object.assign(s.GVL_POINT_MANAGER.PointManager.Diag, { lrX_MinLimit: -1000, lrX_MaxLimit: 1000,
      lrY_MinLimit: -1000, lrY_MaxLimit: 1000, lrZ_MinLimit: -1000, lrZ_MaxLimit: 1000 });
    const before = structuredClone(s.GVL_GEOMETRY_CONTROL.astStatus);
    save(s);
    assert.equal(s.GVL_HMI.uiGeometryResult, 1);
    const owner = environment === 0 ? s.Persistent_Value.astConfig : s.GVL_GEOMETRY_CONTROL.astSimulationConfig;
    assert.equal(owner[station].lrX, 100);
    assert.equal(owner[station].lrChangeZ, -300);
    assert.equal(owner[station].xConfigured, true);
    assert.deepEqual(s.GVL_GEOMETRY_CONTROL.astStatus, before);
    for (const [field, value] of [['lrX', 1001], ['lrSafeZ', 0], ['lrSpeedFactor', 0.09]]) {
      s.stGeometryRequest.Config[field] = value;
      s.GVL_HMI.uiGeometryResult = 2;
      const saved = structuredClone(owner);
      save(s);
      assert.equal(s.GVL_HMI.uiGeometryResult, 2);
      assert.deepEqual(owner, saved);
      s.stGeometryRequest.Config[field] = field === 'lrX' ? 100 : field === 'lrSafeZ' ? -300 : 0.2;
    }
  }
});

test('CAPTURE, CHECK and non-GK SAVE keep the existing robot and mode restrictions', () => {
  for (const [index, command] of [[13, 1], [14, 3], [1, 2]]) {
    for (const [configure, reason] of [
      [s => { s.GVL_CELL_CONTROL.xManual = false; }, 4],
      [s => { s.GVL_ROBOT.Status.xBusy = true; }, 8],
      [s => { s.GVL_AXIS.arrAxis[1].Status.xHomed = false; }, 11],
    ]) {
      const s = state(index); s.GVL_HMI.uiPointEditorCommand = command; configure(s);
      execute(s);
      assert.equal(s.GVL_HMI.uiPointEditorResult, 2);
      assert.equal(s.GVL_HMI.uiPointEditorRejectReason, reason);
    }
  }
});

test('PLC records a GK base while the station and conveyor are enabled and occupied', () => {
  for (const index of [13, 14]) {
    const s = state(index);
    Object.assign(s.GVL_GEOMETRY_CONTROL.astStatus[index - 12], { xConfigAllowed: false, xEnabled: true, xDriveRunning: true, xOccupied: true });
    s.alrRobotSoftwareMaxPosition[1] = 10000;
    s.GVL_HMI.alrPointEditorDraftXYZ[1] = 8381.10999995771;
    execute(s);
    assert.equal(s.GVL_HMI.uiPointEditorResult, 1);
    assert.equal(s.GVL_HMI.stPointEditorResultPoint.X, 8381.10999995771);
    assert.equal(s.Persistent_Value.astConfig[index - 12].lrX, 8381.10999995771);
    assert.equal(s.GVL_GEOMETRY_CONTROL.astStatus[index - 12].xDriveRunning, true);
  }
});

test('PLC repeated CAPTURE returns the complete current XYZ without altering stored points after a rejected SAVE', () => {
  const s = state();
  s.GVL_HMI.lrPointEditorDraftMagazineSafeZ = 0;
  execute(s);
  assert.equal(s.GVL_HMI.uiPointEditorResult, 2);
  const saved = structuredClone(s.Persistent_Value.astConfig);
  Object.assign(s.GVL_AXIS_GROUP.AxisGroup.Status, { ActualX: 8381.10999995771, ActualY: -76.90319995594032, ActualZ: 1234.830799988001 });
  Object.assign(s.GVL_HMI.stPointEditorResultPoint, { X: 3030.9016, Y: 471.7284, Z: 1280.804 });
  s.GVL_HMI.uiPointEditorCommand = 1;
  for (const sequence of [9, 10, 11]) {
    s.GVL_HMI.udiPointEditorCommandSeq = sequence;
    execute(s);
    assert.equal(s.GVL_HMI.uiPointEditorResult, 1);
    assert.equal(s.GVL_HMI.udiPointEditorAckSeq, sequence);
    const p = s.GVL_HMI.stPointEditorResultPoint;
    assert.deepEqual([p.X, p.Y, p.Z], [8381.10999995771, -76.90319995594032, 1234.830799988001]);
    assert.deepEqual(s.Persistent_Value.astConfig, saved);
  }
});

test('editor publishes fourteen stable point IDs while readiness and old retain layout stay unchanged', () => {
  const publish = readPlc('PLC_PRG.PublishHmi.st');
  assert.match(publish, /auiPointEditorPointId\[13\] := TO_UINT\(E_POINT_NAME\.GEOMETRY_1_PLACE\)/);
  assert.match(publish, /auiPointEditorPointId\[14\] := TO_UINT\(E_POINT_NAME\.GEOMETRY_2_PLACE\)/);
  assert.match(readPlc('GVL/GVL_HMI.gvl.st'), /astPointEditorPoints : ARRAY \[1\.\.14\]/);
  const storage = readPlc('GVL/GVL_POINT.gvl.st');
  assert.match(storage, /iPersistentPointCapacity : INT := 15/);
  assert.match(storage, /iRequiredPointCount : INT := 12/);
  assert.match(readPlc('PLC_PRG.SetApplicationDefaults.st'), /TO INT_TO_UINT\(GVL_POINT\.iRequiredPointCount\)/);
});
