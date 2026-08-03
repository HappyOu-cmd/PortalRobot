import conveyorBeltOutlineIcon from '@iconify-icons/material-symbols/conveyor-belt-outline';
import microwaveGenOutlineIcon from '@iconify-icons/material-symbols/microwave-gen-outline';
import robotIndustrialOutlineIcon from '@iconify-icons/mdi/robot-industrial-outline';
import viewGridOutlineIcon from '@iconify-icons/mdi/view-grid-outline';
import timelineIcon from '@iconify-icons/material-symbols/timeline';
import { Icon } from '@iconify/react';
import {
  cloneElement, isValidElement, startTransition, useEffect, useRef, useState,
  type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode,
} from 'react';
import {
  Activity, AlertCircle, ArrowRight, Bot, Box, Boxes, CheckCircle2, ChevronRight,
  ChevronDown, Clock3, Cylinder, Disc3, DoorOpen, Factory, Home,
  Eye, EyeOff, Grid2X2, LoaderCircle, LockKeyhole, Menu, Power, PackagePlus, RotateCcw, Settings,
  ShieldAlert, Trash2, TriangleAlert, UnlockKeyhole, UserRound, X,
} from 'lucide-react';
import { CellViewport } from './components/CellViewport';
import { EquipmentLoadPanel } from './components/EquipmentLoadPanel';
import { MagazineMatrix, MagazineMatrixCard } from './components/magazine/MagazineMatrix';
import { CyclogramPanel } from './components/cyclogram/CyclogramPanel';
import { RingStat } from './components/magazine/RingStat';
import { Indicator } from './components/ui/Indicator';
import portalRobotLogo from './assets/branding/portal-robot-logo.png';
import { DEFAULT_LAYOUT, DEFAULT_STATE } from './model/defaults';
import { getRobotTravelLimits } from './model/travel';
import { mergeCyclogramUpdate, type CyclogramHistory } from './model/cyclogram';
import type { CellLayout, CellState, SlotType } from './model/types';
import {
  createPlcClient, mapPlcSnapshot, mapRuntimeInfo,
  ALARM_SOURCE_LABELS,
  type PlcAlarmEvent, type PlcAlarmSource, type PlcConnectionInfo, type PlcRuntimeInfo,
} from './plc/client';

type Page = 'monitoring' | 'machines' | 'robot' | 'magazine' | 'manual' | 'events' | 'alarms' | 'settings';
type BottomSection = 'cell' | 'machines' | 'robot' | 'magazine' | 'cyclogram';
const PLC_UI_REFRESH_MS = 50;
const FAST_PLC_UI_SYMBOLS = new Set([
  'xCellManual',
  'stCellStatus.xRunning',
  'stCellStatus.xReadyToStart',
  'stCellStatus.xDrivesReady',
  'stCellStatus.xRobotReady',
  'stCellStatus.xMagazineReady',
  'stCellStatus.uiReadyMachines',
  'stCellStatus.uiSelectedMachine',
  'xGlobalError',
]);
const QUICK_MAGAZINE_MATRIX_ID = 'quick-magazine-matrix';

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
  manual: 'Ручное управление', events: 'Журнал событий', alarms: 'Аварии', settings: 'Настройки визуализации',
};
const MACHINE_OPERATION = {
  NONE: 'Нет операции', LOAD: 'Загрузка заготовки', UNLOAD: 'Выгрузка детали', CHANGE: 'Замена детали',
} as const;
const cloneLayout = (): CellLayout => structuredClone(DEFAULT_LAYOUT);
const cloneState = (): CellState => structuredClone(DEFAULT_STATE);
const LAYOUT_STORAGE_KEY = 'portal-robot.visualization-layout.v1';
const INITIAL_CONNECTION: PlcConnectionInfo = { status: 'connecting', endpoint: '', message: 'Подключение к шлюзу', symbols: 0, missing: [] };
const INITIAL_RUNTIME: PlcRuntimeInfo = {
  cellRunning: false, globalError: false, readyToStart: false, drivesReady: false,
  robotReady: false, magazineReady: false, readyMachines: 0, manualMode: false,
  selectedMachine: 0,
  cellStateCode: 0, robotStateCode: 0, robotActionCode: 0, robotPointCode: 0,
  magazineStateCode: 0,
  cellStep: 'Ожидание данных PLC', robotStep: 'Ожидание данных PLC',
  machineSteps: ['Ожидание данных PLC', 'Ожидание данных PLC', 'Ожидание данных PLC'],
  magazineStep: 'Ожидание данных PLC',
  activeAlarmCount: 0,
  activeWarningCount: 0,
  alarmEvents: [],
  equipmentLoad: [0, 0, 0, 0],
};
const INITIAL_CYCLOGRAM: CyclogramHistory = {
  serverTime: Date.now(),
  retentionMs: 24 * 60 * 60 * 1_000,
  intervals: [],
};

