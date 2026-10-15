import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSt, conversions, defaultsFromSt, emptyCall, firstGeometryCall, readPlc, ton } from './helpers/geometryStRuntime.mjs';
import { GeometryBeltAnimation, mapGeometrySnapshot } from '../src/model/geometryControl.ts';

const source = readPlc('FB/FB_GEOMETRY_CONTROL.st');
const execute = compileSt(source);
function station() {
  const s = { ...conversions, ...defaultsFromSt(source), ...defaultsFromSt(source, 'VAR_INPUT'), ...defaultsFromSt(source, 'VAR_OUTPUT'), now: 0,
    xSupported: true, xSimulation: false, xManual: true, xHmiAlive: true, uiTimeFactor: 1,
    Config: { xConfigured: true, lrX: 100, lrY: 200, lrZ: 300, lrSafeZ: -300, lrChangeZ: -150, lrSpeedFactor: .2 },
    Memory: { xOccupied: false, xRecoveryRequired: false, xAtEndSeen: false, dwAlarm: 0, xRobotStopLatched: false, udiLastDepositId: 0, udiProducedPartsTotal: 0, Part: emptyCall() },
    Status: {}, Warning: { uiCode: 0, udiSequence: 0 }, events: [],
    Signals: { xReserve: false, xDeposited: false, xReleased: false, xRobotInteraction: false, Call: emptyCall() },
    GVL_GEOMETRY_CONTROL: { astCalls: [null, emptyCall(), emptyCall(), emptyCall()] }, tTransport: 10000, tFeedback: 3000, tResetPulse: 1000,
  };
  for (const name of ['tonTransport', 'tonFeedback', 'tonRemoved', 'tonReset']) s[name] = ton(s);
  s.F_GEOMETRY_EVENT = ({ Call }) => { s.events.push(structuredClone(Call)); return true; };
  s.scan = (input = {}, dt = 20) => { s.now += dt; Object.assign(s, { uiAction: 0, xReset: false, xDriveRunning: s.xRunOutput }, input); execute(s); };
  s.scan(); return s;
}
function enable(s) { s.scan({ uiAction: 1 }); assert.equal(s.Status.xConfirmationActive, true); s.scan({ uiAction: 3 }); assert.equal(s.Status.xEnabled, true); }
function deposit(s, id = 42, stationId = 1) {
  const Call = { ...emptyCall(), udiId: id, uiMachine: 2, uiProductType: 3, uiStation: stationId, uiState: 3 };
  s.Signals = { ...s.Signals, xReserve: true, xRobotInteraction: true, Call }; s.scan();
  s.Signals.xDeposited = true; s.scan(); s.scan();
}
function release(s) { Object.assign(s.Signals, { xReserve: false, xDeposited: false, xRobotInteraction: false, xReleased: true }); s.scan(); s.Signals.xReleased = false; s.scan(); }

test('motion checking remains blocked at enabled, running, occupied and reserved GK', () => {
  const s = station(); enable(s);
  s.scan({ uiAction: 5 }); s.scan();
  assert.equal(s.Status.xDriveRunning, true);
  assert.equal(s.Status.xConfigAllowed, false);
  s.Memory.xOccupied = true;
  s.xReserved = true;
  s.Signals.xRobotInteraction = true;
  s.scan();
  assert.equal(s.Status.xConfigAllowed, false);
});

test('motion checking rejects moving robot, automatic cycle, lost HMI and manual physical I/O', () => {
  for (const input of [{ xRobotBusy: true }, { xMotionBusy: true }, { xCellRunning: true },
    { xHmiAlive: false }, { xIoManual: true }, { xManual: false }, { xSupported: false }, { xGlobalError: true }]) {
    const s = station(); s.scan(input);
    assert.equal(s.Status.xConfigAllowed, false, JSON.stringify(input));
  }
});

test('startup state confirmation works without enabling or configuring GK', () => {
  const s = station();
  s.Config.xConfigured = false;
  s.scan();
  assert.equal(s.Status.xRecoveryRequired, true);
  assert.equal(s.Status.xSimulationRemoveAllowed, false);
  assert.equal(s.Status.xEnableAllowed, false);
  assert.equal(s.Status.xConfirmAllowed, true);
  s.scan({ uiAction: 3 });
  assert.equal(s.xCommandAccepted, true);
  assert.equal(s.Status.xRecoveryRequired, false);
  assert.equal(s.Status.xOccupied, false);
  assert.equal(s.Status.xEnabled, false);
  assert.equal(s.xRunOutput, false);
  assert.equal(s.xResetOutput, false);
  s.scan({ uiAction: 3 });
  assert.equal(s.xCommandAccepted, false);
  assert.equal(s.Warning.uiCode, 3);
});

