import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { POINT_BACKUP_VERSION, POINT_EDITOR_COUNT, POINT_EDITOR_IDS, PointBackupStoreError, validatePointBackup } from './point-backup-store.mjs';

const source = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('const calibrationMagazineForPoint ='), source.indexOf('const pointEditorChannel ='));
const preparedStart = source.indexOf('async function executeCommandPrepared(');
const prepared = source.slice(preparedStart, source.indexOf('async function executeCommand(message)', preparedStart));
const labelsStart = source.indexOf('const pointBackupLabels =');
const labels = source.slice(labelsStart, source.indexOf('];', labelsStart) + 2);
const DataType = Object.fromEntries(['UInt16', 'UInt32', 'Double'].map(type => [type, type]));

function gateway(latestValues = { 'astMagazineCalibrationStatus[1].uiMethod': 3, 'astMagazineCalibrationStatus[2].uiMethod': 1 }) {
  const writes = [];
  let sequence = 0;
  const execute = runInNewContext(`${labels}\n${helpers}\n${prepared}\nexecuteCommandPrepared`, {
    latestValues, POINT_EDITOR_COUNT, DataType,
    nextPointEditorSequence: () => ++sequence, pendingPointEditorAudits: new Map(),
    writeValue: async (path, type, value) => { writes.push([path, type, value]); },
    pulseValue: async path => { writes.push([path, 'pulse', ++sequence]); return sequence; },
  });
  return { execute, writes, latestValues, sequence: () => sequence };
}

test('actual gateway sends calibration manual point codes with their complete payload before Execute', async () => {
  for (const point of [23, 24, 25, 26, 27, 28]) {
    const g = gateway();
    const message = { command: 'robot.action', action: 1, point, slot: 0, magazine: 0 };
    await g.execute(message);
    assert.deepEqual(g.writes, [
      ['uiRobotManualAction', 'UInt16', 1], ['uiRobotManualPoint', 'UInt16', point],
      ['uiRobotManualSlot', 'UInt16', 0], ['uiRobotManualMagazine', 'UInt16', 0],
      ['xRobotManualExecute', 'pulse', 1],
    ]);
    assert.equal(message._plcReceipt.path, 'xRobotManualExecute');
    assert.equal(message._plcReceipt.sequence, 1);
  }
  const g = gateway();
  await assert.rejects(g.execute({ command: 'robot.action', action: 1, point: 29 }), /существующую точку/);
  assert.equal(g.writes.length, 0);
});

test('actual gateway CAPTURE and SAVE include the expected method before publishing CommandSeq', async () => {
  for (const [command, index, code] of [['robot.point.capture', 15, 1], ['robot.point.save', 16, 2]]) {
    const g = gateway();
    await g.execute({ command, index, speedFactor: .5, draft: { x: 1, y: 2, z: 3, speedFactor: .5 } });
    assert.ok(g.writes.some(([path, , value]) => path === 'uiPointEditorCalibrationMethod' && value === 3));
    assert.deepEqual(g.writes.slice(-2), [['uiPointEditorCommand', 'UInt16', code], ['udiPointEditorCommandSeq', 'UInt32', 1]]);
  }
});

test('actual gateway invalidates a magazine in one transaction and preserves the import expected method', async () => {
  const g = gateway({ 'astMagazineCalibrationStatus[1].uiMethod': 1 });
  await g.execute({ command: 'robot.point.invalidateMagazine', index: 11, calibrationMethod: 3 });
  assert.deepEqual(g.writes, [
    ['uiPointEditorIndex', 'UInt16', 11], ['uiPointEditorCalibrationMethod', 'UInt16', 3],
    ['uiPointEditorCommand', 'UInt16', 4], ['udiPointEditorCommandSeq', 'UInt32', 1],
  ]);
});

test('invalid invalidation index or absent calibration method fails before allocating a transaction', async () => {
  for (const message of [{ command: 'robot.point.invalidateMagazine', index: 15 },
    { command: 'robot.point.invalidateMagazine', index: 11, calibrationMethod: 2 },
    { command: 'robot.point.save', index: 15, draft: { x: 1, y: 2, z: 3, speedFactor: .5 } }]) {
    const g = gateway({});
    await assert.rejects(g.execute(message));
    assert.deepEqual(g.writes, []);
    assert.equal(g.sequence(), 0);
  }
});

test('version three export takes each method and its points from the same magazine status snapshot', () => {
  const values = { MagazineRows: 12, MagazineColumns: 8,
    'astMagazineCalibrationStatus[1].uiMethod': 1, 'astMagazineCalibrationStatus[2].uiMethod': 3 };
  for (const [offset, pointId] of POINT_EDITOR_IDS.entries()) {
    const index = offset + 1;
    values[`auiPointEditorPointId[${index}]`] = pointId;
    for (const [field, value] of Object.entries({ X: 999, Y: 999, Z: 999, MagazineSafeZ: -30, MagazineChangeZ: -60, SpeedFactor: .5, xConfigured: true })) {
      values[`astPointEditorPoints[${index}].${field}`] = value;
    }
  }
  for (const magazine of [1, 2]) for (const point of [1, 2, 3]) {
    for (const [field, value] of Object.entries({ X: 100 * magazine + point, Y: 200, Z: 300,
      MagazineSafeZ: point === 1 ? -30 : 0, MagazineChangeZ: point === 1 ? -60 : 0,
      SpeedFactor: .5, xConfigured: magazine === 2 })) {
      values[`astMagazineCalibrationStatus[${magazine}].astPoints[${point}].${field}`] = value;
    }
  }
  const backupStart = source.indexOf('function currentPointBackup(');
  const backupEnd = source.indexOf('async function fallbackTestCleanup', backupStart);
  const exportCurrent = runInNewContext(`${labels}\n${helpers}\n${source.slice(backupStart, backupEnd)}\ncurrentPointBackup`, {
    latestValues: values, POINT_EDITOR_COUNT, POINT_BACKUP_VERSION, PointBackupStoreError, connectionState: { status: 'connected' },
  });
  const document = validatePointBackup(exportCurrent({ id: 1, username: 'tester', displayName: 'Tester' }));
  assert.equal(document.version, 3);
  assert.deepEqual(document.magazineCalibrationMethods, [1, 3]);
  assert.equal(document.points.find(point => point.index === 11).configured, false);
  assert.equal(document.points.find(point => point.index === 11).x, 101);
  assert.equal(document.points.find(point => point.index === 17).x, 202);
  assert.equal(document.points.find(point => point.index === 18).label, 'Магазин 2 — C · слот 89');
  assert.equal(document.points[0].x, 999);
});
