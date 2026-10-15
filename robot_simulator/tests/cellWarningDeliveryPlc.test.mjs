// Reproduce the W52 -> stale W29 relay bug with actual ST across PLC scans.
import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSt, conversions, defaultsFromSt, readPlc } from '../../visu/tests/helpers/geometryStRuntime.mjs';

const main = readPlc('PLC_PRG.st');
const routeSource = readPlc('PLC_PRG.RunAlarms.st');
const cellSource = readPlc('PLC_PRG.RunCellControl.st');
const managerSource = readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st');
const alarmSource = readPlc('FB/FB_ALARM_MANAGER.st');
const addSource = readPlc('FB/FB_ALARM_MANAGER.AddEvent.st');
const enums = {};
for (const [, group, name] of [routeSource, managerSource, alarmSource, addSource].join('\n').matchAll(/\b(E_\w+)\.(\w+)/g)) {
  (enums[group] ??= {})[name] = `${group}.${name}`;
}
const compile = source => compileSt(source.replace(/\b(AddEvent|UpdateSource)\(([^()]+)\)/g,
  (_, name, args) => `${name}({${args.replaceAll(':=', ':')}})`));
const relay = compile(routeSource.slice(routeSource.indexOf('// В журнал передаются'),
  routeSource.indexOf('\nastAlarmSource[2].eSource')));
const oldConfigStart = cellSource.indexOf('IF GVL_MULTI_TYPE.ConfigStatus.stWarning.udiSequence');
const configRelay = oldConfigStart < 0 ? () => {} : compile(cellSource.slice(oldConfigStart,
  cellSource.indexOf('// Сначала снимаем', oldConfigStart)));
const runAlarm = compile(alarmSource);
const addEvent = compile(addSource);
const conditionStart = managerSource.indexOf('xNoDetailDestinationCondition :=');
const condition = managerSource.slice(conditionStart, managerSource.indexOf(';', conditionStart) + 1);
const eventStart = managerSource.indexOf('IF xNoDetailDestinationCondition\n');
const warn = compile(condition + '\n' + managerSource.slice(eventStart,
  managerSource.indexOf('\nIF xNoBlankStockCondition', eventStart)));

function fixture(typeCount = 1) {
  const emptyWarning = () => ({ uiCode: 0, udiSequence: 0 });
  const rawWarning = { uiCode: 29, udiSequence: 10 }; // Previously genuine W29, retained by its owner.
  const route = { ...enums, ...conversions, ...defaultsFromSt(main),
    GVL_CELL_MANAGER: { Diag: { stWarning: emptyWarning() }, Error: { dwAlarmActive: 0 } },
    GVL_MULTI_TYPE: { ConfigStatus: { stWarning: emptyWarning() } },
    GVL_GEOMETRY_CONTROL: { stCellWarning: emptyWarning(), xSupported: true,
      astActiveMemory: [null, { dwAlarm: 0 }, { dwAlarm: 0 }],
      astStatus: [null, { xRobotStopRequired: false }, { xRobotStopRequired: false }],
      astWarning: [null, emptyWarning(), emptyWarning()] },
    GVL_CELL_CONTROL: { xGlobalError: false },
    astAlarmSource: [null, ...Array.from({ length: 19 }, () => ({ dwAlarmActive: 0,
      eSource: 'E_ALARM_SOURCE.CELL', xRobotStopRequired: false, xGlobalError: false,
      stWarning: emptyWarning() }))],
    astAdditionalCellWarning: [null, emptyWarning(), emptyWarning()],
  };
  const owner = { ...enums, ...conversions, Config: { uiTypeCount: typeCount },
    xRunning: true, rtStart: { Q: false }, rtStop: { Q: false }, xStopRequested: false,
    xManual: false, xMagazineExchangeActive: false, stRobotStatus: { xDetailAvailable: false },
    uiDetailPayloadType: 0, xAnyMagazineDetailSlotAvailable: false,
    xMagazine1CanExchangeDetail: false, xMagazine2CanExchangeDetail: false,
    xHeldBlankLoadAvailable: false, eState: 'E_CELL_MANAGER_STATE.WAIT_MAGAZINE',
    xNoDetailDestinationCondition: false, xDetailDestinationWarningActive: false, WRN_NO_DETAIL_DESTINATION: 29,
    Diag: { stWarning: rawWarning } };
  const alarm = { ...enums, ...conversions, ...defaultsFromSt(alarmSource),
    xResetWarnings: false, Sources: route.astAlarmSource,
    astAdditionalCellWarning: route.astAdditionalCellWarning,
    adwPreviousAlarm: Array(20).fill(0), audiPreviousWarning: Array(20).fill(0),
    audiPreviousAdditionalCellWarning: Array(3).fill(0),
    uiWriteIndex: 1, Status: {}, Events: [null, ...Array.from({ length: 100 }, () => ({
      udiSequence: 0, xActive: false }))],
    UpdateSource: () => {}, // All alarm masks are zero; isolate warning delivery.
  };
  alarm.AddEvent = args => {
    const local = { ...alarm, ...args };
    addEvent(local);
    alarm.udiSequence = local.udiSequence; alarm.uiWriteIndex = local.uiWriteIndex;
  };
  return { route, owner, alarm };
}
function scan(s) {
  warn(s.owner);
  // RunCellControl publishes the FB's own output anew on EVERY scan.
  s.route.GVL_CELL_MANAGER.Diag = structuredClone(s.owner.Diag);
  configRelay(s.route);
  relay(s.route);
  runAlarm(s.alarm);
}
const records = s => s.alarm.Events.filter(e => e?.udiSequence).map(e => e.uiCode);
const active = s => s.alarm.Events.filter(e => e?.xActive).map(e => e.uiCode);

