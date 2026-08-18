import conveyorBeltOutlineIcon from '@iconify-icons/material-symbols/conveyor-belt-outline';
import displaySettingsOutlineIcon from '@iconify-icons/material-symbols/display-settings-outline';
import microwaveGenOutlineIcon from '@iconify-icons/material-symbols/microwave-gen-outline';
import robotIndustrialOutlineIcon from '@iconify-icons/mdi/robot-industrial-outline';
import settingsOutlineIcon from '@iconify-icons/material-symbols/settings-outline';
import touchAppOutlineIcon from '@iconify-icons/material-symbols/touch-app-outline';
import viewGridOutlineIcon from '@iconify-icons/mdi/view-grid-outline';
import timelineIcon from '@iconify-icons/material-symbols/timeline';
import { Icon } from '@iconify/react';
import {
  cloneElement, isValidElement, useEffect, useRef, useState,
  type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode, type RefObject,
} from 'react';
import {
  Activity, AlertCircle, ArrowRight, Bot, Box, Boxes, CheckCircle2, ChevronLeft, ChevronRight,
  ChevronDown, Clock3, Cylinder, Disc3, DoorOpen, Factory, Home,
  Eye, EyeOff, FlaskConical, Gauge, Grid2X2, LoaderCircle, LockKeyhole, Menu, Power, PackagePlus, RotateCcw, Settings,
  ShieldAlert, Trash2, TriangleAlert, UnlockKeyhole, UserRound, X,
} from 'lucide-react';
import { CellViewport } from './components/CellViewport';
import { EquipmentLoadPanel } from './components/EquipmentLoadPanel';
import { LatestEventNotification } from './components/LatestEventNotification';
import { RobotExtendedPanel } from './components/RobotExtendedPanel';
import { RobotSpeedEditor, normalizeRobotSpeed } from './components/RobotSpeedEditor';
import { FaultInjectionPanel } from './components/faultSimulation/FaultInjectionPanel';
import { InjectionSettingsPanel } from './components/faultSimulation/InjectionSettingsPanel';
import { SimulationSettingsPanel } from './components/faultSimulation/SimulationSettingsPanel';
import { MagazineMatrix, MagazineMatrixCard } from './components/magazine/MagazineMatrix';
import { CellSettingsPanel, ProductTypeBadge, ProductTypeSelector } from './components/multiType/MultiTypeControls';
import { CyclogramPanel } from './components/cyclogram/CyclogramPanel';
import { CellEventLog } from './components/CellEventLog';
import { TestWorkbench } from './components/tests/TestWorkbench';
import { RingStat } from './components/magazine/RingStat';
import { Indicator } from './components/ui/Indicator';
import portalRobotLogo from './assets/branding/portal-robot-logo.png';
import { DEFAULT_LAYOUT, DEFAULT_STATE } from './model/defaults';
import { getRobotTravelLimits } from './model/travel';
import { mergeCyclogramUpdate, type CyclogramHistory } from './model/cyclogram';
import { pickFaultSimulationValues, readBool, readNumber } from './model/faultSimulation';
import type {
  CellLayout,
  CellState,
  IndexedConveyorTestCommand,
  IndexedConveyorTestCommandType,
  IndexedConveyorTestStatus,
  ProductType,
  RobotCoordinateFrame,
  SlotType,
} from './model/types';
import {
  createPlcClient, mapPlcSnapshot, mapRobotCoordinates, mapRuntimeInfo,
  ALARM_SOURCE_LABELS,
  type CellLogEvent, type PlcAlarmEvent, type PlcAlarmSource, type PlcConnectionInfo, type PlcRuntimeInfo,
} from './plc/client';

type Page = 'monitoring' | 'machines' | 'robot' | 'magazine' | 'manual' | 'injections' | 'events' | 'alarms' | 'tests' | 'settings' | 'cell-settings' | 'injection-settings' | 'simulation-settings';
type BottomSection = 'cell' | 'machines' | 'robot' | 'magazine' | 'cyclogram';
type MagazinePowerStage = 'wait-power-home' | 'wait-home' | 'wait-power-enable' | 'wait-disable';
type TopMenuSection = 'root' | 'settings' | 'manual';
const PLC_UI_REFRESH_MS = 50;
const MANUAL_MODE_SPEED_PERCENT = 10;
const WORKSPACE_CLICK_MOVE_TOLERANCE_PX = 6;
const FAST_PLC_UI_SYMBOLS = new Set([
  'xCellManual',
  'stCellStatus.xRunning',
  'stCellStatus.xReadyToStart',
  'stCellStatus.xStartAllowed',
  'stCellStatus.xStopAllowed',
  'stCellStatus.xResetAllowed',
  'stCellStatus.xManualAllowed',
  'stCellStatus.xAutomaticAllowed',
  'stCellStatus.xDrivesReady',
  'stCellStatus.xRobotReady',
  'stCellStatus.xMagazineReady',
  'stCellStatus.xSafetyHomeRequired',
  'stCellStatus.xRobotAtSafetyHome',
  'stCellStatus.xStartCheckCellIdle',
  'stCellStatus.xStartCheckAutomaticMode',
  'stCellStatus.xStartCheckNoBlockingError',
  'stCellStatus.xStartCheckRobotInterfaceReady',
  'stCellStatus.xStartCheckConfigurationValid',
  'stCellStatus.xStartCheckDrivesReady',
  'stCellStatus.xStartCheckRobotReady',
  'stCellStatus.xStartCheckMagazineReady',
  'stCellStatus.xStartCheckTaskAvailable',
  'stCellStatus.xStartCheckSafetyHome',
  'stCellStatus.uiStartConditionsMet',
  'stCellStatus.uiStartConditionsTotal',
  'stCellStatus.uiReadyMachines',
  'stCellStatus.uiSelectedMachine',
  'stCellStatus.xOperatorPromptActive',
  'stCellStatus.xOperatorChoiceAllowed',
  'stCellStatus.xOperatorCancelAllowed',
  'stCellStatus.uiOperatorPrompt',
  'stCellStatus.uiOperatorTypeMask',
  'stCellStatus.uiOperatorMachineMask',
  'xGlobalError',
]);
const MACHINE_CONFIRMATION_PROMPT_STATES = new Set([1, 2, 3]);
const MACHINE_CONFIRMATION_WORKFLOW_STATES = new Set([1, 2, 3, 12, 15]);
const QUICK_MAGAZINE_MATRIX_ID = 'quick-magazine-matrix';
const WORKSPACE_INTERACTIVE_SELECTOR = 'button, input, a, [role="button"], [data-interactive]';
const WORKSPACE_OPEN_PANEL_SELECTOR = [
  '.side-panel', '.cell-quick-panel', '.machine-quick-panel', '.robot-quick-panel',
  '.magazine-quick-panel', '.cyclogram-panel', '.alarm-panel', '.magazine-screen',
  '.confirmation-overlay', '.magazine-matrix-card', '.profile-area', '.command-error',
].map((selector) => `${selector}:not(.ios-motion-exiting)`).join(', ');
const sameData = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const sameAlarmState = (left: PlcRuntimeInfo, right: PlcRuntimeInfo) =>
  left.globalError === right.globalError
  && left.activeAlarmCount === right.activeAlarmCount
  && left.activeWarningCount === right.activeWarningCount
  && sameData(left.alarmEvents, right.alarmEvents);

const isNewerAlarmEvent = (candidate: PlcAlarmEvent, current: PlcAlarmEvent) =>
  candidate.reportedAt > current.reportedAt
  || (candidate.reportedAt === current.reportedAt && candidate.id > current.id);

const selectLatestActiveEvent = (events: PlcAlarmEvent[]) => events.reduce<PlcAlarmEvent | null>((selected, event) => {
  if (!event.active) return selected;
  if (!selected) return event;
  if (event.severity !== selected.severity) return event.severity === 'alarm' ? event : selected;
  return isNewerAlarmEvent(event, selected) ? event : selected;
}, null);

const selectNewestReceivedEvent = (events: PlcAlarmEvent[]) => events.reduce<PlcAlarmEvent | null>((selected, event) => (
  !selected || isNewerAlarmEvent(event, selected) ? event : selected
), null);

const alarmEventIdentity = (event: PlcAlarmEvent | null) => event
  ? `${event.id}:${event.severity}:${event.source}:${event.code}:${event.reportedAt}`
  : '';

function AnimatedPresence({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  const contentRef = useRef<ReactElement<{ className?: string }> | null>(
    isValidElement(children) ? children as ReactElement<{ className?: string }> : null,
  );
  if (open && isValidElement(children)) contentRef.current = children as ReactElement<{ className?: string }>;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setExiting(false);
      return;
    }

    if (!mounted) return;
    setExiting(true);
    const timeoutId = window.setTimeout(() => {
      setMounted(false);
      setExiting(false);
      contentRef.current = null;
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [open, mounted]);

  if (!mounted || !contentRef.current) return null;
  const child = contentRef.current;
  return cloneElement(child, {
    className: `${child.props.className ?? ''} ios-motion${exiting ? ' ios-motion-exiting' : ''}`.trim(),
  });
}

function SheetGrip({ onClose }: { onClose: () => void }) {
  const gesture = useRef({
    panel: null as HTMLElement | null,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    velocity: 0,
  });

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const panel = event.currentTarget.closest<HTMLElement>(
      '.cell-quick-panel, .machine-quick-panel, .robot-quick-panel, .magazine-quick-panel, .cyclogram-panel, .alarm-panel',
    );
    if (!panel) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      panel,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
    };
    panel.classList.remove('sheet-dismissing');
    panel.classList.add('sheet-dragging');
    panel.style.setProperty('--sheet-drag-y', '0px');
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = gesture.current;
    if (!state.panel || !event.currentTarget.hasPointerCapture(event.pointerId)) return;

    const distance = Math.max(0, event.clientY - state.startY);
    const elapsed = Math.max(1, event.timeStamp - state.lastTime);
    const currentVelocity = (event.clientY - state.lastY) / elapsed;
    state.velocity = state.velocity * 0.65 + currentVelocity * 0.35;
    state.lastY = event.clientY;
    state.lastTime = event.timeStamp;
    state.panel.style.setProperty('--sheet-drag-y', `${distance}px`);
  };

  const finishGesture = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const state = gesture.current;
    const panel = state.panel;
    if (!panel) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const distance = Math.max(0, event.clientY - state.startY);
    const distanceThreshold = Math.min(110, panel.offsetHeight * 0.32);
    const shouldClose = !cancelled
      && (distance >= distanceThreshold || (distance >= 28 && state.velocity >= 0.55));

    panel.classList.remove('sheet-dragging');
    gesture.current.panel = null;

    if (shouldClose) {
      panel.classList.add('sheet-dismissing');
      panel.style.setProperty('--sheet-drag-y', `${panel.offsetHeight + 40}px`);
      onClose();
      return;
    }

    panel.style.setProperty('--sheet-drag-y', '0px');
    window.setTimeout(() => panel.style.removeProperty('--sheet-drag-y'), 340);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    onClose();
  };

  return <button
    className="panel-grip"
    type="button"
    aria-label="Потяните вниз, чтобы закрыть меню"
    title="Потяните вниз, чтобы закрыть"
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={(event) => finishGesture(event)}
    onPointerCancel={(event) => finishGesture(event, true)}
    onKeyDown={onKeyDown}
  />;
}

const PAGE_TITLES: Record<Page, string> = {
  monitoring: 'Главный экран', machines: 'Станки', robot: 'Робот', magazine: 'Магазин',
  manual: 'Ручное управление', injections: 'Инъекции ошибок', events: 'Журнал событий', alarms: 'Аварии', tests: 'Сценарии и тесты',
  settings: 'Настройки визуализации', 'cell-settings': 'Настройки ячейки', 'injection-settings': 'Настройки инъекции', 'simulation-settings': 'Настройки симуляции',
};
const MACHINE_OPERATION = {
  NONE: 'Нет операции', LOAD: 'Загрузка заготовки', UNLOAD: 'Выгрузка детали', CHANGE: 'Замена детали',
} as const;
const cloneLayout = (): CellLayout => structuredClone(DEFAULT_LAYOUT);
const cloneState = (): CellState => structuredClone(DEFAULT_STATE);
const distributeProductTypes = (activeCount: number, machineTypes: ProductType[]): ProductType[] => {
  const weights = ([1, 2, 3] as ProductType[]).map((type) => machineTypes.filter((value) => value === type).length);
  const totalWeight = Math.max(1, weights.reduce((sum, value) => sum + value, 0));
  const counts = weights.map((weight) => Math.floor(activeCount * weight / totalWeight));
  const remaining = activeCount - counts.reduce((sum, value) => sum + value, 0);
  const candidates = weights.map((weight, index) => ({ index, remainder: activeCount * weight % totalWeight }));
  candidates.sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < remaining; index += 1) counts[candidates[index % candidates.length].index] += 1;
  const result: ProductType[] = [];
  counts.forEach((count, index) => {
    for (let slot = 0; slot < count; slot += 1) result.push((index + 1) as ProductType);
  });
  return result;
};
const LAYOUT_STORAGE_KEY = 'portal-robot.visualization-layout.v1';
const INITIAL_CONNECTION: PlcConnectionInfo = { status: 'connecting', endpoint: '', message: 'Подключение к шлюзу', symbols: 0, missing: [] };
const INITIAL_RUNTIME: PlcRuntimeInfo = {
  cellRunning: false, cellStopPending: false, globalError: false, readyToStart: false, drivesReady: false,
  cellStartAllowed: false, cellStopAllowed: false, cellResetAllowed: false,
  manualModeAllowed: true, automaticModeAllowed: true,
  robotReady: false, magazineReady: false, safetyHomeRequired: false, robotAtSafetyHome: false,
  cellSettings: {
    changeAllowed: false,
    safetyHome: { x: 0, y: 0, z: 0, speedFactor: 0.2, toleranceX: 5, toleranceY: 5, toleranceZ: 5 },
    timeouts: { robotMove: 60, robotAction: 10, robotRelease: 5, doorOpen: 10, doorClose: 10, chuckOpen: 10, chuckClose: 10, cycleStart: 10 },
  },
  testEnvironment: {
    requested: 0, applied: 0, speedProfile: 0, changeAllowed: false, scenarioApplyAllowed: false,
    simulatorActive: false, benchKey: false, benchKeyLost: false, rejectReason: 0,
  },
  startReadiness: {
    cellIdle: false, automaticMode: false, noBlockingError: false,
    configurationValid: false, drivesReady: false, robotReady: false, magazineReady: false,
    taskAvailable: false, safetyHome: false, robotInterfaceReady: false, met: 0, total: 10,
  },
  readyMachines: 0, manualMode: false,
  selectedMachine: 0,
  operatorPromptActive: false, operatorChoiceAllowed: false, operatorCancelAllowed: false,
  operatorPrompt: 0, operatorTypeMask: 0, operatorMachineMask: 0,
  cellStateCode: 0, robotStateCode: 0, robotActionCode: 0, robotPointCode: 0,
  magazineStateCode: 0,
  magazineStateCodes: [0, 0],
  cellStep: 'Ожидание данных PLC', robotStep: 'Ожидание данных PLC',
  machineSteps: ['Ожидание данных PLC', 'Ожидание данных PLC', 'Ожидание данных PLC'],
  magazineStep: 'Ожидание данных PLC',
  magazineSteps: ['Ожидание данных PLC', 'Ожидание данных PLC'],
  activeMagazine: 0,
  activeAlarmCount: 0,
  activeWarningCount: 0,
  alarmEvents: [],
  equipmentLoad: [0, 0, 0, 0],
  modbusMode: false,
  robotModbus: {
    requestedMode: 0, modeChangeAllowed: false, settingsChangeAllowed: false, modeRejectReason: 0, settingsRejectReason: 0,
    ip: [0, 0, 0, 0], port: 502, unitId: 1, responseTimeoutMs: 500, pollIntervalMs: 50, heartbeatTimeoutMs: 2000,
    configValid: false, connected: false, communicationAlive: false, statusFresh: false, controllerOn: false, automaticMode: false,
    remoteEnabled: false, drivesEnabled: false, homed: false, emergencyStop: false, robotAlarm: false,
    positionValid: false, ready: false, busy: false, done: false, error: false, commandTimeout: false,
    ackSeq: 0, executionState: 0, alarmCode: 0, resultCode: 0, activeCommand: 0, currentPoint: 0,
    gripperStatus: 0, robotHeartbeat: 0, statusWord: 0, operationPhase: 0, protocolVersion: 0,
    actualX: 0, actualY: 0, actualZ: 0, clientError: 0, readError: 0, writeError: 0, transportError: 0,
    writeRegisters: Array(9).fill(0), readRegisters: Array(17).fill(0),
  },
  multiTypeCount: 1,
  multiTypeMagazineConfigAllowed: false,
  multiTypeCountAllowed: false,
  multiTypeMachineAllowed: [false, false, false],
  multiTypeConfigurationValid: true,
  multiTypeSelectedType: 0,
  multiTypeReturningBlank: false,
  hmiConnectionAlive: false,
  manualRecoveryActive: false,
  continuousMode: false,
  speedOverridePercent: 0.1,
  manualStep: 1,
  axisManual: [1, 2, 3].map(() => ({
    jogPositiveAllowed: false, jogNegativeAllowed: false, homeAllowed: false, moveAbsoluteAllowed: false,
    moveRelativePositiveAllowed: false, moveRelativeNegativeAllowed: false,
    driveReady: false, busy: false, error: false, homed: false, actualPosition: 0, targetPosition: 0,
    deviation: 0, minPosition: -1000, maxPosition: 17000, commandVelocity: 0, maxVelocity: 0,
    rejectCode: 1, rejectReason: 'Ожидание данных PLC', stateCode: 0, stepName: 'Ожидание данных PLC',
  })) as PlcRuntimeInfo['axisManual'],
  robotManual: {
    drivesPowered: false, drivesOff: true, powerTransitionActive: false,
    drivesEnableAllowed: false, drivesDisableAllowed: false, resetAllowed: false, stopAllowed: false,
    pointsAllowed: false, gripperAllowed: false, gripper1OpenAllowed: false, gripper1CloseAllowed: false,
    gripper2OpenAllowed: false, gripper2CloseAllowed: false, rotateToBlankAllowed: false, rotateToDetailAllowed: false,
    commandBusy: false, activeAction: 0, activePoint: 0, rejectCode: 1, rejectReason: 'Ожидание данных PLC',
  },
};
const INITIAL_CYCLOGRAM: CyclogramHistory = {
  serverTime: Date.now(),
  retentionMs: 24 * 60 * 60 * 1_000,
  intervals: [],
};

