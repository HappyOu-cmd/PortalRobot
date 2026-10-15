import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createGeometrySnapshot, geometryOverviewStatus, geometryPartPosition, geometryReadinessConditions, GeometryBeltAnimation, mapGeometrySnapshot } from '../src/model/geometryControl.ts';
import { currentRobotPointLabel, robotActionCommand } from '../src/components/robotManualControl.ts';
import { createWarningGlow, updateWarningGlow } from '../src/three/warningGlow.ts';

test('monitoring belt follows confirmed placement, transport, end detection and removal', () => {
  const empty = { ...createGeometrySnapshot().stations[0], state: 1, enabled: true, ready: true };
  assert.equal(geometryPartPosition(empty, true), 'empty');
  const reserved = { ...empty, state: 2, reserved: true, occupied: true, ready: false, partId: 42, machine: 2, productType: 3 };
  assert.equal(geometryPartPosition(reserved, true), 'empty', 'a reservation is not a confirmed deposit');
  const deposited = { ...reserved, partStored: true };
  assert.equal(geometryPartPosition(deposited, true), 'placed');
  const moving = { ...deposited, state: 3, reserved: false, running: true };
  assert.equal(geometryPartPosition(moving, true), 'conveying');
  const atEnd = { ...moving, state: 4, running: false, partAtEnd: true };
  assert.equal(geometryPartPosition(atEnd, true), 'operator');
  assert.equal(geometryPartPosition({ ...atEnd, partAtEnd: false }, true), 'operator', 'keep the operator stage until PLC confirms removal');
  assert.equal(geometryPartPosition({ ...empty, partStored: false, partId: 0 }, true), 'empty');
});

test('monitoring belt uses fixed stages and never invents a position during recovery or lost telemetry', () => {
  const stored = { ...createGeometrySnapshot().stations[0], partStored: true, occupied: true, partId: 42 };
  for (const travel of [0, .01, .5, .95, 1]) {
    assert.equal(geometryPartPosition({ ...stored, state: 3, running: true, travel }, true), 'conveying');
  }
  assert.equal(geometryPartPosition({ ...stored, state: 3, running: false }, true), 'conveying', 'a stopped conveyor remains in the transport stage');
  for (const changes of [{ state: 6, error: true }, { state: 5, recoveryRequired: true },
    { state: 2, reserved: true, recoveryRequired: true }, { state: 0 }, { state: 7 }]) {
    assert.equal(geometryPartPosition({ ...stored, ...changes }, true), 'unknown');
  }
  assert.equal(geometryPartPosition({ ...stored, state: 6, error: true, partAtEnd: true }, true), 'operator', 'the end sensor remains a physical position confirmation');
  assert.equal(geometryPartPosition({ ...stored, state: 4, partAtEnd: true }, false), 'unknown');
  assert.equal(geometryPartPosition(undefined, true), 'unknown');
  assert.equal(geometryPartPosition({ ...createGeometrySnapshot().stations[0], occupied: true }, true), 'unknown');
  assert.equal(geometryPartPosition({ ...createGeometrySnapshot().stations[0], recoveryRequired: true }, true), 'unknown');
});

test('monitoring GK summaries ignore unavailable data and preserve shared fault and recovery statuses', () => {
  const snapshot = createGeometrySnapshot();
  snapshot.stations[0] = { ...snapshot.stations[0], state: 1, ready: true, enabled: true };
  assert.deepEqual(geometryOverviewStatus(snapshot, 0, true), { text: 'Нет данных', tone: 'gray' });
  snapshot.available = true;
  assert.deepEqual(geometryOverviewStatus(snapshot, 0, true), { text: 'Недоступен', tone: 'gray' });
  snapshot.supported = true;
  assert.deepEqual(geometryOverviewStatus(snapshot, 0, true), { text: 'Свободен', tone: 'green' });
  snapshot.stations[0].recoveryRequired = true;
  assert.deepEqual(geometryOverviewStatus(snapshot, 0, true), { text: 'Указать состояние ГК', tone: 'amber' });
  snapshot.stations[0].error = true;
  assert.deepEqual(geometryOverviewStatus(snapshot, 0, true), { text: 'Авария', tone: 'red' });
  assert.deepEqual(geometryOverviewStatus(snapshot, 0, false), { text: 'Нет данных', tone: 'gray' });
  assert.deepEqual(geometryOverviewStatus(undefined, 0, true), { text: 'Нет данных', tone: 'gray' });
  assert.deepEqual(geometryOverviewStatus(snapshot, 2, true), { text: 'Нет данных', tone: 'gray' });
});