test('standalone state rejection keeps recovery and confirmation never bypasses station or safety gates', () => {
  const s = station();
  s.scan({ uiAction: 4 });
  assert.equal(s.xCommandAccepted, true);
  assert.equal(s.Warning.uiCode, 2);
  assert.equal(s.Status.xRecoveryRequired, true);
  assert.equal(s.Status.xEnabled, false);
  for (const input of [{ xPartAtEnd: true }, { xDriveRunning: true },
    { xGlobalError: true }, { xIoManual: true }, { xHmiAlive: false },
    { xSupported: false }, { xDriveAlarm: true }]) {
    const blocked = station(); blocked.scan({ ...input, uiAction: 3 });
    assert.equal(blocked.xCommandAccepted, false, JSON.stringify(input));
    assert.equal(blocked.Status.xRecoveryRequired, true);
    assert.equal(blocked.Status.xEnabled, false);
    assert.equal(blocked.xRunOutput, false);
    assert.equal(blocked.Warning.uiCode, 3);
  }
  for (const flag of ['xRobotInteraction', 'reserved', 'manualRun', 'resetBusy']) {
    const blocked = station();
    if (flag === 'xRobotInteraction') blocked.Signals.xRobotInteraction = true;
    if (flag === 'reserved') blocked.xReserved = true;
    if (flag === 'manualRun') blocked.xManualRun = true;
    if (flag === 'resetBusy') blocked.xResetBusy = true;
    blocked.scan({ uiAction: 3, xDriveRunning: false });
    assert.equal(blocked.xCommandAccepted, false, flag);
    assert.equal(blocked.Status.xRecoveryRequired, true);
  }
});

test('standalone empty confirmation and enable work during unrelated robot motion in either cell mode and environment', () => {
  for (const simulation of [false, true]) for (const manual of [false, true]) for (const running of [false, true]) {
    for (const motion of [{ xRobotBusy: true }, { xMotionBusy: true }, { xRobotBusy: true, xMotionBusy: true }]) {
      const s = station(); s.Config.xConfigured = false;
      s.scan({ xSimulation: simulation, xManual: manual, xCellRunning: running, ...motion });
      assert.equal(s.Status.xConfirmAllowed, true); assert.equal(s.Status.dwConfirmBlockers, 0);
      s.scan({ uiAction: 3 });
      assert.equal(s.xCommandAccepted, true); assert.equal(s.Status.xRecoveryRequired, false);
      assert.equal(s.Status.xEnabled, false); assert.equal(s.xRunOutput, false); assert.equal(s.xResetOutput, false);
      s.Config.xConfigured = true; s.scan();
      assert.equal(s.Status.xEnableAllowed, true); assert.equal(s.Status.dwEnableBlockers, 0);
      s.scan({ uiAction: 1 });
      assert.equal(s.xCommandAccepted, true); assert.equal(s.Status.xEnabled, true); assert.equal(s.Status.xReady, true);
      assert.equal(s.Status.xConfirmationActive, false); assert.equal(s.xRunOutput, false);
    }
  }
});

test('enable followed by confirmation also works while the cell and robot are running elsewhere', () => {
  for (const simulation of [false, true]) {
    const s = station();
    s.scan({ xSimulation: simulation, xManual: false, xCellRunning: true, xRobotBusy: true, xMotionBusy: true, uiAction: 1 });
    assert.equal(s.xCommandAccepted, true); assert.equal(s.Status.xConfirmationActive, true);
    assert.equal(s.Status.xEnabled, false); assert.equal(s.Warning.uiCode, 1);
    s.scan({ uiAction: 3 });
    assert.equal(s.xCommandAccepted, true); assert.equal(s.Status.xEnabled, true); assert.equal(s.Status.xReady, true);
    assert.equal(s.xRunOutput, false); assert.equal(s.xResetOutput, false);
  }
});

test('PLC blocker masks explain every remaining enable and confirmation gate and reject the current command', () => {
  const gates = [
    [1, s => { s.xSupported = false; }], [2, s => { s.xHmiAlive = false; }],
    [4, s => { s.xGlobalError = true; }], [8, s => { s.xIoManual = true; }],
    [16, s => { s.xDriveAlarm = true; }], [64, s => { s.Signals.xRobotInteraction = true; }],
    [128, s => { s.xReserved = true; }], [256, s => { s.xDriveRunning = true; }],
    [512, s => { s.xManualRun = true; }], [1024, s => { s.xResetBusy = true; }],
    [2048, s => { s.xDisablePending = true; }], [8192, s => { s.xTransport = true; }],
  ];
  for (const simulation of [false, true]) for (const action of [1, 3]) for (const [mask, setup] of gates) {
    const s = station(); s.xSimulation = simulation; setup(s);
    s.scan({ uiAction: action, xDriveRunning: s.xDriveRunning });
    const field = action === 1 ? 'dwEnableBlockers' : 'dwConfirmBlockers';
    assert.equal(s.Status[field] & mask, mask, `${action}: ${mask}`);
    assert.equal(s.Status[action === 1 ? 'xEnableAllowed' : 'xConfirmAllowed'], false);
    assert.equal(s.xCommandAccepted, false); assert.equal(s.Warning.uiCode, 3);
    assert.equal(s.Status.xRecoveryRequired, true);
  }
  const configuration = station(); configuration.Config.xConfigured = false; configuration.scan({ uiAction: 1 });
  assert.equal(configuration.Status.dwEnableBlockers, 32); assert.equal(configuration.xCommandAccepted, false);
  const pending = station(); pending.scan({ uiAction: 1 }); pending.Config.xConfigured = false; pending.scan({ uiAction: 3 });
  assert.equal(pending.Status.dwConfirmBlockers, 32); assert.equal(pending.xCommandAccepted, false);
  const enabled = station(); enable(enabled); enabled.scan({ uiAction: 1 });
  assert.equal(enabled.Status.dwEnableBlockers, 4096); assert.equal(enabled.xCommandAccepted, false);
  enabled.scan({ uiAction: 3 }); assert.equal(enabled.Status.dwConfirmBlockers, 16384); assert.equal(enabled.xCommandAccepted, false);
  const sensor = station(); sensor.scan({ xPartAtEnd: true, uiAction: 3 });
  assert.equal(sensor.Status.dwConfirmBlockers, 32768); assert.equal(sensor.xCommandAccepted, false);
  const several = station(); several.scan({ xSupported: false, xHmiAlive: false, xGlobalError: true, uiAction: 1 });
  assert.equal(several.Status.dwEnableBlockers, 7); assert.equal(several.Status.dwConfirmBlockers, 7);
});

