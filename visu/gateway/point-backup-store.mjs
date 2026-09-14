import { randomUUID } from 'node:crypto';
import { mkdir, lstat, readFile, readdir, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path';

export const POINT_BACKUP_FORMAT = 'portal-robot-points';
export const POINT_BACKUP_VERSION = 1;
export const POINT_BACKUP_MAX_BYTES = 256 * 1024;

export class PointBackupStoreError extends Error {
  constructor(message, status = 400, code = 'POINT_BACKUP_ERROR') {
    super(message);
    this.name = 'PointBackupStoreError';
    this.status = status;
    this.code = code;
  }
}

const safeFileId = (value) => {
  const id = String(value ?? '');
  if (!id || id !== basename(id) || id.includes('..') || !/^[\p{L}\p{N}_.-]+\.json$/u.test(id)) {
    throw new PointBackupStoreError('Некорректный идентификатор резервной копии', 400, 'POINT_BACKUP_ID_INVALID');
  }
  return id;
};

const safeLabel = (value) => {
  const label = String(value ?? '').normalize('NFKC').trim().slice(0, 48);
  return label
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'points';
};

const finiteNumber = (value, field, point) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new PointBackupStoreError(`Точка ${point}: поле ${field} не является числом`, 400, 'POINT_BACKUP_SCHEMA_INVALID');
  }
  return number;
};

export function validatePointBackup(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PointBackupStoreError('Резервная копия должна быть JSON-объектом', 400, 'POINT_BACKUP_SCHEMA_INVALID');
  }
  if (value.format !== POINT_BACKUP_FORMAT || Number(value.version) !== POINT_BACKUP_VERSION) {
    throw new PointBackupStoreError('Неподдерживаемый формат резервной копии точек', 400, 'POINT_BACKUP_VERSION_UNSUPPORTED');
  }
  const exportedAtMs = Date.parse(String(value.exportedAt ?? ''));
  if (!Number.isFinite(exportedAtMs)) {
    throw new PointBackupStoreError('В резервной копии отсутствует корректная дата экспорта', 400, 'POINT_BACKUP_SCHEMA_INVALID');
  }
  if (!Array.isArray(value.points) || value.points.length < 1 || value.points.length > 12) {
    throw new PointBackupStoreError('Резервная копия должна содержать от 1 до 12 точек', 400, 'POINT_BACKUP_SCHEMA_INVALID');
  }

  const indexes = new Set();
  const pointIds = new Set();
  const points = value.points.map((raw, offset) => {
    const index = Number(raw?.index);
    const pointId = Number(raw?.pointId);
    if (!Number.isInteger(index) || index < 1 || index > 12 || indexes.has(index)) {
      throw new PointBackupStoreError(`Некорректный или повторяющийся индекс точки ${index}`, 400, 'POINT_BACKUP_SCHEMA_INVALID');
    }
    if (!Number.isInteger(pointId) || pointId < 1 || pointIds.has(pointId)) {
      throw new PointBackupStoreError(`Некорректный или повторяющийся PointId ${pointId}`, 400, 'POINT_BACKUP_SCHEMA_INVALID');
    }
    indexes.add(index);
    pointIds.add(pointId);
    const configured = raw.configured === true;
    const speedFactor = finiteNumber(raw.speedFactor, 'speedFactor', index);
    // Версия формата остаётся 1: старые экспорты нельзя ломать. Отсутствующие
    // поля геометрии магазина мигрируют в 0 и после импорта оставляют точку
    // ненастроенной до явного ввода обоих смещений оператором.
    const magazineSafeZ = finiteNumber(raw.magazineSafeZ ?? 0, 'magazineSafeZ', index);
    const magazineChangeZ = finiteNumber(raw.magazineChangeZ ?? 0, 'magazineChangeZ', index);
    if (configured && (speedFactor <= 0.1 || speedFactor > 1)) {
      throw new PointBackupStoreError(`Недопустимая скорость точки ${index}`, 400, 'POINT_BACKUP_SCHEMA_INVALID');
    }
    return {
      index,
      pointId,
      label: String(raw.label ?? `Точка ${offset + 1}`).replace(/[\r\n\t]/g, ' ').trim().slice(0, 120),
      x: finiteNumber(raw.x, 'x', index),
      y: finiteNumber(raw.y, 'y', index),
      z: finiteNumber(raw.z, 'z', index),
      magazineSafeZ,
      magazineChangeZ,
      speedFactor,
      configured,
    };
  }).sort((left, right) => left.index - right.index);

  return {
    format: POINT_BACKUP_FORMAT,
    version: POINT_BACKUP_VERSION,
    exportedAt: new Date(exportedAtMs).toISOString(),
    ...(value.exportedBy && typeof value.exportedBy === 'object' ? {
      exportedBy: {
        id: Number.isInteger(Number(value.exportedBy.id)) ? Number(value.exportedBy.id) : null,
        username: String(value.exportedBy.username ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 64),
        displayName: String(value.exportedBy.displayName ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 80),
      },
    } : {}),
    points,
  };
}