function CellQuickPanel({ running, stopPending, online, globalError, readyToStart, startAllowed, stopAllowed,
  manualAllowed, automaticAllowed, robotReady, magazineReady, safetyHomeRequired, robotAtSafetyHome,
  startReadiness, readyMachines, manualMode,
  onToggle, onModeChange, onExtended, onClose, className }: {
  running: boolean;
  stopPending: boolean;
  online: boolean;
  globalError: boolean;
  readyToStart: boolean;
  startAllowed: boolean;
  stopAllowed: boolean;
  manualAllowed: boolean;
  automaticAllowed: boolean;
  robotReady: boolean;
  magazineReady: boolean;
  safetyHomeRequired: boolean;
  robotAtSafetyHome: boolean;
  startReadiness: PlcRuntimeInfo['startReadiness'];
  readyMachines: number;
  manualMode: boolean;
  onToggle: () => void;
  onModeChange: (manual: boolean) => void;
  onExtended: () => void;
  onClose: () => void;
  className?: string;
}) {
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [blockingOpen, setBlockingOpen] = useState(true);
  const [completedOpen, setCompletedOpen] = useState(true);
  const readinessRef = useRef<HTMLDivElement>(null);
  const overallText = !online ? 'Нет связи'
    : globalError ? 'Ошибка'
      : stopPending ? 'Ожидается остановка'
        : running ? 'Работает'
          : safetyHomeRequired
            ? robotAtSafetyHome ? 'HOME_SAFETY достигнута' : 'Требуется HOME_SAFETY'
            : readyToStart ? 'Готова к запуску' : 'Не готова к запуску';
  const overallTone = safetyHomeRequired
    ? robotAtSafetyHome ? 'green' : 'amber'
    : online && !globalError && (running || readyToStart) ? 'green' : 'red';
  const primaryAllowed = stopPending ? startAllowed : running ? stopAllowed : startAllowed;
  const readinessConditions = [
    { key: 'cell', ready: startReadiness.cellIdle, title: 'Менеджер ячейки', done: 'Готов принять новый запуск', blocked: 'Текущая операция ещё не завершена' },
    { key: 'mode', ready: startReadiness.automaticMode, title: 'Режим работы', done: 'Выбран автоматический режим', blocked: 'Выбран ручной режим' },
    { key: 'errors', ready: startReadiness.noBlockingError, title: 'Блокирующие аварии', done: 'Активных блокировок нет', blocked: 'Обнаружена активная блокирующая авария' },
    { key: 'interface', ready: startReadiness.robotInterfaceReady, title: 'Интерфейс робота', done: 'Выбранный интерфейс готов', blocked: 'Интерфейс робота не подтвердил готовность' },
    { key: 'config', ready: startReadiness.configurationValid, title: 'Конфигурация типов', done: 'Конфигурация корректна', blocked: 'Конфигурация продукции некорректна' },
    { key: 'drives', ready: startReadiness.drivesReady, title: 'Приводы и группа осей', done: 'Готовы к движению', blocked: 'Приводы или группа осей не готовы' },
    { key: 'robot', ready: startReadiness.robotReady, title: 'Робот', done: 'Готов принять команду', blocked: 'Робот занят, в ошибке или захваты конфликтуют' },
    { key: 'magazine', ready: startReadiness.magazineReady, title: 'Магазин', done: 'Готов к операции', blocked: 'Магазин выключен, занят или находится в ошибке' },
    { key: 'task', ready: startReadiness.taskAvailable, title: 'Производственное задание', done: 'Данные для продолжения цикла доступны', blocked: 'Нет доступной работы или не определён груз робота' },
    { key: 'safety', ready: startReadiness.safetyHome, title: 'Безопасная позиция', done: safetyHomeRequired ? 'HOME_SAFETY подтверждена PLC' : 'Дополнительный возврат не требуется', blocked: 'После остановки требуется HOME_SAFETY' },
  ];
  const blockingConditions = readinessConditions.filter((condition) => !condition.ready);
  const completedConditions = readinessConditions.filter((condition) => condition.ready);

  useEffect(() => {
    if (!readinessOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!readinessRef.current?.contains(event.target as Node)) setReadinessOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReadinessOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [readinessOpen]);

  useEffect(() => {
    if (!online || running) setReadinessOpen(false);
  }, [online, running]);

  return <section className={`cell-quick-panel ${className ?? ''}`} aria-label="Управление ячейкой">
    <SheetGrip onClose={onClose} />
    <header>
      <div className="cell-quick-heading">
        <div className="cell-readiness-anchor" ref={readinessRef}>
          <h2>Ячейка</h2>
          <button
            className="cell-readiness-trigger"
            type="button"
            disabled={!online || running}
            aria-expanded={readinessOpen}
            aria-controls="cell-start-readiness"
            onClick={() => setReadinessOpen((value) => !value)}
          ><Indicator active tone={overallTone} /><span>{overallText}</span><ChevronDown aria-hidden="true" /></button>
          {readinessOpen && <aside id="cell-start-readiness" className="cell-start-readiness" aria-label="Условия готовности к запуску">
            <header>
              <h3>Готовность к запуску</h3>
              <div className={`cell-start-readiness-summary ${readyToStart ? 'ready' : 'blocked'}`}>
                {readyToStart ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
                <div><strong>{readyToStart ? 'Запуск разрешён' : 'Запуск запрещён'}</strong><span>{startReadiness.met} из {startReadiness.total || 10} условий</span></div>
              </div>
            </header>
            <section className="cell-readiness-group">
              <button type="button" aria-expanded={blockingOpen} onClick={() => setBlockingOpen((value) => !value)}>
                <span>Требуется действие</span><b>{blockingConditions.length}</b><ChevronDown aria-hidden="true" />
              </button>
              {blockingOpen && <div className="cell-readiness-list">
                {blockingConditions.length === 0
                  ? <div className="cell-readiness-empty"><CheckCircle2 aria-hidden="true" />Блокирующих условий нет</div>
                  : blockingConditions.map((condition) => <div className="cell-readiness-condition blocked" key={condition.key}>
                    <TriangleAlert aria-hidden="true" /><div><strong>{condition.title}</strong><span>{condition.blocked}</span></div>
                  </div>)}
              </div>}
            </section>
            <section className="cell-readiness-group completed">
              <button type="button" aria-expanded={completedOpen} onClick={() => setCompletedOpen((value) => !value)}>
                <span>Выполненные условия</span><b>{completedConditions.length}</b><ChevronDown aria-hidden="true" />
              </button>
              {completedOpen && <div className="cell-readiness-list">
                {completedConditions.map((condition) => <div className="cell-readiness-condition ready" key={condition.key}>
                  <CheckCircle2 aria-hidden="true" /><div><strong>{condition.title}</strong><span>{condition.done}</span></div>
                </div>)}
              </div>}
            </section>
          </aside>}
        </div>
        <div className="cell-mode-switch" aria-label="Режим работы линии">
          <button className={`${manualMode ? 'active manual ' : ''}${manualAllowed ? '' : 'command-unavailable'}`.trim()} type="button" disabled={!online} aria-disabled={!manualAllowed} onClick={() => onModeChange(true)}>Ручной</button>
          <button className={`${!manualMode ? 'active auto ' : ''}${automaticAllowed ? '' : 'command-unavailable'}`.trim()} type="button" disabled={!online} aria-disabled={!automaticAllowed} onClick={() => onModeChange(false)}>Автомат</button>
        </div>
      </div>
      <div className="quick-panel-header-actions">
        <button className="extended-control" type="button" onClick={onExtended}>Расширенное управление <ArrowRight size={19} /></button>
        <button className="quick-panel-close" type="button" onClick={onClose} title="Закрыть меню"><X /></button>
      </div>
    </header>
    <div className="cell-quick-content">
      <div className="cell-quick-actions">
        <button className={`cell-primary-command ${running ? 'stop' : readyToStart ? 'ready' : ''} ${primaryAllowed ? '' : 'command-unavailable'}`} type="button" disabled={!online} aria-disabled={!primaryAllowed} onClick={onToggle}>
          <Power size={25} /><span>{stopPending ? manualMode ? 'Ожидается остановка' : 'Отменить отключение' : running ? 'Выключить ячейку' : 'Включить ячейку'}</span>
        </button>
      </div>
      <div className="cell-quick-statuses">
        <div><Bot /><span>Робот</span><p><Indicator active tone={robotReady ? 'green' : 'red'} />{robotReady ? 'Готов' : 'Не готов'}</p></div>
        <div><Factory /><span>Станки</span><p><Indicator active tone={readyMachines > 0 ? 'green' : 'red'} />{readyMachines} / 3 готовы</p></div>
        <div><Boxes /><span>Магазин</span><p><Indicator active tone={magazineReady ? 'green' : 'red'} />{magazineReady ? 'Готов' : 'Не готов'}</p></div>
      </div>
    </div>
  </section>;
}

function RobotQuickPanel({ robot, robotManual, robotModbus, modbusMode, speedOverridePercent, step, online, globalError, robotReady,
  onToggleDrives, onStop, onSpeedOverrideChange, onExtended, onClose, className }: {
  robot: CellState['robot'];
  robotManual: PlcRuntimeInfo['robotManual'];
  robotModbus: PlcRuntimeInfo['robotModbus'];
  modbusMode: boolean;
  speedOverridePercent: number;
  step: string;
  online: boolean;
  globalError: boolean;
  robotReady: boolean;
  onToggleDrives: () => void;
  onStop: () => void;
  onSpeedOverrideChange: (value: number) => void;
  onExtended: () => void;
  onClose: () => void;
  className?: string;
}) {
  const normalizedSpeed = normalizeRobotSpeed(speedOverridePercent);
  const hasError = globalError || robot.error || (modbusMode && robotModbus.error);
  const drivesActive = !robotManual.drivesOff;
  const drivesToggleAllowed = drivesActive ? robotManual.drivesDisableAllowed : robotManual.drivesEnableAllowed;
  const stateText = !online ? 'Нет связи'
    : hasError ? 'Авария'
      : modbusMode
        ? robotModbus.busy ? 'Выполняет команду' : robotModbus.ready ? 'Готов по Modbus' : 'Не готов по Modbus'
        : robotManual.powerTransitionActive ? 'Переключение приводов'
          : robotManual.drivesOff ? 'Приводы выключены'
            : !robotManual.drivesPowered ? 'Приводы частично включены'
              : robot.busy ? 'Выполняет команду'
                : robotReady ? 'Готов' : 'Не готов';
  const stateTone = hasError ? 'red'
    : modbusMode ? robotModbus.ready || robotModbus.busy ? 'green' : 'gray'
      : robotManual.drivesPowered && (robotReady || robot.busy) ? 'green' : 'gray';
  const robotReadyBit = (robotModbus.statusWord & 0x0080) !== 0;
  const modbusReadiness = [
    ['Настройки соединения', robotModbus.configValid, 'IP, порт и таймауты допустимы', 'Проверьте IP, порт и таймауты'],
    ['TCP-соединение', robotModbus.connected, 'TCP-соединение установлено', 'Нет TCP-соединения с роботом'],
    ['Свежий статус', robotModbus.statusFresh, 'Регистры 1101–1117 прочитаны', 'Статус робота ещё не прочитан'],
    ['Обмен и heartbeat', robotModbus.communicationAlive, 'Обратная связь актуальна', 'Heartbeat робота не меняется или протокол неверен'],
    ['Контроллер', robotModbus.controllerOn, 'Контроллер включён', 'Контроллер робота выключен'],
    ['Режим Auto', robotModbus.automaticMode, 'Автоматический режим активен', 'Переведите робот в Auto'],
    ['Удалённое управление', robotModbus.remoteEnabled, 'Remote разрешён', 'Разрешите внешнее управление на пульте'],
    ['Приводы робота', robotModbus.drivesEnabled, 'Приводы включены на роботе', 'Включите приводы с пульта робота'],
    ['Базирование', robotModbus.homed, 'Робот базирован', 'Выполните Homing на роботе'],
    ['Координаты', robotModbus.positionValid, 'Координаты достоверны', 'Робот не подтвердил координаты'],
    ['E-Stop', !robotModbus.emergencyStop, 'Аварийный останов отпущен', 'Отпустите E-Stop'],
    ['Аварии робота', !robotModbus.robotAlarm, 'Активных аварий нет', `Активна авария ${robotModbus.alarmCode || ''}`.trim()],
    ['Готовность программы', robotReadyBit, 'Программа робота готова', 'Робот не установил бит Ready'],
  ] as const;
  const readinessMet = modbusReadiness.filter((condition) => condition[1]).length;
  const orientation = robot.rotatedToBlank ? 'К заготовке' : robot.rotatedToDetail ? 'К детали' : 'Не определена';
  const gripper1 = robot.gripper1Closed
    ? robot.blankProductType > 0 ? `Заготовка · тип ${robot.blankProductType}` : 'Заготовка · тип неизвестен'
    : robot.gripper1Open ? 'Открыт' : 'Движение';
  const gripper2 = robot.gripper2Closed
    ? robot.detailProductType > 0 ? `Деталь · тип ${robot.detailProductType}` : 'Деталь · тип неизвестен'
    : robot.gripper2Open ? 'Открыт' : 'Движение';

  return <section className={`robot-quick-panel tone-${stateTone} ${className ?? ''}`} aria-label="Управление роботом">
    <SheetGrip onClose={onClose} />
    <header className="robot-quick-header">
      <div className="robot-quick-summary">
        <h2>Робот</h2>
        <p><Indicator active={stateTone !== 'gray'} tone={stateTone === 'gray' ? 'blue' : stateTone} />{stateText}</p>
      </div>
      <div className="robot-step-summary"><span>Текущий шаг</span><strong>{step || stateText}</strong></div>
      <div className="quick-panel-header-actions">
        {!modbusMode && <details className="robot-quick-speed-menu">
          <summary title="Общая скорость робота" aria-label={`Общая скорость робота ${normalizedSpeed.toFixed(1)} процента`}>
            <Gauge size={20} /><span>{normalizedSpeed.toFixed(1)}%</span>
          </summary>
          <div className="robot-quick-speed-popover">
            <RobotSpeedEditor value={normalizedSpeed} online={online} onChange={onSpeedOverrideChange} compact />
          </div>
        </details>}
        <button className="extended-control" type="button" onClick={onExtended}>Расширенное управление <ArrowRight size={19} /></button>
        <button className="quick-panel-close" type="button" onClick={onClose} title="Закрыть меню"><X /></button>
      </div>
    </header>
    <div className="robot-quick-content-row">
      <div className="robot-quick-control-column">
        <div className={`robot-quick-command-row ${modbusMode ? 'modbus' : ''}`}>
          {modbusMode ? <details className="robot-modbus-readiness-menu">
            <summary><CheckCircle2 /><span>Готовность робота</span><b>{readinessMet} / {modbusReadiness.length}</b><ChevronDown /></summary>
            <div className="robot-modbus-readiness-popover">
              <header><div><strong>Готовность SC-500</strong><span>Что мешает запуску по Modbus TCP</span></div><b className={robotModbus.ready ? 'ready' : ''}>{robotModbus.ready ? 'ГОТОВ' : 'НЕ ГОТОВ'}</b></header>
              <div>{modbusReadiness.map(([title, ready, done, blocked]) => <div className={ready ? 'ready' : 'blocked'} key={title}>
                {ready ? <CheckCircle2 /> : <AlertCircle />}<span><strong>{title}</strong><small>{ready ? done : blocked}</small></span>
              </div>)}</div>
            </div>
          </details> : <button className={`robot-power-command ${drivesActive ? 'enabled' : 'ready'} ${drivesToggleAllowed ? '' : 'command-unavailable'}`} type="button" disabled={!online} aria-disabled={!drivesToggleAllowed} onClick={onToggleDrives}>
            <Power /><span>{robotManual.powerTransitionActive ? 'Переключение…' : drivesActive ? 'Выключить приводы' : 'Включить приводы'}</span>
          </button>}
          <button className={`robot-stop-command ${robotManual.stopAllowed ? '' : 'command-unavailable'}`} type="button" disabled={!online} aria-disabled={!robotManual.stopAllowed} onClick={onStop}>
            <AlertCircle /><span>Остановить</span>
          </button>
        </div>
      </div>
      <div className="robot-quick-status-grid">
        <div className="robot-position"><Activity /><span>Позиция, мм</span><p>X {Math.round(robot.x)} · Y {Math.round(robot.y)} · Z {Math.round(robot.z)}</p></div>
        <div className={robot.gripper1Closed ? 'holding-blank' : ''}><Box /><span>Захват 1</span><p><Indicator active={robot.gripper1Closed} tone="blue" />{gripper1}{robot.gripper1Closed && robot.blankProductType > 0 && <ProductTypeBadge type={robot.blankProductType as ProductType} />}</p></div>
        <div className={robot.gripper2Closed ? 'holding-detail' : ''}><Box /><span>Захват 2</span><p><Indicator active={robot.gripper2Closed} tone="green" />{gripper2}{robot.gripper2Closed && robot.detailProductType > 0 && <ProductTypeBadge type={robot.detailProductType as ProductType} />}</p></div>
        <div><RotateCcw /><span>Ориентация</span><p><Indicator active={robot.rotatedToBlank || robot.rotatedToDetail} tone="blue" />{orientation}</p></div>
      </div>
    </div>
  </section>;
}

function MagazineQuickPanel({ magazines, selectedIndex, onSelect, matrixOpen, onMatrixToggle, onToggleEnabled, onIndex, onFill, onClear, onExtended, onClose, className }: {
  magazines: CellState['magazines'];
  selectedIndex: number;
  onSelect: (index: number) => void;
  matrixOpen: boolean;
  onMatrixToggle: () => void;
  onToggleEnabled: () => void;
  onIndex: () => void;
  onFill: () => void;
  onClear: () => void;
  onExtended: () => void;
  onClose: () => void;
  className?: string;
}) {
  const magazine = magazines[selectedIndex];
  const state = magazine.state;
  const slots = magazine.zones[1];
  const total = Math.min(slots.length, Math.max(0, state.rows * state.columns));
  const activeSlots = slots.slice(0, total);
  const blanks = activeSlots.filter((slot) => slot === 'blank').length;
  const details = activeSlots.filter((slot) => slot === 'detail').length;
  const empty = activeSlots.filter((slot) => slot === 'empty').length;
  const statusText = state.error ? 'Авария'
    : state.disablePending ? 'Ожидается отключение'
      : state.enabled ? 'Включен' : 'Выключен';
  const statusTone = state.error ? 'red' : state.disablePending ? 'amber' : state.enabled ? 'green' : 'gray';
  const powerText = state.disablePending ? 'Ожидается отключение'
    : state.enabled ? 'Выключить магазин' : 'Включить магазин';

  return <section className={`magazine-quick-panel tone-${statusTone} ${className ?? ''}`} aria-label="Управление магазином">
    <SheetGrip onClose={onClose} />
    <header className="magazine-quick-header">
      <div className="magazine-quick-summary">
        <h2>Магазин {selectedIndex + 1}</h2>
        <p><Indicator active={statusTone !== 'gray'} tone={statusTone === 'gray' ? 'blue' : statusTone} />{statusText}</p>
      </div>
      <nav className="machine-quick-tabs magazine-quick-tabs" aria-label="Выбор магазина">
        {magazines.map((_, index) => <button className={index === selectedIndex ? 'active' : ''} type="button" key={index} onClick={() => onSelect(index)}>Магазин {index + 1}</button>)}
      </nav>
      <div className="magazine-quick-actions">
        <button className={`magazine-quick-power ${state.enabled ? 'enabled' : state.enableSequenceAllowed ? 'ready' : ''} ${state.enableSequenceAllowed ? '' : 'command-unavailable'}`} type="button" onClick={onToggleEnabled} aria-disabled={!state.enableSequenceAllowed}>
          <Power /><span>{powerText}</span>
        </button>
        <button className={`primary ${state.indexAllowed ? '' : 'command-unavailable'}`} type="button" onClick={onIndex} aria-disabled={!state.indexAllowed}><ArrowRight /><span>{state.indexing ? 'Перемещение…' : 'В рабочую зону'}</span></button>
        <button className={state.fillAllowed ? '' : 'command-unavailable'} type="button" onClick={onFill} aria-disabled={!state.fillAllowed}><PackagePlus /><span>Заполнить Zone 1</span></button>
        <button className={state.clearAllowed ? '' : 'command-unavailable'} type="button" onClick={onClear} aria-disabled={!state.clearAllowed}><Trash2 /><span>Очистить Zone 1</span></button>
      </div>
      <div className="quick-panel-header-actions">
        <button className="extended-control" type="button" onClick={onExtended}>Расширенное управление <ArrowRight size={19} /></button>
        <button className="quick-panel-close" type="button" onClick={onClose} title="Закрыть меню"><X /></button>
      </div>
    </header>
    <div className="magazine-quick-status-grid">
      <div><Box /><span>Заготовок</span><strong>{blanks}</strong></div>
      <div><Settings /><span>Деталей</span><strong>{details}</strong></div>
      <div><Grid2X2 /><span>Рабочая зона</span><strong>{total}</strong></div>
      <div><PackagePlus /><span>Свободно</span><strong>{empty}</strong></div>
      <button
        className={`magazine-matrix-trigger ${matrixOpen ? 'active' : ''}`}
        type="button"
        aria-expanded={matrixOpen}
        aria-controls={QUICK_MAGAZINE_MATRIX_ID}
        onClick={onMatrixToggle}
      >
        <Boxes /><span>Матрица</span><strong>{state.columns} × {state.rows}</strong>
      </button>
      <div><Home /><span>Домашняя позиция</span><strong>{state.homed ? 'Найдена' : 'Не найдена'}</strong></div>
    </div>
  </section>;
}

type MachineQuickTone = 'gray' | 'red' | 'green' | 'amber' | 'blue';

function machineQuickState(machine: CellState['machines'][number]): { text: string; tone: MachineQuickTone } {
  if (machine.mode === 'error' || machine.activeErrors.length > 0) return { text: 'Авария', tone: 'red' };
  if (!machine.enabled || machine.mode === 'off') return { text: 'Выключен', tone: 'gray' };
  if (machine.mode === 'processing') return { text: 'Обработка', tone: 'green' };
  if (machine.mode === 'change') return { text: 'Замена', tone: 'amber' };
  return { text: 'Включен', tone: 'amber' };
}

function machineProduct(machine: CellState['machines'][number]): { text: string; kind: 'empty' | 'blank' | 'detail' | 'unknown' } {
  if (machine.partState === 'EMPTY' || !machine.partPresent) return { text: 'Пусто', kind: 'empty' };
  if (machine.partState === 'UNKNOWN' || machine.partType === 'UNKNOWN') return { text: 'Неизвестно', kind: 'unknown' };
  return machine.partType === 'DETAIL'
    ? { text: 'Деталь', kind: 'detail' }
    : { text: 'Заготовка', kind: 'blank' };
}

function MachinesQuickPanel({ machines, selectedIndex, onSelect, onToggleEnabled, onExtended, onClose, className }: {
  machines: CellState['machines'];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onToggleEnabled: () => void;
  onExtended: (index: number) => void;
  onClose: () => void;
  className?: string;
}) {
  const machine = machines[selectedIndex];
  const state = machineQuickState(machine);
  const product = machineProduct(machine);
  const progress = machine.cycleExpectedS > 0
    ? Math.min(100, machine.cycleElapsedS / machine.cycleExpectedS * 100)
    : 0;
  const doorText = machine.doorOpen ? 'Открыта' : machine.doorClosed ? 'Закрыта' : 'Движение';
  const chuckText = machine.chuckOpen ? 'Открыт' : machine.chuckClosed ? 'Закрыт' : 'Движение';
  const powerText = machine.disablePending
    ? 'Отменить отключение'
    : machine.enabled ? 'Выключить станок' : 'Включить станок';

  return <section className={`machine-quick-panel tone-${state.tone} ${className ?? ''}`} aria-label={`Управление станком ${selectedIndex + 1}`}>
    <SheetGrip onClose={onClose} />
    <header className="machine-quick-header">
      <div className="machine-quick-summary">
        <h2>Станок {selectedIndex + 1}</h2>
        <div className="machine-quick-cycle">
          <span className="machine-state-label"><Indicator active={state.tone !== 'gray'} tone={state.tone === 'gray' ? 'blue' : state.tone} />{state.text}</span>
          {machine.mode === 'processing' && <><b>{Math.round(machine.cycleElapsedS)} с</b><i><em style={{ width: `${progress}%` }} /></i></>}
        </div>
      </div>
      <nav className="machine-quick-tabs" aria-label="Выбор станка">
        {machines.map((_, index) => <button className={index === selectedIndex ? 'active' : ''} type="button" key={index} onClick={() => onSelect(index)}>Станок {index + 1}</button>)}
      </nav>
      <div className="quick-panel-header-actions">
        <button className="extended-control" type="button" onClick={() => onExtended(selectedIndex)}>Расширенное управление <ArrowRight size={19} /></button>
        <button className="quick-panel-close" type="button" onClick={onClose} title="Закрыть меню"><X /></button>
      </div>
    </header>
    <div className="machine-quick-content-row">
      <div className="machine-quick-command-row">
        <button className={`machine-quick-power ${machine.enabled ? 'enabled' : 'ready'} ${machine.powerAllowed ? '' : 'command-unavailable'}`} type="button" onClick={onToggleEnabled} aria-disabled={!machine.powerAllowed}>
          <Power /><span>{powerText}</span>
        </button>
      </div>
      <div className="machine-quick-status-grid">
        <div><DoorOpen /><span>Дверь</span><p><Indicator active={machine.doorClosed || machine.doorOpen} tone={machine.doorClosed ? 'green' : 'amber'} />{doorText}</p></div>
        <div><Disc3 /><span>Патрон</span><p><Indicator active={machine.chuckClosed || machine.chuckOpen} tone={machine.chuckClosed ? 'green' : 'amber'} />{chuckText}</p></div>
        <div className={`machine-product ${product.kind}`}><Box /><span>Изделие</span><p><Indicator active={product.kind === 'detail' || product.kind === 'blank'} tone={product.kind === 'detail' ? 'green' : 'blue'} />{product.text}</p></div>
        <div className="machine-current-step"><Settings /><span>Текущий шаг</span><p><Indicator active={state.tone !== 'gray'} tone={state.tone === 'gray' ? 'blue' : state.tone} />{machine.currentStep || state.text}</p></div>
      </div>
    </div>
  </section>;
}

type OverviewTone = 'gray' | 'green' | 'blue' | 'amber' | 'red';
type OverviewStatus = { text: string; tone: OverviewTone };

function machineOverviewStatus(machine: CellState['machines'][number], connected = true): OverviewStatus {
  if (!connected) return { text: 'Нет данных', tone: 'gray' };
  if (machine.mode === 'error' || machine.activeErrors.length > 0) return { text: 'Авария', tone: 'red' };
  if (!machine.enabled || machine.mode === 'off') return { text: 'Выключен', tone: 'gray' };
  if (machine.disablePending) return { text: 'Отключение после операции', tone: 'amber' };
  if (machine.mode === 'processing') return { text: 'Обработка', tone: 'green' };
  if ([1, 2, 3].includes(machine.plcState)) return { text: machine.currentStep, tone: 'amber' };
  if ([9, 10, 11, 12, 13, 14, 15].includes(machine.plcState)) return { text: machine.currentStep, tone: 'blue' };
  if ([5, 6, 7, 8].includes(machine.plcState)) return { text: 'Подготовка обслуживания', tone: 'blue' };
  if (machine.serviceRequired && machine.canAcceptService) return { text: 'Готов принять робота', tone: 'green' };
  if (machine.serviceRequired) return { text: 'Требуется обслуживание', tone: 'amber' };
  if (machine.plcState === 16) return { text: 'Обслуживание завершено', tone: 'green' };
  return { text: 'Готов', tone: 'green' };
}

function robotOverviewStatus(state: CellState, runtime: PlcRuntimeInfo, connected: boolean, dataActive: boolean): OverviewStatus {
  if (!connected) return { text: 'Нет данных', tone: 'gray' };
  if (state.robot.error) return { text: 'Авария', tone: 'red' };
  if (runtime.globalError) return { text: 'Остановлен общей аварией', tone: 'red' };
  if (!dataActive) return { text: state.robot.busy ? 'Локальная модель · движение' : 'Локальная модель', tone: 'amber' };
  if (!runtime.drivesReady) return { text: 'Приводы выключены', tone: 'gray' };
  if (state.robot.busy) return { text: runtime.robotStep, tone: 'blue' };
  if (runtime.robotReady) return { text: 'Готов', tone: 'green' };
  if (runtime.robotStateCode === 5) return { text: 'Ожидает команду Modbus', tone: 'amber' };
  return { text: runtime.robotStep || 'Ожидает команду', tone: 'amber' };
}

function magazineOverviewStatus(magazine: CellState['magazines'][number]['state'], runtime: PlcRuntimeInfo, connected: boolean, magazineIndex = 0): OverviewStatus {
  if (!connected) return { text: 'Нет данных', tone: 'gray' };
  if (magazine.error || magazine.activeErrors.length > 0) return { text: 'Авария', tone: 'red' };
  if (magazine.disablePending) return { text: 'Отключение после операции', tone: 'amber' };
  if (magazine.finished) return { text: 'Требует обслуживания', tone: 'amber' };
  if (!magazine.enabled) return { text: 'Выключен', tone: 'gray' };
  if (magazine.busy) {
    if (magazine.actualOperation === 'TAKE') return { text: `Берём заготовку · слот ${magazine.selectedBlank || '—'}`, tone: 'blue' };
    if (magazine.actualOperation === 'PUT') return { text: `Кладём деталь · слот ${magazine.selectedFreeSlot || '—'}`, tone: 'blue' };
    if (magazine.actualOperation === 'RETURN_BLANK') return { text: `Возвращаем заготовку · слот ${magazine.selectedFreeSlot || '—'}`, tone: 'blue' };
    if (magazine.actualOperation === 'CHANGE') {
      const puttingDetail = runtime.robotPointCode === 15 || runtime.robotActionCode === 4;
      const takingBlank = runtime.robotPointCode === 14 || runtime.robotActionCode === 3;
      if (puttingDetail) return { text: `Кладём деталь · слот ${magazine.selectedFreeSlot || '—'}`, tone: 'blue' };
      if (takingBlank) return { text: `Берём заготовку · слот ${magazine.selectedBlank || '—'}`, tone: 'blue' };
      return { text: 'Замена детали и заготовки', tone: 'blue' };
    }
    return { text: runtime.magazineSteps[magazineIndex], tone: 'blue' };
  }
  if (magazine.ready) return { text: 'Готов', tone: 'green' };
  if (magazine.done) return { text: 'Операция завершена', tone: 'green' };
  return { text: runtime.magazineSteps[magazineIndex] || 'Ожидает команду', tone: 'amber' };
}

function cellProcessStatus(state: CellState, runtime: PlcRuntimeInfo, connected: boolean, dataActive: boolean): OverviewStatus & { detail: string } {
  const selectedIndex = runtime.selectedMachine - 1;
  const selected = selectedIndex >= 0 && selectedIndex < state.machines.length ? state.machines[selectedIndex] : null;
  const machineName = selected ? `станок ${selectedIndex + 1}` : 'станок';
  const remaining = selected ? Math.max(0, Math.round(selected.cycleRemainingS)) : 0;

  if (!connected) return { text: 'Ожидание связи с PLC', detail: 'Состояния оборудования временно недоступны', tone: 'red' };
  if (!dataActive) return { text: 'Локальная модель', detail: 'Получение состояний из OPC UA приостановлено', tone: 'amber' };
  if (runtime.globalError || runtime.cellStateCode === 10) return { text: 'Автоматический цикл остановлен', detail: 'Обнаружена активная авария ячейки', tone: 'red' };
  if (!runtime.cellRunning) {
    if (runtime.safetyHomeRequired) return runtime.robotAtSafetyHome
      ? { text: 'HOME_SAFETY достигнута', detail: 'Безопасная позиция подтверждена PLC; проверьте остальные условия запуска', tone: 'green' }
      : { text: 'Требуется безопасное восстановление', detail: 'Выведите робот из опасной зоны и переместите в HOME_SAFETY', tone: 'amber' };
    if (runtime.manualMode) return { text: 'Ручной режим', detail: 'Автоматический цикл остановлен', tone: 'amber' };
    if (runtime.readyToStart) return { text: 'Ячейка готова к запуску', detail: 'Все условия автоматического запуска выполнены', tone: 'green' };
    return { text: 'Ячейка остановлена', detail: 'Ожидание готовности оборудования', tone: 'gray' };
  }

  switch (runtime.cellStateCode) {
    case 1: return { text: 'Определение следующей операции', detail: 'Проверяется содержимое захватов робота', tone: 'blue' };
    case 2: return { text: 'Выбор станка', detail: 'Поиск доступного станка для обслуживания', tone: 'blue' };
    case 3: return { text: `Робот перемещается к станку ${runtime.selectedMachine || '—'}`, detail: runtime.robotStep, tone: 'blue' };
    case 4: return { text: `Завершение перемещения к станку ${runtime.selectedMachine || '—'}`, detail: 'Ожидание освобождения команды робота', tone: 'blue' };
    case 5: return {
      text: 'Ожидание готового станка',
      detail: selected && selected.cycleExpectedS > 0
        ? `${machineName.charAt(0).toUpperCase() + machineName.slice(1)} завершит обработку через ${remaining} с`
        : `Ожидание готовности: ${machineName}`,
      tone: 'amber',
    };
    case 6: return { text: `Робот обслуживает станок ${runtime.selectedMachine || '—'}`, detail: selected?.currentStep || runtime.robotStep, tone: 'blue' };
    case 7: return { text: `Робот работает с магазином ${runtime.activeMagazine || '—'}`, detail: magazineOverviewStatus(state.magazines[Math.max(0, runtime.activeMagazine - 1)]?.state ?? state.magazines[0].state, runtime, connected, Math.max(0, runtime.activeMagazine - 1)).text, tone: 'blue' };
    case 8: return { text: 'Завершение операции магазина', detail: 'Ожидание освобождения команды робота', tone: 'blue' };
    case 9: return { text: 'Ожидание готовности магазина', detail: state.magazines.map((item, index) => `М${index + 1}: ${magazineOverviewStatus(item.state, runtime, connected, index).text}`).join(' · '), tone: 'amber' };
    default: return { text: runtime.cellStep || 'Автоматический цикл', detail: 'Выполняется программа ячейки', tone: 'blue' };
  }
}

function ProcessOverviewCard({ state, runtime, connected, dataActive, equipmentVisible, onEquipmentVisibilityChange }: {
  state: CellState;
  runtime: PlcRuntimeInfo;
  connected: boolean;
  dataActive: boolean;
  equipmentVisible: boolean;
  onEquipmentVisibilityChange: (visible: boolean) => void;
}) {
  const process = cellProcessStatus(state, runtime, connected, dataActive);
  const robot = robotOverviewStatus(state, runtime, connected, dataActive);
  const magazines = state.magazines.map((item, index) => magazineOverviewStatus(item.state, runtime, connected, index));

  return <section className={`process-overview-card tone-${process.tone}${equipmentVisible ? '' : ' equipment-collapsed'}`} aria-label="Текущий процесс и состояния оборудования">
    <header className="process-current-card">
      <div className="process-current-icon"><Activity aria-hidden="true" /></div>
      <div><span>Текущий процесс</span><strong>{process.text}</strong><p>{process.detail}</p></div>
      <button className="process-equipment-toggle" type="button" aria-expanded={equipmentVisible} aria-controls="process-equipment-list" onClick={() => onEquipmentVisibilityChange(!equipmentVisible)} title={equipmentVisible ? 'Скрыть состояния оборудования' : 'Показать состояния оборудования'}>
        {equipmentVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </header>
    <div id="process-equipment-list" className="process-equipment-reveal" aria-hidden={!equipmentVisible}>
      <div className="process-equipment-lines">
      {state.machines.map((machine, index) => {
        const status = machineOverviewStatus(machine, connected);
        const progress = machine.cycleExpectedS > 0 ? Math.min(100, machine.cycleElapsedS / machine.cycleExpectedS * 100) : 0;
        const showCycle = connected && machine.mode === 'processing';
        return <article className={`process-equipment-line tone-${status.tone}${showCycle ? ' has-cycle' : ''}`} key={index}>
          <div className="process-equipment-icon"><Icon icon={microwaveGenOutlineIcon} aria-hidden="true" /></div>
          <b>Станок {index + 1}</b>
          <div className="process-equipment-state"><i /><span title={status.text}>{status.text}</span></div>
          {showCycle && <div className="process-cycle"><em><u style={{ width: `${progress}%` }} /></em><small>{Math.round(machine.cycleElapsedS)} / {Math.round(machine.cycleExpectedS)} с</small></div>}
        </article>;
      })}
      <article className={`process-equipment-line tone-${robot.tone}`}>
        <div className="process-equipment-icon"><Icon icon={robotIndustrialOutlineIcon} aria-hidden="true" /></div>
        <b>Робот</b>
        <div className="process-equipment-state"><i /><span title={robot.text}>{robot.text}</span></div>
      </article>
      {magazines.map((magazine, index) => <article className={`process-equipment-line tone-${magazine.tone}`} key={`magazine-${index}`}>
        <div className="process-equipment-icon"><Icon icon={viewGridOutlineIcon} aria-hidden="true" /></div>
        <b>Магазин {index + 1}</b>
        <div className="process-equipment-state"><i /><span title={magazine.text}>{magazine.text}</span></div>
      </article>)}
      </div>
    </div>
  </section>;
}

function BottomNavigation({ active, onSelect, alarmEvents }: {
  active: BottomSection | null;
  onSelect: (section: BottomSection) => void;
  alarmEvents: PlcAlarmEvent[];
}) {
  const items = [
    { key: 'cell' as const, label: 'Ячейка', icon: conveyorBeltOutlineIcon, sources: ['cell'] as PlcAlarmSource[] },
    { key: 'machines' as const, label: 'Станки', icon: microwaveGenOutlineIcon, sources: ['machine-1', 'machine-2', 'machine-3'] as PlcAlarmSource[] },
    { key: 'robot' as const, label: 'Робот', icon: robotIndustrialOutlineIcon, sources: ['robot', 'axis-x', 'axis-y', 'axis-z', 'axis-group', 'motion-manager', 'point-manager'] as PlcAlarmSource[] },
    { key: 'magazine' as const, label: 'Магазины', icon: viewGridOutlineIcon, sources: ['magazine-1', 'magazine-2', 'magazine-axis-1', 'magazine-axis-2'] as PlcAlarmSource[] },
    { key: 'cyclogram' as const, label: 'Циклограмма', icon: timelineIcon, sources: [] as PlcAlarmSource[] },
  ];
  return <nav className="cell-bottom-nav" aria-label="Быстрое управление">
    {items.map(({ key, label, icon, sources }) => {
      const events = alarmEvents.filter((event) => event.active && sources.includes(event.source));
      const tone = events.some((event) => event.severity === 'alarm') ? 'alarm' : events.length ? 'warning' : '';
      return <button key={key} className={`${active === key ? 'active ' : ''}${tone ? `has-${tone}` : ''}`.trim()} type="button" onClick={() => onSelect(key)} aria-label={label} title={label}><Icon icon={icon} aria-hidden="true" /></button>;
    })}
  </nav>;
}

function AlarmScreen({ events, online, resetAllowed, onResetWarnings, onResetAlarms, onClose, className }: {
  events: PlcAlarmEvent[];
  online: boolean;
  resetAllowed: boolean;
  onResetWarnings: () => void;
  onResetAlarms: () => void;
  onClose: () => void;
  className?: string;
}) {
  const [severityFilter, setSeverityFilter] = useState<'all' | 'alarm' | 'warning'>('all');
  const activeAlarms = events.filter((event) => event.active && event.severity === 'alarm').length;
  const activeWarnings = events.filter((event) => event.active && event.severity === 'warning').length;
  const filteredEvents = severityFilter === 'all'
    ? events
    : events.filter((event) => event.severity === severityFilter);
  const formatDate = (time: number) => new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(time);
  const formatTime = (time: number) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(time);

  return <section className={`alarm-panel ${className ?? ''}`} aria-label="Аварии и предупреждения">
    <SheetGrip onClose={onClose} />
    <header className="alarm-panel-heading">
      <div><h2>Аварии и предупреждения</h2><p>Активные и зафиксированные события</p></div>
      <div className="alarm-panel-actions">
        <button className="alarm-reset-warnings" type="button" onClick={onResetWarnings} disabled={!online || activeWarnings === 0}><AlertCircle size={20} />Сбросить предупреждения</button>
        <button className={`alarm-reset-all ${resetAllowed ? '' : 'command-unavailable'}`} type="button" onClick={onResetAlarms} disabled={!online} aria-disabled={!resetAllowed}><RotateCcw size={20} />Сбросить аварии</button>
        <button className="panel-close-button" type="button" onClick={onClose} aria-label="Закрыть аварии" title="Закрыть"><X /></button>
      </div>
    </header>
    <div className="alarm-summary-line">
      <span className={activeAlarms ? 'alarm' : ''}><TriangleAlert />Аварии <b>{activeAlarms}</b></span>
      <span className={activeWarnings ? 'warning' : ''}><AlertCircle />Предупреждения <b>{activeWarnings}</b></span>
      <div className="alarm-filter" role="group" aria-label="Фильтр журнала">
        <button type="button" className={severityFilter === 'all' ? 'active' : ''} aria-pressed={severityFilter === 'all'} onClick={() => setSeverityFilter('all')}>Все</button>
        <button type="button" className={severityFilter === 'alarm' ? 'active alarm' : ''} aria-pressed={severityFilter === 'alarm'} onClick={() => setSeverityFilter('alarm')}>Только аварии</button>
        <button type="button" className={severityFilter === 'warning' ? 'active warning' : ''} aria-pressed={severityFilter === 'warning'} onClick={() => setSeverityFilter('warning')}>Только предупреждения</button>
      </div>
      <small>{online ? 'Журнал обновляется от PLC' : 'Нет связи с PLC'}</small>
    </div>
    <div className="alarm-table" role="region" aria-label="Журнал аварий" tabIndex={0}>
      <div className="alarm-table-head"><span>Событие</span><span>Механизм</span><span>Дата</span><span>Время</span><span>Статус</span></div>
      {filteredEvents.length === 0
        ? <div className="alarm-empty"><CheckCircle2 /><strong>{events.length === 0 ? 'Событий нет' : 'Событий выбранного типа нет'}</strong><span>{events.length === 0 ? 'Новые аварии и предупреждения появятся здесь.' : 'Выберите другой фильтр журнала.'}</span></div>
        : filteredEvents.map((event) => <article className={`alarm-row ${event.severity}${event.active ? ' active' : ''}`} key={event.id}>
          <span className="alarm-event-text">{event.severity === 'alarm' ? <TriangleAlert /> : <AlertCircle />}<b>{event.text}</b></span>
          <span>{ALARM_SOURCE_LABELS[event.source]}</span>
          <span>{formatDate(event.reportedAt)}</span>
          <span>{formatTime(event.reportedAt)}</span>
          <span className="alarm-row-status"><i />{event.active ? 'Активно' : 'Устранено'}</span>
        </article>)}
    </div>
  </section>;
}

function loadLayout(): CellLayout {
  const fallback = cloneLayout();
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) ?? '{}') as Partial<CellLayout> & { indexedConveyor?: CellLayout['indexedConveyors'][number] };
    const savedConveyors = saved.indexedConveyors ?? (saved.indexedConveyor ? [saved.indexedConveyor, fallback.indexedConveyors[1]] : fallback.indexedConveyors);
    return {
      ...fallback,
      ...saved,
      coordinate: { ...fallback.coordinate, ...saved.coordinate, origin: { ...fallback.coordinate.origin, ...saved.coordinate?.origin }, direction: { ...fallback.coordinate.direction, ...saved.coordinate?.direction } },
      floor: { ...fallback.floor, ...saved.floor },
      machine: { ...fallback.machine, ...saved.machine, machines: saved.machine?.machines ?? fallback.machine.machines },
      portal: { ...fallback.portal, ...saved.portal },
      robot: { ...fallback.robot, ...saved.robot },
      indexedConveyors: fallback.indexedConveyors.map((conveyor, index) => ({
        ...conveyor,
        ...savedConveyors[index],
        position: { ...conveyor.position, ...savedConveyors[index]?.position },
      })) as CellLayout['indexedConveyors'],
      animation: { ...fallback.animation, ...saved.animation },
    };
  } catch {
    return fallback;
  }
}

