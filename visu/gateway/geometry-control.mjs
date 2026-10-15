import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const geometryCallFields = ['udiId', 'uiMachine', 'uiProductType', 'uiStation', 'xForced', 'uiState', 'uiReason', 'uiMagazine', 'uiPallet', 'uiSlot'];
export const geometryConfigFields = ['xConfigured', 'lrX', 'lrY', 'lrZ', 'lrSafeZ', 'lrChangeZ', 'lrSpeedFactor'];
export const geometryStatusFields = ['uiState', 'xEnabled', 'xReady', 'xOccupied', 'xReserved', 'xPartStored', 'xPartAtEnd', 'xDriveRunning', 'xDriveAlarm', 'xError', 'xRobotStopRequired', 'xEnableAllowed', 'xDisableAllowed', 'xConfirmAllowed', 'xConfirmationActive', 'xRecoveryRequired', 'xManualStartAllowed', 'xResetAllowed', 'xResetBusy', 'xConfigAllowed', 'xPointWriteAllowed', 'xSimulationRemoveAllowed', 'xSimulationAlarmAllowed', 'xConfigured', 'udiProducedPartsTotal', 'udiPartId', 'uiMachine', 'uiProductType', 'rTravel', 'dwEnableBlockers', 'dwConfirmBlockers', 'xCallWaitWarning', 'xDisablePending'];
export const geometryEventSymbols = Array.from({ length: 100 }, (_, i) => [`astGeometryEvents[${i + 1}].udiSequence`, `astGeometryEvents[${i + 1}].udiTimeMs`, `astGeometryEvents[${i + 1}].uiEnvironment`, ...geometryCallFields.map(f => `astGeometryEvents[${i + 1}].Call.${f}`)]).flat();
export const geometryEventSymbolSet = new Set(geometryEventSymbols);
export const geometrySymbols = ['udiGeometryCommandSeq', 'udiGeometryIssuedAtMs', 'udiGeometryAckSeq', 'uiGeometryResult', 'udiGeometryEventSequence', 'xGeometryAutoEnabled', 'xGeometryAutoChangeAllowed', 'xGeometrySupported', 'xGeometryWaitWhenOccupied', 'xGeometrySettingsAllowed', 'tGeometryTransportTimeout', 'tGeometryFeedbackTimeout', 'tGeometryResetPulse', 'tGeometryWaitWarningTimeout',
  ...['uiAction', 'uiStation', 'uiMachine', 'udiValue'].map(f => `stGeometryRequest.${f}`),
  ...geometryConfigFields.flatMap(f => [`stGeometryRequest.Config.${f}`, `stGeometryCapture.${f}`]),
  ...[1, 2].flatMap(i => [...geometryStatusFields.map(f => `astGeometryStatus[${i}].${f}`), ...geometryConfigFields.map(f => `astGeometryConfig[${i}].${f}`), `audiGeometryStopSeq[${i}]`, `audiGeometryStopAck[${i}]`, `audiGeometryProducedNormal[${i}]`, `audiGeometryProducedSimulation[${i}]`]),
  ...[1, 2, 3].flatMap(i => [...geometryCallFields.map(f => `astGeometryCalls[${i}].${f}`), `auiGeometryPeriod[${i}]`, `auiGeometryCount[${i}]`, `axGeometryCallAllowed[${i}]`, `axGeometryCancelAllowed[${i}]`]), ...geometryEventSymbols];

const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
export async function executeGeometryCommand(message, { channel, write, types }) {
  const station = message.magazine ?? 0, machine = message.machine ?? 0, action = message.action;
  if (!integer(action, 1, 16) || !integer(station, 0, 2) || !integer(machine, 0, 5)) throw new Error('Неверная команда ГК');
  if ([1, 2, 3, 4, 5, 6, 7, 11, 13, 14, 15].includes(action) && ![1, 2].includes(station)) throw new Error('Выберите ГК 1 или 2');
  if ([8, 12].includes(action) && ![1, 2, 3].includes(machine)) throw new Error('Выберите станок 1–3');
  const value = Number(message.value ?? 0);
  if (!integer(value, 0, action === 16 && machine === 5 ? 3600000 : 600000) || (action === 9 && value > 1) || (action === 10 && (!integer(value, 1, 10000) || machine > 3))
    || (action === 16 && (!integer(machine, 1, 5) || (machine === 1 && value > 1) || (machine > 1 && value < (machine === 5 ? 1000 : 100)) || (machine === 3 && value > 60000) || (machine === 4 && value > 10000)))) throw new Error('Неверная настройка ГК');
  // Stop has its own counter and never waits for the configuration payload.
  if (action === 6) return { path: `audiGeometryStopSeq[${station}]`, sequence: await channel.run({ request: `audiGeometryStopSeq[${station}]`, ack: `audiGeometryStopAck[${station}]` }) };
  // CHANGE остаётся в OPC UA-контракте, но отдельной высоты больше нет.
  const config = message.geometryConfig && { ...message.geometryConfig, lrChangeZ: message.geometryConfig.lrSafeZ };
  if (action === 11) {
    const c = config;
    if (!c || !['lrX', 'lrY', 'lrZ', 'lrSafeZ', 'lrSpeedFactor'].every(f => Number.isFinite(c[f]) && Math.abs(c[f]) <= 1e7)
      || c.lrSpeedFactor < 0.1 || c.lrSpeedFactor > 1 || c.lrSafeZ >= 0 || c.lrSafeZ < -10000) throw new Error('Некорректная базовая точка ГК или смещение SAFE_Z');
  }
  const sequence = await channel.run({ request: 'udiGeometryCommandSeq', ack: 'udiGeometryAckSeq', result: 'uiGeometryResult', issued: 'udiGeometryIssuedAtMs' }, async () => {
    await write('stGeometryRequest.uiAction', types.UInt16, action);
    await write('stGeometryRequest.uiStation', types.UInt16, station);
    await write('stGeometryRequest.uiMachine', types.UInt16, machine);
    await write('stGeometryRequest.udiValue', types.UInt32, value);
    if (action === 11) for (const f of geometryConfigFields.filter(f => f !== 'xConfigured')) await write(`stGeometryRequest.Config.${f}`, types.Double, config[f]);
  }, result => { if (result !== 1) throw new Error(result === 4 ? 'Команда ГК устарела' : 'PLC отклонил команду ГК; проверьте условия и журнал'); });
  return { path: 'udiGeometryCommandSeq', sequence };
}