export class PointBackupStore {
  constructor(directory) {
    this.directory = resolve(directory);
  }

  async ensureDirectory() {
    await mkdir(this.directory, { recursive: true });
    return realpath(this.directory);
  }

  async resolveFile(id) {
    const safeId = safeFileId(id);
    const root = await this.ensureDirectory();
    const candidate = join(root, safeId);
    let stat;
    try { stat = await lstat(candidate); }
    catch (error) {
      if (error?.code === 'ENOENT') throw new PointBackupStoreError('Резервная копия не найдена', 404, 'POINT_BACKUP_NOT_FOUND');
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new PointBackupStoreError('Разрешены только обычные JSON-файлы', 400, 'POINT_BACKUP_FILE_INVALID');
    }
    if (stat.size > POINT_BACKUP_MAX_BYTES) {
      throw new PointBackupStoreError('Резервная копия превышает допустимый размер', 413, 'POINT_BACKUP_TOO_LARGE');
    }
    const resolvedFile = await realpath(candidate);
    const fromRoot = relative(root, resolvedFile);
    if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
      throw new PointBackupStoreError('Файл находится вне папки резервных копий', 400, 'POINT_BACKUP_PATH_ESCAPE');
    }
    return { id: safeId, path: resolvedFile, stat };
  }

  async read(id) {
    const file = await this.resolveFile(id);
    let parsed;
    try { parsed = JSON.parse(await readFile(file.path, 'utf8')); }
    catch (error) {
      if (error instanceof SyntaxError) throw new PointBackupStoreError('Резервная копия содержит повреждённый JSON', 400, 'POINT_BACKUP_JSON_INVALID');
      throw error;
    }
    return validatePointBackup(parsed);
  }

  async save(value, label = '') {
    const backup = validatePointBackup(value);
    const root = await this.ensureDirectory();
    const stamp = backup.exportedAt.replace(/[:.]/g, '-');
    const id = `portal-points-${safeLabel(label)}-${stamp}-${randomUUID().slice(0, 8)}.json`;
    const destination = join(root, id);
    const temporary = join(root, `.${id}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(backup, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, destination);
    } catch (error) {
      try { await unlink(temporary); } catch { /* temporary file was not created or was already moved */ }
      throw error;
    }
    return this.describe(id, backup);
  }

  describe(id, backup, stat = null) {
    return {
      id,
      name: id.slice(0, -extname(id).length),
      exportedAt: backup.exportedAt,
      createdAtMs: stat?.mtimeMs ?? Date.parse(backup.exportedAt),
      pointCount: backup.points.length,
      configuredCount: backup.points.filter((point) => point.configured).length,
      valid: true,
      error: null,
    };
  }

  async list() {
    const root = await this.ensureDirectory();
    const entries = await readdir(root, { withFileTypes: true });
    const backups = await Promise.all(entries
      .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && extname(entry.name).toLowerCase() === '.json')
      .map(async (entry) => {
        try {
          const file = await this.resolveFile(entry.name);
          const backup = await this.read(entry.name);
          return this.describe(entry.name, backup, file.stat);
        } catch (error) {
          let stat = null;
          try { stat = await lstat(join(root, entry.name)); } catch { /* file changed during scan */ }
          return {
            id: entry.name,
            name: entry.name.slice(0, -extname(entry.name).length),
            exportedAt: null,
            createdAtMs: stat?.mtimeMs ?? 0,
            pointCount: 0,
            configuredCount: 0,
            valid: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }));
    return backups.sort((left, right) => right.createdAtMs - left.createdAtMs || left.id.localeCompare(right.id, 'ru'));
  }
}
