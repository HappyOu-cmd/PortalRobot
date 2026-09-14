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
  cloneElement, isValidElement, useEffect, useMemo, useRef, useState,
  type CSSProperties, type Dispatch, type SetStateAction, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode, type RefObject,
} from 'react';
import {
  Activity, AlertCircle, Bot, Box, Boxes, CheckCircle2, ChevronLeft, ChevronRight,
  ChevronDown, Clock3, Cylinder, Disc3, DoorOpen, Factory, Home, BarChart3,
  Eye, EyeOff, FlaskConical, Gauge, Grid2X2, LoaderCircle, LockKeyhole, Menu, Power, PackageOpen, PackagePlus, RotateCcw, Settings,
  ShieldAlert, ShieldCheck, Trash2, TriangleAlert, UnlockKeyhole, UserRound, UsersRound, X,
  type LucideIcon,
} from 'lucide-react';
import { CellViewport } from './components/CellViewport';
import { EnclosureManualControl } from './components/EnclosureManualControl';
import { ControlCabinetManualControl } from './components/ControlCabinetManualControl';
import { MpgManualControl } from './components/MpgManualControl';
import { EquipmentLoadPanel } from './components/EquipmentLoadPanel';
import { LatestEventNotification } from './components/LatestEventNotification';
import { RobotExtendedPanel } from './components/RobotExtendedPanel';
import { RobotQuickControlMenu, type RobotQuickControl } from './components/RobotQuickControlMenu';
import { currentRobotPointLabel } from './components/robotManualControl';
import { RobotSpeedEditor, normalizeRobotSpeed } from './components/RobotSpeedEditor';
import { FaultInjectionPanel } from './components/faultSimulation/FaultInjectionPanel';
import { SimulationSettingsPanel } from './components/faultSimulation/SimulationSettingsPanel';
import { MagazineMatrix, MagazineMatrixCard } from './components/magazine/MagazineMatrix';
import { MagazineSettingField } from './components/magazine/MagazineSettingField';
import {
  isMachineMotionAllowed,
  MachineManualControlMenu,
  MachineMotionWarning,
  type MachineMechanism,
  type MachineMechanismAction,
  type MachineMotionRequest,
} from './components/machine/MachineManualControl';
import { CellSettingsPanel, ProductTypeBadge, ProductTypeSelector } from './components/multiType/MultiTypeControls';
import { CyclogramPanel } from './components/cyclogram/CyclogramPanel';
import { CellEventLog } from './components/CellEventLog';
import { TestWorkbench } from './components/tests/TestWorkbench';
import { LoginOverlay } from './auth/LoginOverlay';
import { UserManagementPanel } from './auth/UserManagementPanel';
import { UserAvatar } from './auth/UserAvatar';
import { authApi, type AppUser } from './auth/client';
import { StatisticsPanel, StatisticsSettingsPanel } from './statistics/StatisticsPanels';
import { statisticsApi, type StatisticsSummary } from './statistics/client';
import { RingStat } from './components/magazine/RingStat';
import { Indicator } from './components/ui/Indicator';
import { SegmentedControl, ToggleSwitch } from './components/ui/ControlPrimitives';
import { TouchScrollControls } from './components/ui/TouchScrollControls';
import { VercelTabs } from './components/ui/VercelTabs';
import portalRobotLogo from './assets/branding/portal-robot-logo.png';
import { DEFAULT_LAYOUT, DEFAULT_STATE } from './model/defaults';
import { DEFAULT_CONTROL_CABINETS } from './model/controlCabinets';
import { DEFAULT_MPG_PENDANT } from './model/mpgPendant';
import { getPortalRailClearanceMm, getPortalSupportHeightMm, PORTAL_MEASUREMENTS, PORTAL_MOUNTING } from './config/portalMeasurements';
import { getRobotTravelLimits } from './model/travel';
import { mergeCyclogramUpdate, type CyclogramHistory } from './model/cyclogram';
import { pickFaultSimulationValues, readBool, readNumber } from './model/faultSimulation';
import {
  DEFAULT_DRIFT_SETTINGS,
  DRIFT_SETTINGS_STORAGE_KEY,
  EASTER_EGG_OPTIONS,
  EASTER_EGG_STORAGE_KEY,
  isEasterEggMode,
  nextEasterEggScene,
  normalizeDriftSettings,
  type DriftSettings,
  type EasterEggMode,
} from './model/easterEggs';
import {
  DEFAULT_VISUAL_EFFECT_SETTINGS,
  EMPTY_SCENE_ACTIVITY,
  VISUAL_EFFECTS_STORAGE_KEY,
  normalizeVisualEffectSettings,
  type SceneActivity,
  type SceneAlarmTarget,
  type SceneEquipmentTarget,
  type VisualEffectSettings,
} from './model/visualEffects';
import type {
  CellLayout,
  CellState,
  PartMaterialLayout,
  ProductType,
  RobotCoordinateFrame,
  SlotType,
} from './model/types';
import {
  createPlcClient, mapPlcSnapshot, mapRobotCoordinates, mapRuntimeInfo,
  ALARM_EFFECT_LABELS, ALARM_SOURCE_LABELS,
  type CellLogEvent, type PlcAlarmEvent, type PlcAlarmSource, type PlcCommand, type PlcConnectionInfo, type PlcRuntimeInfo,
} from './plc/client';
import { pointBackupApi } from './points/client';