test('W52 after an empty return never replays historical W29 for one, two or three types', () => {
  for (const count of [1, 2, 3]) {
    const s = fixture(count);
    scan(s); assert.deepEqual(records(s), [29]);
    s.alarm.xResetWarnings = true; scan(s); s.alarm.xResetWarnings = false;
    assert.deepEqual(active(s), []);
    s.route.GVL_GEOMETRY_CONTROL.stCellWarning = { uiCode: 52, udiSequence: 1 };
    scan(s); assert.deepEqual(active(s), [52]);
    for (let i = 0; i < 10; i++) scan(s);
    assert.deepEqual(records(s), [29, 52]);
    assert.deepEqual(active(s), [52]);
    assert.equal(s.owner.xNoDetailDestinationCondition, false);
    assert.deepEqual(s.owner.Diag.stWarning, { uiCode: 29, udiSequence: 10 });
    assert.deepEqual(s.route.GVL_CELL_MANAGER.Diag.stWarning, s.owner.Diag.stWarning);
  }
});

test('warning reset followed by another full GK interval registers only the new W52', () => {
  const s = fixture(); scan(s);
  for (let sequence = 1; sequence <= 3; sequence++) {
    s.alarm.xResetWarnings = true; scan(s); s.alarm.xResetWarnings = false;
    s.route.GVL_GEOMETRY_CONTROL.stCellWarning = { uiCode: 52, udiSequence: sequence };
    for (let i = 0; i < 3; i++) scan(s);
    assert.deepEqual(active(s), [52]);
  }
  assert.deepEqual(records(s), [29, 52, 52, 52]);
});

test('genuine W29 after a new missing-destination episode is still registered', () => {
  const s = fixture(3); scan(s);
  s.route.GVL_GEOMETRY_CONTROL.stCellWarning = { uiCode: 52, udiSequence: 1 };
  scan(s); scan(s);
  s.owner.stRobotStatus.xDetailAvailable = true; s.owner.uiDetailPayloadType = 2;
  scan(s); scan(s);
  assert.deepEqual(records(s), [29, 52, 29]);
  assert.equal(s.owner.xNoDetailDestinationCondition, true);
  assert.equal(s.owner.Diag.stWarning.udiSequence, 11);
  s.owner.stRobotStatus.xDetailAvailable = false;
  for (let i = 0; i < 3; i++) scan(s);
  assert.deepEqual(records(s), [29, 52, 29]);
});

test('configuration warnings retain their own sequence and cannot replay the cell warning', () => {
  const s = fixture(); scan(s);
  s.route.GVL_MULTI_TYPE.ConfigStatus.stWarning = { uiCode: 23, udiSequence: 1 };
  for (let i = 0; i < 4; i++) scan(s);
  assert.deepEqual(records(s), [29, 23]);
  s.route.GVL_MULTI_TYPE.ConfigStatus.stWarning = { uiCode: 24, udiSequence: 2 };
  scan(s); scan(s);
  assert.deepEqual(records(s), [29, 23, 24]);
});

test('simultaneous cell, configuration and GK warnings are all delivered once with WARNING effect', () => {
  const s = fixture();
  s.route.GVL_MULTI_TYPE.ConfigStatus.stWarning = { uiCode: 23, udiSequence: 1 };
  s.route.GVL_GEOMETRY_CONTROL.stCellWarning = { uiCode: 52, udiSequence: 1 };
  scan(s); scan(s);
  assert.deepEqual(records(s), [29, 23, 52]);
  assert.equal(s.alarm.Status.uiActiveWarningCount, 3);
  for (const e of s.alarm.Events.filter(e => e?.udiSequence)) {
    assert.equal(e.eSource, 'E_ALARM_SOURCE.CELL');
    assert.equal(e.eSeverity, 'E_ALARM_SEVERITY.WARNING');
    assert.equal(e.eEffect, 'E_ALARM_EFFECT.WARNING');
  }
});

test('zero sequences or codes never replay an event; owner counters and journal handle rollover', () => {
  const s = fixture(); scan(s);
  s.route.GVL_GEOMETRY_CONTROL.stCellWarning = { uiCode: 52, udiSequence: 0 };
  scan(s);
  s.route.GVL_MULTI_TYPE.ConfigStatus.stWarning = { uiCode: 0, udiSequence: 1 };
  scan(s); assert.deepEqual(records(s), [29]);
  s.route.GVL_GEOMETRY_CONTROL.stCellWarning = { uiCode: 52, udiSequence: 0xffffffff };
  s.alarm.udiSequence = 0xffffffff;
  scan(s); scan(s);
  assert.deepEqual(records(s), [29, 52]);
  assert.equal(s.alarm.Events[2].udiSequence, 1);
  s.route.GVL_GEOMETRY_CONTROL.stCellWarning = { uiCode: 52, udiSequence: 1 };
  scan(s); scan(s);
  assert.deepEqual(records(s), [29, 52, 52]);
});

test('warning reset in the same scan as a new GK warning clears old entries and keeps the new one', () => {
  const s = fixture(); scan(s);
  s.alarm.xResetWarnings = true;
  s.route.GVL_GEOMETRY_CONTROL.stCellWarning = { uiCode: 52, udiSequence: 1 };
  scan(s); s.alarm.xResetWarnings = false;
  scan(s);
  assert.deepEqual(active(s), [52]);
  assert.deepEqual(records(s), [29, 52]);
});
