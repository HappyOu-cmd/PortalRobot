import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  CyclogramStore,
  classifyCyclogram,
  createCyclogramWorkbook,
  isTransientRobotActivity,
  stabilizeCyclogramStates,
} from './cyclogram.mjs';

const snapshot = (overrides = {}) => ({
  'stRobotStatus.xBusy': false,
  'stRobotStatus.eCurrentPoint': 0,
  'stRobotDiag.eActiveAction': 0,
  'stRobotDiag.eActivePoint': 0,
  'astMagazineStatus[1].xBusy': false,
  'astMagazineStatus[2].xBusy': false,
  'astMachineStatus[1].xBusy': false,
  'astMachineStatus[1].xRobotReleased': false,
  'astMachineStatus[1].xProcessing': false,
  'astMachineStatus[2].xBusy': false,
  'astMachineStatus[2].xRobotReleased': false,
  'astMachineStatus[2].xProcessing': false,
  'astMachineStatus[3].xBusy': false,
  'astMachineStatus[3].xRobotReleased': false,
  'astMachineStatus[3].xProcessing': false,
  ...overrides,
});

test('classifies PLC statuses into four parallel cyclogram lanes', () => {
  const states = classifyCyclogram(snapshot({
    'stRobotStatus.xBusy': true,
    'stRobotStatus.eCurrentPoint': 13,
    'stRobotDiag.eActiveAction': 1,
    'stRobotDiag.eActivePoint': 6,
    'astMachineStatus[1].xProcessing': true,
  }));

  assert.equal(states.robot.id, 'move-machine-2');
  assert.equal(states.robot.label, 'Перемещение к станку 2');
  assert.equal(states['machine-1'].id, 'processing');
  assert.equal(states['machine-2'].id, 'idle');
  assert.equal(states['machine-2'].category, 'machine-idle');
});

test('falls back to a safe generic robot action when PLC adds an unknown movement', () => {
  const states = classifyCyclogram(snapshot({
    'stRobotStatus.xBusy': true,
    'stRobotDiag.eActiveAction': 42,
    'stRobotDiag.eActivePoint': 91,
  }));

  assert.equal(states.robot.id, 'other-42-91');
  assert.equal(states.robot.category, 'robot-active');
  assert.match(states.robot.label, /Другое действие робота/);
});

test('keeps a future PLC movement visible instead of treating it as downtime', () => {
  const states = classifyCyclogram(snapshot({
    'stRobotStatus.xBusy': true,
    'stRobotDiag.eActiveAction': 1,
    'stRobotDiag.eActivePoint': 91,
  }));

  assert.equal(states.robot.id, 'move-other-91');
  assert.match(states.robot.label, /Перемещение робота/);
});

test('keeps all magazine sub-actions in one continuous robot interval', () => {
  const store = new CyclogramStore({ databasePath: ':memory:', retentionHours: 24, checkpointMs: 100 });
  const atMagazine = classifyCyclogram(snapshot({
    'stRobotStatus.xBusy': true,
    'stRobotStatus.eCurrentPoint': 13,
    'astMagazineStatus[1].xBusy': true,
  }));
  const transientReset = classifyCyclogram(snapshot({
    'stRobotStatus.xBusy': true,
    'stRobotDiag.eActiveAction': 1,
    'stRobotDiag.eActivePoint': 0,
  }));
  const nextMagazineAction = classifyCyclogram(snapshot({
    'stRobotStatus.xBusy': true,
    'stRobotStatus.eCurrentPoint': 15,
    'astMagazineStatus[1].xBusy': true,
  }));

  let stable = stabilizeCyclogramStates(null, atMagazine);
  store.record(stable, 1_000);
  stable = stabilizeCyclogramStates(stable, transientReset);
  store.record(stable, 2_000);
  stable = stabilizeCyclogramStates(stable, nextMagazineAction);
  store.record(stable, 3_000);

  const robotRows = store.intervals({ fromMs: 0, toMs: 4_000, nowMs: 4_000 })
    .filter((interval) => interval.lane === 'robot');
  assert.equal(robotRows.length, 1);
  assert.equal(robotRows[0].activityId, 'work-magazine');
  assert.equal(robotRows[0].startMs, 1_000);
  assert.equal(robotRows[0].endMs, null);
  store.closeDatabase();
});

