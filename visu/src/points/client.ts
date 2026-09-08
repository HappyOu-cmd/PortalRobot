import type { PlcPointEditorPoint } from '../plc/client';
import { gatewayApiUrl } from '../api/gateway';

export interface PointBackupItem {
  id: string;
  name: string;
  exportedAt: string | null;
  createdAtMs: number;
  pointCount: number;
  configuredCount: number;
  valid: boolean;
  error: string | null;
}

export interface PointBackupDocument {
  format: 'portal-robot-points';
  version: 1;
  exportedAt: string;
  exportedBy?: { id: number | null; username: string; displayName: string };
  points: Array<PlcPointEditorPoint & { label: string }>;
}

export class PointBackupApiError extends Error {
  public status: number;
  public code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'PointBackupApiError';
    this.status = status;
    this.code = code;
  }
}

export async function readPointBackupApiResponse<T>(response: Pick<Response, 'ok' | 'status' | 'text'>, path: string): Promise<T> {
  const raw = await response.text();
  const trimmed = raw.trim();
  let body: unknown = null;
  if (trimmed) {
    try {
      body = JSON.parse(trimmed);
    } catch {
      if (!response.ok) {
        throw new PointBackupApiError(`Gateway вернул не JSON для ${path} (HTTP ${response.status}). Проверьте адрес gateway и его версию.`, response.status);
      }
      throw new PointBackupApiError(`Gateway вернул не JSON для ${path} (HTTP ${response.status}). Проверьте адрес страницы и gateway.`, response.status);
    }
  }
  if (!response.ok) {
    const errorBody = body && typeof body === 'object' ? body as { error?: unknown; code?: unknown } : null;
    throw new PointBackupApiError(
      typeof errorBody?.error === 'string' ? errorBody.error : `Ошибка gateway: HTTP ${response.status}`,
      response.status,
      typeof errorBody?.code === 'string' ? errorBody.code : undefined,
    );
  }
  if (body === null) throw new PointBackupApiError(`Gateway вернул пустой ответ для ${path} (HTTP ${response.status}).`, response.status);
  return body as T;
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(gatewayApiUrl(path), {
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  return readPointBackupApiResponse<T>(response, path);
}

export const pointBackupApi = {
  list: async () => (await api<{ backups: PointBackupItem[] }>('/api/point-backups')).backups,
  exportCurrent: async (name: string) => (await api<{ backup: PointBackupItem }>('/api/point-backups/export', {
    method: 'POST', body: JSON.stringify({ name }),
  })).backup,
  prepareImport: async (id: string) => (await api<{ backup: PointBackupDocument }>('/api/point-backups/import', {
    method: 'POST', body: JSON.stringify({ id }),
  })).backup,
};
