import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const CELL_EVENT_SOURCES = Object.freeze({
  1: 'Станок 1',
  2: 'Станок 2',
  3: 'Станок 3',
  4: 'Магазины',
  5: 'Робот',
  6: 'Оператор',
  7: 'Авария',
  8: 'Система и связь',
});

const MACHINE_STATES = [
  'Выключен', 'Ожидание выбора изделия', 'Ожидание подтверждения запуска',
  'Ожидание подтверждения двери', 'Ожидание', 'Операция выбрана', 'Чтение состояния',
  'Переход к следующему шагу', 'Освобождение интерфейса робота', 'Перемещение робота',
  'Действие робота', 'Открытие двери', 'Закрытие двери', 'Разжим патрона',
  'Зажим патрона', 'Запуск обработки', 'Завершено', 'Ошибка',
];
const MAGAZINE_STATES = [
  'Выключен', 'Ожидание', 'Выбор операции', 'Подготовка шага', 'Команда роботу',
  'Освобождение интерфейса робота', 'Переход к следующему шагу', 'Завершено', 'Ошибка',
];
const MAGAZINE_OPERATIONS = ['Нет операции', 'Положить деталь', 'Взять заготовку', 'Сменить деталь на заготовку', 'Вернуть заготовку'];
const ROBOT_ACTIONS = [
  'Нет действия', 'Движение к точке', 'Открыть захват 1', 'Закрыть захват 1',
  'Открыть захват 2', 'Закрыть захват 2', 'Повернуть к заготовке', 'Повернуть к детали',
];
const POINTS = [
  'Нет точки', 'Станок 1 — над станком', 'Станок 1 — внутри', 'Станок 1 — подход к патрону',
  'Станок 1 — позиция патрона', 'Станок 2 — над станком', 'Станок 2 — внутри',
  'Станок 2 — подход к патрону', 'Станок 2 — позиция патрона', 'Станок 3 — над станком',
  'Станок 3 — внутри', 'Станок 3 — подход к патрону', 'Станок 3 — позиция патрона',
  'Магазин — legacy detail', 'Магазин — legacy take', 'Магазин — legacy put',
  'Магазин — legacy change', 'HOME_SAFETY', 'Магазин — legacy return',
  'Магазин — безопасно над слотом', 'Магазин — внутри слота', 'Магазин — смена захвата над слотом',
];
const MODBUS_COMMANDS = {
  0: 'Нет команды', 2: 'Открыть захват 1', 3: 'Закрыть захват 1', 4: 'Открыть захват 2',
  5: 'Закрыть захват 2', 6: 'Повернуть к заготовке', 7: 'Повернуть к детали',
  10: POINTS[1], 11: POINTS[2], 12: POINTS[3], 13: POINTS[4], 14: POINTS[5], 15: POINTS[6],
  16: POINTS[7], 17: POINTS[8], 18: POINTS[9], 19: POINTS[10], 20: POINTS[11], 21: POINTS[12],
  22: POINTS[17], 23: POINTS[19], 24: POINTS[21], 25: POINTS[20],
};
const MODBUS_EXECUTION = ['Ожидание', 'Команда принята', 'Выполнение', 'Завершено', 'Ошибка', 'Остановлено'];
const ALARM_SOURCE = [
  'Ячейка', 'Робот', 'Станок 1', 'Станок 2', 'Станок 3', 'Магазин 1', 'Магазин 2',
  'Привод магазина 1', 'Привод магазина 2', 'Ось X', 'Ось Y', 'Ось Z', 'Группа осей',
  'Менеджер движения', 'Менеджер точек', 'Захват',
];

const numberValue = (values, path, fallback = 0) => {
  const raw = values[path];
  const value = Array.isArray(raw) && raw.length === 2
    ? Number(raw[0]) * 0x1_0000_0000 + Number(raw[1])
    : Number(raw);
  return Number.isFinite(value) ? value : fallback;
};
const boolValue = (values, path, fallback = false) =>
  typeof values[path] === 'boolean' ? values[path] : fallback;
const json = (value) => value === undefined ? null : JSON.stringify(value);
const parseJson = (value) => {
  if (value === null || value === '') return null;
  try { return JSON.parse(value); } catch { return value; }
};
const catalog = (values, code, fallback) => values[code] ?? `${fallback} ${code}`;