test('absorbs micro idle around equipment work but keeps a real downtime', () => {
  const movingToMagazine = classifyCyclogram(snapshot({
    'stRobotStatus.xBusy': true,
    'stRobotStatus.eCurrentPoint': 4,
    'stRobotDiag.eActiveAction': 1,
    'stRobotDiag.eActivePoint': 13,
  }));
  const idle = classifyCyclogram(snapshot());
  assert.equal(isTransientRobotActivity(idle.robot), true);
  assert.equal(stabilizeCyclogramStates(movingToMagazine, idle, { transientForMs: 100 }).robot.id, 'move-magazine-machine-1');
  assert.equal(stabilizeCyclogramStates(movingToMagazine, idle, { transientForMs: 300 }).robot.id, 'idle');

  const atMagazine = classifyCyclogram(snapshot({
    'stRobotStatus.eCurrentPoint': 13,
  }));
  assert.equal(atMagazine.robot.id, 'work-magazine');
  assert.equal(stabilizeCyclogramStates(atMagazine, idle, { transientForMs: 5_000 }).robot.id, 'work-magazine');

  const leavingForMachine = classifyCyclogram(snapshot({
    'stRobotStatus.xBusy': true,
    'stRobotStatus.eCurrentPoint': 13,
    'stRobotDiag.eActiveAction': 1,
    'stRobotDiag.eActivePoint': 5,
  }));
  assert.equal(stabilizeCyclogramStates(atMagazine, leavingForMachine).robot.id, 'move-machine-2');
});

test('absorbs a half-updated OPC UA frame between any two robot actions', () => {
  const gripperAction = classifyCyclogram(snapshot({
    'stRobotStatus.xBusy': true,
    'stRobotDiag.eActiveAction': 3,
    'stRobotDiag.eActivePoint': 0,
  }));
  const idle = classifyCyclogram(snapshot());

  assert.equal(gripperAction.robot.id, 'other-3-0');
  assert.equal(stabilizeCyclogramStates(gripperAction, idle, { transientForMs: 100 }).robot.id, 'other-3-0');
  assert.equal(stabilizeCyclogramStates(gripperAction, idle, { transientForMs: 300 }).robot.id, 'idle');
});

test('uses machine busy and robot released as the exact machine-work boundaries', () => {
  const waitingAtMachine = classifyCyclogram(snapshot({
    'stRobotStatus.eCurrentPoint': 2,
  }));
  assert.equal(waitingAtMachine.robot.id, 'idle');

  const workingAtMachine = classifyCyclogram(snapshot({
    'astMachineStatus[1].xBusy': true,
  }));
  assert.equal(workingAtMachine.robot.id, 'work-machine-1');

  const releasedAtMachine = classifyCyclogram(snapshot({
    'astMachineStatus[1].xBusy': true,
    'astMachineStatus[1].xRobotReleased': true,
    'stRobotStatus.eCurrentPoint': 2,
  }));
  assert.equal(releasedAtMachine.robot.id, 'idle');
});

