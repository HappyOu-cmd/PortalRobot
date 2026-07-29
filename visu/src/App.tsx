import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, Bot, Box, Boxes, CheckCircle2, ChevronLeft, ChevronRight,
  CircleStop, ClipboardList, Clock3, Cuboid, DoorOpen, Factory, Gauge, Hand, Home,
  LockKeyhole, Menu, OctagonX, Play, Power, RotateCcw, Settings, ShieldAlert,
  UnlockKeyhole, Wrench, type LucideIcon,
} from 'lucide-react';
import { CellViewport } from './components/CellViewport';
import { DEFAULT_LAYOUT, DEFAULT_STATE } from './model/defaults';
import { getRobotTravelLimits } from './model/travel';
import type { CellLayout, CellState, MachineMode, SlotType } from './model/types';
import {
  createPlcClient, mapPlcSnapshot, mapRuntimeInfo,
  type PlcConnectionInfo, type PlcRuntimeInfo,
} from './plc/client';
import type { CameraPreset } from './three/cellScene';

type Page = 'monitoring' | 'machines' | 'robot' | 'magazine' | 'manual' | 'events' | 'alarms' | 'settings';

const PAGE_TITLES: Record<Page, string> = {
  monitoring: 'Мониторинг ячейки', machines: 'Станки', robot: 'Робот', magazine: 'Магазин',
  manual: 'Ручное управление', events: 'Журнал событий', alarms: 'Аварии', settings: 'Настройки визуализации',
};
const MACHINE_MODE: Record<MachineMode, string> = {
  idle: 'ГОТОВ', processing: 'ОБРАБОТКА', waiting: 'ОЖИДАНИЕ', error: 'АВАРИЯ',
};
const MACHINE_OPERATION = {
  NONE: 'Нет операции', LOAD: 'Загрузка заготовки', UNLOAD: 'Выгрузка детали', CHANGE: 'Замена детали',
} as const;
const NAV_ITEMS: Array<{ page: Page; label: string; icon: LucideIcon }> = [
  { page: 'monitoring', label: 'Мониторинг', icon: Home },
  { page: 'machines', label: 'Станки', icon: Factory },
  { page: 'robot', label: 'Робот', icon: Bot },
  { page: 'magazine', label: 'Магазин', icon: Boxes },
  { page: 'manual', label: 'Ручное управление', icon: Hand },
  { page: 'events', label: 'Журнал событий', icon: ClipboardList },
  { page: 'alarms', label: 'Аварии', icon: ShieldAlert },
  { page: 'settings', label: 'Настройки', icon: Settings },
];
const cloneLayout = (): CellLayout => structuredClone(DEFAULT_LAYOUT);
const cloneState = (): CellState => structuredClone(DEFAULT_STATE);
const LAYOUT_STORAGE_KEY = 'portal-robot.visualization-layout.v1';
const INITIAL_CONNECTION: PlcConnectionInfo = { status: 'connecting', endpoint: '', message: 'Подключение к шлюзу', symbols: 0, missing: [] };
const INITIAL_RUNTIME: PlcRuntimeInfo = {
  cellRunning: false, globalError: false, selectedMachine: 0,
  cellStep: 'Ожидание данных PLC', robotStep: 'Ожидание данных PLC',
  machineSteps: ['Ожидание данных PLC', 'Ожидание данных PLC', 'Ожидание данных PLC'],
  magazineStep: 'Ожидание данных PLC',
};

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

function Indicator({ active, tone = 'green' }: { active: boolean; tone?: 'green' | 'blue' | 'red' | 'amber' }) {
  return <span className={`indicator ${active ? tone : 'off'}`} />;
}

function CommandButton({ label, icon: Icon, tone = 'neutral', onClick }: {
  label: string; icon: LucideIcon; tone?: 'primary' | 'stop' | 'neutral'; onClick: () => void;
}) {
  return <button className={`command-button ${tone}`} onClick={onClick} type="button"><Icon size={18} /><span>{label}</span></button>;
}