const delta = (a, b) => (a - b) >>> 0;
export async function readGeometryEvents(read, cursor) {
  const head = await read(['udiGeometryEventSequence', 'udiHmiCommandClockMs']);
  const sequence = Number(head.udiGeometryEventSequence) >>> 0;
  if (!sequence || sequence === cursor.sequence) return { sequence, events: [], clockMs: Number(head.udiHmiCommandClockMs) >>> 0, reset: false };
  const reset = cursor.sequence > 0 && delta(sequence, cursor.sequence) >= 0x80000000;
  const distance = reset || !cursor.sequence ? sequence : delta(sequence, cursor.sequence);
  const zeroSkipped = !reset && cursor.sequence > 0 && sequence < cursor.sequence ? 1 : 0;
  const count = Math.min(100, distance);
  const sequences = Array.from({ length: count }, (_, i) => (sequence - count + i + 1) >>> 0).filter(Boolean);
  const paths = sequences.flatMap(seq => { const root = `astGeometryEvents[${((seq - 1) % 100) + 1}]`; return [`${root}.udiSequence`, `${root}.udiTimeMs`, `${root}.uiEnvironment`, ...geometryCallFields.map(f => `${root}.Call.${f}`)]; });
  const values = await read(paths);
  const after = await read(['udiGeometryEventSequence']);
  if (Number(after.udiGeometryEventSequence) !== sequence) throw new Error('Снимок журнала ГК изменился; чтение будет повторено');
  const events = sequences.flatMap(seq => {
    const root = `astGeometryEvents[${((seq - 1) % 100) + 1}]`;
    if (Number(values[`${root}.udiSequence`]) !== seq) return [];
    const call = Object.fromEntries(geometryCallFields.map(f => [f, values[`${root}.Call.${f}`]]));
    return [{ sequence: seq, timeMs: Number(values[`${root}.udiTimeMs`]) >>> 0, environment: Number(values[`${root}.uiEnvironment`]), call }];
  });
  return { sequence, events, clockMs: Number(head.udiHmiCommandClockMs) >>> 0, reset, missing: Math.max(0, distance - zeroSkipped - events.length) };
}

export const geometryStateLabels = ['', 'Вызвана', 'В захвате / ждёт свободный ГК', 'Доставка на ГК', 'Уложена на ГК', 'Уложена в магазин', 'Вызов отменён', 'Передача прервана', 'Изъята из ГК'];
export const geometryReasons = ['', 'оба ГК заняты', 'нет доступного включённого ГК', 'ГК отключён', 'авария ГК', 'перезапуск или неопределённое положение'];
export function geometryEventMessage(call) {
  const prefix = `Деталь типа ${call.uiProductType} со станка ${call.uiMachine}`;
  if (call.uiState === 5) return `${prefix} не поставлена на ГК (${geometryReasons[call.uiReason] || 'станция недоступна'}); уложена в магазин ${call.uiMagazine}${call.uiPallet ? `, палета ${call.uiPallet}` : ''}, слот ${call.uiSlot}`;
  return `${prefix}: ${geometryStateLabels[call.uiState] || 'изменение вызова'}${call.uiStation ? ` · ГК ${call.uiStation}` : ''}`;
}