test('actual PLC interaction detection blocks only the selected GK including manual approach and retained placement pose', () => {
  const detect = compileSt(readPlc('PLC_PRG.RunGeometryControl.st').match(/stGeometrySignals :=[\s\S]*?(?=\s*GEOMETRY\[uiGeometry\]\()/)[0]);
  for (const stationId of [1, 2]) {
    const place = stationId === 1 ? 24 : 27, change = stationId === 1 ? 26 : 29, other = stationId === 1 ? 27 : 24;
    for (const [current, target, busy, interacting] of [[place, 0, false, true], [change, 0, false, true],
      [0, place, true, true], [0, change, true, true], [0, place, false, false], [other, other, true, false], [4, 20, true, false]]) {
      const context = { uiGeometry: stationId, stGeometrySignals: {},
        E_POINT_NAME: { GEOMETRY_1_PLACE: 24, GEOMETRY_1_CHANGE: 26, GEOMETRY_2_PLACE: 27, GEOMETRY_2_CHANGE: 29 },
        GVL_ROBOT: { Status: { eCurrentPoint: current, xBusy: busy }, Command: { eSetPoint: target } },
        GVL_GEOMETRY_CONTROL: { astSignals: [null, { xRobotInteraction: false }, { xRobotInteraction: false }] } };
      detect(context);
      assert.equal(context.stGeometrySignals.xRobotInteraction, interacting);
      const s = station(); s.Signals.xRobotInteraction = context.stGeometrySignals.xRobotInteraction;
      s.scan({ xManual: false, xCellRunning: true, xRobotBusy: busy, xMotionBusy: busy, uiAction: 3 });
      assert.equal(s.xCommandAccepted, !interacting);
      s.scan({ uiAction: 1 }); assert.equal(s.xCommandAccepted, !interacting);
    }
  }
});

test('standalone recovery clears a stored sample once without enabling GK or consuming a newer call', () => {
  for (const simulation of [false, true]) {
    const s = station(); enable(s); deposit(s); release(s);
    s.scan({ uiAction: 6, xSimulation: simulation }); s.scan();
    s.GVL_GEOMETRY_CONTROL.astCalls[2] = callFor(43, true);
    assert.equal(s.Status.xRecoveryRequired, true);
    s.scan({ uiAction: 3 });
    assert.equal(s.xCommandAccepted, true);
    assert.equal(s.Status.xRecoveryRequired, false);
    assert.equal(s.Status.xPartStored, false);
    assert.equal(s.Status.udiPartId, 0);
    assert.equal(s.Status.xEnabled, false);
    assert.equal(s.xRunOutput, false);
    assert.equal(s.xSimulationEmptyConfirmed, simulation);
    assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[2].udiId, 43);
    s.scan({ uiAction: 3 });
    assert.equal(s.events.filter(event => event.uiState === 8).length, 1);
    assert.equal(s.Memory.udiProducedPartsTotal, 1);
  }
});