function MachineCard({ index, state, step, active, onClick }: {
  index: number; state: CellState['machines'][number]; step: string; active: boolean; onClick: () => void;
}) {
  const tone = !state.enabled ? 'off' : state.mode === 'error' ? 'red' : state.mode === 'processing' ? 'blue' : state.mode === 'waiting' ? 'amber' : 'green';
  const progress = state.cycleExpectedS > 0 ? Math.min(100, state.cycleElapsedS / state.cycleExpectedS * 100) : 0;
  const status = !state.enabled ? 'ОТКЛЮЧЁН' : state.disablePending ? 'ОТКЛЮЧЕНИЕ' : MACHINE_MODE[state.mode];
  return (
    <button className={`machine-card tone-${tone} ${active ? 'active' : ''}`} type="button" onClick={onClick} aria-label={`Открыть станок ${index + 1}`}>
      <div className="machine-card-head">
        <div className="machine-number"><Factory size={22} /><span>СТАНОК</span><strong>{index + 1}</strong></div>
        <span className={`mode ${tone}`}><Indicator active={tone !== 'off'} tone={tone === 'off' ? 'green' : tone} />{status}</span>
      </div>
      <div className="machine-current-step"><span>ТЕКУЩИЙ ШАГ</span><strong>{step}</strong></div>
      {state.mode === 'processing' ? <div className="cycle-compact"><div><span>Цикл обработки</span><b>{state.cycleElapsedS} / {state.cycleExpectedS} с</b></div><i><em style={{ width: `${progress}%` }} /></i></div> : <div className="cycle-compact operation"><span>Операция</span><b>{MACHINE_OPERATION[state.recommendedOperation]}</b></div>}
      <div className="machine-signals">
        <div><DoorOpen size={18} /><span>Дверь</span><b>{state.doorOpen ? 'Открыта' : state.doorClosed ? 'Закрыта' : 'Движение'}</b></div>
        <div>{state.chuckClosed ? <LockKeyhole size={18} /> : <UnlockKeyhole size={18} />}<span>Патрон</span><b>{state.chuckOpen ? 'Открыт' : state.chuckClosed ? 'Закрыт' : 'Движение'}</b></div>
        <div><Box size={18} /><span>Деталь</span><b>{state.partState === 'LOADED' ? 'Есть' : state.partState === 'EMPTY' ? 'Нет' : 'Неизвестно'}</b></div>
      </div>
      <div className="machine-card-footer"><span><Indicator active={state.canAcceptService} />{state.canAcceptService ? 'ГОТОВ ПРИНЯТЬ РОБОТА' : state.serviceRequired ? 'ТРЕБУЕТ ОБСЛУЖИВАНИЯ' : 'РОБОТ НЕ ТРЕБУЕТСЯ'}</span><ChevronRight size={20} /></div>
    </button>
  );
}

