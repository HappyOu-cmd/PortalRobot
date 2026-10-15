import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { geometrySymbols } from '../gateway/geometry-control.mjs';
import { readPlc } from './helpers/geometryStRuntime.mjs';

const strip = s => s.replace(/\(\*[\s\S]*?\*\)/g, '').replace(/\/\/[^\r\n]*/g, '').replace(/'[^']*'/g, '');
const fields = s => Object.fromEntries([...strip(s).matchAll(/^\s*(\w+)\s*:\s*(?:ARRAY\s*\[[^\]]+\]\s*OF\s*)?(\w+)/gm)].map(m => [m[1], m[2]]));
const schema = fields(readPlc('GVL/GVL_HMI.gvl.st'));
const types = Object.fromEntries(['STATUS', 'CONFIG', 'CALL', 'REQUEST', 'EVENT'].map(name => [`ST_GEOMETRY_${name}`, fields(readPlc(`ST/ST_GEOMETRY_CONTROL/ST_GEOMETRY_${name}.st`))]));

test('every geometry OPC UA path resolves to an existing PLC public declaration and nested type', () => {
  assert.equal(new Set(geometrySymbols).size, geometrySymbols.length);
  for (const path of geometrySymbols) {
    let declarations = schema;
    for (const part of path.replace(/\[\d+\]/g, '').split('.')) {
      assert.ok(declarations && Object.hasOwn(declarations, part), `Undeclared OPC UA path: ${path}`);
      declarations = types[declarations[part]];
    }
  }
  assert.ok(!geometrySymbols.some(path => path.includes('xManualStopAllowed')), 'Stop must remain unconditional');
});

test('geometry GVL references and the I/O manual owner exist in the actual PLC declarations', () => {
  const declarations = fields(readPlc('GVL/GVL_GEOMETRY_CONTROL.gvl.st'));
  const root = new URL('../../Portal_robot/Device/application/', import.meta.url);
  const files = readdirSync(root, { recursive: true }).filter(p => p.endsWith('.st'));
  for (const file of files) {
    const source = readPlc(file);
    for (const [, name] of strip(source).matchAll(/GVL_GEOMETRY_CONTROL\.(\w+)/g)) assert.ok(Object.hasOwn(declarations, name), `${file}: undeclared ${name}`);
  }
  assert.match(readPlc('PLC_PRG.st'), /xIoManualActive\s*:\s*BOOL/);
  assert.match(readPlc('PLC_PRG.RunGeometryControl.st'), /xIoManual := xIoManualActive/);
  const locals = fields(readPlc('PLC_PRG.st'));
  for (const method of ['PLC_PRG.RunGeometryControl.st', 'PLC_PRG.PublishGeometryControl.st']) {
    for (const [, name] of strip(readPlc(method)).matchAll(/(?<![.\w])((?:x|st|ui|udi|e)Geometry\w*|GEOMETRY(?:_SIM)?)\b/g)) assert.ok(Object.hasOwn(locals, name), `${method}: undeclared local ${name}`);
  }
});

