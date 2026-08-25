import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const LANES = Object.freeze([
  { id: 'machine-1', label: 'Станок 1', busy: 'machine-processing' },
  { id: 'machine-2', label: 'Станок 2', busy: 'machine-processing' },
  { id: 'machine-3', label: 'Станок 3', busy: 'machine-processing' },
  { id: 'robot', label: 'Робот', busy: 'robot-active' },
]);

export class StatisticsStoreError extends Error {
  constructor(message, status = 400, code = 'STATISTICS_ERROR') {
    super(message);
    this.name = 'StatisticsStoreError';
    this.status = status;
    this.code = code;
  }
}

const clampTimestamp = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : fallback;
};
const overlapMs = (leftStart, leftEnd, rightStart, rightEnd) =>
  Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
const durationMs = (segments) => segments.reduce((sum, item) => sum + Math.max(0, item.endMs - item.startMs), 0);
const rowToInterval = (row) => row ? ({
  id: Number(row.id),
  userId: Number(row.user_id),
  username: row.username,
  displayName: row.display_name,
  startMs: Number(row.start_ms),
  endMs: row.end_ms === null ? null : Number(row.end_ms),
  source: row.source,
}) : null;
const rowToTemplate = (row) => row ? ({
  id: Number(row.id),
  groupId: Number(row.group_id),
  name: row.name,
  days: JSON.parse(row.days_json),
  startMinute: Number(row.start_minute),
  endMinute: Number(row.end_minute),
  timezone: row.timezone,
  enabled: Boolean(row.enabled),
  effectiveFromMs: Number(row.effective_from_ms),
  effectiveToMs: row.effective_to_ms === null ? null : Number(row.effective_to_ms),
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at),
}) : null;

const localFormatter = (timeZone) => new Intl.DateTimeFormat('en-CA', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const localParts = (timestamp, timeZone) => Object.fromEntries(localFormatter(timeZone)
  .formatToParts(timestamp)
  .filter((part) => part.type !== 'literal')
  .map((part) => [part.type, Number(part.value)]));
const zonedTimestamp = (parts, timeZone) => {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour ?? 0, parts.minute ?? 0, 0, 0);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const visible = localParts(candidate, timeZone);
    const visibleUtc = Date.UTC(visible.year, visible.month - 1, visible.day, visible.hour, visible.minute, visible.second);
    candidate += target - visibleUtc;
  }
  return candidate;
};
const addLocalDays = (parts, days) => {
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
};
const dayOfWeek = (parts) => new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();

