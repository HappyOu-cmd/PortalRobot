import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PointBackupStore, PointBackupStoreError, validatePointBackup } from './point-backup-store.mjs';

const backup = () => ({
  format: 'portal-robot-points', version: 1, exportedAt: '2026-09-01T10:00:00.000Z',
  points: [
    { index: 1, pointId: 1, label: 'Станок 1 — над станком', x: 10, y: 20, z: 30, speedFactor: 0.5, configured: true },
    { index: 2, pointId: 3, label: 'Станок 1 — подход', x: 11, y: 21, z: 31, speedFactor: 0, configured: false },
  ],
});

test('validates and normalizes a point backup', () => {
  const value = validatePointBackup(backup());
  assert.equal(value.points.length, 4);
  assert.equal(value.version, 2);
  assert.equal(value.points[0].configured, true);
  assert.equal(value.points[0].magazineSafeZ, 0);
  assert.equal(value.points[0].magazineChangeZ, 0);
  assert.equal(value.exportedAt, '2026-09-01T10:00:00.000Z');
});

test('migrates legacy magazine points with zero offsets and preserves new values', () => {
  const legacy = backup();
  legacy.points.push({
    index: 11, pointId: 22, label: 'Магазин 1 — базовая точка детали',
    x: 100, y: 200, z: 300, speedFactor: 0.5, configured: true,
  });
  const migrated = validatePointBackup(legacy);
  assert.equal(migrated.points[2].magazineSafeZ, 0);
  assert.equal(migrated.points[2].magazineChangeZ, 0);

  legacy.points[2].magazineSafeZ = -300;
  legacy.points[2].magazineChangeZ = -100;
  const current = validatePointBackup(legacy);
  assert.equal(current.points[2].magazineSafeZ, -300);
  assert.equal(current.points[2].magazineChangeZ, -100);
});

test('rejects duplicate point ids and unsafe speed factors', () => {
  const duplicate = backup();
  duplicate.points[1].pointId = 1;
  assert.throws(() => validatePointBackup(duplicate), PointBackupStoreError);
  const speed = backup();
  speed.points[0].speedFactor = 1.5;
  assert.throws(() => validatePointBackup(speed), /скорость/);
});

test('writes atomically, lists metadata and reads parsed points', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'portal-point-backups-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(directory, { recursive: true, force: true });
  });
  const store = new PointBackupStore(directory);
  const saved = await store.save(backup(), 'Наладка станков');
  assert.match(saved.id, /^portal-points-/);
  assert.equal(saved.configuredCount, 1);
  assert.deepEqual((await store.list()).map((item) => item.id), [saved.id]);
  assert.equal((await store.read(saved.id)).points[0].x, 10);
});

test('migrates all twelve legacy points without changing their values or configuring GK', () => {
  const legacy = { ...backup(), points: [1, 3, 4, 5, 7, 8, 9, 11, 12, 17, 22, 23].map((pointId, offset) => ({
    index: offset + 1, pointId, label: `Point ${offset + 1}`, x: offset + 100, y: -offset, z: 500,
    magazineSafeZ: offset >= 10 ? -300 : 0, magazineChangeZ: offset >= 10 ? -100 : 0, speedFactor: .5, configured: true,
  })) };
  const original = structuredClone(legacy);
  const migrated = validatePointBackup(legacy);
  assert.deepEqual(legacy, original);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.points.length, 14);
  assert.deepEqual(migrated.points.slice(0, 12), legacy.points);
  assert.deepEqual(migrated.points.slice(12).map(p => [p.index, p.pointId, p.configured]), [[13, 24, false], [14, 27, false]]);
});

test('version two roundtrips configured GK bases including SAFE_Z and minimum speed', () => {
  const document = validatePointBackup(backup());
  for (const point of document.points.filter(p => p.index >= 13)) Object.assign(point, { x: 100, y: 200, z: 500, magazineSafeZ: -300, speedFactor: .1, configured: true });
  assert.deepEqual(validatePointBackup(document), document);
});

test('rejects mismatched GK identity and unsafe SAFE_Z in version two', () => {
  const document = validatePointBackup(backup());
  const point = document.points.find(p => p.index === 13);
  point.pointId = 25;
  assert.throws(() => validatePointBackup(document), /PointId/);
  point.pointId = 24;
  Object.assign(point, { speedFactor: .2, configured: true, magazineSafeZ: 0 });
  assert.throws(() => validatePointBackup(document), /SAFE_Z/);
});

test('does not accept traversal, oversized files or symbolic links', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'portal-point-backups-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(directory, { recursive: true, force: true });
  });
  const store = new PointBackupStore(directory);
  await mkdir(directory, { recursive: true });
  await assert.rejects(() => store.read('../outside.json'), /идентификатор/);
  await writeFile(join(directory, 'too-large.json'), 'x'.repeat(256 * 1024 + 1));
  await assert.rejects(() => store.read('too-large.json'), /размер/);
  const target = join(directory, 'target.json');
  await writeFile(target, JSON.stringify(backup()));
  try {
    await symlink(target, join(directory, 'link.json'));
    await assert.rejects(() => store.read('link.json'), /обычные JSON-файлы/);
  } catch (error) {
    if (error?.code !== 'EPERM') throw error;
  }
});