test('PLC startup demands whole-belt confirmation and rejects it with an active end sensor', () => {
  const s = station(); s.scan({ uiAction: 1, xPartAtEnd: true }); s.scan({ uiAction: 3 });
  assert.equal(s.xCommandAccepted, false); assert.equal(s.Status.xEnabled, false); assert.equal(s.Status.xConfirmationActive, true);
  s.scan({ xPartAtEnd: false, uiAction: 4 }); assert.equal(s.Warning.uiCode, 2); assert.equal(s.Memory.xRecoveryRequired, true);
  enable(s); assert.equal(s.Status.xReady, true);
});
test('confirmed deposit counts once and conveyor waits for robot safe release', () => {
  const s = station(); enable(s); deposit(s);
  assert.equal(s.Memory.udiProducedPartsTotal, 1); assert.equal(s.events.filter(e => e.uiState === 4).length, 1);
  assert.equal(s.xRunOutput, false); assert.equal(s.Status.xPartStored, true); assert.equal(s.Memory.Part.uiMachine, 2);
  release(s); assert.equal(s.xRunOutput, true);
});
test('continuous three-second loss after reaching the end frees the station; flicker restarts the timer', () => {
  const s = station(); enable(s); deposit(s); release(s);
  s.scan({ xPartAtEnd: true }); s.scan(); assert.equal(s.xRunOutput, false);
  s.scan({ xPartAtEnd: false }); s.scan({}, 2999); assert.equal(s.Memory.xOccupied, true);
  s.scan({ xPartAtEnd: true }); s.scan({ xPartAtEnd: false }); s.scan({}, 2999); assert.equal(s.Memory.xOccupied, true);
  s.scan({}, 1); assert.equal(s.Memory.xOccupied, false); assert.equal(s.Status.xReady, true);
  assert.equal(s.events.at(-1).uiState, 8);
});
test('accepted simulation removal clears either GK immediately, hides its 3D part and preserves the next queued call', () => {
  for (const stationId of [1, 2]) for (const atEnd of [false, true]) {
    const s = station(); s.xSimulation = true; enable(s); deposit(s, 42, stationId); release(s);
    if (atEnd) { s.scan({ xPartAtEnd: true, rSimulationTravel: 1 }); s.scan(); }
    else { s.scan({ uiAction: 6, rSimulationTravel: .4 }); s.scan(); }
    const recoveryRequired = s.Memory.xRecoveryRequired;
    const animation = new GeometryBeltAnimation();
    const visual = () => animation.update(mapGeometrySnapshot(Object.fromEntries(
      Object.entries(s.Status).map(([tag, value]) => [`astGeometryStatus[${stationId}].${tag}`, value]),
    )).stations[stationId - 1], .02, .24);
    assert.equal(visual().sample, atEnd ? 0 : .6);
    s.GVL_GEOMETRY_CONTROL.astCalls[2] = callFor(43, true);
    s.scan({ uiAction: 7 });
    assert.equal(s.xCommandAccepted, true); assert.equal(s.xSimulationEmptyConfirmed, true);
    assert.equal(s.Memory.xOccupied, false); assert.equal(s.Memory.xAtEndSeen, false);
    assert.equal(s.Status.xPartStored, false); assert.equal(s.Status.xPartAtEnd, false); assert.equal(s.Status.rTravel, 0);
    assert.equal(s.Status.udiPartId, 0); assert.equal(s.Status.uiMachine, 0); assert.equal(s.Status.uiProductType, 0);
    assert.equal(s.Memory.xRecoveryRequired, recoveryRequired); assert.equal(s.xRunOutput, false);
    assert.equal(s.Status.xOccupied, recoveryRequired); assert.equal(s.Status.xReady, !recoveryRequired);
    assert.equal(visual().sample, null);
    const removed = s.events.filter(event => event.uiState === 8);
    assert.equal(removed.length, 1); assert.equal(removed[0].udiId, 42); assert.equal(removed[0].uiStation, stationId);
    assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[2].udiId, 43); assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[2].uiState, 1);
    s.scan({ xPartAtEnd: false, rSimulationTravel: 0 }); s.scan({ uiAction: 7 }, 3000);
    assert.equal(s.xCommandAccepted, false); assert.equal(s.xSimulationEmptyConfirmed, false);
    assert.equal(s.events.filter(event => event.uiState === 8).length, 1); assert.equal(s.Memory.udiProducedPartsTotal, 1);
    assert.equal(visual().sample, null);
    if (atEnd) {
      assert.equal(s.Status.xReady, true);
      deposit(s, 43, stationId); assert.equal(s.Status.udiPartId, 43); assert.equal(visual().sample, 1);
    }
  }
});
test('rejected simulation removal preserves the sample and does not confirm virtual belt clearance', () => {
  for (const input of [{ xSimulation: false }, { xDriveRunning: true }, { xHmiAlive: false }, { xGlobalError: true }, { xIoManual: true }]) {
    const s = station(); s.xSimulation = true; enable(s); deposit(s); release(s);
    s.scan({ xPartAtEnd: true }); s.scan();
    assert.equal(s.Status.xSimulationRemoveAllowed, true);
    s.scan({ ...input, uiAction: 7 });
    assert.equal(s.xCommandAccepted, false); assert.equal(s.xSimulationEmptyConfirmed, false);
    assert.equal(s.Memory.xOccupied, true); assert.equal(s.Status.udiPartId, 42);
    assert.equal(s.events.filter(event => event.uiState === 8).length, 0);
  }
});
test('loss before reaching the end never frees the part and transport timeout latches', () => {
  const s = station(); enable(s); deposit(s); release(s); s.scan({}, 10001);
  assert.equal(s.Memory.xOccupied, true); assert.ok(s.Memory.dwAlarm & 2); assert.equal(s.xRunOutput, false);
});
test('drive fault outside the robot operation stops equipment; handoff fault also latches robot stop', () => {
  const outside = station(); enable(outside); outside.scan({ xDriveAlarm: true });
  assert.equal(outside.Status.xError, true); assert.equal(outside.Status.xRobotStopRequired, false);
  const inside = station(); enable(inside); deposit(inside); inside.scan({ xDriveAlarm: true });
  assert.equal(inside.Status.xRobotStopRequired, true); inside.Signals.xRobotInteraction = false; inside.scan();
  assert.equal(inside.Status.xRobotStopRequired, true);
});
test('reset pulse keeps an active cause latched and clears only after pulse plus stopped feedback', () => {
  const s = station(); enable(s); deposit(s); release(s); s.scan({ xDriveAlarm: true }); s.scan();
  s.scan({ xReset: true }); assert.equal(s.xResetOutput, true); s.scan({}, 999); assert.equal(s.xResetOutput, true);
  s.scan({}, 1); assert.equal(s.xResetOutput, false); assert.equal(s.Status.xError, true);
  s.scan({ xDriveAlarm: false }); s.scan({ xReset: true }); s.scan({}, 1000);
  assert.equal(s.Status.xError, false); assert.equal(s.Memory.xOccupied, true); assert.equal(s.Memory.xRecoveryRequired, true); assert.equal(s.xRunOutput, false);
  assert.equal(s.Status.xEnabled, false); s.scan({ uiAction: 1 }); assert.equal(s.Status.xConfirmationActive, true);
});
test('disable drops manual run and enable cannot start while the manual run command is held', () => {
  const s = station(); enable(s); s.scan({ uiAction: 5 }); assert.equal(s.xRunOutput, true);
  s.scan({ uiAction: 2 }); assert.equal(s.xRunOutput, false); assert.equal(s.Status.xEnabled, false);
  const held = station(); held.scan({ uiAction: 5 }); held.scan({ uiAction: 1, xDriveRunning: false });
  assert.equal(held.xCommandAccepted, false); assert.equal(held.Status.xEnabled, false);
});
test('removing an earlier sample preserves a newer queued call from the same machine', () => {
  const s = station(); enable(s); deposit(s); release(s); s.scan({ xPartAtEnd: true }); s.scan();
  s.GVL_GEOMETRY_CONTROL.astCalls[2] = callFor(43, true);
  s.scan({ xPartAtEnd: false }); s.scan({}, 3000);
  assert.equal(s.Memory.xOccupied, false); assert.equal(s.events.at(-1).udiId, 42);
  assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[2].udiId, 43); assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[2].uiState, 1);
});
test('disabled handoff finishes robot release, then demands confirmation before enabling', () => {
  const s = station(); enable(s); deposit(s); s.scan({ uiAction: 2 }); assert.equal(s.Status.xEnabled, true);
  release(s); assert.equal(s.Status.xEnabled, false); assert.equal(s.Memory.xOccupied, true); assert.equal(s.xRunOutput, false);
  s.scan({ uiAction: 1 }); assert.equal(s.Status.xConfirmationActive, true);
  s.scan({ xPartAtEnd: true, uiAction: 3 }); assert.equal(s.Memory.xOccupied, true);
  s.scan({ xPartAtEnd: false, uiAction: 3 }); assert.equal(s.Memory.xOccupied, false); assert.equal(s.Status.xEnabled, true);
});
test('manual drive ignores the end sensor and is denied with robot interaction, auto cycle or lost HMI', () => {
  const s = station(); s.scan({ xPartAtEnd: true, uiAction: 5 }); assert.equal(s.xRunOutput, true);
  s.scan({ uiAction: 6 }); assert.equal(s.xRunOutput, false);
  for (const input of [{ xCellRunning: true }, { xHmiAlive: false }, { xRobotBusy: true }, { xMotionBusy: true }, { xManual: false }, { xGlobalError: true }]) {
    const blocked = station(); blocked.scan({ ...input, uiAction: 5 }); assert.equal(blocked.xCommandAccepted, false); assert.equal(blocked.xRunOutput, false);
  }
  const robot = station(); robot.Signals.xRobotInteraction = true; robot.scan({ uiAction: 5 }); assert.equal(robot.xCommandAccepted, false);
});
test('global stop drops run and reset outputs and preserves occupancy', () => {
  const s = station(); enable(s); deposit(s); release(s); s.scan({ xGlobalError: true });
  assert.equal(s.xRunOutput, false); assert.equal(s.xResetOutput, false); assert.equal(s.Memory.xOccupied, true); assert.equal(s.Status.xEnabled, false);
});
test('running feedback mismatch has its own timeout and a false end signal is insufficient recovery evidence', () => {
  const s = station(); enable(s); deposit(s); release(s); s.scan({ xDriveRunning: false }); s.scan({ xDriveRunning: false }, 3000);
  assert.ok(s.Memory.dwAlarm & 4); assert.equal(s.Memory.xRecoveryRequired, true);
});

