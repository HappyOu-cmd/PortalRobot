export const EDITOR_POINT_LABELS = [
  'Станок 1 — над станком', 'Станок 1 — подход к патрону', 'Станок 1 — позиция патрона',
  'Станок 2 — над станком', 'Станок 2 — подход к патрону', 'Станок 2 — позиция патрона',
  'Станок 3 — над станком', 'Станок 3 — подход к патрону', 'Станок 3 — позиция патрона',
  'HOME_SAFETY — безопасный повторный запуск',
  'Магазин 1 — базовая точка детали',
  'Магазин 2 — базовая точка детали',
] as const;

export const MANUAL_POINT_OPTIONS = [
  { value: 1, label: EDITOR_POINT_LABELS[0] },
  { value: 3, label: EDITOR_POINT_LABELS[1] },
  { value: 4, label: EDITOR_POINT_LABELS[2] },
  { value: 5, label: EDITOR_POINT_LABELS[3] },
  { value: 7, label: EDITOR_POINT_LABELS[4] },
  { value: 8, label: EDITOR_POINT_LABELS[5] },
  { value: 9, label: EDITOR_POINT_LABELS[6] },
  { value: 11, label: EDITOR_POINT_LABELS[7] },
  { value: 12, label: EDITOR_POINT_LABELS[8] },
  { value: 13, label: EDITOR_POINT_LABELS[9] },
  { value: 14, label: 'Магазин — безопасно над слотом' },
  { value: 15, label: 'Магазин — смена захвата над слотом' },
  { value: 16, label: 'Магазин — внутри слота' },
] as const;

// PLC E_POINT_NAME values differ from the compact manual-selection codes above.
export const ACTIVE_POINT_LABELS: Record<number, string> = {
  1: EDITOR_POINT_LABELS[0], 3: EDITOR_POINT_LABELS[1], 4: EDITOR_POINT_LABELS[2],
  5: EDITOR_POINT_LABELS[3], 7: EDITOR_POINT_LABELS[4], 8: EDITOR_POINT_LABELS[5],
  9: EDITOR_POINT_LABELS[6], 11: EDITOR_POINT_LABELS[7], 12: EDITOR_POINT_LABELS[8],
  17: EDITOR_POINT_LABELS[9],
  19: MANUAL_POINT_OPTIONS[10].label,
  20: MANUAL_POINT_OPTIONS[12].label,
  21: MANUAL_POINT_OPTIONS[11].label,
};

export function currentRobotPointLabel(point: number, online = true): string {
  if (!online) return 'Нет данных';
  if (!point) return 'Не определена';
  return ACTIVE_POINT_LABELS[point] ?? `Точка ${point}`;
}

export type RobotManualAction = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Both quick and extended controls use the same gateway transaction payload.
export function robotActionCommand(action: RobotManualAction, point = 1, slot = 1, magazine = 1) {
  const magazinePoint = action === 1 && point >= 14;
  return {
    command: 'robot.action', action,
    point: action === 1 ? point : 0,
    slot: magazinePoint ? slot : 0,
    magazine: magazinePoint ? magazine : 0,
  };
}
