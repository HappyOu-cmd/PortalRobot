import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DAY_MS = 86_400_000;
export const ARCHIVE_KEYS = Object.freeze(['statistics', 'events', 'cyclogram']);

export class ArchivePolicyError extends Error {
  constructor(message, status = 400, code = 'ARCHIVE_POLICY_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const validKey = (key) => {
  if (!ARCHIVE_KEYS.includes(key)) throw new ArchivePolicyError('Неизвестный архив', 404, 'ARCHIVE_NOT_FOUND');
  return key;
};

const validDays = (days) => {
  const value = Number(days);
  if (!Number.isInteger(value) || value < 1 || value > 3650) {
    throw new ArchivePolicyError('Срок хранения должен быть от 1 до 3650 дней');
  }
  return value;
};

export class ArchivePolicyStore {
  constructor({ databasePath = ':memory:', now = () => Date.now(), defaults = {} } = {}) {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.now = now;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS archive_policy (
        archive_key TEXT PRIMARY KEY,
        retention_days INTEGER NOT NULL,
        started_at_ms INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS archive_action (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp_ms INTEGER NOT NULL,
        archive_key TEXT NOT NULL,
        action TEXT NOT NULL,
        actor_user_id INTEGER,
        actor_name TEXT,
        details_json TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_archive_action_time ON archive_action (timestamp_ms DESC);
    `);
    const insert = this.db.prepare('INSERT OR IGNORE INTO archive_policy (archive_key, retention_days, started_at_ms) VALUES (?, ?, ?)');
    for (const key of ARCHIVE_KEYS) {
      const configured = Number(defaults[key] ?? 90);
      const initialDays = Number.isInteger(configured) && configured >= 1 && configured <= 3650 ? configured : 90;
      insert.run(key, initialDays, this.now());
    }
  }

  policy(key, at = this.now()) {
    const row = this.db.prepare('SELECT * FROM archive_policy WHERE archive_key = ?').get(validKey(key));
    const retentionDays = Number(row.retention_days);
    const startedAtMs = Number(row.started_at_ms);
    const expiresAtMs = startedAtMs + retentionDays * DAY_MS;
    return {
      key, retentionDays, startedAtMs, expiresAtMs,
      elapsedDays: Math.max(0, Math.floor((at - startedAtMs) / DAY_MS)),
      remainingDays: Math.max(0, Math.ceil((expiresAtMs - at) / DAY_MS)),
    };
  }

  all(at = this.now()) {
    return Object.fromEntries(ARCHIVE_KEYS.map((key) => [key, this.policy(key, at)]));
  }

  expired(at = this.now()) {
    return ARCHIVE_KEYS.filter((key) => this.policy(key, at).expiresAtMs <= at);
  }

  #record(key, action, actor, details, at) {
    this.db.prepare(`INSERT INTO archive_action
      (timestamp_ms, archive_key, action, actor_user_id, actor_name, details_json)
      VALUES (?, ?, ?, ?, ?, ?)`).run(
      at, key, action, actor?.id ?? null, actor?.displayName ?? actor?.username ?? null,
      details === undefined ? null : JSON.stringify(details),
    );
  }

  log(key, action, actor = null, details = {}, at = this.now()) {
    this.#record(validKey(key), action, actor, details, at);
  }

  renew(key, action, actor = null, details = {}, at = this.now()) {
    validKey(key);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE archive_policy SET started_at_ms = ? WHERE archive_key = ?').run(at, key);
      this.#record(key, action, actor, details, at);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.policy(key, at);
  }

  setRetentionDays(key, days, actor = null, at = this.now()) {
    validKey(key);
    const retentionDays = validDays(days);
    const previous = this.policy(key, at).retentionDays;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE archive_policy SET retention_days = ?, started_at_ms = ? WHERE archive_key = ?')
        .run(retentionDays, at, key);
      this.#record(key, 'retention-changed', actor, { previousDays: previous, retentionDays }, at);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.policy(key, at);
  }

  recentActions(limit = 20) {
    return this.db.prepare('SELECT * FROM archive_action ORDER BY timestamp_ms DESC, id DESC LIMIT ?')
      .all(Math.max(1, Math.min(100, Math.round(limit)))).map((row) => ({
        id: Number(row.id), timestampMs: Number(row.timestamp_ms), key: row.archive_key,
        action: row.action, actorName: row.actor_name,
        details: row.details_json ? JSON.parse(row.details_json) : null,
      }));
  }

  close() { this.db.close(); }
}
