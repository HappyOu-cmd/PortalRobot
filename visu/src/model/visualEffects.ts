export const VISUAL_EFFECTS_STORAGE_KEY = 'portal-robot.visual-effects.v1';

export interface VisualIndicatorSettings {
  // Legacy-настройки кругов сохраняются только для совместимости localStorage.
  /** Смещение от штатной точки оборудования в координатах сцены, мм. */
  offset: { x: number; y: number; z: number };
  /** Сохранённый масштаб прежнего индикатора. */
  scale: number;
}

export interface VisualEffectSettings {
  cameraFocus: boolean;
  alarmBeacons: boolean;
  /** Непрозрачность сетчатых ограждений и дверных полотен. */
  enclosureOpacity: number;
  indicators: {
    machines: VisualIndicatorSettings[];
    magazines: VisualIndicatorSettings[];
    portal: VisualIndicatorSettings;
  };
}

const createDefaultIndicatorSettings = (): VisualIndicatorSettings => ({
  offset: { x: 0, y: 0, z: 0 },
  scale: 1,
});

export const DEFAULT_VISUAL_EFFECT_SETTINGS: VisualEffectSettings = {
  cameraFocus: false,
  alarmBeacons: false,
  enclosureOpacity: 1,
  indicators: {
    machines: [0, 1, 2].map(() => createDefaultIndicatorSettings()),
    magazines: [0, 1].map(() => createDefaultIndicatorSettings()),
    portal: createDefaultIndicatorSettings(),
  },
};

export type SceneEquipmentKind = 'machine' | 'magazine';

export interface SceneEquipmentTarget {
  kind: SceneEquipmentKind;
  index: number;
}

export type SceneAlarmTarget =
  | { kind: 'cell' | 'portal' }
  | SceneEquipmentTarget;

export interface SceneActivity {
  live: boolean;
  operationTarget: SceneEquipmentTarget | null;
  activeMachines: number[];
  activeMagazines: number[];
  robotBusy: boolean;
  alarmTargets: SceneAlarmTarget[];
}

export const EMPTY_SCENE_ACTIVITY: SceneActivity = {
  live: false,
  operationTarget: null,
  activeMachines: [],
  activeMagazines: [],
  robotBusy: false,
  alarmTargets: [],
};

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, numeric));
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function normalizeIndicator(value: unknown, fallback: VisualIndicatorSettings): VisualIndicatorSettings {
  const saved = recordValue(value);
  const savedOffset = recordValue(saved.offset);
  return {
    offset: {
      x: boundedNumber(savedOffset.x, fallback.offset.x, -1000, 1000),
      y: boundedNumber(savedOffset.y, fallback.offset.y, -1000, 1000),
      z: boundedNumber(savedOffset.z, fallback.offset.z, -1000, 1000),
    },
    scale: boundedNumber(saved.scale, fallback.scale, 0.25, 3),
  };
}

export function normalizeVisualEffectSettings(value: unknown): VisualEffectSettings {
  const saved = recordValue(value);
  const savedIndicators = recordValue(saved.indicators);
  // Версия с одной общей настройкой была промежуточной: переносим её во все
  // объекты при первом чтении, чтобы пользовательские значения не потерялись.
  const legacyIndicator = Object.prototype.hasOwnProperty.call(saved, 'indicator')
    ? normalizeIndicator(saved.indicator, createDefaultIndicatorSettings())
    : null;
  const normalizeForObject = (valueToNormalize: unknown, fallback: VisualIndicatorSettings): VisualIndicatorSettings => normalizeIndicator(valueToNormalize, legacyIndicator ?? fallback);
  const savedMachines = Array.isArray(savedIndicators.machines) ? savedIndicators.machines : [];
  const savedMagazines = Array.isArray(savedIndicators.magazines) ? savedIndicators.magazines : [];
  return {
    cameraFocus: saved.cameraFocus === true,
    alarmBeacons: saved.alarmBeacons === true,
    enclosureOpacity: boundedNumber(saved.enclosureOpacity, DEFAULT_VISUAL_EFFECT_SETTINGS.enclosureOpacity, 0.1, 1),
    indicators: {
      machines: DEFAULT_VISUAL_EFFECT_SETTINGS.indicators.machines.map((fallback, index) => normalizeForObject(savedMachines[index], fallback)),
      magazines: DEFAULT_VISUAL_EFFECT_SETTINGS.indicators.magazines.map((fallback, index) => normalizeForObject(savedMagazines[index], fallback)),
      portal: normalizeForObject(savedIndicators.portal, DEFAULT_VISUAL_EFFECT_SETTINGS.indicators.portal),
    },
  };
}