function MachinePanel({ index, state, multiTypeCount, productTypeChangeAllowed, onClose, onToggleEnabled, onCycleSettings, onProductType, className }: {
  index: number;
  state: CellState['machines'][number];
  multiTypeCount: number;
  productTypeChangeAllowed: boolean;
  onClose: () => void;
  onToggleEnabled: () => void;
  onCycleSettings: (useHmi: boolean, seconds?: number) => void;
  onProductType: (type: ProductType) => void;
  className?: string;
}) {
  const progress = state.cycleExpectedS > 0 ? Math.min(100, state.cycleElapsedS / state.cycleExpectedS * 100) : 0;
  const remaining = Math.max(0, state.cycleExpectedS - state.cycleElapsedS);
  const stateText = !state.enabled ? 'Станок отключён' : state.disablePending ? 'Отключение после завершения' : state.currentStep;
  return <aside className={`side-panel machine-panel ${className ?? ''}`}>
    <div className="panel-heading machine-panel-heading">
      <div><span>ОБОРУДОВАНИЕ · СТАНОК {index + 1}</span><h2>{stateText}</h2></div>
      <button onClick={onClose} title="Закрыть"><ChevronRight /></button>
    </div>

    {state.activeErrors.length > 0 && <div className="machine-error-banner"><AlertCircle /><div><strong>Активная авария</strong><span>{state.activeErrors[0]}</span></div></div>}

    <div className="machine-command-bar">
      <button className={`machine-power ${state.enabled ? 'enabled' : 'ready'} ${state.powerAllowed ? '' : 'command-unavailable'}`} onClick={onToggleEnabled} aria-disabled={!state.powerAllowed} data-plc-command={state.disablePending || !state.enabled ? `GVL_HMI.axMachineEnable[${index + 1}]` : `GVL_HMI.axMachineDisable[${index + 1}]`}><Power size={21} /><span>{state.disablePending ? 'Отменить отключение' : state.enabled ? 'Выключить станок' : 'Включить станок'}</span></button>
    </div>

    <section className="machine-product-type-section"><div className="panel-section-title"><Boxes size={18} /><h3>Тип обрабатываемой заготовки</h3><ProductTypeBadge type={state.productType} /></div><ProductTypeSelector value={state.productType} count={multiTypeCount} disabled={!productTypeChangeAllowed} onChange={onProductType} /><p className="panel-note">Изменение разрешено PLC только для выключенного и остановленного станка.</p></section>

    <div className="machine-state-band"><Indicator active={state.mode !== 'off'} tone={state.mode === 'error' ? 'red' : state.mode === 'processing' ? 'green' : 'amber'} /><div><span>ТЕКУЩИЙ ШАГ</span><strong>{stateText || '\u00A0'}</strong></div></div>

    <section className="machine-cycle-section"><div className="panel-section-title"><Clock3 size={18} /><h3>Цикл обработки</h3></div>
      <div className="cycle-times"><div><span>Прошло</span><b>{state.cycleElapsedS} с</b></div><div><span>Осталось</span><b>{remaining} с</b></div><div><span>Ожидается</span><b>{state.cycleExpectedS} с</b></div></div>
      <div className={`cycle-progress ${state.cycleOvertime ? 'overtime' : ''}`}><i style={{ width: `${progress}%` }} /></div>
      {state.cycleOvertime && <p className="overtime-text">Ожидаемое время обработки превышено</p>}
    </section>

    <section><div className="panel-section-title"><Activity size={18} /><h3>Операция</h3></div>
      <div className="operation-list"><span>Рекомендуемая <b>{MACHINE_OPERATION[state.recommendedOperation]}</b></span><span>Выполняемая <b>{MACHINE_OPERATION[state.actualOperation]}</b></span><span>Обслуживание роботом <b>{state.canAcceptService ? 'Разрешено' : state.serviceRequired ? 'Требуется' : 'Не требуется'}</b></span></div>
    </section>

    <section><div className="panel-section-title"><Factory size={18} /><h3>Механизмы</h3></div>
      <div className="machine-io-grid"><div><DoorOpen /><span>Дверь</span><b>{state.doorOpen ? 'Открыта' : state.doorClosed ? 'Закрыта' : 'Движение'}</b></div><div>{state.chuckClosed ? <LockKeyhole /> : <UnlockKeyhole />}<span>Патрон</span><b>{state.chuckOpen ? 'Открыт' : state.chuckClosed ? 'Закрыт' : 'Движение'}</b></div><div><Box /><span>Изделие</span><b>{machineProduct(state).text}</b></div><div>{state.activeErrors.length ? <AlertCircle /> : <CheckCircle2 />}<span>Авария</span><b>{state.activeErrors.length ? 'Есть' : 'Нет'}</b></div></div>
    </section>

    <section><div className="panel-section-title"><Clock3 size={18} /><h3>Оценка времени</h3></div>
      <div className="segmented cycle-source"><button className={state.useHmiCycleTime ? 'active' : ''} onClick={() => onCycleSettings(true)}>Задано HMI</button><button className={!state.useHmiCycleTime ? 'active' : ''} onClick={() => onCycleSettings(false)}>Измеряется</button></div>
      <label className="cycle-time-input"><span>Время цикла с HMI</span><div><input type="number" min={1} max={86400} value={state.cycleExpectedS} onChange={(event) => onCycleSettings(true, Number(event.target.value))} /><em>с</em></div></label>
      <div className="measured-time"><span>Последний корректный цикл</span><b>{state.measuredCycleS.toFixed(1)} с</b></div>
    </section>

    <section className="machine-errors-section"><div className="panel-section-title"><ShieldAlert size={18} /><h3>Ошибки</h3></div>
      {state.activeErrors.length === 0 ? <div className="no-errors"><CheckCircle2 /><span>Активных ошибок нет</span></div> : <ul>{state.activeErrors.map((error) => <li key={error}>{error}</li>)}</ul>}
      {state.lastErrors.length > 0 && <div className="last-error"><span>Последняя ошибка</span><b>{state.lastErrors[0]}</b></div>}
    </section>
  </aside>;
}