test('simulation keeps progress through pause and consumes only accepted removal without reviving the old sample', () => {
  const src = readPlc('FB/FB_GEOMETRY_CONTROL_SIMULATION.st'), run = compileSt(src);
  const removalExpression = readPlc('PLC_PRG.RunGeometryControl.st').match(/xRemove := ([\s\S]*?),\s*xAlarm :=/)[1];
  const readRemoval = compileSt('// --- BEGIN IMPLEMENTATION ---\nxRemove := ' + removalExpression + ';');
  const geometry = { xSimulationEmptyConfirmed: false };
  const s = { ...conversions, ...defaultsFromSt(src), ...defaultsFromSt(src, 'VAR_INPUT'), ...defaultsFromSt(src, 'VAR_OUTPUT'), GVL_HMI: { udiHmiCommandClockMs: 0 }, tTravel: 6000, uiTimeFactor: 1,
    uiGeometry: 1, GEOMETRY: [null, geometry], GVL_GEOMETRY_CONTROL: { auiAction: [0, 0], astStatus: [null, { xSimulationRemoveAllowed: true }] },
  };
  const step = (input, ms = 1000) => { s.GVL_HMI.udiHmiCommandClockMs += ms; Object.assign(s, { xInitialize: false, xDeposited: false, xRemove: false }, input); run(s); };
  step({ xInitialize: true }); step({ xDeposited: true, udiPartId: 1 }); step({ xRun: true }); step({}); const progress = s.rTravel;
  step({ xRun: false }); step({}); assert.equal(s.rTravel, progress); assert.equal(s.xPartAtEnd, false);
  step({ xRun: true }); step({}); step({}); step({}); assert.equal(s.xPartAtEnd, true);
  step({ xRun: false }); assert.equal(s.xPartAtEnd, true);
  s.GVL_GEOMETRY_CONTROL.auiAction[1] = 7; readRemoval(s);
  assert.equal(s.xRemove, false); step({ xRemove: s.xRemove }); assert.equal(s.xPartAtEnd, true);
  geometry.xSimulationEmptyConfirmed = true; readRemoval(s); step({ xRemove: s.xRemove });
  assert.equal(s.xPart, false); assert.equal(s.xPartAtEnd, false); assert.equal(s.rTravel, 0);
  geometry.xSimulationEmptyConfirmed = false; s.GVL_GEOMETRY_CONTROL.auiAction[1] = 0; readRemoval(s);
  step({ xDeposited: true, udiPartId: 1, xRemove: s.xRemove }); assert.equal(s.xPart, false);
  step({ xDeposited: true, udiPartId: 2 }); assert.equal(s.xPart, true); assert.equal(s.xPartAtEnd, false); assert.equal(s.rTravel, 0);
});

