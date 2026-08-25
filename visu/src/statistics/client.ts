import type { AppUser } from '../auth/client';

export type StatisticsPreset = 'current-shift' | 'previous-shift' | '24h' | '7d' | '30d' | 'all' | 'custom';

export interface EquipmentStatistic {
  lane: 'machine-1' | 'machine-2' | 'machine-3' | 'robot';
  label: string;
  busyMs: number;
  observedMs: number;
  loadPercent: number;
}

export interface ExperienceStatistic {
  xp: number;
  level: number;
  currentThreshold: number;
  nextThreshold: number;
  progressPercent: number;
}

export interface StatisticsSummary {
  collectionStartedAt: number;
  period: { fromMs: number; toMs: number; label: string };
  scope: 'cell' | 'operator' | 'unassigned';
  responsibilityMs: number;
  unassignedMs: number;
  coverageMs: number;
  coveragePercent: number;
  equipment: EquipmentStatistic[];
  alarmsActivated: number;
  warningsActivated: number;
  commandsAccepted: number;
  commandsRejected: number;
  partialData: boolean;
  experience: ExperienceStatistic | null;
  trend: Array<{ timestampMs: number; loadPercent: number }>;
}

export interface ShiftTemplate {
  id: number;
  groupId: number;
  name: string;
  days: number[];
  startMinute: number;
  endMinute: number;
  timezone: string;
  enabled: boolean;
  effectiveFromMs: number;
  effectiveToMs: number | null;
}

export interface ShiftTemplateDraft {
  name: string;
  days: number[];
  startMinute: number;
  endMinute: number;
  timezone: string;
  enabled: boolean;
}

export interface OperatorInterval {
  id: number;
  userId: number;
  username: string;
  displayName: string;
  startMs: number;
  endMs: number | null;
  source: string;
}

class StatisticsApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin', ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const body = await response.json().catch(() => null) as (T & { error?: string; code?: string }) | null;
  if (!response.ok) throw new StatisticsApiError(body?.error ?? `Ошибка gateway: HTTP ${response.status}`, response.status, body?.code);
  if (body === null) throw new StatisticsApiError('Gateway вернул пустой ответ', response.status);
  return body;
}

export const toLocalInput = (timestamp: number) => {
  const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
};
export const statisticsApi = {
  summary: ({ preset, from, to, userId }: { preset?: StatisticsPreset; from?: number; to?: number; userId?: number | 'unassigned' | 'all' }) => {
    const query = new URLSearchParams();
    if (preset && preset !== 'custom') query.set('preset', preset);
    if (from !== undefined) query.set('from', String(from));
    if (to !== undefined) query.set('to', String(to));
    if (userId !== undefined) query.set('userId', String(userId));
    return api<StatisticsSummary>(`/api/statistics/summary?${query}`);
  },
  users: () => api<AppUser[]>('/api/users'),
  templates: () => api<ShiftTemplate[]>('/api/statistics/shift-templates'),
  createTemplate: (draft: ShiftTemplateDraft) => api<ShiftTemplate>('/api/statistics/shift-templates', { method: 'POST', body: JSON.stringify(draft) }),
  updateTemplate: (id: number, draft: Partial<ShiftTemplateDraft>) => api<ShiftTemplate>(`/api/statistics/shift-templates/${id}`, { method: 'PUT', body: JSON.stringify(draft) }),
  deleteTemplate: (id: number) => api<{ ok: boolean }>(`/api/statistics/shift-templates/${id}`, { method: 'DELETE' }),
  intervals: ({ from, to, userId }: { from: number; to: number; userId?: number }) => {
    const query = new URLSearchParams({ from: String(from), to: String(to) });
    if (userId) query.set('userId', String(userId));
    return api<OperatorInterval[]>(`/api/statistics/operator-intervals?${query}`);
  },
  updateInterval: (id: number, value: { userId: number; startMs: number; endMs: number }) => api<OperatorInterval>(`/api/statistics/operator-intervals/${id}`, { method: 'PUT', body: JSON.stringify(value) }),
  deleteInterval: (id: number) => api<{ ok: boolean }>(`/api/statistics/operator-intervals/${id}`, { method: 'DELETE' }),
  hardDelete: (value: { fromMs: number; toMs: number; userId?: number | null; equipment: boolean; facts: boolean; intervals: boolean }) => api<{ equipment: number; facts: number; intervals: number }>('/api/statistics/range', { method: 'DELETE', body: JSON.stringify(value) }),
};