type Page = 'monitoring' | 'machines' | 'robot' | 'magazine' | 'manual' | 'injections' | 'events' | 'alarms' | 'tests' | 'settings' | 'cell-settings' | 'simulation-settings' | 'users' | 'statistics' | 'statistics-settings';
type BottomSection = 'cell' | 'machines' | 'robot' | 'magazine' | 'cyclogram';
type TopMenuSection = 'root' | 'settings' | 'manual';
type FontPreset = 'apple' | 'tesla' | 'manrope' | 'plex' | 'onest' | 'geologica' | 'commissioner';
type SettingsTopic = 'interface' | 'scene' | 'equipment' | 'product';
type ManualTopic = 'robot' | 'machines' | 'magazines' | 'enclosure' | 'cabinets';
const PLC_UI_REFRESH_MS = 50;
const MANUAL_MODE_SPEED_PERCENT = 10;
const WORKSPACE_CLICK_MOVE_TOLERANCE_PX = 6;
const BOTTOM_NAV_PRESS_MOVE_TOLERANCE_PX = 14;
const BOTTOM_NAV_ITEMS = [
  { key: 'cell' as const, label: 'Ячейка', icon: conveyorBeltOutlineIcon, sources: ['cell'] as PlcAlarmSource[] },
  { key: 'machines' as const, label: 'Станки', icon: microwaveGenOutlineIcon, sources: ['machine-1', 'machine-2', 'machine-3'] as PlcAlarmSource[] },
  { key: 'robot' as const, label: 'Робот', icon: robotIndustrialOutlineIcon, sources: ['robot', 'axis-x', 'axis-y', 'axis-z', 'axis-group', 'motion-manager', 'point-manager'] as PlcAlarmSource[] },
  { key: 'magazine' as const, label: 'Магазины', icon: viewGridOutlineIcon, sources: ['magazine-1', 'magazine-2'] as PlcAlarmSource[] },
  { key: 'cyclogram' as const, label: 'Циклограмма', icon: timelineIcon, sources: [] as PlcAlarmSource[] },
];
const SETTINGS_TOPICS = [
  { id: 'interface' as const, label: 'Интерфейс' },
  { id: 'scene' as const, label: 'Сцена' },
  { id: 'equipment' as const, label: 'Техника' },
  { id: 'product' as const, label: 'Изделие' },
];
const EQUIPMENT_SETTINGS_TARGETS = [
  { id: 'machine-common', label: 'Общие параметры станков', kind: 'machine-common' as const },
  { id: 'machine-0', label: 'Станок 1', kind: 'machine' as const, index: 0 },
  { id: 'machine-1', label: 'Станок 2', kind: 'machine' as const, index: 1 },
  { id: 'machine-2', label: 'Станок 3', kind: 'machine' as const, index: 2 },
  { id: 'magazine-0', label: 'Магазин 1', kind: 'magazine' as const, index: 0 },
  { id: 'magazine-1', label: 'Магазин 2', kind: 'magazine' as const, index: 1 },
  { id: 'portal', label: 'Портал', kind: 'portal' as const },
] as const;
type EquipmentSettingsTargetId = typeof EQUIPMENT_SETTINGS_TARGETS[number]['id'];
const MANUAL_TOPICS = [
  { id: 'robot' as const, label: 'Робот' },
  { id: 'machines' as const, label: 'Станки' },
  { id: 'magazines' as const, label: 'Магазины' },
  { id: 'enclosure' as const, label: 'Двери' },
  { id: 'cabinets' as const, label: 'Шкафы' },
];
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
  'stCellStatus.xStartCheckPointsConfigured',
  'stCellStatus.xStartCheckDrivesReady',
  'stCellStatus.xStartCheckRobotReady',
  'stCellStatus.xStartCheckMagazineReady',
  'stCellStatus.xStartCheckTaskAvailable',
  'stCellStatus.xStartCheckSafetyHome',
  'stCellStatus.xStartCheckSafety',
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
  'stCellSafetyStatus.xReady',
  'stCellSafetyStatus.xGlobalError',
  'stCellSafetyStatus.xPhaseRelayOk',
  'stCellSafetyStatus.xPressureRelayOk',
  'stCellSafetyStatus.xSafetyRelayOk',
  'stCellSafetyStatus.xSafetyRelayResetAllowed',
  'stCellSafetyStatus.xSafetyRelayResetActive',
]);
const MACHINE_CONFIRMATION_PROMPT_STATES = new Set([1, 2, 3]);
const MACHINE_CONFIRMATION_WORKFLOW_STATES = new Set([1, 2, 3, 12, 15]);
const QUICK_MAGAZINE_MATRIX_ID = 'quick-magazine-matrix';
const WORKSPACE_INTERACTIVE_SELECTOR = 'button, input, a, [role="button"], [data-interactive]';
const WORKSPACE_OPEN_PANEL_SELECTOR = [
  '.side-panel', '.test-workbench', '.cell-quick-panel', '.machine-quick-panel', '.robot-quick-panel',
  '.magazine-quick-panel', '.safety-quick-panel', '.cyclogram-panel', '.alarm-panel', '.magazine-screen',
  '.cell-event-panel', '.statistics-panel', '.statistics-settings-panel', '.confirmation-overlay', '.magazine-matrix-card', '.profile-area', '.command-error',
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
  ? `${event.id}:${event.severity}:${event.effect}:${event.source}:${event.code}:${event.reportedAt}`
  : '';

function AnimatedPresence({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  const contentRef = useRef<ReactElement<{ className?: string }> | null>(
    isValidElement(children) ? children as ReactElement<{ className?: string }> : null,
  );
  if (isValidElement(children)) contentRef.current = children as ReactElement<{ className?: string }>;

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
      '.cell-quick-panel, .machine-quick-panel, .robot-quick-panel, .magazine-quick-panel, .safety-quick-panel, .cyclogram-panel, .alarm-panel',
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
  settings: 'Настройки визуализации', 'cell-settings': 'Настройки ячейки', 'simulation-settings': 'Настройки симуляции',
  users: 'Управление пользователями', statistics: 'Статистика', 'statistics-settings': 'Настройки статистики',
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
const LAYOUT_STORAGE_KEY = 'portal-robot.visualization-layout.v3';
const LAYOUT_REPAIR_STORAGE_KEY = 'portal-robot.visualization-layout.repair-default-reset-2026-09-08';
const LAYOUT_MEASUREMENTS_STORAGE_KEY = 'portal-robot.visualization-layout.measured-geometry-2026-09-08';
const FRAME_SPACING_STORAGE_KEY = 'portal-robot.visualization-layout.frame-spacing-2026-09-08-v4-posts-120';
const FLOOR_LENGTH_STORAGE_KEY = 'portal-robot.visualization-layout.floor-length-14000-v1';
const PORTAL_FRAME_ORIGIN_STORAGE_KEY = 'portal-robot.visualization-layout.portal-frame-origin-x0-v1';
const EQUIPMENT_MEASUREMENTS_STORAGE_KEY = 'portal-robot.visualization-layout.measured-equipment-2026-09-08';
const EQUIPMENT_HEIGHTS_STORAGE_KEY = 'portal-robot.visualization-layout.equipment-heights-2233-1780-v2';
const LEGACY_LAYOUT_STORAGE_KEYS = [
  'portal-robot.visualization-layout.v2',
  'portal-robot.visualization-layout.v1',
] as const;
type StoredLayout = Partial<CellLayout> & {
  partGeometry?: Partial<CellLayout['partGeometry']> & {
    blankDiameter?: number;
    blankLength?: number;
  };
  gripperPayloadPoses?: {
    blank?: CellLayout['gripperPayloadPose'];
    detail?: CellLayout['gripperPayloadPose'];
  };
};
const isAccidentallyResetLayout = (layout: StoredLayout): boolean => (
  layout.coordinate?.origin?.y === 0
  && layout.coordinate.origin.z === 0
  && layout.machine?.sizeX === 2806.7
  && layout.machine.sizeZ === 1873.6
  && layout.portal?.position?.x === 300
  && layout.portal.position.y === 1050
  && layout.portal.lengthX === 12000
  && layout.portal.widthY === 1350
  && layout.portal.frameBottomZ === 2250
  && layout.staticMagazines?.[0]?.position.x === 8500
  && layout.staticMagazines?.[1]?.position.x === 10500
);
const FONT_PRESET_STORAGE_KEY = 'portal-robot.font-preset.v1';
const FONT_PRESET_OPTIONS: { value: FontPreset; label: string; description: string }[] = [
  { value: 'apple', label: 'Apple', description: 'SF Pro-подобный системный стек' },
  { value: 'tesla', label: 'Tesla', description: 'Montserrat · геометричный и строгий' },
  { value: 'manrope', label: 'Manrope', description: 'Чистый современный интерфейс' },
  { value: 'plex', label: 'IBM Plex Sans', description: 'Технический и промышленный' },
  { value: 'onest', label: 'Onest', description: 'Кириллический гротеск · спокойный' },
  { value: 'geologica', label: 'Geologica', description: 'Геометричный техно-стиль' },
  { value: 'commissioner', label: 'Commissioner', description: 'Гибкий инженерный гротеск' },
];
const INITIAL_CONNECTION: PlcConnectionInfo = { status: 'connecting', endpoint: '', message: 'Подключение к шлюзу', symbols: 0, missing: [] };
const INITIAL_RUNTIME: PlcRuntimeInfo = {
  cellRunning: false, cellStopPending: false, globalError: false, readyToStart: false, drivesReady: false,
  cellStartAllowed: false, cellStopAllowed: false, cellResetAllowed: false,
  manualModeAllowed: true, automaticModeAllowed: true,
  robotReady: false, magazineReady: false, safetyHomeRequired: false, robotAtSafetyHome: false,
  safety: {
    ready: false, globalError: false, phaseRelayOk: false, pressureRelayOk: false, safetyRelayOk: false,
    safetyRelayResetAllowed: false, safetyRelayResetActive: false,
    emergencyStopsReleased: [false, false, false, false, false, false, false],
    doorsReady: [false, false, false, false],
  },
  cellSettings: {
    changeAllowed: false,
    pointCheckSpeedPercent: 10,
    safetyHome: { x: 0, y: 0, z: 0, speedFactor: 0.2, toleranceX: 5, toleranceY: 5, toleranceZ: 5 },
    timeouts: { robotMove: 60, robotAction: 10, robotRelease: 5, doorOpen: 10, doorClose: 10, hatchUnlock: 5, chuckOpen: 10, chuckClose: 10, cycleStart: 10 },
  },
  testEnvironment: {
    requested: 0, applied: 0, speedProfile: 0, changeAllowed: false, scenarioApplyAllowed: false,
    simulatorActive: false, benchKey: false, benchKeyLost: false, rejectReason: 0,
  },
  startReadiness: {
    cellIdle: false, automaticMode: false, noBlockingError: false,
    configurationValid: false, pointsConfigured: false, drivesReady: false, robotReady: false, magazineReady: false,
    taskAvailable: false, safetyHome: false, safety: false, robotInterfaceReady: false, met: 0, total: 12,
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
  pointEditor: {
    points: Array.from({ length: 12 }, (_, offset) => ({
      index: offset + 1, pointId: 0, x: 0, y: 0, z: 0, magazineSafeZ: 0, magazineChangeZ: 0, speedFactor: 0, configured: false,
    })),
    captureAllowed: false, saveAllowed: false, tableReady: false,
    ackSeq: 0, result: 0, rejectCode: 3, rejectReason: 'Ожидание данных PLC',
    resultPoint: { index: 0, pointId: 0, x: 0, y: 0, z: 0, magazineSafeZ: 0, magazineChangeZ: 0, speedFactor: 0, configured: false },
  },
};
const INITIAL_CYCLOGRAM: CyclogramHistory = {
  serverTime: Date.now(),
  retentionMs: 24 * 60 * 60 * 1_000,
  intervals: [],
};

type QuickStatusTone = 'gray' | 'green' | 'blue' | 'amber' | 'red';

function QuickStatusCard({
  icon: IconComponent,
  title,
  status,
  tone,
  detail,
  className,
  interactive = false,
  onClick,
  ariaExpanded,
  ariaControls,
}: {
  icon: LucideIcon;
  title: string;
  status: ReactNode;
  tone: QuickStatusTone;
  detail?: ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  ariaExpanded?: boolean;
  ariaControls?: string;
}) {
  const cardClassName = `quick-status-card tone-${tone}${className ? ` ${className}` : ''}`;
  const statusTone = tone === 'gray' ? 'blue' : tone;
  const content = <>
    <div className="quick-status-card__heading">
      <span className="quick-status-card__icon"><IconComponent aria-hidden="true" /></span>
      <span className="quick-status-card__copy">
        <strong>{title}</strong>
      </span>
    </div>
    <div className="quick-status-card__state">
      <i aria-hidden="true" />
      <span><Indicator active={tone !== 'gray'} tone={statusTone} />{status}</span>
      {detail && <b>{detail}</b>}
    </div>
  </>;

  if (interactive) {
    return <button className={cardClassName} type="button" onClick={onClick} aria-expanded={ariaExpanded} aria-controls={ariaControls}>{content}</button>;
  }

  return <article className={cardClassName}>{content}</article>;
}

function ExtendedControlIcon() {
  return (
    <svg
      className="extended-control__icon"
      aria-hidden="true"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" />
    </svg>
  );
}

function ExtendedControlButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="extended-control extended-control--icon"
      type="button"
      onClick={onClick}
      title="Расширенное управление"
      aria-label="Расширенное управление"
    >
      <ExtendedControlIcon />
    </button>
  );
}

function CellQuickPanel({ running, stopPending, online, globalError, readyToStart, startAllowed, stopAllowed,
  manualAllowed, automaticAllowed, robotReady, magazineReady, safetyHomeRequired, robotAtSafetyHome,
  startReadiness, readyMachines, manualMode, safety,
  onToggle, onModeChange, onExtended, onResetSafetyRelay, onClose, className }: {
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
  safety: PlcRuntimeInfo['safety'];
  onToggle: () => void;
  onModeChange: (manual: boolean) => void;
  onExtended: () => void;
  onResetSafetyRelay: () => void;
  onClose: () => void;
  className?: string;
}) {
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [blockingOpen, setBlockingOpen] = useState(true);
  const [completedOpen, setCompletedOpen] = useState(true);
  const [safetyOpen, setSafetyOpen] = useState(false);
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
  const machinesTone: QuickStatusTone = readyMachines === 3 ? 'green' : readyMachines > 0 ? 'amber' : 'red';
  const machinesStatus = readyMachines === 3 ? 'Готовы' : readyMachines > 0 ? 'Частично готовы' : 'Не готовы';
  const readinessConditions = [
    { key: 'cell', ready: startReadiness.cellIdle, title: 'Менеджер ячейки', done: 'Готов принять новый запуск', blocked: 'Текущая операция ещё не завершена' },
    { key: 'mode', ready: startReadiness.automaticMode, title: 'Режим работы', done: 'Выбран автоматический режим', blocked: 'Выбран ручной режим' },
    { key: 'errors', ready: startReadiness.noBlockingError, title: 'Блокирующие аварии', done: 'Активных блокировок нет', blocked: 'Обнаружена активная блокирующая авария' },
    { key: 'interface', ready: startReadiness.robotInterfaceReady, title: 'Интерфейс робота', done: 'Выбранный интерфейс готов', blocked: 'Интерфейс робота не подтвердил готовность' },
    { key: 'config', ready: startReadiness.configurationValid, title: 'Конфигурация типов', done: 'Конфигурация корректна', blocked: 'Конфигурация продукции некорректна' },
    { key: 'points', ready: startReadiness.pointsConfigured, title: 'Инженерные точки', done: 'Все 12 точек настроены', blocked: 'Настроены не все 12 обязательных точек робота' },
    { key: 'drives', ready: startReadiness.drivesReady, title: 'Приводы и группа осей', done: 'Готовы к движению', blocked: 'Приводы или группа осей не готовы' },
    { key: 'robot', ready: startReadiness.robotReady, title: 'Робот', done: 'Готов принять команду', blocked: 'Робот занят, в ошибке или захваты конфликтуют' },
    { key: 'magazine', ready: startReadiness.magazineReady, title: 'Магазин', done: 'Готов к операции', blocked: 'Магазин выключен, занят или находится в ошибке' },
    { key: 'task', ready: startReadiness.taskAvailable, title: 'Производственное задание', done: 'Данные для продолжения цикла доступны', blocked: 'Нет доступной работы или не определён груз робота' },
    { key: 'safety', ready: startReadiness.safetyHome, title: 'Безопасная позиция', done: safetyHomeRequired ? 'HOME_SAFETY подтверждена PLC' : 'Дополнительный возврат не требуется', blocked: 'После остановки требуется HOME_SAFETY' },
    { key: 'cell-safety', ready: startReadiness.safety, title: 'Контур безопасности', done: 'Грибки, реле и замки в норме', blocked: 'Есть активный грибок, реле или открытый замок активного магазина' },
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

  useEffect(() => {
    if (!online) setSafetyOpen(false);
  }, [online]);

  const pressedEmergencyStops = safety.emergencyStopsReleased.filter((released) => !released).length;
  const safetyTone: QuickStatusTone = !online ? 'gray' : safety.ready ? 'green' : 'red';

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
        <SegmentedControl
          className={`cell-mode-switch ${manualMode ? 'is-manual' : 'is-automatic'}`}
          value={manualMode ? 'manual' : 'automatic'}
          options={[
            { value: 'manual', label: 'Ручной', className: `manual${manualAllowed ? '' : ' command-unavailable'}`, ariaDisabled: !manualAllowed },
            { value: 'automatic', label: 'Автомат', className: `auto${automaticAllowed ? '' : ' command-unavailable'}`, ariaDisabled: !automaticAllowed },
          ]}
          disabled={!online}
          onChange={(value) => onModeChange(value === 'manual')}
          ariaLabel="Режим работы линии"
        />
      </div>
      <div className="quick-panel-header-actions">
        <ExtendedControlButton onClick={onExtended} />
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
        <QuickStatusCard icon={Bot} title="Робот" status={robotReady ? 'Готов' : 'Не готов'} tone={robotReady ? 'green' : 'red'} />
        <QuickStatusCard icon={Factory} title="Станки" status={machinesStatus} tone={machinesTone} detail={`${readyMachines} / 3`} />
        <QuickStatusCard icon={Boxes} title="Магазины" status={magazineReady ? 'Готовы' : 'Не готовы'} tone={magazineReady ? 'green' : 'red'} />
        <QuickStatusCard
          icon={ShieldCheck}
          title="Безопасность"
          status={!online ? 'Нет связи' : safety.ready ? 'Готова' : 'Не готова'}
          tone={safetyTone}
          detail={online ? `${pressedEmergencyStops} нажато` : '—'}
          interactive
          ariaExpanded={safetyOpen}
          ariaControls="cell-safety-detail-panel"
          className={safetyOpen ? 'is-open' : ''}
          onClick={() => setSafetyOpen((open) => !open)}
        />
      </div>
    </div>
    <AnimatedPresence open={safetyOpen}>
      <SafetyQuickPanel
        id="cell-safety-detail-panel"
        className="cell-safety-detail-panel"
        safety={safety}
        online={online}
        onResetRelay={onResetSafetyRelay}
        onClose={() => setSafetyOpen(false)}
      />
    </AnimatedPresence>
  </section>;
}

function SafetyQuickPanel({ id, safety, online, onResetRelay, onClose, className }: {
  id?: string;
  safety: PlcRuntimeInfo['safety'];
  online: boolean;
  onResetRelay: () => void;
  onClose: () => void;
  className?: string;
}) {
  const emergencyLabels = [
    'Пост 1 · магазин 1 спереди', 'Пост 2 · магазин 1 сзади',
    'Пост 3 · магазин 2 спереди', 'Пост 4 · магазин 2 сзади',
    'Шкаф оператора', 'Шкаф управления', 'MPG-пульт',
  ];
  const doorLabels = [
    'Дверь 1 · магазин 1 спереди', 'Дверь 2 · магазин 1 сзади',
    'Дверь 3 · магазин 2 спереди', 'Дверь 4 · магазин 2 сзади',
  ];
  const groups = [
    { title: 'Аварийные грибки', items: emergencyLabels.map((label, index) => ({ label, ready: safety.emergencyStopsReleased[index], ok: 'Отжат', fault: 'Нажат' })) },
    { title: 'Замки дверей', items: doorLabels.map((label, index) => ({ label, ready: safety.doorsReady[index], ok: 'Готово', fault: 'Открыт при активном магазине' })) },
    { title: 'Контрольные реле', items: [
      { label: 'Контроль фаз', ready: safety.phaseRelayOk, ok: 'Норма', fault: 'Не готово' },
      { label: 'Контроль давления', ready: safety.pressureRelayOk, ok: 'Норма', fault: 'Не готово' },
      { label: 'Реле безопасности', ready: safety.safetyRelayOk, ok: 'Взведено', fault: 'Не взведено' },
    ] },
  ];
  const ready = online && safety.ready;
  return <section id={id} className={`safety-quick-panel ${className ?? ''}`} aria-label="Безопасность ячейки">
    <SheetGrip onClose={onClose} />
    <header>
      <div><span className="panel-eyebrow">ЛИНИЯ ЯЧЕЙКИ</span><h2>Безопасность</h2><p><Indicator active={online} tone={ready ? 'green' : 'red'} />{!online ? 'Нет связи' : ready ? 'Готово' : 'Не готово'}</p></div>
      <div className="quick-panel-header-actions">
        <button className={`safety-relay-reset ${safety.safetyRelayResetAllowed ? 'active' : ''}`} type="button"
          disabled={!online || !safety.safetyRelayResetAllowed} onClick={onResetRelay}>
          <RotateCcw />{safety.safetyRelayResetActive ? 'Сброс выполняется…' : 'Сбросить реле безопасности'}
        </button>
        <button className="quick-panel-close" type="button" onClick={onClose} title="Закрыть меню"><X /></button>
      </div>
    </header>
    <div className="safety-condition-groups">
      {groups.map((group) => <section key={group.title}><h3>{group.title}</h3><div>
        {group.items.map((item) => <article className={item.ready ? 'ready' : 'blocked'} key={item.label}>
          {item.ready ? <CheckCircle2 /> : <TriangleAlert />}<span><strong>{item.label}</strong><small>{item.ready ? item.ok : item.fault}</small></span>
        </article>)}
      </div></section>)}
    </div>
  </section>;
}

function RobotQuickPanel({ robot, magazines, robotManual, robotModbus, axisManual, modbusMode, continuousMode, manualStep, speedOverridePercent, step, online, globalError, robotReady,
  onSend, onToggleDrives, onStop, onSpeedOverrideChange, onExtended, onClose, className }: {
  robot: CellState['robot'];
  magazines: CellState['magazines'];
  robotManual: PlcRuntimeInfo['robotManual'];
  robotModbus: PlcRuntimeInfo['robotModbus'];
  axisManual: PlcRuntimeInfo['axisManual'];
  modbusMode: boolean;
  continuousMode: boolean;
  manualStep: number;
  speedOverridePercent: number;
  step: string;
  online: boolean;
  globalError: boolean;
  robotReady: boolean;
  onSend: (command: PlcCommand) => void;
  onToggleDrives: () => void;
  onStop: () => void;
  onSpeedOverrideChange: (value: number) => void;
  onExtended: () => void;
  onClose: () => void;
  className?: string;
}) {
  const [control, setControl] = useState<RobotQuickControl>('position');
  const [controlOpen, setControlOpen] = useState(false);
  const controlTriggerRef = useRef<HTMLButtonElement | null>(null);
  const triggerProps = (target: RobotQuickControl) => ({
    interactive: true,
    ariaExpanded: controlOpen && control === target,
    ariaControls: 'robot-quick-control-menu',
    onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
      controlTriggerRef.current = event.currentTarget;
      setControl(target);
      setControlOpen(!controlOpen || control !== target);
    },
  });
  const triggerClass = (target: RobotQuickControl) => `robot-control-trigger${controlOpen && control === target ? ' active' : ''}`;
  const currentPoint = currentRobotPointLabel(robot.currentPoint, online);
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
  const gripper1 = robot.gripper1Closed ? 'Заготовка' : robot.gripper1Open ? 'Открыт' : 'Движение';
  const gripper2 = robot.gripper2Closed ? 'Деталь' : robot.gripper2Open ? 'Открыт' : 'Движение';
  const gripper1Tone: QuickStatusTone = robot.gripper1Closed ? 'blue' : robot.gripper1Open ? 'gray' : 'amber';
  const gripper2Tone: QuickStatusTone = robot.gripper2Closed ? 'green' : robot.gripper2Open ? 'gray' : 'amber';
  const orientationTone: QuickStatusTone = robot.rotatedToBlank || robot.rotatedToDetail ? 'blue' : 'gray';

  return <section className={`robot-quick-panel tone-${stateTone} ${className ?? ''}`} aria-label="Управление роботом">
    <SheetGrip onClose={onClose} />
    <header className="robot-quick-header">
      <div className="robot-quick-summary">
        <h2>Робот</h2>
        <p><Indicator active={stateTone !== 'gray'} tone={stateTone === 'gray' ? 'blue' : stateTone} />{stateText}</p>
      </div>
      <div className="robot-progress-summary">
        <div className="robot-step-summary"><span>Текущий шаг</span><strong title={step || stateText}>{step || stateText}</strong></div>
        <div className="robot-step-summary robot-current-point"><span>Текущая точка</span><strong title={currentPoint}>{online && robot.currentPoint === 17 ? 'HOME_SAFETY' : currentPoint}</strong></div>
      </div>
      <div className="quick-panel-header-actions">
        {!modbusMode && <details className="robot-quick-speed-menu">
          <summary title="Общая скорость робота" aria-label={`Общая скорость робота ${normalizedSpeed.toFixed(1)} процента`}>
            <Gauge size={20} /><span>{normalizedSpeed.toFixed(1)}%</span>
          </summary>
          <div className="robot-quick-speed-popover">
            <RobotSpeedEditor value={normalizedSpeed} online={online} onChange={onSpeedOverrideChange} compact />
          </div>
        </details>}
        <ExtendedControlButton onClick={onExtended} />
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
        <QuickStatusCard {...triggerProps('position')} icon={Activity} title="Позиция" status={`X ${Math.round(robot.x)} · Y ${Math.round(robot.y)} · Z ${Math.round(robot.z)}`} tone={online ? 'blue' : 'gray'} className={`robot-position ${triggerClass('position')}`} />
        <QuickStatusCard {...triggerProps('gripper1')} icon={Box} title="Захват 1" status={<>{gripper1}{robot.gripper1Closed && robot.blankProductType > 0 && <ProductTypeBadge type={robot.blankProductType as ProductType} />}</>} tone={gripper1Tone} className={`${triggerClass('gripper1')} ${robot.gripper1Closed ? 'holding-blank' : ''}`} />
        <QuickStatusCard {...triggerProps('gripper2')} icon={Box} title="Захват 2" status={<>{gripper2}{robot.gripper2Closed && robot.detailProductType > 0 && <ProductTypeBadge type={robot.detailProductType as ProductType} />}</>} tone={gripper2Tone} className={`${triggerClass('gripper2')} ${robot.gripper2Closed ? 'holding-detail' : ''}`} />
        <QuickStatusCard {...triggerProps('rotation')} icon={RotateCcw} title="Поворот" status={orientation} tone={orientationTone} className={triggerClass('rotation')} />
      </div>
    </div>
    <RobotQuickControlMenu control={control} open={controlOpen} robot={robot} magazines={magazines} manual={robotManual} axisManual={axisManual} continuousMode={continuousMode} manualStep={manualStep} speedOverridePercent={normalizedSpeed} modbusMode={modbusMode} online={online} triggerRef={controlTriggerRef} onOpenChange={setControlOpen} onSend={onSend} />
  </section>;
}

function MagazineQuickPanel({ magazines, selectedIndex, onSelect, matrixOpen, onMatrixToggle, onToggleEnabled, onFill, onClear, onExtended, onClose, className }: {
  magazines: CellState['magazines'];
  selectedIndex: number;
  onSelect: (index: number) => void;
  matrixOpen: boolean;
  onMatrixToggle: () => void;
  onToggleEnabled: () => void;
  onFill: () => void;
  onClear: () => void;
  onExtended: () => void;
  onClose: () => void;
  className?: string;
}) {
  const magazine = magazines[selectedIndex];
  const state = magazine.state;
  const slots = magazine.slots;
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
  const toggleAllowed = state.enabled || state.enableSequenceAllowed;
  const blanksTone: QuickStatusTone = blanks > 0 ? 'blue' : 'gray';
  const detailsTone: QuickStatusTone = details > 0 ? 'green' : 'gray';
  const emptyTone: QuickStatusTone = empty > 0 ? 'green' : 'gray';

  return <section className={`magazine-quick-panel tone-${statusTone} ${className ?? ''}`} aria-label="Управление магазином">
    <SheetGrip onClose={onClose} />
    <header className="magazine-quick-header">
      <div className="magazine-quick-summary">
        <h2>Магазин {selectedIndex + 1}</h2>
        <p><Indicator active={statusTone !== 'gray'} tone={statusTone === 'gray' ? 'blue' : statusTone} />{statusText}</p>
        <div className="magazine-quick-mini-actions" aria-label="Команды кассеты">
          <button className={`magazine-mini-command ${state.fillAllowed ? '' : 'command-unavailable'}`} type="button" onClick={onFill} aria-disabled={!state.fillAllowed} title="Заполнить кассету">
            <PackagePlus aria-hidden="true" /><span>Заполнить</span>
          </button>
          <button className={`magazine-mini-command ${state.clearAllowed ? '' : 'command-unavailable'}`} type="button" onClick={onClear} aria-disabled={!state.clearAllowed} title="Очистить кассету">
            <Trash2 aria-hidden="true" /><span>Очистить</span>
          </button>
        </div>
      </div>
      <nav className="machine-quick-tabs magazine-quick-tabs" aria-label="Выбор магазина">
        {magazines.map((_, index) => <button className={index === selectedIndex ? 'active' : ''} type="button" key={index} onClick={() => onSelect(index)}>Магазин {index + 1}</button>)}
      </nav>
      <div className="quick-panel-header-actions">
        <ExtendedControlButton onClick={onExtended} />
        <button className="quick-panel-close" type="button" onClick={onClose} title="Закрыть меню"><X /></button>
      </div>
    </header>
    <div className="magazine-quick-content-row">
      <div className="magazine-quick-command-row">
        <button className={`magazine-quick-power ${state.enabled ? 'enabled' : state.enableSequenceAllowed ? 'ready' : ''} ${toggleAllowed ? '' : 'command-unavailable'}`} type="button" onClick={onToggleEnabled} aria-disabled={!toggleAllowed}>
          <Power /><span>{powerText}</span>
        </button>
      </div>
      <div className="magazine-quick-status-grid">
        <QuickStatusCard icon={Box} title="Заготовки" status={blanks > 0 ? 'В наличии' : 'Нет заготовок'} tone={blanksTone} detail={blanks} />
        <QuickStatusCard icon={Settings} title="Детали" status={details > 0 ? 'В наличии' : 'Нет деталей'} tone={detailsTone} detail={details} />
        <QuickStatusCard icon={PackagePlus} title="Свободно" status={empty > 0 ? 'Есть свободные места' : 'Нет свободных мест'} tone={emptyTone} detail={empty} />
        <QuickStatusCard
          icon={Boxes}
          title="Матрица"
          status={matrixOpen ? 'Открыта' : 'Открыть'}
          tone="blue"
          detail={`${state.columns} × ${state.rows}`}
          className={`magazine-matrix-trigger ${matrixOpen ? 'active' : ''}`}
          interactive
          ariaExpanded={matrixOpen}
          ariaControls={QUICK_MAGAZINE_MATRIX_ID}
          onClick={onMatrixToggle}
        />
      </div>
    </div>
  </section>;
}

function machineQuickState(machine: CellState['machines'][number]): { text: string; tone: QuickStatusTone } {
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

function MachinesQuickPanel({ machines, selectedIndex, activeMechanism, usePlcData, onSelect, onMechanismSelect, onMechanismRequest, onToggleEnabled, onExtended, onClose, className }: {
  machines: CellState['machines'];
  selectedIndex: number;
  activeMechanism: MachineMechanism | null;
  usePlcData: boolean;
  onSelect: (index: number) => void;
  onMechanismSelect: (mechanism: MachineMechanism | null) => void;
  onMechanismRequest: (action: MachineMechanismAction) => void;
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
  const doorText = machine.doorOpen ? 'Открыта' : machine.doorClosed ? 'Закрыта' : 'Нет данных';
  const hatchText = machine.hatchOpen ? 'Открыт' : machine.hatchClosed ? 'Закрыт' : 'Движение';
  const lockText = machine.hatchLocked ? 'Закрыт' : 'Открыт';
  const chuckText = machine.chuckOpen ? 'Открыт' : machine.chuckClosed ? 'Закрыт' : 'Движение';
  const powerText = machine.disablePending
    ? 'Отменить отключение'
    : machine.enabled ? 'Выключить станок' : 'Включить станок';
  const doorTone: QuickStatusTone = machine.doorClosed ? 'green' : machine.doorOpen ? 'amber' : 'gray';
  const hatchTone: QuickStatusTone = machine.hatchClosed ? 'green' : machine.hatchOpen ? 'amber' : 'gray';
  const lockTone: QuickStatusTone = machine.hatchLocked ? 'green' : 'amber';
  const chuckTone: QuickStatusTone = machine.chuckClosed ? 'green' : machine.chuckOpen ? 'amber' : 'gray';
  const chuckPayload = product.kind === 'empty'
    ? undefined
    : <><i aria-hidden="true" /><span>{product.text}</span>{product.kind !== 'unknown' && <em>тип {machine.productType}</em>}</>;

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
        <ExtendedControlButton onClick={() => onExtended(selectedIndex)} />
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
        <QuickStatusCard icon={DoorOpen} title="Дверь" status={doorText} tone={doorTone} className={activeMechanism === 'door' ? 'machine-mechanism-trigger active' : 'machine-mechanism-trigger'} interactive ariaExpanded={activeMechanism === 'door'} onClick={() => onMechanismSelect(activeMechanism === 'door' ? null : 'door')} />
        <QuickStatusCard icon={PackageOpen} title="Люк" status={hatchText} tone={hatchTone} className={activeMechanism === 'hatch' ? 'machine-mechanism-trigger active' : 'machine-mechanism-trigger'} interactive ariaExpanded={activeMechanism === 'hatch'} onClick={() => onMechanismSelect(activeMechanism === 'hatch' ? null : 'hatch')} />
        <QuickStatusCard icon={LockKeyhole} title="Замок" status={lockText} tone={lockTone} className={activeMechanism === 'lock' ? 'machine-mechanism-trigger active' : 'machine-mechanism-trigger'} interactive ariaExpanded={activeMechanism === 'lock'} onClick={() => onMechanismSelect(activeMechanism === 'lock' ? null : 'lock')} />
        <QuickStatusCard icon={Disc3} title="Патрон" status={chuckText} tone={chuckTone} detail={chuckPayload}
          className={`machine-mechanism-trigger machine-chuck-payload product-type-${machine.productType} payload-${product.kind}${activeMechanism === 'chuck' ? ' active' : ''}`}
          interactive ariaExpanded={activeMechanism === 'chuck'} onClick={() => onMechanismSelect(activeMechanism === 'chuck' ? null : 'chuck')} />
      </div>
    </div>
    {activeMechanism && <MachineManualControlMenu machineIndex={selectedIndex} machine={machine} mechanism={activeMechanism} usePlcData={usePlcData} onRequest={onMechanismRequest} onClose={() => onMechanismSelect(null)} />}
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
  // xDrivesReady includes "axis can start a new motion", so it legitimately
  // becomes FALSE while JOG is running. Power state must come from the actual
  // drive feedback, otherwise the overview lies exactly during movement.
  if (runtime.robotManual.drivesOff) return { text: 'Приводы выключены', tone: 'gray' };
  if (!runtime.robotManual.drivesPowered) return { text: 'Приводы не готовы', tone: 'amber' };
  if (state.robot.busy || runtime.axisManual.some((axis) => axis.busy)) {
    return { text: 'Перемещается', tone: 'blue' };
  }
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

const EQUIPMENT_LOAD_ITEMS = [
  { lane: 'machine-1', label: 'Станок 1' },
  { lane: 'machine-2', label: 'Станок 2' },
  { lane: 'machine-3', label: 'Станок 3' },
  { lane: 'robot', label: 'Робот' },
] as const;
const EQUIPMENT_LOAD_RING_LENGTH = 2 * Math.PI * 11;

function OperatorShiftCard({ user, summary, metricsVisible, onMetricsVisibilityChange }: {
  user: AppUser;
  summary: StatisticsSummary | null;
  metricsVisible: boolean;
  onMetricsVisibilityChange: (visible: boolean) => void;
}) {
  const plan = summary?.shiftPlan ?? (user.role === 'operator' ? user.shiftPlan : null);
  const producedParts = summary?.producedParts ?? 0;
  const progress = plan && plan > 0 ? Math.round(producedParts / plan * 100) : null;
  const progressWidth = progress === null ? 0 : Math.min(100, progress);
  const planLabel = plan && plan > 0 ? plan : 'Нет данных';
  const role = user.role === 'admin' ? 'Администратор' : 'Оператор';

  return <section className={`operator-shift-card${metricsVisible ? ' metrics-visible' : ''}`} aria-label="План, факт и загрузка оборудования">
    <div className="operator-shift-card__profile">
      <div className="operator-shift-card__identity">
        <UserAvatar className="operator-shift-card__avatar" avatarDataUrl={user.avatarDataUrl} displayName={user.displayName} />
        <div><h2>{user.displayName}</h2><p><ShieldCheck aria-hidden="true" />{role}</p></div>
      </div>
      <div className="operator-shift-card__progress">
        <span>Изготовлено деталей</span>
        <div><b>{producedParts} / {planLabel}</b><strong>{progress === null ? '—' : `${progress}%`}</strong></div>
        <i aria-hidden="true"><u style={{ width: `${progressWidth}%` }} /></i>
      </div>
    </div>
    <section id="operator-equipment-load" className="operator-shift-card__metrics" aria-hidden={!metricsVisible} aria-label="Загрузка оборудования за смену">
      <h3>Загрузка за смену</h3>
      <div>{EQUIPMENT_LOAD_ITEMS.map(({ lane, label }) => {
        const source = summary?.equipment.find((item) => item.lane === lane);
        const value = Math.min(100, Math.max(0, Math.round(source?.loadPercent ?? 0)));
        return <article key={lane}>
          <span className="operator-load-ring" role="progressbar" aria-label={`${label}: ${value}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
            <svg viewBox="0 0 28 28" aria-hidden="true"><circle className="track" cx="14" cy="14" r="11" /><circle className="value" cx="14" cy="14" r="11" strokeDasharray={EQUIPMENT_LOAD_RING_LENGTH} strokeDashoffset={EQUIPMENT_LOAD_RING_LENGTH * (1 - value / 100)} /></svg><b>{value}%</b>
          </span>
          <span className="operator-load-data"><span><b>{label}</b><strong>{value}%</strong></span><i aria-hidden="true"><u style={{ width: `${value}%` }} /></i></span>
        </article>;
      })}</div>
    </section>
    <button className="operator-shift-card__metrics-toggle" type="button" aria-label={metricsVisible ? 'Скрыть загрузку оборудования за смену' : 'Показать загрузку оборудования за смену'} aria-controls="operator-equipment-load" aria-expanded={metricsVisible} onClick={() => onMetricsVisibilityChange(!metricsVisible)} title={metricsVisible ? 'Скрыть загрузку оборудования за смену' : 'Показать загрузку оборудования за смену'}>
      {metricsVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
    </button>
  </section>;
}

function BottomNavigation({ active, onSelect, alarmEvents }: {
  active: BottomSection | null;
  onSelect: (section: BottomSection) => void;
  alarmEvents: PlcAlarmEvent[];
}) {
  const pointerRef = useRef<{ pointerId: number; key: BottomSection; x: number; y: number } | null>(null);
  const suppressPointerClickRef = useRef(false);
  return <nav className="cell-bottom-nav" aria-label="Быстрое управление">
    {BOTTOM_NAV_ITEMS.map(({ key, label, icon, sources }) => {
      const events = alarmEvents.filter((event) => event.active && sources.includes(event.source));
      const tone = events.some((event) => event.severity === 'alarm') ? 'alarm' : events.length ? 'warning' : '';
      return <button
        key={key}
        className={`${active === key ? 'active ' : ''}${tone ? `has-${tone}` : ''}`.trim()}
        type="button"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          suppressPointerClickRef.current = true;
          pointerRef.current = { pointerId: event.pointerId, key, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          const pointer = pointerRef.current;
          pointerRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          if (!pointer || pointer.pointerId !== event.pointerId || pointer.key !== key) return;
          const distance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
          if (distance <= BOTTOM_NAV_PRESS_MOVE_TOLERANCE_PX) onSelect(key);
          window.setTimeout(() => { suppressPointerClickRef.current = false; }, 0);
        }}
        onPointerCancel={(event) => {
          if (pointerRef.current?.pointerId === event.pointerId) pointerRef.current = null;
          suppressPointerClickRef.current = false;
        }}
        onClick={() => {
          if (suppressPointerClickRef.current) {
            suppressPointerClickRef.current = false;
            return;
          }
          onSelect(key);
        }}
        aria-label={label}
        title={label}
      ><span className="cell-bottom-nav__icon"><Icon icon={icon} aria-hidden="true" /></span></button>;
    })}
  </nav>;
}

function AlarmScreen({ events, online, resetAllowed, safetyRelayResetAllowed, safetyRelayResetActive,
  onResetWarnings, onResetAlarms, onResetSafetyRelay, onClose, className }: {
  events: PlcAlarmEvent[];
  online: boolean;
  resetAllowed: boolean;
  safetyRelayResetAllowed: boolean;
  safetyRelayResetActive: boolean;
  onResetWarnings: () => void;
  onResetAlarms: () => void;
  onResetSafetyRelay: () => void;
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
        <button className={`alarm-reset-safety ${safetyRelayResetAllowed ? 'active' : ''}`} type="button"
          onClick={onResetSafetyRelay} disabled={!online || !safetyRelayResetAllowed}>
          <ShieldAlert size={20} />{safetyRelayResetActive ? 'Сброс реле…' : 'Сбросить реле безопасности'}
        </button>
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
          <span className="alarm-event-text">{event.severity === 'alarm' ? <TriangleAlert /> : <AlertCircle />}<b>{event.text}</b><small>{ALARM_EFFECT_LABELS[event.effect]}</small></span>
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
    const currentRaw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    const legacyRaw = LEGACY_LAYOUT_STORAGE_KEYS
      .map((key) => localStorage.getItem(key))
      .find((value): value is string => value !== null);
    const parsed = JSON.parse(currentRaw ?? legacyRaw ?? '{}') as StoredLayout;
    const repairPending = localStorage.getItem(LAYOUT_REPAIR_STORAGE_KEY) !== 'done';
    const measurementsPending = localStorage.getItem(LAYOUT_MEASUREMENTS_STORAGE_KEY) !== 'done';
    const frameSpacingPending = localStorage.getItem(FRAME_SPACING_STORAGE_KEY) !== 'done';
    const floorLengthPending = localStorage.getItem(FLOOR_LENGTH_STORAGE_KEY) !== 'done';
    const portalFrameOriginPending = localStorage.getItem(PORTAL_FRAME_ORIGIN_STORAGE_KEY) !== 'done';
    const equipmentMeasurementsPending = localStorage.getItem(EQUIPMENT_MEASUREMENTS_STORAGE_KEY) !== 'done';
    const equipmentHeightsPending = localStorage.getItem(EQUIPMENT_HEIGHTS_STORAGE_KEY) !== 'done';
    const saved = repairPending && isAccidentallyResetLayout(parsed) ? {} : parsed;
    const savedGeometry = saved.partGeometry;
    const legacyPayloadPoses = saved.gripperPayloadPoses;
    const legacyPose = legacyPayloadPoses?.blank ?? legacyPayloadPoses?.detail;
    const diameter = savedGeometry?.diameter ?? savedGeometry?.blankDiameter ?? fallback.partGeometry.diameter;
    const length = savedGeometry?.length ?? savedGeometry?.blankLength ?? fallback.partGeometry.length;
    const pose = saved.gripperPayloadPose ?? legacyPose ?? fallback.gripperPayloadPose;
    const savedStaticMagazines = saved.staticMagazines?.length === fallback.staticMagazines.length
      ? saved.staticMagazines
      : undefined;
    return {
      ...fallback,
      ...saved,
      coordinate: { ...fallback.coordinate, ...saved.coordinate, origin: { ...fallback.coordinate.origin, ...saved.coordinate?.origin }, direction: { ...fallback.coordinate.direction, ...saved.coordinate?.direction } },
      floor: {
        ...fallback.floor,
        ...saved.floor,
        ...(floorLengthPending ? { lengthX: fallback.floor.lengthX } : {}),
      },
      machine: {
        ...fallback.machine, ...saved.machine,
        ...(equipmentMeasurementsPending ? {
          sizeX: fallback.machine.sizeX,
          sizeY: fallback.machine.sizeY,
          sizeZ: fallback.machine.sizeZ,
        } : {}),
        ...(equipmentHeightsPending ? { sizeZ: fallback.machine.sizeZ } : {}),
        machines: saved.machine?.machines ?? fallback.machine.machines,
      },
      portal: {
        ...fallback.portal, ...saved.portal,
        ...(portalFrameOriginPending ? {
          position: { ...fallback.portal.position, ...(saved.portal?.position ?? {}), x: fallback.portal.position.x },
        } : {}),
        ...(measurementsPending || equipmentHeightsPending ? { frameBottomZ: fallback.portal.frameBottomZ } : {}),
        ...(measurementsPending || frameSpacingPending ? {
          lengthX: fallback.portal.lengthX,
          widthY: PORTAL_MEASUREMENTS.clearWidthY + fallback.portal.supportSize - 2 * getPortalRailClearanceMm(
            saved.portal?.frameDepthY ?? fallback.portal.frameDepthY,
            saved.robot?.zColumnWidth ?? fallback.robot.zColumnWidth,
          ),
          supportSize: fallback.portal.supportSize,
          bayClearSpansX: fallback.portal.bayClearSpansX,
        } : {}),
      },
      robot: {
        ...fallback.robot, ...saved.robot,
        ...(measurementsPending ? { zProfileLength: fallback.robot.zProfileLength } : {}),
      },
      partGeometry: { diameter, length },
      productPartMaterials: fallback.productPartMaterials.map((materials, index) => ({
        blank: { ...materials.blank, ...saved.productPartMaterials?.[index]?.blank },
        detail: { ...materials.detail, ...saved.productPartMaterials?.[index]?.detail },
      })) as CellLayout['productPartMaterials'],
      gripperPayloadPose: {
        offset: { ...fallback.gripperPayloadPose.offset, ...pose.offset },
        rotationDeg: { ...fallback.gripperPayloadPose.rotationDeg, ...pose.rotationDeg },
      },
      staticMagazines: fallback.staticMagazines.map((magazine, index) => ({
        ...magazine,
        ...savedStaticMagazines?.[index],
        ...(equipmentMeasurementsPending ? {
          pitchX: magazine.pitchX,
          pitchY: magazine.pitchY,
          workingHeight: magazine.workingHeight,
        } : {}),
        position: {
          ...magazine.position,
          ...savedStaticMagazines?.[index]?.position,
        },
      })),
      animation: { ...fallback.animation, ...saved.animation },
    };
  } catch {
    return fallback;
  }
}

function loadEasterEggMode(): EasterEggMode {
  try {
    const value = localStorage.getItem(EASTER_EGG_STORAGE_KEY);
    return isEasterEggMode(value) ? value : 'off';
  } catch {
    return 'off';
  }
}

function loadDriftSettings(): DriftSettings {
  try {
    const saved = localStorage.getItem(DRIFT_SETTINGS_STORAGE_KEY);
    return normalizeDriftSettings(saved ? JSON.parse(saved) : undefined);
  } catch {
    return { ...DEFAULT_DRIFT_SETTINGS };
  }
}

function loadFontPreset(): FontPreset {
  try {
    const value = localStorage.getItem(FONT_PRESET_STORAGE_KEY);
    return FONT_PRESET_OPTIONS.some((option) => option.value === value) ? value as FontPreset : 'apple';
  } catch {
    return 'apple';
  }
}

function loadVisualEffects(): VisualEffectSettings {
  try {
    const saved = localStorage.getItem(VISUAL_EFFECTS_STORAGE_KEY);
    return normalizeVisualEffectSettings(saved ? JSON.parse(saved) : undefined);
  } catch {
    return { ...DEFAULT_VISUAL_EFFECT_SETTINGS };
  }
}

function sceneAlarmTargets(events: PlcAlarmEvent[]): SceneAlarmTarget[] {
  const targets = new Map<string, SceneAlarmTarget>();
  events.filter((event) => event.active && event.severity === 'alarm').forEach((event) => {
    const target: SceneAlarmTarget = event.source === 'cell'
      ? { kind: 'cell' }
      : event.source === 'machine-1'
        ? { kind: 'machine', index: 0 }
        : event.source === 'machine-2'
          ? { kind: 'machine', index: 1 }
          : event.source === 'machine-3'
            ? { kind: 'machine', index: 2 }
            : event.source === 'magazine-1' || event.source === 'magazine-axis-1'
              ? { kind: 'magazine', index: 0 }
              : event.source === 'magazine-2' || event.source === 'magazine-axis-2'
                ? { kind: 'magazine', index: 1 }
                : { kind: 'portal' };
    const key = target.kind === 'machine' || target.kind === 'magazine'
      ? `${target.kind}:${target.index}`
      : target.kind;
    targets.set(key, target);
  });
  return [...targets.values()];
}

function localSceneAlarmTargets(state: CellState): SceneAlarmTarget[] {
  const targets: SceneAlarmTarget[] = [];
  state.machines.forEach((machine, index) => {
    if (machine.alarm || machine.mode === 'error' || machine.activeErrors.length > 0) {
      targets.push({ kind: 'machine', index });
    }
  });
  state.magazines.forEach((magazine, index) => {
    if (magazine.state.error || magazine.state.activeErrors.length > 0) {
      targets.push({ kind: 'magazine', index });
    }
  });
  if (state.robot.error) targets.push({ kind: 'portal' });
  return targets;
}

function mergeSceneAlarmTargets(...targetLists: SceneAlarmTarget[][]): SceneAlarmTarget[] {
  const targets = new Map<string, SceneAlarmTarget>();
  targetLists.flat().forEach((target) => {
    const key = target.kind === 'machine' || target.kind === 'magazine'
      ? `${target.kind}:${target.index}`
      : target.kind;
    targets.set(key, target);
  });
  return [...targets.values()];
}

function createSceneActivity(
  live: boolean,
  state: CellState,
  runtime: PlcRuntimeInfo,
): SceneActivity {
  if (!live) return { ...EMPTY_SCENE_ACTIVITY, alarmTargets: localSceneAlarmTargets(state) };
  const activeMachines = state.machines.flatMap((machine, index) => (
    machine.mode === 'processing' || machine.mode === 'change' || machine.actualOperation !== 'NONE'
      ? [index]
      : []
  ));
  const activeMagazines = state.magazines.flatMap((magazine, index) => (
    magazine.state.busy || magazine.state.actualOperation !== 'NONE'
      ? [index]
      : []
  ));
  const selectedMachine = runtime.selectedMachine - 1;
  const activeMagazine = runtime.activeMagazine - 1;
  const hasSelectedMachine = selectedMachine >= 0 && selectedMachine < state.machines.length;
  const hasActiveMagazine = activeMagazine >= 0 && activeMagazine < state.magazines.length;
  const robotBusy = state.robot.busy || runtime.robotModbus.busy;
  let operationTarget: SceneEquipmentTarget | null = null;
  if (runtime.cellRunning && hasActiveMagazine && [7, 8, 9].includes(runtime.cellStateCode)) {
    operationTarget = { kind: 'magazine', index: activeMagazine };
  } else if (runtime.cellRunning && hasSelectedMachine && [3, 4, 5, 6].includes(runtime.cellStateCode)) {
    operationTarget = { kind: 'machine', index: selectedMachine };
  } else if (robotBusy && hasSelectedMachine) {
    operationTarget = { kind: 'machine', index: selectedMachine };
  } else if (robotBusy && hasActiveMagazine) {
    operationTarget = { kind: 'magazine', index: activeMagazine };
  }
  if (operationTarget?.kind === 'machine' && !activeMachines.includes(operationTarget.index)) activeMachines.push(operationTarget.index);
  if (operationTarget?.kind === 'magazine' && !activeMagazines.includes(operationTarget.index)) activeMagazines.push(operationTarget.index);
  return {
    live: true,
    operationTarget,
    activeMachines,
    activeMagazines,
    robotBusy,
    // Keep the halo responsive to the current PLC snapshot as well as the
    // event stream.  The event journal can arrive a little later than the
    // equipment state, especially right after reconnecting to OPC UA.
    alarmTargets: mergeSceneAlarmTargets(
      sceneAlarmTargets(runtime.alarmEvents),
      localSceneAlarmTargets(state),
    ),
  };
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
      <div className="machine-io-grid"><div><DoorOpen /><span>Дверь</span><b>{state.doorOpen ? 'Открыта' : state.doorClosed ? 'Закрыта' : 'Нет данных'}</b></div><div><PackageOpen /><span>Люк</span><b>{state.hatchOpen ? 'Открыт' : state.hatchClosed ? 'Закрыт' : 'Движение'}</b></div><div><LockKeyhole /><span>Замок</span><b>{state.hatchLocked ? 'Закрыт' : 'Открыт'}</b></div><div>{state.chuckClosed ? <LockKeyhole /> : <UnlockKeyhole />}<span>Патрон</span><b>{state.chuckOpen ? 'Открыт' : state.chuckClosed ? 'Закрыт' : 'Движение'}</b></div><div><Box /><span>Изделие</span><b>{machineProduct(state).text}</b></div><div><Bot /><span>Обслуживание</span><b>{state.canAcceptService ? 'Разрешено' : 'Запрещено'}</b></div><div>{state.activeErrors.length ? <AlertCircle /> : <CheckCircle2 />}<span>Авария</span><b>{state.activeErrors.length ? 'Есть' : 'Нет'}</b></div></div>
    </section>

    <section><div className="panel-section-title"><Clock3 size={18} /><h3>Оценка времени</h3></div>
      <SegmentedControl
        className="cycle-source"
        value={state.useHmiCycleTime ? 'hmi' : 'measured'}
        options={[{ value: 'hmi', label: 'Задано HMI', className: 'cycle-source-hmi' }, { value: 'measured', label: 'Измеряется', className: 'cycle-source-measured' }]}
        onChange={(nextValue) => onCycleSettings(nextValue === 'hmi')}
        ariaLabel="Источник оценки времени цикла"
      />
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
  const steps = ['Что установлено в станке?', 'Закрыть люк?', 'Запустить цикл ЧПУ?'];
  return <div className={`confirmation-overlay ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={`Подтверждение оператора для станка ${index + 1}`} onPointerDown={(event) => event.stopPropagation()}>
    <div className="confirmation-modal">
      <aside className="confirmation-context">
        <div><span>ВВОД В РАБОТУ</span><h2>Станок {index + 1}</h2></div>
        <div className="confirmation-cell-preview"><CellViewport layout={layout} state={state} robotCoordinatesRef={robotCoordinatesRef} selectedMachine={index} cameraPreset="iso" controlsVisible={false} onMachineSelect={() => {}} /></div>
        <p>Выбранный станок отмечен в модели ячейки.</p>
      </aside>
      <section className="confirmation-workflow">
        <header><div><span>СТАНОК {index + 1}</span><h2>Подтверждение оператора</h2></div><button type="button" onClick={onCancel} title="Отменить ввод в работу"><X /></button></header>
        <div className="confirmation-stepper">{steps.map((label, stepIndex) => <div key={label} className={stepIndex + 1 === step ? 'active' : stepIndex + 1 < step ? 'done' : ''}><i>{stepIndex + 1}</i><span>{label}</span></div>)}</div>
        <div className="confirmation-question">
          {moving ? <div className="confirmation-wait"><LoaderCircle /><strong>{machine.plcState === 12 ? 'Закрывается люк' : machine.plcState === 15 ? 'Запускается обработка' : 'Включается станок'}</strong><span>Ожидание подтверждения от PLC</span></div>
          : step === 1 ? <><div className="question-heading"><span>ШАГ 1 ИЗ 3</span><h3>Что находится в патроне станка?</h3><p>Выберите фактический тип установленного изделия.</p></div><div className="part-choice"><button className="blank" type="button" onClick={() => onCommand('machine.setBlank')}><Cylinder /><strong>Заготовка</strong><span>Необработанная заготовка</span></button><button className="detail" type="button" onClick={() => onCommand('machine.setDetail')}><Disc3 /><strong>Деталь</strong><span>Готовая обработанная деталь</span></button></div></>
          : step === 2 ? <><div className="question-heading"><span>ШАГ 2 ИЗ 3</span><h3>Закрыть люк станка?</h3><p>После подтверждения PLC подаст команду закрытия люка.</p></div><div className="confirmation-actions"><button className="primary" type="button" onClick={() => onCommand('machine.acceptDoor')}>Закрыть люк</button><button type="button" onClick={() => onCommand('machine.rejectDoor')}>Не закрывать</button></div></>
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
        <div className="confirmation-cell-preview"><CellViewport layout={layout} state={state} robotCoordinatesRef={robotCoordinatesRef} selectedMachine={selectedMachine} cameraPreset="iso" controlsVisible={false} onMachineSelect={() => {}} /></div>
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
  onSetting: (command: string, key: 'pitchX' | 'pitchY', value: number) => boolean;
  className?: string;
}) {
  const [editContent, setEditContent] = useState<SlotType>('blank');
  const [editProductType, setEditProductType] = useState<ProductType>(1);
  useEffect(() => {
    if (editProductType > typeCount) setEditProductType(1);
  }, [editProductType, typeCount]);
  const state = magazine.state;
  const slots = magazine.slots;
  const productTypes = magazine.productTypes;
  const activeCount = Math.min(slots.length, state.rows * state.columns);
  const activeSlots = slots.slice(0, activeCount);
  const blanks = activeSlots.filter((slot) => slot === 'blank').length;
  const details = activeSlots.filter((slot) => slot === 'detail').length;
  const empty = activeCount - blanks - details;
  const statusText = state.error ? 'Авария магазина' : state.disablePending ? 'Отключение после выхода робота' : state.enabled ? 'Магазин включён' : 'Магазин отключён';
  const operationText = { NONE: 'Нет операции', PUT: 'Приём детали', TAKE: 'Выдача заготовки', CHANGE: 'Смена детали', RETURN_BLANK: 'Возврат заготовки' }[state.actualOperation];
  return <section className={`magazine-screen ${className ?? ''}`} onPointerDown={(event) => event.stopPropagation()}>
    <header className="magazine-screen-head"><div><span>ОБОРУДОВАНИЕ · МАГАЗИН {magazineNumber}</span><h2>Расширенное управление магазином</h2><p><Indicator active={state.enabled && !state.error} tone={state.error ? 'red' : state.disablePending ? 'amber' : 'green'} />{statusText}</p></div><button type="button" onClick={onClose} title="Закрыть"><X /></button></header>
    <div className="magazine-command-row">
      <button className={`magazine-power ${state.enabled ? 'enabled' : state.enableSequenceAllowed ? 'ready' : ''} ${(state.enabled || state.enableSequenceAllowed) ? '' : 'command-unavailable'}`} type="button" onClick={onToggleEnabled} aria-disabled={!(state.enabled || state.enableSequenceAllowed)}><Power /><span>{state.enabled ? 'Выключить магазин' : 'Включить магазин'}</span></button>
      <button type="button" onClick={() => onCommand('stop')}><AlertCircle /><span>Стоп</span></button>
      <button type="button" onClick={() => onCommand('reset')}><RotateCcw /><span>Сброс</span></button>
      <button className={state.fillAllowed ? '' : 'command-unavailable'} type="button" onClick={onFill} aria-disabled={!state.fillAllowed}><PackagePlus /><span>Заполнить кассету</span></button>
      <button className={`clear ${state.clearAllowed ? '' : 'command-unavailable'}`} type="button" onClick={onClear} aria-disabled={!state.clearAllowed}><Trash2 /><span>Очистить кассету</span></button>
    </div>
    <div className="magazine-screen-grid">
      <section className="magazine-map-panel"><div className="magazine-section-head"><div><span>СОДЕРЖИМОЕ</span><h3>Кассета · {state.columns} × {state.rows}</h3></div></div><div className="magazine-slot-editor"><div><span>Записывать в слот</span><div className="magazine-content-selector"><button className={editContent === 'empty' ? 'active' : ''} type="button" onClick={() => setEditContent('empty')}>Пусто</button><button className={editContent === 'blank' ? 'active' : ''} type="button" onClick={() => setEditContent('blank')}>Заготовка</button><button className={editContent === 'detail' ? 'active' : ''} type="button" onClick={() => setEditContent('detail')}>Изделие</button></div></div><ProductTypeSelector label="Тип изделия" value={editProductType} count={typeCount} disabled={editContent === 'empty' || !state.editAllowed} onChange={setEditProductType} /></div><div className="magazine-map"><MagazineMatrix slots={slots} productTypes={productTypes} columns={state.columns} activeCount={activeCount} onSlotClick={state.editAllowed ? (index) => onSlotApply(index, editContent, editProductType) : undefined} /></div><div className="magazine-map-footer"><span><i className="slot blank" />Заготовки <b>{blanks}</b></span><span><i className="slot detail" />Детали <b>{details}</b></span><span><i className="slot empty" />Пусто <b>{empty}</b></span><strong>{state.editAllowed ? 'Редактирование разрешено' : 'Редактирование доступно только при выключенном магазине'}</strong></div></section>
      <aside className="magazine-side-column">
        <section className="magazine-diagnostics"><div className="magazine-section-head"><div><span>ДИАГНОСТИКА</span><h3>{step}</h3></div></div><div className="diagnostic-list"><span>Текущая операция <b>{operationText}</b></span><span>TAKE / PUT / CHANGE <b>{state.canTake ? 'Да' : 'Нет'} / {state.canPut ? 'Да' : 'Нет'} / {state.canChange ? 'Да' : 'Нет'}</b></span><span>Робот готов к магазину <b>{state.enableCheckRobotReady ? 'Да' : 'Нет'}</b></span><span>Геометрия кассеты <b>{state.enableCheckGeometry ? 'Настроена' : 'Некорректна'}</b></span></div>{state.activeErrors.length ? <div className="magazine-error"><AlertCircle /><span>{state.activeErrors[0]}</span></div> : <div className="magazine-ok"><CheckCircle2 /><span>Активных ошибок нет</span></div>}</section>
        <section className="magazine-settings"><div className="magazine-section-head"><div><span>НАСТРОЙКИ</span><h3>Шаг кассеты</h3></div><Settings /></div><div className="magazine-settings-grid"><MagazineSettingField key={`${magazineNumber}-pitchX`} label="Шаг по X, мм" value={state.pitchX} min={1} max={5000} step={0.1} disabled={!state.pitchEditAllowed} onCommit={(value) => onSetting('magazine.pitchX', 'pitchX', value)} /><MagazineSettingField key={`${magazineNumber}-pitchY`} label="Шаг по Y, мм" value={state.pitchY} min={1} max={5000} step={0.1} disabled={!state.pitchEditAllowed} onCommit={(value) => onSetting('magazine.pitchY', 'pitchY', value)} /></div><p className="magazine-settings-note">Смещения Safe Z и Change Z настраиваются вместе с базовой точкой соответствующего магазина в редакторе точек робота.</p></section>
      </aside>
    </div>
  </section>;
}

function MagazineReadinessDialog({ magazineNumber, state, onClose }: {
  magazineNumber: number;
  state: CellState['magazines'][number]['state'];
  onClose: () => void;
}) {
  const checks: Array<[string, boolean, string]> = [
    ['Робот готов работать с магазином', state.enableCheckRobotReady, 'Проверьте интерфейс робота, таблицу точек и ошибки робота'],
    ['Робот освободил магазин', state.enableCheckRobotReleased, 'Дождитесь выхода робота из магазина'],
    ['Нет активных ошибок', state.enableCheckNoError, 'Устраните ошибку и выполните Reset'],
    ['Содержимое позволяет выполнить операцию', state.enableCheckContent, 'Заполните или отредактируйте кассету'],
    ['Геометрия кассеты настроена', state.enableCheckGeometry, 'Проверьте размеры матрицы и шаг между слотами'],
  ];
  const readyCount = checks.filter(([, ready]) => ready).length;
  return <div className="confirmation-overlay magazine-readiness-overlay" role="dialog" aria-modal="true" aria-label={`Готовность магазина ${magazineNumber}`} onPointerDown={(event) => event.stopPropagation()}>
    <section className="magazine-readiness-card">
      <header><div><span>ВВОД В АВТОМАТ</span><h2>Магазин {magazineNumber}</h2><p>{readyCount} из {checks.length} условий выполнено</p></div><button type="button" onClick={onClose}><X /></button></header>
      <div className="magazine-readiness-list">{checks.map(([title, ready, hint]) => <div className={ready ? 'ready' : 'blocked'} key={title}>{ready ? <CheckCircle2 /> : <AlertCircle />}<span><strong>{title}</strong><small>{ready ? 'Готово' : hint}</small></span></div>)}</div>
      <footer><button className="primary" type="button" onClick={onClose}>Закрыть</button></footer>
    </section>
  </div>;
}

function NumberField({ label, value, unit = 'мм', min = -3000, max = 18000, step = 10, labelPosition = 'inline', showSlider = true, onChange }: {
  label: string; value: number; unit?: string; min?: number; max?: number; step?: number; labelPosition?: 'inline' | 'above'; showSlider?: boolean; onChange: (value: number) => void;
}) {
  const progress = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  const rangeStyle = { '--range-progress': `${progress}%` } as CSSProperties;
  return <div className={`number-field ${labelPosition === 'above' ? 'number-field--stacked' : ''} ${showSlider ? '' : 'number-field--input-only'}`}>
    <span className="number-field-label">{label}</span>
    <div className="number-field-control">
      {showSlider && <input className="settings-range" style={rangeStyle} aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />}
      <div className="number-field-value"><input aria-label={`${label}, значение`} type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} /><em>{unit}</em></div>
    </div>
  </div>;
}

function PoseVectorField({ label, unit, value, min, max, onChange }: {
  label: string;
  unit: string;
  value: { x: number; y: number; z: number };
  min: number;
  max: number;
  onChange: (axis: 'x' | 'y' | 'z', value: number) => void;
}) {
  return <div className="pose-vector-field">
    <div className="pose-vector-heading"><span>{label}</span></div>
    <div className="pose-axis-grid">{(['x', 'y', 'z'] as const).map((axis) => <NumberField key={axis} label={axis.toUpperCase()} unit={unit} value={value[axis]} min={min} max={max} step={1} onChange={(nextValue) => onChange(axis, Math.min(max, Math.max(min, nextValue)))} />)}</div>
  </div>;
}

const PART_COLOR_PRESETS = ['#9fc3df', '#24689a', '#c0acd8', '#70489b', '#91cdc3', '#217a70', '#d29a42', '#c84d5a'];

function PartMaterialField({ label, value, onChange }: {
  label: string;
  value: PartMaterialLayout;
  onChange: (value: PartMaterialLayout) => void;
}) {
  const transparency = 1 - value.opacity;
  const transparencyStyle = { '--range-progress': `${Math.min(100, Math.max(0, (transparency / 0.9) * 100))}%` } as CSSProperties;
  return <div className="part-material-field">
    <div className="part-material-heading"><i style={{ background: value.color, opacity: value.opacity }} /><span>{label}</span><code>{value.color.toUpperCase()}</code></div>
    <div className="part-color-control"><input type="color" value={value.color} aria-label={`Цвет: ${label}`} onChange={(event) => onChange({ ...value, color: event.target.value })} /><span>Выбрать цвет</span></div>
    <div className="part-color-presets" aria-label={`Готовая палитра: ${label}`}>{PART_COLOR_PRESETS.map((color) => <button className={value.color.toLowerCase() === color ? 'active' : ''} key={color} type="button" title={color.toUpperCase()} aria-label={`Цвет ${color}`} style={{ background: color }} onClick={() => onChange({ ...value, color })} />)}</div>
    <label><span>Прозрачность</span><input className="settings-range" style={transparencyStyle} type="range" min={0} max={0.9} step={0.05} value={transparency} onChange={(event) => onChange({ ...value, opacity: 1 - Number(event.target.value) })} /><output>{Math.round(transparency * 100)}%</output></label>
  </div>;
}

function SettingsPanel({ layout, setLayout, fontPreset, onFontPreset, easterEggMode, driftSettings, visualEffects, onVisualEffectsChange, onDriftSettings, onEasterEggMode, onNextEasterEgg, onClose, className }: {
  layout: CellLayout;
  setLayout: (layout: CellLayout) => void;
  fontPreset: FontPreset;
  onFontPreset: (preset: FontPreset) => void;
  easterEggMode: EasterEggMode;
  driftSettings: DriftSettings;
  visualEffects: VisualEffectSettings;
  onVisualEffectsChange: (settings: VisualEffectSettings) => void;
  onDriftSettings: (settings: DriftSettings) => void;
  onEasterEggMode: (mode: EasterEggMode) => void;
  onNextEasterEgg: () => void;
  onClose: () => void;
  className?: string;
}) {
  const [activeTopic, setActiveTopic] = useState<SettingsTopic>('interface');
  const [topicDirection, setTopicDirection] = useState<1 | -1>(1);
  const [selectedEquipmentTargetId, setSelectedEquipmentTargetId] = useState<EquipmentSettingsTargetId>('machine-0');
  const change = (edit: (draft: CellLayout) => void) => { const next = structuredClone(layout); edit(next); setLayout(next); };
  const changeDrift = (edit: (draft: DriftSettings) => void) => { const next = structuredClone(driftSettings); edit(next); onDriftSettings(normalizeDriftSettings(next)); };
  const changeVisualEffects = (edit: (draft: VisualEffectSettings) => void) => { const next = structuredClone(visualEffects); edit(next); onVisualEffectsChange(normalizeVisualEffectSettings(next)); };
  const toggleVisualEffect = (key: 'cameraFocus' | 'alarmBeacons') => changeVisualEffects((draft) => { draft[key] = !draft[key]; });
  const selectedEquipmentTarget = EQUIPMENT_SETTINGS_TARGETS.find((target) => target.id === selectedEquipmentTargetId) ?? EQUIPMENT_SETTINGS_TARGETS[0];
  const magazinePitches = layout.staticMagazines.flatMap((magazine) => [magazine.pitchX, magazine.pitchY]);
  const maxPartDiameter = Math.max(10, Math.min(...magazinePitches) - 6);
  const requiredStaticMagazinePitch = Math.ceil(layout.partGeometry.diameter + 6);
  const activeTopicIndex = SETTINGS_TOPICS.findIndex((topic) => topic.id === activeTopic);
  const selectTopic = (topic: SettingsTopic) => {
    const nextIndex = SETTINGS_TOPICS.findIndex((item) => item.id === topic);
    if (nextIndex === activeTopicIndex) return;
    setTopicDirection(nextIndex > activeTopicIndex ? 1 : -1);
    setActiveTopic(topic);
  };
  return (
    <aside className={`side-panel settings-panel ${className ?? ''}`}>
      <div className="panel-heading"><div><span>НАСТРОЙКИ · СОХРАНЯЮТСЯ АВТОМАТИЧЕСКИ</span><h2>Визуализация</h2></div><button onClick={onClose} title="Закрыть"><ChevronRight /></button></div>
      <VercelTabs
        className="settings-topic-tabs"
        tabs={SETTINGS_TOPICS}
        activeTab={activeTopic}
        onTabChange={selectTopic}
        ariaLabel="Темы настроек"
        panelId="settings-topic-panel"
      />
      <div className="settings-topic-viewport">
        <div className={`settings-topic-content ${topicDirection > 0 ? 'from-right' : 'from-left'}`} id="settings-topic-panel" role="tabpanel" key={activeTopic}>
      {activeTopic === 'interface' && <section className="font-concept-settings"><h3>Шрифт интерфейса</h3>
        <p>Переключается сразу во всём HMI. Выбор сохранится после перезагрузки.</p>
        <label><span>Концепт</span><select value={fontPreset} onChange={(event) => onFontPreset(event.target.value as FontPreset)}>
          {FONT_PRESET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} — {option.description}</option>)}
        </select></label>
        <div className="font-concept-preview"><strong>Portal Robot</strong><span>Станок готов к работе · 12:48</span></div>
      </section>}
      {activeTopic === 'scene' && <section className="scene-effects-settings"><h3>Индикация 3D-сцены</h3>
        <p>Технологические эффекты читают только живые данные PLC и никак не участвуют в управлении; фокус камеры работает при выборе оборудования.</p>
        <label className="toggle-row"><span><b>Фокус камеры</b><small>Плавный ракурс после выбора станка или магазина</small></span><input type="checkbox" checked={visualEffects.cameraFocus} onChange={() => toggleVisualEffect('cameraFocus')} /><i /></label>
        <label className="toggle-row"><span><b>Граница ячейки при общей аварии</b><small>Красная пульсация по периметру ячейки</small></span><input type="checkbox" checked={visualEffects.alarmBeacons} onChange={() => toggleVisualEffect('alarmBeacons')} /><i /></label>
        <label className="range-field scene-enclosure-opacity"><span><b>Прозрачность ограждений</b><output>{Math.round((1 - visualEffects.enclosureOpacity) * 100)}%</output></span><input className="settings-range" type="range" min={0} max={0.9} step={0.05} value={1 - visualEffects.enclosureOpacity} onChange={(event) => changeVisualEffects((draft) => { draft.enclosureOpacity = 1 - Number(event.target.value); })} /></label>
        <p className="panel-note">Меняет сетку, жёлтую раму и дверные полотна. Замки и крепёж остаются непрозрачными.</p>
      </section>}
      {activeTopic === 'scene' && <section className="easter-egg-settings"><h3>Производственный бардак</h3>
        <p>Пасхалки живут только в 3D и никак не влияют на PLC, команды и телеметрию.</p>
        <label><span>Сценарий</span><select value={easterEggMode} onChange={(event) => onEasterEggMode(event.target.value as EasterEggMode)}>
          {EASTER_EGG_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <div className="easter-egg-description"><Eye size={17} /><span>{EASTER_EGG_OPTIONS.find((option) => option.value === easterEggMode)?.description}</span></div>
        <button className="easter-egg-next" type="button" disabled={easterEggMode === 'off'} onClick={onNextEasterEgg}><RotateCcw size={16} />Следующий беспредел</button>
      </section>}
      {activeTopic === 'scene' && easterEggMode === 'drift' && <section className="drift-settings"><h3>Дрифт-тележка</h3>
        <p>Коэффициенты применяются сразу. PLC этого цирка не видит.</p>
        <div className="drift-settings-selects">
          <label><span>Вид камеры</span><select value={driftSettings.cameraMode} onChange={(event) => changeDrift((draft) => { draft.cameraMode = event.target.value as DriftSettings['cameraMode']; })}><option value="driver">Водитель · тележка впереди</option><option value="chase">Погоня · тележка целиком</option><option value="high">Высокая камера</option></select></label>
          <label><span>Окраска тележки</span><select value={driftSettings.cartStyle} onChange={(event) => changeDrift((draft) => { draft.cartStyle = event.target.value as DriftSettings['cartStyle']; })}><option value="factory">Заводская синяя</option><option value="hazard">Аварийная оранжевая</option><option value="night">Ночная фиолетовая</option></select></label>
        </div>
        <div className="field-grid drift-coefficients">
          <NumberField label="Мощность двигателя" labelPosition="above" unit="%" value={Math.round(driftSettings.enginePower * 100)} min={50} max={250} step={5} onChange={(value) => changeDrift((draft) => { draft.enginePower = value / 100; })} />
          <NumberField label="Масса и инерция" labelPosition="above" unit="%" value={Math.round(driftSettings.mass * 100)} min={45} max={200} step={5} onChange={(value) => changeDrift((draft) => { draft.mass = value / 100; })} />
          <NumberField label="Скорость руля" labelPosition="above" unit="%" value={Math.round(driftSettings.steeringResponse * 100)} min={50} max={200} step={5} onChange={(value) => changeDrift((draft) => { draft.steeringResponse = value / 100; })} />
          <NumberField label="Зацеп передней оси" labelPosition="above" unit="%" value={Math.round(driftSettings.frontGrip * 100)} min={50} max={160} step={5} onChange={(value) => changeDrift((draft) => { draft.frontGrip = value / 100; })} />
          <NumberField label="Зацеп задней оси" labelPosition="above" unit="%" value={Math.round(driftSettings.rearGrip * 100)} min={35} max={160} step={5} onChange={(value) => changeDrift((draft) => { draft.rearGrip = value / 100; })} />
        </div>
        <button className="easter-egg-next" type="button" onClick={() => onDriftSettings({ ...DEFAULT_DRIFT_SETTINGS })}><RotateCcw size={16} />Сбросить коэффициенты</button>
      </section>}
      {activeTopic === 'scene' && <section><h3>Система координат</h3><div className="field-grid">
        <NumberField label="Начало X" labelPosition="above" value={layout.coordinate.origin.x} min={-5000} max={5000} onChange={(v) => change((d) => { d.coordinate.origin.x = v; })} />
        <NumberField label="Начало Y" labelPosition="above" value={layout.coordinate.origin.y} min={-5000} max={5000} onChange={(v) => change((d) => { d.coordinate.origin.y = v; })} />
        <NumberField label="Начало Z" labelPosition="above" value={layout.coordinate.origin.z} min={-3000} max={3000} onChange={(v) => change((d) => { d.coordinate.origin.z = v; })} />
      </div><div className="axis-directions">{(['x', 'y', 'z'] as const).map((axis) => <label data-axis={axis} key={axis}><span>Ось {axis.toUpperCase()}</span><select value={layout.coordinate.direction[axis]} onChange={(e) => change((d) => { d.coordinate.direction[axis] = Number(e.target.value) as 1 | -1; })}><option value={1}>Прямая</option><option value={-1}>Обратная</option></select></label>)}</div></section>}
      {activeTopic === 'equipment' && <section className="equipment-selector-section"><h3>Настройки оборудования</h3>
        <label className="settings-object-selector"><span>Оборудование</span><select value={selectedEquipmentTargetId} onChange={(event) => setSelectedEquipmentTargetId(event.target.value as EquipmentSettingsTargetId)}>
          <optgroup label="Станки">
            {EQUIPMENT_SETTINGS_TARGETS.filter((target) => target.kind === 'machine-common' || target.kind === 'machine').map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
          </optgroup>
          <optgroup label="Магазины">
            {EQUIPMENT_SETTINGS_TARGETS.filter((target) => target.kind === 'magazine').map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
          </optgroup>
          <optgroup label="Портал">
            {EQUIPMENT_SETTINGS_TARGETS.filter((target) => target.kind === 'portal').map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
          </optgroup>
        </select></label>
      </section>}
      {activeTopic === 'equipment' && selectedEquipmentTarget.kind === 'machine-common' && <section><h3>Общие параметры станков</h3><p>Размеры корпуса без стружечного конвейера, выступающего пульта и сигнальной колонны.</p><div className="field-grid">
        <NumberField label="Ширина X" labelPosition="above" value={layout.machine.sizeX} min={1000} max={5000} onChange={(v) => change((d) => { d.machine.sizeX = v; })} />
        <NumberField label="Глубина Y" labelPosition="above" value={layout.machine.sizeY} min={800} max={3500} onChange={(v) => change((d) => { d.machine.sizeY = v; })} />
        <NumberField label="Высота Z" labelPosition="above" value={layout.machine.sizeZ} min={800} max={3500} onChange={(v) => change((d) => { d.machine.sizeZ = v; })} />
        <NumberField label="Ход двери" labelPosition="above" value={layout.machine.doorTravel} min={100} max={2500} onChange={(v) => change((d) => { d.machine.doorTravel = v; })} />
      </div></section>}
      {activeTopic === 'equipment' && selectedEquipmentTarget.kind === 'machine' && <section><h3>{selectedEquipmentTarget.label}</h3><div className="field-grid">
        <NumberField label="Позиция X" labelPosition="above" value={layout.machine.machines[selectedEquipmentTarget.index].position.x} onChange={(v) => change((d) => { d.machine.machines[selectedEquipmentTarget.index].position.x = v; })} />
        <NumberField label="Позиция Y" labelPosition="above" value={layout.machine.machines[selectedEquipmentTarget.index].position.y} onChange={(v) => change((d) => { d.machine.machines[selectedEquipmentTarget.index].position.y = v; })} />
      </div></section>}
      {activeTopic === 'product' && <section className="part-visual-settings"><h3>Единая геометрия изделия</h3><div className="field-grid">
        <NumberField label="Диаметр изделия" labelPosition="above" value={layout.partGeometry.diameter} min={10} max={maxPartDiameter} step={1} onChange={(v) => change((d) => { d.partGeometry.diameter = Math.min(maxPartDiameter, Math.max(10, v)); })} />
        <NumberField label="Длина изделия" labelPosition="above" value={layout.partGeometry.length} min={10} max={250} step={1} onChange={(v) => change((d) => { d.partGeometry.length = Math.min(250, Math.max(10, v)); })} />
      </div></section>}
      {activeTopic === 'product' && <section className="part-visual-settings"><h3>Положение изделия в захвате</h3><div className="payload-pose-list"><div className="payload-pose-editor">
        <strong>Изделие</strong>
        <PoseVectorField label="Смещение изделия" unit="мм" value={layout.gripperPayloadPose.offset} min={-200} max={200} onChange={(axis, value) => change((d) => { d.gripperPayloadPose.offset[axis] = value; })} />
        <PoseVectorField label="Поворот изделия" unit="градусы" value={layout.gripperPayloadPose.rotationDeg} min={-180} max={180} onChange={(axis, value) => { change((d) => { d.gripperPayloadPose.rotationDeg[axis] = value; }); }} />
      </div></div></section>}
      {activeTopic === 'product' && <section className="part-palette-settings"><h3>Палитра изделий · 6 материалов</h3><div className="part-material-grid">
        {layout.productPartMaterials.flatMap((materials, index) => ([
          <PartMaterialField key={`${index}-blank`} label={`Тип ${index + 1} · заготовка`} value={materials.blank} onChange={(value) => change((d) => { d.productPartMaterials[index].blank = value; })} />,
          <PartMaterialField key={`${index}-detail`} label={`Тип ${index + 1} · деталь`} value={materials.detail} onChange={(value) => change((d) => { d.productPartMaterials[index].detail = value; })} />,
        ]))}
      </div></section>}
      {activeTopic === 'equipment' && selectedEquipmentTarget.kind === 'portal' && <section><h3>Портал</h3><div className="field-grid">
        <NumberField label="Позиция X" labelPosition="above" value={layout.portal.position.x} min={-3000} max={3000} onChange={(v) => change((d) => { d.portal.position.x = v; })} />
        <NumberField label="Позиция Y" labelPosition="above" value={layout.portal.position.y} min={0} max={5000} onChange={(v) => change((d) => { d.portal.position.y = v; })} />
        <NumberField label="Ход каретки X" labelPosition="above" value={layout.portal.lengthX} min={8000} max={18000} onChange={(v) => change((d) => { d.portal.lengthX = v; })} />
        <NumberField label="Просвет между опорами Y" labelPosition="above" value={layout.portal.widthY + 2 * getPortalRailClearanceMm(layout.portal.frameDepthY, layout.robot.zColumnWidth) - layout.portal.supportSize} min={100 + 2 * getPortalRailClearanceMm(layout.portal.frameDepthY, layout.robot.zColumnWidth) - layout.portal.supportSize} max={4000} onChange={(v) => change((d) => { d.portal.widthY = v + d.portal.supportSize - 2 * getPortalRailClearanceMm(d.portal.frameDepthY, d.robot.zColumnWidth); })} />
        <NumberField label="Высота опор" labelPosition="above" value={getPortalSupportHeightMm(layout.portal)} min={1200 - PORTAL_MOUNTING.supportCapHeight} max={4000 - PORTAL_MOUNTING.supportCapHeight} step={1} onChange={(v) => change((d) => { d.portal.frameBottomZ = v + PORTAL_MOUNTING.supportCapHeight; })} />
      </div></section>}
      {activeTopic === 'equipment' && selectedEquipmentTarget.kind === 'magazine' && <section><h3>Статичный {selectedEquipmentTarget.label} · 12 × 10</h3>
        <p>Одна неподвижно установленная кассета с единой матрицей на 120 изделий. Диаметр и глубина гнёзд автоматически подстраиваются под геометрию изделия; приводов у магазина нет.</p>
        <div className="field-grid">
          <NumberField label="Позиция X" labelPosition="above" value={layout.staticMagazines[selectedEquipmentTarget.index].position.x} min={0} max={15000} onChange={(v) => change((d) => { d.staticMagazines[selectedEquipmentTarget.index].position.x = v; })} />
          <NumberField label="Позиция Y" labelPosition="above" value={layout.staticMagazines[selectedEquipmentTarget.index].position.y} min={0} max={5000} onChange={(v) => change((d) => { d.staticMagazines[selectedEquipmentTarget.index].position.y = v; })} />
          <NumberField label="Высота поддона Z" labelPosition="above" value={layout.staticMagazines[selectedEquipmentTarget.index].workingHeight} min={400} max={1800} onChange={(v) => change((d) => { d.staticMagazines[selectedEquipmentTarget.index].workingHeight = v; })} />
          <NumberField label="Шаг изделий X" labelPosition="above" showSlider={false} value={layout.staticMagazines[selectedEquipmentTarget.index].pitchX} min={requiredStaticMagazinePitch} max={200} onChange={(v) => change((d) => { d.staticMagazines[selectedEquipmentTarget.index].pitchX = Math.max(requiredStaticMagazinePitch, v); })} />
          <NumberField label="Шаг изделий Y" labelPosition="above" showSlider={false} value={layout.staticMagazines[selectedEquipmentTarget.index].pitchY} min={requiredStaticMagazinePitch} max={200} onChange={(v) => change((d) => { d.staticMagazines[selectedEquipmentTarget.index].pitchY = Math.max(requiredStaticMagazinePitch, v); })} />
        </div>
      </section>}
      {activeTopic === 'equipment' && <div className="panel-actions"><button onClick={() => setLayout(cloneLayout())}><RotateCcw size={16} />Сбросить геометрию</button></div>}
        </div>
      </div>
    </aside>
  );
}

function ManualPanel({ state, layout, setState, machineIndex, setMachineIndex, onClose, plcDataEnabled, onPlcDataChange, className }: {
  state: CellState; layout: CellLayout; setState: Dispatch<SetStateAction<CellState>>; machineIndex: number; setMachineIndex: (index: number) => void; onClose: () => void;
  plcDataEnabled: boolean; onPlcDataChange: (enabled: boolean) => void; className?: string;
}) {
  const [manualMagazine, setManualMagazine] = useState(0);
  const [activeManualTopic, setActiveManualTopic] = useState<ManualTopic>('robot');
  const [topicDirection, setTopicDirection] = useState<1 | -1>(1);
  const updateRobot = (patch: Partial<CellState['robot']>) => setState({ ...state, robot: { ...state.robot, ...patch } });
  const updateMachine = (patch: Partial<CellState['machines'][number]>) => { const machines = [...state.machines]; machines[machineIndex] = { ...machines[machineIndex], ...patch }; setState({ ...state, machines }); };
  const travelLimits = getRobotTravelLimits(layout);
  const activeTopicIndex = MANUAL_TOPICS.findIndex((topic) => topic.id === activeManualTopic);
  const selectManualTopic = (topic: ManualTopic) => {
    const nextIndex = MANUAL_TOPICS.findIndex((item) => item.id === topic);
    if (nextIndex === activeTopicIndex) return;
    setTopicDirection(nextIndex > activeTopicIndex ? 1 : -1);
    setActiveManualTopic(topic);
  };
  return <aside className={`side-panel manual-panel ${className ?? ''}`}>
    <div className="panel-heading"><div><span>ТЕСТ МОДЕЛИ</span><h2>Ручное управление</h2></div><button onClick={onClose} title="Закрыть"><ChevronRight /></button></div>
    <VercelTabs className="settings-topic-tabs manual-topic-tabs" tabs={MANUAL_TOPICS} activeTab={activeManualTopic} onTabChange={selectManualTopic} ariaLabel="Темы ручного управления" panelId="manual-topic-panel" />
    <div className="settings-topic-viewport manual-topic-viewport">
      <div className={`settings-topic-content manual-topic-content ${topicDirection > 0 ? 'from-right' : 'from-left'}`} id="manual-topic-panel" role="tabpanel" key={activeManualTopic}>
        {activeManualTopic === 'enclosure' && <EnclosureManualControl doors={state.enclosureDoors} buttonStations={state.buttonStations} plcDataEnabled={plcDataEnabled} onChange={(id, patch) => setState({
          ...state,
          enclosureDoors: { ...state.enclosureDoors, [id]: { ...state.enclosureDoors[id], ...patch } },
        })} onButtonStationChange={(id, patch) => setState({
          ...state,
          buttonStations: { ...state.buttonStations, [id]: { ...state.buttonStations[id], ...patch } },
        })} />}
        {activeManualTopic === 'cabinets' && <><ControlCabinetManualControl
          cabinets={state.controlCabinets ?? DEFAULT_CONTROL_CABINETS}
          plcDataEnabled={plcDataEnabled}
          onFrontChange={(signal, pressed) => {
            if (plcDataEnabled) return;
            setState((current) => {
              const cabinets = current.controlCabinets ?? DEFAULT_CONTROL_CABINETS;
              return { ...current, controlCabinets: { ...cabinets, front: { ...cabinets.front, [signal]: pressed } } };
            });
          }}
          onRearChange={(pressed) => {
            if (plcDataEnabled) return;
            setState((current) => ({
              ...current,
              controlCabinets: {
                ...(current.controlCabinets ?? DEFAULT_CONTROL_CABINETS),
                rear: {
                  ...DEFAULT_CONTROL_CABINETS.rear,
                  ...current.controlCabinets?.rear,
                  emergencyStopPressed: pressed,
                },
              },
            }));
          }}
          onPhaseRelayFaultChange={(phaseRelayFault) => setState((current) => ({
            ...current,
            controlCabinets: {
              ...(current.controlCabinets ?? DEFAULT_CONTROL_CABINETS),
              rear: { ...DEFAULT_CONTROL_CABINETS.rear, ...current.controlCabinets?.rear, phaseRelayFault },
            },
          }))}
          onLowPressureChange={(lowPressure) => setState((current) => ({
            ...current,
            controlCabinets: {
              ...(current.controlCabinets ?? DEFAULT_CONTROL_CABINETS),
              airPreparation: { lowPressure },
            },
          }))}
        />
        <MpgManualControl
          state={state.mpgPendant ?? DEFAULT_MPG_PENDANT}
          disabled={plcDataEnabled}
          onChange={(patch) => {
            if (plcDataEnabled) return;
            setState((current) => ({
              ...current,
              mpgPendant: { ...(current.mpgPendant ?? DEFAULT_MPG_PENDANT), ...patch },
            }));
          }}
        /></>}
        {activeManualTopic === 'robot' && <>
          <section className="robot-data-source"><h3>Источник данных ячейки</h3><ToggleSwitch label="Получать все состояния из OPC UA" checked={plcDataEnabled} onChange={onPlcDataChange} /></section>
          <section><h3>Локальная проверка аварии</h3>
            <ToggleSwitch label="Авария робота" checked={state.robot.error} disabled={plcDataEnabled} onChange={(value) => updateRobot({ error: value })} />
            <p className="panel-note">Работает только при отключённом источнике OPC UA.</p>
          </section>
          <section><h3>Координаты робота</h3>{(['x', 'y', 'z'] as const).map((axis) => {
            const progress = (state.robot[axis] / travelLimits[axis]) * 100;
            return <label className="range-field" key={axis}><span>{axis.toUpperCase()} <b>{state.robot[axis].toFixed(0)} / {travelLimits[axis].toFixed(0)} мм</b></span><input className="settings-range manual-range" style={{ '--range-progress': `${Math.min(100, Math.max(0, progress))}%` } as CSSProperties} disabled={plcDataEnabled} type="range" min={0} max={travelLimits[axis]} step={10} value={state.robot[axis]} onChange={(e) => updateRobot({ [axis]: Number(e.target.value) })} /></label>;
          })}</section>
          <section><h3>Двойной захват</h3>
            <ToggleSwitch label="Захват 1 закрыт (заготовка)" checked={state.robot.gripper1Closed} disabled={plcDataEnabled} onChange={(value) => updateRobot({ gripper1Closed: value })} />
            <ToggleSwitch label="Захват 2 закрыт (деталь)" checked={state.robot.gripper2Closed} disabled={plcDataEnabled} onChange={(value) => updateRobot({ gripper2Closed: value })} />
            <SegmentedControl
              className="manual-orientation-selector"
              value={state.robot.rotatedToBlank ? 'blank' : state.robot.rotatedToDetail ? 'detail' : ''}
              options={[{ value: 'blank', label: 'К заготовке', className: 'orientation-blank' }, { value: 'detail', label: 'К детали', className: 'orientation-detail' }]}
              disabled={plcDataEnabled}
              onChange={(nextValue) => updateRobot(nextValue === 'blank' ? { rotatedToBlank: true, rotatedToDetail: false } : { rotatedToBlank: false, rotatedToDetail: true })}
              ariaLabel="Ориентация двойного захвата"
            />
          </section>
        </>}
        {activeManualTopic === 'machines' && <section><h3>Механизмы станка</h3><SegmentedControl
          className="manual-machine-selector three"
          value={String(machineIndex)}
          options={state.machines.map((_, index) => ({ value: String(index), label: `Станок ${index + 1}`, className: `machine-${index + 1}` }))}
          onChange={(nextValue) => setMachineIndex(Number(nextValue))}
          ariaLabel="Выбор станка"
        />
          <ToggleSwitch label="Операторская дверь открыта" checked={state.machines[machineIndex].doorOpen} disabled={plcDataEnabled} onChange={(v) => updateMachine({ doorOpen: v, doorClosed: !v, canAcceptService: !v && state.machines[machineIndex].serviceRequired })} />
          <ToggleSwitch label="Роботный люк открыт" checked={state.machines[machineIndex].hatchOpen} disabled={plcDataEnabled} onChange={(v) => updateMachine({ hatchOpen: v, hatchClosed: !v })} />
          <ToggleSwitch label="Патрон открыт" checked={state.machines[machineIndex].chuckOpen} disabled={plcDataEnabled} onChange={(v) => updateMachine({ chuckOpen: v, chuckClosed: !v })} />
          <ToggleSwitch label="Изделие в патроне" checked={state.machines[machineIndex].partPresent} disabled={plcDataEnabled} onChange={(v) => updateMachine({ partPresent: v, partState: v ? 'LOADED' : 'EMPTY', partType: v ? 'BLANK' : 'UNKNOWN' })} />
          <ToggleSwitch
            label="Авария станка"
            checked={state.machines[machineIndex].mode === 'error' || state.machines[machineIndex].alarm || state.machines[machineIndex].activeErrors.length > 0}
            disabled={plcDataEnabled}
            onChange={(value) => updateMachine(value
              ? { alarm: true, mode: 'error', currentStep: 'Локальная авария станка', activeErrors: ['Локальная авария станка'] }
              : { alarm: false, mode: 'enabled', currentStep: 'Ожидает загрузку', activeErrors: [] })}
          />
          <p className="panel-note">Локальная авария меняет только модель HMI и не отправляет команду в PLC.</p>
        </section>}
        {activeManualTopic === 'magazines' && <section><h3>Локальная проверка статичных магазинов</h3><SegmentedControl
          className="manual-magazine-selector"
          value={String(manualMagazine)}
          options={state.magazines.map((_, index) => ({ value: String(index), label: `Магазин ${index + 1}`, className: `magazine-${index + 1}` }))}
          onChange={(nextValue) => setManualMagazine(Number(nextValue))}
          ariaLabel="Выбор магазина"
        />
          <ToggleSwitch
            label="Авария магазина"
            checked={state.magazines[manualMagazine].state.error || state.magazines[manualMagazine].state.activeErrors.length > 0}
            disabled={plcDataEnabled}
            onChange={(value) => {
              const magazines = structuredClone(state.magazines);
              magazines[manualMagazine].state = {
                ...magazines[manualMagazine].state,
                error: value,
                activeErrors: value ? ['Локальная авария магазина'] : [],
              };
              setState({ ...state, magazines });
            }}
          />
          <p className="panel-note">Локальная авария меняет только модель HMI и не отправляет команду в PLC.</p>
          <MagazineMatrix slots={state.magazines[manualMagazine].slots} columns={10} onSlotClick={plcDataEnabled ? undefined : (index) => { const values: SlotType[] = ['empty', 'blank', 'detail']; const magazines = structuredClone(state.magazines); const slots = magazines[manualMagazine].slots; slots[index] = values[(values.indexOf(slots[index]) + 1) % values.length]; setState({ ...state, magazines }); }} />
        </section>}
      </div>
    </div>
  </aside>;
}

export function App() {
  const [layout, setLayout] = useState<CellLayout>(loadLayout);
  const [fontPreset, setFontPreset] = useState<FontPreset>(loadFontPreset);
  const [easterEggMode, setEasterEggMode] = useState<EasterEggMode>(loadEasterEggMode);
  const [driftSettings, setDriftSettings] = useState<DriftSettings>(loadDriftSettings);
  const [visualEffects, setVisualEffects] = useState<VisualEffectSettings>(loadVisualEffects);
  const [easterEggRevision, setEasterEggRevision] = useState(0);
  const [cellState, setCellState] = useState<CellState>(cloneState);
  const [page, setPage] = useState<Page>('monitoring');
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [bottomSection, setBottomSection] = useState<BottomSection | null>(null);
  const [matrixQuickOpen, setMatrixQuickOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AppUser | null>(null);
  const [shiftSummary, setShiftSummary] = useState<StatisticsSummary | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [guestView, setGuestView] = useState(false);
  const [guestWarningVisible, setGuestWarningVisible] = useState(false);
  const [guestRestrictionRevision, setGuestRestrictionRevision] = useState(0);
  const [topMenuOpen, setTopMenuOpen] = useState(false);
  const [topMenuSection, setTopMenuSection] = useState<TopMenuSection>('root');
  const [selectedMachine, setSelectedMachine] = useState<number | null>(null);
  const [selectedMagazine, setSelectedMagazine] = useState(0);
  const [magazineReadinessOpen, setMagazineReadinessOpen] = useState<number | null>(null);
  const [confirmationMachine, setConfirmationMachine] = useState<number | null>(null);
  const [confirmationEntered, setConfirmationEntered] = useState(false);
  const [machineMechanism, setMachineMechanism] = useState<MachineMechanism | null>(null);
  const [pendingMachineMotion, setPendingMachineMotion] = useState<MachineMotionRequest | null>(null);
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
  const [operatorMetricsVisible, setOperatorMetricsVisible] = useState(true);
  const workspacePointerRef = useRef<{ pointerId: number; x: number; y: number; eligible: boolean } | null>(null);
  const refreshShiftSummaryRef = useRef<(() => void) | null>(null);
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
  const guestWarningTimerRef = useRef(0);
  const lastReceivedEventIdentityRef = useRef('');
  const isPlcOnline = plcConnection.status === 'connected' || plcConnection.status === 'degraded';
  const usePlcData = isPlcOnline && plcDataEnabled;
  const simulationAccelerationEnabled = readBool(faultSimulationValues, 'xSimulationAccelerationEnable');
  const simulationAccelerationActive = readBool(faultSimulationValues, 'xSimulationAccelerationActive');
  const simulationAccelerationAllowed = readBool(faultSimulationValues, 'xSimulationAccelerationChangeAllowed');
  const simulationAccelerationPending = readBool(faultSimulationValues, 'xSimulationAccelerationPending');
  const simulationAccelerationBusy = readBool(faultSimulationValues, 'xSimulationAccelerationBusy');
  const simulationAccelerationError = readBool(faultSimulationValues, 'xSimulationAccelerationError');
  const simulationTimeFactor = Math.max(1, Math.min(100, Math.round(readNumber(
    faultSimulationValues,
    'uiSimulationTimeFactor',
    1,
  ))));
  const simulationTimeFactorApplied = Math.max(1, Math.min(100, Math.round(readNumber(
    faultSimulationValues,
    'uiSimulationTimeFactorApplied',
    1,
  ))));
  const simulationControlsAllowed = usePlcData
    && simulationAccelerationAllowed
    && !plcRuntime.modbusMode;
  useEffect(() => {
    let active = true;
    authApi.session().then((session) => {
      if (!active) return;
      setAuthUser(session.authenticated ? session.user : null);
      setAuthError(session.error ?? '');
    }).catch((error) => {
      if (active) setAuthError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (active) setAuthLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!authUser) {
      setShiftSummary(null);
      refreshShiftSummaryRef.current = null;
      return;
    }
    let active = true;
    let refreshTimer = 0;
    const loadShiftSummary = () => {
      void statisticsApi.summary({ preset: 'current-shift', userId: authUser.id })
        .then((summary) => { if (active) setShiftSummary(summary); })
        .catch(() => { if (active) setShiftSummary(null); });
    };
    const scheduleShiftSummaryRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(loadShiftSummary, 500);
    };
    refreshShiftSummaryRef.current = scheduleShiftSummaryRefresh;
    loadShiftSummary();
    const intervalId = window.setInterval(loadShiftSummary, 30_000);
    return () => {
      active = false;
      window.clearTimeout(refreshTimer);
      window.clearInterval(intervalId);
      if (refreshShiftSummaryRef.current === scheduleShiftSummaryRefresh) refreshShiftSummaryRef.current = null;
    };
  }, [authUser?.id, authUser?.role]);

  const login = async (username: string, password: string) => {
    setAuthSubmitting(true);
    setAuthError('');
    try {
      const session = await authApi.login(username, password);
      if (!session.authenticated || !session.user) throw new Error('Gateway не вернул пользователя после входа');
      setAuthUser(session.user);
      setGuestView(false);
      setPage('monitoring');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthSubmitting(false);
      setAuthLoading(false);
    }
  };
  const logout = async () => {
    try { await authApi.logout(); }
    catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error));
      setProfileOpen(false);
      return;
    }
    plcClient.current?.close();
    setAuthUser(null);
    setGuestView(false);
    setProfileOpen(false);
    setPage('monitoring');
  };
  const showGuestRestriction = () => {
    window.clearTimeout(guestWarningTimerRef.current);
    setGuestRestrictionRevision((revision) => revision + 1);
    setGuestWarningVisible(true);
    guestWarningTimerRef.current = window.setTimeout(() => setGuestWarningVisible(false), 3600);
  };
  const sendPlcCommand = (command: PlcCommand) => {
    if (!authUser) {
      showGuestRestriction();
      return false;
    }
    return plcClient.current?.send(command) ?? false;
  };
  const rejectGuestAction = () => {
    if (authUser) return false;
    showGuestRestriction();
    return true;
  };
  useEffect(() => () => window.clearTimeout(guestWarningTimerRef.current), []);
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
  const sendMagazineCommand = (index: number, action: string, value?: boolean) => {
    if (rejectGuestAction()) return;
    if (usePlcData) sendPlcCommand({ command: `magazine.${action}`, magazine: index + 1, ...(value === undefined ? {} : { value }) });
  };
  const toggleMagazineEnabled = (index = selectedMagazine) => {
    if (rejectGuestAction()) return;
    const state = cellState.magazines[index].state;
    if (!state.enabled) {
      if (!state.enableSequenceAllowed) {
        setMagazineReadinessOpen(index);
        return;
      }
      if (usePlcData) sendMagazineCommand(index, 'enable');
      else updateMagazineState(index, { enabled: true, ready: true });
      return;
    }
    if (!usePlcData) {
      updateMagazineState(index, { enabled: false, ready: false, disablePending: false });
      return;
    }
    sendMagazineCommand(index, 'disable');
  };
  const fillMagazine = (index = selectedMagazine) => {
    if (rejectGuestAction()) return;
    const state = cellState.magazines[index].state;
    if (usePlcData) {
      sendMagazineCommand(index, 'fill');
      return;
    }
    if (!state.editAllowed) return;
    setCellState((current) => {
      const magazines = structuredClone(current.magazines);
      magazines[index].slots = magazines[index].slots.map(() => 'blank');
      return { ...current, magazines };
    });
  };
  const clearMagazine = (index = selectedMagazine) => {
    if (rejectGuestAction()) return;
    if (usePlcData) {
      sendMagazineCommand(index, 'clear');
      return;
    }
    if (!cellState.magazines[index].state.editAllowed) return;
    setCellState((current) => {
      const magazines = structuredClone(current.magazines);
      magazines[index].slots = magazines[index].slots.map(() => 'empty');
      return { ...current, magazines };
    });
  };
  const cycleMagazineSlot = (slotIndex: number, index = selectedMagazine) => {
    if (rejectGuestAction()) return;
    const magazine = cellState.magazines[index];
    const current = magazine.slots[slotIndex];
    const next: SlotType = current === 'empty' ? 'blank' : current === 'blank' ? 'detail' : 'empty';
    const productType = magazine.productTypes[slotIndex] ?? 1;
    if (usePlcData) {
      sendPlcCommand({ command: 'magazine.setSlot', magazine: index + 1, slot: slotIndex + 1, content: next === 'empty' ? 0 : next === 'blank' ? 1 : 2, productType });
      return;
    }
    if (!magazine.state.editAllowed) return;
    setCellState((current) => {
      const magazines = structuredClone(current.magazines);
      const slots = magazines[index].slots;
      slots[slotIndex] = next;
      return { ...current, magazines };
    });
  };
  const applyMagazineSlot = (slotIndex: number, content: SlotType, productType: ProductType, index = selectedMagazine) => {
    if (rejectGuestAction()) return;
    const state = cellState.magazines[index].state;
    if (!state.editAllowed) return;
    if (usePlcData) {
      sendPlcCommand({ command: 'magazine.setSlot', magazine: index + 1, slot: slotIndex + 1, content: content === 'empty' ? 0 : content === 'blank' ? 1 : 2, productType });
      return;
    }
    setCellState((current) => {
      const magazines = structuredClone(current.magazines);
      magazines[index].slots[slotIndex] = content;
      magazines[index].productTypes[slotIndex] = productType;
      return { ...current, magazines };
    });
  };
  const changeMachineProductType = (index: number, productType: ProductType) => {
    if (rejectGuestAction()) return;
    if (usePlcData) {
      sendPlcCommand({ command: 'multi.machineType', machine: index + 1, value: productType });
      return;
    }
    updateMachine(index, { productType });
  };
  const updateMagazineSetting = (command: string, key: 'pitchX' | 'pitchY', value: number): boolean => {
    if (rejectGuestAction()) return false;
    if (!Number.isFinite(value)) return false;
    if (!cellState.magazines[selectedMagazine].state.editAllowed) return false;
    if (!cellState.magazines[selectedMagazine].state.pitchEditAllowed) return false;
    if (usePlcData) return sendPlcCommand({ command, magazine: selectedMagazine + 1, value });
    updateMagazineState(0, { [key]: value });
    updateMagazineState(1, { [key]: value });
    return true;
  };
  const toggleMachineEnabled = (index: number) => {
    if (rejectGuestAction()) return;
    const machine = cellState.machines[index];
    if (usePlcData) {
      if (machine.disablePending) {
        sendPlcCommand({ command: 'machine.enable', machine: index + 1 });
      } else if (machine.enabled) {
        sendPlcCommand({ command: 'machine.disable', machine: index + 1 });
      } else {
        sendPlcCommand({ command: 'machine.enable', machine: index + 1 });
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
    if (rejectGuestAction()) return;
    if (confirmationMachine === null) return;
    if (usePlcData) {
      sendPlcCommand({ command, machine: confirmationMachine + 1 });
      return;
    }
    if (command === 'machine.setBlank') updateMachine(confirmationMachine, { plcState: 3, currentStep: 'Ожидается подтверждение закрытия люка' });
    if (command === 'machine.setDetail') updateMachine(confirmationMachine, { plcState: 4, currentStep: 'Станок готов', canAcceptService: true });
    if (command === 'machine.acceptDoor') updateMachine(confirmationMachine, { plcState: 2, hatchOpen: false, hatchClosed: true, currentStep: 'Ожидается подтверждение запуска обработки' });
    if (command === 'machine.rejectDoor' || command === 'machine.rejectRun') updateMachine(confirmationMachine, { plcState: 0, enabled: false, mode: 'off', currentStep: 'Станок выключен' });
    if (command === 'machine.acceptRun') updateMachine(confirmationMachine, { plcState: 4, mode: 'processing', currentStep: 'Обработка' });
  };
  const cancelMachineConfirmation = () => {
    if (rejectGuestAction()) return;
    if (confirmationMachine !== null) {
      if (usePlcData) sendPlcCommand({ command: 'machine.disable', machine: confirmationMachine + 1 });
      else updateMachine(confirmationMachine, { plcState: 0, enabled: false, mode: 'off', currentStep: 'Станок выключен' });
    }
    setConfirmationMachine(null);
    setConfirmationEntered(false);
  };
  const requestMachineMotion = (action: MachineMechanismAction) => {
    if (rejectGuestAction() || machineMechanism === null) return;
    setPendingMachineMotion({ machineIndex: selectedMachine ?? 0, mechanism: machineMechanism, action });
  };
  const confirmMachineMotion = () => {
    if (!pendingMachineMotion) return;
    const { machineIndex, mechanism, action } = pendingMachineMotion;
    const command = mechanism === 'door'
      ? action === 'open' ? 'machine.manualDoorOpen' : 'machine.manualDoorClose'
      : mechanism === 'hatch'
        ? action === 'open' ? 'machine.manualHatchOpen' : 'machine.manualHatchClose'
        : mechanism === 'lock'
          ? action === 'open' ? 'machine.manualHatchUnlock' : 'machine.manualHatchLock'
        : action === 'open' ? 'machine.manualChuckOpen' : 'machine.manualChuckClose';
    if (usePlcData) {
      sendPlcCommand({ command, machine: machineIndex + 1 });
    } else if (isMachineMotionAllowed(cellState.machines[machineIndex], mechanism, action, false)) {
      const patch = mechanism === 'door'
        ? { doorOpen: action === 'open', doorClosed: action === 'close' }
        : mechanism === 'hatch'
          ? action === 'open'
            // Локальная модель повторяет PLC-последовательность: перед
            // открытием роботного люка защёлка уже должна быть снята.
            ? { hatchOpen: true, hatchClosed: false, hatchLocked: false }
            : { hatchOpen: false, hatchClosed: true }
          : mechanism === 'lock'
            ? { hatchLocked: action === 'close' }
          : { chuckOpen: action === 'open', chuckClosed: action === 'close' };
      updateMachine(machineIndex, patch);
    } else {
      setCommandError('Ручная команда станка отклонена: включите ручной режим и выключите станок из автообработки');
    }
    setPendingMachineMotion(null);
  };
  const sendCellStartChoice = (choice: number) => {
    if (rejectGuestAction()) return;
    if (!usePlcData || !plcRuntime.operatorChoiceAllowed) return;
    sendPlcCommand({ command: 'cell.operatorChoice', value: choice });
  };
  const cancelCellStartConfirmation = () => {
    if (rejectGuestAction()) return;
    if (!usePlcData || !plcRuntime.operatorCancelAllowed) return;
    sendPlcCommand({ command: 'cell.operatorCancel' });
  };
  const updateCycleSettings = (index: number, useHmiCycleTime: boolean, seconds?: number) => {
    if (rejectGuestAction()) return;
    if (usePlcData) {
      sendPlcCommand({ command: 'machine.cycleMode', machine: index + 1, value: useHmiCycleTime });
      if (Number.isFinite(seconds)) sendPlcCommand({ command: 'machine.cycleTime', machine: index + 1, value: seconds });
    }
    updateMachine(index, {
      useHmiCycleTime,
      ...(Number.isFinite(seconds) ? { cycleExpectedS: Math.max(1, seconds as number) } : {}),
    });
  };
  const changePlcDataSource = (enabled: boolean) => {
    if (rejectGuestAction()) return;
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
    if (!authUser && !guestView) {
      plcClient.current?.close();
      plcClient.current = null;
      return;
    }
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
        refreshShiftSummaryRef.current?.();
      },
      onCellLogEvent: setLatestCellLogEvent,
      onCommandError: setCommandError,
      onAuthenticationRequired: () => {
        setAuthUser(null);
        setGuestView(false);
        setPage('monitoring');
        setAuthError('Сессия завершена. Войдите снова.');
      },
    });
    return () => {
      window.clearTimeout(snapshotTimer);
      plcClient.current?.close();
    };
  }, [authUser?.id, guestView]);

  useEffect(() => {
    // Also apply the height correction during Vite Fast Refresh, which keeps
    // React state and does not call loadLayout again. Migrate only these heights.
    if (localStorage.getItem(EQUIPMENT_HEIGHTS_STORAGE_KEY) !== 'done'
      && (layout.machine.sizeZ !== DEFAULT_LAYOUT.machine.sizeZ
        || layout.portal.frameBottomZ !== DEFAULT_LAYOUT.portal.frameBottomZ)) {
      setLayout((current) => ({
        ...current,
        machine: { ...current.machine, sizeZ: DEFAULT_LAYOUT.machine.sizeZ },
        portal: { ...current.portal, frameBottomZ: DEFAULT_LAYOUT.portal.frameBottomZ },
      }));
      return;
    }
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    // Fast Refresh may preserve the old in-memory layout until the next reload.
    // Do not mark that old layout as migrated before loadLayout applies the measurements.
    if (layout.portal.bayClearSpansX?.length && layout.robot.zProfileLength !== undefined) {
      localStorage.setItem(LAYOUT_MEASUREMENTS_STORAGE_KEY, 'done');
    }
    const frameClearWidth = layout.portal.widthY
      + 2 * getPortalRailClearanceMm(layout.portal.frameDepthY, layout.robot.zColumnWidth) - layout.portal.supportSize;
    if (Math.abs(frameClearWidth - PORTAL_MEASUREMENTS.clearWidthY) < 0.000001
      && layout.portal.lengthX === DEFAULT_LAYOUT.portal.lengthX
      && layout.portal.supportSize === PORTAL_MEASUREMENTS.supportSize
      && layout.portal.bayClearSpansX?.length === PORTAL_MEASUREMENTS.bayClearSpansX.length
      && layout.portal.bayClearSpansX.every((gap, index) => gap === PORTAL_MEASUREMENTS.bayClearSpansX[index])) {
      localStorage.setItem(FRAME_SPACING_STORAGE_KEY, 'done');
    }
    // Only acknowledge the new dimensions once they have reached React state.
    if (layout.machine.sizeX === 2300 && layout.machine.sizeY === 1680 && layout.machine.sizeZ === DEFAULT_LAYOUT.machine.sizeZ
      && layout.staticMagazines.every((magazine) => magazine.pitchX === 60 && magazine.pitchY === 60 && magazine.workingHeight === 900)) {
      localStorage.setItem(EQUIPMENT_MEASUREMENTS_STORAGE_KEY, 'done');
    }
    if (layout.machine.sizeZ === DEFAULT_LAYOUT.machine.sizeZ
      && layout.portal.frameBottomZ === DEFAULT_LAYOUT.portal.frameBottomZ) {
      localStorage.setItem(EQUIPMENT_HEIGHTS_STORAGE_KEY, 'done');
    }
    if (layout.floor.lengthX === 14000) {
      localStorage.setItem(FLOOR_LENGTH_STORAGE_KEY, 'done');
    }
    if (layout.portal.position.x === 420) {
      localStorage.setItem(PORTAL_FRAME_ORIGIN_STORAGE_KEY, 'done');
    }
    if (localStorage.getItem(LAYOUT_REPAIR_STORAGE_KEY) !== 'done') {
      localStorage.setItem(LAYOUT_REPAIR_STORAGE_KEY, 'done');
    }
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
    document.documentElement.dataset.fontPreset = fontPreset;
    localStorage.setItem(FONT_PRESET_STORAGE_KEY, fontPreset);
  }, [fontPreset]);

  useEffect(() => {
    localStorage.setItem(EASTER_EGG_STORAGE_KEY, easterEggMode);
  }, [easterEggMode]);

  useEffect(() => {
    localStorage.setItem(DRIFT_SETTINGS_STORAGE_KEY, JSON.stringify(driftSettings));
  }, [driftSettings]);

  useEffect(() => {
    localStorage.setItem(VISUAL_EFFECTS_STORAGE_KEY, JSON.stringify(visualEffects));
  }, [visualEffects]);

  const showNextEasterEgg = () => {
    if (easterEggMode === 'off') return;
    if (easterEggMode === 'random') {
      setEasterEggRevision((current) => current + 1);
      return;
    }
    setEasterEggMode(nextEasterEggScene(easterEggMode));
  };

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
  // Карточка агрегирует только те PLC-проверки робота, которые могут запретить
  // автоматический запуск ячейки. Условия станков, магазинов и режима живут отдельно.
  const displayedRobotReady = usePlcData
    && plcRuntime.startReadiness.robotInterfaceReady
    && plcRuntime.startReadiness.drivesReady
    && plcRuntime.startReadiness.robotReady;
  const displayedMagazineReady = usePlcData && plcRuntime.magazineReady;
  const displayedReadyToStart = usePlcData && plcRuntime.readyToStart;
  const fallbackMachineAlarmIndexes = cellState.machines
    .map((machine, index) => machine.mode === 'error' || machine.activeErrors.length > 0 ? index + 1 : 0)
    .filter(Boolean);
  const plcAlarmEvents = usePlcData ? plcRuntime.alarmEvents : [];
  const activeAlarmEvents = plcAlarmEvents.filter((event) => event.active);
  const activeAlarms = usePlcData ? plcRuntime.activeAlarmCount : fallbackMachineAlarmIndexes.length
    + cellState.magazines.filter((magazine) => magazine.state.error || magazine.state.activeErrors.length > 0).length
    + (cellState.robot.error ? 1 : 0)
    + (displayedGlobalError && fallbackMachineAlarmIndexes.length === 0 && !cellState.magazines.some((magazine) => magazine.state.error) ? 1 : 0);
  const activeWarnings = usePlcData ? plcRuntime.activeWarningCount : 0;
  const alarmCount = activeAlarms + activeWarnings;
  const alarmTone = activeAlarms > 0 ? 'active' : activeWarnings > 0 ? 'warning' : '';
  const localAlarmMachineIndex = cellState.machines.findIndex((machine) => machine.mode === 'error' || machine.alarm || machine.activeErrors.length > 0);
  const localAlarmMagazineIndex = cellState.magazines.findIndex((magazine) => magazine.state.error || magazine.state.activeErrors.length > 0);
  const localAlarmSource = cellState.robot.error
    ? 'Робот'
    : localAlarmMachineIndex >= 0
      ? `Станок ${localAlarmMachineIndex + 1}`
      : localAlarmMagazineIndex >= 0
        ? `Магазин ${localAlarmMagazineIndex + 1}`
        : 'Нет активных';
  const alarmSource = activeAlarmEvents.length
    ? ALARM_SOURCE_LABELS[activeAlarmEvents[0].source]
    : !usePlcData ? localAlarmSource : 'Нет активных';
  const latestActiveEvent = selectLatestActiveEvent(plcAlarmEvents);
  const newestReceivedEventIdentity = alarmEventIdentity(selectNewestReceivedEvent(plcAlarmEvents));
  const activeEventCount = Math.max(alarmCount, activeAlarmEvents.length);
  const sceneActivity = useMemo(
    () => createSceneActivity(usePlcData, cellState, plcRuntime),
    [cellState, plcRuntime, usePlcData],
  );
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
    if (rejectGuestAction()) return;
    if (!usePlcData) {
      setCommandError('Управление ячейкой недоступно без связи с PLC');
      return;
    }
    sendPlcCommand({ command: plcRuntime.cellStopPending ? 'cell.start' : displayedRunning ? 'cell.stop' : 'cell.start' });
  };
  const resetCell = () => {
    if (rejectGuestAction()) return;
    if (!usePlcData) {
      setCommandError('Сброс недоступен без связи с PLC');
      return;
    }
    sendPlcCommand({ command: 'cell.reset' });
  };
  const changeCellMode = (manual: boolean) => {
    if (rejectGuestAction()) return;
    if (!usePlcData) {
      setCommandError('Переключение режима недоступно без связи с PLC');
      return;
    }
    if (manual && !plcRuntime.manualModeAllowed) {
      setCommandError('Переключение в ручной режим отклонено: сначала остановите автоматический цикл.');
      // Команда всё равно уходит в PLC: он фиксирует отклонение в журнале,
      // даже если HMI успел показать устаревшее состояние разрешения.
      sendPlcCommand({ command: 'cell.manual', value: manual });
      return;
    }
    sendPlcCommand({ command: 'cell.manual', value: manual });
    if (manual) {
      sendPlcCommand({ command: 'robot.speedOverride', value: MANUAL_MODE_SPEED_PERCENT });
    }
  };
  const sendRobotCommand = (command: string, value?: boolean | number) => {
    if (rejectGuestAction()) return;
    if (!usePlcData) {
      setCommandError('Управление роботом недоступно без связи с PLC');
      return;
    }
    sendPlcCommand({ command, value });
  };
  const changeSimulationAcceleration = (enabled: boolean) => {
    if (rejectGuestAction()) return;
    if (!simulationControlsAllowed) return;
    sendPlcCommand({ command: 'simulation.accelerationEnable', value: enabled });
  };
  const changeCellSetting = (command: string, value: number) => {
    if (rejectGuestAction()) return;
    if (!usePlcData || !plcRuntime.cellSettings.changeAllowed || !Number.isFinite(value)) return;
    sendPlcCommand({ command, value });
  };
  const changeRobotControlMode = (modbus: boolean) => {
    if (rejectGuestAction()) return;
    if (!usePlcData || !plcRuntime.robotModbus.modeChangeAllowed) return;
    sendPlcCommand({ command: 'robot.controlMode.set', value: modbus ? 1 : 0 });
  };
  const changeModbusSetting = (command: string, value: number) => {
    if (rejectGuestAction()) return;
    if (!usePlcData || !plcRuntime.robotModbus.settingsChangeAllowed || !Number.isFinite(value)) return;
    sendPlcCommand({ command, value });
  };
  const applyModbusSettings = () => {
    if (rejectGuestAction()) return;
    if (!usePlcData || !plcRuntime.robotModbus.settingsChangeAllowed) return;
    sendPlcCommand({ command: 'robot.modbus.apply' });
  };
  const changeSimulationTimeFactor = (value: number) => {
    if (rejectGuestAction()) return;
    if (!simulationControlsAllowed || !simulationAccelerationEnabled) return;
    const normalized = Math.max(1, Math.min(100, Math.round(value)));
    sendPlcCommand({ command: 'simulation.accelerationFactor', value: normalized });
  };
  const selectBottomSection = (section: BottomSection) => {
    setMatrixQuickOpen(false);
    setMachineMechanism(null);
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
    if (!authUser) {
      showGuestRestriction();
      return false;
    }
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
  const openAuthenticatedPage = (nextPage: Page) => {
    closeTopMenu();
    if (rejectGuestAction()) return;
    setPage(nextPage);
  };
  const sceneFocusTarget: SceneEquipmentTarget | null = (
    (page === 'machines' || (page === 'monitoring' && bottomSection === 'machines')) && selectedMachine !== null
  )
    ? { kind: 'machine', index: selectedMachine }
    : (page === 'magazine' || (page === 'monitoring' && bottomSection === 'magazine'))
      ? { kind: 'magazine', index: selectedMagazine }
      : null;

  return <div className="app-shell tesla-shell no-sidebar" onPointerDownCapture={(event) => {
    if (!authUser && guestView && (event.target as HTMLElement).closest('.workspace button:disabled, .workspace button[aria-disabled="true"]')) {
      showGuestRestriction();
    }
  }}>
    {!authUser && !authLoading && <button
      key={`guest-eye-${guestRestrictionRevision}`}
      className={`guest-view-toggle ${guestView ? 'active' : ''} ${guestRestrictionRevision > 0 ? 'denied' : ''}`}
      type="button"
      onClick={() => {
        window.clearTimeout(guestWarningTimerRef.current);
        setGuestWarningVisible(false);
        setGuestView((visible) => !visible);
      }}
      aria-label={guestView ? 'Показать окно авторизации' : 'Просматривать ячейку без авторизации'}
      title={guestView ? 'Показать окно авторизации' : 'Просмотр без управления'}
    >{guestView ? <EyeOff /> : <Eye />}<span>{guestView ? 'Вернуть вход' : 'Просмотр без входа'}</span></button>}
    {guestWarningVisible && !authUser && <div key={`guest-warning-${guestRestrictionRevision}`} className="guest-access-warning" role="alert"><TriangleAlert /><div><strong>Авторизуйтесь в аккаунт</strong><span>Управление запрещено.</span></div></div>}
    <header className="topbar tesla-topbar">
      <div className="page-title"><img src={portalRobotLogo} alt="Portal Robot" /></div>
      <div className={`system-summary ${displayedGlobalError || connectionLost ? 'alarm' : ''}`} title={plcConnection.message}><Indicator active={!connectionLost && !displayedGlobalError} tone={displayedGlobalError || connectionLost ? 'red' : 'green'} /><span>СИСТЕМА</span><b>{systemHeaderText}</b></div>
      <div className="mode-summary"><Indicator active tone="blue" /><span>РЕЖИМ</span><b>{modeText}</b></div>
      <div className="profile-area">
        <button className="profile-button" type="button" aria-expanded={profileOpen} disabled={!authUser} onClick={() => { setTopMenuOpen(false); setProfileOpen((value) => !value); }}><UserRound size={21} /><span className="profile-name"><b>{authUser?.displayName ?? 'Не авторизован'}</b></span></button>
        <AnimatedPresence open={profileOpen && authUser !== null}>
          {authUser && <div className="profile-popover" role="dialog" aria-label="Профиль пользователя">
          <div className="profile-popover__identity">
            <UserAvatar className="profile-popover__avatar" avatarDataUrl={authUser.avatarDataUrl} displayName={authUser.displayName} />
            <div><strong>{authUser.displayName}</strong></div>
          </div>
          <div className="profile-popover__actions">
            <button className="profile-popover__manage" type="button" onClick={() => { setProfileOpen(false); setPage('statistics'); }}><BarChart3 aria-hidden="true" /><span><b>Статистика</b></span><ChevronRight aria-hidden="true" /></button>
            {authUser.role === 'admin' && <button className="profile-popover__manage" type="button" onClick={() => { setProfileOpen(false); setPage('users'); }}><UsersRound aria-hidden="true" /><span><b>Пользователи</b></span><ChevronRight aria-hidden="true" /></button>}
            <button className="profile-popover__logout" type="button" onClick={() => void logout()}><UnlockKeyhole aria-hidden="true" /><span>Завершить сеанс</span></button>
          </div>
          </div>}
        </AnimatedPresence>
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
      <small>{!isPlcOnline ? 'Нет связи с PLC' : simulationAccelerationError ? 'Ошибка применения Dynamic Limits' : simulationAccelerationBusy ? 'Применяем лимиты XYZ…' : simulationAccelerationPending ? `Применится перед следующим тестом; сейчас ×${simulationTimeFactorApplied}` : simulationControlsAllowed ? `Применено ×${simulationTimeFactorApplied}` : 'Доступно для SoftMotion'}</small>
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
          <button type="button" onClick={() => openAuthenticatedPage('settings')}>
            <Icon icon={displaySettingsOutlineIcon} aria-hidden="true" />
            <span>Настройки визуализации</span>
          </button>
          <button type="button" onClick={() => openAuthenticatedPage('cell-settings')}>
            <Boxes aria-hidden="true" />
            <span>Настройки ячейки</span>
          </button>
          <button type="button" onClick={() => openAuthenticatedPage('simulation-settings')}>
            <Clock3 aria-hidden="true" />
            <span>Настройки симуляции</span>
          </button>
        </> : topMenuSection === 'manual' ? <>
          <button className="top-menu-drawer-back" type="button" onClick={() => setTopMenuSection('root')}>
            <ChevronLeft aria-hidden="true" />
            <span>Ручное управление</span>
          </button>
          <button type="button" onClick={() => openAuthenticatedPage('manual')}>
            <Icon icon={touchAppOutlineIcon} aria-hidden="true" />
            <span>Управление моделью</span>
          </button>
          <button type="button" onClick={() => openAuthenticatedPage('injections')}>
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
          <button type="button" onClick={() => openAuthenticatedPage('tests')}>
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
      {page === 'monitoring' && !inspectionOpen && authUser && <OperatorShiftCard user={authUser} summary={shiftSummary} metricsVisible={operatorMetricsVisible} onMetricsVisibilityChange={setOperatorMetricsVisible} />}
      <CellViewport
        layout={layout}
        state={cellState}
        robotCoordinatesRef={robotCoordinatesRef}
        selectedMachine={selectedMachine}
        cameraPreset="front"
        controlsVisible={page === 'monitoring' && !topMenuOpen && !profileOpen && confirmationMachine === null && !plcRuntime.operatorPromptActive}
        onMachineSelect={() => {}}
        onMagazineSelect={(magazineId) => { setSelectedMagazine(magazineId - 1); selectBottomSection('magazine'); }}
        easterEggMode={easterEggMode}
        easterEggRevision={easterEggRevision}
        driftSettings={driftSettings}
        visualEffects={visualEffects}
        sceneActivity={sceneActivity}
        focusTarget={sceneFocusTarget}
        inspectionAvailable={page === 'monitoring' && bottomSection === null && !topMenuOpen && !profileOpen && confirmationMachine === null && !plcRuntime.operatorPromptActive}
        inspectionEvents={plcDataEnabled ? plcRuntime.alarmEvents : []}
        inspectionDataMode={plcDataEnabled ? (isPlcOnline ? 'live' : 'stale') : 'local'}
        latestCellLogEvent={latestCellLogEvent}
        onInspectionOpenChange={setInspectionOpen}
      />
      <AnimatedPresence open={magazineReadinessOpen !== null}>{magazineReadinessOpen !== null && <MagazineReadinessDialog
        magazineNumber={magazineReadinessOpen + 1}
        state={cellState.magazines[magazineReadinessOpen].state}
        onClose={() => setMagazineReadinessOpen(null)}
      />}</AnimatedPresence>
      <AnimatedPresence open={page === 'monitoring' && bottomSection === 'cyclogram'}>
        <EquipmentLoadPanel values={plcRuntime.equipmentLoad} />
      </AnimatedPresence>
      <AnimatedPresence open={page === 'monitoring' && bottomSection === 'magazine' && matrixQuickOpen}>
        <MagazineMatrixCard
          id={QUICK_MAGAZINE_MATRIX_ID}
          slots={cellState.magazines[selectedMagazine].slots}
          columns={cellState.magazines[selectedMagazine].state.columns}
          rows={cellState.magazines[selectedMagazine].state.rows}
          productTypes={cellState.magazines[selectedMagazine].productTypes}
          magazineNumber={selectedMagazine + 1}
          onSlotClick={cellState.magazines[selectedMagazine].state.editAllowed
            ? (index) => cycleMagazineSlot(index, selectedMagazine)
            : undefined}
        />
      </AnimatedPresence>
      {commandError && <div className="command-error" role="alert"><AlertCircle size={18} /><span>{commandError}</span><button onClick={() => setCommandError('')} type="button">×</button></div>}
      {page === 'monitoring' && !inspectionOpen && bottomSection === null && confirmationMachine === null && !plcRuntime.operatorPromptActive && <button className={`alarm-summary ${alarmTone}`} type="button" onClick={() => setPage('alarms')}>
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
        fontPreset={fontPreset}
        onFontPreset={setFontPreset}
        easterEggMode={easterEggMode}
        driftSettings={driftSettings}
        visualEffects={visualEffects}
        onVisualEffectsChange={setVisualEffects}
        onDriftSettings={setDriftSettings}
        onEasterEggMode={setEasterEggMode}
        onNextEasterEgg={showNextEasterEgg}
        onClose={() => setPage('monitoring')}
      /></AnimatedPresence>
      <AnimatedPresence open={page === 'cell-settings'}><CellSettingsPanel online={usePlcData} modbusMode={plcRuntime.modbusMode} modbus={plcRuntime.robotModbus} testEnvironment={plcRuntime.testEnvironment} configurationValid={plcRuntime.multiTypeConfigurationValid} typeCount={plcRuntime.multiTypeCount} typeCountAllowed={plcRuntime.multiTypeCountAllowed} magazineConfigAllowed={plcRuntime.multiTypeMagazineConfigAllowed} settings={plcRuntime.cellSettings} accelerationEnabled={simulationAccelerationEnabled} accelerationActive={simulationAccelerationActive} accelerationAllowed={simulationControlsAllowed} onModeChange={changeRobotControlMode} onTestEnvironmentChange={(value) => { sendPlcCommand({ command: 'test.environment.set', value }); }} onTypeCountChange={(value) => sendPlcCommand({ command: 'multi.typeCount', value })} onAutoDistribute={() => sendPlcCommand({ command: 'multi.autoDistribute' })} onModbusSettingChange={changeModbusSetting} onModbusApply={applyModbusSettings} onSettingChange={changeCellSetting} onAccelerationChange={changeSimulationAcceleration} onStatisticsSettings={() => setPage('statistics-settings')} onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={page === 'manual'}><ManualPanel state={cellState} layout={layout} setState={setCellState} machineIndex={manualMachine} setMachineIndex={setManualMachine} onClose={() => setPage('monitoring')} plcDataEnabled={plcDataEnabled} onPlcDataChange={changePlcDataSource} /></AnimatedPresence>
      <AnimatedPresence open={page === 'injections'}><FaultInjectionPanel values={faultSimulationValues} online={isPlcOnline} send={sendPlcCommand} onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={page === 'simulation-settings'}><SimulationSettingsPanel values={faultSimulationValues} online={isPlcOnline} send={sendPlcCommand} onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={page === 'robot'}><RobotExtendedPanel robot={cellState.robot} magazines={cellState.magazines} runtime={plcRuntime} online={usePlcData} editorEditable={Boolean(authUser)} onListPointBackups={pointBackupApi.list} onExportPointBackup={pointBackupApi.exportCurrent} onPreparePointImport={pointBackupApi.prepareImport} onSend={sendPlcCommand} onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={page === 'machines' && selectedMachine !== null}>{selectedMachine !== null && <MachinePanel index={selectedMachine} state={cellState.machines[selectedMachine]} multiTypeCount={plcRuntime.multiTypeCount} productTypeChangeAllowed={!usePlcData || plcRuntime.multiTypeMachineAllowed[selectedMachine]} onClose={closeMachinePanel} onToggleEnabled={() => toggleMachineEnabled(selectedMachine)} onCycleSettings={(useHmi, seconds) => updateCycleSettings(selectedMachine, useHmi, seconds)} onProductType={(type) => changeMachineProductType(selectedMachine, type)} />}</AnimatedPresence>
      <AnimatedPresence open={page === 'magazine'}><MagazineScreen magazine={cellState.magazines[selectedMagazine]} magazineNumber={(selectedMagazine + 1) as 1 | 2} step={usePlcData ? plcRuntime.magazineSteps[selectedMagazine] : 'Локальная модель'} typeCount={plcRuntime.multiTypeCount} onClose={() => setPage('monitoring')} onToggleEnabled={() => toggleMagazineEnabled(selectedMagazine)} onCommand={(action) => sendMagazineCommand(selectedMagazine, action)} onFill={() => fillMagazine(selectedMagazine)} onClear={() => clearMagazine(selectedMagazine)} onSlotApply={(index, content, productType) => applyMagazineSlot(index, content, productType, selectedMagazine)} onSetting={updateMagazineSetting} /></AnimatedPresence>
      <AnimatedPresence open={page === 'alarms'}><AlarmScreen events={plcAlarmEvents} online={isPlcOnline}
        resetAllowed={usePlcData && plcRuntime.cellResetAllowed}
        safetyRelayResetAllowed={usePlcData && plcRuntime.safety.safetyRelayResetAllowed}
        safetyRelayResetActive={usePlcData && plcRuntime.safety.safetyRelayResetActive}
        onResetWarnings={() => sendPlcCommand({ command: 'alarms.resetWarnings' })}
        onResetAlarms={resetCell}
        onResetSafetyRelay={() => sendPlcCommand({ command: 'safety.resetRelay' })}
        onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={page === 'events'}><CellEventLog liveEvent={latestCellLogEvent} online={isPlcOnline} onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={page === 'tests'}><TestWorkbench simulationFactor={simulationTimeFactor} simulationFactorApplied={simulationTimeFactorApplied} simulationFactorAllowed={simulationControlsAllowed} simulationFactorPending={simulationAccelerationPending} simulationFactorBusy={simulationAccelerationBusy} simulationFactorError={simulationAccelerationError} onSend={sendPlcCommand} onClose={() => setPage('monitoring')} /></AnimatedPresence>
      <AnimatedPresence open={page === 'users' && authUser?.role === 'admin'}>{authUser?.role === 'admin' && <UserManagementPanel currentUser={authUser} onCurrentUserChange={setAuthUser} onUnauthorized={() => { setAuthUser(null); setPage('monitoring'); }} onClose={() => setPage('monitoring')} />}</AnimatedPresence>
      <AnimatedPresence open={page === 'statistics' && authUser !== null}>{authUser && <StatisticsPanel user={authUser} onClose={() => setPage('monitoring')} />}</AnimatedPresence>
      <AnimatedPresence open={page === 'statistics-settings' && authUser?.role === 'admin'}>{authUser?.role === 'admin' && <StatisticsSettingsPanel onClose={() => setPage('cell-settings')} />}</AnimatedPresence>
      <AnimatedPresence open={confirmationMachine !== null && !plcRuntime.operatorPromptActive}>{confirmationMachine !== null && !plcRuntime.operatorPromptActive && <OperatorConfirmation index={confirmationMachine} machine={cellState.machines[confirmationMachine]} layout={layout} state={cellState} robotCoordinatesRef={robotCoordinatesRef} onCommand={sendMachineConfirmation} onCancel={cancelMachineConfirmation} />}</AnimatedPresence>
      <AnimatedPresence open={plcRuntime.operatorPromptActive}><CellStartConfirmation runtime={plcRuntime} layout={layout} state={cellState} robotCoordinatesRef={robotCoordinatesRef} onChoice={sendCellStartChoice} onCancel={cancelCellStartConfirmation} /></AnimatedPresence>
      {pendingMachineMotion && <MachineMotionWarning request={pendingMachineMotion} allowed={isMachineMotionAllowed(cellState.machines[pendingMachineMotion.machineIndex], pendingMachineMotion.mechanism, pendingMachineMotion.action, usePlcData)} onConfirm={confirmMachineMotion} onCancel={() => setPendingMachineMotion(null)} />}
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
          safety={plcRuntime.safety}
          onToggle={toggleCellCycle}
          onModeChange={changeCellMode}
          onExtended={() => openAuthenticatedPage('manual')}
          onResetSafetyRelay={() => sendPlcCommand({ command: 'safety.resetRelay' })}
          onClose={() => setBottomSection(null)}
        /></AnimatedPresence>
        <AnimatedPresence open={bottomSection === 'machines'}><MachinesQuickPanel
          machines={cellState.machines}
          selectedIndex={selectedMachine ?? 0}
          activeMechanism={machineMechanism}
          usePlcData={usePlcData}
          onSelect={(index) => { setSelectedMachine(index); setManualMachine(index); setMachineMechanism(null); }}
          onMechanismSelect={setMachineMechanism}
          onMechanismRequest={requestMachineMotion}
          onToggleEnabled={() => toggleMachineEnabled(selectedMachine ?? 0)}
          onExtended={(index) => { setMachineMechanism(null); setSelectedMachine(index); setManualMachine(index); setPage('machines'); }}
          onClose={() => { setMachineMechanism(null); setBottomSection(null); }}
        /></AnimatedPresence>
        <AnimatedPresence open={bottomSection === 'robot'}><RobotQuickPanel
          robot={cellState.robot}
          magazines={cellState.magazines}
          onSend={sendPlcCommand}
          robotManual={plcRuntime.robotManual}
          robotModbus={plcRuntime.robotModbus}
          axisManual={plcRuntime.axisManual}
          modbusMode={plcRuntime.modbusMode}
          continuousMode={plcRuntime.continuousMode}
          manualStep={plcRuntime.manualStep}
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
      <TouchScrollControls />
    </main>
    {!authUser && !guestView && <LoginOverlay loading={authLoading || authSubmitting} error={authError} onLogin={login} />}
  </div>;
}