function OperatorConfirmation({ index, machine, layout, state, robotCoordinatesRef, onCommand, onCancel, className }: {
  index: number;
  machine: CellState['machines'][number];
  layout: CellLayout;
  state: CellState;
  robotCoordinatesRef: RefObject<RobotCoordinateFrame>;
  onCommand: (command: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const step = machine.plcState === 2 || machine.plcState === 15 ? 3
    : machine.plcState === 3 || machine.plcState === 12 ? 2 : 1;
  const moving = machine.plcState === 12 || machine.plcState === 15 || machine.plcState === 0;
  const steps = ['Что установлено в станке?', 'Закрыть дверь?', 'Запустить цикл ЧПУ?'];
  return <div className={`confirmation-overlay ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={`Подтверждение оператора для станка ${index + 1}`} onPointerDown={(event) => event.stopPropagation()}>
    <div className="confirmation-modal">
      <aside className="confirmation-context">
        <div><span>ВВОД В РАБОТУ</span><h2>Станок {index + 1}</h2></div>
        <div className="confirmation-cell-preview"><CellViewport layout={layout} state={state} robotCoordinatesRef={robotCoordinatesRef} selectedMachine={index} cameraPreset="iso" onMachineSelect={() => {}} /></div>
        <p>Выбранный станок отмечен в модели ячейки.</p>
      </aside>
      <section className="confirmation-workflow">
        <header><div><span>СТАНОК {index + 1}</span><h2>Подтверждение оператора</h2></div><button type="button" onClick={onCancel} title="Отменить ввод в работу"><X /></button></header>
        <div className="confirmation-stepper">{steps.map((label, stepIndex) => <div key={label} className={stepIndex + 1 === step ? 'active' : stepIndex + 1 < step ? 'done' : ''}><i>{stepIndex + 1}</i><span>{label}</span></div>)}</div>
        <div className="confirmation-question">
          {moving ? <div className="confirmation-wait"><LoaderCircle /><strong>{machine.plcState === 12 ? 'Закрывается дверь' : machine.plcState === 15 ? 'Запускается обработка' : 'Включается станок'}</strong><span>Ожидание подтверждения от PLC</span></div>
          : step === 1 ? <><div className="question-heading"><span>ШАГ 1 ИЗ 3</span><h3>Что находится в патроне станка?</h3><p>Выберите фактический тип установленного изделия.</p></div><div className="part-choice"><button className="blank" type="button" onClick={() => onCommand('machine.setBlank')}><Cylinder /><strong>Заготовка</strong><span>Необработанная заготовка</span></button><button className="detail" type="button" onClick={() => onCommand('machine.setDetail')}><Disc3 /><strong>Деталь</strong><span>Готовая обработанная деталь</span></button></div></>
          : step === 2 ? <><div className="question-heading"><span>ШАГ 2 ИЗ 3</span><h3>Закрыть дверь станка?</h3><p>После подтверждения PLC подаст команду закрытия двери.</p></div><div className="confirmation-actions"><button className="primary" type="button" onClick={() => onCommand('machine.acceptDoor')}>Закрыть дверь</button><button type="button" onClick={() => onCommand('machine.rejectDoor')}>Не закрывать</button></div></>
          : <><div className="question-heading"><span>ШАГ 3 ИЗ 3</span><h3>Запустить цикл обработки?</h3><p>Проверьте установку изделия и готовность станка.</p></div><div className="confirmation-actions"><button className="primary" type="button" onClick={() => onCommand('machine.acceptRun')}>Запустить обработку</button><button type="button" onClick={() => onCommand('machine.rejectRun')}>Не запускать</button></div></>}
        </div>
        <footer><button type="button" onClick={onCancel}>Отменить ввод в работу</button><span>Следующий этап откроется после ответа PLC</span></footer>
      </section>
    </div>
  </div>;
}

function CellStartConfirmation({ runtime, layout, state, robotCoordinatesRef, onChoice, onCancel, className }: {
  runtime: PlcRuntimeInfo;
  layout: CellLayout;
  state: CellState;
  robotCoordinatesRef: RefObject<RobotCoordinateFrame>;
  onChoice: (choice: number) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [answerPending, setAnswerPending] = useState(false);
  const prompt = runtime.operatorPrompt;
  const step = prompt <= 2 ? 1 : prompt <= 4 ? 2 : 3;
  const gripper = prompt <= 2 ? 1 : 2;
  const isTypePrompt = prompt === 2 || prompt === 4;
  const isMachinePrompt = prompt === 5;
  const types = ([1, 2, 3] as ProductType[]).filter((type) => (runtime.operatorTypeMask & (1 << (type - 1))) !== 0);
  const machines = [1, 2, 3].filter((machine) => (runtime.operatorMachineMask & (1 << (machine - 1))) !== 0);
  const steps = ['Проверить захват 1', 'Проверить захват 2', 'Выбрать стартовый станок'];
  const selectedMachine = isMachinePrompt && machines.length === 1 ? machines[0] - 1 : null;
  const choiceDisabled = !runtime.operatorChoiceAllowed || answerPending;
  const submitChoice = (choice: number) => {
    if (choiceDisabled) return;
    setAnswerPending(true);
    onChoice(choice);
  };

  useEffect(() => {
    if (!answerPending) return undefined;
    // Gateway удерживает PLC-импульс 150 мс. Не даём следующему вопросу
    // повторно использовать ещё не снятый фронт того же BOOL.
    const timer = window.setTimeout(() => setAnswerPending(false), 200);
    return () => window.clearTimeout(timer);
  }, [answerPending]);

  return <div className={`confirmation-overlay ${className ?? ''}`} role="dialog" aria-modal="true" aria-label="Предпусковой опрос содержимого захватов" onPointerDown={(event) => event.stopPropagation()}>
    <div className="confirmation-modal">
      <aside className="confirmation-context">
        <div><span>ЗАПУСК АВТОМАТИЧЕСКОГО ЦИКЛА</span><h2>{isMachinePrompt ? 'Выбор станка' : `Захват ${gripper}`}</h2></div>
        <div className="confirmation-cell-preview"><CellViewport layout={layout} state={state} robotCoordinatesRef={robotCoordinatesRef} selectedMachine={selectedMachine} cameraPreset="iso" onMachineSelect={() => {}} /></div>
        <p>PLC проверяет ответ и разрешает только совместимый маршрут.</p>
      </aside>
      <section className="confirmation-workflow">
        <header><div><span>ПРЕДПУСКОВАЯ ПРОВЕРКА</span><h2>Подтверждение оператора</h2></div><button type="button" disabled={!runtime.operatorCancelAllowed} onClick={onCancel} title="Отменить запуск"><X /></button></header>
        <div className="confirmation-stepper">{steps.map((label, index) => <div key={label} className={index + 1 === step ? 'active' : index + 1 < step ? 'done' : ''}><i>{index + 1}</i><span>{label}</span></div>)}</div>
        <div className="confirmation-question">
          {isTypePrompt
            ? <><div className="question-heading"><span>{`ШАГ ${step} ИЗ 3`}</span><h3>{`Какого типа ${gripper === 1 ? 'заготовка' : 'деталь'} в захвате ${gripper}?`}</h3><p>Показаны типы, активные в текущей конфигурации ячейки.</p></div><div className={`payload-type-choice count-${types.length}`}>{types.map((type) => <button className={`product-type-${type}`} disabled={choiceDisabled} key={type} type="button" onClick={() => submitChoice(type)}><i /><strong>Тип {type}</strong><ProductTypeBadge type={type} /><span>{gripper === 1 ? 'Заготовка' : 'Готовая деталь'}</span></button>)}</div></>
            : isMachinePrompt
              ? <><div className="question-heading"><span>ШАГ 3 ИЗ 3</span><h3>В какой станок загрузить заготовку?</h3><p>Доступны только пустые, готовые станки соответствующего типа.</p></div><div className={`start-machine-choice count-${machines.length}`}>{machines.map((machine) => {
                const productType = state.machines[machine - 1].productType;
                return <button className={`product-type-${productType}`} disabled={choiceDisabled} key={machine} type="button" onClick={() => submitChoice(machine)}><Factory /><strong>Станок {machine}</strong><ProductTypeBadge type={productType} /><span>Выполнить стартовый LOAD</span></button>;
              })}</div></>
              : <><div className="question-heading"><span>{`ШАГ ${step} ИЗ 3`}</span><h3>{`Что находится в захвате ${gripper}?`}</h3><p>Укажите фактическое содержимое закрытого захвата.</p></div><div className="part-choice"><button className="blank" disabled={choiceDisabled} type="button" onClick={() => submitChoice(1)}><Cylinder /><strong>Заготовка</strong><span>Необработанная заготовка</span></button><button className="detail" disabled={choiceDisabled} type="button" onClick={() => submitChoice(2)}><Disc3 /><strong>Деталь</strong><span>Готовая обработанная деталь</span></button></div></>}
        </div>
        <footer><button type="button" disabled={!runtime.operatorCancelAllowed} onClick={onCancel}>Отменить запуск</button><span>{answerPending ? 'Ожидание подтверждения PLC' : 'Следующий вопрос формирует PLC после проверки ответа'}</span></footer>
      </section>
    </div>
  </div>;
}

function MagazineScreen({ magazine, magazineNumber, step, typeCount, onClose, onToggleEnabled, onCommand, onFill, onClear, onSlotApply, onSetting, className }: {
  magazine: CellState['magazines'][number];
  magazineNumber: 1 | 2;
  step: string;
  typeCount: number;
  onClose: () => void;
  onToggleEnabled: () => void;
  onCommand: (action: string) => void;
  onFill: () => void;
  onClear: () => void;
  onSlotApply: (index: number, content: SlotType, productType: ProductType) => void;
  onSetting: (command: string, key: keyof CellState['magazines'][number]['state'], value: number) => void;
  className?: string;
}) {
  const [zone, setZone] = useState<1 | 2>(1);
  const [editContent, setEditContent] = useState<SlotType>('blank');
  const [editProductType, setEditProductType] = useState<ProductType>(1);
  useEffect(() => {
    if (editProductType > typeCount) setEditProductType(1);
  }, [editProductType, typeCount]);
  const state = magazine.state;
  const slots = magazine.zones[zone - 1];
  const productTypes = magazine.zoneProductTypes[zone - 1];
  const activeCount = Math.min(slots.length, state.rows * state.columns);
  const activeSlots = slots.slice(0, activeCount);
  const blanks = activeSlots.filter((slot) => slot === 'blank').length;
  const details = activeSlots.filter((slot) => slot === 'detail').length;
  const empty = activeCount - blanks - details;
  const statusText = state.error || state.axisError ? 'Авария магазина' : state.indexing ? 'Индексирование' : state.disablePending ? 'Отключение после операции' : state.enabled ? 'Магазин включён' : 'Магазин отключён';
  const operationText = { NONE: 'Нет операции', PUT: 'Приём детали', TAKE: 'Выдача заготовки', CHANGE: 'Смена детали', RETURN_BLANK: 'Возврат заготовки' }[state.actualOperation];
  const setting = (label: string, command: string, key: keyof typeof state, min: number, max: number, stepValue = 1) => <label className="magazine-setting"><span>{label}</span><input type="number" value={state[key] as number} min={min} max={max} step={stepValue} disabled={state.busy || state.indexing} onChange={(event) => onSetting(command, key, Number(event.target.value))} /></label>;
  return <section className={`magazine-screen ${className ?? ''}`} onPointerDown={(event) => event.stopPropagation()}>
    <header className="magazine-screen-head"><div><span>ОБОРУДОВАНИЕ · МАГАЗИН {magazineNumber}</span><h2>Расширенное управление магазином</h2><p><Indicator active={state.enabled && !state.error} tone={state.error || state.axisError ? 'red' : state.indexing || state.disablePending ? 'amber' : 'green'} />{statusText}</p></div><button type="button" onClick={onClose} title="Закрыть"><X /></button></header>
    <div className="magazine-command-row">
      <button className={`magazine-power ${state.enabled ? 'enabled' : state.enableSequenceAllowed ? 'ready' : ''} ${state.enableSequenceAllowed ? '' : 'command-unavailable'}`} type="button" onClick={onToggleEnabled} aria-disabled={!state.enableSequenceAllowed}><Power /><span>{state.enabled ? 'Выключить магазин' : 'Включить магазин'}</span></button>
      <button className={state.indexAllowed ? 'primary' : 'command-unavailable'} type="button" onClick={() => onCommand('index')} aria-disabled={!state.indexAllowed}><ArrowRight /><span>В рабочую зону</span></button>
      <button type="button" onClick={() => onCommand(state.powered ? 'powerOff' : 'powerOn')}><Power /><span>{state.powered ? 'Выключить привод' : 'Включить привод'}</span></button>
      <button type="button" onClick={() => onCommand('home')}><Home /><span>Home</span></button>
      <button type="button" onClick={() => onCommand('stop')}><AlertCircle /><span>Стоп</span></button>
      <button type="button" onClick={() => onCommand('reset')}><RotateCcw /><span>Сброс</span></button>
      <button className={state.fillAllowed ? '' : 'command-unavailable'} type="button" onClick={onFill} aria-disabled={!state.fillAllowed}><PackagePlus /><span>Заполнить Zone 1</span></button>
      <button className={`clear ${state.clearAllowed ? '' : 'command-unavailable'}`} type="button" onClick={onClear} aria-disabled={!state.clearAllowed}><Trash2 /><span>Очистить Zone 1</span></button>
    </div>
    <div className="magazine-screen-grid">
      <section className="magazine-map-panel"><div className="magazine-section-head"><div><span>СОДЕРЖИМОЕ</span><h3>Zone {zone} · {state.columns} × {state.rows}</h3></div><div className="magazine-edit-mode"><button className={zone === 1 ? 'active' : ''} type="button" onClick={() => setZone(1)}>Zone 1 · загрузка</button><button className={zone === 2 ? 'active' : ''} type="button" onClick={() => setZone(2)}>Zone 2 · робот</button></div></div>{zone === 1 && <div className="magazine-slot-editor"><div><span>Записывать в слот</span><div className="magazine-content-selector"><button className={editContent === 'empty' ? 'active' : ''} type="button" onClick={() => setEditContent('empty')}>Пусто</button><button className={editContent === 'blank' ? 'active' : ''} type="button" onClick={() => setEditContent('blank')}>Заготовка</button><button className={editContent === 'detail' ? 'active' : ''} type="button" onClick={() => setEditContent('detail')}>Изделие</button></div></div><ProductTypeSelector label="Тип изделия" value={editProductType} count={typeCount} disabled={editContent === 'empty'} onChange={setEditProductType} /></div>}<div className="magazine-map"><MagazineMatrix slots={slots} productTypes={productTypes} columns={state.columns} activeCount={activeCount} onSlotClick={zone === 1 ? (index) => onSlotApply(index, editContent, editProductType) : undefined} /></div><div className="magazine-map-footer"><span><i className="slot blank" />Заготовки <b>{blanks}</b></span><span><i className="slot detail" />Детали <b>{details}</b></span><span><i className="slot empty" />Пусто <b>{empty}</b></span><strong>{zone === 1 ? state.zone1EditAllowed ? 'Редактирование разрешено' : 'PLC сейчас запрещает изменение' : 'Zone 2 только для просмотра'}</strong></div></section>
      <aside className="magazine-side-column">
        <section className="magazine-diagnostics"><div className="magazine-section-head"><div><span>ДИАГНОСТИКА</span><h3>{step}</h3></div></div><div className="diagnostic-list"><span>Привод <b>{state.powered ? 'Включён' : 'Выключен'}</b></span><span>Home <b>{state.homed ? 'Найден' : 'Не найден'}</b></span><span>Позиция <b>{state.axisPosition.toFixed(1)} мм</b></span><span>Карта позиции <b>{state.positionValid ? 'Согласована' : 'Недостоверна'}</b></span><span>Текущая операция <b>{operationText}</b></span><span>TAKE / PUT / CHANGE <b>{state.canTake ? 'Да' : 'Нет'} / {state.canPut ? 'Да' : 'Нет'} / {state.canChange ? 'Да' : 'Нет'}</b></span></div>{state.recoveryRequired && <div className="magazine-warning"><AlertCircle /><span>Требуется Home и сверка зон</span></div>}{state.activeErrors.length ? <div className="magazine-error"><AlertCircle /><span>{state.activeErrors[0]}</span></div> : <div className="magazine-ok"><CheckCircle2 /><span>{state.axisStep || 'Активных ошибок нет'}</span></div>}</section>
        <section className="magazine-settings"><div className="magazine-section-head"><div><span>НАСТРОЙКИ</span><h3>Рабочая геометрия</h3></div><Settings /></div><div className="magazine-settings-grid">{setting('Шаг по X, мм', 'magazine.pitchX', 'pitchX', 1, 5000, 0.1)}{setting('Шаг по Y, мм', 'magazine.pitchY', 'pitchY', 1, 5000, 0.1)}{setting('Safe Z, мм', 'magazine.safeAbove', 'safeAbove', -10000, 10000, 0.1)}{setting('Change Z, мм', 'magazine.safeInside', 'safeInside', -10000, 10000, 0.1)}</div></section>
      </aside>
    </div>
  </section>;
}

function MagazineHomeConfirmation({ magazineNumber, onConfirm, onCancel }: { magazineNumber: number; onConfirm: () => void; onCancel: () => void }) {
  return <div className="confirmation-overlay magazine-home-confirmation" role="dialog" aria-modal="true" aria-label={`Поиск домашней позиции магазина ${magazineNumber}`} onPointerDown={(event) => event.stopPropagation()}>
    <section>
      <div className="confirmation-warning-icon"><TriangleAlert /></div>
      <span>ПЕРЕМЕЩЕНИЕ ОБОРУДОВАНИЯ</span>
      <h2>Магазин {magazineNumber} не имеет домашней позиции</h2>
      <p>После подтверждения PLC включит сервопривод и запустит поиск Home. Убедитесь, что в зоне движения нет человека и посторонних предметов.</p>
      <div><button type="button" onClick={onCancel}>Отмена</button><button className="primary" type="button" onClick={onConfirm}><Home />Включить привод и найти Home</button></div>
    </section>
  </div>;
}

function Toggle({ checked, label, onChange, disabled = false }: { checked: boolean; label: string; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className={`toggle-row ${disabled ? 'disabled' : ''}`}><span>{label}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><i /></label>;
}

function NumberField({ label, value, unit = 'мм', min = -3000, max = 18000, step = 10, onChange }: {
  label: string; value: number; unit?: string; min?: number; max?: number; step?: number; onChange: (value: number) => void;
}) {
  return <label className="number-field"><span>{label}</span><input className="settings-range" type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} /><div><input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} /><em>{unit}</em></div></label>;
}

function SettingsPanel({ layout, setLayout, onClose, className }: {
  layout: CellLayout;
  setLayout: (layout: CellLayout) => void;
  onClose: () => void;
  className?: string;
}) {
  const change = (edit: (draft: CellLayout) => void) => { const next = structuredClone(layout); edit(next); setLayout(next); };
  return (
    <aside className={`side-panel settings-panel ${className ?? ''}`}>
      <div className="panel-heading"><div><span>НАСТРОЙКИ · СОХРАНЯЮТСЯ АВТОМАТИЧЕСКИ</span><h2>Визуализация</h2></div><button onClick={onClose} title="Закрыть"><ChevronRight /></button></div>
      <section><h3>Система координат</h3><div className="field-grid">
        <NumberField label="Начало X" value={layout.coordinate.origin.x} min={-5000} max={5000} onChange={(v) => change((d) => { d.coordinate.origin.x = v; })} />
        <NumberField label="Начало Y" value={layout.coordinate.origin.y} min={-5000} max={5000} onChange={(v) => change((d) => { d.coordinate.origin.y = v; })} />
        <NumberField label="Начало Z" value={layout.coordinate.origin.z} min={-3000} max={3000} onChange={(v) => change((d) => { d.coordinate.origin.z = v; })} />
      </div><div className="axis-directions">{(['x', 'y', 'z'] as const).map((axis) => <label key={axis}>Ось {axis.toUpperCase()}<select value={layout.coordinate.direction[axis]} onChange={(e) => change((d) => { d.coordinate.direction[axis] = Number(e.target.value) as 1 | -1; })}><option value={1}>Прямая</option><option value={-1}>Обратная</option></select></label>)}</div></section>
      <section><h3>Станки</h3><div className="field-grid">
        <NumberField label="Ширина X" value={layout.machine.sizeX} min={1000} max={5000} onChange={(v) => change((d) => { d.machine.sizeX = v; })} />
        <NumberField label="Глубина Y" value={layout.machine.sizeY} min={800} max={3500} onChange={(v) => change((d) => { d.machine.sizeY = v; })} />
        <NumberField label="Высота Z" value={layout.machine.sizeZ} min={800} max={3500} onChange={(v) => change((d) => { d.machine.sizeZ = v; })} />
        <NumberField label="Ход двери" value={layout.machine.doorTravel} min={100} max={2500} onChange={(v) => change((d) => { d.machine.doorTravel = v; })} />
      </div>{layout.machine.machines.map((machine, index) => <div className="position-row" key={index}><b>Станок {index + 1}</b><NumberField label="X" value={machine.position.x} onChange={(v) => change((d) => { d.machine.machines[index].position.x = v; })} /><NumberField label="Y" value={machine.position.y} onChange={(v) => change((d) => { d.machine.machines[index].position.y = v; })} /></div>)}</section>
      <section><h3>Портал</h3><div className="field-grid">
        <NumberField label="Позиция X" value={layout.portal.position.x} min={-3000} max={3000} onChange={(v) => change((d) => { d.portal.position.x = v; })} />
        <NumberField label="Позиция Y" value={layout.portal.position.y} min={0} max={5000} onChange={(v) => change((d) => { d.portal.position.y = v; })} />
        <NumberField label="Длина X" value={layout.portal.lengthX} min={8000} max={18000} onChange={(v) => change((d) => { d.portal.lengthX = v; })} />
        <NumberField label="Ширина Y" value={layout.portal.widthY} min={800} max={4000} onChange={(v) => change((d) => { d.portal.widthY = v; })} />
        <NumberField label="Низ рамы Z" value={layout.portal.frameBottomZ} min={1200} max={4000} onChange={(v) => change((d) => { d.portal.frameBottomZ = v; })} />
      </div></section>
      {layout.indexedConveyors.map((conveyor, index) => <section key={index}><h3>Индексный магазин {index + 1} · 30 × 10</h3><div className="field-grid">
        <NumberField label="Позиция X" value={conveyor.position.x} min={0} max={15000} onChange={(v) => change((d) => { d.indexedConveyors[index].position.x = v; })} />
        <NumberField label="Позиция Y" value={conveyor.position.y} min={0} max={5000} onChange={(v) => change((d) => { d.indexedConveyors[index].position.y = v; })} />
        <NumberField label="Рабочая высота Z" value={conveyor.workingHeight} min={400} max={1800} onChange={(v) => change((d) => { d.indexedConveyors[index].workingHeight = v; })} />
        <NumberField label="Радиус ролика" value={conveyor.rollerRadius} min={40} max={250} step={0.5} onChange={(v) => change((d) => { d.indexedConveyors[index].rollerRadius = v; })} />
      </div></section>)}
      <div className="panel-actions"><button onClick={() => setLayout(cloneLayout())}><RotateCcw size={16} />Сбросить геометрию</button></div>
    </aside>
  );
}

function ManualPanel({ state, layout, setState, machineIndex, setMachineIndex, conveyorTestStatuses, onConveyorTest, onClose, plcDataEnabled, onPlcDataChange, className }: {
  state: CellState; layout: CellLayout; setState: (state: CellState) => void; machineIndex: number; setMachineIndex: (index: number) => void; onClose: () => void;
  conveyorTestStatuses: [IndexedConveyorTestStatus, IndexedConveyorTestStatus];
  onConveyorTest: (magazineId: 1 | 2, command: IndexedConveyorTestCommandType) => void;
  plcDataEnabled: boolean; onPlcDataChange: (enabled: boolean) => void; className?: string;
}) {
  const [manualMagazine, setManualMagazine] = useState(0);
  const updateRobot = (patch: Partial<CellState['robot']>) => setState({ ...state, robot: { ...state.robot, ...patch } });
  const updateMachine = (patch: Partial<CellState['machines'][number]>) => { const machines = [...state.machines]; machines[machineIndex] = { ...machines[machineIndex], ...patch }; setState({ ...state, machines }); };
  const travelLimits = getRobotTravelLimits(layout);
  return <aside className={`side-panel manual-panel ${className ?? ''}`}>
    <div className="panel-heading"><div><span>ТЕСТ МОДЕЛИ</span><h2>Ручное управление</h2></div><button onClick={onClose} title="Закрыть"><ChevronRight /></button></div>
    <section className="robot-data-source"><h3>Источник данных ячейки</h3><Toggle label="Получать все состояния из OPC UA" checked={plcDataEnabled} onChange={onPlcDataChange} /><p className="panel-note">{plcDataEnabled ? 'Вся модель повторяет реальные состояния PLC.' : 'Обновление всех тегов OPC UA приостановлено. Доступно локальное управление всей моделью.'}</p></section>
    <section><h3>Координаты робота</h3>{(['x', 'y', 'z'] as const).map((axis) => <label className="range-field" key={axis}><span>{axis.toUpperCase()} <b>{state.robot[axis].toFixed(0)} / {travelLimits[axis].toFixed(0)} мм</b></span><input disabled={plcDataEnabled} type="range" min={0} max={travelLimits[axis]} step={10} value={state.robot[axis]} onChange={(e) => updateRobot({ [axis]: Number(e.target.value) })} /></label>)}</section>
    <section><h3>Двойной захват</h3>
      <label className={`toggle-row ${plcDataEnabled ? 'disabled' : ''}`}><span>Захват 1 закрыт (заготовка)</span><input disabled={plcDataEnabled} type="checkbox" checked={state.robot.gripper1Closed} onChange={(e) => updateRobot({ gripper1Closed: e.target.checked })} /><i /></label>
      <label className={`toggle-row ${plcDataEnabled ? 'disabled' : ''}`}><span>Захват 2 закрыт (деталь)</span><input disabled={plcDataEnabled} type="checkbox" checked={state.robot.gripper2Closed} onChange={(e) => updateRobot({ gripper2Closed: e.target.checked })} /><i /></label>
      <div className="segmented"><button disabled={plcDataEnabled} className={state.robot.rotatedToBlank ? 'active' : ''} onClick={() => updateRobot({ rotatedToBlank: true, rotatedToDetail: false })}>К заготовке</button><button disabled={plcDataEnabled} className={state.robot.rotatedToDetail ? 'active' : ''} onClick={() => updateRobot({ rotatedToBlank: false, rotatedToDetail: true })}>К детали</button></div>
    </section>
    <section><h3>Механизмы станка</h3><div className="segmented three">{state.machines.map((_, index) => <button key={index} className={machineIndex === index ? 'active' : ''} onClick={() => setMachineIndex(index)}>Станок {index + 1}</button>)}</div>
      <Toggle label="Дверь открыта" checked={state.machines[machineIndex].doorOpen} disabled={plcDataEnabled} onChange={(v) => updateMachine({ doorOpen: v, doorClosed: !v })} />
      <Toggle label="Патрон открыт" checked={state.machines[machineIndex].chuckOpen} disabled={plcDataEnabled} onChange={(v) => updateMachine({ chuckOpen: v, chuckClosed: !v })} />
      <Toggle label="Изделие в патроне" checked={state.machines[machineIndex].partPresent} disabled={plcDataEnabled} onChange={(v) => updateMachine({ partPresent: v, partState: v ? 'LOADED' : 'EMPTY', partType: v ? 'BLANK' : 'UNKNOWN' })} />
    </section>
    <section><h3>Локальная проверка магазинов Three.js</h3><div className="segmented">{state.magazines.map((_, index) => <button key={index} className={manualMagazine === index ? 'active' : ''} onClick={() => setManualMagazine(index)}>Магазин {index + 1}</button>)}</div>
      <p className="panel-note">Эти кнопки двигают только 3D-модель и не отправляют команды в PLC.</p>
      <div className="conveyor-test-status"><span><i className={conveyorTestStatuses[manualMagazine].moving ? 'moving' : ''} />{conveyorTestStatuses[manualMagazine].moving ? 'Выполняется перемещение' : 'Ожидание команды'}</span><b>Позиция: +{conveyorTestStatuses[manualMagazine].positionRows} рядов</b><b>Изделия: {conveyorTestStatuses[manualMagazine].loadedSlots}</b></div>
      <div className="conveyor-test-actions"><button disabled={conveyorTestStatuses[manualMagazine].moving} onClick={() => onConveyorTest((manualMagazine + 1) as 1 | 2, 'fill')}><PackagePlus size={17} />Заполнить Zone 1</button><button className="primary" disabled={conveyorTestStatuses[manualMagazine].moving} onClick={() => onConveyorTest((manualMagazine + 1) as 1 | 2, 'move')}><ArrowRight size={17} />Переместить 12 рядов</button><button disabled={conveyorTestStatuses[manualMagazine].moving || conveyorTestStatuses[manualMagazine].loadedSlots === 0} onClick={() => onConveyorTest((manualMagazine + 1) as 1 | 2, 'clear')}><Trash2 size={17} />Очистить</button><button onClick={() => onConveyorTest((manualMagazine + 1) as 1 | 2, 'reset')}><RotateCcw size={17} />Сбросить</button></div>
      <p className="panel-note">Zone 1 выбранного магазина. Нажатие: пусто → заготовка → деталь.</p><MagazineMatrix slots={state.magazines[manualMagazine].zones[0]} columns={10} onSlotClick={plcDataEnabled ? undefined : (index) => { const values: SlotType[] = ['empty', 'blank', 'detail']; const magazines = structuredClone(state.magazines); const slots = magazines[manualMagazine].zones[0]; slots[index] = values[(values.indexOf(slots[index]) + 1) % values.length]; setState({ ...state, magazines }); }} />
    </section>
  </aside>;
}

export function App() {
  const [layout, setLayout] = useState<CellLayout>(loadLayout);
  const [cellState, setCellState] = useState<CellState>(cloneState);
  const [page, setPage] = useState<Page>('monitoring');
  const [bottomSection, setBottomSection] = useState<BottomSection | null>(null);
  const [matrixQuickOpen, setMatrixQuickOpen] = useState(false);
  const [quickMatrixZone, setQuickMatrixZone] = useState<1 | 2>(1);
  const [profileOpen, setProfileOpen] = useState(false);
  const [topMenuOpen, setTopMenuOpen] = useState(false);
  const [topMenuSection, setTopMenuSection] = useState<TopMenuSection>('root');
  const [selectedMachine, setSelectedMachine] = useState<number | null>(null);
  const [selectedMagazine, setSelectedMagazine] = useState(0);
  const [magazineHomeConfirmation, setMagazineHomeConfirmation] = useState<number | null>(null);
  const [magazinePowerSequences, setMagazinePowerSequences] = useState<[MagazinePowerStage | null, MagazinePowerStage | null]>([null, null]);
  const [confirmationMachine, setConfirmationMachine] = useState<number | null>(null);
  const [confirmationEntered, setConfirmationEntered] = useState(false);
  const [manualMachine, setManualMachine] = useState(1);
  const [running] = useState(false);
  const [globalError] = useState(false);
  const [plcConnection, setPlcConnection] = useState<PlcConnectionInfo>(INITIAL_CONNECTION);
  const [plcRuntime, setPlcRuntime] = useState<PlcRuntimeInfo>(INITIAL_RUNTIME);
  const [faultSimulationValues, setFaultSimulationValues] = useState<Record<string, unknown>>({});
  const [cyclogramHistory, setCyclogramHistory] = useState<CyclogramHistory>(INITIAL_CYCLOGRAM);
  const [latestCellLogEvent, setLatestCellLogEvent] = useState<CellLogEvent | null>(null);
  const [commandError, setCommandError] = useState('');
  const [plcDataEnabled, setPlcDataEnabled] = useState(true);
  const [latestEventVisible, setLatestEventVisible] = useState(false);
  const [equipmentStatusVisible, setEquipmentStatusVisible] = useState(true);
  const [indexedConveyorTest, setIndexedConveyorTest] = useState<IndexedConveyorTestCommand>({ id: 0, type: 'none', magazineId: 1 });
  const emptyConveyorTestStatus: IndexedConveyorTestStatus = {
    moving: false,
    positionRows: 0,
    loadedSlots: 0,
    homed: true,
  };
  const [indexedConveyorTestStatuses, setIndexedConveyorTestStatuses] = useState<[IndexedConveyorTestStatus, IndexedConveyorTestStatus]>([
    emptyConveyorTestStatus,
    { ...emptyConveyorTestStatus },
  ]);
  const workspacePointerRef = useRef<{ pointerId: number; x: number; y: number; eligible: boolean } | null>(null);
  const plcDataEnabledRef = useRef(true);
  const cellStateRef = useRef(cellState);
  const plcRuntimeRef = useRef(plcRuntime);
  const robotCoordinatesRef = useRef<RobotCoordinateFrame>({
    sequence: 0,
    timestampMs: Date.now(),
    sourceTimestampMs: Date.now(),
    coordinates: { x: cellState.robot.x, y: cellState.robot.y, z: cellState.robot.z },
  });
  const plcClient = useRef<ReturnType<typeof createPlcClient> | null>(null);
  const lastReceivedEventIdentityRef = useRef('');
  const isPlcOnline = plcConnection.status === 'connected' || plcConnection.status === 'degraded';
  const usePlcData = isPlcOnline && plcDataEnabled;
  const simulationAccelerationEnabled = readBool(faultSimulationValues, 'xSimulationAccelerationEnable');
  const simulationAccelerationActive = readBool(faultSimulationValues, 'xSimulationAccelerationActive');
  const simulationAccelerationAllowed = readBool(faultSimulationValues, 'xSimulationAccelerationChangeAllowed');
  const simulationAccelerationError = readBool(faultSimulationValues, 'xSimulationAccelerationError');
  const simulationTimeFactorPath = simulationAccelerationActive
    ? 'uiSimulationTimeFactorApplied'
    : 'uiSimulationTimeFactor';
  const simulationTimeFactor = Math.max(1, Math.min(100, Math.round(readNumber(
    faultSimulationValues,
    simulationTimeFactorPath,
    readNumber(faultSimulationValues, simulationAccelerationActive ? 'uiSimulationTimeFactor' : 'uiSimulationTimeFactorApplied', 1),
  ))));
  const simulationControlsAllowed = usePlcData
    && simulationAccelerationAllowed
    && !plcRuntime.cellRunning
    && !plcRuntime.modbusMode;
  const updateMachine = (index: number, patch: Partial<CellState['machines'][number]>) => {
    setCellState((current) => {
      const machines = [...current.machines];
      machines[index] = { ...machines[index], ...patch };
      return { ...current, machines };
    });
  };
  const updateMagazineState = (index: number, patch: Partial<CellState['magazines'][number]['state']>) => setCellState((current) => {
    const magazines = structuredClone(current.magazines);
    magazines[index].state = { ...magazines[index].state, ...patch };
    return { ...current, magazines };
  });
  const sendMagazineCommand = (index: number, action: string) => {
    if (usePlcData) plcClient.current?.send({ command: `magazine.${action}`, magazine: index + 1 });
  };
  const setMagazinePowerStage = (index: number, stage: MagazinePowerStage | null) => {
    setMagazinePowerSequences((current) => current.map((value, itemIndex) => itemIndex === index ? stage : value) as [MagazinePowerStage | null, MagazinePowerStage | null]);
  };
  const beginMagazineEnable = (index: number, confirmedHome = false) => {
    const state = cellState.magazines[index].state;
    if (usePlcData && !state.enableSequenceAllowed) {
      setMagazineHomeConfirmation(null);
      sendMagazineCommand(index, 'enable');
      return;
    }
    if (!state.homed && !confirmedHome) {
      setMagazineHomeConfirmation(index);
      return;
    }
    if (!usePlcData) {
      updateMagazineState(index, { powered: true, homed: true, enabled: true, ready: true, axisStep: 'Готов к работе' });
      setMagazineHomeConfirmation(null);
      return;
    }
    setMagazineHomeConfirmation(null);
    if (!state.powered) {
      sendMagazineCommand(index, 'powerOn');
      setMagazinePowerStage(index, state.homed ? 'wait-power-enable' : 'wait-power-home');
    } else if (!state.homed) {
      sendMagazineCommand(index, 'home');
      setMagazinePowerStage(index, 'wait-home');
    } else {
      sendMagazineCommand(index, 'enable');
    }
  };
  const toggleMagazineEnabled = (index = selectedMagazine) => {
    const state = cellState.magazines[index].state;
    if (!state.enabled) {
      beginMagazineEnable(index);
      return;
    }
    if (!usePlcData) {
      updateMagazineState(index, { enabled: false, powered: false, ready: false, disablePending: false });
      return;
    }
    sendMagazineCommand(index, 'disable');
    if (state.busy) setMagazinePowerStage(index, 'wait-disable');
    else sendMagazineCommand(index, 'powerOff');
  };
  const fillMagazine = (index = selectedMagazine) => {
    const state = cellState.magazines[index].state;
    if (usePlcData) {
      sendMagazineCommand(index, 'fillZone1');
      return;
    }
    if (!state.zone1EditAllowed) return;
    setCellState((current) => {
      const magazines = structuredClone(current.magazines);
      magazines[index].zones[0] = magazines[index].zones[0].map(() => 'blank');
      return { ...current, magazines };
    });
  };
  const clearMagazine = (index = selectedMagazine) => {
    if (usePlcData) {
      sendMagazineCommand(index, 'clearZone1');
      return;
    }
    if (!cellState.magazines[index].state.zone1EditAllowed) return;
    setCellState((current) => {
      const magazines = structuredClone(current.magazines);
      magazines[index].zones[0] = magazines[index].zones[0].map(() => 'empty');
      return { ...current, magazines };
    });
  };
  const cycleMagazineSlot = (slotIndex: number, index = selectedMagazine) => {
    const magazine = cellState.magazines[index];
    const current = magazine.zones[0][slotIndex];
    const next: SlotType = current === 'empty' ? 'blank' : current === 'blank' ? 'detail' : 'empty';
    const productType = magazine.zoneProductTypes[0][slotIndex] ?? 1;
    if (usePlcData) {
      plcClient.current?.send({ command: 'magazine.setZone1Slot', magazine: index + 1, slot: slotIndex + 1, content: next === 'empty' ? 0 : next === 'blank' ? 1 : 2, productType });
      return;
    }
    if (!magazine.state.zone1EditAllowed) return;
    setCellState((current) => {
      const magazines = structuredClone(current.magazines);
      const slots = magazines[index].zones[0];
      slots[slotIndex] = next;
      return { ...current, magazines };
    });
  };
  const applyMagazineSlot = (slotIndex: number, content: SlotType, productType: ProductType, index = selectedMagazine) => {
    if (usePlcData) {
      plcClient.current?.send({ command: 'magazine.setZone1Slot', magazine: index + 1, slot: slotIndex + 1, content: content === 'empty' ? 0 : content === 'blank' ? 1 : 2, productType });
      return;
    }
    if (!cellState.magazines[index].state.zone1EditAllowed) return;
    setCellState((current) => {
      const magazines = structuredClone(current.magazines);
      magazines[index].zones[0][slotIndex] = content;
      magazines[index].zoneProductTypes[0][slotIndex] = productType;
      return { ...current, magazines };
    });
  };
  const changeMachineProductType = (index: number, productType: ProductType) => {
    if (usePlcData) {
      plcClient.current?.send({ command: 'multi.machineType', machine: index + 1, value: productType });
      return;
    }
    updateMachine(index, { productType });
  };
  const updateMagazineSetting = (command: string, key: keyof CellState['magazines'][number]['state'], value: number) => {
    if (!Number.isFinite(value)) return;
    updateMagazineState(selectedMagazine, { [key]: value });
    if (usePlcData) plcClient.current?.send({ command, magazine: selectedMagazine + 1, value });
  };
  const toggleMachineEnabled = (index: number) => {
    const machine = cellState.machines[index];
    if (usePlcData) {
      if (machine.disablePending) {
        plcClient.current?.send({ command: 'machine.enable', machine: index + 1 });
      } else if (machine.enabled) {
        plcClient.current?.send({ command: 'machine.disable', machine: index + 1 });
      } else {
        plcClient.current?.send({ command: 'machine.enable', machine: index + 1 });
      }
      return;
    }
    if (machine.disablePending) {
      updateMachine(index, { disablePending: false, currentStep: machine.mode === 'processing' ? 'Обработка' : 'Станок готов' });
    } else if (machine.enabled) {
      updateMachine(index, { enabled: false, disablePending: false, mode: 'off', canAcceptService: false, currentStep: 'Станок выключен' });
    } else {
      updateMachine(index, { plcState: 1, enabled: true, disablePending: false, mode: 'enabled', canAcceptService: false, currentStep: 'Укажите тип детали в патроне' });
      setBottomSection(null);
      setConfirmationMachine(index);
      setConfirmationEntered(true);
    }
  };
  const sendMachineConfirmation = (command: string) => {
    if (confirmationMachine === null) return;
    if (usePlcData) {
      plcClient.current?.send({ command, machine: confirmationMachine + 1 });
      return;
    }
    if (command === 'machine.setBlank') updateMachine(confirmationMachine, { plcState: 3, currentStep: 'Ожидается подтверждение закрытия двери' });
    if (command === 'machine.setDetail') updateMachine(confirmationMachine, { plcState: 4, currentStep: 'Станок готов', canAcceptService: true });
    if (command === 'machine.acceptDoor') updateMachine(confirmationMachine, { plcState: 2, doorOpen: false, doorClosed: true, currentStep: 'Ожидается подтверждение запуска обработки' });
    if (command === 'machine.rejectDoor' || command === 'machine.rejectRun') updateMachine(confirmationMachine, { plcState: 0, enabled: false, mode: 'off', currentStep: 'Станок выключен' });
    if (command === 'machine.acceptRun') updateMachine(confirmationMachine, { plcState: 4, mode: 'processing', currentStep: 'Обработка' });
  };
  const cancelMachineConfirmation = () => {
    if (confirmationMachine !== null) {
      if (usePlcData) plcClient.current?.send({ command: 'machine.disable', machine: confirmationMachine + 1 });
      else updateMachine(confirmationMachine, { plcState: 0, enabled: false, mode: 'off', currentStep: 'Станок выключен' });
    }
    setConfirmationMachine(null);
    setConfirmationEntered(false);
  };
  const sendCellStartChoice = (choice: number) => {
    if (!usePlcData || !plcRuntime.operatorChoiceAllowed) return;
    plcClient.current?.send({ command: 'cell.operatorChoice', value: choice });
  };
  const cancelCellStartConfirmation = () => {
    if (!usePlcData || !plcRuntime.operatorCancelAllowed) return;
    plcClient.current?.send({ command: 'cell.operatorCancel' });
  };
  const updateCycleSettings = (index: number, useHmiCycleTime: boolean, seconds?: number) => {
    if (usePlcData) {
      plcClient.current?.send({ command: 'machine.cycleMode', machine: index + 1, value: useHmiCycleTime });
      if (Number.isFinite(seconds)) plcClient.current?.send({ command: 'machine.cycleTime', machine: index + 1, value: seconds });
    }
    updateMachine(index, {
      useHmiCycleTime,
      ...(Number.isFinite(seconds) ? { cycleExpectedS: Math.max(1, seconds as number) } : {}),
    });
  };
  const changePlcDataSource = (enabled: boolean) => {
    plcDataEnabledRef.current = enabled;
    setPlcDataEnabled(enabled);
  };

  useEffect(() => {
    cellStateRef.current = cellState;
  }, [cellState]);

  useEffect(() => {
    plcRuntimeRef.current = plcRuntime;
  }, [plcRuntime]);

  useEffect(() => {
    if (!usePlcData) return;
    magazinePowerSequences.forEach((stage, index) => {
      if (!stage) return;
      const state = cellState.magazines[index].state;
      if (stage === 'wait-power-home' && state.powered) {
        sendMagazineCommand(index, 'home');
        setMagazinePowerStage(index, 'wait-home');
      } else if (stage === 'wait-home' && state.homed) {
        sendMagazineCommand(index, 'enable');
        setMagazinePowerStage(index, null);
      } else if (stage === 'wait-power-enable' && state.powered) {
        sendMagazineCommand(index, 'enable');
        setMagazinePowerStage(index, null);
      } else if (stage === 'wait-disable' && !state.enabled && !state.busy) {
        sendMagazineCommand(index, 'powerOff');
        setMagazinePowerStage(index, null);
      } else if (state.error || state.axisError) {
        setMagazinePowerStage(index, null);
      }
    });
  }, [cellState.magazines, magazinePowerSequences, usePlcData]);

  useEffect(() => {
    if (!plcDataEnabled) {
      robotCoordinatesRef.current = {
        sequence: robotCoordinatesRef.current.sequence + 1,
        timestampMs: Date.now(),
        sourceTimestampMs: Date.now(),
        coordinates: { x: cellState.robot.x, y: cellState.robot.y, z: cellState.robot.z },
      };
    }
  }, [cellState.robot.x, cellState.robot.y, cellState.robot.z, plcDataEnabled]);

  useEffect(() => {
    let pendingSnapshot: Record<string, unknown> | null = null;
    let snapshotTimer = 0;
    const applyPendingSnapshot = () => {
      snapshotTimer = 0;
      const values = pendingSnapshot;
      pendingSnapshot = null;
      if (!values || !plcDataEnabledRef.current) return;
      const currentCellState = cellStateRef.current;
      const mappedCellState = mapPlcSnapshot(values, currentCellState);
      const nextCellState = {
        ...mappedCellState,
        robot: {
          ...mappedCellState.robot,
          x: currentCellState.robot.x,
          y: currentCellState.robot.y,
          z: currentCellState.robot.z,
        },
      };
      if (!sameData(currentCellState, nextCellState)) {
        cellStateRef.current = nextCellState;
        setCellState(nextCellState);
      }

      const currentRuntime = plcRuntimeRef.current;
      const nextRuntime = mapRuntimeInfo(values, currentRuntime);
      if (!sameData(currentRuntime, nextRuntime)) {
        plcRuntimeRef.current = nextRuntime;
        setPlcRuntime(nextRuntime);
      }
    };

    plcClient.current = createPlcClient({
      onConnection: setPlcConnection,
      onRobotFrame: (frame) => {
        if (plcDataEnabledRef.current) robotCoordinatesRef.current = frame;
      },
      onSnapshot: (values, changed, full) => {
        const nextFaultValues = pickFaultSimulationValues(values);
        setFaultSimulationValues((current) => sameData(current, nextFaultValues) ? current : nextFaultValues);
        if (!plcDataEnabledRef.current) return;
        pendingSnapshot = values;
        const requiresFastFeedback = full
          || Object.keys(changed).some((path) => FAST_PLC_UI_SYMBOLS.has(path));
        if (requiresFastFeedback) {
          window.clearTimeout(snapshotTimer);
          applyPendingSnapshot();
        } else if (!snapshotTimer) {
          snapshotTimer = window.setTimeout(applyPendingSnapshot, PLC_UI_REFRESH_MS);
        }
      },
      onCyclogramHistory: setCyclogramHistory,
      onCyclogramUpdate: (update) => {
        setCyclogramHistory((current) => mergeCyclogramUpdate(current, update));
      },
      onCellLogEvent: setLatestCellLogEvent,
      onCommandError: setCommandError,
    });
    return () => {
      window.clearTimeout(snapshotTimer);
      plcClient.current?.close();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    const limits = getRobotTravelLimits(layout);
    setCellState((current) => {
      const robot = {
        ...current.robot,
        x: Math.min(current.robot.x, limits.x),
        y: Math.min(current.robot.y, limits.y),
        z: Math.min(current.robot.z, limits.z),
      };
      return robot.x === current.robot.x && robot.y === current.robot.y && robot.z === current.robot.z ? current : { ...current, robot };
    });
  }, [layout]);

  useEffect(() => {
    if (page !== 'monitoring' || bottomSection !== 'magazine') setMatrixQuickOpen(false);
  }, [bottomSection, page]);

  useEffect(() => {
    if (!matrixQuickOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMatrixQuickOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [matrixQuickOpen]);

  useEffect(() => {
    if (!usePlcData || confirmationMachine !== null || plcRuntime.operatorPromptActive) return;
    const machineIndex = cellState.machines.findIndex((machine) => MACHINE_CONFIRMATION_PROMPT_STATES.has(machine.plcState));
    if (machineIndex < 0) return;
    setBottomSection(null);
    setConfirmationMachine(machineIndex);
    setConfirmationEntered(false);
  }, [cellState.machines, confirmationMachine, plcRuntime.operatorPromptActive, usePlcData]);

  useEffect(() => {
    if (confirmationMachine === null) return;
    const machine = cellState.machines[confirmationMachine];
    const confirmationState = MACHINE_CONFIRMATION_WORKFLOW_STATES.has(machine.plcState);
    if (confirmationState && !confirmationEntered) setConfirmationEntered(true);
    if ((confirmationEntered && !confirmationState) || (!confirmationEntered && machine.enabled && machine.plcState === 4) || machine.plcState === 17) {
      setConfirmationMachine(null);
      setConfirmationEntered(false);
    }
  }, [cellState.machines, confirmationEntered, confirmationMachine]);

  const displayedRunning = usePlcData ? plcRuntime.cellRunning : running;
  const displayedGlobalError = usePlcData ? plcRuntime.globalError : globalError;
  const connectionLost = plcConnection.status === 'disconnected' || plcConnection.status === 'connecting';
  const systemText = connectionLost ? 'НЕТ СВЯЗИ' : plcConnection.status === 'degraded' ? 'ЧАСТИЧНЫЕ ДАННЫЕ' : displayedGlobalError ? 'ОШИБКА' : displayedRunning ? 'РАБОТАЕТ' : 'ОСТАНОВЛЕНА';
  const closeMachinePanel = () => {
    if (page === 'machines') {
      setPage('monitoring');
      return;
    }
    if (selectedMachine !== null) setSelectedMachine(null);
  };
  const systemHeaderText = systemText.charAt(0) + systemText.slice(1).toLowerCase();
  const modeText = usePlcData ? (plcRuntime.manualMode ? 'Ручной' : 'Автомат') : 'Ручной';
  const displayedReadyMachines = usePlcData ? plcRuntime.readyMachines : 0;
  const displayedRobotReady = usePlcData && plcRuntime.robotReady;
  const displayedMagazineReady = usePlcData && plcRuntime.magazineReady;
  const displayedReadyToStart = usePlcData && plcRuntime.readyToStart;
  const fallbackMachineAlarmIndexes = cellState.machines
    .map((machine, index) => machine.mode === 'error' || machine.activeErrors.length > 0 ? index + 1 : 0)
    .filter(Boolean);
  const plcAlarmEvents = usePlcData ? plcRuntime.alarmEvents : [];
  const activeAlarmEvents = plcAlarmEvents.filter((event) => event.active);
  const activeAlarms = usePlcData ? plcRuntime.activeAlarmCount : fallbackMachineAlarmIndexes.length
    + cellState.magazines.filter((magazine) => magazine.state.error || magazine.state.axisError || magazine.state.activeErrors.length > 0).length
    + (displayedGlobalError && fallbackMachineAlarmIndexes.length === 0 && !cellState.magazines.some((magazine) => magazine.state.error) ? 1 : 0);
  const activeWarnings = usePlcData ? plcRuntime.activeWarningCount : 0;
  const alarmCount = activeAlarms + activeWarnings;
  const alarmTone = activeAlarms > 0 ? 'active' : activeWarnings > 0 ? 'warning' : '';
  const alarmSource = activeAlarmEvents.length
    ? ALARM_SOURCE_LABELS[activeAlarmEvents[0].source]
    : 'Нет активных';
  const latestActiveEvent = selectLatestActiveEvent(plcAlarmEvents);
  const newestReceivedEventIdentity = alarmEventIdentity(selectNewestReceivedEvent(plcAlarmEvents));
  const activeEventCount = Math.max(alarmCount, activeAlarmEvents.length);
  const latestEventRecommendation = latestActiveEvent
    ? latestActiveEvent.severity === 'alarm'
      ? 'Проверьте механизм и журнал аварий перед сбросом'
      : 'Устраните указанное условие перед повторной командой'
    : undefined;

  useEffect(() => {
    if (!latestActiveEvent) {
      setLatestEventVisible(false);
      return;
    }
    if (newestReceivedEventIdentity
    && newestReceivedEventIdentity !== lastReceivedEventIdentityRef.current) {
      lastReceivedEventIdentityRef.current = newestReceivedEventIdentity;
      setLatestEventVisible(true);
    }
  }, [latestActiveEvent?.id, newestReceivedEventIdentity]);

  const toggleCellCycle = () => {
    if (!usePlcData) {
      setCommandError('Управление ячейкой недоступно без связи с PLC');
      return;
    }
    plcClient.current?.send({ command: plcRuntime.cellStopPending ? 'cell.start' : displayedRunning ? 'cell.stop' : 'cell.start' });
  };
  const resetCell = () => {
    if (!usePlcData) {
      setCommandError('Сброс недоступен без связи с PLC');
      return;
    }
    plcClient.current?.send({ command: 'cell.reset' });
  };
  const changeCellMode = (manual: boolean) => {
    if (!usePlcData) {
      setCommandError('Переключение режима недоступно без связи с PLC');
      return;
    }
    plcClient.current?.send({ command: 'cell.manual', value: manual });
    if (manual) {
      plcClient.current?.send({ command: 'robot.speedOverride', value: MANUAL_MODE_SPEED_PERCENT });
    }
  };
  const sendRobotCommand = (command: string, value?: boolean | number) => {
    if (!usePlcData) {
      setCommandError('Управление роботом недоступно без связи с PLC');
      return;
    }
    plcClient.current?.send({ command, value });
  };
  const changeSimulationAcceleration = (enabled: boolean) => {
    if (!simulationControlsAllowed) return;
    plcClient.current?.send({ command: 'simulation.accelerationEnable', value: enabled });
  };
  const changeCellSetting = (command: string, value: number) => {
    if (!usePlcData || !plcRuntime.cellSettings.changeAllowed || !Number.isFinite(value)) return;
    plcClient.current?.send({ command, value });
  };
  const changeRobotControlMode = (modbus: boolean) => {
    if (!usePlcData || !plcRuntime.robotModbus.modeChangeAllowed) return;
    plcClient.current?.send({ command: 'robot.controlMode.set', value: modbus ? 1 : 0 });
  };
  const changeModbusSetting = (command: string, value: number) => {
    if (!usePlcData || !plcRuntime.robotModbus.settingsChangeAllowed || !Number.isFinite(value)) return;
    plcClient.current?.send({ command, value });
  };
  const applyModbusSettings = () => {
    if (!usePlcData || !plcRuntime.robotModbus.settingsChangeAllowed) return;
    plcClient.current?.send({ command: 'robot.modbus.apply' });
  };
  const changeSimulationTimeFactor = (value: number) => {
    if (!simulationControlsAllowed || !simulationAccelerationEnabled) return;
    const normalized = Math.max(1, Math.min(100, Math.round(value)));
    plcClient.current?.send({ command: 'simulation.accelerationFactor', value: normalized });
  };
  const selectBottomSection = (section: BottomSection) => {
    setMatrixQuickOpen(false);
    setBottomSection(section);
    setPage('monitoring');
    if (section === 'machines') {
      const runtimeIndex = plcRuntime.selectedMachine - 1;
      const processingIndex = cellState.machines.findIndex((machine) => machine.mode === 'processing');
      const preferredIndex = runtimeIndex >= 0 && runtimeIndex < cellState.machines.length
        ? runtimeIndex
        : processingIndex >= 0 ? processingIndex : 0;
      const nextIndex = selectedMachine ?? preferredIndex;
      setSelectedMachine(nextIndex);
      setManualMachine(nextIndex);
    } else {
      setSelectedMachine(null);
    }
  };
  const exportCyclogram = (scope: 'all' | 'visible', fromMs?: number, toMs?: number) => {
    const url = plcClient.current?.cyclogramExportUrl(scope, fromMs, toMs);
    if (!url) {
      setCommandError('Экспорт циклограммы недоступен: нет связи со шлюзом');
      return;
    }
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.append(link);
    link.click();
    link.remove();
  };
  const clearCyclogram = () => {
    if (!plcClient.current?.clearCyclogram()) {
      setCommandError('Очистка циклограммы недоступна: нет связи со шлюзом');
      return false;
    }
    setCyclogramHistory((current) => ({ ...current, serverTime: Date.now(), intervals: [] }));
    return true;
  };
  const toggleTopMenu = () => {
    setProfileOpen(false);
    setTopMenuSection('root');
    setTopMenuOpen((value) => !value);
  };
  const closeTopMenu = () => {
    setTopMenuOpen(false);
    setTopMenuSection('root');
  };

  return <div className="app-shell tesla-shell no-sidebar">
    <header className="topbar tesla-topbar">
      <div className="page-title"><img src={portalRobotLogo} alt="Portal Robot" /></div>
      <div className={`system-summary ${displayedGlobalError || connectionLost ? 'alarm' : ''}`} title={plcConnection.message}><Indicator active={!connectionLost && !displayedGlobalError} tone={displayedGlobalError || connectionLost ? 'red' : 'green'} /><span>СИСТЕМА</span><b>{systemHeaderText}</b></div>
      <div className="mode-summary"><Indicator active tone="blue" /><span>РЕЖИМ</span><b>{modeText}</b></div>
      <div className="profile-area">
        <button className="profile-button" type="button" aria-expanded={profileOpen} onClick={() => { setTopMenuOpen(false); setProfileOpen((value) => !value); }}><UserRound size={21} /><span><b>Оператор</b></span><ChevronDown size={17} /></button>
        {profileOpen && <div className="profile-popover"><span>АВТОРИЗОВАН</span><strong>Оператор</strong><p>Доступ: управление ячейкой</p></div>}
      </div>
      <button className="top-menu-button" type="button" aria-expanded={topMenuOpen} aria-haspopup="menu" onClick={toggleTopMenu} title="Операционное меню"><Menu /></button>
    </header>
    {simulationAccelerationEnabled && <section className={`simulation-speed-control ${simulationAccelerationActive ? 'active' : ''} ${simulationAccelerationError ? 'error' : ''}`} aria-label="Ускорение симуляции">
      <div className="simulation-speed-control-head">
        <div><span>СИМУЛЯЦИЯ</span><strong>Коэффициент времени</strong></div>
        <b>×{simulationTimeFactor}</b>
      </div>
      <input
        type="range"
        min="1"
        max="100"
        step="1"
        value={simulationTimeFactor}
        disabled={!simulationControlsAllowed || !simulationAccelerationEnabled}
        onChange={(event) => changeSimulationTimeFactor(Number(event.currentTarget.value))}
        aria-label="Коэффициент ускорения симуляции"
      />
      <small>{!isPlcOnline ? 'Нет связи с PLC' : plcRuntime.cellRunning ? 'Заблокировано во время цикла' : simulationAccelerationError ? 'Ошибка применения ускорения' : 'Изменение доступно в остановленном состоянии'}</small>
    </section>}
    <AnimatedPresence open={latestEventVisible && latestActiveEvent !== null}>
      {latestActiveEvent && <LatestEventNotification
        event={latestActiveEvent}
        mechanism={ALARM_SOURCE_LABELS[latestActiveEvent.source]}
        activeCount={activeEventCount}
        recommendation={latestEventRecommendation}
        onCollapse={() => setLatestEventVisible(false)}
      />}
    </AnimatedPresence>
    <AnimatedPresence open={topMenuOpen}>
      <aside className="top-menu-drawer" aria-label={topMenuSection === 'settings' ? 'Разделы настроек' : topMenuSection === 'manual' ? 'Разделы ручного управления' : 'Операционное меню'}>
        {topMenuSection === 'settings' ? <>
          <button className="top-menu-drawer-back" type="button" onClick={() => setTopMenuSection('root')}>
            <ChevronLeft aria-hidden="true" />
            <span>Настройки</span>
          </button>
          <button type="button" onClick={() => { closeTopMenu(); setPage('settings'); }}>
            <Icon icon={displaySettingsOutlineIcon} aria-hidden="true" />
            <span>Настройки визуализации</span>
          </button>
          <button type="button" onClick={() => { closeTopMenu(); setPage('cell-settings'); }}>
            <Boxes aria-hidden="true" />
            <span>Настройки ячейки</span>
          </button>
          <button type="button" onClick={() => { closeTopMenu(); setPage('injection-settings'); }}>
            <ShieldAlert aria-hidden="true" />
            <span>Настройки инъекции</span>
          </button>
          <button type="button" onClick={() => { closeTopMenu(); setPage('simulation-settings'); }}>
            <Clock3 aria-hidden="true" />
            <span>Настройки симуляции</span>
          </button>
        </> : topMenuSection === 'manual' ? <>
          <button className="top-menu-drawer-back" type="button" onClick={() => setTopMenuSection('root')}>
            <ChevronLeft aria-hidden="true" />
            <span>Ручное управление</span>
          </button>
          <button type="button" onClick={() => { closeTopMenu(); setPage('manual'); }}>
            <Icon icon={touchAppOutlineIcon} aria-hidden="true" />
            <span>Управление моделью</span>
          </button>
          <button type="button" onClick={() => { closeTopMenu(); setPage('injections'); }}>
            <ShieldAlert aria-hidden="true" />
            <span>Инъекции</span>
          </button>
        </> : <>
          <button type="button" onClick={() => setTopMenuSection('settings')}>
            <Icon icon={settingsOutlineIcon} aria-hidden="true" />
            <span>Настройки</span>
          </button>
          <button type="button" onClick={() => setTopMenuSection('manual')}>
            <Icon icon={touchAppOutlineIcon} aria-hidden="true" />
            <span>Ручное управление</span>
          </button>
          <button type="button" onClick={() => { closeTopMenu(); setPage('events'); }}>
            <Activity aria-hidden="true" />
            <span>Журнал событий</span>
          </button>
          <button type="button" onClick={() => { closeTopMenu(); setPage('tests'); }}>
            <FlaskConical aria-hidden="true" />
            <span>Сценарии и тесты</span>
          </button>
        </>}
      </aside>
    </AnimatedPresence>
    <main className={`workspace${page === 'monitoring' && bottomSection === 'cyclogram' ? ' cyclogram-open' : ''}`} onPointerDown={(event) => {
      const target = event.target as HTMLElement;
      workspacePointerRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        eligible: !target.closest(WORKSPACE_INTERACTIVE_SELECTOR)
          && !target.closest(WORKSPACE_OPEN_PANEL_SELECTOR),
      };
    }} onPointerUp={(event) => {
      const pointer = workspacePointerRef.current;
      workspacePointerRef.current = null;
      if (!pointer || pointer.pointerId !== event.pointerId || !pointer.eligible) return;
      const distance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
      if (distance > WORKSPACE_CLICK_MOVE_TOLERANCE_PX) return;
      const target = event.target as HTMLElement;
      if (target.closest(WORKSPACE_INTERACTIVE_SELECTOR)) return;
      if (target.closest(WORKSPACE_OPEN_PANEL_SELECTOR)) return;
      setMatrixQuickOpen(false);
      setBottomSection(null);
      if (page !== 'monitoring') setPage('monitoring');
      closeMachinePanel();
      setProfileOpen(false);
      closeTopMenu();
    }} onPointerCancel={() => {
      workspacePointerRef.current = null;
    }}>
      <CellViewport
        layout={layout}
        state={cellState}
        robotCoordinatesRef={robotCoordinatesRef}
        selectedMachine={selectedMachine}
        cameraPreset="front"
        onMachineSelect={() => {}}
        onMagazineSelect={(magazineId) => { setSelectedMagazine(magazineId - 1); selectBottomSection('magazine'); }}
        indexedConveyorTest={indexedConveyorTest}
        onIndexedConveyorTestStatus={(magazineId, status) => setIndexedConveyorTestStatuses((current) => current.map((item, index) => index === magazineId - 1 ? status : item) as [IndexedConveyorTestStatus, IndexedConveyorTestStatus])}
        syncMagazineInventory={usePlcData}
      />
      <AnimatedPresence open={magazineHomeConfirmation !== null}>{magazineHomeConfirmation !== null && <MagazineHomeConfirmation magazineNumber={magazineHomeConfirmation + 1} onConfirm={() => beginMagazineEnable(magazineHomeConfirmation, true)} onCancel={() => setMagazineHomeConfirmation(null)} />}</AnimatedPresence>
      <AnimatedPresence open={page === 'monitoring' && bottomSection === 'cyclogram'}>
        <EquipmentLoadPanel values={plcRuntime.equipmentLoad} />
      </AnimatedPresence>
      <AnimatedPresence open={page === 'monitoring' && bottomSection === 'magazine' && matrixQuickOpen}>
        <MagazineMatrixCard
          id={QUICK_MAGAZINE_MATRIX_ID}
          slots={cellState.magazines[selectedMagazine].zones[quickMatrixZone - 1]}
          columns={cellState.magazines[selectedMagazine].state.columns}
          rows={cellState.magazines[selectedMagazine].state.rows}
          productTypes={cellState.magazines[selectedMagazine].zoneProductTypes[quickMatrixZone - 1]}
          magazineNumber={selectedMagazine + 1}
          zone={quickMatrixZone}
          onZoneChange={setQuickMatrixZone}
          onSlotClick={quickMatrixZone === 1 && cellState.magazines[selectedMagazine].state.zone1EditAllowed ? (index) => cycleMagazineSlot(index, selectedMagazine) : undefined}
        />
      </AnimatedPresence>
      {commandError && <div className="command-error" role="alert"><AlertCircle size={18} /><span>{commandError}</span><button onClick={() => setCommandError('')} type="button">×</button></div>}
      {page === 'monitoring' && bottomSection === null && confirmationMachine === null && !plcRuntime.operatorPromptActive && <button className={`alarm-summary ${alarmTone}`} type="button" onClick={() => setPage('alarms')}>
        <TriangleAlert />
        <span>Аварии</span>
        <b>{alarmCount}</b>
        <i />
        <strong>{alarmSource}</strong>
        <ChevronDown />
      </button>}
      <AnimatedPresence open={page === 'settings'}><SettingsPanel
        layout={layout}
        setLayout={setLayout}
        onClose={() => setPage('monitoring')}
      /></AnimatedPresence>
      <AnimatedPresence open={page === 'cell-settings'}><CellSettingsPanel online={usePlcData} modbusMode={plcRuntime.modbusMode} modbus={plcRuntime.robotModbus} testEnvironment={plcRuntime.testEnvironment} configurationValid={plcRuntime.multiTypeConfigurationValid} typeCount={plcRuntime.multiTypeCount} typeCountAllowed={plcRuntime.multiTypeCountAllowed} magazineConfigAllowed={plcRuntime.multiTypeMagazineConfigAllowed} settings={plcRuntime.cellSettings} accelerationEnabled={simulationAccelerationEnabled} accelerationActive={simulationAccelerationActive} accelerationAllowed={simulationControlsAllowed} onModeChange={changeRobotControlMode} onTestEnvironmentChange={(value) => { plcClient.current?.send({ command: 'test.environment.set', value }); }} onTypeCountChange={(value) => plcClient.current?.send({ command: 'multi.typeCount', value })} onAutoDistribute={() => plcClient.current?.send({ command: 'multi.autoDistribute' })} onModbusSettingChange={changeModbusSetting} onModbusApply={applyModbusSettings} onSettingChange={changeCellSetting} onAccelerationChange={changeSimulationAcceleration} onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={page === 'manual'}><ManualPanel state={cellState} layout={layout} setState={setCellState} machineIndex={manualMachine} setMachineIndex={setManualMachine} conveyorTestStatuses={indexedConveyorTestStatuses} onConveyorTest={(magazineId, type) => setIndexedConveyorTest((current) => ({ id: current.id + 1, type, magazineId }))} onClose={() => setPage('monitoring')} plcDataEnabled={plcDataEnabled} onPlcDataChange={changePlcDataSource} /></AnimatedPresence>
      <AnimatedPresence open={page === 'injections'}><FaultInjectionPanel values={faultSimulationValues} online={isPlcOnline} send={(command) => { plcClient.current?.send(command); }} onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={page === 'injection-settings'}><InjectionSettingsPanel values={faultSimulationValues} online={isPlcOnline} send={(command) => { plcClient.current?.send(command); }} onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={page === 'simulation-settings'}><SimulationSettingsPanel values={faultSimulationValues} online={isPlcOnline} send={(command) => { plcClient.current?.send(command); }} onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={page === 'robot'}><RobotExtendedPanel robot={cellState.robot} magazines={cellState.magazines} runtime={plcRuntime} online={usePlcData} onSend={(command) => { plcClient.current?.send(command); }} onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={page === 'machines' && selectedMachine !== null}>{selectedMachine !== null && <MachinePanel index={selectedMachine} state={cellState.machines[selectedMachine]} multiTypeCount={plcRuntime.multiTypeCount} productTypeChangeAllowed={!usePlcData || plcRuntime.multiTypeMachineAllowed[selectedMachine]} onClose={closeMachinePanel} onToggleEnabled={() => toggleMachineEnabled(selectedMachine)} onCycleSettings={(useHmi, seconds) => updateCycleSettings(selectedMachine, useHmi, seconds)} onProductType={(type) => changeMachineProductType(selectedMachine, type)} />}</AnimatedPresence>
      <AnimatedPresence open={page === 'magazine'}><MagazineScreen magazine={cellState.magazines[selectedMagazine]} magazineNumber={(selectedMagazine + 1) as 1 | 2} step={usePlcData ? plcRuntime.magazineSteps[selectedMagazine] : 'Локальная модель'} typeCount={plcRuntime.multiTypeCount} onClose={() => setPage('monitoring')} onToggleEnabled={() => toggleMagazineEnabled(selectedMagazine)} onCommand={(action) => sendMagazineCommand(selectedMagazine, action)} onFill={() => fillMagazine(selectedMagazine)} onClear={() => clearMagazine(selectedMagazine)} onSlotApply={(index, content, productType) => applyMagazineSlot(index, content, productType, selectedMagazine)} onSetting={updateMagazineSetting} /></AnimatedPresence>
      <AnimatedPresence open={page === 'alarms'}><AlarmScreen events={plcAlarmEvents} online={isPlcOnline} resetAllowed={usePlcData && plcRuntime.cellResetAllowed} onResetWarnings={() => plcClient.current?.send({ command: 'alarms.resetWarnings' })} onResetAlarms={resetCell} onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={page === 'events'}><CellEventLog liveEvent={latestCellLogEvent} online={isPlcOnline} onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={page === 'tests'}><TestWorkbench onSend={(command) => { plcClient.current?.send(command); }} onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={confirmationMachine !== null && !plcRuntime.operatorPromptActive}>{confirmationMachine !== null && !plcRuntime.operatorPromptActive && <OperatorConfirmation index={confirmationMachine} machine={cellState.machines[confirmationMachine]} layout={layout} state={cellState} robotCoordinatesRef={robotCoordinatesRef} onCommand={sendMachineConfirmation} onCancel={cancelMachineConfirmation} />}</AnimatedPresence>
      <AnimatedPresence open={plcRuntime.operatorPromptActive}><CellStartConfirmation runtime={plcRuntime} layout={layout} state={cellState} robotCoordinatesRef={robotCoordinatesRef} onChoice={sendCellStartChoice} onCancel={cancelCellStartConfirmation} /></AnimatedPresence>
      {page === 'monitoring' && confirmationMachine === null && !plcRuntime.operatorPromptActive && <div className="cell-bottom-shell">
        <AnimatedPresence open={bottomSection === 'cell'}><CellQuickPanel
          running={displayedRunning}
          stopPending={usePlcData && plcRuntime.cellStopPending}
          online={usePlcData}
          globalError={displayedGlobalError}
          readyToStart={displayedReadyToStart}
          startAllowed={usePlcData && plcRuntime.cellStartAllowed}
          stopAllowed={usePlcData && plcRuntime.cellStopAllowed}
          manualAllowed={usePlcData && plcRuntime.manualModeAllowed}
          automaticAllowed={usePlcData && plcRuntime.automaticModeAllowed}
          robotReady={displayedRobotReady}
          magazineReady={displayedMagazineReady}
          safetyHomeRequired={usePlcData && plcRuntime.safetyHomeRequired}
          robotAtSafetyHome={usePlcData && plcRuntime.robotAtSafetyHome}
          startReadiness={plcRuntime.startReadiness}
          readyMachines={displayedReadyMachines}
          manualMode={usePlcData ? plcRuntime.manualMode : true}
          onToggle={toggleCellCycle}
          onModeChange={changeCellMode}
          onExtended={() => setPage('manual')}
          onClose={() => setBottomSection(null)}
        /></AnimatedPresence>
        <AnimatedPresence open={bottomSection === 'machines'}><MachinesQuickPanel
          machines={cellState.machines}
          selectedIndex={selectedMachine ?? 0}
          onSelect={(index) => { setSelectedMachine(index); setManualMachine(index); }}
          onToggleEnabled={() => toggleMachineEnabled(selectedMachine ?? 0)}
          onExtended={(index) => { setSelectedMachine(index); setManualMachine(index); setPage('machines'); }}
          onClose={() => setBottomSection(null)}
        /></AnimatedPresence>
        <AnimatedPresence open={bottomSection === 'robot'}><RobotQuickPanel
          robot={cellState.robot}
          robotManual={plcRuntime.robotManual}
          robotModbus={plcRuntime.robotModbus}
          modbusMode={plcRuntime.modbusMode}
          speedOverridePercent={plcRuntime.speedOverridePercent}
          step={usePlcData ? plcRuntime.robotStep : 'Локальная модель'}
          online={usePlcData}
          globalError={displayedGlobalError}
          robotReady={displayedRobotReady}
          onToggleDrives={() => sendRobotCommand(plcRuntime.robotManual.drivesOff ? 'robot.enableDrives' : 'robot.disableDrives')}
          onStop={() => sendRobotCommand('robot.stop')}
          onSpeedOverrideChange={(value) => sendRobotCommand('robot.speedOverride', value)}
          onExtended={() => setPage('robot')}
          onClose={() => setBottomSection(null)}
        /></AnimatedPresence>
        <AnimatedPresence open={bottomSection === 'magazine'}><MagazineQuickPanel
          magazines={cellState.magazines}
          selectedIndex={selectedMagazine}
          onSelect={(index) => { setSelectedMagazine(index); setMatrixQuickOpen(false); }}
          matrixOpen={matrixQuickOpen}
          onMatrixToggle={() => setMatrixQuickOpen((open) => !open)}
          onToggleEnabled={() => toggleMagazineEnabled(selectedMagazine)}
          onIndex={() => sendMagazineCommand(selectedMagazine, 'index')}
          onFill={() => fillMagazine(selectedMagazine)}
          onClear={() => clearMagazine(selectedMagazine)}
          onExtended={() => { setMatrixQuickOpen(false); setPage('magazine'); }}
          onClose={() => { setMatrixQuickOpen(false); setBottomSection(null); }}
        /></AnimatedPresence>
        <AnimatedPresence open={bottomSection === 'cyclogram'}><CyclogramPanel
          history={cyclogramHistory}
          onClose={() => setBottomSection(null)}
          onExport={exportCyclogram}
          onClear={clearCyclogram}
          dragHandle={<SheetGrip onClose={() => setBottomSection(null)} />}
        /></AnimatedPresence>
        <AnimatedPresence open={bottomSection === null}>
          <div className="bottom-overview-stage">
            <ProcessOverviewCard
              state={cellState}
              runtime={plcRuntime}
              connected={isPlcOnline}
              dataActive={usePlcData}
              equipmentVisible={equipmentStatusVisible}
              onEquipmentVisibilityChange={setEquipmentStatusVisible}
            />
            <BottomNavigation active={bottomSection} onSelect={selectBottomSection} alarmEvents={activeAlarmEvents} />
          </div>
        </AnimatedPresence>
      </div>}
    </main>
  </div>;
}
