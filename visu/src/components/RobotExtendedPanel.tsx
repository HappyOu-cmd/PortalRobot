import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Activity, AlertCircle, CheckCircle2, Crosshair, Download, FileJson, FolderLock, Hand, Home, LoaderCircle, Network, RefreshCw, RotateCcw, Save, Settings2, Upload, X } from 'lucide-react';
import { Indicator } from './ui/Indicator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/Tabs';
import { RobotSpeedEditor } from './RobotSpeedEditor';
import { ACTIVE_POINT_LABELS, EDITOR_POINT_LABELS, MANUAL_POINT_OPTIONS, robotActionCommand, type RobotManualAction } from './robotManualControl';
import { initialRobotControlTab, reconcileRobotControlTab, type RobotControlTab } from './robotControlTabs';
import type { PlcCommand, PlcRuntimeInfo } from '../plc/client';
import type { CellState } from '../model/types';
import type { PointBackupDocument, PointBackupItem } from '../points/client';

type RobotExtendedPanelProps = {
  robot: CellState['robot'];
  magazines: CellState['magazines'];
  runtime: PlcRuntimeInfo;
  online: boolean;
  editorEditable: boolean;
  onListPointBackups: () => Promise<PointBackupItem[]>;
  onExportPointBackup: (name: string) => Promise<PointBackupItem>;
  onPreparePointImport: (id: string) => Promise<PointBackupDocument>;
  onSend: (command: PlcCommand) => void;
  onClose: () => void;
  className?: string;
};

type ActiveJog = { axis: number; direction: 'positive' | 'negative' } | null;

const AXIS_NAMES = ['X', 'Y', 'Z'] as const;
const EXPECTED_PROTOCOL_VERSION = 3;
const STEP_VALUES = [0.1, 1, 10, 100];

const EDITOR_POINT_GROUPS = [
  { title: 'Станок 1', indexes: [1, 2, 3] },
  { title: 'Станок 2', indexes: [4, 5, 6] },
  { title: 'Станок 3', indexes: [7, 8, 9] },
  { title: 'Безопасность', indexes: [10] },
  { title: 'Магазины', indexes: [11, 12] },
] as const;

type PointDraft = { x: string; y: string; z: string; speedFactor: string };
type PointPendingCommand = 'capture' | 'save' | 'import' | null;
type ImportedPoint = PointDraft & { index: number; label: string };

function pointDraft(point: PlcRuntimeInfo['pointEditor']['points'][number] | undefined): PointDraft {
  return {
    x: String(point?.x ?? 0),
    y: String(point?.y ?? 0),
    z: String(point?.z ?? 0),
    speedFactor: String(point?.speedFactor ?? 0),
  };
}

function pointNumber(value: string) {
  return Number(value.replace(',', '.'));
}

const backupDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function backupDate(value: string | null, fallbackMs: number) {
  const timestamp = value ? Date.parse(value) : fallbackMs;
  return Number.isFinite(timestamp) && timestamp > 0 ? backupDateFormatter.format(timestamp) : 'Дата неизвестна';
}

