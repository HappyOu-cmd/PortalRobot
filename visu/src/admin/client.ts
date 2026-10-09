import { gatewayApiUrl } from '../api/gateway';

export type ArchiveKey = 'statistics' | 'events' | 'cyclogram';

export interface ArchiveStatus {
  key: ArchiveKey;
  retentionDays: number;
  startedAtMs: number;
  expiresAtMs: number;
  elapsedDays: number;
  remainingDays: number;
  available: boolean;
  sizeBytes: number;
  counts: Record<string, number> | null;
  error: string | null;
}

export interface ArchiveAction {
  id: number;
  timestampMs: number;
  key: ArchiveKey;
  action: string;
  actorName: string | null;
  details: Record<string, unknown> | null;
}

export interface ArchiveSnapshot {
  disk: { available: boolean; freeBytes: number | null; totalBytes: number | null };
  archives: Record<ArchiveKey, ArchiveStatus>;
  actions: ArchiveAction[];
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(gatewayApiUrl(path), {
    credentials: 'same-origin', ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error ?? `Ошибка gateway: HTTP ${response.status}`);
  if (body === null) throw new Error('Gateway вернул пустой ответ');
  return body;
}

export const archiveApi = {
  status: () => api<ArchiveSnapshot>('/api/admin/archives'),
  setRetention: (key: ArchiveKey, days: number) => api<ArchiveSnapshot>(`/api/admin/archives/${key}/retention`, {
    method: 'PUT', body: JSON.stringify({ days }),
  }),
  resetClock: (key: ArchiveKey) => api<ArchiveSnapshot>(`/api/admin/archives/${key}/reset`, { method: 'POST' }),
  clear: (key: ArchiveKey) => api<ArchiveSnapshot & { deleted: Record<string, number> }>(`/api/admin/archives/${key}`, { method: 'DELETE' }),
};