function MachinePanel({ index, state, onClose, onToggleEnabled, onReset, onCycleSettings }: {
  index: number;
  state: CellState['machines'][number];
  onClose: () => void;
  onToggleEnabled: () => void;
  onReset: () => void;
  onCycleSettings: (useHmi: boolean, seconds?: number) => void;
}) {
  const progress = state.cycleExpectedS > 0 ? Math.min(100, state.cycleElapsedS / state.cycleExpectedS * 100) : 0;
  const remaining = Math.max(0, state.cycleExpectedS - state.cycleElapsedS);
  const stateText = !state.enabled ? 'Станок отключён' : state.disablePending ? 'Отключение после завершения' : state.currentStep;
  return <aside className="side-panel machine-panel">
    <div className="panel-heading machine-panel-heading">
      <div><span>ОБОРУДОВАНИЕ · СТАНОК {index + 1}</span><h2>{stateText}</h2></div>
      <button onClick={onClose} title="Закрыть"><ChevronRight /></button>
    </div>

    {state.activeErrors.length > 0 && <div className="machine-error-banner"><AlertCircle /><div><strong>Активная авария</strong><span>{state.activeErrors[0]}</span></div></div>}

    <div className="machine-command-bar">
      <button className={`machine-power ${state.enabled ? 'enabled' : ''}`} onClick={onToggleEnabled} data-plc-command={state.enabled ? `GVL_HMI.axMachineDisable[${index + 1}]` : `GVL_HMI.axMachineEnable[${index + 1}]`}><Power size={21} /><span>{state.enabled ? 'Вывести из работы' : 'Ввести в работу'}</span></button>
      <button className="machine-reset" onClick={onReset} disabled={state.activeErrors.length === 0 && state.mode !== 'error'} data-plc-command={`GVL_HMI.axMachineReset[${index + 1}]`}><RotateCcw size={20} /><span>Сбросить аварию</span></button>
    </div>

    <div className="machine-state-band"><Indicator active={state.enabled && state.mode !== 'error'} tone={state.mode === 'error' ? 'red' : state.mode === 'processing' ? 'blue' : 'green'} /><div><span>ТЕКУЩИЙ ШАГ</span><strong>{stateText}</strong></div></div>

    <section className="machine-cycle-section"><div className="panel-section-title"><Clock3 size={18} /><h3>Цикл обработки</h3></div>
      <div className="cycle-times"><div><span>Прошло</span><b>{state.cycleElapsedS} с</b></div><div><span>Осталось</span><b>{remaining} с</b></div><div><span>Ожидается</span><b>{state.cycleExpectedS} с</b></div></div>
      <div className={`cycle-progress ${state.cycleOvertime ? 'overtime' : ''}`}><i style={{ width: `${progress}%` }} /></div>
      {state.cycleOvertime && <p className="overtime-text">Ожидаемое время обработки превышено</p>}
    </section>

    <section><div className="panel-section-title"><Activity size={18} /><h3>Операция</h3></div>
      <div className="operation-list"><span>Рекомендуемая <b>{MACHINE_OPERATION[state.recommendedOperation]}</b></span><span>Выполняемая <b>{MACHINE_OPERATION[state.actualOperation]}</b></span><span>Обслуживание роботом <b>{state.canAcceptService ? 'Разрешено' : state.serviceRequired ? 'Требуется' : 'Не требуется'}</b></span></div>
    </section>

    <section><div className="panel-section-title"><Factory size={18} /><h3>Механизмы</h3></div>
      <div className="machine-io-grid"><div><DoorOpen /><span>Дверь</span><b>{state.doorOpen ? 'Открыта' : state.doorClosed ? 'Закрыта' : 'Движение'}</b></div><div>{state.chuckClosed ? <LockKeyhole /> : <UnlockKeyhole />}<span>Патрон</span><b>{state.chuckOpen ? 'Открыт' : state.chuckClosed ? 'Закрыт' : 'Движение'}</b></div><div><Box /><span>Деталь</span><b>{state.partState === 'LOADED' ? 'Загружена' : state.partState === 'EMPTY' ? 'Пусто' : 'Неизвестно'}</b></div><div>{state.activeErrors.length ? <AlertCircle /> : <CheckCircle2 />}<span>Авария</span><b>{state.activeErrors.length ? 'Есть' : 'Нет'}</b></div></div>
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

function MagazineMatrix({ slots, onSlotClick }: { slots: SlotType[]; onSlotClick?: (index: number) => void }) {
  return <div className="magazine-matrix" aria-label="Матрица магазина 10 на 7">{slots.map((slot, index) => (
    <button key={index} type="button" title={`Слот ${index + 1}`} className={`slot ${slot}`} onClick={() => onSlotClick?.(index)} />
  ))}</div>;
}

function Toggle({ checked, label, onChange, disabled = false }: { checked: boolean; label: string; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className={`toggle-row ${disabled ? 'disabled' : ''}`}><span>{label}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><i /></label>;
}

function NumberField({ label, value, unit = 'мм', min = -3000, max = 18000, step = 10, onChange }: {
  label: string; value: number; unit?: string; min?: number; max?: number; step?: number; onChange: (value: number) => void;
}) {
  return <label className="number-field"><span>{label}</span><input className="settings-range" type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} /><div><input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} /><em>{unit}</em></div></label>;
}

