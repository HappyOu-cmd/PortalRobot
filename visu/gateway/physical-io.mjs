import map from '../../DOKS/22-physical-io-map.json' with { type: 'json' };

export const ioCatalog = map.channels.map(({ direction, index, category, label, variable, address, terminal, installed, unbound }) =>
  ({ direction, index, category, label, variable, address, terminal, installed, unbound: Boolean(unbound) }));
const byIndex = new Map(ioCatalog.map((signal) => [`${signal.direction}:${signal.index}`, signal]));
export const ioJournalPaths = Array.from({ length: 100 }, (_, i) => `asIoJournal[${i + 1}]`);
export const ioStatePaths = [
  'udiIoBootCounter', 'udiIoJournalRevision', 'udiIoJournalSequence', 'uiIoJournalHead', 'uiIoJournalCount', 'sIoClockMs',
  'xIoOverrideAllowed', 'uiIoOverrideBlockReason', 'uiIoForcedCount', 'xPhysicalIoMappingVerified',
  'xIoDoOverrideAllowed', 'uiIoDoBlockReason', 'xIoEmergencyStopActive', 'xIoEmergencyResetAllowed',
  'xIoManualControlActive', 'xIoManualStartAllowed',
  ...['adwIoRawDi', 'adwIoUsedDi', 'adwIoForcedDi'].flatMap((name) => [1, 2, 3].map((i) => `${name}[${i}]`)),
  ...[1, 2].map((i) => `adwIoDo[${i}]`),
  ...['adwIoDoAllowed', 'adwIoDoOnAllowed', 'adwIoForcedDo', 'adwIoInhibitedDo'].flatMap((name) => [1, 2].map((i) => `${name}[${i}]`)),
];
export const ioCommandPaths = [
  'uiIoOverrideIndex', 'uiIoOverrideAction', 'xIoOverrideValue', 'udiIoOverrideIssuedAtMs',
  'udiIoOverrideCommandSeq', 'udiIoOverrideAckSeq', 'uiIoOverrideResult', 'udiIoOverrideHeartbeat', 'udiIoOverrideHeartbeatAtMs',
  'uiIoEmergencyAction', 'udiIoEmergencyIssuedAtMs', 'udiIoEmergencyCommandSeq', 'udiIoEmergencyAckSeq', 'uiIoEmergencyResult',
];
export const ioSymbols = [...ioStatePaths, ...ioJournalPaths, ...ioCommandPaths];
export const ioSymbolSet = new Set(ioSymbols.filter((path) => path !== 'xPhysicalIoMappingVerified'));
const integer = (value, max = 0xffffffff) => Number.isInteger(value) && value >= 0 && value <= max;

export function parseIoEvent(text) {
  if (typeof text !== 'string' || !/^\d+;\d+;[12];\d+;[1-9];[01];[01]$/.test(text)) throw new Error('Некорректная запись FIFO I/O');
  const [sequence, timeMs, directionCode, index, kind, oldBit, newBit] = text.split(';').map(Number);
  const direction = directionCode === 1 ? 'DI' : 'DO';
  if (!integer(sequence) || sequence === 0 || !Number.isSafeInteger(timeMs) || !byIndex.has(`${direction}:${index}`)
      || (direction === 'DO' ? ![3, 7, 8, 9].includes(kind) : ![1, 2, 4, 5, 6].includes(kind))) throw new Error('Некорректные поля FIFO I/O');
  return { sequence, timeMs, direction, index, kind, oldValue: Boolean(oldBit), newValue: Boolean(newBit) };
}