test('routing picks any free enabled GK without a magazine dependency', () => {
  const select = compileSt(readPlc('FB/F_GEOMETRY_SELECT_STATION.st'));
  const s = { ...conversions, uiMachine: 0, uiTry: 0, uiStation: 0, F_GEOMETRY_SELECT_STATION: 0, xRequireFree: true, GVL_GEOMETRY_CONTROL: { xSupported: true, uiLastStation: 0, astStatus: [null, { xEnabled: true, xConfigured: true, xReady: false, xError: false, uiState: 4 }, { xEnabled: true, xConfigured: true, xReady: true, xError: false, uiState: 1 }] } };
  select(s); assert.equal(s.F_GEOMETRY_SELECT_STATION, 2);
  s.GVL_GEOMETRY_CONTROL.astStatus[2].xReady = false; select(s); assert.equal(s.F_GEOMETRY_SELECT_STATION, 0);
  s.xRequireFree = false; select(s); assert.equal(s.F_GEOMETRY_SELECT_STATION, 1);
  s.GVL_GEOMETRY_CONTROL.astStatus[1].xError = true; select(s); assert.equal(s.F_GEOMETRY_SELECT_STATION, 2);
});

test('automatic cadence uses confirmed taken parts; forced sample restarts its own machine counter', () => {
  const run = compileSt(readPlc('FB/F_GEOMETRY_TAKE_DETAIL.st'));
  const s = { ...conversions, uiMachine: 2, uiProductType: 3, F_GEOMETRY_TAKE_DETAIL: false, Call: emptyCall(), EmptyCall: emptyCall(), events: [],
    GVL_GEOMETRY_CONTROL: { xSupported: true, xAutoEnabled: true, udiNextCallId: 0, astStatus: [null, { xEnabled: true }, { xEnabled: true }], auiActiveCount: [0, 0, 0, 0], auiPeriod: [0, 3, 3, 3], astCalls: [null, emptyCall(), emptyCall(), emptyCall()] } };
  s.F_GEOMETRY_FIRST_CALL = () => firstGeometryCall(s.GVL_GEOMETRY_CONTROL);
  s.F_GEOMETRY_EVENT = ({ Call }) => { s.events.push(structuredClone(Call)); return true; };
  run(s); run(s); assert.equal(s.F_GEOMETRY_TAKE_DETAIL, false); assert.equal(s.GVL_GEOMETRY_CONTROL.auiActiveCount[2], 2);
  run(s); assert.equal(s.F_GEOMETRY_TAKE_DETAIL, true); assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[2].uiProductType, 3);
  assert.equal(s.GVL_GEOMETRY_CONTROL.auiActiveCount[2], 0); assert.equal(s.GVL_GEOMETRY_CONTROL.auiActiveCount[1], 0);
  s.GVL_GEOMETRY_CONTROL.astCalls[2] = callFor(99, true); s.GVL_GEOMETRY_CONTROL.auiActiveCount[2] = 2;
  run(s); assert.equal(s.F_GEOMETRY_TAKE_DETAIL, true); assert.equal(s.GVL_GEOMETRY_CONTROL.auiActiveCount[2], 0); assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[2].udiId, 99);
});
const callFor = (id, forced = false) => ({ ...emptyCall(), udiId: id, uiMachine: 2, uiProductType: 3, uiState: 1, xForced: forced });