test('appended point and alarm enums preserve old numeric IDs and both GK alarm sources reach the manager', () => {
  const values = path => strip(readPlc(path)).split('(')[1].split(')')[0].split(',').map(s => s.trim());
  const points = values('ST/ST_POINT/E_POINT_NAME.st');
  assert.equal(points[17], 'HOME_SAFETY'); assert.equal(points[22], 'MAGAZINE_1_DETAIL'); assert.equal(points[23], 'MAGAZINE_2_DETAIL');
  assert.deepEqual(points.slice(24), ['GEOMETRY_1_PLACE', 'GEOMETRY_1_SAFE', 'GEOMETRY_1_CHANGE', 'GEOMETRY_2_PLACE', 'GEOMETRY_2_SAFE', 'GEOMETRY_2_CHANGE']);
  assert.deepEqual(values('ST/ST_ALARM/E_ALARM_SOURCE.st').slice(16), ['CELL_SAFETY', 'GEOMETRY_1', 'GEOMETRY_2']);
  assert.match(readPlc('FB/FB_ALARM_MANAGER.st'), /Sources : ARRAY \[1\.\.19\]/);
  assert.match(readPlc('FB/FB_ALARM_HORN.st'), /FOR uiSource := 1 TO 19 DO/);
  const alarms = readPlc('PLC_PRG.RunAlarms.st');
  assert.match(alarms, /astAlarmSource\[18\]\.eSource := E_ALARM_SOURCE\.GEOMETRY_1/);
  assert.match(alarms, /astAlarmSource\[19\]\.eSource := E_ALARM_SOURCE\.GEOMETRY_2/);
  assert.match(alarms, /astAlarmSource\[17 \+ uiGeometry\]\.dwAlarmActive := GVL_GEOMETRY_CONTROL\.astActiveMemory\[uiGeometry\]\.dwAlarm/);
  assert.match(alarms, /IF GVL_GEOMETRY_CONTROL\.xSupported THEN\s*astAlarmSource\[17 \+ uiGeometry\]\.dwAlarmActive/);
  assert.match(readPlc('PLC_PRG.RunRobot.st'), /OR \(GVL_GEOMETRY_CONTROL\.xSupported AND \(GVL_GEOMETRY_CONTROL\.astStatus\[1\]\.xRobotStopRequired/);
});

test('scan order reserves before robot and publishes after handoff; all edited ST blocks are balanced', () => {
  const main = readPlc('PLC_PRG.st').split('// --- BEGIN IMPLEMENTATION ---')[1];
  assert.ok(main.indexOf('RunGeometryControl();') < main.indexOf('RunCellControl();'));
  assert.ok(main.indexOf('RunCellControl();') < main.indexOf('RunRobot();'));
  assert.ok(main.indexOf('PublishGeometryControl();') > main.indexOf('RunRobot();'));
  for (const file of ['FB/FB_GEOMETRY_CONTROL.st', 'FB/FB_GEOMETRY_CONTROL_SIMULATION.st', 'FB/F_GEOMETRY_EVENT.st', 'FB/F_GEOMETRY_FIRST_CALL.st', 'FB/F_GEOMETRY_SELECT_STATION.st', 'FB/F_GEOMETRY_TAKE_DETAIL.st', 'FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st', 'FB/FB_CELL_MANAGER/FB_CELL_MANAGER.UpdateGeometryWait.st', 'FB/FB_CELL_MANAGER/FB_CELL_MANAGER.IsMachineEligible.st', 'FB/FB_CELL_MANAGER/FB_CELL_MANAGER.PlanGeometry.st', 'FB/FB_CELL_MANAGER/FB_CELL_MANAGER.RunGeometryRoute.st', 'PLC_PRG.RunGeometryControl.st', 'PLC_PRG.PublishGeometryControl.st', 'PLC_PRG.RunRobot.st', 'PLC_PRG.RunAlarms.st']) {
    const stack = [];
    for (const [, token] of strip(readPlc(file)).matchAll(/\b(IF|FOR|CASE|WHILE|REPEAT|END_IF|END_FOR|END_CASE|END_WHILE|END_REPEAT)\b/g)) {
      if (token.startsWith('END_')) assert.equal(stack.pop(), token.slice(4), `${file}: ${token}`);
      else stack.push(token);
    }
    assert.deepEqual(stack, [], file);
  }
});

test('changing GK timings uses one PLC permission and cannot shorten an active reset pulse', () => {
  const source = readPlc('PLC_PRG.RunGeometryControl.st');
  const permission = source.match(/GVL_GEOMETRY_CONTROL\.xSettingsAllowed := ([\s\S]*?);/)[1];
  for (const n of [1, 2]) {
    assert.ok(permission.includes(`NOT GVL_GEOMETRY_CONTROL.astStatus[${n}].xDriveRunning`));
    assert.ok(permission.includes(`NOT GVL_GEOMETRY_CONTROL.astStatus[${n}].xResetBusy`));
    assert.ok(permission.includes(`NOT GVL_GEOMETRY_CONTROL.astSignals[${n}].xRobotInteraction`));
  }
  assert.match(source, /uiAction = UINT#16\) AND GVL_GEOMETRY_CONTROL\.xSettingsAllowed THEN/);
  assert.match(readPlc('PLC_PRG.PublishGeometryControl.st'), /GVL_HMI\.xGeometrySettingsAllowed := GVL_GEOMETRY_CONTROL\.xSettingsAllowed/);
});

test('manual target permissions check machine hatches only; error text agrees with both registries', () => {
  assert.match(readPlc('FB/FB_ALARM_MANAGER.st'), /eEffect := E_ALARM_EFFECT\.WARNING/);
  const source = readPlc('PLC_PRG.RunRobot.st');
  for (const selector of ['stRobotHmiCommand.eSetPoint', 'eHmiRobotStatusPoint']) {
    const first = source.indexOf(`CASE ${selector} OF`);
    const targets = source.slice(first, source.indexOf('END_CASE;', first));
    assert.doesNotMatch(targets, /GVL_GEOMETRY_CONTROL|GVL_TWO_PALLET|GEOMETRY\[/);
    for (const machine of [1, 2, 3]) {
      assert.ok(targets.includes(`GVL_MACHINE.Status[${machine}].stIo.xDoorOpen`));
      assert.ok(targets.includes(`NOT GVL_MACHINE.Status[${machine}].stIo.xDoorClosed`));
    }
  }
  const catalog = JSON.parse(readFileSync(new URL('../alarm-catalog.json', import.meta.url), 'utf8'));
  const errors = readFileSync(new URL('../../DOKS/15-equipment-error-reset-table.md', import.meta.url), 'utf8');
  const warnings = readFileSync(new URL('../../DOKS/16-cell-warnings.md', import.meta.url), 'utf8');
  for (const n of [1, 2]) {
    for (const message of Object.values(catalog.alarms[`geometry-${n}`])) assert.ok(errors.includes(message), message);
    for (const message of Object.values(catalog.warnings[`geometry-${n}`])) assert.ok(errors.includes(message) && warnings.includes(message), message);
  }
  for (const code of ['50', '51']) assert.ok(warnings.includes(catalog.warnings.cell[code]));
});