function ioHeader(values) {
  const epoch = values.udiIoBootCounter, sequence = values.udiIoJournalSequence;
  const count = values.uiIoJournalCount, head = values.uiIoJournalHead;
  const clockMs = Number(values.sIoClockMs);
  if (!integer(epoch) || !epoch || !integer(sequence) || !integer(count, 100) || !integer(head, 100)
      || count !== Math.min(sequence, 100) || (count > 0 && head !== ((sequence - 1) % 100) + 1)
      || (count === 0 && head !== 0) || !Number.isSafeInteger(clockMs) || clockMs < 0
      || typeof values.xIoOverrideAllowed !== 'boolean') throw new Error('PLC не публикует целостный снимок I/O');
  return { epoch, sequence, count, head, clockMs };
}

export function decodeIoSnapshot(values, observedAt = Date.now(), cachedEvents = new Map()) {
  const { epoch, sequence, count, head, clockMs } = ioHeader(values);
  const bits = (name, length) => {
    const words = Array.from({ length: Math.ceil(length / 32) }, (_, i) => values[`${name}[${i + 1}]`]);
    if (!words.every((word) => integer(word))) throw new Error(`Нет данных ${name}`);
    return Array.from({ length }, (_, i) => Boolean((words[Math.floor(i / 32)] >>> (i % 32)) & 1));
  };
  const history = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const slot = ((head - 1 - i + 100) % 100) + 1;
    const event = cachedEvents.get(sequence - i) ?? parseIoEvent(values[`asIoJournal[${slot}]`]);
    if (event.sequence !== sequence - i || event.timeMs > clockMs) throw new Error('FIFO I/O изменился во время чтения');
    history.push({ ...event, timestampMs: observedAt - (clockMs - event.timeMs) });
  }
  return {
    available: true, observedAt, epoch, sequence, clockMs,
    allowed: values.xIoOverrideAllowed,
    blockReason: values.uiIoOverrideBlockReason,
    mappingVerified: values.xPhysicalIoMappingVerified === true,
    rawDi: bits('adwIoRawDi', 84), usedDi: bits('adwIoUsedDi', 84), forcedDi: bits('adwIoForcedDi', 84),
    outputs: bits('adwIoDo', 50), history,
    doAllowed: values.xIoDoOverrideAllowed === true, doBlockReason: values.uiIoDoBlockReason,
    manualActive: values.xIoManualControlActive === true, manualStartAllowed: values.xIoManualStartAllowed === true,
    allowedDo: bits('adwIoDoAllowed', 50), allowedDoOn: bits('adwIoDoOnAllowed', 50), forcedDo: bits('adwIoForcedDo', 50), inhibitedDo: bits('adwIoInhibitedDo', 50),
    emergencyActive: values.xIoEmergencyStopActive === true, emergencyResetAllowed: values.xIoEmergencyResetAllowed === true,
  };
}

// Live masks are best-effort display values; command permissions remain in PLC.
// FIFO records are immutable within a boot and validated by their own Seq.
// The whole-snapshot revision changes every IEC scan and cannot guard a
// multi-request network read. Cache accepted records and fetch only new slots.
export async function readStableIo(read, { now = Date.now, attempts = 2, previous = null } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const values = await read(ioStatePaths);
    try {
      const header = ioHeader(values);
      const sameBoot = previous?.epoch === header.epoch && header.clockMs >= previous.clockMs
        && header.sequence >= previous.sequence;
      const cached = new Map(sameBoot ? previous.history.map(event => [event.sequence, event]) : []);
      const missing = [];
      for (let seq = Math.max(1, header.sequence - 99); seq <= header.sequence; seq++) {
        if (!cached.has(seq)) missing.push(`asIoJournal[${((seq - 1) % 100) + 1}]`);
      }
      if (missing.length) {
        Object.assign(values, await read(missing));
        const after = await read(['udiIoBootCounter', 'udiIoJournalSequence', 'sIoClockMs']);
        // Growth is allowed: accept a validated older window and fetch the rest
        // next poll. Never combine records across a restart/sequence reset.
        if (after.udiIoBootCounter !== header.epoch || !integer(after.udiIoJournalSequence)
          || after.udiIoJournalSequence < header.sequence || Number(after.sIoClockMs) < header.clockMs
          || !Number.isSafeInteger(Number(after.sIoClockMs))) throw new Error('FIFO I/O сменил эпоху во время чтения');
      }
      return decodeIoSnapshot(values, now(), cached);
    } catch (error) { lastError = error; }
  }
  throw lastError ?? new Error('FIFO I/O обновляется: ожидаем целостный снимок');
}

