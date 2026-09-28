import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: join(tmpdir(), 'portal-twin-tests'), server: { middlewareMode: true, watch: null },
  appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { createTwinState, commandTwinPreview, syncTwinPreview, changeOfflineMagazineMode } = await server.ssrLoadModule('/src/model/twoPalletControl.ts');
const { TwoPalletPreviewController } = await server.ssrLoadModule('/src/model/twoPalletPreview.ts');
const { mapTwinSnapshot } = await server.ssrLoadModule('/src/plc/twoPalletMapping.ts');
const { mapPlcSnapshot } = await server.ssrLoadModule('/src/plc/client.ts');
const { DEFAULT_STATE } = await server.ssrLoadModule('/src/model/defaults.ts');

function fixture() {
  const controller = new TwoPalletPreviewController();
  let state = createTwinState(true);
  return { controller, get state() { return state; },
    send(action, data) { state = commandTwinPreview(state, controller, action, data); },
    tick() { controller.tick(0.05); state = syncTwinPreview(state, controller); },
    settle() { for (let i = 0; i < 300 && state.busy; i++) this.tick(); assert.equal(state.busy, false); },
    confirm() { this.send('confirm', { pallet: state.candidate, revision: state.revision }); },
  };
}

test('both exchange directions lower, move, stop and only then raise P2; inventories stay with physical pallets', () => {
  const f = fixture(); f.confirm(); f.send('fill', { pallet: 1 }); f.send('slot', { pallet: 2, slot: 3, content: 2, productType: 2 });
  for (const target of [2, 1]) {
    f.send('loaded', { pallet: target }); f.send('swap'); assert.equal(f.state.busy, true);
    let moving = false, raising = false, previous = { ...f.controller.pose };
    for (let i = 0; i < 300 && f.state.busy; i++) {
      f.tick(); const p = f.controller.pose;
      if (Math.abs(p.carriage - previous.carriage) > 1e-8) { moving = true; assert.equal(p.lift, 0); }
      if (p.lift > previous.lift) { raising = true; assert.equal(p.carriage, 1); assert.equal(p[target === 1 ? 'p1' : 'p2'], 1); }
      previous = { ...p };
    }
    assert.ok(moving && raising); assert.equal(f.state.robotPallet, target); assert.equal(f.state.confirmed, true);
    assert.equal(f.state.pallets[0].slots[0], 'blank'); assert.equal(f.state.pallets[1].slots[2], 'detail');
    assert.equal(f.state.pallets[1].productTypes[2], 2); assert.equal(f.state.pallets[0].loaded, false);
  }
});

test('operator swap requires a confirmed but disabled magazine; automatic enable blocks the HMI swap command', () => {
  const f = fixture(); f.confirm();
  assert.equal(f.state.allowed.swap, true);
  f.send('enable'); assert.equal(f.state.enabled, true); assert.equal(f.state.allowed.swap, false);
  f.send('swap'); assert.equal(f.state.busy, false);
  f.send('disable'); f.send('swap'); assert.equal(f.state.busy, true);
});

test('manual P2 raise works at operator and intermediate carriage positions without moving the carriage', () => {
  for (const carriage of [0, 0.35]) {
    const f = fixture(); f.confirm(); f.send('lower'); f.settle();
    f.controller.follow({ ...f.controller.pose, carriage, p1: carriage }, true); f.tick();
    assert.equal(f.state.candidate, 0); assert.equal(f.state.allowed.raise, true);
    const position = f.state.position;
    f.send('raise'); assert.equal(f.state.busy, true); assert.equal(f.state.allowed.raise, false); f.settle();
    assert.equal(f.state.sensors.liftUp, true); assert.equal(f.state.position, position);
    assert.equal(f.state.confirmed, false); assert.equal(f.state.enabled, false);
  }
});

test('independent six-reed configurations drive both exchange directions and their required final lift states', () => {
  const f = fixture(); f.send('powerOff');
  f.send('config', { config: { ...f.state.config, p1Signals: 42, p2Signals: 21 } });
  f.send('powerOn'); f.confirm();
  assert.equal(f.state.candidate, 1); assert.equal(f.state.confirmed, true);
  assert.equal(f.state.sensors.lockOut, true); assert.equal(f.state.sensors.stopOut, true);
  f.send('swap'); f.settle();
  assert.equal(f.state.robotPallet, 2); assert.equal(f.state.candidate, 2); assert.equal(f.state.confirmed, true);
  assert.equal(f.state.sensors.liftDown, true); assert.equal(f.state.sensors.lockIn, true); assert.equal(f.state.sensors.stopIn, true);
  f.send('swap'); f.settle();
  assert.equal(f.state.robotPallet, 1); assert.equal(f.state.sensors.liftUp, true); assert.equal(f.state.confirmed, true);
});

