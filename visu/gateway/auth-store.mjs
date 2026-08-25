import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export const USER_ROLES = Object.freeze(['admin', 'operator']);
export const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export class AuthStoreError extends Error {
  constructor(message, status = 400, code = 'AUTH_ERROR') {
    super(message);
    this.name = 'AuthStoreError';
    this.status = status;
    this.code = code;
  }
}

const normalizeUsername = (value) => String(value ?? '').trim().toLowerCase();
const normalizeDisplayName = (value) => String(value ?? '').trim();
const normalizeRole = (value) => String(value ?? 'operator').trim().toLowerCase();
const sessionHash = (token) => createHash('sha256').update(String(token)).digest('hex');

const assertUsername = (username) => {
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new AuthStoreError('Логин должен содержать 3–32 латинских символа, цифры, точку, дефис или подчёркивание');
  }
};

const assertDisplayName = (displayName) => {
  if (!displayName || displayName.length > 80) {
    throw new AuthStoreError('Имя пользователя должно содержать от 1 до 80 символов');
  }
};

const assertRole = (role) => {
  if (!USER_ROLES.includes(role)) throw new AuthStoreError('Неизвестная роль пользователя');
};

const assertPassword = (password, { bootstrap = false } = {}) => {
  const value = String(password ?? '');
  if (value.length > 128 || (!bootstrap && value.length < 8)) {
    throw new AuthStoreError('Пароль должен содержать от 8 до 128 символов');
  }
  if (bootstrap && !value) throw new AuthStoreError('Пароль не может быть пустым');
  return value;
};

const passwordParts = (password) => {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return { salt: salt.toString('base64'), hash: hash.toString('base64') };
};

const passwordMatches = (password, salt, expectedHash) => {
  try {
    const expected = Buffer.from(expectedHash, 'base64');
    const actual = scryptSync(String(password ?? ''), Buffer.from(salt, 'base64'), expected.length);
    return expected.length > 0 && expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
};

const publicUser = (row) => row ? ({
  id: Number(row.id),
  username: row.username,
  displayName: row.display_name,
  role: row.role,
  enabled: Boolean(row.enabled),
  mustChangePassword: Boolean(row.must_change_password),
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at),
  lastLoginAt: row.last_login_at === null ? null : Number(row.last_login_at),
}) : null;

