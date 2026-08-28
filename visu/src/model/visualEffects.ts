export const VISUAL_EFFECTS_STORAGE_KEY = 'portal-robot.visual-effects.v1';

export interface VisualEffectSettings {
  operationHighlight: boolean;
  cameraFocus: boolean;
  alarmBeacons: boolean;
}

export const DEFAULT_VISUAL_EFFECT_SETTINGS: VisualEffectSettings = {
  operationHighlight: false,
  cameraFocus: false,
  alarmBeacons: false,
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

export function normalizeVisualEffectSettings(value: unknown): VisualEffectSettings {
  const saved = value && typeof value === 'object' ? value as Partial<VisualEffectSettings> : {};
  return {
    operationHighlight: saved.operationHighlight === true,
    cameraFocus: saved.cameraFocus === true,
    alarmBeacons: saved.alarmBeacons === true,
  };
}
