import assert from 'node:assert/strict';
import test from 'node:test';
import { createGeometrySnapshot, GeometryBeltAnimation, mapGeometrySnapshot } from '../src/model/geometryControl.ts';
import { currentRobotPointLabel, robotActionCommand } from '../src/components/robotManualControl.ts';

test('partial OPC UA updates preserve each independent station and permissions are taken from PLC', () => {
  const initial = createGeometrySnapshot();
  const first = mapGeometrySnapshot({ xGeometrySupported: true, 'astGeometryStatus[1].xEnabled': true, 'astGeometryStatus[1].xManualStartAllowed': false, 'astGeometryStatus[2].uiProductType': 3, 'auiGeometryPeriod[2]': 50, tGeometryResetPulse: 1500 }, initial);
  const next = mapGeometrySnapshot({ 'astGeometryStatus[2].xDriveRunning': true }, first);
  assert.equal(next.available, true); assert.equal(next.stations[0].enabled, true); assert.equal(next.stations[0].manualStartAllowed, false); assert.equal(next.stations[1].running, true); assert.equal(next.stations[1].productType, 3); assert.equal(next.periods[1], 50); assert.equal(next.resetSeconds, 1.5);
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
