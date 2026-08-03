import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

export const CYCLOGRAM_LANES = Object.freeze([
  { id: 'robot', label: 'Робот', kind: 'robot' },
  { id: 'machine-1', label: 'Станок 1', kind: 'machine' },
  { id: 'machine-2', label: 'Станок 2', kind: 'machine' },
  { id: 'machine-3', label: 'Станок 3', kind: 'machine' },
]);

const LANE_BY_ID = new Map(CYCLOGRAM_LANES.map((lane) => [lane.id, lane]));
const POINT_CATALOG = new Map([
  [1, { kind: 'machine', machine: 1 }], [2, { kind: 'machine', machine: 1 }],
  [3, { kind: 'machine', machine: 1 }], [4, { kind: 'machine', machine: 1 }],
  [5, { kind: 'machine', machine: 2 }], [6, { kind: 'machine', machine: 2 }],
  [7, { kind: 'machine', machine: 2 }], [8, { kind: 'machine', machine: 2 }],
  [9, { kind: 'machine', machine: 3 }], [10, { kind: 'machine', machine: 3 }],
  [11, { kind: 'machine', machine: 3 }], [12, { kind: 'machine', machine: 3 }],
  [13, { kind: 'magazine' }], [14, { kind: 'magazine' }],
  [15, { kind: 'magazine' }], [16, { kind: 'magazine' }],
]);

const ACTIVE_ACTION_MOVE_TO_POINT = 1;
const CATEGORY_COLORS = Object.freeze({
  'robot-active': 'D9E9FF',
  'robot-idle': 'E3E8EC',
  'machine-processing': 'DDF2D8',
  'machine-idle': 'F6DADC',
  'no-data': 'EEF1F4',
});
const CATEGORY_CHART_COLORS = Object.freeze({
  'robot-active': { rgb: '2C7EEB', alpha: 24_000 },
  'robot-idle': { rgb: '82919C', alpha: 22_000 },
  'machine-processing': { rgb: '51B84D', alpha: 27_000 },
  'machine-idle': { rgb: 'DA4B52', alpha: 20_000 },
  'no-data': { rgb: 'B3BFC8', alpha: 22_000 },
});

const numberValue = (values, path, fallback = 0) => {
  const raw = values[path];
  const value = Array.isArray(raw) && raw.length === 2
    ? Number(raw[0]) * 0x1_0000_0000 + Number(raw[1])
    : Number(raw);
  return Number.isFinite(value) ? value : fallback;
};
const booleanValue = (values, path, fallback = false) =>
  typeof values[path] === 'boolean' ? values[path] : fallback;
const hasAll = (values, paths) => paths.every((path) => Object.hasOwn(values, path));
const activity = (id, label, category) => ({ id, label, category });
const noDataActivity = () => activity('no-data', 'Нет данных', 'no-data');

export const cyclogramRequiredSymbols = Object.freeze([
  'stRobotStatus.xBusy',
  'stRobotStatus.eCurrentPoint',
  'stRobotDiag.eActiveAction',
  'stRobotDiag.eActivePoint',
  'stMagazineStatus.xBusy',
  ...[1, 2, 3].flatMap((machine) => [
    `astMachineStatus[${machine}].xBusy`,
    `astMachineStatus[${machine}].xRobotReleased`,
    `astMachineStatus[${machine}].xProcessing`,
  ]),
]);

export function noDataStates() {
  return Object.fromEntries(CYCLOGRAM_LANES.map((lane) => [lane.id, noDataActivity()]));
}

