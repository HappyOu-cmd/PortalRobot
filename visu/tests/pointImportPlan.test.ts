import assert from 'node:assert/strict';
import test from 'node:test';
import { MAGAZINE_EDITOR_POINTS, isMagazinePointActive, magazineEditorPointLabel, planPointImport } from '../src/points/magazineCalibration.ts';
import type { MagazineCalibrationMethod } from '../src/points/magazineCalibration.ts';
import type { PointBackupDocument } from '../src/points/client.ts';

const ids = [1, 3, 4, 5, 7, 8, 9, 11, 12, 17, 22, 23, 24, 27, 30, 31, 32, 33];
function backup(methods: [MagazineCalibrationMethod, MagazineCalibrationMethod] = [1, 1]): PointBackupDocument {
  return { format: 'portal-robot-points', version: 3, exportedAt: '2026-11-02T00:00:00.000Z',
    magazineCalibrationMethods: methods,
    points: ids.map((pointId, offset) => ({ index: offset + 1, pointId, label: `Point ${offset + 1}`,
      x: offset * 10, y: offset * 20, z: 300, magazineSafeZ: -100, magazineChangeZ: -50, speedFactor: .5,
      configured: offset < 14 || methods[offset < 16 ? 0 : 1] === 3 })) };
}

test('one-to-three and three-to-one imports invalidate all magazine points and never overwrite current methods', () => {
  for (const [source, target] of [[1, 3], [3, 1]] as const) {
    const document = backup([source, source]);
    const original = structuredClone(document);
    const steps = planPointImport(document, backup([3, 3]).points, [target, target]);
    assert.deepEqual(steps.slice(0, 2).map(step => [step.command, step.index, step.calibrationMethod]), [
      ['robot.point.invalidateMagazine', 11, target], ['robot.point.invalidateMagazine', 12, target],
    ]);
    assert.ok(steps.slice(2).every(step => ![11, 12, 15, 16, 17, 18].includes(step.index)));
    assert.deepEqual(document, original);
  }
});

test('matching mixed methods import three references for one magazine and only the origin for the other', () => {
  const document = backup([3, 1]);
  const steps = planPointImport(document, document.points, [3, 1]);
  assert.deepEqual(steps.filter(step => step.command === 'robot.point.invalidateMagazine').map(step => step.index), [11, 12]);
  assert.deepEqual(steps.filter(step => step.command === 'robot.point.save' && [11, 12, 15, 16, 17, 18].includes(step.index))
    .map(step => [step.index, step.calibrationMethod]), [[11, 3], [12, 1], [15, 3], [16, 3]]);
});

test('a mismatch in one magazine does not discard the compatible calibration of the other magazine', () => {
  const document = backup([1, 3]);
  const steps = planPointImport(document, backup([3, 3]).points, [3, 3]);
  assert.ok(!steps.some(step => step.command === 'robot.point.save' && [11, 15, 16].includes(step.index)));
  assert.deepEqual(steps.filter(step => step.command === 'robot.point.save' && [12, 17, 18].includes(step.index)).map(step => step.index), [12, 17, 18]);
});

test('partial three-point backups invalidate old references before importing their configured subset', () => {
  const document = backup([3, 3]);
  document.points.find(point => point.index === 15)!.configured = false;
  const steps = planPointImport(document, backup([3, 3]).points, [3, 3]);
  assert.deepEqual(steps.slice(0, 2).map(step => step.command), ['robot.point.invalidateMagazine', 'robot.point.invalidateMagazine']);
  assert.ok(!steps.some(step => step.command === 'robot.point.save' && step.index === 15));
  assert.ok(steps.some(step => step.command === 'robot.point.save' && step.index === 16));
  const configured = new Set(ids.map((_, offset) => offset + 1));
  for (const step of steps) {
    if (step.command === 'robot.point.invalidateMagazine') {
      for (const index of MAGAZINE_EDITOR_POINTS[step.index === 11 ? 0 : 1]) configured.delete(index);
    } else configured.add(step.index);
  }
  assert.equal(configured.has(15), false);
});

test('an all-unconfigured magazine file still clears the complete calibration', () => {
  const document = backup([3, 3]);
  document.points = document.points.filter(point => [11, 15, 16].includes(point.index)).map(point => ({ ...point, configured: false }));
  const steps = planPointImport(document, backup([3, 3]).points, [3, 3]);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].command, 'robot.point.invalidateMagazine');
  assert.equal(steps[0].index, 11);
});

test('partial machine or legacy GK imports do not invalidate unrelated magazines', () => {
  const document = backup();
  document.points = document.points.filter(point => [1, 13, 14].includes(point.index)).map(point => ({ ...point, configured: point.index === 1 }));
  const steps = planPointImport(document, backup().points, [1, 1]);
  assert.deepEqual(steps.map(step => [step.command, step.index]), [['robot.point.save', 1]]);
});

test('the whole import is validated before any command can run', () => {
  const document = backup([3, 3]); document.points[0].x = Number.NaN;
  assert.throws(() => planPointImport(document, backup().points, [3, 3]), /Некорректные/);
});

test('editor reference labels follow the active 12x8 or 12x10 grid and hide unused references', () => {
  assert.equal(magazineEditorPointLabel(15, 12, 8, 3), 'Магазин 1 — B · слот 8');
  assert.equal(magazineEditorPointLabel(16, 12, 8, 3), 'Магазин 1 — C · слот 89');
  assert.equal(magazineEditorPointLabel(18, 12, 10, 3), 'Магазин 2 — C · слот 111');
  assert.equal(ids.filter((_, index) => isMagazinePointActive(index + 1, [1, 1])).length, 14);
  assert.equal(ids.filter((_, index) => isMagazinePointActive(index + 1, [3, 1])).length, 16);
  assert.equal(ids.filter((_, index) => isMagazinePointActive(index + 1, [3, 3])).length, 18);
});
