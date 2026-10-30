// Execute the actual PLC decisions and magazine steps without CODESYS or I/O.
import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSt, conversions, defaultsFromSt, readPlc } from './helpers/geometryStRuntime.mjs';

const manager = readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st');
const magazine = readPlc('FB/FB_MAGAZINE.st');
const methods = Object.fromEntries(['IsMachineEligible', 'IsMachineCompatible', 'IsMachineWorkPending', 'HasMagazineWork', 'SelectMachineBeforeTake', 'SelectMachineForHeldBlank', 'SelectMachineForUnload']
  .map(name => [name, readPlc(`FB/FB_CELL_MANAGER/FB_CELL_MANAGER.${name}.st`)]));
const enums = {};
for (const [group, name] of [...[manager, magazine, ...Object.values(methods)].join('\n').matchAll(/\b(E_\w+)\.(\w+)/g)].map(m => m.slice(1))) {
  (enums[group] ??= {})[name] = `${group}.${name}`;
}
const constants = {};
for (const [, name, hex, decimal] of [manager, magazine].join('\n').matchAll(/(\w+)\s*:\s*\w+\s*:=\s*(?:DWORD#16#([\da-f_]+)|UINT#(\d+))/gi)) {
  constants[name] = hex ? parseInt(hex.replaceAll('_', ''), 16) : Number(decimal);
}
const compile = source => compileSt(source.replace(/DWORD#16#([\da-f_]+)/gi, (_, n) => String(parseInt(n.replaceAll('_', ''), 16)))
  .replace(/\b(SelectMachineForHeldBlank|SelectMachineForUnload)\(([^()]+)\)/g,
    (_, name, args) => `${name}({${args.replaceAll(':=', ':')}})`));
function body(source, state) {
  const start = source.indexOf(`\n\t${state}:`);
  assert.ok(start >= 0, state);
  const tail = source.slice(start + state.length + 3);
  return tail.slice(0, tail.search(new RegExp(`\\n\\t${state.split('.')[0]}\\.\\w+[:,]|\\nEND_CASE;`)));
}
function assignment(source, name) {
  const start = source.indexOf(`${name} :=`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf(';', start) + 1);
}
const chooseMagazine = compile(manager.slice(manager.indexOf('xMagazine1Available :='), manager.indexOf('\nIF (uiActiveMagazine >= UINT#1)')));
const plan = compile(body(manager, 'E_CELL_MANAGER_STATE.PLAN_TARGET'));
const wait = compile(body(manager, 'E_CELL_MANAGER_STATE.WAIT_MAGAZINE'));
const releaseMagazine = compile(body(manager, 'E_CELL_MANAGER_STATE.RELEASE_MAGAZINE'));
const waitTarget = compile(body(manager, 'E_CELL_MANAGER_STATE.WAIT_TARGET'));
const warning = compile(assignment(manager, 'xNoDetailDestinationCondition')
  + manager.slice(manager.indexOf('IF xNoDetailDestinationCondition\n'), manager.indexOf('\nIF xNoBlankStockCondition')));
const freeSlots = compile(manager.slice(manager.indexOf('xAnyMagazineDetailSlotAvailable := FALSE;'), manager.indexOf('// WARNING: место требуется')));
const ready = compile(assignment(manager, 'xMagazineReady'));
const releaseCycleStart = manager.indexOf('\nIF NOT stRobotStatus.xBusy\nAND NOT stRobotStatus.xBlankAvailable');
const releaseCycle = compile(manager.slice(releaseCycleStart, manager.indexOf('\nEND_IF;', releaseCycleStart) + 8));
const captureCycle = compile(manager.slice(
  manager.lastIndexOf('\nIF (uiActiveMagazine >= UINT#1) AND (uiActiveMagazine <= UINT#2) THEN'),
  manager.indexOf('// Фиксируем позу')));
const magazineStates = Object.fromEntries(['CHOOSE', 'PREPARE_STEP', 'ROBOT_COMMAND', 'RELEASE_ROBOT_COMMAND', 'NEXT', 'DONE']
  .map(name => [name, compile(body(magazine, `E_MAGAZINE_STATE.${name}`))]));

function fixture() {
  const s = { ...conversions, ...enums, ...constants, ...defaultsFromSt(manager.replaceAll('SINT;', 'UINT;')), ...defaultsFromSt(manager, 'VAR_INPUT'),
    FIRST_MACHINE: 1, LAST_MACHINE: 3, START_PENDING_ESTIMATE: 1000, MACHINE_SWITCH_DEADBAND: 1000,
    GVL_CELL_SETTINGS: { NumberDetail: 120 }, Config: { uiTypeCount: 3, auiMachineType: [null, 1, 2, 3] },
    xRunning: true, eState: 'E_CELL_MANAGER_STATE.WAIT_MAGAZINE', uiActiveMagazine: 0,
    uiReturnMagazine: 0,
    uiDetailPayloadType: 1, uiBlankPayloadType: 0, uiSelectedMachine: 0, uiSelectedType: 0,
    iTakeSlot: 0, iPutSlot: 0, iTakeOriginSlot: 0, xChangePrepared: false,
    eMachineOperation: 'E_MACHINE_OPERATION.NONE', eMagazineOperation: 'E_MAGAZINE_OPERATION.NONE',
    rtStart: { Q: false }, rtStop: { Q: false },
    Diag: { stWarning: { uiCode: 0, udiSequence: 0 } }, Error: { dwErrorActive: 0 },
    stRobotStatus: { xBusy: false, xDone: false, xError: false, xBlankAvailable: false, xDetailAvailable: true,
      xGripper1Open: true, xRotatedToBlank: false, xRotatedToDetail: false, uiDetailPayloadType: 1 },
    astMachineStatus: [null, ...[1, 2, 3].map(() => ({ xEnabled: false, xError: false, xDisablePending: false,
      xProcessing: false, xCanAcceptService: true, xServiceRequired: false,
      ePartState: 'E_PART_STATE.EMPTY', ePartType: 'E_PART_TYPE.NONE', xCycleTimeValid: false }))],
    astMagazineStatus: [null, ...[1, 2].map(() => ({ xEnabled: false, xReady: true, xBusy: false, xDone: false,
      xError: false, xDisablePending: false, xFinished: false, xRobotStopRequired: false,
      stTypeStatus: { aiBlankSlot: [null, 0, 0, 0], aiFreeSlot: [null, 0, 0, 0] } }))],
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
  s.stMagazineStatus = structuredClone(s.astMagazineStatus[1]);
  return s;
}
function refresh(s) {
  releaseCycle(s);
  chooseMagazine(s);
  s.stMagazineStatus = structuredClone(s.astMagazineStatus[s.uiActiveMagazine || 1]);
  s.xActiveMagazineExchangeInProgress = s.axMagazineExchangeInProgress[s.uiActiveMagazine || 1];
  s.xActiveMagazineAutoSwapPending = s.axMagazineAutoSwapPending[s.uiActiveMagazine || 1];
  ready(s); freeSlots(s); warning(s);
}
function operation(s, take = s.iTakeSlot, put = s.iPutSlot) {
  const m = { ...conversions, ...enums, ...constants, ...defaultsFromSt(magazine), ...defaultsFromSt(magazine, 'VAR_INPUT'),
    eActualOperation: 'E_MAGAZINE_OPERATION.CHANGE', eGrantedOperation: 'E_MAGAZINE_OPERATION.NONE', Diag: { eState: 'E_MAGAZINE_STATE.CHOOSE' },
    Error: { dwErrorActive: 0 }, Command: {}, stActiveRobotCommand: {},
    iTakeSlot: take, iPutSlot: put, iActiveSlotCount: 120, uiTypeCount: 3, uiMagazineId: s.uiActiveMagazine || 1,
    stRobotStatus: structuredClone(s.stRobotStatus), xExecuteRequest: true,
    stInventory: { aSlots: [null, ...Array.from({ length: 120 }, (_, i) => ({ xInPosition: i + 1 === take,
      eDetailType: i + 1 === take ? 'E_DETAIL_TYPE.BLANK' : 'E_DETAIL_TYPE.NONE', uiProductType: i + 1 === take ? s.uiSelectedType || 1 : 0 }))] },
    fbFaultInjector: Object.fromEntries([...magazine.matchAll(/fbFaultInjector\.(x\w+)/g)].map(([, name]) => [name, false])),
  };
  return m;
}
function acknowledge(m) {
  m.stRobotStatus.xBusy = true; m.stRobotStatus.xDone = false;
  magazineStates.ROBOT_COMMAND(m);
  m.stRobotStatus.xBusy = false; m.stRobotStatus.xDone = true;
  magazineStates.ROBOT_COMMAND(m);
}

test('TAKE keeps its magazine through loading the blank and returning the finished payload', () => {
  for (const id of [1, 2]) for (const product of [1, 2, 3]) {
    const peer = 3 - id, s = fixture();
    Object.assign(s.stRobotStatus, { xBlankAvailable: false, xDetailAvailable: false });
    s.astMachineStatus[product].xEnabled = true;
    Object.assign(s.astMagazineStatus[id], { xEnabled: true });
    s.astMagazineStatus[id].stTypeStatus.aiBlankSlot[product] = 14;
    s.astMagazineStatus[id].stTypeStatus.aiFreeSlot[product] = 3;
    refresh(s); plan(s); captureCycle(s);
    assert.equal(s.eMagazineOperation, 'E_MAGAZINE_OPERATION.TAKE');
    assert.equal(s.uiReturnMagazine, id); assert.equal(s.uiSupplyMagazine, 0);
    s.eState = 'E_CELL_MANAGER_STATE.RELEASE_MAGAZINE';
    s.stMagazineStatus.xBusy = s.stMagazineStatus.xDone = false;
    s.stRobotStatus.xBlankAvailable = true;
    releaseMagazine(s);
    assert.equal(s.uiReturnMagazine, id); assert.equal(s.uiSupplyMagazine, id);

    // The machine exchanges payloads: the blank has left gripper 1, while the
    // finished part is in gripper 2. The peer now has both stock and free slots.
    Object.assign(s.stRobotStatus, { xBlankAvailable: false, xDetailAvailable: true });
    s.uiDetailPayloadType = product;
    s.eState = 'E_CELL_MANAGER_STATE.PLAN_TARGET';
    s.astMagazineStatus[id].stTypeStatus.aiBlankSlot[product] = 0;
    Object.assign(s.astMagazineStatus[peer], { xEnabled: true });
    s.astMagazineStatus[peer].stTypeStatus.aiBlankSlot[product] = 8;
    s.astMagazineStatus[peer].stTypeStatus.aiFreeSlot[product] = 4;
    refresh(s); plan(s); captureCycle(s);
    assert.equal(s.uiActiveMagazine, id);
    assert.equal(s.eMagazineOperation, 'E_MAGAZINE_OPERATION.PUT');
    assert.equal(s.uiReturnMagazine, id);

    s.eState = 'E_CELL_MANAGER_STATE.RELEASE_MAGAZINE';
    s.stMagazineStatus.xBusy = s.stMagazineStatus.xDone = false;
    s.stRobotStatus.xDetailAvailable = false;
    releaseMagazine(s);
    assert.equal(s.uiReturnMagazine, 0);
    refresh(s);
    assert.equal(s.uiActiveMagazine, peer); // Only now may the next cycle move.
  }
});

test('the selected supply pallet survives recovery of magazine 1 until its own stock ends', () => {
  const s = fixture();
  s.stRobotStatus.xDetailAvailable = false;
  s.astMachineStatus[1].xEnabled = true;
  for (const id of [1, 2]) {
    s.astMagazineStatus[id].xEnabled = true;
    s.astMagazineStatus[id].stTypeStatus.aiBlankSlot[1] = 14;
  }
  s.uiActiveMagazine = s.uiSupplyMagazine = 2;
  for (let scan = 0; scan < 20; scan++) {
    s.axMagazineExchangeInProgress[1] = scan < 3;
    refresh(s); assert.equal(s.uiActiveMagazine, 2);
  }
  s.astMagazineStatus[2].stTypeStatus.aiBlankSlot[1] = 0;
  refresh(s); assert.equal(s.uiActiveMagazine, 1);
  plan(s); captureCycle(s);
  assert.equal(s.uiSupplyMagazine, 2); // Planning alone has not taken a blank.
  s.eState = 'E_CELL_MANAGER_STATE.RELEASE_MAGAZINE';
  s.stMagazineStatus.xBusy = s.stMagazineStatus.xDone = false;
  s.stRobotStatus.xBlankAvailable = true;
  releaseMagazine(s);
  assert.equal(s.uiSupplyMagazine, 1); assert.equal(s.uiReturnMagazine, 1);
});

test('fallback PUT does not take a new blank from the fallback magazine or replace the supply owner', () => {
  for (const conflict of ['no-free-slot', 'disabled', 'error', 'exchange']) {
    const s = fixture();
    s.astMachineStatus[1].xEnabled = true;
    s.uiActiveMagazine = s.uiSupplyMagazine = s.uiReturnMagazine = 2;
    for (const id of [1, 2]) s.astMagazineStatus[id].xEnabled = true;
    s.astMagazineStatus[1].stTypeStatus.aiFreeSlot[1] = 3;
    s.astMagazineStatus[1].stTypeStatus.aiBlankSlot[1] = 14;
    if (conflict === 'disabled') s.astMagazineStatus[2].xEnabled = false;
    if (conflict === 'error') s.astMagazineStatus[2].xError = true;
    if (conflict === 'exchange') s.axMagazineExchangeInProgress[2] = true;
    refresh(s); assert.equal(s.uiActiveMagazine, 1);
    plan(s); captureCycle(s);
    assert.equal(s.eMagazineOperation, 'E_MAGAZINE_OPERATION.PUT');
    assert.equal(s.iTakeSlot, 0); assert.equal(s.uiReturnMagazine, 2);
    assert.equal(s.uiSupplyMagazine, 2);
    s.eState = 'E_CELL_MANAGER_STATE.RELEASE_MAGAZINE';
    s.stMagazineStatus.xBusy = s.stMagazineStatus.xDone = false;
    s.stRobotStatus.xDetailAvailable = false;
    releaseMagazine(s);
    Object.assign(s.astMagazineStatus[2], { xEnabled: true, xError: false });
    s.axMagazineExchangeInProgress[2] = false;
    s.astMagazineStatus[2].stTypeStatus.aiBlankSlot[1] = 15;
    refresh(s); assert.equal(s.uiActiveMagazine, 2);
  }
});

test('a full preferred magazine yields to an available free slot without taking another blank', () => {
  for (const owner of [1, 2]) {
    const peer = 3 - owner, s = fixture();
    s.uiActiveMagazine = s.uiSupplyMagazine = s.uiReturnMagazine = owner;
    s.astMachineStatus[1].xEnabled = true;
    for (const id of [1, 2]) s.astMagazineStatus[id].xEnabled = true;
    s.astMagazineStatus[owner].stTypeStatus.aiBlankSlot[1] = 14;
    s.astMagazineStatus[peer].stTypeStatus.aiFreeSlot[1] = 3;
    for (let scan = 0; scan < 5; scan++) {
      refresh(s);
      assert.equal(s.uiActiveMagazine, peer);
    }
    plan(s); captureCycle(s);
    assert.equal(s.eMagazineOperation, 'E_MAGAZINE_OPERATION.PUT');
    assert.equal(s.iTakeSlot, 0);
    assert.equal(s.uiReturnMagazine, owner);
  }
});

test('fallback PUT works with both grippers occupied and waits when neither magazine has a place', () => {
  for (const owner of [1, 2]) for (const conflict of ['disabled', 'error', 'full']) {
    const peer = 3 - owner, s = fixture();
    s.uiActiveMagazine = s.uiSupplyMagazine = s.uiReturnMagazine = owner;
    s.stRobotStatus.xBlankAvailable = true; s.uiBlankPayloadType = 1;
    for (const id of [1, 2]) s.astMagazineStatus[id].xEnabled = true;
    s.astMagazineStatus[owner].stTypeStatus.aiFreeSlot[1] = conflict === 'full' ? 0 : 3;
    if (conflict === 'disabled') s.astMagazineStatus[owner].xEnabled = false;
    if (conflict === 'error') s.astMagazineStatus[owner].xError = true;
    s.astMagazineStatus[peer].stTypeStatus.aiFreeSlot[1] = 4;
    refresh(s); assert.equal(s.uiActiveMagazine, peer);
    plan(s); assert.equal(s.eMagazineOperation, 'E_MAGAZINE_OPERATION.PUT');
    assert.equal(s.uiReturnMagazine, owner); assert.equal(s.iTakeSlot, 0);
    s.eState = 'E_CELL_MANAGER_STATE.PLAN_TARGET';
    s.astMagazineStatus[peer].stTypeStatus.aiFreeSlot[1] = 0;
    refresh(s); plan(s);
    assert.equal(s.eState, 'E_CELL_MANAGER_STATE.WAIT_MAGAZINE');
    assert.equal(s.stRobotStatus.xBlankAvailable, true); assert.equal(s.stRobotStatus.xDetailAvailable, true);
  }
});

test('one magazine exchanges while the robot works through the other and recovery does not steal its source', () => {
  for (const exchanging of [1, 2]) {
    const working = 3 - exchanging, s = fixture();
    s.uiActiveMagazine = s.uiSupplyMagazine = s.uiReturnMagazine = working;
    s.astMachineStatus[1].xEnabled = true;
    for (const id of [1, 2]) {
      s.astMagazineStatus[id].xEnabled = true;
      s.astMagazineStatus[id].stTypeStatus.aiFreeSlot[1] = 3;
    }
    s.astMagazineStatus[working].stTypeStatus.aiBlankSlot[1] = 14;
    s.axMagazineExchangeInProgress[exchanging] = true;
    refresh(s); assert.equal(s.uiActiveMagazine, working);
    plan(s); assert.equal(s.eState, 'E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE');
    assert.equal(s.eMagazineOperation, 'E_MAGAZINE_OPERATION.CHANGE');
    s.eState = 'E_CELL_MANAGER_STATE.PLAN_TARGET';
    s.axMagazineExchangeInProgress[exchanging] = false;
    s.astMagazineStatus[exchanging].stTypeStatus.aiBlankSlot[1] = 8;
    for (let scan = 0; scan < 10; scan++) { refresh(s); assert.equal(s.uiActiveMagazine, working); }
    s.stRobotStatus.xDetailAvailable = false;
    s.astMagazineStatus[working].stTypeStatus.aiBlankSlot[1] = 0;
    refresh(s); assert.equal(s.uiActiveMagazine, exchanging);
  }
});

test('a full fallback pallet cannot advertise CHANGE for a payload owned by the other magazine', () => {
  const s = fixture();
  s.astMachineStatus[1].xEnabled = true;
  s.uiActiveMagazine = s.uiSupplyMagazine = s.uiReturnMagazine = 2;
  for (const id of [1, 2]) s.astMagazineStatus[id].xEnabled = true;
  s.astMagazineStatus[1].stTypeStatus.aiBlankSlot[1] = 14;
  refresh(s);
  assert.equal(s.xMagazine1CanExchangeDetail, false);
  assert.equal(s.xDetailDestinationWarningActive, true);
  assert.equal(s.uiReturnMagazine, 2);
});

test('a cancelled early request restores unload capacity without latching the pallet finished', () => {
  const s = fixture();
  s.stRobotStatus.xDetailAvailable = false;
  Object.assign(s.astMachineStatus[1], { xEnabled: true, xProcessing: true,
    xCanAcceptService: false, ePartState: 'E_PART_STATE.LOADED', ePartType: 'E_PART_TYPE.PART' });
  s.uiActiveMagazine = s.uiSupplyMagazine = 1;
  s.astMagazineStatus[1].xEnabled = true;
  s.astMagazineStatus[1].stTypeStatus.aiFreeSlot[1] = 93;
  s.axMagazineAutoSwapPending[1] = true;
  refresh(s); assert.equal(s.xMagazine1Available, false);
  s.axMagazineAutoSwapPending[1] = false;
  refresh(s); plan(s); captureCycle(s);
  assert.equal(s.astMagazineStatus[1].xFinished, false);
  assert.equal(s.xMagazineReady, true);
  assert.equal(s.eMachineOperation, 'E_MACHINE_OPERATION.UNLOAD');
  assert.equal(s.eState, 'E_CELL_MANAGER_STATE.ROUTE_TO_TARGET');
  assert.equal(s.uiReturnMagazine, 1);
});

test('the first supply choice still prefers magazine 1 when both robot pallets can load a machine', () => {
  const s = fixture();
  s.stRobotStatus.xDetailAvailable = false;
  s.astMachineStatus[1].xEnabled = true;
  for (const id of [1, 2]) {
    s.astMagazineStatus[id].xEnabled = true;
    s.astMagazineStatus[id].stTypeStatus.aiBlankSlot[1] = 14;
  }
  refresh(s); plan(s); captureCycle(s);
  assert.equal(s.uiActiveMagazine, 1); assert.equal(s.uiSupplyMagazine, 0);
  s.eState = 'E_CELL_MANAGER_STATE.RELEASE_MAGAZINE';
  s.stMagazineStatus.xBusy = s.stMagazineStatus.xDone = false;
  s.stRobotStatus.xBlankAvailable = true;
  releaseMagazine(s);
  assert.equal(s.uiSupplyMagazine, 1);
});

test('single unload keeps its return owner while waiting with empty grippers', () => {
  const s = fixture();
  s.uiActiveMagazine = s.uiSupplyMagazine = s.uiReturnMagazine = 2;
  s.eMachineOperation = 'E_MACHINE_OPERATION.UNLOAD';
  s.eState = 'E_CELL_MANAGER_STATE.WAIT_TARGET';
  s.stRobotStatus.xDetailAvailable = false;
  for (let scan = 0; scan < 5; scan++) {
    releaseCycle(s); assert.equal(s.uiReturnMagazine, 2);
  }
  s.eState = 'E_CELL_MANAGER_STATE.SERVICE_TARGET';
  releaseCycle(s); assert.equal(s.uiReturnMagazine, 2);
  s.stRobotStatus.xDetailAvailable = true;
  s.eState = 'E_CELL_MANAGER_STATE.PLAN_TARGET';
  releaseCycle(s); assert.equal(s.uiReturnMagazine, 2);
});

test('load into an empty machine and completed GK delivery release only the return owner', () => {
  for (const phase of ['SERVICE_TARGET', 'GEOMETRY_DELIVER', 'GEOMETRY_RELEASE_COMMAND']) {
    const s = fixture();
    s.uiActiveMagazine = s.uiSupplyMagazine = s.uiReturnMagazine = 2;
    s.stRobotStatus.xDetailAvailable = false;
    s.eState = `E_CELL_MANAGER_STATE.${phase}`;
    releaseCycle(s); assert.equal(s.uiReturnMagazine, 2);
    s.eState = 'E_CELL_MANAGER_STATE.PLAN_TARGET';
    captureCycle(s); // The same FB call must publish release before the next RunTwoPallet.
    assert.equal(s.uiReturnMagazine, 0); assert.equal(s.uiSupplyMagazine, 2);
  }
});

test('a cancelled TAKE releases its reservation without replacing the previous supply owner', () => {
  const s = fixture();
  s.stRobotStatus.xDetailAvailable = false;
  s.uiActiveMagazine = 1; s.uiSupplyMagazine = 2;
  s.eMagazineOperation = 'E_MAGAZINE_OPERATION.TAKE';
  s.eState = 'E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE';
  captureCycle(s);
  assert.equal(s.uiReturnMagazine, 1); assert.equal(s.uiSupplyMagazine, 2);
  s.eState = 'E_CELL_MANAGER_STATE.PLAN_TARGET';
  releaseCycle(s);
  assert.equal(s.uiReturnMagazine, 0); assert.equal(s.uiSupplyMagazine, 2);
});

test('a newly enabled full magazine resumes the cycle for empty, finished and processing machines, across all product types', () => {
  for (const id of [1, 2]) for (const detailType of [1, 2, 3]) for (const blankType of [1, 2, 3]) for (const phase of ['empty', 'finished', 'processing', 'start-pending']) {
    const s = fixture();
    s.uiDetailPayloadType = s.stRobotStatus.uiDetailPayloadType = detailType;
    const machine = s.astMachineStatus[blankType]; machine.xEnabled = true;
    if (phase !== 'empty') Object.assign(machine, { ePartState: 'E_PART_STATE.LOADED', xCanAcceptService: phase === 'finished',
      xServiceRequired: phase === 'finished', xProcessing: phase === 'processing' });
    s.axMachineStartPending[blankType] = phase === 'start-pending';
    s.astMagazineStatus[id].stTypeStatus.aiBlankSlot[blankType] = 14;
    refresh(s); assert.equal(s.Diag.stWarning.uiCode, 29);
    wait(s); assert.equal(s.eState, 'E_CELL_MANAGER_STATE.WAIT_MAGAZINE');
    s.astMagazineStatus[id].xEnabled = true;
    refresh(s); assert.equal(s.xDetailDestinationWarningActive, false);
    assert.equal(s.Diag.stWarning.udiSequence, 1); // The old journal event still needs acknowledgement.
    wait(s); assert.equal(s.eState, 'E_CELL_MANAGER_STATE.PLAN_TARGET');
    plan(s);
    assert.equal(s.eState, 'E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE');
    assert.equal(s.eMagazineOperation, 'E_MAGAZINE_OPERATION.CHANGE');
    assert.equal(s.uiSelectedMachine, blankType);
    assert.equal(s.uiSelectedType, blankType);
    assert.equal(s.iTakeSlot, 14); assert.equal(s.iPutSlot, 14);
    assert.equal(s.rtStart.Q, false); assert.equal(s.xRunning, true);
  }
});

test('a free destination stays preferred over a full pallet exchange and unavailable magazines are excluded', () => {
  const s = fixture(); s.astMachineStatus[1].xEnabled = true;
  for (const id of [1, 2]) { s.astMagazineStatus[id].xEnabled = true; s.astMagazineStatus[id].stTypeStatus.aiBlankSlot[1] = 14; }
  s.astMagazineStatus[2].stTypeStatus.aiFreeSlot[1] = 3;
  for (let scan = 0; scan < 10; scan++) { refresh(s); assert.equal(s.uiActiveMagazine, 2); }
  for (const [field, value] of [['xEnabled', false], ['xReady', false], ['xBusy', true], ['xError', true], ['xDisablePending', true], ['xFinished', true]]) {
    const q = fixture(); q.astMachineStatus[1].xEnabled = true;
    q.astMagazineStatus[1].xEnabled = true; q.astMagazineStatus[1].stTypeStatus.aiBlankSlot[1] = 14;
    q.astMagazineStatus[1][field] = value; refresh(q);
    assert.equal(q.xMagazine1CanExchangeDetail, false); assert.equal(q.xDetailDestinationWarningActive, true);
  }
  s.axMagazineExchangeInProgress[1] = true; refresh(s); assert.equal(s.uiActiveMagazine, 2);
});

test('missing compatible stock, excluded machines and a closed first gripper keep W29 and do not issue CHANGE', () => {
  for (const block of ['stock-type', 'disabled', 'error', 'disable-pending', 'geometry', 'gripper', 'unknown-detail']) {
    const s = fixture(); s.astMachineStatus[1].xEnabled = true;
    s.astMagazineStatus[1].xEnabled = true; s.astMagazineStatus[1].stTypeStatus.aiBlankSlot[1] = 14;
    if (block === 'stock-type') s.Config.auiMachineType[1] = 2;
    if (block === 'disabled') s.astMachineStatus[1].xEnabled = false;
    if (block === 'error') s.astMachineStatus[1].xError = true;
    if (block === 'disable-pending') s.astMachineStatus[1].xDisablePending = true;
    if (block === 'geometry') s.axGeometryUnloadBlocked[1] = true;
    if (block === 'gripper') s.stRobotStatus.xGripper1Open = false;
    if (block === 'unknown-detail') s.uiDetailPayloadType = 0;
    refresh(s); wait(s);
    assert.equal(s.xMagazine1CanExchangeDetail, false);
    assert.equal(s.eState, block === 'unknown-detail' ? 'E_CELL_MANAGER_STATE.ERROR' : 'E_CELL_MANAGER_STATE.WAIT_MAGAZINE');
    if (block !== 'unknown-detail') {
      assert.equal(s.xDetailDestinationWarningActive, true);
      s.eState = 'E_CELL_MANAGER_STATE.PLAN_TARGET'; plan(s);
      assert.equal(s.eState, 'E_CELL_MANAGER_STATE.WAIT_MAGAZINE');
    }
    assert.notEqual(s.eMagazineOperation, 'E_MAGAZINE_OPERATION.CHANGE');
  }
});

test('W29 is suppressed for a valid exchange at Start and for loading a held blank into an empty machine', () => {
  const s = fixture(); s.astMachineStatus[1].xEnabled = true;
  s.astMagazineStatus[1].xEnabled = true; s.astMagazineStatus[1].stTypeStatus.aiBlankSlot[1] = 14;
  s.xRunning = false; s.rtStart.Q = true; s.eState = 'E_CELL_MANAGER_STATE.IDLE';
  refresh(s); assert.equal(s.Diag.stWarning.udiSequence, 0);
  s.xRunning = true; s.rtStart.Q = false; s.eState = 'E_CELL_MANAGER_STATE.PLAN_TARGET';
  s.stRobotStatus.xBlankAvailable = true; s.uiBlankPayloadType = 1;
  refresh(s); assert.equal(s.xHeldBlankLoadAvailable, true); assert.equal(s.Diag.stWarning.udiSequence, 0);
  plan(s); assert.equal(s.eMachineOperation, 'E_MACHINE_OPERATION.LOAD');
});

test('same-slot CHANGE takes first, rotates above the slot, then deposits and counts the detail exactly once', () => {
  const s = fixture(); s.uiSelectedType = 2;
  const m = operation(s, 14, 14); magazineStates.CHOOSE(m);
  assert.equal(m.Error.dwErrorActive, 0); assert.equal(m.xChangeTakeFirst, true);
  const actions = [];
  for (let step = 0; step <= 10; step++) {
    m.uiStep = step; m.Diag.eState = 'E_MAGAZINE_STATE.PREPARE_STEP';
    magazineStates.PREPARE_STEP(m);
    if (step === 10) break;
    assert.equal(m.stActiveRobotCommand.iActiveSlot, 14);
    actions.push([m.stActiveRobotCommand.eAction, m.stActiveRobotCommand.eSetPoint]);
    acknowledge(m);
    if (step === 3) {
      assert.equal(m.stInventory.aSlots[14].xInPosition, false);
      assert.equal(m.stInventory.aSlots[14].uiProductType, 0);
      assert.equal(m.udiProducedPartsTotal, 0);
    }
    if (step === 8) {
      assert.equal(m.stInventory.aSlots[14].eDetailType, 'E_DETAIL_TYPE.DETAIL');
      assert.equal(m.stInventory.aSlots[14].uiProductType, 1);
      assert.equal(m.udiProducedPartsTotal, 1);
    }
  }
  assert.equal(actions[0][0], 'E_ROBOT_ACTION.ROTATE_TO_DETAIL');
  assert.equal(actions[3][0], 'E_ROBOT_ACTION.CLAMP_1');
  assert.equal(actions[4][1], 'E_POINT_NAME.MAGAZINE_CHANGE');
  assert.equal(actions[5][0], 'E_ROBOT_ACTION.ROTATE_TO_BLANK');
  assert.equal(actions[8][0], 'E_ROBOT_ACTION.UNCLAMP_2');
  assert.equal(actions[9][1], 'E_POINT_NAME.MAGAZINE_SAFE');
  magazineStates.DONE(m); magazineStates.DONE(m);
  assert.equal(m.udiProducedPartsTotal, 1); assert.equal(m.stInventory.aSlots[14].xInPosition, true);
});

test('distinct-slot CHANGE preserves PUT then TAKE and the original two-slot inventory', () => {
  const m = operation(fixture(), 14, 3); magazineStates.CHOOSE(m);
  assert.equal(m.xChangeTakeFirst, false);
  for (const step of [0, 3, 5, 8]) {
    m.uiStep = step; m.Diag.eState = 'E_MAGAZINE_STATE.PREPARE_STEP'; magazineStates.PREPARE_STEP(m);
    const expected = { 0: 'ROTATE_TO_BLANK', 3: 'UNCLAMP_2', 5: 'ROTATE_TO_DETAIL', 8: 'CLAMP_1' }[step];
    assert.equal(m.stActiveRobotCommand.eAction, `E_ROBOT_ACTION.${expected}`); acknowledge(m);
  }
  assert.equal(m.stInventory.aSlots[3].eDetailType, 'E_DETAIL_TYPE.DETAIL');
  assert.equal(m.stInventory.aSlots[14].xInPosition, false); assert.equal(m.udiProducedPartsTotal, 1);
});

test('after the exchange the blank is loaded, exchanged in the machine, or held until processing finishes', () => {
  for (const phase of ['empty', 'finished', 'processing']) {
    const s = fixture(); s.uiSelectedMachine = 1; s.uiSelectedType = 1;
    s.eMagazineOperation = 'E_MAGAZINE_OPERATION.CHANGE';
    s.stRobotStatus.xDetailAvailable = false; s.stRobotStatus.xBlankAvailable = true;
    s.eState = 'E_CELL_MANAGER_STATE.RELEASE_MAGAZINE';
    Object.assign(s.astMachineStatus[1], { xEnabled: true, xCanAcceptService: phase !== 'processing',
      xServiceRequired: phase !== 'processing', xProcessing: phase === 'processing', eAbovePoint: 'above-machine-1',
      ePartState: phase === 'empty' ? 'E_PART_STATE.EMPTY' : 'E_PART_STATE.LOADED',
      eRecommendedOperation: phase === 'empty' ? 'E_MACHINE_OPERATION.LOAD' : 'E_MACHINE_OPERATION.CHANGE' });
    releaseMagazine(s); assert.equal(s.uiBlankPayloadType, 1); assert.equal(s.uiDetailPayloadType, 0);
    plan(s); assert.equal(s.eState, 'E_CELL_MANAGER_STATE.ROUTE_TO_TARGET');
    s.eState = 'E_CELL_MANAGER_STATE.WAIT_TARGET'; s.stRobotStatus.eCurrentPoint = 'above-machine-1';
    waitTarget(s);
    assert.equal(s.eState, phase === 'processing' ? 'E_CELL_MANAGER_STATE.WAIT_TARGET' : 'E_CELL_MANAGER_STATE.SERVICE_TARGET');
    if (phase !== 'processing') assert.equal(s.eMachineOperation, s.astMachineStatus[1].eRecommendedOperation);
    assert.equal(s.Error.dwErrorActive, 0);
  }
});

test('a full pallet advertises CHANGE and useful contents while the first gripper is open', () => {
  const start = magazine.indexOf('Status.xCanTake :=');
  const capability = compile(magazine.slice(start, magazine.indexOf('// Отсутствие заготовок', start)));
  const grantedStart = magazine.indexOf('eGrantedOperation := E_MAGAZINE_OPERATION.NONE;', magazine.indexOf('xFinishedCondition :='));
  const granted = compile(magazine.slice(grantedStart, magazine.indexOf('xResetRequest :=', grantedStart)));
  const m = operation(fixture(), 14, 14); m.Status = { xOutBlank: false, xOutFreeSlot: true };
  capability(m); granted(m);
  assert.equal(m.Status.xCanChange, true); assert.equal(m.Status.xCanEnable, true);
  assert.equal(m.eGrantedOperation, 'E_MAGAZINE_OPERATION.CHANGE');
  m.stRobotStatus.xGripper1Open = false; capability(m); granted(m);
  assert.equal(m.Status.xCanEnable, false); assert.equal(m.eGrantedOperation, 'E_MAGAZINE_OPERATION.NONE');
});

test('DONE fallback preserves a deposited detail in the shared slot and never counts it twice', () => {
  for (const takeCommitted of [false, true]) for (const putCommitted of [false, true]) {
    const m = operation(fixture(), 14, 14); magazineStates.CHOOSE(m);
    Object.assign(m, { xOperationSequenceComplete: true, xTakeSlotCommitted: takeCommitted,
      xPutSlotCommitted: putCommitted, udiProducedPartsTotal: putCommitted ? 1 : 0 });
    if (putCommitted) Object.assign(m.stInventory.aSlots[14], { xInPosition: true, eDetailType: 'E_DETAIL_TYPE.DETAIL', uiProductType: 1 });
    magazineStates.DONE(m); magazineStates.DONE(m);
    assert.equal(m.stInventory.aSlots[14].eDetailType, 'E_DETAIL_TYPE.DETAIL');
    assert.equal(m.stInventory.aSlots[14].xInPosition, true); assert.equal(m.udiProducedPartsTotal, 1);
    assert.equal(m.xTakeSlotCommitted, true); assert.equal(m.xPutSlotCommitted, true);
  }
});

test('same-slot validation rejects invalid slots, wrong contents and occupied gripper 1', () => {
  for (const block of ['zero', 'outside', 'empty', 'detail', 'unknown-blank-type', 'closed', 'held-blank', 'no-detail']) {
    const m = operation(fixture(), 14, 14);
    if (block === 'zero') m.iTakeSlot = m.iPutSlot = 0;
    if (block === 'outside') m.iTakeSlot = m.iPutSlot = 121;
    if (block === 'empty') m.stInventory.aSlots[14].xInPosition = false;
    if (block === 'detail') m.stInventory.aSlots[14].eDetailType = 'E_DETAIL_TYPE.DETAIL';
    if (block === 'unknown-blank-type') m.stInventory.aSlots[14].uiProductType = 0;
    if (block === 'closed') m.stRobotStatus.xGripper1Open = false;
    if (block === 'held-blank') m.stRobotStatus.xBlankAvailable = true;
    if (block === 'no-detail') m.stRobotStatus.xDetailAvailable = false;
    magazineStates.CHOOSE(m); assert.equal(m.Diag.eState, 'E_MAGAZINE_STATE.ERROR', block);
    assert.notEqual(m.Error.dwErrorActive, 0, block);
  }
});

test('Stop or robot error between TAKE and PUT preserves the empty slot and does not count a deposit', () => {
  for (const block of ['stop', 'global', 'robot']) {
    const m = operation(fixture(), 14, 14); magazineStates.CHOOSE(m);
    m.uiStep = 3; acknowledge(m);
    m.uiStep = 8; m.xRobotCommandStarted = true;
    if (block === 'stop') m.xStopRequest = true;
    if (block === 'global') m.xGlobalError = true;
    if (block === 'robot') m.stRobotStatus.xError = true;
    magazineStates.ROBOT_COMMAND(m);
    assert.equal(m.Diag.eState, 'E_MAGAZINE_STATE.ERROR');
    assert.equal(m.stInventory.aSlots[14].xInPosition, false);
    assert.equal(m.xPutSlotCommitted, false); assert.equal(m.udiProducedPartsTotal, 0);
  }
});

test('an unstarted robot acknowledgement cannot remove stock or count a detail', () => {
  const m = operation(fixture(), 14, 14); magazineStates.CHOOSE(m);
  m.stRobotStatus.xDone = true; m.uiStep = 3; magazineStates.ROBOT_COMMAND(m);
  assert.equal(m.stInventory.aSlots[14].eDetailType, 'E_DETAIL_TYPE.BLANK');
  assert.equal(m.xTakeSlotCommitted, false); assert.equal(m.udiProducedPartsTotal, 0);
});
