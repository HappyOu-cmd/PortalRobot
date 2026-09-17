import type { AppUser } from '../auth/client';
import type { StatisticsSummary } from './client';

const DEMO_TO_MS = Date.parse('2026-09-14T08:40:00+05:00');
const HOUR_MS = 60 * 60 * 1000;

export const DEMO_OPERATOR: AppUser = {
  id: 9001,
  username: 'operator.demo',
  displayName: 'Кошкаров И. Р.',
  role: 'operator',
  enabled: true,
  shiftPlan: 120,
  avatarDataUrl: null,
  mustChangePassword: false,
  createdAt: DEMO_TO_MS,
  updatedAt: DEMO_TO_MS,
  lastLoginAt: DEMO_TO_MS,
};

const equipment = (values: [number, number, number, number]) => [
  { lane: 'machine-1' as const, label: 'Станок 1', busyMs: Math.round(values[0] / 100 * 43_200_000), observedMs: 43_200_000, loadPercent: values[0] },
  { lane: 'machine-2' as const, label: 'Станок 2', busyMs: Math.round(values[1] / 100 * 43_200_000), observedMs: 43_200_000, loadPercent: values[1] },
  { lane: 'machine-3' as const, label: 'Станок 3', busyMs: Math.round(values[2] / 100 * 43_200_000), observedMs: 43_200_000, loadPercent: values[2] },
  { lane: 'robot' as const, label: 'Робот', busyMs: Math.round(values[3] / 100 * 43_200_000), observedMs: 43_200_000, loadPercent: values[3] },
];

const trend = (values: number[], stepMs: number, endMs = DEMO_TO_MS) => values.map((loadPercent, index) => ({
  timestampMs: endMs - (values.length - 1 - index) * stepMs,
  loadPercent,
}));

const experience = {
  xp: 2601,
  level: 6,
  currentThreshold: 2100,
  nextThreshold: 2700,
  progressPercent: 83.5,
};

const baseSummary = (summary: StatisticsSummary): StatisticsSummary => ({
  ...summary,
  partialData: false,
  experience,
});

export const createStatisticsDemoData = () => {
  const shiftFromMs = DEMO_TO_MS - 12 * HOUR_MS;
  const shift = baseSummary({
    collectionStartedAt: Date.parse('2026-09-01T08:00:00+05:00'),
    period: { fromMs: shiftFromMs, toMs: DEMO_TO_MS, label: 'Текущая смена' },
    scope: 'operator',
    responsibilityMs: 10 * HOUR_MS + 48 * 60 * 1000,
    unassignedMs: 34 * 60 * 1000,
    coverageMs: 12 * HOUR_MS,
    coveragePercent: 100,
    equipment: equipment([78, 64, 83, 71]),
    producedParts: 68,
    shiftPlan: 120,
    alarmsActivated: 1,
    alarmBreakdown: [{ code: 'M2-DOOR', message: 'Дверь станка 2 открыта во время цикла', count: 1 }],
    warningsActivated: 3,
    commandsAccepted: 186,
    commandsRejected: 4,
    partialData: false,
    experience: null,
    trend: trend([58, 62, 69, 74, 71, 78, 83, 79, 86, 81, 76, 82, 79], HOUR_MS),
  });

  const all = baseSummary({
    collectionStartedAt: Date.parse('2026-09-01T08:00:00+05:00'),
    period: { fromMs: Date.parse('2026-09-01T08:00:00+05:00'), toMs: DEMO_TO_MS, label: 'Всё время' },
    scope: 'operator',
    responsibilityMs: 72 * HOUR_MS + 24 * 60 * 1000,
    unassignedMs: 5 * HOUR_MS + 12 * 60 * 1000,
    coverageMs: 78 * HOUR_MS,
    coveragePercent: 98.7,
    equipment: equipment([69, 74, 81, 76]),
    producedParts: 428,
    shiftPlan: 120,
    alarmsActivated: 4,
    alarmBreakdown: [{ code: 'M2-DOOR', message: 'Дверь станка 2 открыта во время цикла', count: 2 }, { code: 'ROBOT-TIMEOUT', message: 'Превышено время ответа робота', count: 2 }],
    warningsActivated: 11,
    commandsAccepted: 1248,
    commandsRejected: 19,
    partialData: false,
    experience: null,
    trend: trend([61, 66, 63, 70, 72, 68, 75, 78, 74, 79, 82, 77], 24 * HOUR_MS, DEMO_TO_MS - 2 * HOUR_MS),
  });

  return { shift, all };
};