test('invalid or ambiguous six-reed patterns cannot replace the saved configuration', () => {
  for (const [p1Signals, p2Signals] of [[0, 38], [27, 38], [30, 38], [58, 38], [26, 25], [64, 38]]) {
    const f = fixture(); f.send('powerOff'); const before = structuredClone(f.state.config), revision = f.state.revision;
    f.send('config', { config: { ...before, p1Signals, p2Signals } });
    assert.deepEqual(f.state.config, before); assert.equal(f.state.revision, revision);
  }
});

test('snapshot preserves both complete reed patterns and migrates legacy polarity', () => {
  const values = { 'astTwinConfig[2].xSignalPatternsConfigured': true,
    'astTwinConfig[2].uiP1Signals': 42, 'astTwinConfig[2].uiP2Signals': 21 };
  const state = mapTwinSnapshot(values, 2);
  assert.equal(state.config.p1Signals, 42); assert.equal(state.config.p2Signals, 21);
  for (const p1LockOut of [false, true]) {
    const old = mapTwinSnapshot({ 'astTwinConfig[1].xP1LockOut': p1LockOut }, 1);
    assert.equal(old.config.signalsConfigured, true);
    assert.equal(old.config.p1Signals, p1LockOut ? 26 : 38); assert.equal(old.config.p2Signals, p1LockOut ? 38 : 26);
  }
});

test('ordinary disable and re-enable preserve the confirmed arrangement', () => {
  const f = fixture(); f.confirm(); f.send('enable'); f.send('disable');
  assert.equal(f.state.confirmed, true); assert.equal(f.state.enabled, false);
  f.send('enable'); assert.equal(f.state.enabled, true);
});

test('idle Stop after disable preserves the arrangement, revision, Home, pose and inventories', () => {
  const f = fixture(); f.confirm(); f.send('fill', { pallet: 1 }); f.send('loaded', { pallet: 1 });
  f.send('enable'); f.send('disable');
  const before = { revision: f.state.revision, homed: f.state.homed, homeRequired: f.state.homeRequired,
    robotPallet: f.state.robotPallet, pose: { ...f.controller.pose }, config: structuredClone(f.state.config),
    pallets: structuredClone(f.state.pallets) };
  f.send('stop'); f.tick();
  assert.equal(f.state.confirmed, true); assert.equal(f.state.error, 0); assert.equal(f.state.enabled, false);
  assert.deepEqual({ revision: f.state.revision, homed: f.state.homed, homeRequired: f.state.homeRequired,
    robotPallet: f.state.robotPallet, pose: { ...f.controller.pose }, config: f.state.config, pallets: f.state.pallets }, before);
  f.send('enable'); assert.equal(f.state.enabled, true);
});

test('reset without an active fault preserves confirmation and HOME', () => {
  const f = fixture(); f.confirm();
  const before = { confirmed: f.state.confirmed, homed: f.state.homed, homeRequired: f.state.homeRequired, revision: f.state.revision };
  f.send('driveReset'); f.send('reset');
  assert.deepEqual({ confirmed: f.state.confirmed, homed: f.state.homed, homeRequired: f.state.homeRequired, revision: f.state.revision }, before);
});

test('lock and stop recover independently at a work position without moving an unknown pallet', () => {
  const f = fixture(); f.confirm();
  f.send('lockIn');
  assert.equal(f.state.sensors.lockIn, true);
  assert.equal(f.state.sensors.stopIn, true);
  assert.equal(f.state.selected, 0);
  assert.equal(f.state.confirmed, false);
  f.send('stopOut');
  assert.equal(f.state.sensors.stopOut, true);
  assert.equal(f.state.selected, 2);
  assert.equal(f.state.confirmed, false);
});

test('operator start answer atomically confirms and enables only the current arrangement', () => {
  const accepted = fixture();
  accepted.send('start', { pallet: accepted.state.candidate, revision: accepted.state.revision });
  assert.equal(accepted.state.confirmed, true); assert.equal(accepted.state.enabled, true);

  const stale = fixture();
  stale.send('start', { pallet: stale.state.candidate, revision: stale.state.revision - 1 });
  assert.equal(stale.state.confirmed, false); assert.equal(stale.state.enabled, false);
  stale.send('rejectStart', { pallet: stale.state.candidate, revision: stale.state.revision });
  assert.equal(stale.state.enabled, false);
});

test('operator pallet stays editable while enabled; robot pallet becomes editable only after disable', () => {
  const f = fixture(); f.confirm();
  const robot = f.state.robotPallet, operator = 3 - robot;
  f.send('enable');
  f.send('fill', { pallet: operator }); assert.equal(f.state.pallets[operator - 1].slots[0], 'blank');
  f.send('fill', { pallet: robot }); assert.equal(f.state.pallets[robot - 1].slots[0], 'empty');
  f.send('disable'); f.send('fill', { pallet: robot }); assert.equal(f.state.pallets[robot - 1].slots[0], 'blank');
});