test('planner waits when both GK are occupied and otherwise bypasses with a recorded reason', () => {
  const plan = compileSt(readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.PlanGeometry.st'));
  const E_CELL_MANAGER_STATE = { GEOMETRY_DELIVER: 20, GEOMETRY_WAIT_FREE: 19 };
  const s = { E_CELL_MANAGER_STATE, PlanGeometry: false, uiFree: 0, uiAvailable: 0, xGeometryHeld: true, stRobotStatus: { xDetailAvailable: true }, uiGeometryMachine: 2, uiGeometryStation: 0, uiGeometryStep: 0, uiGeometryParkStation: 0, uiGeometryBypassReason: 0, udiGeometryMagazineCounter: 0, stMagazineStatus: { udiProducedPartsTotal: 7 }, eState: 1,
    GVL_GEOMETRY_CONTROL: { xWaitWhenOccupied: true, astCalls: [null, emptyCall(), callFor(10), emptyCall()], astSignals: [null, {}, {}] },
    F_GEOMETRY_SELECT_STATION: ({ xRequireFree }) => xRequireFree ? 0 : 2, F_GEOMETRY_EVENT: () => true };
  plan(s); assert.equal(s.PlanGeometry, true); assert.equal(s.eState, 19); assert.equal(s.uiGeometryParkStation, 2);
  s.GVL_GEOMETRY_CONTROL.xWaitWhenOccupied = false; plan(s); assert.equal(s.PlanGeometry, false); assert.equal(s.uiGeometryBypassReason, 1); assert.equal(s.udiGeometryMagazineCounter, 7);
  s.F_GEOMETRY_SELECT_STATION = () => 0; plan(s); assert.equal(s.uiGeometryBypassReason, 2);
  s.F_GEOMETRY_SELECT_STATION = () => 1; plan(s); assert.equal(s.eState, 20); assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[2].uiStation, 1); assert.equal(s.GVL_GEOMETRY_CONTROL.astSignals[1].xReserve, true);
});

function geometryRoute(stationId = 1) {
  const route = compileSt(readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.RunGeometryRoute.st'));
  const E_CELL_MANAGER_STATE = Object.fromEntries(['GEOMETRY_WAIT_FREE', 'GEOMETRY_DELIVER', 'GEOMETRY_RELEASE_COMMAND', 'IDLE', 'PLAN_TARGET', 'ERROR'].map((key, n) => [key, n]));
  const E_POINT_NAME = Object.fromEntries(['HOME_SAFETY', 'GEOMETRY_1_SAFE', 'GEOMETRY_1_CHANGE', 'GEOMETRY_1_PLACE', 'GEOMETRY_2_SAFE', 'GEOMETRY_2_CHANGE', 'GEOMETRY_2_PLACE'].map((key, n) => [key, n]));
  const s = { E_CELL_MANAGER_STATE, E_POINT_NAME, E_ROBOT_ACTION: { MOVE_TO_POINT: 1, UNCLAMP_2: 4, ROTATE_TO_BLANK: 6, ROTATE_TO_DETAIL: 7 }, xStopRequested: false, xGlobalError: false, xMotionBusy: false, xRunning: true,
    uiGeometryStation: stationId, uiGeometryMachine: 2, uiGeometryParkStation: stationId, uiGeometryStep: 0, eState: E_CELL_MANAGER_STATE.GEOMETRY_DELIVER, eGeometryReturnState: 0, eGeometrySafePoint: 0, eGeometryChangePoint: 0, eGeometryPlacePoint: 0,
    stRobotStatus: { xBusy: false, xDone: false, xError: false, xGripper2Open: false, xDetailAvailable: true, eCurrentPoint: 0 }, Command: { stRobot: {} }, Error: { dwErrorActive: 0 }, ERR_ROBOT: 2, xSafetyHomeRequired: false, xStoppedPoseValid: false, xGeometryHeld: true, uiDetailPayloadType: 3,
    GVL_GEOMETRY_CONTROL: { xWaitWhenOccupied: true, uiLastStation: 0, astCalls: [null, emptyCall(), { ...callFor(42), uiStation: stationId, uiState: 3 }, emptyCall()],
      astStatus: [null, ...[1, 2].map(id => ({ xError: false, xEnabled: true, xReady: id !== stationId, xReserved: id === stationId }))],
      astSignals: [null, ...[1, 2].map(id => ({ xReserve: id === stationId, xRobotInteraction: false, xDeposited: false, xReleased: false }))] },
    F_GEOMETRY_SELECT_STATION: () => 0, F_GEOMETRY_EVENT: () => true,
  };
  return { route, s };
}
test('ST handoff rotates toward the blank at SAFE for both GK stations and waits for Done reset before placement', () => {
  for (const stationId of [1, 2]) {
    const { route, s } = geometryRoute(stationId);
    const { E_CELL_MANAGER_STATE, E_POINT_NAME, E_ROBOT_ACTION } = s;
    const safePoint = E_POINT_NAME[`GEOMETRY_${stationId}_SAFE`];
    const targets = [safePoint, null, E_POINT_NAME[`GEOMETRY_${stationId}_PLACE`], null, safePoint];
    const signals = s.GVL_GEOMETRY_CONTROL.astSignals[stationId];
    for (let step = 0; step <= 4; step++) {
      route(s); assert.equal(s.Command.stRobot.xExecute, true); assert.equal(s.uiGeometryStep, step);
      assert.equal(s.Command.stRobot.eAction, step === 1 ? E_ROBOT_ACTION.ROTATE_TO_BLANK : step === 3 ? E_ROBOT_ACTION.UNCLAMP_2 : E_ROBOT_ACTION.MOVE_TO_POINT);
      if (step === 1) assert.equal(s.stRobotStatus.eCurrentPoint, safePoint);
      if (targets[step] !== null) assert.equal(s.Command.stRobot.eSetPoint, targets[step]);
      s.stRobotStatus.xBusy = true; route(s);
      assert.equal(s.eState, E_CELL_MANAGER_STATE.GEOMETRY_DELIVER); assert.equal(s.uiGeometryStep, step);
      Object.assign(s.stRobotStatus, { xDone: true, xBusy: false });
      if (targets[step] !== null) s.stRobotStatus.eCurrentPoint = targets[step];
      if (step === 3) Object.assign(s.stRobotStatus, { xGripper2Open: true, xDetailAvailable: false });
      route(s); assert.equal(s.eState, E_CELL_MANAGER_STATE.GEOMETRY_RELEASE_COMMAND); route(s); assert.equal(s.uiGeometryStep, step);
      s.stRobotStatus.xDone = false; route(s); assert.equal(s.uiGeometryStep, step + 1);
      assert.equal(signals.xReleased, false);
      assert.equal(signals.xDeposited, step >= 3);
    }
    route(s);
    assert.equal(signals.xReleased, true); assert.equal(signals.xRobotInteraction, false); assert.equal(s.xGeometryHeld, false);
    assert.equal(s.GVL_GEOMETRY_CONTROL.uiLastStation, stationId);
  }
});
test('a free GK appearing during parking waits for the issued move and Done release', () => {
  const { route, s } = geometryRoute(); const e = s.E_CELL_MANAGER_STATE;
  s.eState = e.GEOMETRY_WAIT_FREE; s.stRobotStatus.xBusy = true; s.F_GEOMETRY_SELECT_STATION = () => 2;
  route(s); assert.equal(s.eState, e.GEOMETRY_WAIT_FREE); assert.equal(s.Command.stRobot.eSetPoint, s.E_POINT_NAME.GEOMETRY_1_SAFE);
  s.stRobotStatus.xDone = true; route(s); assert.equal(s.eState, e.GEOMETRY_RELEASE_COMMAND);
  route(s); assert.equal(s.eState, e.GEOMETRY_RELEASE_COMMAND);
  Object.assign(s.stRobotStatus, { xBusy: false, xDone: false }); route(s); route(s);
  assert.equal(s.eState, e.PLAN_TARGET); assert.equal(s.uiGeometryStep, 0);
});
test('failure or disable before entering GK releases the reservation and keeps the part for replanning', () => {
  for (const status of [{ xError: true }, { xEnabled: false }, { xReserved: false, xReady: false }]) {
    const { route, s } = geometryRoute(); Object.assign(s.GVL_GEOMETRY_CONTROL.astStatus[1], status); route(s);
    assert.equal(s.eState, s.E_CELL_MANAGER_STATE.PLAN_TARGET); assert.equal(s.xGeometryHeld, true);
    assert.equal(s.GVL_GEOMETRY_CONTROL.astSignals[1].xReserve, false); assert.equal(s.GVL_GEOMETRY_CONTROL.astSignals[1].xReleased, true);
    assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[2].uiState, 2); assert.equal(s.GVL_GEOMETRY_CONTROL.astCalls[2].uiStation, 0);
  }
});
test('failure or lost reservation during robot interaction latches robot recovery instead of replanning', () => {
  for (const status of [{ xError: true }, { xReserved: false, xReady: false }]) {
    const { route, s } = geometryRoute(); Object.assign(s.GVL_GEOMETRY_CONTROL.astStatus[1], status);
    s.GVL_GEOMETRY_CONTROL.astSignals[1].xRobotInteraction = true; route(s);
    assert.equal(s.eState, s.E_CELL_MANAGER_STATE.ERROR); assert.equal(s.xSafetyHomeRequired, true);
    assert.equal(s.uiGeometryStation, 1); assert.equal(s.Error.dwErrorActive, s.ERR_ROBOT);
  }
});