test('partial OPC UA updates preserve each independent station and permissions are taken from PLC', () => {
  const initial = createGeometrySnapshot();
  const first = mapGeometrySnapshot({ xGeometrySupported: true, 'astGeometryStatus[1].xEnabled': true, 'astGeometryStatus[1].xManualStartAllowed': false, 'astGeometryStatus[2].uiProductType': 3, 'auiGeometryPeriod[2]': 50, tGeometryResetPulse: 1500 }, initial);
  const next = mapGeometrySnapshot({ 'astGeometryStatus[2].xDriveRunning': true }, first);
  assert.equal(next.available, true); assert.equal(next.stations[0].enabled, true); assert.equal(next.stations[0].manualStartAllowed, false); assert.equal(next.stations[1].running, true); assert.equal(next.stations[1].productType, 3); assert.equal(next.periods[1], 50); assert.equal(next.resetSeconds, 1.5);
});

test('pending disable follows PLC updates independently for both GK and preserves fault priority', () => {
  for (const stationId of [1, 2]) {
    const root = `astGeometryStatus[${stationId}]`;
    const first = mapGeometrySnapshot({ xGeometrySupported: true, [`${root}.uiState`]: 2,
      [`${root}.xEnabled`]: true, [`${root}.xDisablePending`]: true, [`${root}.xDisableAllowed`]: true });
    const next = mapGeometrySnapshot({ [`astGeometryStatus[${3 - stationId}].xEnabled`]: true }, first);
    assert.equal(next.stations[stationId - 1].disablePending, true);
    assert.equal(next.stations[2 - stationId].disablePending, false);
    assert.equal(next.stations[stationId - 1].disableAllowed, true);
    assert.deepEqual(geometryOverviewStatus(next, stationId - 1, true), { text: 'Выключение после доставки', tone: 'amber' });
    assert.deepEqual(geometryOverviewStatus(next, stationId - 1, false), { text: 'Нет данных', tone: 'gray' });
    const fault = mapGeometrySnapshot({ [`${root}.xError`]: true }, next);
    assert.deepEqual(geometryOverviewStatus(fault, stationId - 1, true), { text: 'Авария', tone: 'red' });
    const done = mapGeometrySnapshot({ [`${root}.xDisablePending`]: false, [`${root}.xEnabled`]: false,
      [`${root}.uiState`]: 0 }, next);
    assert.equal(done.stations[stationId - 1].disablePending, false);
    assert.deepEqual(geometryOverviewStatus(done, stationId - 1, true), { text: 'Выключен', tone: 'gray' });
  }
});
test('recovery requirement is independent of enabled, alarm, confirmation prompt and point writing', () => {
  const first = mapGeometrySnapshot({ 'astGeometryStatus[1].xRecoveryRequired': true,
    'astGeometryStatus[1].xPointWriteAllowed': true, 'astGeometryStatus[1].xEnabled': false,
    'astGeometryStatus[1].xConfirmationActive': false, 'astGeometryStatus[1].uiState': 6 });
  const next = mapGeometrySnapshot({ 'astGeometryStatus[2].xEnabled': true }, first);
  assert.equal(next.stations[0].recoveryRequired, true);
  assert.equal(next.stations[0].pointWriteAllowed, true);
  assert.equal(next.stations[0].confirmationActive, false);
  assert.equal(next.stations[0].enabled, false);
  const confirmed = mapGeometrySnapshot({ 'astGeometryStatus[1].xRecoveryRequired': false }, next);
  assert.equal(confirmed.stations[0].recoveryRequired, false);
  assert.equal(confirmed.stations[0].pointWriteAllowed, true);
  assert.equal(confirmed.stations[0].enabled, false);
});