test('bridges the machine 2 release gap before movement to the magazine', () => {
  const workingAtMachine2 = classifyCyclogram(snapshot({
    'astMachineStatus[2].xBusy': true,
  }));
  const releasedAtMachine2 = classifyCyclogram(snapshot({
    'astMachineStatus[2].xBusy': true,
    'astMachineStatus[2].xRobotReleased': true,
    'stRobotStatus.eCurrentPoint': 8,
  }));
  const movingToMagazine = classifyCyclogram(snapshot({
    'stRobotStatus.xBusy': true,
    'stRobotStatus.eCurrentPoint': 8,
    'stRobotDiag.eActiveAction': 1,
    'stRobotDiag.eActivePoint': 13,
  }));

  const bridged = stabilizeCyclogramStates(workingAtMachine2, releasedAtMachine2, { transientForMs: 700 });
  assert.equal(bridged.robot.id, 'work-machine-2');
  assert.equal(stabilizeCyclogramStates(bridged, movingToMagazine).robot.id, 'move-magazine-machine-2');
  assert.equal(stabilizeCyclogramStates(workingAtMachine2, releasedAtMachine2, { transientForMs: 1_100 }).robot.id, 'idle');
});

test('starts machine processing from the direct cycle-active signal independently of robot work', () => {
  const states = classifyCyclogram(snapshot({
    'astMachineStatus[2].xBusy': true,
    'astMachineIoStatus[2].xCycleActive': true,
  }));

  assert.equal(states.robot.id, 'work-machine-2');
  assert.equal(states['machine-2'].id, 'processing');
});

test('keeps offline time empty and clears all saved intervals', () => {
  const store = new CyclogramStore({ databasePath: ':memory:', retentionHours: 24 });
  const start = 500_000;
  assert.deepEqual(store.intervals({ fromMs: 0, toMs: start, nowMs: start }), []);

  store.record(classifyCyclogram(snapshot()), start);
  const stopped = store.stop(start + 2_000);
  assert.equal(stopped.closed.length, 4);
  const rows = store.intervals({ fromMs: start, toMs: start + 10_000, nowMs: start + 10_000 });
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row) => row.endMs === start + 2_000));
  assert.ok(rows.every((row) => row.category !== 'no-data'));

  store.clear();
  assert.deepEqual(store.intervals({ fromMs: 0, toMs: start + 10_000, nowMs: start + 10_000 }), []);
  store.closeDatabase();
});

test('persists closed intervals while keeping parallel lanes aligned', () => {
  const store = new CyclogramStore({ databasePath: ':memory:', retentionHours: 24, checkpointMs: 100 });
  const start = 1_000_000;
  store.record(classifyCyclogram(snapshot({ 'astMachineStatus[1].xProcessing': true })), start);
  const update = store.record(classifyCyclogram(snapshot({
    'astMachineStatus[1].xProcessing': true,
    'stRobotStatus.xBusy': true,
    'stRobotDiag.eActiveAction': 1,
    'stRobotDiag.eActivePoint': 13,
    'stRobotStatus.eCurrentPoint': 2,
  })), start + 3_000);

  assert.equal(update.closed.length, 1);
  assert.equal(update.closed[0].lane, 'robot');
  const rows = store.intervals({ fromMs: start, toMs: start + 5_000, nowMs: start + 5_000 });
  const machine = rows.find((row) => row.lane === 'machine-1');
  const robot = rows.filter((row) => row.lane === 'robot');
  assert.equal(machine?.endMs, null);
  assert.equal(robot.length, 2);
  assert.equal(robot[0].endMs, start + 3_000);
  store.closeDatabase();
});

