export type UserRole = 'admin' | 'operator';

export interface AppUser {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  enabled: boolean;
  mustChangePassword: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
}

export interface AuthSession {
  authenticated: boolean;
  user: AppUser | null;
  expiresAt?: number;
  error?: string;
}

export interface UserDraft {
  username: string;
  displayName: string;
  role: UserRole;
  enabled: boolean;
  password?: string;
}

export class AuthApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = 'AuthApiError';
  }
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const body = await response.json().catch(() => null) as (T & { error?: string; code?: string }) | null;
  if (!response.ok) throw new AuthApiError(body?.error ?? `Ошибка gateway: HTTP ${response.status}`, response.status, body?.code);
  if (body === null) throw new AuthApiError('Gateway вернул пустой ответ', response.status);
  return body;
}

export const authApi = {
  session: () => api<AuthSession>('/api/auth/session'),
  login: (username: string, password: string) => api<AuthSession>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ username, password }),
  }),
  logout: () => api<AuthSession>('/api/auth/logout', { method: 'POST' }),
  listUsers: () => api<AppUser[]>('/api/users'),
  createUser: (draft: UserDraft) => api<AppUser>('/api/users', { method: 'POST', body: JSON.stringify(draft) }),
  updateUser: (id: number, draft: Partial<UserDraft>) => api<AppUser>(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(draft) }),
  deleteUser: (id: number) => api<{ ok: boolean }>(`/api/users/${id}`, { method: 'DELETE' }),
};