test('safe Home recovery keeps a held call, while manual removal interrupts only an undelivered call', () => {
  const source = readPlc('FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st');
  const start = source.indexOf('// После аварии контекст снимается');
  const run = compileSt('// --- BEGIN IMPLEMENTATION ---\n' + source.slice(start, source.indexOf('Command.stRobot.xStop :=', start)));
  const make = () => { const { s } = geometryRoute(); s.xRunning = false; s.eState = s.E_CELL_MANAGER_STATE.IDLE; s.stRobotStatus.eCurrentPoint = s.E_POINT_NAME.HOME_SAFETY; return s; };
  const held = make(); run(held);
  assert.equal(held.xGeometryHeld, true); assert.equal(held.GVL_GEOMETRY_CONTROL.astCalls[2].uiState, 2); assert.equal(held.GVL_GEOMETRY_CONTROL.astCalls[2].uiStation, 0);
  assert.equal(held.GVL_GEOMETRY_CONTROL.astSignals[1].xRobotInteraction, false); assert.equal(held.uiGeometryStation, 0);
  for (const stationId of [0, 1]) {
    const removed = make(); removed.uiGeometryStation = stationId; removed.stRobotStatus.xDetailAvailable = false; run(removed);
    assert.equal(removed.GVL_GEOMETRY_CONTROL.astCalls[2].uiState, 7); assert.equal(removed.xGeometryHeld, false);
  }
  const stored = make(); stored.stRobotStatus.xDetailAvailable = false; stored.GVL_GEOMETRY_CONTROL.astCalls[2].uiState = 4; run(stored);
  assert.equal(stored.GVL_GEOMETRY_CONTROL.astCalls[2].uiState, 4);
});