test('both pallet inventories remain editable with the magazine disabled before position confirmation', () => {
  const f = fixture(); f.tick();
  assert.equal(f.state.confirmed, false);
  assert.equal(f.state.allowed.edit1, true);
  assert.equal(f.state.allowed.edit2, true);
  f.send('fill', { pallet: 1 }); f.send('fill', { pallet: 2 });
  assert.equal(f.state.pallets[0].slots[0], 'blank');
  assert.equal(f.state.pallets[1].slots[0], 'blank');
  assert.equal(f.state.confirmed, false);
});

test('inventory editing does not depend on a drive fault while the magazine is disabled', () => {
  const f = fixture(); f.state.error = 0x100; f.state.driveError = true; f.tick();
  assert.equal(f.state.allowed.edit1, true); assert.equal(f.state.allowed.edit2, true);
  f.send('fill', { pallet: 2 }); assert.equal(f.state.pallets[1].slots[0], 'blank');
});

test('inventory editing remains available during exchange and uses the new roles in its completion scan', () => {
  const f = fixture(); f.confirm(); f.send('swap');
  assert.equal(f.state.busy, true); assert.equal(f.state.allowed.edit1, true); assert.equal(f.state.allowed.edit2, true);
  f.send('slot', { pallet: 2, slot: 4, content: 2, productType: 2 });
  assert.equal(f.state.pallets[1].slots[3], 'detail'); f.settle(); f.send('enable');
  // An autonomous exchange uses the same local motion sequence while enabled.
  f.state.step = 20; f.controller.swap(); f.tick();
  assert.equal(f.state.allowed.edit1, true); assert.equal(f.state.allowed.edit2, false);
  f.send('slot', { pallet: 1, slot: 6, content: 1 });
  assert.equal(f.state.pallets[0].slots[5], 'blank'); f.settle();
  assert.equal(f.state.robotPallet, 1); assert.equal(f.state.allowed.edit1, false); assert.equal(f.state.allowed.edit2, true);
  f.send('clear', { pallet: 1 }); assert.equal(f.state.pallets[0].slots[5], 'blank');
});

test('live automatic operation preserves PLC swap and inventory permissions without a manual-mode gate in HMI', () => {
  const state = mapPlcSnapshot({ uiMagazineMode: 1, xCellManual: false, 'stCellStatus.xRunning': true,
    'stRobotStatus.xBusy': false, 'astTwinStatus[1].uiRobotPallet': 2, 'astTwinStatus[1].xEnabled': false,
    'astTwinStatus[1].xSwapAllowed': true, 'astTwinStatus[1].xEdit1Allowed': true,
    'astTwinStatus[1].xEdit2Allowed': true }, structuredClone(DEFAULT_STATE));
  assert.equal(state.magazines[0].twin.allowed.swap, true);
  assert.equal(state.magazines[0].twin.allowed.edit1, true); assert.equal(state.magazines[0].twin.allowed.edit2, true);
});

test('drive teaching stores the current operator and selected-pallet work coordinates', () => {
  const f = fixture(); f.confirm(); f.send('lower'); f.settle();
  f.state.position = 123.5; f.send('teachOperator'); assert.equal(f.state.config.exchange, 123.5);
  f.state.confirmed = true; f.state.position = 456.75; f.send('teachRobot'); assert.equal(f.state.config.workP1, 456.75);
});

test('Home is rejected with P2 up; manual motion invalidates confirmation; stale confirmation is rejected', () => {
  const f = fixture(); const revision = f.state.revision;
  f.send('home'); assert.equal(f.state.busy, false);
  f.confirm(); f.send('lower'); f.settle(); assert.equal(f.state.confirmed, false);
  f.send('home'); f.settle(); assert.equal(f.state.homed, true); assert.equal(f.state.candidate, 0);
  f.send('toRobot'); f.settle(); f.send('raise'); f.settle();
  f.send('confirm', { pallet: 1, revision }); assert.equal(f.state.confirmed, false);
  f.confirm(); assert.equal(f.state.confirmed, true);
});

test('stop freezes an exchange; reset never resumes or confirms it; manual recovery is possible', () => {
  const f = fixture(); f.confirm(); f.send('loaded', { pallet: 2 }); f.send('swap');
  for (let i = 0; i < 55; i++) f.tick();
  f.send('stop'); const pose = { ...f.controller.pose }; f.tick();
  assert.deepEqual(f.controller.pose, pose); assert.ok(f.state.error); assert.ok(f.state.faultStep);
  f.send('reset'); assert.equal(f.state.error, 0); assert.equal(f.state.enabled, false); assert.equal(f.state.confirmed, false);
  f.send('lower'); f.settle(); f.send('toOperator'); f.settle(); f.send('select1'); f.settle();
  f.send('toRobot'); f.settle(); f.send('raise'); f.settle(); f.confirm(); assert.equal(f.state.confirmed, true);
});

