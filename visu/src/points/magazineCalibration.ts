import type { PlcPointEditorPoint } from '../plc/client';
import type { PlcPointEditorCommand } from '../plc/pointEditorRequests';
import type { PointBackupDocument } from './client';

export type MagazineCalibrationMethod = 1 | 3;
export interface MagazineCalibrationStatus {
  method: MagazineCalibrationMethod;
  changeAllowed: boolean;
  captureAllowed: boolean;
  saveAllowed: boolean;
  referenceCaptureAllowed: boolean;
  referenceSaveAllowed: boolean;
  moveAllowed: [boolean, boolean, boolean];
  ready: boolean;
  reason: number;
}

export const MAGAZINE_EDITOR_POINTS = [[11, 15, 16], [12, 17, 18]] as const;

export function magazineForEditorPoint(index: number): 0 | 1 | 2 {
  if (index === 11 || index === 15 || index === 16) return 1;
  if (index === 12 || index === 17 || index === 18) return 2;
  return 0;
}

export function isMagazinePointActive(index: number, methods: readonly MagazineCalibrationMethod[]) {
  return index < 15 || methods[index < 17 ? 0 : 1] === 3;
}

export function magazineEditorPointLabel(index: number, rows: number, columns: number, method: MagazineCalibrationMethod) {
  const magazine = magazineForEditorPoint(index);
  if (!magazine) return undefined;
  const role = MAGAZINE_EDITOR_POINTS[magazine - 1].findIndex(point => point === index);
  if (method === 1 && role === 0) return `Магазин ${magazine} — базовая точка детали`;
  const slot = role === 0 ? 1 : role === 1 ? columns : (rows - 1) * columns + 1;
  return `Магазин ${magazine} — ${['A', 'B', 'C'][role]} · слот ${slot}`;
}

export type PointImportStep = PlcPointEditorCommand & { label: string };

// The current PLC methods remain authoritative. Invalidate whole magazines
// before any SAVE, so interruption cannot combine an old and a new frame.
export function planPointImport(
  backup: PointBackupDocument,
  currentPoints: readonly PlcPointEditorPoint[],
  currentMethods: readonly MagazineCalibrationMethod[],
): PointImportStep[] {
  const currentById = new Map(currentPoints.map(point => [point.pointId, point]));
  const resets: PointImportStep[] = [];
  const saves: PointImportStep[] = [];
  const mismatched = new Set<number>();
  for (const magazine of [1, 2] as const) {
    const indexes: readonly number[] = MAGAZINE_EDITOR_POINTS[magazine - 1];
    const containsMagazine = backup.points.some(point => indexes.includes(point.index));
    if (!containsMagazine) continue;
    const method = currentMethods[magazine - 1];
    if (method !== 1 && method !== 3) throw new Error('PLC не сообщил способ калибровки магазина');
    if (!currentPoints.some(point => point.index === indexes[0] && point.pointId === (magazine === 1 ? 22 : 23))) {
      throw new Error(`В PLC отсутствует базовая точка магазина ${magazine}`);
    }
    resets.push({ command: 'robot.point.invalidateMagazine', index: indexes[0], calibrationMethod: method,
      label: `Магазин ${magazine}` });
    if (backup.magazineCalibrationMethods[magazine - 1] !== method) mismatched.add(magazine);
  }
  const seen = new Set<number>();
  for (const raw of backup.points) {
    const current = currentById.get(raw.pointId);
    if (!current || seen.has(raw.pointId) || !raw.configured) continue;
    seen.add(raw.pointId);
    const magazine = magazineForEditorPoint(current.index);
    if (magazine && (mismatched.has(magazine) || !isMagazinePointActive(current.index, currentMethods))) continue;
    const geometry = current.index === 13 || current.index === 14;
    if (![raw.x, raw.y, raw.z, raw.speedFactor, raw.magazineSafeZ, raw.magazineChangeZ].every(Number.isFinite)
      || raw.speedFactor > 1 || (geometry ? raw.speedFactor < .1 : raw.speedFactor <= .1)
      || Math.abs(raw.magazineSafeZ) > 10000 || Math.abs(raw.magazineChangeZ) > 10000) {
      throw new Error(`Некорректные координаты или скорость точки ${raw.label}`);
    }
    saves.push({ command: 'robot.point.save', index: current.index, label: raw.label,
      ...(magazine ? { calibrationMethod: currentMethods[magazine - 1] } : {}),
      draft: { x: raw.x, y: raw.y, z: raw.z, speedFactor: raw.speedFactor,
        magazineSafeZ: raw.magazineSafeZ, magazineChangeZ: raw.magazineChangeZ } });
  }
  return [...resets, ...saves.sort((a, b) => a.index - b.index)];
}