export function classifyCyclogram(values) {
  if (!hasAll(values, cyclogramRequiredSymbols)) return noDataStates();

  const machines = [1, 2, 3].map((machine) => {
    const cycleActivePath = `astMachineIoStatus[${machine}].xCycleActive`;
    const processing = booleanValue(values, `astMachineStatus[${machine}].xProcessing`);
    return {
      number: machine,
      busy: booleanValue(values, `astMachineStatus[${machine}].xBusy`),
      robotReleased: booleanValue(values, `astMachineStatus[${machine}].xRobotReleased`),
      // FB_MACHINE.Status.xProcessing mirrors xCycleActive. Prefer the direct
      // I/O status when it is published, while retaining compatibility.
      cycleActive: Object.hasOwn(values, cycleActivePath)
        ? booleanValue(values, cycleActivePath)
        : processing,
    };
  });
  const result = Object.fromEntries(machines.map((machine) => [
    `machine-${machine.number}`,
    machine.cycleActive
      ? activity('processing', 'Обработка', 'machine-processing')
      : activity('idle', 'Простой', 'machine-idle'),
  ]));

  const robotBusy = booleanValue(values, 'stRobotStatus.xBusy');
  const magazineBusy = booleanValue(values, 'stMagazineStatus.xBusy');
  const action = numberValue(values, 'stRobotDiag.eActiveAction');
  const activePoint = numberValue(values, 'stRobotDiag.eActivePoint');
  const currentPoint = numberValue(values, 'stRobotStatus.eCurrentPoint');
  const target = POINT_CATALOG.get(activePoint);
  const current = POINT_CATALOG.get(currentPoint);
  const workingMachine = machines.find((machine) => machine.busy && !machine.robotReleased);
  let robot = activity('idle', 'Простой', 'robot-idle');

  if (workingMachine) {
    robot = activity(
      `work-machine-${workingMachine.number}`,
      `Работа в станке ${workingMachine.number}`,
      'robot-active',
    );
  } else if (robotBusy && action === ACTIVE_ACTION_MOVE_TO_POINT && target?.kind === 'machine'
      && (current?.kind !== 'machine' || current.machine !== target.machine)) {
    robot = activity(`move-machine-${target.machine}`, `Перемещение к станку ${target.machine}`, 'robot-active');
  } else if (robotBusy && action === ACTIVE_ACTION_MOVE_TO_POINT && target?.kind === 'magazine'
      && current?.kind === 'machine') {
    robot = activity(`move-magazine-machine-${current.machine}`, `Перемещение к магазину от станка ${current.machine}`, 'robot-active');
  } else if (robotBusy && action === ACTIVE_ACTION_MOVE_TO_POINT && target?.kind === 'magazine'
      && current?.kind !== 'magazine') {
    robot = activity('move-magazine', 'Перемещение к магазину', 'robot-active');
  } else if (robotBusy && action === ACTIVE_ACTION_MOVE_TO_POINT && target) {
    if (current?.kind === 'magazine') {
      robot = activity('work-magazine', 'Работа в магазине', 'robot-active');
    } else {
      robot = activity(`move-other-${activePoint}`, `Перемещение робота · точка ${activePoint}`, 'robot-active');
    }
  } else if (robotBusy && action === ACTIVE_ACTION_MOVE_TO_POINT) {
    if (current?.kind === 'magazine') {
      robot = activity('work-magazine', 'Работа в магазине', 'robot-active');
    } else {
      robot = activity(`move-other-${activePoint}`, `Перемещение робота · точка ${activePoint}`, 'robot-active');
    }
  } else {
    if (magazineBusy && (current?.kind === 'magazine' || target?.kind === 'magazine')) {
      robot = activity('work-magazine', 'Работа в магазине', 'robot-active');
    } else if (current?.kind === 'magazine') {
      robot = activity('work-magazine', 'Работа в магазине', 'robot-active');
    } else if (robotBusy && (action !== 0 || activePoint !== 0)) {
      robot = activity(
        `other-${action}-${activePoint}`,
        `Другое действие робота · действие ${action} · точка ${activePoint}`,
        'robot-active',
      );
    }
  }

  return { robot, ...result };
}

export function isTransientRobotActivity(robot) {
  return robot?.id === 'idle' || robot?.id === 'move-other-0' || robot?.id === 'other-0-0';
}

export function stabilizeCyclogramStates(previous, next, {
  transientForMs = 0,
  movementGraceMs = 250,
  machineExitGraceMs = 1_000,
} = {}) {
  const previousRobot = previous?.robot;
  const nextRobot = next?.robot;
  if (!previousRobot || !nextRobot) return next;
  const robotWasInsideMagazine = previousRobot.id === 'work-magazine';
  const robotWasActive = previousRobot.category === 'robot-active';
  const robotWasInsideMachine = previousRobot.id.startsWith('work-machine-');
  const activeGraceMs = robotWasInsideMachine ? machineExitGraceMs : movementGraceMs;
  const bridgeTransition = robotWasInsideMagazine
    || (robotWasActive && transientForMs <= activeGraceMs);
  return bridgeTransition && isTransientRobotActivity(nextRobot)
    ? { ...next, robot: previousRobot }
    : next;
}