const KIND_LABELS = { 1: 'Физический вход', 2: 'Программное состояние DI', 3: 'Выход DO', 4: 'Ручная подмена', 5: 'Подмена снята', 6: 'Подмена снята PLC',
  7: 'Ручная команда DO', 8: 'DO возвращён оператором', 9: 'DO возвращён программе' };
const sourceFor = (signal) => Number(signal.variable.match(/Machine([1-3])/)?.[1])
  || (/Magazine|Gk/.test(signal.variable) ? 4 : /Gripper|Rotated/.test(signal.variable) ? 5 : 8);

export function ioArchiveEvent(edge, { epoch, bootTimeMs }) {
  const signal = byIndex.get(`${edge.direction}:${edge.index}`);
  return {
    timestampMs: bootTimeMs + edge.timeMs, sourceId: sourceFor(signal), eventType: 'physical-io', status: 'changed',
    code: `io:physical:${signal.direction}:${signal.variable}:${epoch}:${bootTimeMs}:${edge.sequence}`,
    message: `${signal.category} · ${signal.label}: ${KIND_LABELS[edge.kind]} ${Number(edge.oldValue)} → ${Number(edge.newValue)}`,
    oldValue: edge.oldValue, newValue: edge.newValue,
    details: { ...signal, plcSequence: edge.sequence, plcTimeMs: edge.timeMs, epoch, bootTimeMs, kind: edge.kind },
  };
}

// Cursor сохраняется в SQLite, чтобы reconnect/перезапуск gateway не дублировал 100 записей.
export class IoJournalIngestor {
  constructor({ readCursor = () => null, writeCursor = () => {}, record = () => true } = {}) {
    Object.assign(this, { readCursor, writeCursor, record });
    this.cursor = null;
    this.lastClockMs = null;
  }
  consume(snapshot) {
    const old = this.cursor ?? this.readCursor();
    const origin = Math.round(snapshot.observedAt - snapshot.clockMs);
    const sameBoot = old?.epoch === snapshot.epoch && snapshot.sequence >= old.sequence
      && (this.cursor !== null ? this.lastClockMs !== null && snapshot.clockMs >= this.lastClockMs : Math.abs(origin - old.bootTimeMs) < 5000);
    const cursor = sameBoot ? { ...old } : { epoch: snapshot.epoch, bootTimeMs: origin, sequence: 0 };
    this.cursor = cursor;
    this.lastClockMs = snapshot.clockMs;
    const oldest = snapshot.sequence - snapshot.history.length + 1;
    const lost = Math.max(0, oldest - cursor.sequence - 1);
    if (lost > 0) {
      const saved = this.record({ timestampMs: snapshot.observedAt, sourceId: 8, eventType: 'physical-io-gap', status: 'warning',
        code: `io:gap:${cursor.epoch}:${cursor.bootTimeMs}:${oldest}`,
        message: `FIFO I/O переполнен до чтения: недоступно ${lost} переключений`,
        details: { lost, oldestSequence: oldest, lastArchivedSequence: cursor.sequence, epoch: cursor.epoch } });
      if (!saved) return;
      cursor.sequence = oldest - 1;
    }
    for (const edge of snapshot.history) {
      if (edge.sequence <= cursor.sequence) continue;
      if (!this.record(ioArchiveEvent(edge, cursor))) break;
      cursor.sequence = edge.sequence;
    }
    this.cursor = cursor;
    if (!old || cursor.sequence !== old.sequence || cursor.epoch !== old.epoch || cursor.bootTimeMs !== old.bootTimeMs) this.writeCursor(cursor);
  }
}