test('readiness reasons follow PLC masks and preserve independent stations across partial updates', () => {
  const first = mapGeometrySnapshot({ 'astGeometryStatus[1].dwEnableBlockers': 32 | 64,
    'astGeometryStatus[1].dwConfirmBlockers': 64 | 32768, 'astGeometryStatus[1].xRecoveryRequired': true,
    'astGeometryStatus[2].dwEnableBlockers': 0, 'astGeometryStatus[2].dwConfirmBlockers': 16384 });
  const next = mapGeometrySnapshot({ 'astGeometryStatus[2].xDriveRunning': true }, first);
  assert.equal(next.stations[0].enableBlockers, 96); assert.equal(next.stations[0].confirmBlockers, 32832);
  assert.deepEqual(geometryReadinessConditions(next.stations[0], true).filter(c => !c.ready).map(c => c.key), ['point', 'robot', 'recovery']);
  assert.deepEqual(geometryReadinessConditions(next.stations[0], true, 'confirm').filter(c => !c.ready).map(c => c.key), ['robot', 'sensor']);
  // HMI не пересчитывает условия по Running или состоянию ячейки.
  assert.ok(geometryReadinessConditions(next.stations[1], true).every(c => c.ready));
  const clear = mapGeometrySnapshot({ 'astGeometryStatus[1].dwEnableBlockers': 0, 'astGeometryStatus[1].xRecoveryRequired': false }, next);
  assert.ok(geometryReadinessConditions(clear.stations[0], true).every(c => c.ready));
  assert.equal(clear.stations[1].confirmBlockers, 16384);
});

test('missing, invalid and disconnected PLC diagnostics never show fabricated completed conditions', () => {
  const empty = createGeometrySnapshot();
  assert.equal(empty.stations[0].enableBlockers, null); assert.equal(empty.stations[0].confirmBlockers, null);
  assert.deepEqual(geometryReadinessConditions(empty.stations[0], true).map(c => [c.key, c.ready]), [['data', false]]);
  const known = mapGeometrySnapshot({ 'astGeometryStatus[1].dwEnableBlockers': 0, 'astGeometryStatus[1].dwConfirmBlockers': 0 });
  assert.deepEqual(geometryReadinessConditions(known.stations[0], false).map(c => [c.key, c.ready]), [['connection', false]]);
  for (const value of [-1, 0x100000000, NaN, null]) {
    const invalid = mapGeometrySnapshot({ 'astGeometryStatus[1].dwEnableBlockers': value }, known);
    assert.equal(invalid.stations[0].enableBlockers, null);
  }
});

test('each published control reason appears in the readiness list and confirmation checks configuration only when enabling', () => {
  for (const [mask, key] of [[1, 'hardware'], [2, 'hmi'], [4, 'safety'], [8, 'io'], [16, 'alarm'], [32, 'point'],
    [64, 'robot'], [128, 'reservation'], [256, 'drive'], [512, 'manual'], [1024, 'reset'], [2048, 'disable'], [8192, 'transport']] as const) {
    const s = { ...createGeometrySnapshot().stations[0], enableBlockers: mask, confirmBlockers: mask, confirmationActive: true };
    assert.deepEqual(geometryReadinessConditions(s, true).filter(c => !c.ready).map(c => c.key), [key, 'recovery']);
    assert.deepEqual(geometryReadinessConditions(s, true, 'confirm').filter(c => !c.ready).map(c => c.key), [key]);
  }
  const standalone = { ...createGeometrySnapshot().stations[0], confirmBlockers: 0, configured: false };
  assert.ok(!geometryReadinessConditions(standalone, true, 'confirm').some(c => c.key === 'point'));
});
test('3D belt follows running feedback while part position follows telemetry and does not move when stopped', () => {
  const a = new GeometryBeltAnimation(), station = { ...createGeometrySnapshot().stations[0], partStored: true, partId: 3, productType: 2, travel: .4, running: true };
  const first = a.update(station, .1, .5); assert.equal(first.sample, .6); assert.equal(first.productType, 2); assert.equal(first.beltTravel, -.05);
  const faster = a.update(station, .1, 1); assert.equal(faster.sample, .6); assert.ok(faster.beltTravel < first.beltTravel);
  station.running = false; station.partAtEnd = true; const stopped = a.update(station, .1, 2); assert.equal(stopped.beltTravel, faster.beltTravel); assert.equal(stopped.sample, 0);
  station.partStored = false; assert.equal(a.update(station, .1, .5).sample, null);
  const missing = a.update(undefined, .1, 2); assert.equal(missing.sample, null); assert.equal(missing.beltTravel, stopped.beltTravel);
});
test('GK manual point codes have real PLC enum labels and do not include magazine slot payload', () => {
  assert.match(currentRobotPointLabel(24), /ГК 1.*базовая/); assert.match(currentRobotPointLabel(28), /ГК 2.*безопасный/);
  for (let point = 17; point <= 22; point++) assert.deepEqual(robotActionCommand(1, point, 96, 2), { command: 'robot.action', action: 1, point, slot: 0, magazine: 0 });
});