export class GeometryControlStore {
  constructor({ databasePath, now = Date.now }) {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath); this.now = now;
    this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS geometry_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS geometry_events (epoch INTEGER NOT NULL, sequence INTEGER NOT NULL, timestamp_ms INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(epoch, sequence));
      CREATE TABLE IF NOT EXISTS geometry_calls (key TEXT PRIMARY KEY, epoch INTEGER NOT NULL, call_id INTEGER NOT NULL, environment INTEGER NOT NULL, station INTEGER NOT NULL, machine INTEGER NOT NULL, state INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL, result TEXT NOT NULL DEFAULT 'unchecked', revision INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS geometry_results (id INTEGER PRIMARY KEY, call_key TEXT NOT NULL, timestamp_ms INTEGER NOT NULL, result TEXT NOT NULL, actor_id INTEGER NOT NULL, actor_name TEXT NOT NULL, revision INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS geometry_calls_station ON geometry_calls(station, updated_at);`);
  }
  cursor() { return JSON.parse(this.db.prepare("SELECT value FROM geometry_meta WHERE key='cursor'").get()?.value || '{"sequence":0,"epoch":0}'); }
  ingest(snapshot) {
    if (!snapshot.sequence) return [];
    const previous = this.cursor(); const epoch = previous.epoch + (snapshot.reset ? 1 : 0); const emitted = [];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const event of snapshot.events) {
        const call = event.call;
        if (!integer(call.udiId, 1, 0xffffffff) || !integer(call.uiMachine, 1, 3) || !integer(call.uiState, 1, 8) || !integer(call.uiStation, 0, 2)) throw new Error('Некорректная запись PLC в журнале ГК');
        const age = delta(snapshot.clockMs, event.timeMs), timestamp = this.now() - (age < 86400000 ? age : 0);
        const payload = JSON.stringify({ ...call, environment: event.environment });
        if (!this.db.prepare('INSERT OR IGNORE INTO geometry_events VALUES(?,?,?,?)').run(epoch, event.sequence, timestamp, payload).changes) continue;
        const key = `${epoch}:${event.environment}:${call.udiId}`;
        this.db.prepare(`INSERT INTO geometry_calls(key,epoch,call_id,environment,station,machine,state,created_at,updated_at,payload) VALUES(?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(key) DO UPDATE SET station=excluded.station,state=excluded.state,updated_at=excluded.updated_at,payload=excluded.payload`).run(key, epoch, call.udiId, event.environment, call.uiStation, call.uiMachine, call.uiState, timestamp, timestamp, payload);
        emitted.push({ timestampMs: timestamp, sourceId: 9, eventType: 'geometry-control', status: call.uiState === 5 ? 'warning' : call.uiState === 7 ? 'error' : [4, 8].includes(call.uiState) ? 'completed' : call.uiState === 6 ? 'cancelled' : 'started', message: geometryEventMessage(call), code: `geometry:${epoch}:${event.sequence}`, details: { ...call, environment: event.environment, callKey: key } });
      }
      this.db.prepare("INSERT INTO geometry_meta VALUES('cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({ sequence: snapshot.sequence, epoch }));
      this.db.exec('COMMIT'); return emitted;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  query({ station = 0, history = false, limit = 200 } = {}) {
    if (!integer(station, 0, 2)) throw new Error('Неверный фильтр ГК');
    return this.db.prepare(`SELECT * FROM geometry_calls WHERE (?=0 OR station=?) AND (?=0 OR state IN (4,5,8)) ORDER BY updated_at DESC LIMIT ?`).all(station, station, history ? 1 : 0, Math.min(500, Math.max(1, Number(limit) || 200))).map(row => {
      const c = JSON.parse(row.payload);
      return { key: row.key, id: c.udiId, machine: c.uiMachine, productType: c.uiProductType, station: c.uiStation, forced: Boolean(c.xForced), state: c.uiState, reason: c.uiReason, magazine: c.uiMagazine, pallet: c.uiPallet, slot: c.uiSlot, environment: row.environment,
        createdAt: row.created_at, updatedAt: row.updated_at, result: row.result, revision: row.revision,
        results: this.db.prepare('SELECT timestamp_ms AS timestampMs,result,actor_id AS actorId,actor_name AS actorName,revision FROM geometry_results WHERE call_key=? ORDER BY id').all(row.key) };
    });
  }
  setResult(key, result, revision, actor) {
    if (!['unchecked', 'good', 'defect'].includes(result) || !integer(revision, 0, 0xffffffff) || !actor?.id) throw new Error('Неверный результат контроля');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT state,revision FROM geometry_calls WHERE key=?').get(key);
      if (!row || ![4, 5, 8].includes(row.state)) throw new Error('Деталь ещё не уложена; результат контроля недоступен');
      if (row.revision !== revision) throw new Error('Результат уже изменён другим оператором; обновите журнал');
      const next = revision + 1, at = this.now();
      this.db.prepare('UPDATE geometry_calls SET result=?,revision=? WHERE key=?').run(result, next, key);
      this.db.prepare('INSERT INTO geometry_results(call_key,timestamp_ms,result,actor_id,actor_name,revision) VALUES(?,?,?,?,?,?)').run(key, at, result, actor.id, actor.displayName || actor.username, next);
      this.db.exec('COMMIT'); return { key, result, revision: next, timestampMs: at };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