const rowToEvent = (row) => ({
  id: Number(row.id),
  timestampMs: Number(row.timestamp_ms),
  sourceId: Number(row.source_id),
  source: CELL_EVENT_SOURCES[row.source_id] ?? `Источник ${row.source_id}`,
  eventType: row.event_type,
  status: row.status,
  message: row.message,
  code: row.code,
  operationId: row.operation_id,
  commandSeq: row.command_seq === null ? null : Number(row.command_seq),
  requestId: row.request_id,
  oldValue: parseJson(row.old_value_json),
  newValue: parseJson(row.new_value_json),
  details: parseJson(row.details_json),
});

export class CellEventStore {
  constructor({ databasePath = ':memory:', retentionDays = 90 } = {}) {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.retentionMs = Math.max(1, Number(retentionDays) || 90) * 86_400_000;
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cell_event (
        id INTEGER PRIMARY KEY,
        timestamp_ms INTEGER NOT NULL,
        source_id INTEGER NOT NULL CHECK (source_id BETWEEN 1 AND 8),
        event_type TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT NOT NULL,
        code TEXT,
        operation_id TEXT,
        command_seq INTEGER,
        request_id TEXT,
        old_value_json TEXT,
        new_value_json TEXT,
        details_json TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_cell_event_timestamp ON cell_event (timestamp_ms DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_cell_event_source ON cell_event (source_id, timestamp_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_cell_event_status ON cell_event (status, timestamp_ms DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_cell_event_type ON cell_event (event_type, timestamp_ms DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_cell_event_operation ON cell_event (operation_id) WHERE operation_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_cell_event_command_seq ON cell_event (command_seq) WHERE command_seq IS NOT NULL;
    `);
    this.insertStatement = this.db.prepare(`INSERT INTO cell_event
      (timestamp_ms, source_id, event_type, status, message, code, operation_id, command_seq,
       request_id, old_value_json, new_value_json, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    this.recentStatement = this.db.prepare('SELECT * FROM cell_event ORDER BY timestamp_ms DESC, id DESC LIMIT ?');
    this.deleteExpired = this.db.prepare('DELETE FROM cell_event WHERE timestamp_ms < ?');
    this.countStatement = this.db.prepare('SELECT COUNT(*) AS count, MIN(timestamp_ms) AS oldest, MAX(timestamp_ms) AS newest FROM cell_event');
    this.lastPruneMs = 0;
  }

  record(event) {
    const timestampMs = Math.max(0, Math.round(event.timestampMs ?? Date.now()));
    const sourceId = Math.round(event.sourceId);
    if (!CELL_EVENT_SOURCES[sourceId]) throw new Error(`Недопустимый sourceId события: ${sourceId}`);
    const result = this.insertStatement.run(
      timestampMs, sourceId, String(event.eventType ?? 'state'), String(event.status ?? 'changed'),
      String(event.message ?? ''), event.code === undefined ? null : String(event.code),
      event.operationId ?? null, event.commandSeq ?? null, event.requestId ?? null,
      json(event.oldValue), json(event.newValue), json(event.details),
    );
    if (timestampMs - this.lastPruneMs >= 3_600_000) this.prune(timestampMs);
    return rowToEvent({
      id: result.lastInsertRowid, timestamp_ms: timestampMs, source_id: sourceId,
      event_type: event.eventType ?? 'state', status: event.status ?? 'changed', message: event.message ?? '',
      code: event.code === undefined ? null : String(event.code), operation_id: event.operationId ?? null,
      command_seq: event.commandSeq ?? null, request_id: event.requestId ?? null,
      old_value_json: json(event.oldValue), new_value_json: json(event.newValue), details_json: json(event.details),
    });
  }

  recent(limit = 2_000) {
    return this.recentStatement.all(Math.max(1, Math.min(10_000, Math.round(limit)))).map(rowToEvent);
  }

  query({
    fromMs, toMs, sourceIds = [], statuses = [], eventTypes = [], level = 'all', text = '',
    operationId = '', commandSeq, code = '', order = 'desc', cursor = null, limit = 100,
  } = {}) {
    const clauses = [];
    const parameters = [];
    const addList = (column, values) => {
      const normalized = [...new Set(values)].filter((value) => value !== '' && value !== null && value !== undefined);
      if (!normalized.length) return;
      clauses.push(`${column} IN (${normalized.map(() => '?').join(', ')})`);
      parameters.push(...normalized);
    };
    if (Number.isFinite(fromMs)) { clauses.push('timestamp_ms >= ?'); parameters.push(Math.round(fromMs)); }
    if (Number.isFinite(toMs)) { clauses.push('timestamp_ms <= ?'); parameters.push(Math.round(toMs)); }
    addList('source_id', sourceIds.map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 8));
    addList('status', statuses.map(String));
    addList('event_type', eventTypes.map(String));
    if (level === 'error') {
      clauses.push("(event_type = 'alarm' OR status IN ('error', 'rejected', 'lost'))");
    } else if (level === 'warning') {
      clauses.push("(event_type = 'warning' OR status = 'warning')");
    } else if (level === 'info') {
      clauses.push("(event_type NOT IN ('alarm', 'warning') AND status NOT IN ('error', 'rejected', 'lost', 'warning'))");
    }
    const trimmedText = String(text).trim();
    if (trimmedText) {
      const escaped = `%${trimmedText.replace(/[\\%_]/g, (value) => `\\${value}`)}%`;
      clauses.push(`(message LIKE ? ESCAPE '\\' OR event_type LIKE ? ESCAPE '\\'
        OR COALESCE(code, '') LIKE ? ESCAPE '\\' OR COALESCE(operation_id, '') LIKE ? ESCAPE '\\'
        OR COALESCE(request_id, '') LIKE ? ESCAPE '\\')`);
      parameters.push(escaped, escaped, escaped, escaped, escaped);
    }
    const trimmedOperationId = String(operationId).trim();
    if (trimmedOperationId) {
      clauses.push('operation_id = ?');
      parameters.push(trimmedOperationId);
    }
    if (Number.isInteger(Number(commandSeq)) && String(commandSeq).trim() !== '') {
      clauses.push('command_seq = ?');
      parameters.push(Number(commandSeq));
    }
    const trimmedCode = String(code).trim();
    if (trimmedCode) {
      clauses.push('code = ?');
      parameters.push(trimmedCode);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const count = Number(this.db.prepare(`SELECT COUNT(*) AS count FROM cell_event ${where}`).get(...parameters).count ?? 0);
    const ascending = order === 'asc';
    const pageClauses = [...clauses];
    const pageParameters = [...parameters];
    if (cursor && Number.isFinite(cursor.timestampMs) && Number.isInteger(Number(cursor.id))) {
      pageClauses.push(ascending
        ? '(timestamp_ms > ? OR (timestamp_ms = ? AND id > ?))'
        : '(timestamp_ms < ? OR (timestamp_ms = ? AND id < ?))');
      pageParameters.push(Math.round(cursor.timestampMs), Math.round(cursor.timestampMs), Number(cursor.id));
    }
    const pageWhere = pageClauses.length ? `WHERE ${pageClauses.join(' AND ')}` : '';
    const pageLimit = Math.max(1, Math.min(500, Math.round(limit) || 100));
    const direction = ascending ? 'ASC' : 'DESC';
    const rows = this.db.prepare(`SELECT * FROM cell_event ${pageWhere}
      ORDER BY timestamp_ms ${direction}, id ${direction} LIMIT ?`).all(...pageParameters, pageLimit + 1);
    const hasMore = rows.length > pageLimit;
    const pageRows = hasMore ? rows.slice(0, pageLimit) : rows;
    const last = pageRows.at(-1);
    return {
      events: pageRows.map(rowToEvent), count, hasMore,
      nextCursor: hasMore && last ? { timestampMs: Number(last.timestamp_ms), id: Number(last.id) } : null,
    };
  }

  prune(timestamp = Date.now()) {
    this.deleteExpired.run(Math.round(timestamp) - this.retentionMs);
    this.lastPruneMs = Math.round(timestamp);
  }

  status() {
    const row = this.countStatement.get();
    return {
      available: true,
      retentionDays: this.retentionMs / 86_400_000,
      events: Number(row.count ?? 0),
      oldestMs: row.oldest === null ? null : Number(row.oldest),
      newestMs: row.newest === null ? null : Number(row.newest),
    };
  }

  close() { this.db.close(); }
}

function modbusSnapshot(values) {
  return {
    mode: boolValue(values, 'xModbusMode') ? 'MODBUS_TCP' : 'SOFTMOTION',
    writeRegisters: Array.from({ length: 9 }, (_, index) => numberValue(values, `auiRobotModbusWriteRegisters[${index + 1}]`)),
    readRegisters: Array.from({ length: 17 }, (_, index) => numberValue(values, `auiRobotModbusReadRegisters[${index + 1}]`)),
  };
}

export class CellEventClassifier {
  constructor() {
    this.previous = null;
    this.activeOperationId = null;
    this.operationSequence = 0;
    this.alarms = new Map();
  }

  event(sourceId, eventType, status, message, extra = {}) {
    return { sourceId, eventType, status, message, operationId: this.activeOperationId, ...extra };
  }

  process(values, timestampMs = Date.now()) {
    const current = { ...values };
    if (this.previous === null) {
      this.previous = current;
      if (boolValue(current, 'stCellStatus.xRunning')) {
        this.operationSequence += 1;
        this.activeOperationId = `cycle-${timestampMs}-${this.operationSequence}`;
      }
      return this.alarmEvents(current, timestampMs, true).map((event) => ({ ...event, timestampMs }));
    }

    const previous = this.previous;
    const events = [];
    const changed = (path) => Object.hasOwn(current, path) && current[path] !== previous[path];
    const push = (event) => events.push({ timestampMs, ...event });

    if (changed('stCellStatus.xRunning')) {
      if (boolValue(current, 'stCellStatus.xRunning')) {
        this.operationSequence += 1;
        this.activeOperationId = `cycle-${timestampMs}-${this.operationSequence}`;
        push(this.event(6, 'cell-cycle', 'started', 'Оператор запустил автоматический цикл'));
      } else {
        push(this.event(6, 'cell-cycle', 'completed', 'Автоматический цикл остановлен'));
        this.activeOperationId = null;
      }
    }

    for (let machine = 1; machine <= 3; machine += 1) {
      const sourceId = machine;
      const status = `astMachineStatus[${machine}]`;
      const io = `astMachineIoStatus[${machine}]`;
      const diag = `astMachineDiag[${machine}]`;
      const transition = (path, eventType, message, state = 'changed') => {
        if (changed(path)) push(this.event(sourceId, eventType, state, message(), { oldValue: previous[path], newValue: current[path] }));
      };
      transition(`${status}.xEnabled`, 'power', () => boolValue(current, `${status}.xEnabled`) ? `Станок ${machine} включён` : `Станок ${machine} выключен`);
      transition(`${diag}.eState`, 'state', () => `Станок ${machine}: ${catalog(MACHINE_STATES, numberValue(current, `${diag}.eState`), 'состояние')}`);
      transition(`${io}.xDoorOpen`, 'door', () => boolValue(current, `${io}.xDoorOpen`) ? `Станок ${machine}: дверь открыта` : `Станок ${machine}: сигнал «дверь открыта» снят`);
      transition(`${io}.xDoorClosed`, 'door', () => boolValue(current, `${io}.xDoorClosed`) ? `Станок ${machine}: дверь закрыта` : `Станок ${machine}: сигнал «дверь закрыта» снят`);
      transition(`${io}.xChuckUnclamped`, 'chuck', () => boolValue(current, `${io}.xChuckUnclamped`) ? `Станок ${machine}: патрон разжат` : `Станок ${machine}: сигнал разжима патрона снят`);
      transition(`${io}.xChuckClamped`, 'chuck', () => boolValue(current, `${io}.xChuckClamped`) ? `Станок ${machine}: патрон зажат` : `Станок ${machine}: сигнал зажима патрона снят`);
      transition(`${status}.xProcessing`, 'processing', () => boolValue(current, `${status}.xProcessing`) ? `Станок ${machine}: обработка началась` : `Станок ${machine}: обработка завершилась`, boolValue(current, `${status}.xProcessing`) ? 'started' : 'completed');
      transition(`${status}.ePartState`, 'part', () => `Станок ${machine}: изменилось состояние изделия на код ${numberValue(current, `${status}.ePartState`)}`);
      transition(`${status}.ePartType`, 'part', () => `Станок ${machine}: тип изделия — ${numberValue(current, `${status}.ePartType`) === 1 ? 'готовая деталь' : numberValue(current, `${status}.ePartType`) === 2 ? 'заготовка' : 'не определён'}`);
    }

    for (let magazine = 1; magazine <= 2; magazine += 1) {
      const statusRoot = `astMagazineStatus[${magazine}]`;
      const diagRoot = `astMagazineDiag[${magazine}]`;
      const magazineTransition = (path, eventType, message, status = 'changed', details) => {
        if (changed(path)) push(this.event(4, eventType, status, message(), { oldValue: previous[path], newValue: current[path], details }));
      };
      magazineTransition(`${statusRoot}.xEnabled`, 'power', () => boolValue(current, `${statusRoot}.xEnabled`) ? `Магазин ${magazine} включён` : `Магазин ${magazine} выключен`);
      magazineTransition(`${diagRoot}.eState`, 'state', () => `Магазин ${magazine}: ${catalog(MAGAZINE_STATES, numberValue(current, `${diagRoot}.eState`), 'состояние')}`);
      magazineTransition(`${statusRoot}.eActualOperation`, 'operation', () => `Магазин ${magazine}: ${catalog(MAGAZINE_OPERATIONS, numberValue(current, `${statusRoot}.eActualOperation`), 'операция')}`);
      magazineTransition(`${statusRoot}.xBusy`, 'operation', () => boolValue(current, `${statusRoot}.xBusy`) ? `Магазин ${magazine} начал операцию` : `Магазин ${magazine} завершил операцию`, boolValue(current, `${statusRoot}.xBusy`) ? 'started' : 'completed', {
        magazine,
        selectedBlank: numberValue(current, `${statusRoot}.iSelectedBlank`),
        selectedFreeSlot: numberValue(current, `${statusRoot}.iSelectedFreeSlot`),
      });
      for (let zone = 1; zone <= 3; zone += 1) {
        const changedSlots = [];
        const slotCount = zone === 3 ? 60 : 120;
        for (let slot = 1; slot <= slotCount; slot += 1) {
          const path = `astMagazineInventory[${magazine}].aZone${zone}[${slot}].eDetailType`;
          if (changed(path)) changedSlots.push({ magazine, zone, slot, from: previous[path], to: current[path] });
        }
        if (changedSlots.length) push(this.event(4, 'slot-content', 'changed', changedSlots.length === 1
          ? `Магазин ${magazine}, Zone ${zone}: изменилось содержимое слота ${changedSlots[0].slot}`
          : `Магазин ${magazine}, Zone ${zone}: изменилось содержимое ${changedSlots.length} слотов`, { details: { magazine, zone, slots: changedSlots } }));
      }
    }

    const robotTransition = (path, eventType, message, status = 'changed', extra = {}) => {
      if (changed(path)) push(this.event(5, eventType, status, message(), { oldValue: previous[path], newValue: current[path], ...extra }));
    };
    robotTransition('xModbusMode', 'control-mode', () => boolValue(current, 'xModbusMode') ? 'Управление роботом переключено на Modbus TCP' : 'Управление роботом переключено на SoftMotion');
    if (changed('stRobotModbusStatus.xCommunicationAlive') && boolValue(current, 'xModbusMode')) {
      const alive = boolValue(current, 'stRobotModbusStatus.xCommunicationAlive');
      push(this.event(8, 'modbus-connection', alive ? 'restored' : 'lost',
        alive ? 'Обмен PLC с роботом по Modbus TCP восстановлен' : 'Обмен PLC с роботом по Modbus TCP потерян',
        { details: modbusSnapshot(current) }));
    }
    robotTransition('stRobotStatus.xBusy', 'command', () => boolValue(current, 'stRobotStatus.xBusy') ? 'Робот начал выполнение команды' : 'Робот освободил интерфейс команды', boolValue(current, 'stRobotStatus.xBusy') ? 'started' : 'completed');
    robotTransition('stRobotDiag.eActiveAction', 'action', () => `Робот: ${catalog(ROBOT_ACTIONS, numberValue(current, 'stRobotDiag.eActiveAction'), 'действие')}`);
    robotTransition('stRobotDiag.eActivePoint', 'target-point', () => `Робот движется: ${catalog(POINTS, numberValue(current, 'stRobotDiag.eActivePoint'), 'точка')}`);
    robotTransition('stRobotStatus.eCurrentPoint', 'current-point', () => `Робот достиг точки: ${catalog(POINTS, numberValue(current, 'stRobotStatus.eCurrentPoint'), 'точка')}`, 'completed');
    robotTransition('stRobotStatus.xGripper1Open', 'gripper', () => boolValue(current, 'stRobotStatus.xGripper1Open') ? 'Захват 1 открыт' : 'Захват 1 вышел из открытого состояния');
    robotTransition('stRobotStatus.xGripper1Closed', 'gripper', () => boolValue(current, 'stRobotStatus.xGripper1Closed') ? 'Захват 1 закрыт' : 'Захват 1 вышел из закрытого состояния');
    robotTransition('stRobotStatus.xGripper2Open', 'gripper', () => boolValue(current, 'stRobotStatus.xGripper2Open') ? 'Захват 2 открыт' : 'Захват 2 вышел из открытого состояния');
    robotTransition('stRobotStatus.xGripper2Closed', 'gripper', () => boolValue(current, 'stRobotStatus.xGripper2Closed') ? 'Захват 2 закрыт' : 'Захват 2 вышел из закрытого состояния');
    robotTransition('stRobotStatus.xRotatedToBlank', 'orientation', () => boolValue(current, 'stRobotStatus.xRotatedToBlank') ? 'Захват повёрнут к заготовке' : 'Ориентация к заготовке снята');
    robotTransition('stRobotStatus.xRotatedToDetail', 'orientation', () => boolValue(current, 'stRobotStatus.xRotatedToDetail') ? 'Захват повёрнут к готовой детали' : 'Ориентация к детали снята');

    const executionPath = 'stRobotModbusStatus.uiExecutionState';
    if (changed(executionPath) && boolValue(current, 'xModbusMode')) {
      const execution = numberValue(current, executionPath);
      const command = numberValue(current, 'stRobotModbusStatus.uiActiveCommand');
      const commandSeq = numberValue(current, 'stRobotModbusStatus.uiAckSeq') || numberValue(current, 'auiRobotModbusWriteRegisters[8]');
      const status = execution === 1 ? 'accepted' : execution === 2 ? 'started' : execution === 3 ? 'completed' : execution === 4 ? 'error' : execution === 5 ? 'stopped' : 'changed';
      push(this.event(5, 'modbus-command', status,
        `Modbus: ${catalog(MODBUS_EXECUTION, execution, 'состояние')}; ${MODBUS_COMMANDS[command] ?? `команда ${command}`}`,
        { commandSeq, code: numberValue(current, 'stRobotModbusStatus.uiResultCode'), details: modbusSnapshot(current) }));
    }

    const rejectionPaths = [
      ['uiRobotModeRejectReason', 'Переключение источника управления роботом отклонено PLC'],
      ['uiModbusSettingsRejectReason', 'Настройки Modbus отклонены PLC'],
    ];
    for (const [path, message] of rejectionPaths) {
      if (changed(path) && numberValue(current, path) > 0) push(this.event(6, 'plc-rejection', 'rejected',
        `${message}: причина ${numberValue(current, path)}`, { code: numberValue(current, path) }));
    }

    events.push(...this.alarmEvents(current, timestampMs, false));
    this.previous = current;
    return events;
  }

  alarmEvents(values, timestampMs, initial) {
    const events = [];
    const observed = new Set();
    for (let index = 1; index <= 100; index += 1) {
      const root = `astAlarmEvent[${index}]`;
      const sequence = numberValue(values, `${root}.udiSequence`);
      if (!sequence) continue;
      observed.add(sequence);
      const active = boolValue(values, `${root}.xActive`);
      const sourceCode = numberValue(values, `${root}.eSource`);
      const severity = numberValue(values, `${root}.eSeverity`) === 1 ? 'Предупреждение' : 'Авария';
      const code = numberValue(values, `${root}.uiCode`);
      const known = this.alarms.get(sequence);
      if (!known && active) {
        this.alarms.set(sequence, { active: true, seenAt: timestampMs });
        events.push({
          timestampMs, sourceId: 7, eventType: severity === 'Авария' ? 'alarm' : 'warning', status: 'active',
          message: `${severity}: ${ALARM_SOURCE[sourceCode] ?? `источник ${sourceCode}`}, код ${code}`,
          code: `${sourceCode}:${code}`, operationId: this.activeOperationId,
          details: { plcSequence: sequence, equipment: ALARM_SOURCE[sourceCode] ?? sourceCode, observedOnConnect: initial },
        });
      } else if (known?.active && !active) {
        known.active = false;
        events.push({
          timestampMs, sourceId: 7, eventType: severity === 'Авария' ? 'alarm' : 'warning', status: 'restored',
          message: `${severity} устранена: ${ALARM_SOURCE[sourceCode] ?? `источник ${sourceCode}`}, код ${code}`,
          code: `${sourceCode}:${code}`, operationId: this.activeOperationId,
          details: { plcSequence: sequence, equipment: ALARM_SOURCE[sourceCode] ?? sourceCode, durationMs: Math.max(0, timestampMs - known.seenAt) },
        });
      }
    }
    for (const sequence of observed) {
      if (!this.alarms.has(sequence)) this.alarms.set(sequence, { active: false, seenAt: timestampMs });
    }
    return events;
  }
}

const COMMAND_LABELS = {
  'cell.enable': 'Включить ячейку', 'cell.disable': 'Выключить ячейку', 'cell.start': 'Запустить цикл',
  'cell.stop': 'Остановить цикл', 'cell.reset': 'Сбросить аварии ячейки', 'cell.manual': 'Изменить режим ячейки',
  'cell.operatorChoice': 'Ответить на предпусковой опрос', 'cell.operatorCancel': 'Отменить предпусковой опрос',
  'alarms.resetWarnings': 'Сбросить предупреждения', 'robot.enableDrives': 'Включить приводы робота',
  'robot.disableDrives': 'Отключить приводы робота', 'robot.stop': 'Остановить робота',
  'robot.reset': 'Сбросить ошибки робота', 'robot.action': 'Ручная команда роботу',
  'robot.axis.jog': 'JOG оси робота', 'robot.axis.home': 'Базирование оси робота',
  'robot.axis.moveAbsolute': 'Абсолютное движение оси', 'robot.axis.moveRelative': 'Относительное движение оси',
  'robot.controlMode.set': 'Переключить источник управления роботом', 'robot.modbus.apply': 'Применить настройки Modbus',
  'magazine.enable': 'Включить магазин', 'magazine.disable': 'Выключить магазин',
  'magazine.powerOn': 'Включить привод магазина', 'magazine.powerOff': 'Выключить привод магазина',
  'magazine.home': 'Найти домашнюю позицию магазина', 'magazine.index': 'Переместить магазин в рабочую зону',
  'magazine.stop': 'Остановить привод магазина', 'magazine.reset': 'Сбросить ошибку магазина',
  'magazine.fillZone1': 'Заполнить Zone 1 заготовками', 'magazine.clearZone1': 'Очистить Zone 1',
  'magazine.setZone1Slot': 'Изменить содержимое слота Zone 1',
};

export function describeOperatorCommand(message) {
  const command = String(message.command ?? 'unknown');
  const label = COMMAND_LABELS[command]
    ?? (command.startsWith('machine.') ? `Команда станку ${message.machine}: ${command.slice(8)}`
      : command.startsWith('fault.') ? `Диагностическая команда: ${command.slice(6)}`
        : command.startsWith('robot.modbus.') ? `Изменить настройку Modbus: ${command.slice(13)}`
          : `Команда HMI: ${command}`);
  const details = Object.fromEntries(Object.entries(message)
    .filter(([key]) => !['type', 'requestId', 'command'].includes(key)));
  return { label, details };
}