function CellQuickPanel({ running, online, globalError, readyToStart, robotReady, magazineReady,
  readyMachines, manualMode, onToggle, onReset, onModeChange, onExtended, onClose, className }: {
  running: boolean;
  online: boolean;
  globalError: boolean;
  readyToStart: boolean;
  robotReady: boolean;
  magazineReady: boolean;
  readyMachines: number;
  manualMode: boolean;
  onToggle: () => void;
  onReset: () => void;
  onModeChange: (manual: boolean) => void;
  onExtended: () => void;
  onClose: () => void;
  className?: string;
}) {
  const overallText = !online ? 'Нет связи' : globalError ? 'Ошибка' : running ? 'Работает' : readyToStart ? 'Готова к запуску' : 'Не готова к запуску';
  const overallTone = online && !globalError && (running || readyToStart) ? 'green' : 'red';
  const primaryDisabled = !online || (!running && !readyToStart);

  return <section className={`cell-quick-panel ${className ?? ''}`} aria-label="Управление ячейкой">
    <SheetGrip onClose={onClose} />
    <header>
      <div className="cell-quick-heading">
        <div><h2>Ячейка</h2><p><Indicator active tone={overallTone} />{overallText}</p></div>
        <div className="cell-mode-switch" aria-label="Режим работы линии">
          <button className={manualMode ? 'active manual' : ''} type="button" disabled={!online} onClick={() => onModeChange(true)}>Ручной</button>
          <button className={!manualMode ? 'active auto' : ''} type="button" disabled={!online} onClick={() => onModeChange(false)}>Автомат</button>
        </div>
      </div>
      <div className="quick-panel-header-actions">
        <button className="extended-control" type="button" onClick={onExtended}>Расширенное управление <ArrowRight size={19} /></button>
        <button className="quick-panel-close" type="button" onClick={onClose} title="Закрыть меню"><X /></button>
      </div>
    </header>
    <div className="cell-quick-content">
      <div className="cell-quick-actions">
        <button className={`cell-primary-command ${running ? 'stop' : readyToStart ? 'ready' : ''}`} type="button" disabled={primaryDisabled} onClick={onToggle}>
          <Power size={25} /><span>{running ? 'Выключить ячейку' : 'Включить ячейку'}</span>
        </button>
        <button className="cell-reset-command" type="button" disabled={!online || !globalError} onClick={onReset}><RotateCcw size={23} /><span>Сбросить аварии</span></button>
      </div>
      <div className="cell-quick-statuses">
        <div><Bot /><span>Робот</span><p><Indicator active tone={robotReady ? 'green' : 'red'} />{robotReady ? 'Готов' : 'Не готов'}</p></div>
        <div><Factory /><span>Станки</span><p><Indicator active tone={readyMachines > 0 ? 'green' : 'red'} />{readyMachines} / 3 готовы</p></div>
        <div><Boxes /><span>Магазин</span><p><Indicator active tone={magazineReady ? 'green' : 'red'} />{magazineReady ? 'Готов' : 'Не готов'}</p></div>
      </div>
    </div>
  </section>;
}

function RobotQuickPanel({ robot, step, online, globalError, drivesReady, robotReady, manualMode,
  cellRunning, onToggleDrives, onStop, onReset, onExtended, onClose, className }: {
  robot: CellState['robot'];
  step: string;
  online: boolean;
  globalError: boolean;
  drivesReady: boolean;
  robotReady: boolean;
  manualMode: boolean;
  cellRunning: boolean;
  onToggleDrives: () => void;
  onStop: () => void;
  onReset: () => void;
  onExtended: () => void;
  onClose: () => void;
  className?: string;
}) {
  const hasError = globalError || robot.error;
  const controlsEnabled = online && manualMode && !cellRunning;
  const stateText = !online ? 'Нет связи'
    : hasError ? 'Авария'
      : !drivesReady ? 'Приводы выключены'
        : robot.busy ? 'Выполняет команду'
          : robotReady ? 'Готов' : 'Не готов';
  const stateTone = hasError ? 'red' : drivesReady && (robotReady || robot.busy) ? 'green' : 'gray';
  const orientation = robot.rotatedToBlank ? 'К заготовке' : robot.rotatedToDetail ? 'К детали' : 'Не определена';
  const gripper1 = robot.gripper1Closed ? 'Заготовка' : robot.gripper1Open ? 'Открыт' : 'Движение';
  const gripper2 = robot.gripper2Closed ? 'Деталь' : robot.gripper2Open ? 'Открыт' : 'Движение';

  return <section className={`robot-quick-panel tone-${stateTone} ${className ?? ''}`} aria-label="Управление роботом">
    <SheetGrip onClose={onClose} />
    <header className="robot-quick-header">
      <div className="robot-quick-summary">
        <h2>Робот</h2>
        <p><Indicator active={stateTone !== 'gray'} tone={stateTone === 'gray' ? 'blue' : stateTone} />{stateText}</p>
      </div>
      <div className="robot-step-summary"><span>Текущий шаг</span><strong>{step || stateText}</strong></div>
      <div className="quick-panel-header-actions">
        <button className="extended-control" type="button" onClick={onExtended}>Расширенное управление <ArrowRight size={19} /></button>
        <button className="quick-panel-close" type="button" onClick={onClose} title="Закрыть меню"><X /></button>
      </div>
    </header>
    <div className="robot-quick-content-row">
      <div className="robot-quick-command-row">
        <button className={`robot-power-command ${drivesReady ? 'enabled' : 'ready'}`} type="button" disabled={!controlsEnabled || (hasError && !drivesReady)} onClick={onToggleDrives}>
          <Power /><span>{drivesReady ? 'Выключить приводы' : 'Включить приводы'}</span>
        </button>
        <button className="robot-stop-command" type="button" disabled={!controlsEnabled || !drivesReady} onClick={onStop}>
          <AlertCircle /><span>Остановить</span>
        </button>
        <button className="robot-reset-command" type="button" disabled={!controlsEnabled || !hasError} onClick={onReset}>
          <RotateCcw /><span>Сбросить ошибку</span>
        </button>
      </div>
      <div className="robot-quick-status-grid">
        <div className="robot-position"><Activity /><span>Позиция, мм</span><p>X {Math.round(robot.x)} · Y {Math.round(robot.y)} · Z {Math.round(robot.z)}</p></div>
        <div className={robot.gripper1Closed ? 'holding-blank' : ''}><Box /><span>Захват 1</span><p><Indicator active={robot.gripper1Closed} tone="blue" />{gripper1}</p></div>
        <div className={robot.gripper2Closed ? 'holding-detail' : ''}><Box /><span>Захват 2</span><p><Indicator active={robot.gripper2Closed} tone="green" />{gripper2}</p></div>
        <div><RotateCcw /><span>Ориентация</span><p><Indicator active={robot.rotatedToBlank || robot.rotatedToDetail} tone="blue" />{orientation}</p></div>
      </div>
    </div>
  </section>;
}