const normalizeTemplate = (input, defaultTimeZone) => {
  const name = String(input?.name ?? '').trim().slice(0, 80);
  const days = [...new Set((Array.isArray(input?.days) ? input.days : []).map(Number)
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
  const startMinute = Math.round(Number(input?.startMinute));
  const endMinute = Math.round(Number(input?.endMinute));
  const timezone = String(input?.timezone ?? defaultTimeZone).trim();
  if (!name) throw new StatisticsStoreError('Укажите название смены');
  if (days.length === 0) throw new StatisticsStoreError('Выберите хотя бы один день недели');
  if (![startMinute, endMinute].every((value) => Number.isInteger(value) && value >= 0 && value < 1_440)) {
    throw new StatisticsStoreError('Время смены должно находиться в пределах суток');
  }
  if (startMinute === endMinute) throw new StatisticsStoreError('Начало и окончание смены не должны совпадать');
  try { localFormatter(timezone).format(Date.now()); }
  catch { throw new StatisticsStoreError('Неизвестный часовой пояс'); }
  return { name, days, startMinute, endMinute, timezone, enabled: input?.enabled !== false };
};

const templateMinuteSet = (template) => {
  const occupied = new Set();
  const length = template.endMinute > template.startMinute
    ? template.endMinute - template.startMinute
    : 1_440 - template.startMinute + template.endMinute;
  for (const day of template.days) {
    for (let offset = 0; offset < length; offset += 1) {
      occupied.add((day * 1_440 + template.startMinute + offset) % (7 * 1_440));
    }
  }
  return occupied;
};

const mergeSegments = (segments) => {
  const sorted = segments.filter((item) => item.endMs > item.startMs).sort((a, b) => a.startMs - b.startMs);
  const merged = [];
  for (const item of sorted) {
    const previous = merged.at(-1);
    if (previous && item.startMs <= previous.endMs) previous.endMs = Math.max(previous.endMs, item.endMs);
    else merged.push({ startMs: item.startMs, endMs: item.endMs });
  }
  return merged;
};
const complementSegments = (segments, fromMs, toMs) => {
  const result = [];
  let cursor = fromMs;
  for (const item of mergeSegments(segments)) {
    if (item.startMs > cursor) result.push({ startMs: cursor, endMs: Math.min(item.startMs, toMs) });
    cursor = Math.max(cursor, item.endMs);
  }
  if (cursor < toMs) result.push({ startMs: cursor, endMs: toMs });
  return result.filter((item) => item.endMs > item.startMs);
};

export class StatisticsStore {
  constructor({ databasePath = ':memory:', now = () => Date.now(), timeZone = 'Asia/Yekaterinburg' } = {}) {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.now = now;
    this.timeZone = timeZone;
    this.lastEquipmentTimestamp = null;
    this.lastEquipmentStates = null;
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS statistics_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS operator_interval (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        display_name TEXT NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER,
        source TEXT NOT NULL DEFAULT 'login'
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_operator_interval_open
        ON operator_interval ((1)) WHERE end_ms IS NULL;
      CREATE INDEX IF NOT EXISTS idx_operator_interval_range
        ON operator_interval (user_id, start_ms, end_ms);
      CREATE TABLE IF NOT EXISTS equipment_minute (
        bucket_ms INTEGER NOT NULL,
        lane TEXT NOT NULL,
        scope_user_id INTEGER NOT NULL,
        busy_ms REAL NOT NULL DEFAULT 0,
        observed_ms REAL NOT NULL DEFAULT 0,
        first_ms INTEGER NOT NULL,
        last_ms INTEGER NOT NULL,
        PRIMARY KEY (bucket_ms, lane, scope_user_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_equipment_minute_range ON equipment_minute (bucket_ms);
      CREATE TABLE IF NOT EXISTS statistics_fact (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_event_id INTEGER UNIQUE,
        timestamp_ms INTEGER NOT NULL,
        kind TEXT NOT NULL,
        operator_user_id INTEGER,
        actor_user_id INTEGER,
        status TEXT,
        source_id INTEGER,
        code TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_statistics_fact_range ON statistics_fact (timestamp_ms, kind);
      CREATE INDEX IF NOT EXISTS idx_statistics_fact_operator ON statistics_fact (operator_user_id, timestamp_ms);
      CREATE TABLE IF NOT EXISTS shift_template (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        days_json TEXT NOT NULL,
        start_minute INTEGER NOT NULL,
        end_minute INTEGER NOT NULL,
        timezone TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        effective_from_ms INTEGER NOT NULL,
        effective_to_ms INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_shift_template_effective
        ON shift_template (effective_from_ms, effective_to_ms);
    `);
    const started = this.db.prepare("SELECT value FROM statistics_meta WHERE key = 'collection_started_at'").get();
    if (!started) this.db.prepare("INSERT INTO statistics_meta (key, value) VALUES ('collection_started_at', ?)").run(String(this.now()));
    const open = this.db.prepare('SELECT * FROM operator_interval WHERE end_ms IS NULL ORDER BY id DESC').all();
    for (const stale of open.slice(1)) this.db.prepare('UPDATE operator_interval SET end_ms = start_ms WHERE id = ?').run(stale.id);
  }

  collectionStartedAt() {
    return Number(this.db.prepare("SELECT value FROM statistics_meta WHERE key = 'collection_started_at'").get().value);
  }

  #transaction(callback) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  activeOperator() {
    return rowToInterval(this.db.prepare('SELECT * FROM operator_interval WHERE end_ms IS NULL ORDER BY id DESC LIMIT 1').get());
  }

  openOperator(user, timestamp = this.now(), source = 'login') {
    if (!user || user.role !== 'operator') return null;
    const at = clampTimestamp(timestamp, this.now());
    return this.#transaction(() => {
      this.db.prepare('UPDATE operator_interval SET end_ms = ? WHERE end_ms IS NULL').run(at);
      const result = this.db.prepare(`INSERT INTO operator_interval
        (user_id, username, display_name, start_ms, end_ms, source) VALUES (?, ?, ?, ?, NULL, ?)`)
        .run(user.id, user.username, user.displayName, at, source);
      return rowToInterval(this.db.prepare('SELECT * FROM operator_interval WHERE id = ?').get(result.lastInsertRowid));
    });
  }

  closeActiveOperator(timestamp = this.now(), userId = null) {
    const at = clampTimestamp(timestamp, this.now());
    const statement = userId === null
      ? this.db.prepare('UPDATE operator_interval SET end_ms = MAX(start_ms, ?) WHERE end_ms IS NULL')
      : this.db.prepare('UPDATE operator_interval SET end_ms = MAX(start_ms, ?) WHERE end_ms IS NULL AND user_id = ?');
    return userId === null ? statement.run(at).changes : statement.run(at, Number(userId)).changes;
  }

  recordEquipment(states, timestamp = this.now()) {
    const at = clampTimestamp(timestamp, this.now());
    if (this.lastEquipmentTimestamp !== null && this.lastEquipmentStates && at > this.lastEquipmentTimestamp) {
      const elapsed = at - this.lastEquipmentTimestamp;
      if (elapsed <= 5_000) {
        for (const lane of LANES) this.#accumulateEquipment(lane, this.lastEquipmentStates[lane.id], this.lastEquipmentTimestamp, at);
      }
    }
    this.lastEquipmentTimestamp = at;
    this.lastEquipmentStates = states;
  }

  disconnectEquipment(timestamp = this.now()) {
    this.recordEquipment(this.lastEquipmentStates ?? {}, timestamp);
    this.lastEquipmentTimestamp = null;
    this.lastEquipmentStates = null;
  }

  #accumulateEquipment(lane, state, fromMs, toMs) {
    if (!state || state.category === 'no-data') return;
    const busy = state.category === lane.busy;
    const upsert = this.db.prepare(`INSERT INTO equipment_minute
      (bucket_ms, lane, scope_user_id, busy_ms, observed_ms, first_ms, last_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(bucket_ms, lane, scope_user_id) DO UPDATE SET
      busy_ms = busy_ms + excluded.busy_ms, observed_ms = observed_ms + excluded.observed_ms,
      first_ms = MIN(first_ms, excluded.first_ms), last_ms = MAX(last_ms, excluded.last_ms)`);
    const operatorScope = this.activeOperator()?.userId ?? -1;
    let cursor = fromMs;
    while (cursor < toMs) {
      const bucket = Math.floor(cursor / MINUTE_MS) * MINUTE_MS;
      const end = Math.min(toMs, bucket + MINUTE_MS);
      const value = end - cursor;
      upsert.run(bucket, lane.id, 0, busy ? value : 0, value, cursor, end);
      upsert.run(bucket, lane.id, operatorScope, busy ? value : 0, value, cursor, end);
      cursor = end;
    }
  }

  recordFact(event) {
    if (!event) return false;
    let kind = null;
    if ((event.eventType === 'alarm' || event.eventType === 'warning') && event.status === 'active') kind = event.eventType;
    if (event.eventType === 'operator-command' && event.status === 'accepted') kind = 'command-accepted';
    if (event.eventType === 'operator-command' && event.status === 'rejected') kind = 'command-rejected';
    if (!kind) return false;
    const active = this.activeOperator();
    this.db.prepare(`INSERT OR IGNORE INTO statistics_fact
      (source_event_id, timestamp_ms, kind, operator_user_id, actor_user_id, status, source_id, code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(event.id ?? null, event.timestampMs, kind, active?.userId ?? null, event.actor?.id ?? null,
        event.status ?? null, event.sourceId ?? null, event.code === null || event.code === undefined ? null : String(event.code));
    return true;
  }

  templates() {
    return this.db.prepare('SELECT * FROM shift_template WHERE effective_to_ms IS NULL ORDER BY name, id').all().map(rowToTemplate);
  }

  #assertNoTemplateOverlap(candidate, ignoreGroupId = null) {
    if (!candidate.enabled) return;
    const occupied = templateMinuteSet(candidate);
    for (const existing of this.templates()) {
      if (!existing.enabled || existing.groupId === ignoreGroupId) continue;
      const other = templateMinuteSet(existing);
      if ([...occupied].some((minute) => other.has(minute))) {
        throw new StatisticsStoreError(`Смена пересекается с «${existing.name}»`, 409, 'SHIFT_OVERLAP');
      }
    }
  }

  createTemplate(input) {
    const template = normalizeTemplate(input, this.timeZone);
    this.#assertNoTemplateOverlap(template);
    const now = this.now();
    const nextGroup = Number(this.db.prepare('SELECT COALESCE(MAX(group_id), 0) + 1 AS id FROM shift_template').get().id);
    const result = this.db.prepare(`INSERT INTO shift_template
      (group_id, name, days_json, start_minute, end_minute, timezone, enabled, effective_from_ms, effective_to_ms, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`).run(nextGroup, template.name, JSON.stringify(template.days),
      template.startMinute, template.endMinute, template.timezone, template.enabled ? 1 : 0, now, now, now);
    return rowToTemplate(this.db.prepare('SELECT * FROM shift_template WHERE id = ?').get(result.lastInsertRowid));
  }

  updateTemplate(id, input) {
    const current = rowToTemplate(this.db.prepare('SELECT * FROM shift_template WHERE id = ? AND effective_to_ms IS NULL').get(Number(id)));
    if (!current) throw new StatisticsStoreError('Шаблон смены не найден', 404, 'SHIFT_NOT_FOUND');
    const template = normalizeTemplate({ ...current, ...input }, this.timeZone);
    this.#assertNoTemplateOverlap(template, current.groupId);
    const now = this.now();
    return this.#transaction(() => {
      this.db.prepare('UPDATE shift_template SET effective_to_ms = ?, updated_at = ? WHERE id = ?').run(now, now, current.id);
      const result = this.db.prepare(`INSERT INTO shift_template
        (group_id, name, days_json, start_minute, end_minute, timezone, enabled, effective_from_ms, effective_to_ms, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`).run(current.groupId, template.name, JSON.stringify(template.days),
        template.startMinute, template.endMinute, template.timezone, template.enabled ? 1 : 0, now, now, now);
      return rowToTemplate(this.db.prepare('SELECT * FROM shift_template WHERE id = ?').get(result.lastInsertRowid));
    });
  }

  deleteTemplate(id) {
    const now = this.now();
    const result = this.db.prepare('UPDATE shift_template SET effective_to_ms = ?, updated_at = ? WHERE id = ? AND effective_to_ms IS NULL')
      .run(now, now, Number(id));
    if (!result.changes) throw new StatisticsStoreError('Шаблон смены не найден', 404, 'SHIFT_NOT_FOUND');
    return true;
  }

  shifts({ fromMs, toMs }) {
    const from = clampTimestamp(fromMs, 0);
    const to = clampTimestamp(toMs, this.now());
    const versions = this.db.prepare(`SELECT * FROM shift_template
      WHERE enabled = 1 AND effective_from_ms < ? AND (effective_to_ms IS NULL OR effective_to_ms > ?)`)
      .all(to, from - DAY_MS).map(rowToTemplate);
    const anchor = localParts(from - DAY_MS, this.timeZone);
    const result = [];
    for (let offset = 0; offset < Math.ceil((to - from) / DAY_MS) + 3; offset += 1) {
      const date = addLocalDays(anchor, offset);
      const weekday = dayOfWeek(date);
      for (const template of versions) {
        if (!template.days.includes(weekday)) continue;
        const startDate = { ...date, hour: Math.floor(template.startMinute / 60), minute: template.startMinute % 60 };
        const nextDay = template.endMinute <= template.startMinute ? addLocalDays(date, 1) : date;
        const endDate = { ...nextDay, hour: Math.floor(template.endMinute / 60), minute: template.endMinute % 60 };
        const startMs = zonedTimestamp(startDate, template.timezone);
        const endMs = zonedTimestamp(endDate, template.timezone);
        if (startMs < template.effectiveFromMs || (template.effectiveToMs !== null && startMs >= template.effectiveToMs)) continue;
        if (startMs < to && endMs > from) result.push({
          id: `${template.groupId}:${startMs}`, templateId: template.id, name: template.name, startMs, endMs,
        });
      }
    }
    return result.sort((left, right) => left.startMs - right.startMs);
  }

  resolvePeriod(preset, nowMs = this.now()) {
    const now = clampTimestamp(nowMs, this.now());
    if (preset === 'all') return { fromMs: this.collectionStartedAt(), toMs: now, label: 'Всё время' };
    if (preset === '24h') return { fromMs: now - DAY_MS, toMs: now, label: '24 часа' };
    if (preset === '7d') return { fromMs: now - 7 * DAY_MS, toMs: now, label: '7 дней' };
    if (preset === '30d') return { fromMs: now - 30 * DAY_MS, toMs: now, label: '30 дней' };
    const shifts = this.shifts({ fromMs: now - 14 * DAY_MS, toMs: now + DAY_MS });
    const current = shifts.find((shift) => shift.startMs <= now && shift.endMs > now);
    if (preset === 'current-shift') {
      return current
        ? { fromMs: current.startMs, toMs: Math.min(now, current.endMs), label: current.name, shift: current }
        : { fromMs: now - 12 * 60 * 60 * 1_000, toMs: now, label: 'Вне смены' };
    }
    if (preset === 'previous-shift') {
      const previous = shifts.filter((shift) => shift.endMs <= (current?.startMs ?? now)).at(-1);
      return previous
        ? { fromMs: previous.startMs, toMs: previous.endMs, label: previous.name, shift: previous }
        : { fromMs: now - DAY_MS, toMs: now, label: 'Предыдущие 24 часа' };
    }
    return { fromMs: now - 7 * DAY_MS, toMs: now, label: '7 дней' };
  }

  intervals({ fromMs, toMs, userId = null }) {
    const from = clampTimestamp(fromMs, 0);
    const to = clampTimestamp(toMs, this.now());
    const rows = userId === null
      ? this.db.prepare(`SELECT * FROM operator_interval WHERE start_ms < ? AND COALESCE(end_ms, ?) > ? ORDER BY start_ms`).all(to, to, from)
      : this.db.prepare(`SELECT * FROM operator_interval WHERE user_id = ? AND start_ms < ? AND COALESCE(end_ms, ?) > ? ORDER BY start_ms`).all(Number(userId), to, to, from);
    return rows.map(rowToInterval);
  }

  updateInterval(id, input) {
    const current = rowToInterval(this.db.prepare('SELECT * FROM operator_interval WHERE id = ?').get(Number(id)));
    if (!current) throw new StatisticsStoreError('Интервал не найден', 404, 'INTERVAL_NOT_FOUND');
    const startMs = clampTimestamp(input?.startMs, current.startMs);
    const endMs = clampTimestamp(input?.endMs, current.endMs ?? this.now());
    const userId = Number(input?.userId ?? current.userId);
    const username = String(input?.username ?? current.username).trim().slice(0, 32);
    const displayName = String(input?.displayName ?? current.displayName).trim().slice(0, 80);
    if (!Number.isInteger(userId) || userId <= 0 || !username || !displayName || endMs <= startMs) {
      throw new StatisticsStoreError('Некорректные границы или пользователь интервала');
    }
    this.db.prepare(`UPDATE operator_interval SET user_id = ?, username = ?, display_name = ?, start_ms = ?, end_ms = ?, source = 'admin-edit'
      WHERE id = ?`).run(userId, username, displayName, startMs, endMs, Number(id));
    return rowToInterval(this.db.prepare('SELECT * FROM operator_interval WHERE id = ?').get(Number(id)));
  }

  deleteInterval(id) {
    return this.db.prepare('DELETE FROM operator_interval WHERE id = ?').run(Number(id)).changes > 0;
  }

  hardDeleteRange({ fromMs, toMs, userId = null, equipment = true, facts = true, intervals = true }) {
    const from = clampTimestamp(fromMs, 0);
    const to = clampTimestamp(toMs, this.now());
    if (to <= from) throw new StatisticsStoreError('Окончание диапазона должно быть позже начала');
    return this.#transaction(() => {
      const result = { equipment: 0, facts: 0, intervals: 0 };
      if (equipment) {
        result.equipment = userId === null
          ? this.db.prepare('DELETE FROM equipment_minute WHERE bucket_ms < ? AND bucket_ms + ? > ?')
            .run(to, MINUTE_MS, from).changes
          : this.db.prepare('DELETE FROM equipment_minute WHERE bucket_ms < ? AND bucket_ms + ? > ? AND scope_user_id = ?')
            .run(to, MINUTE_MS, from, Number(userId)).changes;
      }
      if (facts) {
        result.facts = userId === null
          ? this.db.prepare('DELETE FROM statistics_fact WHERE timestamp_ms >= ? AND timestamp_ms < ?').run(from, to).changes
          : this.db.prepare(`DELETE FROM statistics_fact WHERE timestamp_ms >= ? AND timestamp_ms < ?
            AND (operator_user_id = ? OR actor_user_id = ?)`).run(from, to, Number(userId), Number(userId)).changes;
      }
      if (intervals) {
        const affected = this.intervals({ fromMs: from, toMs: to, userId });
        for (const item of affected) {
          const end = item.endMs ?? this.now();
          if (item.startMs < from && end > to) {
            this.db.prepare('UPDATE operator_interval SET end_ms = ? WHERE id = ?').run(from, item.id);
            this.db.prepare(`INSERT INTO operator_interval (user_id, username, display_name, start_ms, end_ms, source)
              VALUES (?, ?, ?, ?, ?, 'hard-delete-split')`).run(item.userId, item.username, item.displayName, to, item.endMs);
          } else if (item.startMs < from) this.db.prepare('UPDATE operator_interval SET end_ms = ? WHERE id = ?').run(from, item.id);
          else if (end > to) this.db.prepare('UPDATE operator_interval SET start_ms = ? WHERE id = ?').run(to, item.id);
          else this.db.prepare('DELETE FROM operator_interval WHERE id = ?').run(item.id);
          result.intervals += 1;
        }
      }
      return result;
    });
  }

  #selectionSegments(fromMs, toMs, userId) {
    const all = this.intervals({ fromMs, toMs }).map((item) => ({
      startMs: Math.max(fromMs, item.startMs), endMs: Math.min(toMs, item.endMs ?? toMs), userId: item.userId,
    }));
    if (userId === 'unassigned') return complementSegments(all, fromMs, toMs);
    if (userId !== null && userId !== undefined) return mergeSegments(all
      .filter((item) => item.userId === Number(userId)).map(({ startMs, endMs }) => ({ startMs, endMs })));
    return [{ startMs: fromMs, endMs: toMs }];
  }

  #equipmentSummary(fromMs, toMs, scopeUserId) {
    const result = Object.fromEntries(LANES.map((lane) => [lane.id, { lane: lane.id, label: lane.label, busyMs: 0, observedMs: 0, loadPercent: 0 }]));
    const rows = this.db.prepare(`SELECT * FROM equipment_minute
      WHERE scope_user_id = ? AND bucket_ms < ? AND bucket_ms + ? > ? ORDER BY bucket_ms`)
      .all(scopeUserId, toMs, MINUTE_MS, fromMs);
    for (const row of rows) {
      const bucketStart = Number(row.bucket_ms);
      const bucketEnd = bucketStart + MINUTE_MS;
      const dataStart = Math.max(bucketStart, Number(row.first_ms));
      const dataEnd = Math.min(bucketEnd, Number(row.last_ms));
      const selectedMs = overlapMs(dataStart, dataEnd, fromMs, toMs);
      if (selectedMs <= 0) continue;
      const factor = Math.min(1, selectedMs / Math.max(1, dataEnd - dataStart));
      const target = result[row.lane];
      if (!target) continue;
      target.busyMs += Number(row.busy_ms) * factor;
      target.observedMs += Number(row.observed_ms) * factor;
    }
    return LANES.map((lane) => {
      const item = result[lane.id];
      return { ...item, busyMs: Math.round(item.busyMs), observedMs: Math.round(item.observedMs),
        loadPercent: item.observedMs > 0 ? Number((item.busyMs / item.observedMs * 100).toFixed(1)) : 0 };
    });
  }

  #factsSummary(fromMs, toMs, userId) {
    let rows;
    if (userId === 'unassigned') {
      rows = this.db.prepare(`SELECT kind, COUNT(*) AS count FROM statistics_fact
        WHERE timestamp_ms >= ? AND timestamp_ms < ? AND operator_user_id IS NULL GROUP BY kind`).all(fromMs, toMs);
    } else if (userId !== null && userId !== undefined) {
      rows = this.db.prepare(`SELECT kind, COUNT(*) AS count FROM statistics_fact
        WHERE timestamp_ms >= ? AND timestamp_ms < ? AND
        ((kind IN ('alarm','warning') AND operator_user_id = ?) OR
         (kind LIKE 'command-%' AND actor_user_id = ?)) GROUP BY kind`).all(fromMs, toMs, Number(userId), Number(userId));
    } else {
      rows = this.db.prepare(`SELECT kind, COUNT(*) AS count FROM statistics_fact
        WHERE timestamp_ms >= ? AND timestamp_ms < ? GROUP BY kind`).all(fromMs, toMs);
    }
    const counts = Object.fromEntries(rows.map((row) => [row.kind, Number(row.count)]));
    return {
      alarmsActivated: counts.alarm ?? 0,
      warningsActivated: counts.warning ?? 0,
      commandsAccepted: counts['command-accepted'] ?? 0,
      commandsRejected: counts['command-rejected'] ?? 0,
    };
  }

  summary({ fromMs, toMs, userId = null, preset = null }) {
    const resolved = preset ? this.resolvePeriod(preset) : null;
    const from = Math.max(this.collectionStartedAt(), clampTimestamp(fromMs, resolved?.fromMs ?? this.collectionStartedAt()));
    const to = Math.max(from, Math.min(this.now(), clampTimestamp(toMs, resolved?.toMs ?? this.now())));
    const segments = this.#selectionSegments(from, to, userId);
    const allOperatorSegments = this.intervals({ fromMs: from, toMs: to }).map((item) => ({
      startMs: Math.max(from, item.startMs), endMs: Math.min(to, item.endMs ?? to),
    }));
    const scopeUserId = userId === null || userId === undefined ? 0 : userId === 'unassigned' ? -1 : Number(userId);
    const equipment = this.#equipmentSummary(from, to, scopeUserId);
    const selectedMs = durationMs(segments);
    const observedMs = equipment.find((item) => item.lane === 'robot')?.observedMs ?? 0;
    const facts = this.#factsSummary(from, to, userId);
    let experience = null;
    if (userId !== null && userId !== undefined && userId !== 'unassigned') {
      const allFrom = this.collectionStartedAt();
      const allSegments = this.#selectionSegments(allFrom, this.now(), Number(userId));
      const allEquipment = this.#equipmentSummary(allFrom, this.now(), Number(userId));
      const xp = Math.floor((allEquipment.find((item) => item.lane === 'robot')?.observedMs ?? 0) / MINUTE_MS);
      const level = Math.min(100, Math.floor((-270 + Math.sqrt(270 ** 2 + 120 * xp)) / 60) + 1);
      const index = level - 1;
      const currentThreshold = 30 * index * index + 270 * index;
      const nextIndex = Math.min(99, index + 1);
      const nextThreshold = 30 * nextIndex * nextIndex + 270 * nextIndex;
      experience = { xp, level, currentThreshold, nextThreshold, progressPercent: level >= 100 ? 100
        : Number(((xp - currentThreshold) / Math.max(1, nextThreshold - currentThreshold) * 100).toFixed(1)) };
    }
    const trendSpan = to - from <= 2 * DAY_MS ? 60 * 60 * 1_000 : DAY_MS;
    const trend = [];
    for (let cursor = Math.floor(from / trendSpan) * trendSpan; cursor < to; cursor += trendSpan) {
      const end = Math.min(to, cursor + trendSpan);
      const piece = this.#equipmentSummary(cursor, end, scopeUserId);
      trend.push({ timestampMs: cursor, loadPercent: Number((piece.reduce((sum, item) => sum + item.loadPercent, 0) / piece.length).toFixed(1)) });
    }
    return {
      collectionStartedAt: this.collectionStartedAt(),
      period: { fromMs: from, toMs: to, label: resolved?.label ?? 'Произвольный период' },
      scope: userId === null || userId === undefined ? 'cell' : userId === 'unassigned' ? 'unassigned' : 'operator',
      responsibilityMs: userId === null || userId === undefined ? 0 : selectedMs,
      unassignedMs: durationMs(complementSegments(allOperatorSegments, from, to)),
      coverageMs: observedMs,
      coveragePercent: selectedMs > 0 ? Number((observedMs / selectedMs * 100).toFixed(1)) : 0,
      equipment, ...facts, experience, trend,
      partialData: observedMs < selectedMs * 0.999,
    };
  }

  close() {
    this.db.close();
  }
}
