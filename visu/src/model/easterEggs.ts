export const EASTER_EGG_STORAGE_KEY = 'portal-robot.visualization-easter-egg.v1';
export const DRIFT_SETTINGS_STORAGE_KEY = 'portal-robot.drift-settings.v1';

export const EASTER_EGG_SCENES = [
  'fight',
  'caught',
  'runaway',
  'tea',
  'robot',
  'ritual',
  'cart',
  'drift',
  'disco',
  'foreman',
  'boss',
] as const;

export type EasterEggScene = typeof EASTER_EGG_SCENES[number];
export type EasterEggMode = 'off' | 'random' | EasterEggScene;

export interface EasterEggOption {
  value: EasterEggMode;
  label: string;
  description: string;
}

export interface DriftTelemetry {
  score: number;
  bestScore: number;
  combo: number;
  speedKmh: number;
  driftAngle: number;
  drifting: boolean;
  rearSlip: number;
  rearWheelsLocked: boolean;
  impact: number;
}

export type DriftCameraMode = 'driver' | 'chase' | 'high';
export type DriftCartStyle = 'factory' | 'hazard' | 'night';

export interface DriftSettings {
  enginePower: number;
  mass: number;
  steeringResponse: number;
  frontGrip: number;
  rearGrip: number;
  cameraMode: DriftCameraMode;
  cartStyle: DriftCartStyle;
}

export const DEFAULT_DRIFT_SETTINGS: DriftSettings = {
  enginePower: 1.45,
  mass: 0.82,
  steeringResponse: 1,
  frontGrip: 1,
  rearGrip: 1,
  cameraMode: 'driver',
  cartStyle: 'factory',
};

const clampSetting = (value: unknown, fallback: number, min: number, max: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
};

export function normalizeDriftSettings(value: unknown): DriftSettings {
  const saved = value && typeof value === 'object' ? value as Partial<DriftSettings> : {};
  const cameraMode: DriftCameraMode = saved.cameraMode === 'chase' || saved.cameraMode === 'high' ? saved.cameraMode : 'driver';
  const cartStyle: DriftCartStyle = saved.cartStyle === 'hazard' || saved.cartStyle === 'night' ? saved.cartStyle : 'factory';
  return {
    enginePower: clampSetting(saved.enginePower, DEFAULT_DRIFT_SETTINGS.enginePower, 0.5, 2.5),
    mass: clampSetting(saved.mass, DEFAULT_DRIFT_SETTINGS.mass, 0.45, 2),
    steeringResponse: clampSetting(saved.steeringResponse, DEFAULT_DRIFT_SETTINGS.steeringResponse, 0.5, 2),
    frontGrip: clampSetting(saved.frontGrip, DEFAULT_DRIFT_SETTINGS.frontGrip, 0.5, 1.6),
    rearGrip: clampSetting(saved.rearGrip, DEFAULT_DRIFT_SETTINGS.rearGrip, 0.35, 1.6),
    cameraMode,
    cartStyle,
  };
}

export const EMPTY_DRIFT_TELEMETRY: DriftTelemetry = {
  score: 0,
  bestScore: 0,
  combo: 1,
  speedKmh: 0,
  driftAngle: 0,
  drifting: false,
  rearSlip: 0,
  rearWheelsLocked: false,
  impact: 0,
};

export const EASTER_EGG_OPTIONS: EasterEggOption[] = [
  { value: 'off', label: 'Выключено', description: 'Ячейка выглядит прилично и не позорит предприятие.' },
  { value: 'random', label: 'Случайный сценарий', description: 'Новый беспредел появляется каждые 35 секунд.' },
  { value: 'fight', label: 'Драка слесарей · риг', description: 'Ригованные слесари, готовые удары, ключ и позорная победная поза.' },
  { value: 'caught', label: 'Драка с палевом · риг', description: 'При долгом взгляде камера превращает нормальный махач в совещание.' },
  { value: 'runaway', label: 'Погоня за деталью', description: 'Слесарь пытается догнать укатившуюся заготовку.' },
  { value: 'tea', label: 'Скрытое чаепитие', description: 'Чай, ящик и резкая имитация работы при обнаружении.' },
  { value: 'robot', label: 'Слесарь против робота', description: 'Неравный спор разводного ключа с машинным разумом.' },
  { value: 'ritual', label: 'Техно-шаманство', description: 'Два специалиста чинят деталь ритуальным ударом молотка.' },
  { value: 'cart', label: 'Тележка Tokyo Drift · риг', description: 'Один бежит за тележкой, второй едет и молит технику безопасности о пощаде.' },
  { value: 'drift', label: 'Дрифт-тележка · игра', description: 'Стрелки/WASD — газ и руль, пробел — ручник, R — вернуть этот металлолом на трассу.' },
  { value: 'disco', label: 'Ночная дискотека · риг', description: 'Трое слесарей устраивают рейв под сигнальные лампы.' },
  { value: 'foreman', label: 'Начальник идёт · риг', description: 'Бригада бесится, замечает мастера и мгновенно изображает работу.' },
  { value: 'boss', label: 'Мини-босс', description: 'Слесарь сражается с гигантской гайкой и полоской здоровья.' },
];

export function isEasterEggMode(value: unknown): value is EasterEggMode {
  return value === 'off' || value === 'random' || EASTER_EGG_SCENES.includes(value as EasterEggScene);
}

export function nextEasterEggScene(current: EasterEggScene): EasterEggScene {
  const index = EASTER_EGG_SCENES.indexOf(current);
  return EASTER_EGG_SCENES[(index + 1) % EASTER_EGG_SCENES.length];
}