test('waiting warning and configurable timer follow partial PLC snapshots independently of belt motion', () => {
  const initial = createGeometrySnapshot(); assert.equal(initial.waitWarningSeconds, 180);
  const first = mapGeometrySnapshot({ tGeometryWaitWarningTimeout: 300000, 'astGeometryStatus[1].xCallWaitWarning': true }, initial);
  const next = mapGeometrySnapshot({ 'astGeometryStatus[2].xDriveRunning': true }, first);
  assert.equal(next.waitWarningSeconds, 300); assert.equal(next.stations[0].callWaitWarning, true);
  assert.equal(next.stations[0].running, false); assert.equal(next.stations[1].callWaitWarning, false);
  const cleared = mapGeometrySnapshot({ 'astGeometryStatus[1].xCallWaitWarning': false }, next);
  assert.equal(cleared.stations[0].callWaitWarning, false); assert.equal(cleared.waitWarningSeconds, 300);
});

test('conveyor warning pulses while stopped and returns to normal immediately after reset or missing data', () => {
  const animation = new GeometryBeltAnimation(), station = { ...createGeometrySnapshot().stations[0], callWaitWarning: true };
  const first = animation.update(station, 0.1, 0), second = animation.update(station, 0.1, 0);
  assert.ok(first.warningPulse > 0 && first.warningPulse !== second.warningPulse);
  assert.equal(second.beltTravel, 0); assert.equal(second.sample, null);
  station.callWaitWarning = false; assert.equal(animation.update(station, 0.1, 0).warningPulse, 0);
  assert.equal(animation.update(undefined, 0.1, 0).warningPulse, 0);
});

test('warning color completes an orange-amber-orange cycle in two seconds independently of belt movement', () => {
  const animation = new GeometryBeltAnimation(), station = { ...createGeometrySnapshot().stations[0], callWaitWarning: true };
  const start = animation.update(station, 0, 0);
  const frames = Array.from({ length: 20 }, () => animation.update(station, 0.1, 0));
  assert.equal(start.warningPulse, 1);
  assert.ok(Math.abs(frames[9].warningPulse - 0.35) < 1e-6);
  assert.ok(Math.abs(frames[19].warningPulse - 1) < 1e-6);
  assert.ok(frames.every(frame => frame.beltTravel === 0 && frame.sample === null));
  for (let i = 0; i < 20; i++) assert.equal(animation.update(station, 0.1, 0, true).warningPulse, 1);
  station.callWaitWarning = false;
  assert.equal(animation.update(station, 0.1, 0, true).warningPulse, 0);
});

test('warning halo changes hue and extent with its pulse, restores original surfaces and leaves other nodes alone', () => {
  const surface = new THREE.MeshStandardMaterial({ color: 0x087fcf, emissive: 0x123456, emissiveIntensity: 0.23 });
  const otherSurface = new THREE.MeshStandardMaterial({ color: 0x087fcf });
  const glow = createWarningGlow([2, 0.1, 0.14], [surface]);
  const other = createWarningGlow([2, 0.1, 0.14], [otherSurface]);
  const originalColor = surface.color.clone(), originalEmissive = surface.emissive.clone();
  updateWarningGlow(glow, 1);
  assert.equal(glow.root.visible, true); assert.equal(surface.color.getHex(), 0xff6500);
  assert.equal(glow.root.children.length, 6);
  for (const face of glow.root.children as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[]) {
    assert.equal(face.material.uniforms.pulse.value, 1);
    assert.ok(face.material.uniforms.size.value.x > face.material.uniforms.halfCore.value.x * 2);
    assert.ok(face.material.uniforms.size.value.y > face.material.uniforms.halfCore.value.y * 2);
    assert.equal(face.material.depthWrite, false);
    assert.equal(face.castShadow, false);
  }
  const brightIntensity = surface.emissiveIntensity;
  updateWarningGlow(glow, 0.35);
  assert.equal(surface.color.getHex(), 0xff9900); assert.ok(surface.emissiveIntensity < brightIntensity);
  assert.equal(other.root.visible, false); assert.equal(otherSurface.color.getHex(), 0x087fcf);
  assert.deepEqual(new THREE.Raycaster(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)).intersectObject(glow.root, true), []);
  updateWarningGlow(glow, 0);
  assert.equal(glow.root.visible, false); assert.ok(surface.color.equals(originalColor));
  assert.ok(surface.emissive.equals(originalEmissive)); assert.equal(surface.emissiveIntensity, 0.23);
  for (const rig of [glow, other]) rig.root.traverse(object => {
    if (object instanceof THREE.Mesh) { object.geometry.dispose(); object.material.dispose(); }
  });
  surface.dispose(); otherSurface.dispose();
});