test('exports a native colour Gantt chart with one row per action', async () => {
  const from = 2_000_000;
  const buffer = await createCyclogramWorkbook([
    { id: 1, lane: 'robot', activityId: 'move-machine-1', label: 'Перемещение к станку 1', category: 'robot-active', startMs: from, endMs: from + 20_000, lastSeenMs: from + 20_000 },
    { id: 2, lane: 'machine-1', activityId: 'processing', label: 'Обработка', category: 'machine-processing', startMs: from, endMs: from + 60_000, lastSeenMs: from + 60_000 },
    { id: 3, lane: 'robot', activityId: 'idle', label: 'Простой', category: 'robot-idle', startMs: from + 20_000, endMs: from + 30_000, lastSeenMs: from + 30_000 },
    { id: 4, lane: 'machine-2', activityId: 'idle', label: 'Простой', category: 'machine-idle', startMs: from, endMs: from + 60_000, lastSeenMs: from + 60_000 },
    { id: 5, lane: 'robot', activityId: 'work-machine-3', label: 'Работа в станке 3', category: 'robot-active', startMs: from + 30_000, endMs: from + 30_200, lastSeenMs: from + 30_200 },
  ], { fromMs: from, toMs: from + 86_400_000, exportedAtMs: from + 60_000 });

  const archive = await JSZip.loadAsync(buffer);
  const chart = await archive.file('xl/charts/chart1.xml')?.async('string');
  assert.ok(chart);
  assert.match(chart, /<c:barDir val="bar"\/>/);
  assert.match(chart, /<c:grouping val="stacked"\/>/);
  assert.match(chart, /val="2C7EEB"><a:alpha val="24000"/);
  assert.match(chart, /val="82919C"><a:alpha val="22000"/);
  assert.match(chart, /val="51B84D"><a:alpha val="27000"/);
  assert.match(chart, /val="DA4B52"><a:alpha val="20000"/);
  assert.match(chart, /'Циклограмма'!\$F\$5:\$F\$8/);
  assert.match(chart, /<c:max val="60"\/>/);
  assert.match(chart, /<c:axPos val="t"\/>/);
  assert.match(chart, /<c:crosses val="autoZero"\/><c:crossBetween val="between"\/>/);
  assert.match(chart, /<c:autoTitleDeleted val="1"\/>/);
  assert.match(chart, /<c:tickLblPos val="none"\/>/);
  assert.doesNotMatch(chart, /<c:title>/);
  assert.doesNotMatch(chart, /Работа в станке 3/);
  assert.ok(archive.file('xl/drawings/drawing1.xml'));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Циклограмма');
  assert.ok(sheet);
  assert.equal(sheet.rowCount, 8);
  assert.equal(sheet.getCell('A5').value, 'Робот');
  assert.equal(sheet.getCell('A6').value, 'Станок 1');
  assert.equal(sheet.getColumn(6).hidden, true);
  assert.equal(sheet.getCell('A5').border?.left?.color?.argb, 'FFD9E9FF');
});

test('uses the actual event window and a one-minute step for a 40-minute fragment of a 24-hour report', async () => {
  const reportFrom = 10_000_000;
  const dataFrom = reportFrom + 84_000_000;
  const dataTo = reportFrom + 86_400_000;
  const buffer = await createCyclogramWorkbook([
    { id: 1, lane: 'robot', activityId: 'idle', label: 'Простой', category: 'robot-idle', startMs: dataFrom, endMs: dataFrom + 1_000, lastSeenMs: dataFrom + 1_000 },
    { id: 2, lane: 'machine-1', activityId: 'processing', label: 'Обработка', category: 'machine-processing', startMs: dataFrom, endMs: dataTo, lastSeenMs: dataTo },
  ], { fromMs: reportFrom, toMs: dataTo, exportedAtMs: dataTo });

  const archive = await JSZip.loadAsync(buffer);
  const chart = await archive.file('xl/charts/chart1.xml')?.async('string');
  const drawing = await archive.file('xl/drawings/drawing1.xml')?.async('string');
  assert.ok(chart);
  assert.ok(drawing);
  assert.match(chart, /<c:max val="2400"\/>/);
  assert.match(chart, /<c:majorUnit val="60"\/>/);
  assert.match(chart, /<c:numCache><c:formatCode>0\.000<\/c:formatCode><c:ptCount val="2"\/><c:pt idx="0"><c:v>0<\/c:v><\/c:pt>/);
  assert.match(drawing, /<xdr:to><xdr:col>38<\/xdr:col>/);
  assert.match(drawing, /<xdr:row>6<\/xdr:row>/);
});