test('mode switching preserves static 120-slot banks and all four independent 96-slot inventories', () => {
  const bank = new Map(); let state = structuredClone(DEFAULT_STATE); state.magazineMode = 0; state.magazines[0].slots[119] = 'detail';
  state = changeOfflineMagazineMode(state, 1, bank);
  assert.equal(state.magazines.flatMap((m) => m.twin.pallets.flatMap((p) => p.slots)).length, 384);
  state.magazines[1].twin.pallets[1].slots[95] = 'detail';
  assert.equal(state.magazines[0].twin.pallets[1].slots[95], 'empty');
  state = changeOfflineMagazineMode(state, 0, bank); assert.equal(state.magazines[0].slots.length, 120); assert.equal(state.magazines[0].slots[119], 'detail');
  state = changeOfflineMagazineMode(state, 1, bank); assert.equal(state.magazines[1].twin.pallets[1].slots[95], 'detail'); assert.equal(state.magazines[0].twin.confirmed, false);
});

test('two mechanism controllers are independent and a busy exchange prevents mode switching', () => {
  const a = fixture(), b = fixture(); a.confirm(); a.send('loaded', { pallet: 2 }); a.send('swap'); a.tick();
  assert.equal(b.controller.pose.lift, 1); assert.equal(b.state.busy, false);
  const state = changeOfflineMagazineMode(structuredClone(DEFAULT_STATE), 1, new Map()); state.magazines[0].twin = a.state;
  assert.equal(changeOfflineMagazineMode(state, 0, new Map()), state);
});

test('missing PLC feedback revokes every permission and no demo configuration enables a real axis', () => {
  const f = fixture(); f.confirm(); f.send('enable');
  const live = mapTwinSnapshot({}, 1, f.state);
  assert.equal(live.live, true); assert.equal(live.confirmed, false); assert.equal(live.enabled, false);
  assert.equal(live.axisBound, false); assert.equal(live.config.configured, false); assert.ok(Object.values(live.allowed).every((v) => v === false));
  const real = mapTwinSnapshot({ 'astTwinStatus[2].uiRobotPallet': 2, 'astTwinStatus[2].uiFaultStep': 50,
    'astTwinStore[2].astPallet[2].aSlots[96].xInPosition': true, 'astTwinStore[2].astPallet[2].aSlots[96].eDetailType': 2 }, 2);
  assert.equal(real.robotPallet, 2); assert.equal(real.faultStep, 50); assert.equal(real.pallets[1].slots[95], 'detail');
});

test('invalid local configuration prevents confirmation and motion while permitting configuration repair', () => {
  const f = fixture(); f.send('powerOff'); f.send('config', { config: { ...f.state.config, workP1: 0 } }); f.send('powerOn');
  assert.equal(f.state.powered, false); assert.equal(f.state.allowed.confirm, false); assert.equal(f.state.allowed.lower, true); assert.equal(f.state.allowed.config, true);
});

test('drive fault needs drive reset, lowered P2 and a completed Home before magazine reset', () => {
  const f = fixture(); f.state.error = 0x100; f.state.driveError = true; f.state.homeRequired = true; f.tick();
  f.send('reset'); assert.equal(f.state.error, 0x100);
  f.send('driveReset'); f.send('reset'); assert.equal(f.state.error, 0x100); assert.equal(f.state.confirmed, false);
  f.send('lower'); f.settle(); f.send('powerOn'); f.send('home'); f.settle();
  assert.equal(f.state.homeRequired, false); f.send('reset'); assert.equal(f.state.error, 0); assert.equal(f.state.enabled, false);
});

test('live capacity follows PLC switching in both directions, restoring slots 97 through 120', () => {
  const twin = mapPlcSnapshot({ uiMagazineMode: 1, MagazineRows: 8, MagazineColumns: 12 }, structuredClone(DEFAULT_STATE));
  assert.equal(twin.magazines[0].slots.length, 96); assert.equal(twin.magazines[1].twin.pallets[1].slots.length, 96);
  const old = mapPlcSnapshot({ uiMagazineMode: 0, MagazineRows: 12, MagazineColumns: 10,
    'astMagazineInventory[2].aSlots[120].xInPosition': true, 'astMagazineInventory[2].aSlots[120].eDetailType': 2 }, twin);
  assert.equal(old.magazines[1].slots.length, 120); assert.equal(old.magazines[1].slots[119], 'detail'); assert.equal(old.magazines[1].twin, undefined);
});