function MagazineQuickPanel({ slots, state, matrixOpen, onMatrixToggle, onToggleEnabled, onFill, onClear, onExtended, onClose, className }: {
  slots: CellState['magazine'];
  state: CellState['magazineState'];
  matrixOpen: boolean;
  onMatrixToggle: () => void;
  onToggleEnabled: () => void;
  onFill: () => void;
  onClear: () => void;
  onExtended: () => void;
  onClose: () => void;
  className?: string;
}) {
  const total = Math.min(slots.length, Math.max(0, state.rows * state.columns));
  const activeSlots = slots.slice(0, total);
  const blanks = activeSlots.filter((slot) => slot === 'blank').length;
  const details = activeSlots.filter((slot) => slot === 'detail').length;
  const empty = activeSlots.filter((slot) => slot === 'empty').length;
  const editable = !state.enabled && !state.disablePending;
  const powerDisabled = state.disablePending || (!state.enabled && !state.canEnable);
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
        <h2>Магазин</h2>
        <p><Indicator active={statusTone !== 'gray'} tone={statusTone === 'gray' ? 'blue' : statusTone} />{statusText}</p>
      </div>
      <div className="magazine-quick-actions">
        <button className={`magazine-quick-power ${state.enabled ? 'enabled' : state.canEnable ? 'ready' : ''}`} type="button" onClick={onToggleEnabled} disabled={powerDisabled}>
          <Power /><span>{powerText}</span>
        </button>
        <button type="button" onClick={onFill} disabled={!editable}><PackagePlus /><span>Заполнить заготовками</span></button>
        <button type="button" onClick={onClear} disabled={!editable}><Trash2 /><span>Очистить магазин</span></button>
      </div>
      <div className="quick-panel-header-actions">
        <button className="extended-control" type="button" onClick={onExtended}>Расширенное управление <ArrowRight size={19} /></button>
        <button className="quick-panel-close" type="button" onClick={onClose} title="Закрыть меню"><X /></button>
      </div>
    </header>
    <div className="magazine-quick-status-grid">
      <div><Box /><span>Заготовок</span><strong>{blanks}</strong></div>
      <div><Settings /><span>Деталей</span><strong>{details}</strong></div>
      <div><Grid2X2 /><span>Всего ячеек</span><strong>{total}</strong></div>
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

function MachinesQuickPanel({ machines, selectedIndex, onSelect, onToggleEnabled, onReset, onExtended, onClose, className }: {
  machines: CellState['machines'];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onToggleEnabled: () => void;
  onReset: () => void;
  onExtended: () => void;
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
    ? 'Отключение запрошено'
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
        <button className="extended-control" type="button" onClick={onExtended}>Расширенное управление <ArrowRight size={19} /></button>
        <button className="quick-panel-close" type="button" onClick={onClose} title="Закрыть меню"><X /></button>
      </div>
    </header>
    <div className="machine-quick-content-row">
      <div className="machine-quick-command-row">
        <button className={`machine-quick-power ${machine.enabled ? 'enabled' : 'ready'}`} type="button" onClick={onToggleEnabled} disabled={machine.disablePending}>
          <Power /><span>{powerText}</span>
        </button>
        <button className="machine-quick-reset" type="button" onClick={onReset} disabled={machine.mode !== 'error'}>
          <RotateCcw /><span>Сбросить аварию</span>
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

function magazineOverviewStatus(state: CellState, runtime: PlcRuntimeInfo, connected: boolean): OverviewStatus {
  const magazine = state.magazineState;
  if (!connected) return { text: 'Нет данных', tone: 'gray' };
  if (magazine.error || magazine.activeErrors.length > 0) return { text: 'Авария', tone: 'red' };
  if (magazine.disablePending) return { text: 'Отключение после операции', tone: 'amber' };
  if (magazine.finished) return { text: 'Требует обслуживания', tone: 'amber' };
  if (!magazine.enabled) return { text: 'Выключен', tone: 'gray' };
  if (magazine.busy) {
    if (magazine.actualOperation === 'TAKE') return { text: `Берём заготовку · слот ${magazine.selectedBlank || '—'}`, tone: 'blue' };
    if (magazine.actualOperation === 'PUT') return { text: `Кладём деталь · слот ${magazine.selectedFreeSlot || '—'}`, tone: 'blue' };
    if (magazine.actualOperation === 'CHANGE') {
      const puttingDetail = runtime.robotPointCode === 15 || runtime.robotActionCode === 4;
      const takingBlank = runtime.robotPointCode === 14 || runtime.robotActionCode === 3;
      if (puttingDetail) return { text: `Кладём деталь · слот ${magazine.selectedFreeSlot || '—'}`, tone: 'blue' };
      if (takingBlank) return { text: `Берём заготовку · слот ${magazine.selectedBlank || '—'}`, tone: 'blue' };
      return { text: 'Замена детали и заготовки', tone: 'blue' };
    }
    return { text: runtime.magazineStep, tone: 'blue' };
  }
  if (magazine.ready) return { text: 'Готов', tone: 'green' };
  if (magazine.done) return { text: 'Операция завершена', tone: 'green' };
  return { text: runtime.magazineStep || 'Ожидает команду', tone: 'amber' };
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
    case 7: return { text: 'Робот работает с магазином', detail: magazineOverviewStatus(state, runtime, connected).text, tone: 'blue' };
    case 8: return { text: 'Завершение операции магазина', detail: 'Ожидание освобождения команды робота', tone: 'blue' };
    case 9: return { text: 'Ожидание готовности магазина', detail: magazineOverviewStatus(state, runtime, connected).text, tone: 'amber' };
    default: return { text: runtime.cellStep || 'Автоматический цикл', detail: 'Выполняется программа ячейки', tone: 'blue' };
  }
}

function ProcessOverviewCard({ state, runtime, connected, dataActive }: { state: CellState; runtime: PlcRuntimeInfo; connected: boolean; dataActive: boolean }) {
  const [equipmentVisible, setEquipmentVisible] = useState(true);
  const process = cellProcessStatus(state, runtime, connected, dataActive);
  const robot = robotOverviewStatus(state, runtime, connected, dataActive);
  const magazine = magazineOverviewStatus(state, runtime, connected);

  return <section className={`process-overview-card tone-${process.tone}${equipmentVisible ? '' : ' equipment-collapsed'}`} aria-label="Текущий процесс и состояния оборудования">
    <header className="process-current-card">
      <div className="process-current-icon"><Activity aria-hidden="true" /></div>
      <div><span>Текущий процесс</span><strong>{process.text}</strong><p>{process.detail}</p></div>
      <button className="process-equipment-toggle" type="button" aria-expanded={equipmentVisible} aria-controls="process-equipment-list" onClick={() => setEquipmentVisible((value) => !value)} title={equipmentVisible ? 'Скрыть состояния оборудования' : 'Показать состояния оборудования'}>
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
      <article className={`process-equipment-line tone-${magazine.tone}`}>
        <div className="process-equipment-icon"><Icon icon={viewGridOutlineIcon} aria-hidden="true" /></div>
        <b>Магазин</b>
        <div className="process-equipment-state"><i /><span title={magazine.text}>{magazine.text}</span></div>
      </article>
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
    { key: 'magazine' as const, label: 'Магазин', icon: viewGridOutlineIcon, sources: ['magazine'] as PlcAlarmSource[] },
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

function AlarmScreen({ events, online, onResetWarnings, onResetAlarms, onClose, className }: {
  events: PlcAlarmEvent[];
  online: boolean;
  onResetWarnings: () => void;
  onResetAlarms: () => void;
  onClose: () => void;
  className?: string;
}) {
  const activeAlarms = events.filter((event) => event.active && event.severity === 'alarm').length;
  const activeWarnings = events.filter((event) => event.active && event.severity === 'warning').length;
  const formatDate = (time: number) => new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(time);
  const formatTime = (time: number) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(time);

  return <section className={`alarm-panel ${className ?? ''}`} aria-label="Аварии и предупреждения">
    <SheetGrip onClose={onClose} />
    <header className="alarm-panel-heading">
      <div><h2>Аварии</h2><p>Активные и зафиксированные события</p></div>
      <div className="alarm-panel-actions">
        <button className="alarm-reset-warnings" type="button" onClick={onResetWarnings} disabled={!online || activeWarnings === 0}><AlertCircle size={20} />Сбросить предупреждения</button>
        <button className="alarm-reset-all" type="button" onClick={onResetAlarms} disabled={!online}><RotateCcw size={20} />Сбросить аварии</button>
        <button className="panel-close-button" type="button" onClick={onClose} aria-label="Закрыть аварии" title="Закрыть"><X /></button>
      </div>
    </header>
    <div className="alarm-summary-line">
      <span className={activeAlarms ? 'alarm' : ''}><TriangleAlert />Аварии <b>{activeAlarms}</b></span>
      <span className={activeWarnings ? 'warning' : ''}><AlertCircle />Предупреждения <b>{activeWarnings}</b></span>
      <small>{online ? 'Журнал обновляется от PLC' : 'Нет связи с PLC'}</small>
    </div>
    <div className="alarm-table" role="region" aria-label="Журнал аварий" tabIndex={0}>
      <div className="alarm-table-head"><span>Событие</span><span>Механизм</span><span>Дата</span><span>Время</span><span>Статус</span></div>
      {events.length === 0
        ? <div className="alarm-empty"><CheckCircle2 /><strong>Активных событий нет</strong><span>Новые аварии и предупреждения появятся здесь.</span></div>
        : events.map((event) => <article className={`alarm-row ${event.severity}${event.active ? ' active' : ''}`} key={event.id}>
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
    const saved = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) ?? '{}') as Partial<CellLayout>;
    return {
      ...fallback,
      ...saved,
      coordinate: { ...fallback.coordinate, ...saved.coordinate, origin: { ...fallback.coordinate.origin, ...saved.coordinate?.origin }, direction: { ...fallback.coordinate.direction, ...saved.coordinate?.direction } },
      floor: { ...fallback.floor, ...saved.floor },
      machine: { ...fallback.machine, ...saved.machine, machines: saved.machine?.machines ?? fallback.machine.machines },
      portal: { ...fallback.portal, ...saved.portal },
      robot: { ...fallback.robot, ...saved.robot },
      magazine: { ...fallback.magazine, ...saved.magazine },
      animation: { ...fallback.animation, ...saved.animation },
    };
  } catch {
    return fallback;
  }
}

function MachinePanel({ index, state, onClose, onToggleEnabled, onReset, onCycleSettings, className }: {
  index: number;
  state: CellState['machines'][number];
  onClose: () => void;
  onToggleEnabled: () => void;
  onReset: () => void;
  onCycleSettings: (useHmi: boolean, seconds?: number) => void;
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
      <button className={`machine-power ${state.enabled ? 'enabled' : 'ready'}`} onClick={onToggleEnabled} data-plc-command={state.enabled ? `GVL_HMI.axMachineDisable[${index + 1}]` : `GVL_HMI.axMachineEnable[${index + 1}]`}><Power size={21} /><span>{state.enabled ? 'Вывести из работы' : 'Ввести в работу'}</span></button>
      <button className="machine-reset" onClick={onReset} disabled={state.activeErrors.length === 0 && state.mode !== 'error'} data-plc-command={`GVL_HMI.axMachineReset[${index + 1}]`}><RotateCcw size={20} /><span>Сбросить аварию</span></button>
    </div>

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

function OperatorConfirmation({ index, machine, layout, state, onCommand, onCancel, className }: {
  index: number;
  machine: CellState['machines'][number];
  layout: CellLayout;
  state: CellState;
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
        <div className="confirmation-cell-preview"><CellViewport layout={layout} state={state} selectedMachine={index} cameraPreset="iso" onMachineSelect={() => {}} /></div>
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

function MagazineScreen({ slots, state, step, onClose, onToggleEnabled, onFill, onClear, onSlotClick, onSetting, className }: {
  slots: SlotType[];
  state: CellState['magazineState'];
  step: string;
  onClose: () => void;
  onToggleEnabled: () => void;
  onFill: () => void;
  onClear: () => void;
  onSlotClick: (index: number) => void;
  onSetting: (command: string, key: keyof CellState['magazineState'], value: number) => void;
  className?: string;
}) {
  const activeCount = Math.min(slots.length, Math.max(0, state.rows * state.columns));
  const activeSlots = slots.slice(0, activeCount);
  const blanks = activeSlots.filter((slot) => slot === 'blank').length;
  const details = activeSlots.filter((slot) => slot === 'detail').length;
  const empty = activeCount - blanks - details;
  const statusText = state.error ? 'Авария магазина' : state.disablePending ? 'Отключение после завершения операции' : state.busy ? 'Выполняется операция' : state.enabled ? 'Магазин включён' : 'Магазин отключён';
  const operationText = { NONE: 'Нет операции', TAKE: 'Выдача заготовки', PUT: 'Приём детали', CHANGE: 'Смена детали' }[state.actualOperation];
  const editable = !state.enabled;
  const setting = (label: string, command: string, key: keyof CellState['magazineState'], min: number, max: number, stepValue = 1) => <label className="magazine-setting"><span>{label}</span><input type="number" value={state[key] as number} min={min} max={max} step={stepValue} disabled={!editable} onChange={(event) => onSetting(command, key, Number(event.target.value))} /></label>;
  return <section className={`magazine-screen ${className ?? ''}`} onPointerDown={(event) => event.stopPropagation()}>
    <header className="magazine-screen-head"><div><span>ОБОРУДОВАНИЕ</span><h2>Управление магазином</h2><p><Indicator active={state.enabled && !state.error} tone={state.error ? 'red' : state.busy || state.disablePending ? 'amber' : 'green'} />{statusText}</p></div><button type="button" onClick={onClose} title="Закрыть"><X /></button></header>
    <div className="magazine-command-row"><button className={`magazine-power ${state.enabled ? 'enabled' : 'ready'}`} type="button" onClick={onToggleEnabled} disabled={state.disablePending || (!state.enabled && !state.canEnable)} title={!state.enabled && !state.canEnable ? 'Содержимое магазина не позволяет включение' : ''}><Power /><span>{state.enabled ? state.disablePending ? 'Ожидается отключение' : 'Выключить магазин' : 'Включить магазин'}</span></button><button type="button" onClick={onFill} disabled={!editable}><PackagePlus /><span>Заполнить заготовками</span></button><button className="clear" type="button" onClick={onClear} disabled={!editable}><Trash2 /><span>Очистить магазин</span></button></div>
    <div className="magazine-screen-grid">
      <section className="magazine-map-panel"><div className="magazine-section-head"><div><span>СОДЕРЖИМОЕ</span><h3>Матрица {state.columns} × {state.rows}</h3></div><small>{editable ? 'Нажатие: заготовка → деталь → пусто' : 'Редактирование доступно после отключения'}</small></div><div className="magazine-map"><MagazineMatrix slots={slots} columns={state.columns} activeCount={activeCount} onSlotClick={editable ? onSlotClick : undefined} /></div><div className="magazine-map-footer"><span><i className="slot blank" />Заготовки <b>{blanks}</b></span><span><i className="slot detail" />Детали <b>{details}</b></span><span><i className="slot empty" />Пусто <b>{empty}</b></span><strong>Всего слотов: {activeCount}</strong></div></section>
      <aside className="magazine-side-column">
        <section className="magazine-load-panel"><div className="magazine-section-head"><div><span>ЗАПОЛНЕНИЕ</span><h3>Состав магазина</h3></div></div><div className="ring-stats"><RingStat value={blanks} total={activeCount} tone="blue" label="Заготовки" /><RingStat value={details} total={activeCount} tone="green" label="Готовые детали" /></div></section>
        <section className="magazine-diagnostics"><div className="magazine-section-head"><div><span>ДИАГНОСТИКА</span><h3>{step}</h3></div></div><div className="diagnostic-list"><span>Текущая операция <b>{operationText}</b></span><span>Выбранная заготовка <b>{state.selectedBlank || '—'}</b></span><span>Выбранный свободный слот <b>{state.selectedFreeSlot || '—'}</b></span><span>TAKE / PUT / CHANGE <b>{state.canTake ? 'Да' : 'Нет'} / {state.canPut ? 'Да' : 'Нет'} / {state.canChange ? 'Да' : 'Нет'}</b></span></div>{state.finished && <div className="magazine-warning"><AlertCircle /><span>Требуется обслуживание магазина оператором</span></div>}{state.activeErrors.length ? <div className="magazine-error"><AlertCircle /><span>{state.activeErrors[0]}</span></div> : <div className="magazine-ok"><CheckCircle2 /><span>Активных ошибок нет</span></div>}</section>
        <section className="magazine-settings"><div className="magazine-section-head"><div><span>НАСТРОЙКИ</span><h3>Геометрия магазина</h3></div><Settings /></div><div className="magazine-settings-grid">{setting('Строки', 'magazine.rows', 'rows', 1, 70)}{setting('Столбцы', 'magazine.columns', 'columns', 1, 70)}{setting('Шаг по X, мм', 'magazine.pitchX', 'pitchX', 0, 5000, 0.1)}{setting('Шаг по Y, мм', 'magazine.pitchY', 'pitchY', 0, 5000, 0.1)}{setting('Безопасная высота над магазином, мм', 'magazine.safeAbove', 'safeAbove', -10000, 10000, 0.1)}{setting('Безопасная высота в магазине, мм', 'magazine.safeInside', 'safeInside', -10000, 10000, 0.1)}</div>{!editable && <p>Для изменения настроек сначала выключите магазин.</p>}</section>
      </aside>
    </div>
  </section>;
}

function Toggle({ checked, label, onChange, disabled = false }: { checked: boolean; label: string; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className={`toggle-row ${disabled ? 'disabled' : ''}`}><span>{label}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><i /></label>;
}

function NumberField({ label, value, unit = 'мм', min = -3000, max = 18000, step = 10, onChange }: {
  label: string; value: number; unit?: string; min?: number; max?: number; step?: number; onChange: (value: number) => void;
}) {
  return <label className="number-field"><span>{label}</span><input className="settings-range" type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} /><div><input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} /><em>{unit}</em></div></label>;
}

function SettingsPanel({ layout, setLayout, onClose, className }: { layout: CellLayout; setLayout: (layout: CellLayout) => void; onClose: () => void; className?: string }) {
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
      <section><h3>Магазин 10 × 7</h3><div className="field-grid">
        <NumberField label="Позиция X" value={layout.magazine.position.x} min={0} max={15000} onChange={(v) => change((d) => { d.magazine.position.x = v; })} />
        <NumberField label="Позиция Y" value={layout.magazine.position.y} min={0} max={5000} onChange={(v) => change((d) => { d.magazine.position.y = v; })} />
        <NumberField label="Высота Z" value={layout.magazine.position.z} min={200} max={1800} onChange={(v) => change((d) => { d.magazine.position.z = v; })} />
        <NumberField label="Ширина X" value={layout.magazine.sizeX} min={400} max={2000} onChange={(v) => change((d) => { d.magazine.sizeX = v; })} />
        <NumberField label="Глубина Y" value={layout.magazine.sizeY} min={400} max={2500} onChange={(v) => change((d) => { d.magazine.sizeY = v; })} />
      </div></section>
      <div className="panel-actions"><button onClick={() => setLayout(cloneLayout())}><RotateCcw size={16} />Сбросить геометрию</button></div>
    </aside>
  );
}

function ManualPanel({ state, layout, setState, machineIndex, setMachineIndex, onClose, plcDataEnabled, onPlcDataChange, className }: {
  state: CellState; layout: CellLayout; setState: (state: CellState) => void; machineIndex: number; setMachineIndex: (index: number) => void; onClose: () => void;
  plcDataEnabled: boolean; onPlcDataChange: (enabled: boolean) => void; className?: string;
}) {
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
    <section><h3>Магазин</h3><p className="panel-note">Нажатие на слот переключает: пусто → заготовка → деталь.</p><MagazineMatrix slots={state.magazine} onSlotClick={plcDataEnabled ? undefined : (index) => { const values: SlotType[] = ['empty', 'blank', 'detail']; const magazine = [...state.magazine]; magazine[index] = values[(values.indexOf(magazine[index]) + 1) % values.length]; setState({ ...state, magazine }); }} /></section>
  </aside>;
}

export function App() {
  const [layout, setLayout] = useState<CellLayout>(loadLayout);
  const [cellState, setCellState] = useState<CellState>(cloneState);
  const [page, setPage] = useState<Page>('monitoring');
  const [bottomSection, setBottomSection] = useState<BottomSection | null>(null);
  const [matrixQuickOpen, setMatrixQuickOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<number | null>(null);
  const [confirmationMachine, setConfirmationMachine] = useState<number | null>(null);
  const [confirmationEntered, setConfirmationEntered] = useState(false);
  const [manualMachine, setManualMachine] = useState(1);
  const [running] = useState(false);
  const [globalError] = useState(false);
  const [plcConnection, setPlcConnection] = useState<PlcConnectionInfo>(INITIAL_CONNECTION);
  const [plcRuntime, setPlcRuntime] = useState<PlcRuntimeInfo>(INITIAL_RUNTIME);
  const [cyclogramHistory, setCyclogramHistory] = useState<CyclogramHistory>(INITIAL_CYCLOGRAM);
  const [commandError, setCommandError] = useState('');
  const [plcDataEnabled, setPlcDataEnabled] = useState(true);
  const plcDataEnabledRef = useRef(true);
  const plcClient = useRef<ReturnType<typeof createPlcClient> | null>(null);
  const isPlcOnline = plcConnection.status === 'connected' || plcConnection.status === 'degraded';
  const usePlcData = isPlcOnline && plcDataEnabled;
  const updateMachine = (index: number, patch: Partial<CellState['machines'][number]>) => {
    setCellState((current) => {
      const machines = [...current.machines];
      machines[index] = { ...machines[index], ...patch };
      return { ...current, machines };
    });
  };
  const updateMagazineState = (patch: Partial<CellState['magazineState']>) => setCellState((current) => ({ ...current, magazineState: { ...current.magazineState, ...patch } }));
  const toggleMagazineEnabled = () => {
    const magazine = cellState.magazineState;
    const command = magazine.enabled ? 'magazine.disable' : 'magazine.enable';
    if (usePlcData) {
      plcClient.current?.send({ command });
      if (magazine.enabled && magazine.busy) updateMagazineState({ disablePending: true });
      return;
    }
    if (magazine.enabled && magazine.busy) updateMagazineState({ disablePending: true });
    else updateMagazineState({ enabled: !magazine.enabled, ready: magazine.enabled ? false : true, disablePending: false });
  };
  const fillMagazine = () => {
    if (cellState.magazineState.enabled) return;
    if (usePlcData) plcClient.current?.send({ command: 'magazine.fillBlanks' });
    const activeCount = Math.min(70, cellState.magazineState.rows * cellState.magazineState.columns);
    setCellState((current) => ({ ...current, magazine: current.magazine.map((_, index) => index < activeCount ? 'blank' : 'empty') }));
  };
  const clearMagazine = () => {
    if (cellState.magazineState.enabled) return;
    if (usePlcData) plcClient.current?.send({ command: 'magazine.clear' });
    setCellState((current) => ({ ...current, magazine: current.magazine.map(() => 'empty') }));
  };
  const cycleMagazineSlot = (index: number) => {
    if (cellState.magazineState.enabled || cellState.magazineState.disablePending) return;
    if (usePlcData) plcClient.current?.send({ command: 'magazine.setSlot', value: index + 1 });
    setCellState((current) => {
      const magazine = [...current.magazine];
      const sequence: SlotType[] = ['empty', 'blank', 'detail'];
      magazine[index] = sequence[(sequence.indexOf(magazine[index]) + 1) % sequence.length];
      return { ...current, magazine };
    });
  };
  const updateMagazineSetting = (command: string, key: keyof CellState['magazineState'], value: number) => {
    if (cellState.magazineState.enabled || !Number.isFinite(value)) return;
    const normalized = key === 'rows' || key === 'columns' ? Math.max(1, Math.round(value)) : value;
    const rows = key === 'rows' ? normalized : cellState.magazineState.rows;
    const columns = key === 'columns' ? normalized : cellState.magazineState.columns;
    if (rows * columns > 70) {
      setCommandError('Размер матрицы не может превышать 70 слотов');
      return;
    }
    updateMagazineState({ [key]: normalized });
    if (usePlcData) plcClient.current?.send({ command, value: normalized });
  };
  const toggleMachineEnabled = (index: number) => {
    const machine = cellState.machines[index];
    if (usePlcData) {
      if (machine.enabled) {
        plcClient.current?.send({ command: 'machine.disable', machine: index + 1 });
      } else {
        setBottomSection(null);
        setConfirmationMachine(index);
        setConfirmationEntered(false);
        plcClient.current?.send({ command: 'machine.enable', machine: index + 1 });
      }
      return;
    }
    if (machine.enabled && machine.mode === 'processing') {
      updateMachine(index, { disablePending: true, currentStep: 'Отключение после завершения обработки' });
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
  const resetMachine = (index: number) => {
    const machine = cellState.machines[index];
    if (usePlcData) {
      plcClient.current?.send({ command: 'machine.reset', machine: index + 1 });
      return;
    }
    updateMachine(index, {
      enabled: false,
      disablePending: false,
      mode: 'off',
      canAcceptService: false,
      currentStep: 'Станок отключён после сброса',
      lastErrors: machine.activeErrors.length ? machine.activeErrors : machine.lastErrors,
      activeErrors: [],
    });
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
    let pendingSnapshot: Record<string, unknown> | null = null;
    let snapshotTimer = 0;
    const applyPendingSnapshot = (urgent = false) => {
      snapshotTimer = 0;
      const values = pendingSnapshot;
      pendingSnapshot = null;
      if (!values || !plcDataEnabledRef.current) return;
      const apply = () => {
        setCellState((current) => mapPlcSnapshot(values, current));
        setPlcRuntime((current) => mapRuntimeInfo(values, current));
      };
      if (urgent) apply();
      else startTransition(apply);
    };

    plcClient.current = createPlcClient({
      onConnection: setPlcConnection,
      onSnapshot: (values, changed, full) => {
        if (!plcDataEnabledRef.current) return;
        pendingSnapshot = values;
        const requiresFastFeedback = full
          || Object.keys(changed).some((path) => FAST_PLC_UI_SYMBOLS.has(path));
        if (requiresFastFeedback) {
          window.clearTimeout(snapshotTimer);
          applyPendingSnapshot(true);
        } else if (!snapshotTimer) {
          snapshotTimer = window.setTimeout(applyPendingSnapshot, PLC_UI_REFRESH_MS);
        }
      },
      onCyclogramHistory: (history) => startTransition(() => setCyclogramHistory(history)),
      onCyclogramUpdate: (update) => startTransition(() => {
        setCyclogramHistory((current) => mergeCyclogramUpdate(current, update));
      }),
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
    if (confirmationMachine === null) return;
    const machine = cellState.machines[confirmationMachine];
    const confirmationState = [1, 2, 3, 12, 15].includes(machine.plcState);
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
    if (selectedMachine !== null) setSelectedMachine(null);
    if (page === 'machines') setPage('monitoring');
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
    + (cellState.magazineState.error || cellState.magazineState.activeErrors.length > 0 ? 1 : 0)
    + (displayedGlobalError && fallbackMachineAlarmIndexes.length === 0 && !cellState.magazineState.error ? 1 : 0);
  const activeWarnings = usePlcData ? plcRuntime.activeWarningCount : 0;
  const alarmCount = activeAlarms + activeWarnings;
  const alarmTone = activeAlarms > 0 ? 'active' : activeWarnings > 0 ? 'warning' : '';
  const alarmSource = activeAlarmEvents.length
    ? ALARM_SOURCE_LABELS[activeAlarmEvents[0].source]
    : 'Нет активных';

  const toggleCellCycle = () => {
    if (!usePlcData) {
      setCommandError('Управление ячейкой недоступно без связи с PLC');
      return;
    }
    if (!displayedRunning && !displayedReadyToStart) return;
    plcClient.current?.send({ command: displayedRunning ? 'cell.stop' : 'cell.start' });
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
  };
  const sendRobotCommand = (command: string) => {
    if (!usePlcData) {
      setCommandError('Управление роботом недоступно без связи с PLC');
      return;
    }
    if (!plcRuntime.manualMode || plcRuntime.cellRunning) {
      setCommandError('Ручные команды робота разрешены только в ручном режиме при остановленной ячейке');
      return;
    }
    plcClient.current?.send({ command });
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

  return <div className="app-shell tesla-shell no-sidebar">
    <header className="topbar tesla-topbar">
      <div className="page-title"><img src={portalRobotLogo} alt="Portal Robot" /></div>
      <div className={`system-summary ${displayedGlobalError || connectionLost ? 'alarm' : ''}`} title={plcConnection.message}><Indicator active={!connectionLost && !displayedGlobalError} tone={displayedGlobalError || connectionLost ? 'red' : 'green'} /><span>СИСТЕМА</span><b>{systemHeaderText}</b></div>
      <div className="mode-summary"><Indicator active tone="blue" /><span>РЕЖИМ</span><b>{modeText}</b></div>
      <div className="profile-area">
        <button className="profile-button" type="button" onClick={() => setProfileOpen((value) => !value)}><UserRound size={21} /><span><b>Оператор</b></span><ChevronDown size={17} /></button>
        {profileOpen && <div className="profile-popover"><span>АВТОРИЗОВАН</span><strong>Оператор</strong><p>Доступ: управление ячейкой</p><button type="button" onClick={() => setPage('settings')}><Settings size={17} />Настройки интерфейса</button></div>}
      </div>
      <button className="top-menu-button" type="button" onClick={() => setPage(page === 'manual' ? 'monitoring' : 'manual')} title="Ручное управление"><Menu /></button>
    </header>
    <main className={`workspace${page === 'monitoring' && bottomSection === 'cyclogram' ? ' cyclogram-open' : ''}`} onPointerDown={(event) => {
      const target = event.target as HTMLElement;
      if (target.closest('.magazine-matrix-card, .magazine-matrix-trigger')) return;
      setMatrixQuickOpen(false);
      if (target.closest('.side-panel, .equipment-status, .alarm-summary, .profile-area, .cell-bottom-shell, .alarm-panel')) return;
      closeMachinePanel();
      setProfileOpen(false);
    }}>
      <CellViewport
        layout={layout}
        state={cellState}
        selectedMachine={selectedMachine}
        cameraPreset="front"
        onMachineSelect={() => {}}
        onMagazineSelect={() => selectBottomSection('magazine')}
      />
      <AnimatedPresence open={page === 'monitoring' && bottomSection === 'cyclogram'}>
        <EquipmentLoadPanel values={plcRuntime.equipmentLoad} />
      </AnimatedPresence>
      <AnimatedPresence open={page === 'monitoring' && bottomSection === 'magazine' && matrixQuickOpen}>
        <MagazineMatrixCard
          id={QUICK_MAGAZINE_MATRIX_ID}
          slots={cellState.magazine}
          columns={cellState.magazineState.columns}
          rows={cellState.magazineState.rows}
          onSlotClick={!cellState.magazineState.enabled && !cellState.magazineState.disablePending ? cycleMagazineSlot : undefined}
        />
      </AnimatedPresence>
      {commandError && <div className="command-error" role="alert"><AlertCircle size={18} /><span>{commandError}</span><button onClick={() => setCommandError('')} type="button">×</button></div>}
      {page === 'monitoring' && bottomSection === null && confirmationMachine === null && <button className={`alarm-summary ${alarmTone}`} type="button" onClick={() => setPage('alarms')}>
        <TriangleAlert />
        <span>Аварии</span>
        <b>{alarmCount}</b>
        <i />
        <strong>{alarmSource}</strong>
        <ChevronDown />
      </button>}
      <AnimatedPresence open={page === 'settings'}><SettingsPanel layout={layout} setLayout={setLayout} onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={page === 'manual'}><ManualPanel state={cellState} layout={layout} setState={setCellState} machineIndex={manualMachine} setMachineIndex={setManualMachine} onClose={() => setPage('monitoring')} plcDataEnabled={plcDataEnabled} onPlcDataChange={changePlcDataSource} /></AnimatedPresence>
      <AnimatedPresence open={page === 'machines' && selectedMachine !== null}>{selectedMachine !== null && <MachinePanel index={selectedMachine} state={cellState.machines[selectedMachine]} onClose={closeMachinePanel} onToggleEnabled={() => toggleMachineEnabled(selectedMachine)} onReset={() => resetMachine(selectedMachine)} onCycleSettings={(useHmi, seconds) => updateCycleSettings(selectedMachine, useHmi, seconds)} />}</AnimatedPresence>
      <AnimatedPresence open={page === 'magazine'}><MagazineScreen slots={cellState.magazine} state={cellState.magazineState} step={usePlcData ? plcRuntime.magazineStep : 'Локальная модель'} onClose={() => setPage('monitoring')} onToggleEnabled={toggleMagazineEnabled} onFill={fillMagazine} onClear={clearMagazine} onSlotClick={cycleMagazineSlot} onSetting={updateMagazineSetting} /></AnimatedPresence>
      <AnimatedPresence open={page === 'alarms'}><AlarmScreen events={plcAlarmEvents} online={isPlcOnline} onResetWarnings={() => plcClient.current?.send({ command: 'alarms.resetWarnings' })} onResetAlarms={resetCell} onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={(['robot', 'events'] as Page[]).includes(page)}><aside className="side-panel info-panel"><div className="panel-heading"><div><span>РАЗДЕЛ</span><h2>{PAGE_TITLES[page]}</h2></div><button onClick={() => setPage('monitoring')} title="Закрыть"><ChevronRight /></button></div><div className="empty-state"><Activity size={42} /><strong>Экран подготовлен</strong><p>Здесь появятся рабочие команды и данные CODESYS после подключения обмена.</p></div></aside></AnimatedPresence>
      <AnimatedPresence open={confirmationMachine !== null}>{confirmationMachine !== null && <OperatorConfirmation index={confirmationMachine} machine={cellState.machines[confirmationMachine]} layout={layout} state={cellState} onCommand={sendMachineConfirmation} onCancel={cancelMachineConfirmation} />}</AnimatedPresence>
      {page === 'monitoring' && confirmationMachine === null && <div className="cell-bottom-shell">
        <AnimatedPresence open={bottomSection === 'cell'}><CellQuickPanel
          running={displayedRunning}
          online={usePlcData}
          globalError={displayedGlobalError}
          readyToStart={displayedReadyToStart}
          robotReady={displayedRobotReady}
          magazineReady={displayedMagazineReady}
          readyMachines={displayedReadyMachines}
          manualMode={usePlcData ? plcRuntime.manualMode : true}
          onToggle={toggleCellCycle}
          onReset={resetCell}
          onModeChange={changeCellMode}
          onExtended={() => setPage('manual')}
          onClose={() => setBottomSection(null)}
        /></AnimatedPresence>
        <AnimatedPresence open={bottomSection === 'machines'}><MachinesQuickPanel
          machines={cellState.machines}
          selectedIndex={selectedMachine ?? 0}
          onSelect={(index) => { setSelectedMachine(index); setManualMachine(index); }}
          onToggleEnabled={() => toggleMachineEnabled(selectedMachine ?? 0)}
          onReset={() => resetMachine(selectedMachine ?? 0)}
          onExtended={() => setPage('machines')}
          onClose={() => setBottomSection(null)}
        /></AnimatedPresence>
        <AnimatedPresence open={bottomSection === 'robot'}><RobotQuickPanel
          robot={cellState.robot}
          step={usePlcData ? plcRuntime.robotStep : 'Локальная модель'}
          online={usePlcData}
          globalError={displayedGlobalError}
          drivesReady={usePlcData && plcRuntime.drivesReady}
          robotReady={displayedRobotReady}
          manualMode={usePlcData ? plcRuntime.manualMode : true}
          cellRunning={displayedRunning}
          onToggleDrives={() => sendRobotCommand(plcRuntime.drivesReady ? 'robot.disableDrives' : 'robot.enableDrives')}
          onStop={() => sendRobotCommand('robot.stop')}
          onReset={() => sendRobotCommand('robot.reset')}
          onExtended={() => setPage('robot')}
          onClose={() => setBottomSection(null)}
        /></AnimatedPresence>
        <AnimatedPresence open={bottomSection === 'magazine'}><MagazineQuickPanel
          slots={cellState.magazine}
          state={cellState.magazineState}
          matrixOpen={matrixQuickOpen}
          onMatrixToggle={() => setMatrixQuickOpen((open) => !open)}
          onToggleEnabled={toggleMagazineEnabled}
          onFill={fillMagazine}
          onClear={clearMagazine}
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
            <ProcessOverviewCard state={cellState} runtime={plcRuntime} connected={isPlcOnline} dataActive={usePlcData} />
            <BottomNavigation active={bottomSection} onSelect={selectBottomSection} alarmEvents={activeAlarmEvents} />
          </div>
        </AnimatedPresence>
      </div>}
    </main>
  </div>;
}
