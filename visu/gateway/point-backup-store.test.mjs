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
  assert.equal(value.points.length, 2);
  assert.equal(value.points[0].configured, true);
  assert.equal(value.exportedAt, '2026-09-01T10:00:00.000Z');
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