const rowToInterval = (row) => ({
  id: Number(row.id),
  lane: row.lane,
  label: row.label,
  activityId: row.activity_id,
  category: row.category,
  startMs: Number(row.start_ms),
  endMs: row.end_ms === null ? null : Number(row.end_ms),
  lastSeenMs: Number(row.last_seen_ms),
});

const sameActivity = (left, right) => (left?.activityId ?? left?.id) === right?.id
  && left?.label === right?.label && left?.category === right?.category;

export class CyclogramStore {
  constructor({ databasePath = ':memory:', retentionHours = 24, checkpointMs = 5_000 } = {}) {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.databasePath = databasePath;
    this.retentionMs = Math.max(1, Number(retentionHours) || 24) * 60 * 60 * 1_000;
    this.checkpointMs = Math.max(1_000, Number(checkpointMs) || 5_000);
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cyclogram_interval (
        id INTEGER PRIMARY KEY,
        lane TEXT NOT NULL,
        activity_id TEXT NOT NULL,
        label TEXT NOT NULL,
        category TEXT NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER,
        last_seen_ms INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_cyclogram_interval_range
        ON cyclogram_interval (start_ms, end_ms);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cyclogram_interval_open_lane
        ON cyclogram_interval (lane) WHERE end_ms IS NULL;
    `);
    this.selectOpen = this.db.prepare('SELECT * FROM cyclogram_interval WHERE end_ms IS NULL');
    this.insert = this.db.prepare(`INSERT INTO cyclogram_interval
      (lane, activity_id, label, category, start_ms, end_ms, last_seen_ms)
      VALUES (?, ?, ?, ?, ?, NULL, ?)`);
    this.close = this.db.prepare('UPDATE cyclogram_interval SET end_ms = ?, last_seen_ms = ? WHERE id = ? AND end_ms IS NULL');
    this.touch = this.db.prepare('UPDATE cyclogram_interval SET last_seen_ms = ? WHERE id = ? AND end_ms IS NULL');
    this.deleteAll = this.db.prepare('DELETE FROM cyclogram_interval');
    this.deleteExpired = this.db.prepare('DELETE FROM cyclogram_interval WHERE end_ms IS NOT NULL AND end_ms <= ?');
    this.trimStarted = this.db.prepare(`UPDATE cyclogram_interval SET start_ms = ?
      WHERE start_ms < ? AND COALESCE(end_ms, last_seen_ms) > ?`);
    this.selectRange = this.db.prepare(`SELECT * FROM cyclogram_interval
      WHERE start_ms < ? AND COALESCE(end_ms, last_seen_ms) > ?
      ORDER BY start_ms, lane, id`);
    this.statusStatement = this.db.prepare(`SELECT COUNT(*) AS count, MIN(start_ms) AS oldest, MAX(COALESCE(end_ms, last_seen_ms)) AS newest
      FROM cyclogram_interval`);
    this.openIntervals = new Map();
    this.lastCheckpointMs = 0;
    this.lastPruneMs = 0;
    this.restoreOpenIntervals();
  }

  restoreOpenIntervals() {
    const open = this.selectOpen.all().map(rowToInterval);
    if (open.length === 0) return;
    for (const interval of open) {
      this.close.run(interval.lastSeenMs, interval.lastSeenMs, interval.id);
      this.openIntervals.delete(interval.lane);
    }
  }

  record(states, timestamp = Date.now(), { forceCheckpoint = false } = {}) {
    const timestampMs = Math.max(0, Math.round(timestamp));
    const shouldCheckpoint = forceCheckpoint || timestampMs - this.lastCheckpointMs >= this.checkpointMs;
    const closed = [];
    const opened = [];

    for (const lane of CYCLOGRAM_LANES) {
      const next = states[lane.id] ?? noDataActivity();
      let current = this.openIntervals.get(lane.id);
      if (current === undefined) {
        const row = this.selectOpen.all().map(rowToInterval).find((interval) => interval.lane === lane.id);
        current = row ?? null;
        this.openIntervals.set(lane.id, current);
      }
      if (current && sameActivity(current, next)) {
        if (shouldCheckpoint) {
          this.touch.run(timestampMs, current.id);
          current.lastSeenMs = timestampMs;
        }
        continue;
      }
      if (current) {
        this.close.run(timestampMs, timestampMs, current.id);
        const completed = { ...current, endMs: timestampMs, lastSeenMs: timestampMs };
        closed.push(completed);
      }
      const result = this.insert.run(lane.id, next.id, next.label, next.category, timestampMs, timestampMs);
      const created = {
        id: Number(result.lastInsertRowid), lane: lane.id, label: next.label,
        activityId: next.id, category: next.category,
        startMs: timestampMs, endMs: null, lastSeenMs: timestampMs,
      };
      this.openIntervals.set(lane.id, created);
      opened.push(created);
    }

    if (shouldCheckpoint) this.lastCheckpointMs = timestampMs;
    if (timestampMs - this.lastPruneMs >= 60 * 60 * 1_000) this.prune(timestampMs);
    return { closed, opened, changed: closed.length > 0 || opened.length > 0 };
  }

  stop(timestamp = Date.now()) {
    const timestampMs = Math.max(0, Math.round(timestamp));
    const closed = [];
    for (const [lane, current] of this.openIntervals) {
      if (!current) continue;
      this.close.run(timestampMs, timestampMs, current.id);
      closed.push({ ...current, endMs: timestampMs, lastSeenMs: timestampMs });
      this.openIntervals.delete(lane);
    }
    return { closed, opened: [], changed: closed.length > 0 };
  }

  clear() {
    this.deleteAll.run();
    this.openIntervals.clear();
    this.lastCheckpointMs = 0;
    this.lastPruneMs = 0;
  }

  prune(timestamp = Date.now()) {
    const cutoff = Math.max(0, Math.round(timestamp) - this.retentionMs);
    this.deleteExpired.run(cutoff);
    this.trimStarted.run(cutoff, cutoff, cutoff);
    this.lastPruneMs = Math.round(timestamp);
  }

  intervals({ fromMs, toMs, nowMs = Date.now() } = {}) {
    const now = Math.round(nowMs);
    const to = Math.min(now, Math.max(0, Number.isFinite(toMs) ? Math.round(toMs) : now));
    const from = Math.max(0, Math.min(to, Number.isFinite(fromMs) ? Math.round(fromMs) : to - this.retentionMs));
    return this.selectRange.all(to, from).map(rowToInterval).map((interval) => ({
      ...interval,
      startMs: Math.max(interval.startMs, from),
      endMs: interval.endMs === null ? null : Math.min(interval.endMs, to),
    }));
  }

  status(nowMs = Date.now()) {
    const row = this.statusStatement.get();
    return {
      available: true,
      retentionHours: this.retentionMs / 3_600_000,
      intervals: Number(row.count ?? 0),
      oldestMs: row.oldest === null ? null : Number(row.oldest),
      newestMs: row.newest === null ? null : Math.max(Number(row.newest), Math.round(nowMs)),
    };
  }

  closeDatabase() {
    this.db.close();
  }
}

const formatTimestamp = (timestamp, timeZone) => new Intl.DateTimeFormat('ru-RU', {
  timeZone, day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
}).format(timestamp);
const formatDuration = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};
const DAY_MS = 86_400_000;
const EXCEL_UNIX_EPOCH = 25_569;
const axisLayout = (durationMs) => {
  const candidates = [
    1_000, 2_000, 5_000, 10_000, 30_000,
    60_000, 120_000, 300_000, 600_000, 1_800_000,
    3_600_000, 7_200_000, 21_600_000, 43_200_000, 86_400_000,
  ];
  const maxDivisions = durationMs <= 600_000 ? 12 : 48;
  const majorUnitMs = candidates.find((candidate) => Math.ceil(durationMs / candidate) <= maxDivisions)
    ?? 86_400_000;
  const divisions = Math.max(1, Math.ceil(durationMs / majorUnitMs));
  return {
    majorUnitMs,
    endColumn: 8 + Math.max(20, Math.min(72, Math.ceil(divisions * 0.75))),
  };
};
const laneOrder = new Map(CYCLOGRAM_LANES.map((lane, index) => [lane.id, index]));

const xmlEscape = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const excelNumber = (value) => String(Number(Number(value).toFixed(10)));

const createZonedExcelSerial = (timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  return (timestamp) => {
    const parts = Object.fromEntries(formatter.formatToParts(timestamp)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]));
    const localTimestamp = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      Math.abs(timestamp % 1_000),
    );
    return localTimestamp / DAY_MS + EXCEL_UNIX_EPOCH;
  };
};

const stringCacheXml = (values) => `<c:strCache><c:ptCount val="${values.length}"/>${values
  .map((value, index) => `<c:pt idx="${index}"><c:v>${xmlEscape(value)}</c:v></c:pt>`)
  .join('')}</c:strCache>`;

const numberCacheXml = (values, formatCode = 'General') => `<c:numCache><c:formatCode>${xmlEscape(formatCode)}</c:formatCode><c:ptCount val="${values.length}"/>${values
  .map((value, index) => `<c:pt idx="${index}"><c:v>${excelNumber(value)}</c:v></c:pt>`)
  .join('')}</c:numCache>`;

const chartTextPropertiesXml = (fontSize = 900) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${fontSize}"/></a:pPr><a:endParaRPr lang="ru-RU" sz="${fontSize}"/></a:p></c:txPr>`;

const buildGanttChartXml = ({
  sheetName,
  firstRow,
  lastRow,
  labels,
  starts,
  durations,
  categories,
  minValue,
  maxValue,
  majorUnit,
  plotTop,
  plotHeight,
}) => {
  const escapedSheetName = xmlEscape(sheetName.replaceAll("'", "''"));
  const labelReference = `'${escapedSheetName}'!$F$${firstRow}:$F$${lastRow}`;
  const startReference = `'${escapedSheetName}'!$G$${firstRow}:$G$${lastRow}`;
  const durationReference = `'${escapedSheetName}'!$H$${firstRow}:$H$${lastRow}`;
  const points = categories.map((category, index) => {
    const color = CATEGORY_CHART_COLORS[category] ?? CATEGORY_CHART_COLORS['robot-active'];
    return `<c:dPt><c:idx val="${index}"/><c:spPr><a:solidFill><a:srgbClr val="${color.rgb}"><a:alpha val="${color.alpha}"/></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:dPt>`;
  }).join('');
  const categoryAxisId = 71_347_288;
  const valueAxisId = 71_415_432;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="ru-RU"/><c:roundedCorners val="0"/><c:style val="10"/>
  <c:chart>
    <c:autoTitleDeleted val="1"/>
    <c:plotArea><c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:wMode val="edge"/><c:hMode val="edge"/><c:x val="0.01"/><c:y val="${excelNumber(plotTop)}"/><c:w val="0.98"/><c:h val="${excelNumber(plotHeight)}"/></c:manualLayout></c:layout>
      <c:barChart><c:barDir val="bar"/><c:grouping val="stacked"/><c:varyColors val="0"/>
        <c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Начало</c:v></c:tx>
          <c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/>
          <c:cat><c:strRef><c:f>${labelReference}</c:f>${stringCacheXml(labels)}</c:strRef></c:cat>
          <c:val><c:numRef><c:f>${startReference}</c:f>${numberCacheXml(starts, '0.000')}</c:numRef></c:val>
        </c:ser>
        <c:ser><c:idx val="1"/><c:order val="1"/><c:tx><c:v>Длительность</c:v></c:tx>
          <c:spPr><a:solidFill><a:srgbClr val="2C7EEB"><a:alpha val="24000"/></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/>
          ${points}
          <c:cat><c:strRef><c:f>${labelReference}</c:f>${stringCacheXml(labels)}</c:strRef></c:cat>
          <c:val><c:numRef><c:f>${durationReference}</c:f>${numberCacheXml(durations, '0.000')}</c:numRef></c:val>
        </c:ser>
        <c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/></c:dLbls>
        <c:gapWidth val="35"/><c:overlap val="100"/><c:axId val="${categoryAxisId}"/><c:axId val="${valueAxisId}"/>
      </c:barChart>
      <c:catAx><c:axId val="${categoryAxisId}"/><c:scaling><c:orientation val="maxMin"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>
        <c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="none"/>
        <c:spPr><a:noFill/><a:ln><a:solidFill><a:srgbClr val="D7E2E8"/></a:solidFill></a:ln></c:spPr>${chartTextPropertiesXml(850)}
        <c:crossAx val="${valueAxisId}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/>
      </c:catAx>
      <c:valAx><c:axId val="${valueAxisId}"/><c:scaling><c:orientation val="minMax"/><c:max val="${excelNumber(maxValue)}"/><c:min val="${excelNumber(minValue)}"/></c:scaling><c:delete val="0"/><c:axPos val="t"/>
        <c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="DFE7EC"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>
        <c:numFmt formatCode="0 &quot;с&quot;" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>
        <c:spPr><a:noFill/><a:ln><a:solidFill><a:srgbClr val="9EB0BD"/></a:solidFill></a:ln></c:spPr>${chartTextPropertiesXml(800)}
        <c:crossAx val="${categoryAxisId}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/><c:majorUnit val="${excelNumber(majorUnit)}"/>
      </c:valAx>
    </c:plotArea>
    <c:plotVisOnly val="0"/><c:dispBlanksAs val="gap"/><c:showDLblsOverMax val="0"/>
  </c:chart>
  <c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="D7E2E8"/></a:solidFill></a:ln></c:spPr>
</c:chartSpace>`;
};

const buildDrawingXml = (endRow, endColumn) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
  <xdr:twoCellAnchor editAs="oneCell">
    <xdr:from><xdr:col>8</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>${endColumn}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${endRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Диаграмма Ганта"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm/>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rId1"/></a:graphicData></a:graphic>
    </xdr:graphicFrame><xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

const injectGanttChart = async (workbookBuffer, chart) => {
  const zip = await JSZip.loadAsync(workbookBuffer);
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const relationshipsPath = 'xl/worksheets/_rels/sheet1.xml.rels';
  const worksheet = await zip.file(sheetPath).async('string');
  let relationships = zip.file(relationshipsPath)
    ? await zip.file(relationshipsPath).async('string')
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const relationshipIds = [...relationships.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  const drawingRelationshipId = `rId${Math.max(0, ...relationshipIds) + 1}`;
  relationships = relationships.replace(
    '</Relationships>',
    `<Relationship Id="${drawingRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`,
  );
  const worksheetWithNamespace = worksheet.includes('xmlns:r=')
    ? worksheet
    : worksheet.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
  zip.file(sheetPath, worksheetWithNamespace.replace('</worksheet>', `<drawing r:id="${drawingRelationshipId}"/></worksheet>`));
  zip.file(relationshipsPath, relationships);
  zip.file('xl/drawings/drawing1.xml', buildDrawingXml(chart.endRow, chart.endColumn));
  zip.file('xl/drawings/_rels/drawing1.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>');
  zip.file('xl/charts/chart1.xml', buildGanttChartXml(chart));

  const contentTypesPath = '[Content_Types].xml';
  let contentTypes = await zip.file(contentTypesPath).async('string');
  if (!contentTypes.includes('/xl/drawings/drawing1.xml')) {
    contentTypes = contentTypes.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>');
  }
  zip.file(contentTypesPath, contentTypes);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};

export async function createCyclogramWorkbook(intervals, {
  fromMs,
  toMs,
  exportedAtMs = Date.now(),
  timeZone = 'Asia/Yekaterinburg',
} = {}) {
  const from = Math.min(fromMs, toMs);
  const to = Math.max(from + 1, toMs);
  const toExcelSerial = createZonedExcelSerial(timeZone);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Portal Robot HMI';
  workbook.created = new Date(exportedAtMs);
  const sheet = workbook.addWorksheet('Циклограмма', {
    views: [{ state: 'frozen', xSplit: 5, ySplit: 4 }],
  });

  sheet.mergeCells('A1:E1');
  sheet.getCell('A1').value = 'Циклограмма Portal Robot';
  sheet.getCell('A1').font = { bold: true, size: 15, color: { argb: 'FF193247' } };
  sheet.getCell('A2').value = 'Диапазон';
  sheet.getCell('B2').value = `${formatTimestamp(from, timeZone)} — ${formatTimestamp(to, timeZone)}`;
  sheet.getCell('D2').value = 'Сформировано';
  sheet.getCell('E2').value = formatTimestamp(exportedAtMs, timeZone);
  sheet.getRow(2).font = { size: 10, color: { argb: 'FF718698' } };

  const headerRow = 4;
  const headers = ['Оборудование', 'Действие', 'Начало', 'Окончание', 'Длительность'];
  headers.forEach((header, index) => { sheet.getCell(headerRow, index + 1).value = header; });
  const head = sheet.getRow(headerRow);
  head.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  head.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  head.height = 34;
  for (let index = 1; index <= headers.length; index += 1) {
    const cell = sheet.getCell(headerRow, index);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1769D2' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFBFD2E7' } } };
  }
  [18, 44, 23, 23, 14].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });

  const ordered = [...intervals].map((interval) => ({
    ...interval,
    endMs: interval.endMs ?? exportedAtMs,
  })).filter((interval) => interval.endMs > from && interval.startMs < to)
    .filter((interval) => !(interval.lane === 'robot'
      && interval.activityId?.startsWith('work-machine-')
      && interval.endMs - interval.startMs < 1_000))
    .sort((left, right) => left.startMs - right.startMs || (laneOrder.get(left.lane) ?? 99) - (laneOrder.get(right.lane) ?? 99));

  const chartFrom = ordered.length > 0
    ? Math.min(...ordered.map((interval) => Math.max(from, interval.startMs)))
    : from;
  const chartTo = ordered.length > 0
    ? Math.max(...ordered.map((interval) => Math.min(to, interval.endMs)))
    : to;

  const chartLabels = [];
  const chartStarts = [];
  const chartDurations = [];
  const chartCategories = [];
  for (const interval of ordered) {
    const lane = LANE_BY_ID.get(interval.lane)?.label ?? interval.lane;
    const clippedStart = Math.max(from, interval.startMs);
    const clippedEnd = Math.min(to, interval.endMs);
    const startSeconds = (clippedStart - chartFrom) / 1_000;
    const durationSeconds = (clippedEnd - clippedStart) / 1_000;
    const row = sheet.addRow([
      lane,
      interval.label,
      toExcelSerial(interval.startMs),
      toExcelSerial(interval.endMs),
      (interval.endMs - interval.startMs) / DAY_MS,
    ]);
    row.height = 21;
    row.alignment = { vertical: 'middle', wrapText: false };
    row.getCell(3).numFmt = 'dd.mm.yyyy hh:mm:ss';
    row.getCell(4).numFmt = 'dd.mm.yyyy hh:mm:ss';
    row.getCell(5).numFmt = '[h]:mm:ss';
    const fill = CATEGORY_COLORS[interval.category] ?? CATEGORY_COLORS['robot-active'];
    row.getCell(1).border = { left: { style: 'medium', color: { argb: `FF${fill}` } } };
    chartLabels.push(`${lane} · ${interval.label}`);
    chartStarts.push(startSeconds);
    chartDurations.push(Math.max(durationSeconds, 0.001));
    chartCategories.push(interval.category);
  }
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: headers.length } };
  if (ordered.length === 0) {
    sheet.mergeCells('F4:Q8');
    sheet.getCell('F4').value = 'В выбранном диапазоне нет данных для диаграммы Ганта';
    sheet.getCell('F4').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sheet.getCell('F4').font = { color: { argb: 'FF718698' }, italic: true };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  sheet.getCell(headerRow, 6).value = 'Подпись диаграммы';
  sheet.getCell(headerRow, 7).value = 'Смещение';
  sheet.getCell(headerRow, 8).value = 'Длительность диаграммы';
  ordered.forEach((interval, index) => {
    const rowNumber = headerRow + 1 + index;
    sheet.getCell(rowNumber, 6).value = chartLabels[index];
    sheet.getCell(rowNumber, 7).value = chartStarts[index];
    sheet.getCell(rowNumber, 8).value = chartDurations[index];
    sheet.getCell(rowNumber, 7).numFmt = '0.000 "с"';
    sheet.getCell(rowNumber, 8).numFmt = '0.000 "с"';
  });
  for (let column = 6; column <= 8; column += 1) sheet.getColumn(column).hidden = true;

  const rawBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const chartEndRow = headerRow + ordered.length;
  const chartDurationMs = chartTo - chartFrom;
  const { majorUnitMs, endColumn } = axisLayout(chartDurationMs);
  const chartHeight = head.height + ordered.length * 21;
  return injectGanttChart(rawBuffer, {
    sheetName: sheet.name,
    firstRow: headerRow + 1,
    lastRow: headerRow + ordered.length,
    labels: chartLabels,
    starts: chartStarts,
    durations: chartDurations,
    categories: chartCategories,
    minValue: 0,
    maxValue: Math.max(0.001, chartDurationMs / 1_000),
    majorUnit: majorUnitMs / 1_000,
    endRow: chartEndRow,
    endColumn,
    plotTop: head.height / chartHeight,
    plotHeight: (ordered.length * 21) / chartHeight,
  });
}

export function cyclogramExportFilename(timestamp = Date.now(), timeZone = 'Asia/Yekaterinburg') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(timestamp).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `cyclogram_${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}.xlsx`;
}