function SettingsPanel({ layout, setLayout, onClose }: { layout: CellLayout; setLayout: (layout: CellLayout) => void; onClose: () => void }) {
  const change = (edit: (draft: CellLayout) => void) => { const next = structuredClone(layout); edit(next); setLayout(next); };
  return (
    <aside className="side-panel settings-panel">
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

function ManualPanel({ state, layout, setState, machineIndex, setMachineIndex, onClose, plcDataEnabled, onPlcDataChange }: {
  state: CellState; layout: CellLayout; setState: (state: CellState) => void; machineIndex: number; setMachineIndex: (index: number) => void; onClose: () => void;
  plcDataEnabled: boolean; onPlcDataChange: (enabled: boolean) => void;
}) {
  const updateRobot = (patch: Partial<CellState['robot']>) => setState({ ...state, robot: { ...state.robot, ...patch } });
  const updateMachine = (patch: Partial<CellState['machines'][number]>) => { const machines = [...state.machines]; machines[machineIndex] = { ...machines[machineIndex], ...patch }; setState({ ...state, machines }); };
  const travelLimits = getRobotTravelLimits(layout);
  return <aside className="side-panel manual-panel">
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
      <Toggle label="Деталь в патроне" checked={state.machines[machineIndex].partPresent} disabled={plcDataEnabled} onChange={(v) => updateMachine({ partPresent: v, partState: v ? 'LOADED' : 'EMPTY' })} />
    </section>
    <section><h3>Магазин</h3><p className="panel-note">Нажатие на слот переключает: пусто → заготовка → деталь.</p><MagazineMatrix slots={state.magazine} onSlotClick={plcDataEnabled ? undefined : (index) => { const values: SlotType[] = ['empty', 'blank', 'detail']; const magazine = [...state.magazine]; magazine[index] = values[(values.indexOf(magazine[index]) + 1) % values.length]; setState({ ...state, magazine }); }} /></section>
  </aside>;
}

export function App() {
  const [layout, setLayout] = useState<CellLayout>(loadLayout);
  const [cellState, setCellState] = useState<CellState>(cloneState);
  const [page, setPage] = useState<Page>('monitoring');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('iso');
  const [selectedMachine, setSelectedMachine] = useState<number | null>(null);
  const [manualMachine, setManualMachine] = useState(1);
  const [running, setRunning] = useState(true);
  const [globalError, setGlobalError] = useState(false);
  const [plcConnection, setPlcConnection] = useState<PlcConnectionInfo>(INITIAL_CONNECTION);
  const [plcRuntime, setPlcRuntime] = useState<PlcRuntimeInfo>(INITIAL_RUNTIME);
  const [commandError, setCommandError] = useState('');
  const [plcDataEnabled, setPlcDataEnabled] = useState(true);
  const plcDataEnabledRef = useRef(true);
  const plcClient = useRef<ReturnType<typeof createPlcClient> | null>(null);
  const isPlcOnline = plcConnection.status === 'connected' || plcConnection.status === 'degraded';
  const usePlcData = isPlcOnline && plcDataEnabled;
  const counts = useMemo(() => ({ blanks: cellState.magazine.filter((s) => s === 'blank').length, details: cellState.magazine.filter((s) => s === 'detail').length, empty: cellState.magazine.filter((s) => s === 'empty').length }), [cellState.magazine]);
  const selectMachine = (index: number) => { setSelectedMachine(index); setManualMachine(index); setPage('machines'); };
  const updateMachine = (index: number, patch: Partial<CellState['machines'][number]>) => {
    setCellState((current) => {
      const machines = [...current.machines];
      machines[index] = { ...machines[index], ...patch };
      return { ...current, machines };
    });
  };
  const toggleMachineEnabled = (index: number) => {
    const machine = cellState.machines[index];
    if (usePlcData) {
      plcClient.current?.send({ command: machine.enabled ? 'machine.disable' : 'machine.enable', machine: index + 1 });
      return;
    }
    if (machine.enabled && machine.mode === 'processing') {
      updateMachine(index, { disablePending: true, currentStep: 'Отключение после завершения обработки' });
    } else if (machine.enabled) {
      updateMachine(index, { enabled: false, disablePending: false, canAcceptService: false, currentStep: 'Станок отключён' });
    } else {
      updateMachine(index, { enabled: true, disablePending: false, mode: 'idle', canAcceptService: true, currentStep: 'Готов к работе' });
    }
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
      mode: 'idle',
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
    plcClient.current = createPlcClient({
      onConnection: setPlcConnection,
      onSnapshot: (values) => {
        if (!plcDataEnabledRef.current) return;
        setCellState((current) => mapPlcSnapshot(values, current));
        setPlcRuntime((current) => mapRuntimeInfo(values, current));
      },
      onCommandError: setCommandError,
    });
    return () => plcClient.current?.close();
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

  const displayedRunning = usePlcData ? plcRuntime.cellRunning : running;
  const displayedGlobalError = usePlcData ? plcRuntime.globalError : globalError;
  const connectionLost = plcConnection.status === 'disconnected' || plcConnection.status === 'connecting';
  const systemText = connectionLost ? 'НЕТ СВЯЗИ' : plcConnection.status === 'degraded' ? 'ЧАСТИЧНЫЕ ДАННЫЕ' : displayedGlobalError ? 'ОШИБКА' : displayedRunning ? 'РАБОТАЕТ' : 'ОСТАНОВЛЕНА';
  const sendCellCommand = (command: string, fallback: () => void) => {
    setCommandError('');
    if (!usePlcData || !plcClient.current?.send({ command })) fallback();
  };

  return <div className="app-shell">
    <div className="edge-trigger" onMouseEnter={() => setSidebarOpen(true)} />
    <nav className={`sidebar ${sidebarOpen ? 'expanded' : ''}`} onMouseEnter={() => setSidebarOpen(true)} onMouseLeave={() => setSidebarOpen(false)}>
      <button className="brand" onClick={() => setSidebarOpen((v) => !v)} title="Меню"><span className="brand-mark">R</span><strong>PORTAL ROBOT</strong><Menu size={19} /></button>
      <div className="nav-list">{NAV_ITEMS.map(({ page: itemPage, label, icon: Icon }) => <button key={itemPage} className={page === itemPage ? 'active' : ''} onClick={() => { setPage(itemPage); if (itemPage !== 'machines') setSelectedMachine(null); }} title={label}><Icon size={20} /><span>{label}</span></button>)}</div>
      <button className="emergency" onClick={() => sendCellCommand('cell.stop', () => { setGlobalError(true); setRunning(false); })} title="Аварийный стоп"><OctagonX size={21} /><span>АВАРИЙНЫЙ СТОП</span></button>
    </nav>
    <header className="topbar">
      <div className="page-title"><ChevronLeft size={18} /><div><span>PORTAL ROBOT</span><h1>{PAGE_TITLES[page]}</h1></div></div>
      <div className="line-step"><span>СОСТОЯНИЕ ЛИНИИ</span><strong>{displayedGlobalError ? 'АВАРИЯ ЯЧЕЙКИ' : usePlcData ? plcRuntime.cellStep : displayedRunning ? 'РУЧНОЙ РЕЖИМ МОДЕЛИ' : 'МОДЕЛЬ ОСТАНОВЛЕНА'}</strong></div>
      <div className="top-statuses"><div title={plcConnection.message}><Indicator active={!connectionLost && !displayedGlobalError} tone={displayedGlobalError || connectionLost ? 'red' : 'green'} /><span>СИСТЕМА<b>{systemText}</b></span></div><div><Bot size={20} /><span>РОБОТ<b>{usePlcData ? plcRuntime.robotStep : 'РУЧНОЙ'}</b></span></div><div><Factory size={20} /><span>АКТИВНЫЙ СТАНОК<b>{usePlcData ? plcRuntime.selectedMachine || '—' : '—'}</b></span></div></div>
      <div className="commands"><CommandButton label="Старт" icon={Play} tone="primary" onClick={() => sendCellCommand('cell.start', () => { if (!globalError) setRunning(true); })} /><CommandButton label="Стоп" icon={CircleStop} tone="stop" onClick={() => sendCellCommand('cell.stop', () => setRunning(false))} /><CommandButton label="Сброс" icon={RotateCcw} onClick={() => sendCellCommand('cell.reset', () => setGlobalError(false))} /></div>
    </header>
    <main className="workspace">
      <CellViewport layout={layout} state={cellState} selectedMachine={selectedMachine} cameraPreset={cameraPreset} onMachineSelect={selectMachine} />
      <div className="view-toolbar"><button className={cameraPreset === 'iso' ? 'active' : ''} onClick={() => setCameraPreset('iso')} title="Изометрия"><Cuboid size={18} /></button><button className={cameraPreset === 'front' ? 'active' : ''} onClick={() => setCameraPreset('front')} title="Вид спереди"><Box size={18} /></button><button className={cameraPreset === 'top' ? 'active' : ''} onClick={() => setCameraPreset('top')} title="Вид сверху"><Gauge size={18} /></button><span>{cameraPreset === 'iso' ? 'Изометрия' : cameraPreset === 'front' ? 'Спереди' : 'Сверху'}</span></div>
      <div className="step-board"><div><span>РОБОТ</span><b>{usePlcData ? plcRuntime.robotStep : 'РУЧНОЕ УПРАВЛЕНИЕ'}</b></div><div><span>{usePlcData && plcRuntime.selectedMachine ? `СТАНОК ${plcRuntime.selectedMachine}` : 'СТАНКИ'}</span><b>{usePlcData && plcRuntime.selectedMachine ? plcRuntime.machineSteps[plcRuntime.selectedMachine - 1] : 'ЛОКАЛЬНАЯ МОДЕЛЬ'}</b></div><div><span>МАГАЗИН</span><b>{usePlcData ? plcRuntime.magazineStep : 'РУЧНОЕ УПРАВЛЕНИЕ'}</b></div></div>
      {commandError && <div className="command-error" role="alert"><AlertCircle size={18} /><span>{commandError}</span><button onClick={() => setCommandError('')} type="button">×</button></div>}
      <section className="dashboard">
        <div className="dashboard-section machines-status"><div className="section-title"><span>СТАТУС СТАНКОВ</span><small>3 СТАНКА</small></div><div className="machine-cards">{cellState.machines.map((machine, index) => <MachineCard key={index} index={index} state={machine} step={machine.currentStep} active={selectedMachine === index} onClick={() => selectMachine(index)} />)}</div></div>
        <div className="dashboard-section robot-status"><div className="section-title"><span>РОБОТ И ЗАХВАТ</span><small>Координаты, мм</small></div><div className="robot-content"><div className="coordinates">{(['x', 'y', 'z'] as const).map((axis) => <div key={axis}><span>{axis.toUpperCase()}</span><b>{cellState.robot[axis].toFixed(0)}</b></div>)}</div><div className="grippers"><div><strong>Захват 1</strong><Wrench size={28} /><span><Indicator active={cellState.robot.gripper1Closed} tone="blue" />{cellState.robot.gripper1Closed ? 'ЗАГОТОВКА' : 'ПУСТО'}</span></div><div><strong>Захват 2</strong><Wrench size={28} /><span><Indicator active={cellState.robot.gripper2Closed} tone="green" />{cellState.robot.gripper2Closed ? 'ДЕТАЛЬ' : 'ПУСТО'}</span></div></div></div></div>
        <div className="dashboard-section magazine-status"><div className="section-title"><span>МАГАЗИН 10 × 7</span><small>{counts.blanks} заг. · {counts.details} дет. · {counts.empty} пусто</small></div><MagazineMatrix slots={cellState.magazine} /><div className="legend"><span><i className="slot empty" />Пусто</span><span><i className="slot blank" />Заготовка</span><span><i className="slot detail" />Деталь</span></div></div>
      </section>
      {page === 'settings' && <SettingsPanel layout={layout} setLayout={setLayout} onClose={() => setPage('monitoring')} />}
      {page === 'manual' && <ManualPanel state={cellState} layout={layout} setState={setCellState} machineIndex={manualMachine} setMachineIndex={setManualMachine} onClose={() => setPage('monitoring')} plcDataEnabled={plcDataEnabled} onPlcDataChange={changePlcDataSource} />}
      {page === 'machines' && selectedMachine !== null && <MachinePanel index={selectedMachine} state={cellState.machines[selectedMachine]} onClose={() => { setSelectedMachine(null); setPage('monitoring'); }} onToggleEnabled={() => toggleMachineEnabled(selectedMachine)} onReset={() => resetMachine(selectedMachine)} onCycleSettings={(useHmi, seconds) => updateCycleSettings(selectedMachine, useHmi, seconds)} />}
      {(['robot', 'magazine', 'events', 'alarms'] as Page[]).includes(page) && <aside className="side-panel info-panel"><div className="panel-heading"><div><span>РАЗДЕЛ</span><h2>{PAGE_TITLES[page]}</h2></div><button onClick={() => setPage('monitoring')} title="Закрыть"><ChevronRight /></button></div><div className="empty-state"><Activity size={42} /><strong>Экран подготовлен</strong><p>Здесь появятся рабочие команды и данные CODESYS после подключения обмена.</p></div></aside>}
    </main>
  </div>;
}