const MODBUS_COMMANDS: Record<number, string> = {
  0: 'Нет команды', 1: 'Зарезервировано', 2: 'Открыть захват 1', 3: 'Закрыть захват 1',
  4: 'Открыть захват 2', 5: 'Закрыть захват 2', 6: 'Повернуть к заготовке', 7: 'Повернуть к детали',
  10: 'Станок 1 — над станком', 11: 'Станок 1 — внутри', 12: 'Станок 1 — подход к патрону',
  13: 'Станок 1 — позиция патрона', 14: 'Станок 2 — над станком', 15: 'Станок 2 — внутри',
  16: 'Станок 2 — подход к патрону', 17: 'Станок 2 — позиция патрона', 18: 'Станок 3 — над станком',
  19: 'Станок 3 — внутри', 20: 'Станок 3 — подход к патрону', 21: 'Станок 3 — позиция патрона',
  22: 'HOME_SAFETY', 23: 'Магазин — безопасно над слотом', 24: 'Магазин — смена захвата над слотом',
  25: 'Магазин — внутри слота',
};
const MODBUS_EXECUTION_STATES: Record<number, string> = {
  0: 'Ожидание', 1: 'Команда принята', 2: 'Выполнение', 3: 'Завершено', 4: 'Ошибка', 5: 'Остановлено',
};
const MODBUS_RESULTS: Record<number, string> = {
  0: 'Успешно', 1: 'Команда не поддерживается', 2: 'Недопустимая точка', 3: 'Недопустимый слот',
  4: 'Робот не готов', 5: 'Блокировка безопасности', 6: 'Ошибка движения', 7: 'Ошибка захвата',
  8: 'Остановлено командой Stop', 255: 'Внутренняя ошибка робота',
};
const MODBUS_PHASES: Record<number, string> = {
  0: 'Ожидание', 10: 'Проверка команды', 20: 'Разгон', 30: 'Движение', 40: 'Замедление',
  50: 'Действие захвата', 60: 'Поворот захвата', 90: 'Остановка', 100: 'Авария',
};
const registerHex = (value: number) => `0x${(value & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;

function gripperRegisterText(value: number) {
  const states = [
    value & 1 ? 'Захват 1 открыт' : '', value & 2 ? 'Захват 1 закрыт' : '',
    value & 4 ? 'Захват 2 открыт' : '', value & 8 ? 'Захват 2 закрыт' : '',
    value & 16 ? 'К заготовке' : '', value & 32 ? 'К детали' : '',
  ].filter(Boolean);
  return states.length ? states.join(' · ') : 'Состояние не определено';
}

function statusRegisterText(value: number) {
  const states = [
    value & 1 ? 'Контроллер включён' : '', value & 2 ? 'Auto' : '', value & 4 ? 'Remote' : '',
    value & 8 ? 'Приводы' : '', value & 16 ? 'Homed' : '', value & 32 ? 'E-Stop' : '',
    value & 64 ? 'Alarm' : '', value & 128 ? 'Ready' : '', value & 256 ? 'Координаты верны' : '',
  ].filter(Boolean);
  return states.length ? states.join(' · ') : 'Все биты сброшены';
}

function RegisterMonitor({ runtime }: { runtime: PlcRuntimeInfo }) {
  const modbus = runtime.robotModbus;
  const write = modbus.writeRegisters;
  const read = modbus.readRegisters;
  const commandText = (value: number) => MODBUS_COMMANDS[value] ?? `Неизвестная команда ${value}`;
  const rows = [
    { address: 1001, direction: 'PLC → робот', name: 'Команда роботу', value: write[0], text: commandText(write[0] ?? 0) },
    { address: 1002, direction: 'PLC → робот', name: 'Импульс выполнения', value: write[1], text: write[1] ? 'Execute активен' : 'Execute снят' },
    { address: 1003, direction: 'PLC → робот', name: 'Остановка', value: write[2], text: write[2] ? 'Stop активен' : 'Stop снят' },
    { address: 1004, direction: 'PLC → робот', name: 'Сброс аварии', value: write[3], text: write[3] ? 'Reset активен' : 'Reset снят' },
    { address: 1005, direction: 'PLC → робот', name: 'Активный слот магазина', value: write[4], text: write[4] ? `Слот ${write[4]}` : 'Слот не задан' },
    { address: 1006, direction: 'PLC → робот', name: 'Номер магазина', value: write[5], text: write[5] ? `Магазин ${write[5]}` : 'Магазин не задан' },
    { address: 1007, direction: 'PLC → робот', name: 'Резерв 2', value: write[6], text: 'Должен оставаться 0' },
    { address: 1008, direction: 'PLC → робот', name: 'Номер команды PLC', value: write[7], text: `CommandSeq ${write[7] ?? 0}` },
    { address: 1009, direction: 'PLC → робот', name: 'Heartbeat PLC', value: write[8], text: `Счётчик ${write[8] ?? 0}` },
    { address: 1101, direction: 'Робот → PLC', name: 'Подтверждённая команда', value: read[0], text: `AckSeq ${read[0] ?? 0}` },
    { address: 1102, direction: 'Робот → PLC', name: 'Состояние выполнения', value: read[1], text: MODBUS_EXECUTION_STATES[read[1] ?? 0] ?? `Неизвестное состояние ${read[1]}` },
    { address: 1103, direction: 'Робот → PLC', name: 'Результат команды', value: read[2], text: MODBUS_RESULTS[read[2] ?? 0] ?? `Неизвестный результат ${read[2]}` },
    { address: 1104, direction: 'Робот → PLC', name: 'Активная команда', value: read[3], text: commandText(read[3] ?? 0) },
    { address: 1105, direction: 'Робот → PLC', name: 'Достигнутая точка', value: read[4], text: commandText(read[4] ?? 0) },
    { address: 1106, direction: 'Робот → PLC', name: 'Захваты и ориентация', value: read[5], text: gripperRegisterText(read[5] ?? 0) },
    { address: 1107, direction: 'Робот → PLC', name: 'Heartbeat робота', value: read[6], text: `Счётчик ${read[6] ?? 0}` },
    { address: 1108, direction: 'Робот → PLC', name: 'Состояние готовности', value: read[7], text: statusRegisterText(read[7] ?? 0) },
    { address: 1109, direction: 'Робот → PLC', name: 'Активная авария', value: read[8], text: read[8] ? `Код аварии ${read[8]}` : 'Аварий нет' },
    { address: 1110, direction: 'Робот → PLC', name: 'Координата X — старшее слово', value: read[9], text: `X = ${modbus.actualX.toFixed(1)} мм` },
    { address: 1111, direction: 'Робот → PLC', name: 'Координата X — младшее слово', value: read[10], text: `X = ${modbus.actualX.toFixed(1)} мм` },
    { address: 1112, direction: 'Робот → PLC', name: 'Координата Y — старшее слово', value: read[11], text: `Y = ${modbus.actualY.toFixed(1)} мм` },
    { address: 1113, direction: 'Робот → PLC', name: 'Координата Y — младшее слово', value: read[12], text: `Y = ${modbus.actualY.toFixed(1)} мм` },
    { address: 1114, direction: 'Робот → PLC', name: 'Координата Z — старшее слово', value: read[13], text: `Z = ${modbus.actualZ.toFixed(1)} мм` },
    { address: 1115, direction: 'Робот → PLC', name: 'Координата Z — младшее слово', value: read[14], text: `Z = ${modbus.actualZ.toFixed(1)} мм` },
    { address: 1116, direction: 'Робот → PLC', name: 'Фаза операции', value: read[15], text: MODBUS_PHASES[read[15] ?? 0] ?? `Неизвестная фаза ${read[15]}` },
    { address: 1117, direction: 'Робот → PLC', name: 'Версия протокола', value: read[16], text: read[16] === 3 ? 'Версия 3 — совместима' : `Ожидается версия 3, получено ${read[16] ?? 0}` },
  ];

  return <div className="modbus-register-table">
    {rows.map((row) => <div className={row.direction.startsWith('PLC') ? 'write' : 'read'} key={row.address}>
      <span className="modbus-register-address">{row.address}</span>
      <span className="modbus-register-name"><strong>{row.name}</strong><small>{row.direction}</small></span>
      <span className="modbus-register-meaning">{row.text}</span>
      <span className="modbus-register-value"><b>{row.value ?? 0}</b><small>{registerHex(row.value ?? 0)}</small></span>
    </div>)}
  </div>;
}

function ModbusDiagnostics({ runtime }: { runtime: PlcRuntimeInfo }) {
  const modbus = runtime.robotModbus;
  const readyBit = (modbus.statusWord & 0x0080) !== 0;
  const checks = [
    ['Конфигурация PLC', modbus.configValid, 'Проверьте IP, порт и таймауты'],
    ['TCP-соединение', modbus.connected, `Нет соединения с ${modbus.ip.join('.')}:${modbus.port}`],
    ['Первое чтение статуса', modbus.statusFresh, 'PLC ещё не прочитал регистры 1101–1117'],
    ['Heartbeat и протокол', modbus.communicationAlive, modbus.protocolVersion !== EXPECTED_PROTOCOL_VERSION ? `Версия протокола ${modbus.protocolVersion}, нужна ${EXPECTED_PROTOCOL_VERSION}` : 'Heartbeat робота не меняется'],
    ['Контроллер включён', modbus.controllerOn, 'Включите контроллер робота'],
    ['Автоматический режим', modbus.automaticMode, 'Переведите робот в Auto'],
    ['Удалённый режим', modbus.remoteEnabled, 'Разрешите Remote на пульте робота'],
    ['Приводы включены', modbus.drivesEnabled, 'Включите приводы с пульта робота'],
    ['Базирование выполнено', modbus.homed, 'Выполните Homing робота'],
    ['Координаты достоверны', modbus.positionValid, 'Проверьте систему координат робота'],
    ['E-Stop отпущен', !modbus.emergencyStop, 'Отпустите аварийный останов'],
    ['Нет аварии робота', !modbus.robotAlarm, `Активная авария: ${modbus.alarmCode}`],
    ['Программа робота готова', readyBit, 'Бит Robot Ready не установлен'],
  ] as const;
  const blockers = checks.filter((check) => !check[1]);
  const execution = MODBUS_EXECUTION_STATES[modbus.executionState] ?? `Код ${modbus.executionState}`;
  const result = MODBUS_RESULTS[modbus.resultCode] ?? `Код ${modbus.resultCode}`;
  const command = MODBUS_COMMANDS[modbus.activeCommand] ?? `Код ${modbus.activeCommand}`;

  return <div className="robot-modbus-diagnostics">
    <section className={`modbus-readiness-summary ${modbus.ready ? 'ready' : 'blocked'}`}>
      <div>{modbus.ready ? <CheckCircle2 /> : <AlertCircle />}<span><strong>{modbus.ready ? 'Робот полностью готов' : `${blockers.length} условий блокируют готовность`}</strong><small>{modbus.ready ? 'PLC может передавать команды SC-500' : blockers[0]?.[2] ?? 'Ожидание обратной связи'}</small></span></div>
      <b>{checks.length - blockers.length} / {checks.length}</b>
    </section>

    <section className="robot-extended-section">
      <div className="robot-section-title"><div><span>Цепочка готовности</span><small>Каждое условие участвует в итоговом xReady PLC</small></div><Network size={19} /></div>
      <div className="modbus-readiness-grid">{checks.map(([title, ready, blocked]) => <div className={ready ? 'ready' : 'blocked'} key={title}>
        {ready ? <CheckCircle2 /> : <AlertCircle />}<span><strong>{title}</strong><small>{ready ? 'Готово' : blocked}</small></span>
      </div>)}</div>
    </section>

    <section className="robot-extended-section">
      <div className="robot-section-title"><div><span>Исполнение команды</span><small>Handshake и текущее действие программы робота</small></div><Activity size={19} /></div>
      <div className="modbus-command-diagnostics">
        <div><span>Состояние</span><strong>{execution}</strong></div>
        <div><span>Результат</span><strong className={modbus.resultCode ? 'fault' : ''}>{result}</strong></div>
        <div><span>Активная команда</span><strong>{command}</strong></div>
        <div><span>CommandSeq / AckSeq</span><strong>{modbus.writeRegisters[7] ?? 0} / {modbus.ackSeq}</strong></div>
        <div><span>Фаза операции</span><strong>{MODBUS_PHASES[modbus.operationPhase] ?? `Код ${modbus.operationPhase}`}</strong></div>
        <div><span>Достигнутая точка</span><strong>{MODBUS_COMMANDS[modbus.currentPoint] ?? `Код ${modbus.currentPoint}`}</strong></div>
      </div>
    </section>

    <section className="robot-extended-section">
      <div className="robot-section-title"><div><span>Транспорт и данные</span><small>Диагностика клиента ModbusFB и фактическая обратная связь</small></div><Network size={19} /></div>
      <div className="modbus-transport-grid">
        <div><span>Узел</span><strong>{modbus.ip.join('.')}:{modbus.port}</strong><small>Unit ID {modbus.unitId}</small></div>
        <div><span>Версия протокола</span><strong className={modbus.protocolVersion === EXPECTED_PROTOCOL_VERSION ? '' : 'fault'}>{modbus.protocolVersion}</strong><small>Ожидается {EXPECTED_PROTOCOL_VERSION}</small></div>
        <div><span>Heartbeat робота</span><strong>{modbus.robotHeartbeat}</strong><small>Таймаут {modbus.heartbeatTimeoutMs} мс</small></div>
        <div><span>Координаты</span><strong>X {modbus.actualX.toFixed(1)} · Y {modbus.actualY.toFixed(1)} · Z {modbus.actualZ.toFixed(1)}</strong><small>мм</small></div>
        <div><span>Захваты</span><strong>{gripperRegisterText(modbus.gripperStatus)}</strong><small>{registerHex(modbus.gripperStatus)}</small></div>
        <div><span>Коды ModbusFB</span><strong className={modbus.transportError ? 'fault' : ''}>Client {modbus.clientError} · Read {modbus.readError} · Write {modbus.writeError}</strong><small>{modbus.commandTimeout ? 'Таймаут команды активен' : 'Таймаута команды нет'}</small></div>
      </div>
    </section>
  </div>;
}

function allowedClass(allowed: boolean) {
  return allowed ? '' : 'command-unavailable';
}

function AxisSelector({
  selectedAxis,
  compact = false,
  onSelect,
}: {
  selectedAxis: number;
  compact?: boolean;
  onSelect: (axis: number) => void;
}) {
  return <div className={`robot-axis-selector ${compact ? 'compact' : ''}`} role="tablist" aria-label="Выбор оси робота">
    {AXIS_NAMES.map((name, index) => {
      const selected = selectedAxis === index + 1;
      return <button
        type="button"
        key={name}
        role="tab"
        aria-selected={selected}
        className={selected ? 'active' : ''}
        onClick={() => onSelect(index + 1)}
      >
        <strong>{name}</strong>
      </button>;
    })}
  </div>;
}

function AxisJogButton({
  axis,
  direction,
  allowed,
  online,
  onJog,
}: {
  axis: number;
  direction: 'positive' | 'negative';
  allowed: boolean;
  online: boolean;
  onJog: (active: boolean) => void;
}) {
  const pressedRef = useRef(false);

  const finish = (event?: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onJog(false);
  };

  const negative = direction === 'negative';

  return <button
    className={`robot-axis-jog-button ${negative ? 'negative' : 'positive'} ${allowedClass(allowed)}`}
    type="button"
    disabled={!online}
    aria-disabled={!allowed}
    aria-label={`${AXIS_NAMES[axis - 1]} ${negative ? 'в минус' : 'в плюс'}, удерживать для движения`}
    onPointerDown={(event) => {
      event.preventDefault();
      pressedRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      onJog(true);
    }}
    onPointerUp={finish}
    onPointerCancel={finish}
    onLostPointerCapture={() => finish()}
    onBlur={() => finish()}
  >
    <b>{negative ? '−' : '+'}</b>
  </button>;
}

function AxisLimits({ axis }: { axis: PlcRuntimeInfo['axisManual'][number] }) {
  const range = Math.max(1, axis.maxPosition - axis.minPosition);
  const position = Math.max(0, Math.min(100, (axis.actualPosition - axis.minPosition) / range * 100));

  return <div className="axis-limit-line">
    <span>{axis.minPosition.toFixed(0)} мм</span>
    <div aria-label="Положение относительно программных пределов"><div style={{ width: `${position}%` }} /></div>
    <span>{axis.maxPosition.toFixed(0)} мм</span>
  </div>;
}

export function RobotExtendedPanel({
  robot, magazines, runtime, online, editorEditable,
  onListPointBackups, onExportPointBackup, onPreparePointImport,
  onSend, onClose, className,
}: RobotExtendedPanelProps) {
  const [tab, setTab] = useState<RobotControlTab>(() => initialRobotControlTab(runtime.modbusMode, runtime.continuousMode));
  const [selectedAxis, setSelectedAxis] = useState(1);
  const [selectedPoint, setSelectedPoint] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState(1);
  const [selectedMagazine, setSelectedMagazine] = useState(1);
  const [selectedEditorPoint, setSelectedEditorPoint] = useState(1);
  const [editorDraft, setEditorDraft] = useState<PointDraft>(() => pointDraft(runtime.pointEditor.points[0]));
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorPending, setEditorPending] = useState<PointPendingCommand>(null);
  const [editorAckBaseline, setEditorAckBaseline] = useState(runtime.pointEditor.ackSeq);
  const [editorMessage, setEditorMessage] = useState('');
  const [importProgress, setImportProgress] = useState<{ completed: number; total: number } | null>(null);
  const [backupMenuOpen, setBackupMenuOpen] = useState(false);
  const [backups, setBackups] = useState<PointBackupItem[]>([]);
  const [selectedBackupId, setSelectedBackupId] = useState('');
  const [backupName, setBackupName] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupBusy, setBackupBusy] = useState<'export' | 'import' | null>(null);
  const [backupError, setBackupError] = useState('');
  const [targets, setTargets] = useState(() => runtime.axisManual.map((item) => String(item.targetPosition)));
  const activeJogRef = useRef<ActiveJog>(null);
  const pointImportQueueRef = useRef<ImportedPoint[]>([]);
  const pointImportTotalRef = useRef(0);
  const focusedTargetRef = useRef<number | null>(null);
  const onlineRef = useRef(online);
  const onSendRef = useRef(onSend);
  const axis = runtime.axisManual[selectedAxis - 1];
  const modbusMode = runtime.modbusMode;
  const modbus = runtime.robotModbus;
  const drivesPowered = runtime.robotManual.drivesPowered;
  const drivesActive = !runtime.robotManual.drivesOff;
  const drivesToggleAllowed = drivesActive
    ? runtime.robotManual.drivesDisableAllowed
    : runtime.robotManual.drivesEnableAllowed;
  const drivesStateText = runtime.robotManual.powerTransitionActive
    ? 'Переключение'
    : drivesPowered ? 'Включены' : runtime.robotManual.drivesOff ? 'Выключены' : 'Частично включены';
  const selectedEditorValue = runtime.pointEditor.points[selectedEditorPoint - 1];
  const editorCoordinates = [editorDraft.x, editorDraft.y, editorDraft.z].map(pointNumber);
  const editorSpeedFactor = pointNumber(editorDraft.speedFactor);
  const editorDraftValid = editorCoordinates.every(Number.isFinite)
    && Number.isFinite(editorSpeedFactor)
    && editorSpeedFactor > 0.1
    && editorSpeedFactor <= 1;
  const selectedBackup = backups.find((item) => item.id === selectedBackupId) ?? null;

  onlineRef.current = online;
  onSendRef.current = onSend;

  const send = (command: PlcCommand) => {
    if (onlineRef.current) onSendRef.current(command);
  };

  const stopActiveJog = () => {
    const active = activeJogRef.current;
    activeJogRef.current = null;
    if (active && onlineRef.current) {
      onSendRef.current({ command: 'robot.axis.jog', machine: active.axis, direction: active.direction, value: false });
    }
  };

  const handleJog = (axisNumber: number, direction: 'positive' | 'negative', active: boolean) => {
    if (active) {
      stopActiveJog();
      activeJogRef.current = { axis: axisNumber, direction };
    } else if (activeJogRef.current?.axis === axisNumber && activeJogRef.current.direction === direction) {
      activeJogRef.current = null;
    }
    send({ command: 'robot.axis.jog', machine: axisNumber, direction, value: active });
  };

  const selectAxis = (axisNumber: number) => {
    stopActiveJog();
    setSelectedAxis(axisNumber);
  };

  const setContinuousMode = (continuous: boolean) => {
    stopActiveJog();
    send({ command: 'robot.continuousMode', value: continuous });
  };

  const changeTab = (nextTab: string) => {
    const next = nextTab as RobotControlTab;
    if (tab === 'points' && next !== 'points' && editorDirty
      && !window.confirm('Черновик точки не сохранён. Закрыть редактор и отбросить изменения?')) return;
    if (tab === 'points' && next !== 'points' && editorDirty) cancelEditorDraft();
    stopActiveJog();

    // Motion tabs show only the mode confirmed by the next PLC snapshot. This prevents
    // a local tab from claiming JOG while PLC still owns the precise-positioning mode.
    if (!modbusMode && (next === 'jog' || next === 'position')) {
      const continuous = next === 'jog';
      if (runtime.continuousMode !== continuous) {
        setContinuousMode(continuous);
        return;
      }
    }
    setTab(next);
  };

  const numericTarget = (axisNumber: number) => {
    const value = Number(targets[axisNumber - 1].replace(',', '.'));
    return Number.isFinite(value) ? value : runtime.axisManual[axisNumber - 1].targetPosition;
  };

  const commitTarget = (axisNumber: number) => {
    const value = numericTarget(axisNumber);
    setTargets((current) => current.map((item, index) => index === axisNumber - 1 ? String(value) : item));
    send({ command: 'robot.axis.target', machine: axisNumber, value });
  };

  const sendAction = (action: RobotManualAction) => send(robotActionCommand(action, selectedPoint, selectedSlot, selectedMagazine));

  const stopRobot = () => {
    stopActiveJog();
    send({ command: 'robot.stop' });
  };

  const loadEditorPoint = (index: number) => {
    setSelectedEditorPoint(index);
    setEditorDraft(pointDraft(runtime.pointEditor.points[index - 1]));
    setEditorDirty(false);
    setEditorMessage('');
  };

  const selectEditorPoint = (index: number) => {
    if (editorPending) return;
    if (index === selectedEditorPoint) return;
    if (editorDirty && !window.confirm('Черновик точки не сохранён. Отбросить изменения?')) return;
    loadEditorPoint(index);
  };

  const changeEditorDraft = (field: keyof PointDraft, value: string) => {
    setEditorDraft((current) => ({ ...current, [field]: value }));
    setEditorDirty(true);
    setEditorMessage('');
  };

  const captureEditorPoint = () => {
    if (editorPending) return;
    setEditorAckBaseline(runtime.pointEditor.ackSeq);
    setEditorPending('capture');
    setEditorMessage('Ожидание подтверждения CAPTURE от PLC…');
    send({ command: 'robot.point.capture', index: selectedEditorPoint, speedFactor: Number.isFinite(editorSpeedFactor) ? editorSpeedFactor : 0 });
  };

  const saveEditorPoint = () => {
    if (editorPending || !editorDraftValid) return;
    setEditorAckBaseline(runtime.pointEditor.ackSeq);
    setEditorPending('save');
    setEditorMessage('Ожидание подтверждения SAVE от PLC…');
    send({
      command: 'robot.point.save',
      index: selectedEditorPoint,
      draft: { x: editorCoordinates[0], y: editorCoordinates[1], z: editorCoordinates[2], speedFactor: editorSpeedFactor },
    });
  };

  const refreshPointBackups = async (silent = false) => {
    if (!silent) setBackupLoading(true);
    try {
      const items = await onListPointBackups();
      setBackups(items);
      setSelectedBackupId((current) => items.some((item) => item.id === current)
        ? current
        : items.find((item) => item.valid)?.id ?? items[0]?.id ?? '');
      setBackupError('');
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'Не удалось получить список резервных копий.');
    } finally {
      if (!silent) setBackupLoading(false);
    }
  };

  const exportPoints = async () => {
    if (backupBusy || !online || !editorEditable) return;
    setBackupBusy('export');
    setBackupError('');
    try {
      const item = await onExportPointBackup(backupName);
      setBackupName('');
      setSelectedBackupId(item.id);
      await refreshPointBackups(true);
      setEditorMessage(`Gateway сохранил ${item.pointCount} точек в защищённую папку резервных копий.`);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'Не удалось экспортировать точки.');
    } finally {
      setBackupBusy(null);
    }
  };

  const sendImportedPoint = (point: ImportedPoint, ackBaseline: number) => {
    setSelectedEditorPoint(point.index);
    setEditorDraft({ x: point.x, y: point.y, z: point.z, speedFactor: point.speedFactor });
    setEditorDirty(false);
    setEditorAckBaseline(ackBaseline);
    setEditorPending('import');
    send({
      command: 'robot.point.save',
      index: point.index,
      draft: {
        x: pointNumber(point.x),
        y: pointNumber(point.y),
        z: pointNumber(point.z),
        speedFactor: pointNumber(point.speedFactor),
      },
    });
  };

  const importPoints = async (backupId: string) => {
    if (!backupId || editorPending || backupBusy) return;
    if (!online || !editorEditable) {
      setBackupError('Импорт доступен только при связи с PLC и разрешённом редактировании точек.');
      return;
    }
    setBackupBusy('import');
    setBackupError('');
    try {
      const parsed = await onPreparePointImport(backupId);

      const currentIndexesByPointId = new Map(runtime.pointEditor.points.map((point) => [point.pointId, point.index]));
      const seenPointIds = new Set<number>();
      const imported = parsed.points.flatMap((raw) => {
        const pointId = Number(raw.pointId);
        const index = currentIndexesByPointId.get(pointId);
        if (!index || seenPointIds.has(pointId) || raw.configured !== true) return [];
        seenPointIds.add(pointId);
        const values = [Number(raw.x), Number(raw.y), Number(raw.z), Number(raw.speedFactor)];
        if (!values.every(Number.isFinite) || values[3] <= 0.1 || values[3] > 1) {
          throw new Error(`Некорректные координаты или скорость точки ${raw.label ?? pointId}.`);
        }
        return [{
          index,
          label: EDITOR_POINT_LABELS[index - 1] ?? `Точка ${index}`,
          x: String(values[0]), y: String(values[1]), z: String(values[2]), speedFactor: String(values[3]),
        } satisfies ImportedPoint];
      }).sort((left, right) => left.index - right.index);

      if (imported.length === 0) throw new Error('В файле нет настроенных точек, совместимых с текущей таблицей PLC.');
      if (editorDirty && !window.confirm('Текущий черновик не сохранён. Отбросить его и начать импорт?')) return;

      const first = imported.shift();
      if (!first) return;
      pointImportQueueRef.current = imported;
      pointImportTotalRef.current = imported.length + 1;
      setImportProgress({ completed: 0, total: pointImportTotalRef.current });
      setEditorMessage(`Импорт: запись точки 1 из ${pointImportTotalRef.current}…`);
      setBackupMenuOpen(false);
      sendImportedPoint(first, runtime.pointEditor.ackSeq);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'Не удалось подготовить резервную копию точек.');
    } finally {
      setBackupBusy(null);
    }
  };

  const cancelEditorDraft = () => {
    setEditorDraft(pointDraft(selectedEditorValue));
    setEditorDirty(false);
    setEditorMessage('Черновик отменён.');
  };

  useEffect(() => {
    setTargets((current) => {
      const next = current.map((value, index) => focusedTargetRef.current === index + 1
        ? value
        : String(runtime.axisManual[index].targetPosition));
      return next.every((value, index) => value === current[index]) ? current : next;
    });
  }, [runtime.axisManual]);

  useEffect(() => {
    if (!editorPending || runtime.pointEditor.ackSeq === editorAckBaseline) return;

    if (editorPending === 'import') {
      if (runtime.pointEditor.result !== 1) {
        pointImportQueueRef.current = [];
        setImportProgress(null);
        setEditorPending(null);
        setEditorMessage(`Импорт остановлен на точке ${selectedEditorPoint}: ${runtime.pointEditor.rejectReason || 'PLC отклонил запись.'}`);
        return;
      }

      const completed = pointImportTotalRef.current - pointImportQueueRef.current.length;
      const next = pointImportQueueRef.current.shift();
      if (next) {
        setImportProgress({ completed, total: pointImportTotalRef.current });
        setEditorMessage(`Импорт: записано ${completed} из ${pointImportTotalRef.current}, следующая — ${next.label}…`);
        sendImportedPoint(next, runtime.pointEditor.ackSeq);
      } else {
        setImportProgress(null);
        setEditorPending(null);
        setEditorDirty(false);
        setEditorDraft(pointDraft(runtime.pointEditor.resultPoint));
        setEditorMessage(`Импорт завершён: PLC подтвердил ${pointImportTotalRef.current} точек.`);
      }
      return;
    }

    if (runtime.pointEditor.result === 1) {
      if (editorPending === 'capture') {
        setEditorDraft((current) => ({
          ...current,
          x: String(runtime.pointEditor.resultPoint.x),
          y: String(runtime.pointEditor.resultPoint.y),
          z: String(runtime.pointEditor.resultPoint.z),
        }));
        setEditorDirty(true);
        setEditorMessage('Текущие XYZ зафиксированы в черновике. Для записи нажмите «Сохранить».');
      } else {
        setEditorDraft(pointDraft(runtime.pointEditor.resultPoint));
        setEditorDirty(false);
        setEditorMessage('Точка сохранена и подтверждена PLC.');
      }
    } else {
      setEditorMessage(runtime.pointEditor.rejectReason || 'PLC отклонил команду редактора.');
    }
    setEditorPending(null);
  }, [editorAckBaseline, editorPending, runtime.pointEditor]);

  useEffect(() => {
    if (!editorPending) return undefined;
    const timeout = window.setTimeout(() => {
      pointImportQueueRef.current = [];
      setImportProgress(null);
      setEditorPending(null);
      setEditorMessage('PLC не вернул AckSeq за 5 секунд. Сохранённая точка в HMI не изменена.');
    }, 5_000);
    return () => window.clearTimeout(timeout);
  }, [editorAckBaseline, editorPending]);

  useEffect(() => {
    if (!editorDirty && !editorPending) setEditorDraft(pointDraft(selectedEditorValue));
  }, [editorDirty, editorPending, selectedEditorPoint, selectedEditorValue?.configured, selectedEditorValue?.speedFactor, selectedEditorValue?.x, selectedEditorValue?.y, selectedEditorValue?.z]);

  useEffect(() => {
    if (!online) stopActiveJog();
  }, [online]);

  useEffect(() => {
    stopActiveJog();
    setTab((current) => reconcileRobotControlTab(current, modbusMode, runtime.continuousMode));
  }, [modbusMode, runtime.continuousMode]);

  useEffect(() => {
    const handleWindowBlur = () => stopActiveJog();
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      stopActiveJog();
    };
  }, []);

  useEffect(() => {
    if (!backupMenuOpen) return undefined;
    void refreshPointBackups();
    const interval = window.setInterval(() => void refreshPointBackups(true), 5_000);
    return () => window.clearInterval(interval);
  }, [backupMenuOpen]);

  const close = () => {
    if (editorDirty && !window.confirm('Черновик точки не сохранён. Закрыть редактор и отбросить изменения?')) return;
    stopActiveJog();
    onClose();
  };

  return <><aside className={`side-panel robot-extended-panel ${className ?? ''}`} aria-label="Расширенное управление роботом">
    <header className="robot-extended-header">
      <div><span>{modbusMode ? 'MODBUS TCP · ДИАГНОСТИКА И УПРАВЛЕНИЕ' : 'SOFTMOTION · РУЧНОЕ УПРАВЛЕНИЕ'}</span><h2>Расширенное управление роботом</h2></div>
      <button type="button" onClick={close} title="Закрыть"><X /></button>
    </header>

    <div className="robot-extended-status-line">
      <span><Indicator active={runtime.manualMode} tone="blue" />Режим: {runtime.manualMode ? 'Ручной' : 'Автомат'}</span>
      <span><Indicator active={modbusMode ? modbus.ready || modbus.busy : runtime.robotReady || runtime.robotManual.commandBusy} tone={(modbusMode ? modbus.busy : runtime.robotManual.commandBusy) ? 'blue' : 'green'} />Робот: {modbusMode ? modbus.busy ? 'Занят' : modbus.ready ? 'Готов' : 'Не готов' : runtime.robotManual.commandBusy ? 'Занят' : runtime.robotReady ? 'Готов' : 'Не готов'}</span>
      <span><Indicator active={online} tone={online ? 'green' : 'red'} />PLC: {online ? 'Подключен' : 'Нет связи'}</span>
      {modbusMode ? <>
        <span><Indicator active={modbus.communicationAlive} tone={modbus.communicationAlive ? 'green' : 'red'} />Modbus: {modbus.communicationAlive ? 'Обмен активен' : 'Нет обмена'}</span>
        <span><Indicator active={modbus.drivesEnabled} tone={modbus.drivesEnabled ? 'green' : 'blue'} />Приводы робота: {modbus.drivesEnabled ? 'Включены' : 'Выключены'}</span>
      </> : <>
        <span><Indicator active={drivesPowered} tone={drivesPowered ? 'green' : 'blue'} />Приводы: {drivesStateText}</span>
        <span className="robot-speed-status">Скорость: <b>{runtime.speedOverridePercent.toFixed(1)}%</b></span>
      </>}
    </div>

    <div className={`robot-extended-command-deck ${modbusMode ? 'modbus' : ''}`}>
      {!modbusMode && <button
        type="button"
        disabled={!online}
        className={allowedClass(drivesToggleAllowed)}
        aria-disabled={!drivesToggleAllowed}
        onClick={() => send({ command: drivesActive ? 'robot.disableDrives' : 'robot.enableDrives' })}
      ><Settings2 size={17} />{runtime.robotManual.powerTransitionActive ? 'Переключение…' : drivesActive ? 'Отключить приводы' : 'Включить приводы'}</button>}
      <button type="button" disabled={!online} className={allowedClass(runtime.robotManual.resetAllowed)} aria-disabled={!runtime.robotManual.resetAllowed} onClick={() => send({ command: 'robot.reset' })}><RotateCcw size={17} />Сброс</button>
      <button type="button" disabled={!online} className={`danger ${allowedClass(runtime.robotManual.stopAllowed)}`} aria-disabled={!runtime.robotManual.stopAllowed} onClick={stopRobot}><AlertCircle size={17} />Стоп</button>
    </div>

    <Tabs value={tab} onValueChange={changeTab} className="robot-extended-tabs-root">
      <TabsList className={`robot-extended-tabs ${modbusMode ? 'modbus' : ''}`} aria-label="Разделы управления роботом">
        {modbusMode ? <>
          <TabsTrigger value="diagnostics">Диагностика</TabsTrigger>
          <TabsTrigger value="registers">Регистры</TabsTrigger>
        </> : <>
          <TabsTrigger value="jog">Пульт JOG</TabsTrigger>
          <TabsTrigger value="position">Точное перемещение</TabsTrigger>
        </>}
        <TabsTrigger value="points">Точки</TabsTrigger>
        <TabsTrigger value="grippers">Захваты</TabsTrigger>
      </TabsList>

      {modbusMode && <TabsContent value="diagnostics" className="robot-extended-tab-content">
        <div className="robot-extended-scroll"><ModbusDiagnostics runtime={runtime} /></div>
      </TabsContent>}

      {modbusMode && <TabsContent value="registers" className="robot-extended-tab-content">
        <div className="robot-extended-scroll">
          <section className="robot-extended-section modbus-register-section">
            <div className="robot-section-title"><div><span>Регистры обмена PLC ↔ робот</span><small>Текущие read-only значения с понятными именами и расшифровкой</small></div><Network size={19} /></div>
            <RegisterMonitor runtime={runtime} />
          </section>
        </div>
      </TabsContent>}

      {!modbusMode && <TabsContent value="jog" className="robot-extended-tab-content">
        <div className="robot-extended-scroll">
          <section className="robot-jog-console">
            <div className="robot-section-title robot-jog-console-title">
              <div><span>Пульт непрерывного JOG</span><small>{runtime.manualRecoveryActive ? 'Аварийное восстановление: доступно непрерывное движение одной оси' : axis.rejectReason || 'Удерживайте кнопку направления для движения выбранной оси'}</small></div>
              <Crosshair size={21} />
            </div>

            <AxisSelector selectedAxis={selectedAxis} onSelect={selectAxis} />

            <div className="robot-jog-axis-summary">
              <div><span>Выбранная ось</span><strong>{AXIS_NAMES[selectedAxis - 1]}</strong></div>
              <div><span>Фактическая позиция</span><strong>{axis.actualPosition.toFixed(1)} <i>мм</i></strong></div>
              <div><span>Состояние привода</span><strong className={axis.driveReady ? 'ready' : ''}><Indicator active={axis.driveReady} tone={axis.driveReady ? 'green' : 'blue'} />{axis.driveReady ? 'Привод готов' : 'Привод не готов'}</strong></div>
            </div>
            <AxisLimits axis={axis} />

            <div className="robot-jog-pad" aria-label={`Управление осью ${AXIS_NAMES[selectedAxis - 1]}`}>
              <AxisJogButton axis={selectedAxis} direction="negative" allowed={axis.jogNegativeAllowed} online={online} onJog={(active) => handleJog(selectedAxis, 'negative', active)} />
              <div className="robot-jog-pad-center"><strong>{AXIS_NAMES[selectedAxis - 1]}</strong></div>
              <AxisJogButton axis={selectedAxis} direction="positive" allowed={axis.jogPositiveAllowed} online={online} onJog={(active) => handleJog(selectedAxis, 'positive', active)} />
            </div>

            <div className="robot-jog-speed-panel">
              <RobotSpeedEditor
                value={runtime.speedOverridePercent}
                online={online}
                onChange={(value) => send({ command: 'robot.speedOverride', value })}
                details={<><span>Текущая скорость оси: {axis.commandVelocity.toFixed(1)} мм/с</span><span>100%: {axis.maxVelocity.toFixed(0)} мм/с</span></>}
              />
            </div>
            <button type="button" disabled={!online} className={`robot-jog-stop ${allowedClass(runtime.robotManual.stopAllowed)}`} aria-disabled={!runtime.robotManual.stopAllowed} onClick={stopRobot}><AlertCircle size={20} />СТОП</button>
            {axis.rejectReason && <div className="robot-reject-banner"><AlertCircle size={18} /><span>{axis.rejectReason}</span></div>}
          </section>
        </div>
      </TabsContent>}

      {!modbusMode && <TabsContent value="position" className="robot-extended-tab-content">
        <div className="robot-extended-scroll">
          <section className="robot-extended-section robot-position-section">
            <div className="robot-section-title"><div><span>Точное перемещение оси</span><small>Шаговый JOG, абсолютная координата и Home</small></div><Crosshair size={19} /></div>
            <AxisSelector selectedAxis={selectedAxis} compact onSelect={selectAxis} />

            <div className="axis-card">
              <div className="axis-card-head"><strong>Ось {AXIS_NAMES[selectedAxis - 1]}</strong><span><Indicator active={axis.driveReady} tone={axis.driveReady ? 'green' : 'blue'} />{axis.driveReady ? 'Привод готов' : 'Привод не готов'}</span></div>
              <div className="axis-position-grid">
                <div><small>Факт. позиция</small><strong>{axis.actualPosition.toFixed(1)} <i>мм</i></strong></div>
                <div><small>Цель</small><input
                  value={targets[selectedAxis - 1]}
                  inputMode="decimal"
                  onFocus={() => { focusedTargetRef.current = selectedAxis; }}
                  onChange={(event) => setTargets((current) => current.map((value, index) => index === selectedAxis - 1 ? event.target.value : value))}
                  onBlur={() => { focusedTargetRef.current = null; commitTarget(selectedAxis); }}
                /><i>мм</i></div>
                <div><small>Отклонение</small><strong>{axis.deviation.toFixed(1)} <i>мм</i></strong></div>
              </div>
              <AxisLimits axis={axis} />

              <div className="step-selector"><span>Шаг</span>{STEP_VALUES.map((value) => <button type="button" disabled={!online} key={value} className={Math.abs(runtime.manualStep - value) < 0.001 ? 'active' : ''} onClick={() => send({ command: 'robot.manualStep', value })}>{value} мм</button>)}</div>
              <div className="axis-step-command-row">
                <button type="button" disabled={!online} className={`short-move-button ${allowedClass(axis.moveRelativeNegativeAllowed)}`} aria-disabled={!axis.moveRelativeNegativeAllowed} onClick={() => send({ command: 'robot.axis.moveRelative', machine: selectedAxis, value: -runtime.manualStep })}>− {runtime.manualStep} мм</button>
                <button type="button" disabled={!online} className={`axis-go-button ${allowedClass(axis.moveAbsoluteAllowed)}`} aria-disabled={!axis.moveAbsoluteAllowed} onClick={() => send({ command: 'robot.axis.moveAbsolute', machine: selectedAxis, value: numericTarget(selectedAxis) })}>Перейти к координате</button>
                <button type="button" disabled={!online} className={`short-move-button ${allowedClass(axis.moveRelativePositiveAllowed)}`} aria-disabled={!axis.moveRelativePositiveAllowed} onClick={() => send({ command: 'robot.axis.moveRelative', machine: selectedAxis, value: runtime.manualStep })}>+ {runtime.manualStep} мм</button>
              </div>
              <div className="axis-card-footer">
                <span><Indicator active={axis.homed} tone={axis.homed ? 'green' : 'blue'} />{axis.homed ? 'Home выполнен' : 'Home не выполнен'}</span>
                <strong>{axis.stepName || 'Ожидание команды'}</strong>
                <button type="button" disabled={!online} className={`axis-home-button ${allowedClass(axis.homeAllowed)}`} aria-disabled={!axis.homeAllowed} onClick={() => send({ command: 'robot.axis.home', machine: selectedAxis })}><Home size={15} />Выполнить Home</button>
              </div>
            </div>
            {axis.rejectReason && <div className="robot-reject-banner"><AlertCircle size={18} /><span>{axis.rejectReason}</span></div>}
          </section>
        </div>
      </TabsContent>}

      <TabsContent value="points" className="robot-extended-tab-content">
        <div className="robot-extended-scroll">
          <section className="robot-extended-section points-section">
            <div className="robot-section-title"><div><span>Переход к точке</span><small>Старый список движения оставлен отдельно от редактора</small></div><Crosshair size={19} /></div>
            <select value={selectedPoint} onChange={(event) => setSelectedPoint(Number(event.target.value))} aria-label="Точка робота">
              {MANUAL_POINT_OPTIONS.map((point) => <option value={point.value} key={point.value}>{point.value}. {point.label}</option>)}
            </select>
			{selectedPoint >= 14 && <><label className="magazine-setting"><span>Магазин</span><select value={selectedMagazine} onChange={(event) => { setSelectedMagazine(Number(event.target.value)); setSelectedSlot(1); }}><option value={1}>Магазин 1</option><option value={2}>Магазин 2</option></select></label><label className="magazine-setting"><span>Активный слот</span><input type="number" min={1} max={Math.max(1, magazines[selectedMagazine - 1].state.rows * magazines[selectedMagazine - 1].state.columns)} value={selectedSlot} onChange={(event) => setSelectedSlot(Math.max(1, Math.min(120, Number(event.target.value))))} /></label></>}
            <button type="button" disabled={!online} className={`point-go-button ${allowedClass(runtime.robotManual.pointsAllowed)}`} aria-disabled={!runtime.robotManual.pointsAllowed} onClick={() => sendAction(1)}>Перейти к точке</button>
            <div className="point-state"><span>Активная точка PLC</span><strong>{ACTIVE_POINT_LABELS[runtime.robotManual.activePoint] ?? 'Нет'}</strong></div>
            {!runtime.robotManual.pointsAllowed && runtime.robotManual.rejectReason && <div className="robot-reject-banner"><AlertCircle size={18} />{runtime.robotManual.rejectReason}</div>}
          </section>

          <section className="robot-extended-section point-editor-section">
            <div className="robot-section-title point-editor-title">
              <div><span>Редактор фиксированных точек</span><small>12 PERSISTENT-точек SoftMotion; «внутри станка» удалены</small></div>
              <div className="point-editor-title-tools">
                <button type="button" disabled={!editorEditable || Boolean(editorPending)} onClick={() => setBackupMenuOpen(true)}><FolderLock size={14} />Копии точек</button>
                <b className={runtime.pointEditor.tableReady ? 'ready' : 'blocked'}>{runtime.pointEditor.tableReady ? 'Таблица готова' : 'Таблица не настроена'}</b>
              </div>
            </div>
            <div className="point-editor-layout">
              <nav className="point-editor-list" aria-label="Фиксированные точки SoftMotion">
                {EDITOR_POINT_GROUPS.map((group) => <div key={group.title}>
                  <span>{group.title}</span>
                  {group.indexes.map((index) => {
                    const point = runtime.pointEditor.points[index - 1];
                    return <button
                      type="button"
                      key={index}
                      disabled={Boolean(editorPending)}
                      className={`${selectedEditorPoint === index ? 'active' : ''} ${point?.configured ? 'configured' : 'unconfigured'}`}
                      onClick={() => selectEditorPoint(index)}
                    ><i /> <span>{EDITOR_POINT_LABELS[index - 1]}</span><small>{point?.configured ? 'Настроена' : 'Не настроена'}</small></button>;
                  })}
                </div>)}
              </nav>

              <div className="point-editor-card">
                <header>
                  <div><span>Точка {selectedEditorPoint}</span><strong>{EDITOR_POINT_LABELS[selectedEditorPoint - 1]}</strong></div>
                  <b className={selectedEditorValue?.configured ? 'configured' : 'unconfigured'}>{selectedEditorValue?.configured ? 'Настроена' : 'Не настроена'}</b>
                </header>
                <div className="point-editor-fields">
                  {(['x', 'y', 'z'] as const).map((field) => <label key={field}>
                    <span>{field.toUpperCase()}</span>
                    <div><input type="number" step="0.1" disabled={!editorEditable} value={editorDraft[field]} onChange={(event) => changeEditorDraft(field, event.target.value)} /><small>мм</small></div>
                  </label>)}
                  <label className="speed-factor">
                    <span>Коэффициент скорости</span>
                    <div><input type="number" min="0.11" max="1" step="0.01" disabled={!editorEditable} value={editorDraft.speedFactor} onChange={(event) => changeEditorDraft('speedFactor', event.target.value)} /><small>×</small></div>
                  </label>
                </div>
                {!editorDraftValid && <p className="point-editor-validation"><AlertCircle size={15} />Заполните XYZ числами; скорость должна быть от 0.11 до 1.00.</p>}
                <div className="point-editor-actions">
                  <button type="button" disabled={!editorEditable || !online || Boolean(editorPending)} className={allowedClass(runtime.pointEditor.captureAllowed)} aria-disabled={!runtime.pointEditor.captureAllowed || !editorEditable} onClick={captureEditorPoint}><Crosshair size={16} />{editorPending === 'capture' ? 'Фиксация…' : 'Зафиксировать текущие координаты'}</button>
                  <button type="button" disabled={Boolean(editorPending) || !editorDirty} onClick={cancelEditorDraft}>Отмена</button>
                  <button type="button" disabled={!editorEditable || !online || Boolean(editorPending) || !editorDraftValid} className={`primary ${allowedClass(runtime.pointEditor.saveAllowed)}`} aria-disabled={!runtime.pointEditor.saveAllowed || !editorEditable} onClick={saveEditorPoint}><Save size={16} />{editorPending === 'save' ? 'Сохранение…' : 'Сохранить'}</button>
                </div>
                {editorMessage && <div className={`point-editor-message ${runtime.pointEditor.result === 2 && !editorPending ? 'rejected' : ''}`}>{runtime.pointEditor.result === 2 && !editorPending ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}{editorMessage}{importProgress && <span>{importProgress.completed}/{importProgress.total}</span>}</div>}
                <footer><span>Последний AckSeq: {runtime.pointEditor.ackSeq}</span><span>{!editorEditable ? 'Только просмотр' : editorDirty ? 'Есть несохранённые изменения' : 'Черновик совпадает с PLC'}</span></footer>
              </div>
            </div>
          </section>
        </div>
      </TabsContent>

      <TabsContent value="grippers" className="robot-extended-tab-content">
        <div className="robot-extended-scroll">
          <section className="robot-extended-section robot-grippers-section">
            <div className="robot-section-title"><div><span>Управление двойным захватом</span><small>В ручном режиме доступность действий определяет PLC</small></div><Hand size={19} /></div>
            <div className="gripper-grid">
              <div className="gripper-card"><strong>Захват 1 — заготовка</strong><span><Indicator active={robot.gripper1Closed} tone="blue" />{robot.gripper1Closed ? 'Закрыт' : robot.gripper1Open ? 'Открыт' : 'Переход'}</span><div><button type="button" disabled={!online} className={allowedClass(runtime.robotManual.gripper1OpenAllowed)} aria-disabled={!runtime.robotManual.gripper1OpenAllowed} onClick={() => sendAction(2)}>Открыть</button><button type="button" disabled={!online} className={allowedClass(runtime.robotManual.gripper1CloseAllowed)} aria-disabled={!runtime.robotManual.gripper1CloseAllowed} onClick={() => sendAction(3)}>Закрыть</button></div></div>
              <div className="gripper-card"><strong>Захват 2 — деталь</strong><span><Indicator active={robot.gripper2Closed} tone="green" />{robot.gripper2Closed ? 'Закрыт' : robot.gripper2Open ? 'Открыт' : 'Переход'}</span><div><button type="button" disabled={!online} className={allowedClass(runtime.robotManual.gripper2OpenAllowed)} aria-disabled={!runtime.robotManual.gripper2OpenAllowed} onClick={() => sendAction(4)}>Открыть</button><button type="button" disabled={!online} className={allowedClass(runtime.robotManual.gripper2CloseAllowed)} aria-disabled={!runtime.robotManual.gripper2CloseAllowed} onClick={() => sendAction(5)}>Закрыть</button></div></div>
            </div>
            <div className="rotation-row"><span><RotateCcw size={18} />Поворот двойного захвата</span><button type="button" disabled={!online} className={allowedClass(runtime.robotManual.rotateToBlankAllowed)} aria-disabled={!runtime.robotManual.rotateToBlankAllowed} onClick={() => sendAction(6)}>К заготовке</button><button type="button" disabled={!online} className={allowedClass(runtime.robotManual.rotateToDetailAllowed)} aria-disabled={!runtime.robotManual.rotateToDetailAllowed} onClick={() => sendAction(7)}>К детали</button></div>
            {!runtime.robotManual.gripperAllowed && runtime.robotManual.rejectReason && <div className="robot-reject-banner"><AlertCircle size={18} />{runtime.robotManual.rejectReason}</div>}
          </section>
        </div>
      </TabsContent>
    </Tabs>
  </aside>

  <Dialog.Root open={backupMenuOpen} onOpenChange={(open) => { if (!backupBusy) setBackupMenuOpen(open); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="point-backup-overlay" />
      <Dialog.Content className="point-backup-dialog" onPointerDown={(event) => event.stopPropagation()}>
        <header>
          <div className="point-backup-heading-icon"><FolderLock aria-hidden="true" /></div>
          <div>
            <span>РЕДАКТОР ТОЧЕК · ЛОКАЛЬНЫЕ КОПИИ</span>
            <Dialog.Title>Резервные копии точек</Dialog.Title>
            <Dialog.Description>Gateway работает только со своей защищённой папкой. Проводник и произвольные пути недоступны.</Dialog.Description>
          </div>
          <Dialog.Close asChild><button type="button" disabled={Boolean(backupBusy)} title="Закрыть"><X /></button></Dialog.Close>
        </header>

        <section className="point-backup-export">
          <div><Download aria-hidden="true" /><span><b>Сохранить текущий снимок PLC</b><small>В копию попадут все 12 точек и признак их настройки</small></span></div>
          <label><span>Комментарий к копии</span><input type="text" maxLength={48} disabled={Boolean(backupBusy)} value={backupName} placeholder="Например: после наладки станков" onChange={(event) => setBackupName(event.target.value)} /></label>
          <button type="button" disabled={!online || !editorEditable || Boolean(backupBusy)} onClick={() => void exportPoints()}>{backupBusy === 'export' ? <LoaderCircle className="spin" /> : <Download />}<span>{backupBusy === 'export' ? 'Сохранение…' : 'Создать копию'}</span></button>
        </section>

        <section className="point-backup-library">
          <div className="point-backup-library-title">
            <div><span>Доступные копии</span><small>Список автоматически обновляется каждые 5 секунд</small></div>
            <button type="button" disabled={backupLoading || Boolean(backupBusy)} onClick={() => void refreshPointBackups()} title="Обновить список"><RefreshCw className={backupLoading ? 'spin' : ''} /></button>
          </div>
          <div className="point-backup-list touch-scroll-surface" role="listbox" aria-label="Резервные копии точек">
            {backupLoading && backups.length === 0 && <div className="point-backup-empty"><LoaderCircle className="spin" /><span>Читаю папку резервных копий…</span></div>}
            {!backupLoading && backups.length === 0 && <div className="point-backup-empty"><FileJson /><span>Копий пока нет</span><small>Создайте первую копию текущих точек PLC</small></div>}
            {backups.map((item) => <button
              type="button"
              role="option"
              aria-selected={selectedBackupId === item.id}
              disabled={!item.valid || Boolean(backupBusy)}
              className={`${selectedBackupId === item.id ? 'active' : ''} ${item.valid ? 'valid' : 'invalid'}`}
              key={item.id}
              onClick={() => setSelectedBackupId(item.id)}
              title={item.valid ? item.id : item.error ?? 'Повреждённая резервная копия'}
            >
              <FileJson aria-hidden="true" />
              <span><b>{item.name}</b><small>{item.valid ? backupDate(item.exportedAt, item.createdAtMs) : item.error}</small></span>
              <i className={item.valid && item.configuredCount === item.pointCount ? 'complete' : ''}>{item.valid ? `${item.configuredCount}/${item.pointCount}` : 'Ошибка'}</i>
            </button>)}
          </div>
        </section>

        {backupError && <div className="point-backup-error" role="alert"><AlertCircle /><span>{backupError}</span></div>}

        <footer>
          <span>{selectedBackup?.valid ? `Выбрано: ${selectedBackup.configuredCount} настроенных точек из ${selectedBackup.pointCount}` : 'Выберите исправную резервную копию'}</span>
          <button
            type="button"
            disabled={!selectedBackup?.valid || !online || !editorEditable || Boolean(backupBusy) || Boolean(editorPending)}
            className={allowedClass(runtime.pointEditor.saveAllowed)}
            aria-disabled={!runtime.pointEditor.saveAllowed || !editorEditable}
            onClick={() => void importPoints(selectedBackupId)}
          >{backupBusy === 'import' ? <LoaderCircle className="spin" /> : <Upload />}<span>{backupBusy === 'import' ? 'Подготовка…' : 'Импортировать в PLC'}</span></button>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root></>;
}