export class AuthStore {
  constructor({
    databasePath = 'gateway/data/auth.sqlite',
    sessionTtlMs = DEFAULT_SESSION_TTL_MS,
    now = () => Date.now(),
    bootstrapUsername = 'admin',
    bootstrapPassword = 'admin',
  } = {}) {
    this.db = new DatabaseSync(databasePath);
    this.now = now;
    this.sessionTtlMs = Math.max(60_000, Number(sessionTtlMs) || DEFAULT_SESSION_TTL_MS);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS app_user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        display_name TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_login_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS auth_session (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_auth_session_user ON auth_session (user_id);
      CREATE INDEX IF NOT EXISTS idx_auth_session_expiry ON auth_session (expires_at);
    `);
    this.bootstrap(bootstrapUsername, bootstrapPassword);
  }

  bootstrap(username, password) {
    const existing = this.db.prepare('SELECT id FROM app_user LIMIT 1').get();
    if (existing) return false;
    const normalizedUsername = normalizeUsername(username);
    assertUsername(normalizedUsername);
    const normalizedPassword = assertPassword(password, { bootstrap: true });
    const now = this.now();
    const credentials = passwordParts(normalizedPassword);
    this.db.prepare(`INSERT INTO app_user
      (username, display_name, password_salt, password_hash, role, enabled, must_change_password, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'admin', 1, 1, ?, ?)`)
      .run(normalizedUsername, 'Администратор', credentials.salt, credentials.hash, now, now);
    return true;
  }

  listUsers() {
    return this.db.prepare('SELECT * FROM app_user ORDER BY username COLLATE NOCASE').all().map(publicUser);
  }

  getUser(id) {
    return publicUser(this.db.prepare('SELECT * FROM app_user WHERE id = ?').get(Number(id)));
  }

  createUser(input) {
    const username = normalizeUsername(input?.username);
    const displayName = normalizeDisplayName(input?.displayName);
    const role = normalizeRole(input?.role);
    const password = assertPassword(input?.password);
    assertUsername(username);
    assertDisplayName(displayName);
    assertRole(role);
    const credentials = passwordParts(password);
    const now = this.now();
    try {
      const result = this.db.prepare(`INSERT INTO app_user
        (username, display_name, password_salt, password_hash, role, enabled, must_change_password, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`)
        .run(username, displayName, credentials.salt, credentials.hash, role, input?.enabled === false ? 0 : 1, now, now);
      return this.getUser(result.lastInsertRowid);
    } catch (error) {
      if (/UNIQUE/i.test(String(error))) throw new AuthStoreError('Пользователь с таким логином уже существует', 409, 'USERNAME_EXISTS');
      throw error;
    }
  }

  activeAdminCount(excludeId = null) {
    const row = excludeId === null
      ? this.db.prepare("SELECT COUNT(*) AS count FROM app_user WHERE role = 'admin' AND enabled = 1").get()
      : this.db.prepare("SELECT COUNT(*) AS count FROM app_user WHERE role = 'admin' AND enabled = 1 AND id <> ?").get(Number(excludeId));
    return Number(row?.count ?? 0);
  }

  updateUser(id, input) {
    const numericId = Number(id);
    const currentRow = this.db.prepare('SELECT * FROM app_user WHERE id = ?').get(numericId);
    if (!currentRow) throw new AuthStoreError('Пользователь не найден', 404, 'USER_NOT_FOUND');
    const username = input?.username === undefined ? currentRow.username : normalizeUsername(input.username);
    const displayName = input?.displayName === undefined ? currentRow.display_name : normalizeDisplayName(input.displayName);
    const role = input?.role === undefined ? currentRow.role : normalizeRole(input.role);
    const enabled = input?.enabled === undefined ? Boolean(currentRow.enabled) : Boolean(input.enabled);
    assertUsername(username);
    assertDisplayName(displayName);
    assertRole(role);
    if (currentRow.role === 'admin' && Boolean(currentRow.enabled) && (role !== 'admin' || !enabled)
        && this.activeAdminCount(numericId) === 0) {
      throw new AuthStoreError('Нельзя отключить или понизить последнего активного администратора', 409, 'LAST_ADMIN');
    }
    let passwordSalt = currentRow.password_salt;
    let passwordHash = currentRow.password_hash;
    let mustChangePassword = Boolean(currentRow.must_change_password);
    if (input?.password !== undefined && input.password !== '') {
      const password = assertPassword(input.password);
      const credentials = passwordParts(password);
      passwordSalt = credentials.salt;
      passwordHash = credentials.hash;
      mustChangePassword = false;
    }
    try {
      this.db.prepare(`UPDATE app_user SET username = ?, display_name = ?, password_salt = ?, password_hash = ?,
        role = ?, enabled = ?, must_change_password = ?, updated_at = ? WHERE id = ?`)
        .run(username, displayName, passwordSalt, passwordHash, role, enabled ? 1 : 0,
          mustChangePassword ? 1 : 0, this.now(), numericId);
    } catch (error) {
      if (/UNIQUE/i.test(String(error))) throw new AuthStoreError('Пользователь с таким логином уже существует', 409, 'USERNAME_EXISTS');
      throw error;
    }
    if (!enabled) this.revokeUserSessions(numericId);
    return this.getUser(numericId);
  }

  deleteUser(id, actorUserId) {
    const numericId = Number(id);
    if (numericId === Number(actorUserId)) throw new AuthStoreError('Нельзя удалить собственную учётную запись', 409, 'SELF_DELETE');
    const row = this.db.prepare('SELECT * FROM app_user WHERE id = ?').get(numericId);
    if (!row) throw new AuthStoreError('Пользователь не найден', 404, 'USER_NOT_FOUND');
    if (row.role === 'admin' && Boolean(row.enabled) && this.activeAdminCount(numericId) === 0) {
      throw new AuthStoreError('Нельзя удалить последнего активного администратора', 409, 'LAST_ADMIN');
    }
    this.db.prepare('DELETE FROM app_user WHERE id = ?').run(numericId);
    return publicUser(row);
  }

  login(username, password) {
    const normalizedUsername = normalizeUsername(username);
    const row = this.db.prepare('SELECT * FROM app_user WHERE username = ?').get(normalizedUsername);
    if (!row || !Boolean(row.enabled) || !passwordMatches(password, row.password_salt, row.password_hash)) {
      throw new AuthStoreError('Неверный логин или пароль', 401, 'INVALID_CREDENTIALS');
    }
    const now = this.now();
    this.db.prepare('UPDATE app_user SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now, now, row.id);
    const token = randomBytes(32).toString('base64url');
    this.db.prepare(`INSERT INTO auth_session (token_hash, user_id, created_at, last_seen_at, expires_at)
      VALUES (?, ?, ?, ?, ?)`)
      .run(sessionHash(token), row.id, now, now, now + this.sessionTtlMs);
    return { token, user: this.getUser(row.id), expiresAt: now + this.sessionTtlMs };
  }

  getSession(token) {
    if (!token) return null;
    const now = this.now();
    this.db.prepare('DELETE FROM auth_session WHERE expires_at <= ?').run(now);
    const row = this.db.prepare(`SELECT s.token_hash, s.expires_at, u.* FROM auth_session s
      JOIN app_user u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`).get(sessionHash(token), now);
    if (!row || !Boolean(row.enabled)) {
      if (row) this.db.prepare('DELETE FROM auth_session WHERE token_hash = ?').run(row.token_hash);
      return null;
    }
    this.db.prepare('UPDATE auth_session SET last_seen_at = ? WHERE token_hash = ?').run(now, row.token_hash);
    return { user: publicUser(row), expiresAt: Number(row.expires_at) };
  }

  logout(token) {
    if (!token) return false;
    return this.db.prepare('DELETE FROM auth_session WHERE token_hash = ?').run(sessionHash(token)).changes > 0;
  }

  revokeUserSessions(userId) {
    return this.db.prepare('DELETE FROM auth_session WHERE user_id = ?').run(Number(userId)).changes;
  }

  revokeRoleSessions(role, exceptToken = '') {
    assertRole(role);
    if (exceptToken) {
      return this.db.prepare(`DELETE FROM auth_session WHERE user_id IN
        (SELECT id FROM app_user WHERE role = ?) AND token_hash <> ?`)
        .run(role, sessionHash(exceptToken)).changes;
    }
    return this.db.prepare(`DELETE FROM auth_session WHERE user_id IN
      (SELECT id FROM app_user WHERE role = ?)`).run(role).changes;
  }

  close() {
    this.db.close();
  }
}
