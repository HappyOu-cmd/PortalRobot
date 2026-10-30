// These source checks do not compile ST or connect to a PLC.
// Only FB_DI_FILTER's supported statements are interpreted, using a deterministic TON.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { settingPaths } from '../gateway/command-contract.mjs';

const root = new URL('../../Portal_robot/Device/application/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const map = JSON.parse(readFileSync(new URL('../../DOKS/22-physical-io-map.json', import.meta.url), 'utf8'));
const inputs = read('PLC_PRG.ReadPhysicalInputs.st');
const outputs = read('PLC_PRG.WritePhysicalOutputs.st');
const gripper = read('FB/FB_GRIPPER_SIMULATION.st');
const stripComments = (source) => source.replace(/\(\*[\s\S]*?\*\)/g, '').replace(/\/\/[^\r\n]*/g, '');
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function expression(source, replace) {
  return source.replace(/T#0MS/g, '0').replace(/\b(?:UINT|UDINT)#(\d+)\b/g, '$1')
    .replace(/\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\[\d+\])*/g, (name) => {
      const keywords = { AND: '&&', OR: '||', NOT: '!', TRUE: 'true', FALSE: 'false' };
      return Object.hasOwn(keywords, name) ? keywords[name] : replace(name);
    }).replace(/<>/g, '!==').replace(/(?<![<>!=])=(?!=)/g, '===');
}
function booleanExpression(source, values) {
  const code = expression(source, (name) => {
    assert.ok(Object.hasOwn(values, name), `Unknown ST value ${name}`);
    return JSON.stringify(values[name]);
  });
  return Function(`"use strict"; return Boolean(${code});`)();
}
function assignment(source, name) {
  const found = stripComments(source).match(new RegExp(`${escape(name)}\\s*:=\\s*([^;]+);`));
  assert.ok(found, `Missing assignment ${name}`);
  return found[1];
}

function filterRuntime() {
  const state = { xEnable: true, xInput: false, tRise: 20, tFall: 30, xFiltered: false };
  for (const name of ['tonRise', 'tonFall']) {
    state[name] = { Q: false, since: null, update(input, time, now) {
      if (!input) { this.since = null; this.Q = false; return; }
      if (this.since === null) this.since = now;
      this.Q = now - this.since >= time;
    } };
  }
  const allowed = new Set(['xEnable', 'xInput', 'tRise', 'tFall', 'xFiltered', 'tonRise.Q', 'tonFall.Q']);
  const expr = (source) => expression(source, (name) => {
    assert.ok(allowed.has(name), `Unsupported filter symbol ${name}`);
    return `s.${name}`;
  });
  const source = stripComments(read('FB/FB_DI_FILTER.st').split('// --- BEGIN IMPLEMENTATION ---')[1]);
  const statements = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const generated = [];
  for (const line of statements) {
    let found;
    if ((found = line.match(/^IF (.+) THEN$/))) generated.push(`if (${expr(found[1])}) {`);
    else if ((found = line.match(/^ELSIF (.+) THEN$/))) generated.push(`} else if (${expr(found[1])}) {`);
    else if (line === 'END_IF;') generated.push('}');
    else if ((found = line.match(/^(tonRise|tonFall)\(IN := (.+), PT := (.+)\);$/))) {
      generated.push(`s.${found[1]}.update(${expr(found[2])}, ${expr(found[3])}, now);`);
    } else if ((found = line.match(/^(\w+) := (.+);$/))) generated.push(`${expr(found[1])} = ${expr(found[2])};`);
    else assert.fail(`Unsupported ST filter statement: ${line}`);
  }
  const execute = Function('s', 'now', `"use strict"; ${generated.join('\n')}`);
  return { state, scan(now, changes = {}) { Object.assign(state, changes); execute(state, now); return state.xFiltered; } };
}

test('DI rise rejects short pulses and starts a fresh continuous interval', () => {
  const fb = filterRuntime();
  assert.equal(fb.scan(0, { xInput: true }), false);
  assert.equal(fb.scan(12), false);
  assert.equal(fb.scan(15, { xInput: false }), false);
  assert.equal(fb.scan(16, { xInput: true }), false);
  assert.equal(fb.scan(35), false);
  assert.equal(fb.scan(36), true);
});
test('DI fall rejects a rebound and waits the complete falling interval', () => {
  const fb = filterRuntime();
  fb.scan(0, { xInput: true });
  assert.equal(fb.scan(20), true);
  assert.equal(fb.scan(21, { xInput: false }), true);
  assert.equal(fb.scan(45, { xInput: true }), true);
  assert.equal(fb.scan(50, { xInput: false }), true);
  assert.equal(fb.scan(79), true);
  assert.equal(fb.scan(80), false);
});
test('zero delay changes in the current scan; disable clears both TONs', () => {
  const fb = filterRuntime();
  assert.equal(fb.scan(0, { xInput: true, tRise: 0, tFall: 0 }), true);
  assert.equal(fb.scan(1, { xInput: false }), false);
  fb.scan(2, { xInput: true, tRise: 20, tFall: 30 });
  assert.equal(fb.scan(21), false);
  assert.equal(fb.scan(22, { xEnable: false }), false);
  assert.equal(fb.state.tonRise.since, null);
  assert.equal(fb.state.tonFall.since, null);
  assert.equal(fb.scan(23, { xEnable: true }), false);
  assert.equal(fb.scan(42), false);
  assert.equal(fb.scan(43), true);
  fb.scan(44, { xInput: false });
  assert.equal(fb.scan(45, { xEnable: false }), false);
  assert.equal(fb.state.tonFall.since, null);
});
test('confirmed five DI16 modules and two DQ16D fit 86 DI including MPG and 47 DO', () => {
  const di = map.channels.filter((c) => c.direction === 'DI');
  const dout = map.channels.filter((c) => c.direction === 'DO');
  assert.equal(di.length, 84);
  assert.equal(dout.length, 47);
  assert.equal(map.installedDiModules, 5);
  assert.equal(map.diModuleType, 'GL200-DI16');
  assert.equal(map.diModuleChannels, 16);
  assert.equal(map.cpuDi + map.installedDiModules * map.diModuleChannels - di.length - map.mpgReservedDi, 10);
  assert.equal(di.length + map.mpgReservedDi, 86);
  assert.equal(map.cpuDo + map.installedDoModules * map.doModuleChannels - dout.length, 1);
  assert.ok(map.channels.every((c) => c.installed));
  assert.deepEqual(map.retiredDoIndices, [37, 38, 39]);
  assert.equal(map.diagnosticsDoSlotCount, 50);
  assert.deepEqual(dout.map((c) => c.index).sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i + 1).filter((i) => !map.retiredDoIndices.includes(i)));
  assert.equal(new Set(map.channels.map((c) => c.address)).size, map.channels.length);
  assert.equal(new Set(map.channels.map((c) => c.variable)).size, map.channels.length);
  const globals = stripComments(read('GVL/GVL_PHYSICAL_IO.gvl.st'));
  assert.doesNotMatch(globals, /\bAT\s+%[IQ]/);
  for (const c of map.channels) {
    assert.match(globals, new RegExp(`\\b${escape(c.variable)}\\s*:\\s*BOOL`));
    assert.equal([...globals.matchAll(new RegExp(`\\b${escape(c.variable)}\\s*:\\s*BOOL`, 'g'))].length, 1, 'unique declaration');
    assert.equal(c.address, `%${c.direction === 'DI' ? 'I' : 'Q'}X${256 + Math.floor(c.channel / 8)}.${c.channel % 8}`);
    if (c.direction === 'DI') {
      assert.ok(c.channel >= 2, 'MPG reserved fast channels must stay free');
      if (c.raw) {
        assert.ok(c.index > 80, 'raw driver diagnostics remain outside technological filters');
        assert.match(inputs, new RegExp(`axPhysicalRaw\\[${c.index}\\] := GVL_PHYSICAL_IO\\.${escape(c.variable)};`));
        assert.ok(!new RegExp(`\\b${escape(c.variable)}\\b`).test(inputs.slice(inputs.indexOf('IF xPhysicalNormal THEN'))), 'raw drive feedback bypasses configurable DI filtering');
        assert.match(read('PLC_PRG.RunGeometryControl.st'), /uiGeometryDi := UINT#81/);
        continue;
      }
      assert.match(inputs, new RegExp(`axPhysicalRaw\\[${c.index}\\] := GVL_PHYSICAL_IO\\.${escape(c.variable)};`));
      assert.match(inputs, new RegExp(`${escape(c.logical)} := (?:NOT )?axPhysicalFiltered\\[${c.index}\\]`));
    } else assert.match(outputs, new RegExp(`GVL_PHYSICAL_IO\\.${escape(c.variable)} :=`));
  }
});
test('GK1/GK2 use distinct raw signals; channel labels exactly match the byte/bit addresses', () => {
  const byName=Object.fromEntries(map.channels.map(c=>[c.variable,c]));
  for(const [i,name] of ['xDiGk1DriveAlarm','xDiGk1DriveRunning','xDiGk1PartAtEnd','xDiGk2DriveAlarm','xDiGk2DriveRunning','xDiGk2PartAtEnd'].entries()) {
    const c=byName[name];assert.ok(c);
    assert.equal(c.address,`%IX${264+Math.floor((i+6)/8)}.${(i+6)%8}`);
    assert.equal(c.terminal,`GL200-DI16 #4: CH${i+6}`);
  }
  for(const c of map.channels){
    const ch=c.channel;
    const expected=ch<16?`MC522: ${c.direction==='DI'?'DI':'DO'}_CH${ch}`:`GL200-${c.direction==='DI'?'DI16':'DQ16D'} #${1+Math.floor((ch-16)/16)}: CH${(ch-16)%16}`;
    assert.equal(c.terminal,expected,c.variable);
  }
  for(const index of [1,2])for(const action of ['Run','Reset']){
    assert.equal(assignment(outputs,`GVL_PHYSICAL_IO.xDoGk${index}Drive${action}`).trim(),`xPhysicalOutputEnable AND GEOMETRY[${index}].x${action}Output`);
  }
  assert.doesNotMatch(read('GVL/GVL_PHYSICAL_IO.gvl.st'),/\bxD[io]GkDrive/);
});
test('revised horn, magazine and GK outputs have the confirmed module channels without collision', () => {
  const byName = Object.fromEntries(map.channels.map((c) => [c.variable, c]));
  for (const [name, address, terminal] of [
    ['xDoCellAlarmHorn', '%QX259.2', 'GL200-DQ16D #1: CH10'],
    ['xDoDoor1ButtonLamp', '%QX259.3', 'GL200-DQ16D #1: CH11'],
    ['xDoMagazine1LockIn', '%QX259.7', 'GL200-DQ16D #1: CH15'],
    ['xDoMagazine1LockOut', '%QX260.0', 'GL200-DQ16D #2: CH0'],
    ['xDoGk1DriveRun', '%QX260.5', 'GL200-DQ16D #2: CH5'],
    ['xDoGk2DriveReset', '%QX261.0', 'GL200-DQ16D #2: CH8'],
    ['xDoMagazine2LockOut', '%QX261.2', 'GL200-DQ16D #2: CH10'],
    ['xDoMagazine2LiftDown', '%QX261.6', 'GL200-DQ16D #2: CH14'],
  ]) {
    assert.equal(byName[name].address, address);
    assert.equal(byName[name].terminal, terminal);
  }
  assert.ok(!map.channels.some((c) => c.direction === 'DO' && c.address === '%QX261.7'));
  const globals = read('GVL/GVL_PHYSICAL_IO.gvl.st');
  for (const c of map.channels) assert.ok(globals.includes(`${c.variable} : BOOL; // ${c.address}; ${c.terminal};`), c.variable);
});
test('both GK end sensors have separate filtered levels; NORMAL disable clears them', () => {
  const globals=read('GVL/GVL_PHYSICAL_IO.gvl.st');
  assert.match(globals,/axGkPartAtEnd : ARRAY \[1\.\.2\] OF BOOL/);
  assert.match(inputs,/FOR uiPhysicalInput := 1 TO 80 DO/);
  for(const [i,n] of [[79,1],[80,2]]){
    const c=map.channels.find(c=>c.variable===`xDiGk${n}PartAtEnd`);
    assert.equal(c.index,i);assert.equal(c.immediate,'fall');
    assert.equal(assignment(inputs,`GVL_PHYSICAL_IO.axGkPartAtEnd[${n}]`).trim(),`axPhysicalFiltered[${i}]`);
    const h=filterRuntime();
    assert.equal(h.scan(0,{xInput:true,tRise:20,tFall:0}),false);
    assert.equal(h.scan(20),true);
    assert.equal(h.scan(21,{xInput:false}),false);
    h.scan(22,{xInput:true});assert.equal(h.scan(42),true);
    assert.equal(h.scan(43,{xEnable:false}),false);
  }
  assert.ok(inputs.indexOf('GVL_PHYSICAL_IO.axGkPartAtEnd[1] :=')<inputs.indexOf('IF xPhysicalNormal THEN'));
  for(const a of [...read('PLC_PRG.st').matchAll(/(axPhysicalRaw|axPhysicalFiltered|axPhysicalButtonArmed|afbPhysicalInputFilter) : ARRAY \[1\.\.(\d+)\]/g)])assert.equal(Number(a[2]),a[1]==='axPhysicalRaw'?84:80);
});
test('magazine Home waits MC_Home.Done from the drive, not a cell DI sensor', () => {
  assert.equal(map.driveWiredInputs.length, 6);
  assert.equal(map.channels.some((c)=>/xDiMagazine\d(?:Limit|Home)/.test(c.variable)), false);
  assert.doesNotMatch(inputs, /xDiMagazine\d(?:Limit|Home)/);
  const axis = read('PLC_PRG.RunTwoPalletAxis.st');
  assert.match(axis, /\.Command\.xHome := GVL_TWO_PALLET\.astOutput\[uiTwin\]\.xHome/);
  assert.match(axis, /\.xHomed := GVL_TWO_PALLET\.astAxis\[uiTwin\]\.Status\.xHomed/);
  assert.match(axis, /\.xMotionDone := GVL_TWO_PALLET\.astAxis\[uiTwin\]\.Status\.xDone/);
  assert.match(read('FB/FB_AXIS.st'), /ELSIF fbHome\.Done THEN\s*xHomeExecute := FALSE;\s*AxisData\.Status\.xHomed := TRUE;\s*AxisData\.Status\.xDone := TRUE/);
  const magazine = read('FB/FB_TWO_PALLET.st');
  assert.match(magazine, /E_TWO_PALLET_STATE\.MANUAL_HOME:\s*Output\.xHome := xStateEntry;\s*IF xSeenDone\s*AND Input\.xHomed\s*AND Input\.xStandstill\s*AND NOT xStateEntry/);
});
test('dangerous edges bypass delay; normally-closed emergency contacts are inverted', () => {
  const source = stripComments(inputs);
  const arms = [...source.matchAll(/([\d, ]+):\s*tPhysical(Rise|Fall) := T#0MS;/g)];
  assert.equal(arms.length, 2);
  const immediate = Object.fromEntries(arms.map((m) => [m[2].toLowerCase(), new Set(m[1].split(',').map(Number))]));
  for (const c of map.channels.filter((c) => c.direction === 'DI')) {
    for (const edge of ['rise', 'fall']) assert.equal(immediate[edge].has(c.index), c.immediate === edge, `${c.variable} ${edge}`);
    if (c.inverted) assert.match(source, new RegExp(`${escape(c.logical)} := NOT axPhysicalFiltered\\[${c.index}\\];`));
  }
  for (const name of ['EmergencyStopStation1Ok', 'EmergencyStopCabinet1Ok', 'EmergencyStopMpgOk', 'SafetyRelayOkInput', 'PressureRelayOkInput']) {
    const c = map.channels.find((c) => c.variable === `xDi${name}`);
    assert.ok(c);
    assert.equal(c.immediate, 'fall');
  }
  assert.equal(map.channels.find((c) => c.variable === 'xDiCellStopButtonInput').immediate, 'rise');
  assert.match(source, /axPhysicalButtonArmed\[uiPhysicalInput\] := FALSE;\s*ELSIF NOT axPhysicalRaw\[uiPhysicalInput\] THEN\s*axPhysicalButtonArmed\[uiPhysicalInput\] := TRUE/);
});
test('local machine Reset stays internal; removed cell alarm DO do not exist and GK outputs belong to their FB', () => {
  assert.doesNotMatch(stripComments(outputs), /\.xReset\b/);
  assert.equal(map.channels.filter((c) => c.reserved || /CellAlarmReserve/.test(c.variable)).length, 0);
  for (const file of ['GVL/GVL_PHYSICAL_IO.gvl.st', 'PLC_PRG.WritePhysicalOutputs.st', 'PLC_PRG.ApplyIoOutputOverrides.st', 'PLC_PRG.RecordIoDiagnostics.st']) assert.doesNotMatch(read(file), /CellAlarmReserve/);
  for (const c of map.channels.filter(c=>c.direction==='DO' && /Gk/.test(c.variable))) {
    assert.match(assignment(outputs, `GVL_PHYSICAL_IO.${c.variable}`), /xPhysicalOutputEnable AND GEOMETRY\[[12]\]\.x(?:Run|Reset)Output/);
  }
  for (const c of map.channels.filter((c) => c.direction === 'DI' && /Machine\dAlarm/.test(c.variable))) {
    assert.match(c.logical, /astPhysicalInput\[\d\]\.xAlarm$/);
  }
});
test('program base outputs require NORMAL and verified inputs; Modbus owns base gripper commands', () => {
  const readEnable = assignment(inputs, 'GVL_PHYSICAL_IO.xNormalActive');
  for (const normal of [false, true]) for (const verified of [false, true]) {
    assert.equal(booleanExpression(readEnable, { xPhysicalNormal: normal, 'GVL_PHYSICAL_IO.xMappingVerified': verified }), normal && verified);
  }
  const enable = assignment(outputs, 'xPhysicalOutputEnable');
  for (const active of [false, true]) for (const environment of [0, 1, 2]) {
    assert.equal(booleanExpression(enable, { 'GVL_PHYSICAL_IO.xNormalActive': active, 'GVL_CELL_SETTINGS.eTestEnvironment': environment, 'E_CELL_TEST_ENVIRONMENT.NORMAL': 0 }), active && environment === 0);
  }
  assert.match(outputs, /IF NOT xPhysicalOutputEnable OR GVL_HMI\.xModbusMode THEN\s*axIoGripperBase\[1\] := FALSE;\s*axIoGripperBase\[2\] := FALSE;\s*axIoGripperBase\[3\] := FALSE/);
  for (const [name, index] of [['xDoGripper1Open', 1], ['xDoGripper2Open', 2], ['xDoRotateToDetail', 3]]) assert.equal(assignment(outputs, `GVL_PHYSICAL_IO.${name}`).trim(), `axIoGripperBase[${index}]`);
  assert.match(read('FB/FB_ROBOT.st'), /xUsePhysicalFeedback := xUsePhysicalGripperFeedback AND NOT xMode/);
  const machines = read('PLC_PRG.RunMachines.st');
  assert.match(machines, /IF GVL_CELL_SETTINGS\.eTestEnvironment <> E_CELL_TEST_ENVIRONMENT\.NORMAL THEN[\s\S]*?MACHINE_1_SIM\([\s\S]*?MACHINE_3_SIM\([\s\S]*?END_IF;\s*IF GVL_CELL_SETTINGS\.eTestEnvironment = E_CELL_TEST_ENVIRONMENT\.NORMAL THEN\s*astMachineStatusRaw := GVL_MACHINE\.astPhysicalInput/);
  const main = read('PLC_PRG.st').split('// --- BEGIN IMPLEMENTATION ---')[1];
  assert.ok(main.indexOf('ReadPhysicalInputs();') < main.indexOf('RunSafety();'));
  assert.ok(main.indexOf('WritePhysicalOutputs();') > main.indexOf('RunSignalTower();'));
  assert.ok(main.indexOf('WritePhysicalOutputs();') < main.indexOf('PublishHmi();'));
});
test('physical gripper requires one correct sensor, and timeout cannot synthesize position', () => {
  const confirmations = [...gripper.matchAll(/xActionConfirmed := (Status\.\w+ AND NOT Status\.\w+);/g)];
  assert.equal(confirmations.length, 6);
  for (const [, expr] of confirmations) {
    const [target, opposite] = expr.match(/Status\.\w+/g);
    for (const a of [false, true]) for (const b of [false, true]) assert.equal(booleanExpression(expr, { [target]: a, [opposite]: b }), a && !b);
  }
  const start = gripper.indexOf('ELSIF xUsePhysicalFeedback THEN');
  const end = gripper.indexOf('\n        ELSIF tonAction.Q THEN', start);
  assert.ok(start >= 0 && end > start, 'Physical and simulated branches must be distinct');
  const physical = gripper.slice(start, end);
  assert.match(physical, /IF xActionConfirmed THEN\s*eState := E_GRIPPER_STATE\.DONE;\s*ELSIF tonAction\.Q THEN/);
  assert.match(physical, /ERR_GRIPPER_1[\s\S]*ERR_GRIPPER_2[\s\S]*ERR_GRIP_ROTATE[\s\S]*E_GRIPPER_STATE\.ERROR/);
  assert.doesNotMatch(physical, /Status\.x(?:Gripper|Rotated)\w+ := (?:TRUE|FALSE)/);
  assert.match(gripper, /IF xUsePhysicalFeedback THEN\s*tActionTime := tPhysicalActionTimeout/);
});
test('filter and horn setting IDs append after 36 stable IDs; TIME and permissions stay in PLC', () => {
  assert.equal(settingPaths.length, 39);
  assert.equal(settingPaths[35], 'lrRobotHaltJerk');
  assert.deepEqual(settingPaths.slice(36), ['tInputFilterRise', 'tInputFilterFall', 'tAlarmHornDuration']);
  const hmiRead = read('PLC_PRG.ReadHmiInputs.st');
  for (const [i, name] of [[37, 'tInputFilterRise'], [38, 'tInputFilterFall']]) {
    assert.match(hmiRead, new RegExp(`UINT#${i}:\\s*IF \\(GVL_HMI\\.lrCellSettingRequest >= 0\\.0\\) AND \\(GVL_HMI\\.lrCellSettingRequest <= 5000\\.0\\) THEN\\s*GVL_CELL_SETTINGS\\.${name} := UDINT_TO_TIME\\(LREAL_TO_UDINT\\(GVL_HMI\\.lrCellSettingRequest\\)\\)`));
    assert.match(read('PLC_PRG.PublishHmi.st'), new RegExp(`GVL_HMI\\.${name} := GVL_CELL_SETTINGS\\.${name}`));
    assert.match(read('GVL/GVL_HMI.gvl.st'), new RegExp(`${name} : TIME`));
  }
  assert.match(hmiRead, /AND GVL_CELL_CONTROL\.xManual/);
  assert.match(hmiRead, /AND NOT GVL_TWO_PALLET\.astInput\[1\]\.xPowered AND NOT GVL_TWO_PALLET\.astInput\[2\]\.xPowered/);
  assert.match(hmiRead, /IsHmiCommandFresh\(udiIssuedAtMs := GVL_HMI\.udiCellSettingIssuedAtMs\)/);
  assert.match(hmiRead, /uiCellSettingIndex = UINT#37[\s\S]*?uiCellSettingIndex = UINT#38[\s\S]*?NOT GVL_CELL_SETTINGS\.xIoFilterSettingsChangeAllowed/);
  assert.match(hmiRead, /UINT#39:\s*IF \(GVL_HMI\.lrCellSettingRequest >= 0\.0\) AND \(GVL_HMI\.lrCellSettingRequest <= 60000\.0\) THEN\s*GVL_CELL_SETTINGS\.tAlarmHornDuration :=/);
  assert.match(hmiRead, /uiCellSettingIndex = UINT#39[\s\S]*?NOT GVL_CELL_SETTINGS\.xIoFilterSettingsChangeAllowed/);
  assert.match(read('PLC_PRG.PublishHmi.st'), /GVL_HMI\.tAlarmHornDuration := GVL_CELL_SETTINGS\.tAlarmHornDuration/);
});
function hornRuntime() {
  const count = Number(read('FB/FB_ALARM_HORN.st').match(/astSource : ARRAY \[1\.\.(\d+)\]/)[1]);
  const s = { astSource: Array.from({length: count + 1}, () => ({dwAlarmActive: 0, stWarning: {uiCode: 0}})), adwPrevious: Array(count + 1).fill(0), uiSource: 0, xNewAlarm: false, xActive: false, xSound: false, tDuration: 2000, tLatchedDuration: 0 };
  s.tonSound = { Q: false, since: null, update(input, time, now) {
    if (!input) { this.since = null; this.Q = false; return; }
    if (this.since === null) this.since = now;
    this.Q = now - this.since >= time;
  } };
  const symbol = (name) => {
    assert.ok(Object.hasOwn(s, name.split(/[.[]/)[0]), `Unsupported horn symbol ${name}`);
    return `s.${name.replace('[uiSource]', '[s.uiSource]')}`;
  };
  const expr = (value) => value.replace(/T#0MS|DWORD#0/g, '0')
    .replace(/\b[A-Za-z_]\w*(?:\[(?:\d+|uiSource)\]|\.[A-Za-z_]\w*)*/g, name => ({TRUE:'true', FALSE:'false', NOT:'!'}[name] ?? symbol(name)))
    .replace(/<>/g, '!==');
  const generated = [];
  for (const line of stripComments(read('FB/FB_ALARM_HORN.st').split('// --- BEGIN IMPLEMENTATION ---')[1]).split(/\r?\n/).map(l=>l.trim()).filter(Boolean)) {
    let m;
    if ((m = line.match(/^FOR uiSource := (\d+) TO (\d+) DO$/))) generated.push(`for(s.uiSource=${m[1]};s.uiSource<=${m[2]};s.uiSource++){`);
    else if (line === 'END_FOR;' || line === 'END_IF;') generated.push('}');
    else if ((m = line.match(/^IF \((.+) AND NOT (.+)\) <> DWORD#0 THEN$/))) generated.push(`if((${expr(m[1])} & ~${expr(m[2])}) !== 0){`);
    else if ((m = line.match(/^IF (.+) THEN$/))) generated.push(`if(${expr(m[1])}){`);
    else if ((m = line.match(/^ELSIF (.+) THEN$/))) generated.push(`}else if(${expr(m[1])}){`);
    else if ((m = line.match(/^tonSound\(IN := (.+), PT := (.+)\);$/))) generated.push(`s.tonSound.update(${expr(m[1])},${expr(m[2])},now);`);
    else if ((m = line.match(/^(.+) := (.+);$/))) generated.push(`${expr(m[1])}=${expr(m[2])};`);
    else assert.fail(`Unsupported horn statement ${line}`);
  }
  const execute = Function('s', 'now', `"use strict";${generated.join('\n')}`);
  return { state:s, scan(now, masks = {}, duration = s.tDuration) {
    s.tDuration=duration;
    for (const [index, mask] of Object.entries(masks)) s.astSource[index].dwAlarmActive=mask;
    execute(s,now); return s.xSound;
  } };
}
test('horn sounds once per new alarm bit, including a second fault while an alarm is active', () => {
  const h=hornRuntime();
  assert.equal(h.scan(0,{1:1}),true);
  assert.equal(h.scan(1999),true);
  assert.equal(h.scan(2000),false);
  assert.equal(h.scan(3000),false);
  assert.equal(h.scan(4000,{1:3}),true);
  assert.equal(h.scan(4500,{2:1}),true);
  assert.equal(h.scan(6499),true);
  assert.equal(h.scan(6500),false);
  assert.equal(h.scan(7000,{1:0,2:0}),false);
  assert.equal(h.scan(7100,{1:1}),true);
  assert.equal(h.scan(9100),false);
  assert.equal(h.scan(9200,{19:1}),true);
  assert.equal(h.scan(11200),false);
  assert.equal(h.scan(11300,{22:1}),true);
});
test('horn ignores warnings; zero mutes immediately and duration is latched for a pulse', () => {
  const h=hornRuntime();
  h.state.astSource[3].stWarning.uiCode=10;
  h.state.astSource[20].stWarning.uiCode=1;
  assert.equal(h.scan(0),false);
  assert.equal(h.scan(100,{3:1},500),true);
  assert.equal(h.scan(599,{},60000),true);
  assert.equal(h.scan(600),false);
  assert.equal(h.scan(700,{3:3},60000),true);
  assert.equal(h.scan(701,{},0),false);
  assert.equal(h.scan(702,{},2000),false);
  assert.equal(h.scan(703,{3:7}),true);
  assert.equal(assignment(outputs,'GVL_PHYSICAL_IO.xDoCellAlarmHorn').trim(), 'xPhysicalOutputEnable AND GVL_CELL_SAFETY_IO.xAlarmHornOutput');
});
test('operator doors are feedback only in NORMAL; PLC rejects commands and SIM retains its drive', () => {
  const machine=read('FB/FB_MACHINE.st');
  for (const action of ['Open','Close']) {
    const name=`xManualSafetyDoor${action}Allowed`;
    const expr=assignment(machine,name);
    const open=action==='Open';
    const values={xManualControlAllowed:true,xSafetyDoorControlEnabled:false,'stMachineStatus.xSafetyDoorOpen':!open,'stMachineStatus.xSafetyDoorClosed':open};
    assert.equal(booleanExpression(expr,values),false);
    assert.equal(booleanExpression(expr,{...values,xSafetyDoorControlEnabled:true}),true);
  }
  assert.equal([...read('PLC_PRG.RunMachines.st').matchAll(/xSafetyDoorControlEnabled := GVL_CELL_SETTINGS\.eTestEnvironment <> E_CELL_TEST_ENVIRONMENT\.NORMAL/g)].length,3);
  assert.match(machine,/rtHmiOpenSafetyDoor\.Q AND NOT xManualSafetyDoorOpenAllowed/);
  assert.match(machine,/Diag\.stWarning\.uiCode := WRN_MANUAL_CONTROL_REJECTED/);
  assert.doesNotMatch(outputs,/xDoMachine\d(?:Open|Close)SafetyDoor/);
  assert.equal(map.simulationOnlyOutputs.length,6);
  const menu=readFileSync(new URL('../src/components/machine/MachineManualControl.tsx',import.meta.url),'utf8');
  assert.match(menu,/machine\.manualDoorControlEnabled\) && <div className="machine-mechanism-actions">/);
});
test('SC500 bench no longer requires or reads a physical key', () => {
  assert.doesNotMatch(inputs,/BenchKey/);
  assert.doesNotMatch(read('GVL/GVL_PHYSICAL_IO.gvl.st'),/BenchKey/);
  const source=read('PLC_PRG.RunTestControl.st');
  assert.doesNotMatch(source,/GVL_TEST_IO\./);
  assert.match(source,/GVL_HMI\.xSc500BenchKeyActive := FALSE/);
  assert.match(source,/GVL_HMI\.xSc500BenchKeyLost := FALSE/);
  assert.match(read('PLC_PRG.RunRobot.st'),/xExternalCommandInhibit := GVL_HMI\.xIoEmergencyStopActive/);
  assert.doesNotMatch(readFileSync(new URL('../src/components/tests/TestWorkbench.tsx',import.meta.url),'utf8'),/status\.plc\?\.benchKey/);
});
test('new physical ST pages have balanced control blocks', () => {
  for (const file of ['PLC_PRG.ReadIoEmergencyStop.st', 'PLC_PRG.ResetIoEmergencyStop.st', 'PLC_PRG.ApplyIoOutputOverrides.st', 'FB/FB_DI_FILTER.st', 'FB/FB_ALARM_HORN.st', 'PLC_PRG.RunSignalTower.st', 'PLC_PRG.RunTestControl.st', 'PLC_PRG.ReadPhysicalInputs.st', 'PLC_PRG.WritePhysicalOutputs.st', 'PLC_PRG.ReadIoOverrides.st', 'PLC_PRG.AppendIoEvent.st', 'PLC_PRG.RecordIoDiagnostics.st', 'FB/FB_GRIPPER_SIMULATION.st', 'PLC_PRG.ReadHmiInputs.st', 'PLC_PRG.RunMachines.st', 'FB/FB_MACHINE.st']) {
    const source = stripComments(read(file)).replace(/'[^']*'/g, '');
    const stack = [];
    for (const [, token] of source.matchAll(/\b(IF|FOR|CASE|WHILE|REPEAT|END_IF|END_FOR|END_CASE|END_WHILE|END_REPEAT)\b/g)) {
      if (token.startsWith('END_')) assert.equal(stack.pop(), token.slice(4), `${file}: ${token}`);
      else stack.push(token);
    }
    assert.deepEqual(stack, [], file);
  }
});
