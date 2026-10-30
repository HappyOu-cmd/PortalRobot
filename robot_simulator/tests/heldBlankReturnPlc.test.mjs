// Execute the actual PLC planner across scans; no CODESYS, gateway or I/O.
import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSt, conversions, defaultsFromSt, readPlc } from '../../visu/tests/helpers/geometryStRuntime.mjs';

const manager = readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st');
const methodNames = ['IsMachineEligible', 'IsMachineCompatible', 'IsMachineWorkPending', 'HasMagazineWork', 'SelectMachineBeforeTake',
  'SelectMachineForHeldBlank', 'SelectMachineForUnload', 'CanReturnHeldBlank'];
const methods = Object.fromEntries(methodNames.map(name =>
  [name, readPlc(`FB/FB_CELL_MANAGER/FB_CELL_MANAGER.${name}.st`)]));
const enums = {};
for (const [, group, name] of [manager, ...Object.values(methods)].join('\n').matchAll(/\b(E_\w+)\.(\w+)/g)) {
  (enums[group] ??= {})[name] = `${group}.${name}`;
}
const constants = {};
for (const [, name, hex, decimal] of manager.matchAll(/(\w+)\s*:\s*\w+\s*:=\s*(?:DWORD#16#([\da-f_]+)|UINT#(\d+))/gi)) {
  constants[name] = hex ? parseInt(hex.replaceAll('_', ''), 16) : Number(decimal);
}
const compile = source => compileSt(source.replace(/DWORD#16#([\da-f_]+)/gi,
  (_, n) => String(parseInt(n.replaceAll('_', ''), 16)))
  .replace(/\b(SelectMachineForHeldBlank|SelectMachineForUnload)\(([^()]+)\)/g,
    (_, name, args) => `${name}({${args.replaceAll(':=', ':')}})`));
function body(state) {
  const start = manager.indexOf(`\n\tE_CELL_MANAGER_STATE.${state}:`);
  assert.ok(start >= 0, state);
  const tail = manager.slice(start + `\n\tE_CELL_MANAGER_STATE.${state}:`.length);
  return tail.slice(0, tail.search(/\n\tE_CELL_MANAGER_STATE\.\w+[:,]|\nEND_CASE;/));
}
const states = Object.fromEntries(['PLAN_TARGET', 'SELECT_FALLBACK', 'WAIT_MAGAZINE', 'RELEASE_MAGAZINE']
  .map(name => [`E_CELL_MANAGER_STATE.${name}`, compile(body(name))]));
const chooseMagazine = compile(manager.slice(manager.indexOf('xMagazine1Available :='),
  manager.indexOf('\nIF (uiActiveMagazine >= UINT#1)')));
const readyStart = manager.indexOf('xMagazineReady :=');
const ready = compile(manager.slice(readyStart, manager.indexOf(';', readyStart) + 1));

function fixture(typeCount = 3) {
  const s = { ...conversions, ...enums, ...constants,
    ...defaultsFromSt(manager.replaceAll('SINT;', 'UINT;')),
    FIRST_MACHINE: 1, LAST_MACHINE: 3, START_PENDING_ESTIMATE: 1000, MACHINE_SWITCH_DEADBAND: 1000,
    GVL_CELL_SETTINGS: { NumberDetail: 120, MagazineCount: 2 },
    Config: { uiTypeCount: typeCount, auiMachineType: [null, 1, Math.min(2, typeCount), typeCount] },
    xRunning: true, eState: 'E_CELL_MANAGER_STATE.SELECT_FALLBACK', uiActiveMagazine: 1,
    uiBlankPayloadType: 1, uiDetailPayloadType: 0, uiSelectedMachine: 0, uiSelectedType: 1,
    iTakeSlot: 6, iPutSlot: 0, iTakeOriginSlot: 6,
    eMachineOperation: 'E_MACHINE_OPERATION.NONE', eMagazineOperation: 'E_MAGAZINE_OPERATION.NONE',
    Command: {}, Error: { dwErrorActive: 0 },
    stRobotStatus: { xBusy: false, xDone: false, xError: false, xBlankAvailable: true,
      xDetailAvailable: false, xGripper1Open: false, uiBlankPayloadType: 1, uiDetailPayloadType: 0 },
    astMachineStatus: [null, ...[1, 2, 3].map(() => ({ xEnabled: false, xError: false,
      xDisablePending: false, xProcessing: false, xCanAcceptService: true, xServiceRequired: false,
      ePartState: 'E_PART_STATE.EMPTY', ePartType: 'E_PART_TYPE.UNKNOWN', xCycleTimeValid: false }))],
    astMagazineStatus: [null, ...[1, 2].map((id) => ({ xEnabled: id === 1, xReady: true,
      xBusy: false, xDone: false, xError: false, xDisablePending: false, xFinished: false,
      stTypeStatus: { aiBlankSlot: [null, 0, 0, 0], aiFreeSlot: [null, 6, 6, 6],
        auiFreeCount: [null, 2, 2, 2] } }))],
    axMachineStartPending: [null, false, false, false], axGeometryUnloadBlocked: [null, false, false, false],
    axMagazineAutoSwapPending: [null, false, false], axMagazineExchangeInProgress: [null, false, false],
    PlanGeometry: () => false,
  };
  for (const [name, source] of Object.entries(methods)) {
    const execute = compile(source);
    s[name] = (args = {}) => {
      const local = { ...s, ...defaultsFromSt(source), ...args, [name]: 0 };
      execute(local); return local[name];
    };
  }
  refresh(s);
  return s;
}
function refresh(s) {
  chooseMagazine(s);
  s.stMagazineStatus = structuredClone(s.astMagazineStatus[s.uiActiveMagazine || 1]);
  s.xActiveMagazineExchangeInProgress = s.axMagazineExchangeInProgress[s.uiActiveMagazine || 1];
  ready(s);
}
function scan(s) {
  refresh(s);
  s.Command = {};
  const execute = states[s.eState];
  assert.ok(execute, `unsupported scan ${s.eState}`);
  execute(s);
}
function machine(s, index, phase) {
  const target = s.astMachineStatus[index];
  Object.assign(target, { xEnabled: true, xCanAcceptService: phase === 'empty' || phase === 'finished',
    xServiceRequired: phase === 'empty' || phase === 'finished', xProcessing: phase === 'processing',
    ePartState: phase === 'empty' ? 'E_PART_STATE.EMPTY' : 'E_PART_STATE.LOADED',
    ePartType: phase === 'finished' ? 'E_PART_TYPE.DETAIL' : 'E_PART_TYPE.PART' });
  s.axMachineStartPending[index] = phase === 'start-pending';
}
function assertWaiting(s) {
  assert.equal(s.eState, 'E_CELL_MANAGER_STATE.WAIT_MAGAZINE');
  assert.equal(s.eMagazineOperation, 'E_MAGAZINE_OPERATION.NONE');
  assert.equal(s.eMachineOperation, 'E_MACHINE_OPERATION.NONE');
  assert.equal(s.uiSelectedMachine, 0);
  assert.equal(s.stRobotStatus.xBlankAvailable, true);
  assert.equal(s.xRunning, true);
  assert.equal(s.Error.dwErrorActive, 0);
  assert.deepEqual(s.Command, {});
}
function completeReturn(s) {
  assert.equal(s.eMagazineOperation, 'E_MAGAZINE_OPERATION.RETURN_BLANK');
  const owner = s.astMagazineStatus[s.uiActiveMagazine];
  const blankType = s.uiBlankPayloadType;
  owner.stTypeStatus.aiBlankSlot[blankType] = s.iPutSlot;
  for (let type = 1; type <= s.Config.uiTypeCount; type++) {
    owner.stTypeStatus.auiFreeCount[type]--;
    owner.stTypeStatus.aiFreeSlot[type] = owner.stTypeStatus.auiFreeCount[type] ? 7 : 0;
  }
  s.stRobotStatus.xBlankAvailable = false;
  s.stRobotStatus.xGripper1Open = true;
  s.stRobotStatus.uiBlankPayloadType = 0;
  s.eState = 'E_CELL_MANAGER_STATE.RELEASE_MAGAZINE';
  scan(s);
  assert.equal(s.uiBlankPayloadType, 0);
  assert.equal(s.iTakeOriginSlot, 0);
  assert.equal(s.eState, 'E_CELL_MANAGER_STATE.PLAN_TARGET');
}

test('one type holds the blank for disabled, faulty, disabling and GK-blocked machines', () => {
  for (const phase of ['disabled', 'fault', 'disabling', 'GK']) {
    const s = fixture(1);
    if (phase !== 'disabled') machine(s, 1, 'finished');
    if (phase === 'fault') s.astMachineStatus[1].xError = true;
    if (phase === 'disabling') s.astMachineStatus[1].xDisablePending = true;
    if (phase === 'GK') s.axGeometryUnloadBlocked[1] = true;
    for (let i = 0; i < 10; i++) { scan(s); assertWaiting(s); }
    assert.equal(s.iTakeOriginSlot, 6);
  }
});

test('two or three types wait when other machines have no useful work', () => {
  for (const count of [2, 3]) for (const phase of ['disabled', 'empty', 'processing', 'start-pending']) {
    const s = fixture(count);
    if (phase !== 'disabled') machine(s, 2, phase);
    for (let i = 0; i < 10; i++) { scan(s); assertWaiting(s); }
  }
});

test('other stock in either magazine enables return and the next real TAKE across all types', () => {
  for (const count of [2, 3]) for (let held = 1; held <= count; held++) {
    for (let other = 1; other <= count; other++) if (other !== held) {
      for (const id of [1, 2]) for (const phase of ['empty', 'finished', 'processing', 'start-pending']) {
        const s = fixture(count);
        s.uiBlankPayloadType = s.stRobotStatus.uiBlankPayloadType = held;
        s.Config.auiMachineType[1] = held; s.Config.auiMachineType[2] = other;
        s.astMagazineStatus[id].xEnabled = true;
        s.astMagazineStatus[id].stTypeStatus.aiBlankSlot[other] = 14;
        machine(s, 2, phase);
        scan(s);
        assert.equal(s.eMagazineOperation, 'E_MAGAZINE_OPERATION.RETURN_BLANK');
        assert.equal(s.uiActiveMagazine, 1);
        assert.equal(s.iPutSlot, 6);
        completeReturn(s); scan(s);
        assert.equal(s.eState, 'E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE');
        assert.equal(s.eMagazineOperation, 'E_MAGAZINE_OPERATION.TAKE');
        assert.equal(s.uiSelectedMachine, 2);
        assert.equal(s.uiSelectedType, other);
        assert.equal(s.uiActiveMagazine, id);
        assert.equal(s.iTakeSlot, 14);
      }
    }
  }
});

test('ready detail of another type enables return followed by UNLOAD without stock', () => {
  for (const count of [2, 3]) {
    const s = fixture(count); machine(s, 2, 'finished');
    scan(s); completeReturn(s); scan(s);
    assert.equal(s.eState, 'E_CELL_MANAGER_STATE.ROUTE_TO_TARGET');
    assert.equal(s.eMachineOperation, 'E_MACHINE_OPERATION.UNLOAD');
    assert.equal(s.uiSelectedMachine, 2);
    assert.equal(s.uiSelectedType, 2);
    assert.equal(s.uiActiveMagazine, 1);
  }
});

test('return cannot consume the only destination for a ready detail; another magazine can provide it', () => {
  const s = fixture(2); machine(s, 2, 'finished');
  s.astMagazineStatus[1].stTypeStatus.auiFreeCount = [null, 1, 1, 1];
  scan(s); assertWaiting(s);
  s.astMagazineStatus[2].xEnabled = true;
  scan(s); // WAIT rechecks useful work, then SELECT_FALLBACK authorizes the return.
  assert.equal(s.eState, 'E_CELL_MANAGER_STATE.SELECT_FALLBACK');
  scan(s); completeReturn(s); scan(s);
  assert.equal(s.eMachineOperation, 'E_MACHINE_OPERATION.UNLOAD');
  assert.equal(s.uiActiveMagazine, 2);
  assert.equal(s.uiSelectedMachine, 2);
});

test('unavailable magazines and excluded machines cannot justify a return', () => {
  for (const exclusion of ['disabled', 'not-ready', 'busy', 'fault', 'disabling', 'finished', 'exchange',
    'machine-disabled', 'machine-fault', 'machine-disabling', 'machine-GK', 'machine-type-zero', 'machine-type-out-of-range']) {
    const s = fixture(3); machine(s, 2, 'empty');
    const mag = s.astMagazineStatus[2]; mag.xEnabled = true; mag.stTypeStatus.aiBlankSlot[2] = 14;
    if (exclusion === 'disabled') mag.xEnabled = false;
    if (exclusion === 'not-ready') mag.xReady = false;
    if (exclusion === 'busy') mag.xBusy = true;
    if (exclusion === 'fault') mag.xError = true;
    if (exclusion === 'disabling') mag.xDisablePending = true;
    if (exclusion === 'finished') mag.xFinished = true;
    if (exclusion === 'exchange') s.axMagazineExchangeInProgress[2] = true;
    if (exclusion === 'machine-disabled') s.astMachineStatus[2].xEnabled = false;
    if (exclusion === 'machine-fault') s.astMachineStatus[2].xError = true;
    if (exclusion === 'machine-disabling') s.astMachineStatus[2].xDisablePending = true;
    if (exclusion === 'machine-GK') s.axGeometryUnloadBlocked[2] = true;
    if (exclusion === 'machine-type-zero') s.Config.auiMachineType[2] = 0;
    if (exclusion === 'machine-type-out-of-range') s.Config.auiMachineType[2] = 4;
    for (let i = 0; i < 3; i++) { scan(s); assertWaiting(s); }
  }
});

test('held blank keeps its compatible route while other types have work', () => {
  for (const phase of ['empty', 'finished', 'processing', 'start-pending', 'transition']) {
    const s = fixture(3); machine(s, 1, phase); machine(s, 2, 'empty');
    s.astMagazineStatus[1].stTypeStatus.aiBlankSlot[2] = 14;
    scan(s);
    assert.equal(s.eState, 'E_CELL_MANAGER_STATE.ROUTE_TO_TARGET');
    assert.equal(s.uiSelectedMachine, 1);
    assert.equal(s.eMagazineOperation, 'E_MAGAZINE_OPERATION.NONE');
  }
});

test('waiting resumes after its own machine or alternative stock appears, without Start', () => {
  const own = fixture(1); scan(own); assertWaiting(own);
  machine(own, 1, 'empty'); scan(own); scan(own);
  assert.equal(own.eState, 'E_CELL_MANAGER_STATE.ROUTE_TO_TARGET');
  assert.equal(own.uiSelectedMachine, 1);
  const other = fixture(3); machine(other, 3, 'empty'); scan(other); assertWaiting(other);
  other.astMagazineStatus[2].xEnabled = true;
  other.astMagazineStatus[2].stTypeStatus.aiBlankSlot[3] = 14;
  scan(other); scan(other);
  assert.equal(other.eMagazineOperation, 'E_MAGAZINE_OPERATION.RETURN_BLANK');
});

test('alternative work disappearing before issue keeps the blank and does not reserve a return', () => {
  const s = fixture(2); scan(s); machine(s, 2, 'empty');
  s.astMagazineStatus[1].stTypeStatus.aiBlankSlot[2] = 14;
  scan(s); assert.equal(s.eState, 'E_CELL_MANAGER_STATE.SELECT_FALLBACK');
  s.astMachineStatus[2].xEnabled = false;
  scan(s); assertWaiting(s); assert.equal(s.iPutSlot, 0);
});

test('a missing return slot waits and a restored slot resumes the useful return', () => {
  const s = fixture(2); machine(s, 2, 'empty'); s.iTakeOriginSlot = 0;
  s.astMagazineStatus[1].stTypeStatus.aiBlankSlot[2] = 14;
  s.astMagazineStatus[1].stTypeStatus.aiFreeSlot = [null, 0, 0, 0];
  s.astMagazineStatus[1].stTypeStatus.auiFreeCount = [null, 0, 0, 0];
  scan(s); assertWaiting(s);
  s.astMagazineStatus[1].stTypeStatus.aiFreeSlot = [null, 9, 9, 9];
  s.astMagazineStatus[1].stTypeStatus.auiFreeCount = [null, 1, 1, 1];
  scan(s); scan(s);
  assert.equal(s.eMagazineOperation, 'E_MAGAZINE_OPERATION.RETURN_BLANK');
  assert.equal(s.iPutSlot, 9);
});

test('two held loads use PUT before any blank return', () => {
  const s = fixture(3); machine(s, 2, 'empty');
  s.astMagazineStatus[1].stTypeStatus.aiBlankSlot[2] = 14;
  s.stRobotStatus.xDetailAvailable = true; s.uiDetailPayloadType = 2;
  scan(s); scan(s);
  assert.equal(s.eMagazineOperation, 'E_MAGAZINE_OPERATION.PUT');
  assert.equal(s.stRobotStatus.xBlankAvailable, true);
});

test('Stop at fallback or waiting preserves the blank and issues no return', () => {
  for (const state of ['SELECT_FALLBACK', 'WAIT_MAGAZINE']) {
    const s = fixture(3); machine(s, 2, 'empty');
    s.astMagazineStatus[1].stTypeStatus.aiBlankSlot[2] = 14;
    s.eState = `E_CELL_MANAGER_STATE.${state}`; s.xStopRequested = true;
    scan(s);
    assert.equal(s.eState, 'E_CELL_MANAGER_STATE.IDLE');
    assert.equal(s.xRunning, false);
    assert.equal(s.stRobotStatus.xBlankAvailable, true);
    assert.equal(s.eMagazineOperation, 'E_MAGAZINE_OPERATION.NONE');
  }
});
