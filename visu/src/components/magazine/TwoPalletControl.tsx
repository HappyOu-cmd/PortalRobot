import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Boxes, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleStop, Gauge,
  Home, Info, Link2, LockKeyhole, MapPin, MoveHorizontal, Play, Power, RotateCcw, Save,
  Settings, ShieldAlert, UnlockKeyhole, X, type LucideIcon,
} from 'lucide-react';
import type { CellState } from '../../model/types';
import { createTwinState, TWIN_REASONS, TWIN_SIGNALS, TWIN_STEPS, twinSignalPattern, type TwinAction, type TwinCommandData, type TwinConfig } from '../../model/twoPalletControl';
import { SegmentedControl } from '../ui/ControlPrimitives';
import { Indicator, type IndicatorTone } from '../ui/Indicator';
import { OperatorConfirmationLayout } from '../ui/OperatorConfirmationLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { MagazineMatrix } from './MagazineMatrix';
import './two-pallet-control.css';

export function MagazineModeSwitch({ mode, allowed, onChange }: { mode: 0 | 1; allowed: boolean; onChange: (mode: 0 | 1) => void }) {
  return <div className="magazine-mode-switch"><span>Тип магазинов</span><select value={mode} aria-label="Тип обоих магазинов" aria-disabled={!allowed}
    onChange={(e) => onChange(Number(e.target.value) as 0 | 1)}>
    <option value={0}>Статичные · 2 × 120</option><option value={1}>Двухпалетные · 2 × 2 × 96</option>
  </select>{!allowed && <small>Остановите ячейку, выключите магазины и их приводы</small>}</div>;
}
interface Props {
  state: CellState; selected: number; onSelect: (index: number) => void; onClose: () => void;
  onCommand: (action: TwinAction, data?: TwinCommandData) => void;
  full?: boolean; local: boolean; connected: boolean;
  manualReady: boolean; safetyReady: boolean; hmiAlive: boolean;
  onExtended?: () => void; className?: string;
}
const parameterLabels: [keyof TwinConfig, string][] = [
  ['exchange', 'Переключение зацепления, мм'], ['workP1', 'П1 у робота, мм'], ['workP2', 'П2 у робота, мм'],
  ['home', 'Координата Home, мм'], ['tolerance', 'Допуск позиции, мм'], ['velocity', 'Скорость, мм/с'],
  ['acceleration', 'Ускорение, мм/с²'], ['deceleration', 'Замедление, мм/с²'], ['jerk', 'Рывок, мм/с³'],
  ['cylinderMs', 'Тайм-аут цилиндра, мс'], ['moveMs', 'Тайм-аут перемещения, мс'], ['homeMs', 'Тайм-аут Home, мс'], ['pulseMs', 'Импульс катушки, мс'],
];

type QuickTone = 'gray' | 'blue' | 'green' | 'amber' | 'red';
type TwinFullTab = 'overview' | 'pallets' | 'recovery' | 'diagnostics' | 'setup';
const TWIN_SENSOR_LABELS: Record<string, string> = {
  liftDown: 'П2 вниз', liftUp: 'П2 вверх', lockIn: 'Замок втянут', lockOut: 'Замок выдвинут',
  stopIn: 'Фиксатор втянут', stopOut: 'Фиксатор выдвинут', limitNegative: 'Концевик −',
  limitPositive: 'Концевик +', homeSensor: 'Датчик Home',
};
type ConfigurationCondition = { label: string; actual: string; expected: string; action?: string; ok: boolean };

function TwinQuickCard({ icon: CardIcon, title, status, detail, tone = 'gray', interactive, active, unavailable, onClick, children }: {
  icon: LucideIcon;
  title: string;
  status: string;
  detail?: string | number;
  tone?: QuickTone;
  interactive?: boolean;
  active?: boolean;
  unavailable?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const content = <>
    <div className="twin-quick-card-heading"><span><CardIcon aria-hidden="true" /></span><strong>{title}</strong></div>
    <div className="twin-quick-card-state"><i aria-hidden="true" /><span>{status}</span>{detail !== undefined && <b>{detail}</b>}</div>
    {children}
  </>;
  const className = `twin-quick-card tone-${tone}${active ? ' active' : ''}${unavailable ? ' command-unavailable' : ''}${children ? ' with-actions' : ''}`;
  return interactive
    ? <button className={className} type="button" onClick={onClick} aria-pressed={active}>{content}</button>
    : <article className={className}>{content}</article>;
}

function TwinQuickCommands({ children }: { children: ReactNode }) {
  return <div className="twin-quick-card-actions">{children}</div>;
}

function TwinQuickPopup({ title, subtitle, wide, configuration, headerAction, onClose, children }: {
  title: string; subtitle: string; wide?: boolean; configuration?: boolean; headerAction?: ReactNode; onClose: () => void; children: ReactNode;
}) {
  return <aside className={`twin-quick-popup${wide ? ' wide' : ''}${configuration ? ' configuration' : ''}`} role={configuration ? 'dialog' : undefined}
    aria-label={configuration ? title : undefined} onPointerDown={(event) => event.stopPropagation()}>
    <header>
      <div className="twin-quick-popup-heading"><strong>{title}</strong><span>{subtitle}</span></div>
      <div className="twin-quick-popup-header-actions">{headerAction}<button type="button" onClick={onClose} aria-label="Закрыть карточку"><X /></button></div>
    </header>
    <div className="twin-quick-popup-body">{children}</div>
  </aside>;
}

function TwinMechanismPopup({ magazine, icon: Icon, title, state, stateKnown, stateTone = 'green', onClose, children }: {
  magazine: number;
  icon: LucideIcon;
  title: string;
  state: string;
  stateKnown: boolean;
  stateTone?: IndicatorTone;
  onClose: () => void;
  children: ReactNode;
}) {
  return <aside className="machine-mechanism-card twin-mechanism-popup" role="dialog" aria-label={`Ручное управление: ${title}`} onPointerDown={(event) => event.stopPropagation()}>
    <header>
      <span className="machine-mechanism-icon"><Icon aria-hidden="true" /></span>
      <div><small>МАГАЗИН {magazine} · РУЧНОЕ УПРАВЛЕНИЕ</small><h3>{title}</h3></div>
      <button type="button" onClick={onClose} title="Закрыть" aria-label="Закрыть карточку"><X /></button>
    </header>
    <div className="machine-mechanism-state">
      <span><Indicator active={stateKnown} tone={stateTone} />Текущее состояние</span>
      <strong>{state}</strong>
    </div>
    <div className="machine-mechanism-actions">{children}</div>
  </aside>;
}

function TwinConfigurationCheck({ label, actual, expected, action, ok }: ConfigurationCondition) {
  return <div className={`twin-configuration-check ${ok ? 'ok' : 'missing'}`}>
    <i aria-hidden="true" /><span>{label}</span><strong>{actual}</strong>
    <small>{ok ? `Требуется: ${expected}` : `Действие: ${action ?? expected}`}</small>
  </div>;
}

function TwinConfigurationGroup({ id, title, ready, expanded, onToggle, children }: {
  id: string; title: string; ready: boolean; expanded: boolean; onToggle: () => void; children: ReactNode;
}) {
  return <section className={`twin-configuration-group${expanded ? ' expanded' : ''}${ready ? ' ready' : ' blocked'}`}>
    <button type="button" className="twin-configuration-group-trigger" aria-expanded={expanded} aria-controls={id} onClick={onToggle}>
      <ChevronRight aria-hidden="true" />
      <i aria-hidden="true" />
      <strong>{title}</strong>
      <span>{ready ? 'Готово' : 'Есть блокировки'}</span>
    </button>
    {expanded && <div className="twin-configuration-group-content" id={id}>{children}</div>}
  </section>;
}

function cylinderPosition(inside: boolean, outside: boolean): string {
  if (outside && !inside) return 'Выдвинут';
  if (inside && !outside) return 'Втянут';
  return inside && outside ? 'Противоречие датчиков' : 'Не определено';
}

export function TwoPalletControl({ state, selected, onSelect, onCommand, onClose, full, local, connected, manualReady, safetyReady, hmiAlive, onExtended, className = '' }: Props) {
  const magazine = state.magazines[selected];
  const twin = magazine.twin ?? createTwinState();
  const doorIds = selected === 0
    ? ['magazine-1-front', 'magazine-1-rear'] as const
    : ['magazine-2-front', 'magazine-2-rear'] as const;
  const doorsLocked = doorIds.every((id) => state.enclosureDoors[id].locked);
  const hasError = !!twin.error || magazine.state.error;
  const ready = twin.ready && magazine.state.ready;
  const [pallet, setPallet] = useState(2);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [activeCard, setActiveCard] = useState<'readiness' | 'configuration' | 'drive' | 'pallets' | 'lift' | 'lock' | 'stop' | null>(null);
  const [configurationExpandedSection, setConfigurationExpandedSection] = useState('1-robot');
  const [configurationSummaryExpanded, setConfigurationSummaryExpanded] = useState(false);
  const [configurationDetailsExpanded, setConfigurationDetailsExpanded] = useState<1 | 2 | null>(null);
  const [configurationDialogOpen, setConfigurationDialogOpen] = useState(false);
  const [driveView, setDriveView] = useState<'points' | 'jog'>('points');
  const [startPrompt, setStartPrompt] = useState<{ revision: number; pallet: number } | null>(null);
  const [draft, setDraft] = useState(twin.config);
  const [fullTab, setFullTab] = useState<TwinFullTab>('overview');
  const [readinessOpen, setReadinessOpen] = useState(false);
  const jogTimer = useRef<ReturnType<typeof setInterval>>();
  const releaseRef = useRef(() => onCommand('jogRelease'));
  const stopJog = () => { if (jogTimer.current) { clearInterval(jogTimer.current); jogTimer.current = undefined; releaseRef.current(); } };
  useEffect(() => { stopJog(); setPallet(3 - twin.robotPallet); setStartPrompt(null); setActiveCard(null); setConfigurationDialogOpen(false); setMatrixOpen(false); setDriveView('points'); setDraft(twin.config); setFullTab('overview'); setReadinessOpen(false); }, [selected, twin.robotPallet]);
  useEffect(() => {
    if (!configurationDialogOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setConfigurationDialogOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [configurationDialogOpen]);
  useEffect(() => { if (startPrompt && (startPrompt.revision !== twin.revision || !connected)) setStartPrompt(null); }, [startPrompt, twin.revision, connected]);
  useEffect(() => { const stop = () => stopJog(); window.addEventListener('blur', stop); document.addEventListener('visibilitychange', stop); return () => { stop(); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', stop); }; }, []);
  useEffect(() => { if (!connected) stopJog(); }, [connected]);
  const run = (action: TwinAction, data?: TwinCommandData) => { if (connected) onCommand(action, data); };
  const button = (label: string, action: TwinAction, allowed: boolean, data?: TwinCommandData) => <button type="button" disabled={!connected || ((action === 'driveReset' || action === 'reset') && !allowed)}
    className={allowed ? '' : 'command-unavailable'} aria-disabled={!allowed} onClick={() => run(action, data)}>{label}</button>;
  const a = twin.allowed;
  const startAllowed = twin.confirmed ? a.enable : a.start;
  const startBlocker = !connected ? 'Нет связи с PLC'
    : twin.error ? 'Активна авария механизма магазина'
      : magazine.state.error ? magazine.state.activeErrors[0] || 'Активна авария роботной операции магазина'
        : TWIN_REASONS[twin.reason] || 'PLC не выдал разрешение на включение';
  const startStateText = twin.enabled ? ready ? 'Готов к работе' : 'Включён · не готов к работе'
    : startAllowed && !hasError ? 'Готов к запуску' : 'Не готов к запуску';
  const lockPairValid = twin.sensors.lockIn !== twin.sensors.lockOut;
  const stopPairValid = twin.sensors.stopIn !== twin.sensors.stopOut;
  const homeBlocker = a.home ? '' : !manualReady ? 'Для HOME нужен ручной режим и остановленный цикл'
    : !hmiAlive ? 'Нет связи HMI с PLC'
      : !safetyReady || !doorsLocked ? 'Проверьте защиту и замки дверей'
        : !twin.configValid || !twin.axisBound || !twin.ioMapped ? 'Проверьте параметры, ось и I/O'
          : twin.busy || !twin.standstill ? 'Дождитесь остановки каретки'
            : twin.driveError ? 'Сначала сбросьте аварию привода'
              : !twin.powered ? 'Включите привод'
                : !twin.sensors.liftDown || twin.sensors.liftUp ? 'Перед HOME опустите П2 и проверьте оба геркона'
                  : !lockPairValid || !stopPairValid || !twin.selected
                    ? 'Восстановите настроенное сочетание замка и фиксатора'
                    : 'PLC не разрешает HOME: проверьте состояние механизма';
  const readinessChecks = [
    ['Связь с PLC и HMI', connected && hmiAlive, 'Восстановите связь HMI с PLC'],
    ['Режим первого подтверждения', twin.confirmed || manualReady, 'Перейдите в ручной режим и остановите цикл'],
    ['Контур безопасности и двери', safetyReady && doorsLocked, 'Проверьте защиту и замки дверей'],
    ['Параметры, ось и I/O', twin.configValid && twin.axisBound && twin.ioMapped, 'Настройте механизм, ось и I/O'],
    ['Привод каретки', twin.powered && !twin.driveError, twin.driveError ? 'Сбросьте ошибку привода, затем выполните HOME' : 'Включите привод'],
    ['HOME, позиция и герконы', twin.homed && !twin.homeRequired && twin.standstill && twin.candidate > 0, 'Установите каретку в рабочую позицию и восстановите настроенное сочетание шести герконов'],
    ['Геометрия матрицы', magazine.state.enableCheckGeometry, 'Проверьте размер матрицы и шаг слотов'],
    ['Нет ошибок магазина и ячейки', !twin.error && magazine.state.enableCheckNoError, 'Устраните активную ошибку'],
    ['Разрешение PLC на включение', twin.enabled || (startAllowed && !hasError), startBlocker],
  ] as const;
  const readinessContent = <div className="twin-readiness-list">{readinessChecks.map(([title, ok, hint]) => <div className={ok ? 'ready' : 'blocked'} key={title}>
    {ok ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
    <span><strong>{title}</strong><small>{ok ? 'Готово' : hint}</small></span>
  </div>)}</div>;
  const p = twin.pallets[pallet - 1];
  const edit = pallet === 1 ? a.edit1 : a.edit2;
  const palletBlanks = p.slots.filter((slot) => slot === 'blank').length;
  const palletDetails = p.slots.filter((slot) => slot === 'detail').length;
  const palletEmpty = p.slots.filter((slot) => slot === 'empty').length;
  const liftText = twin.sensors.liftUp && !twin.sensors.liftDown ? 'П2 поднята'
    : twin.sensors.liftDown && !twin.sensors.liftUp ? 'П2 опущена' : 'Положение П2 не подтверждено';
  const arrangementText = twin.confirmed
    ? `П${twin.robotPallet} у робота · П${3 - twin.robotPallet} у оператора · ${liftText}`
    : TWIN_REASONS[twin.reason] ?? `Причина ${twin.reason}`;
  const quickStatusText = !connected ? 'Нет связи'
    : hasError ? 'Авария'
      : twin.busy ? TWIN_STEPS[twin.step] ?? 'Перемещение палет'
        : twin.enabled ? ready ? 'Готов к работе' : 'Не готов к работе'
          : startAllowed ? 'Готов к запуску' : 'Не готов к запуску';
  const quickTone: QuickTone = !connected ? 'gray' : hasError ? 'red' : twin.busy ? 'amber' : ready || startAllowed ? 'green' : 'amber';
  const readinessTone: 'green' | 'amber' | 'red' = !connected || hasError || (!ready && !startAllowed && !twin.busy)
    ? 'red' : twin.busy ? 'amber' : 'green';
  const selectedRole = (id: number) => twin.confirmed
    ? twin.robotPallet === id ? 'у робота' : 'у оператора'
    : twin.busy ? 'обмен' : 'не подтверждена';
  const openStartPrompt = () => setStartPrompt({ revision: twin.revision, pallet: twin.candidate });
  const answerStartPrompt = (accepted: boolean) => {
    if (!startPrompt) return;
    run(accepted ? 'start' : 'rejectStart', { pallet: startPrompt.pallet, revision: startPrompt.revision });
    setStartPrompt(null);
  };
  const startDialog = startPrompt && <OperatorConfirmationLayout
    title={`Магазин ${selected + 1}`}
    context="ВВОД В РАБОТУ"
    description="Проверьте фактическое положение палет и механизмов перед включением."
    icon={<Boxes aria-hidden="true" />}
    steps={['Проверить положение палет']}
    step={1}
    cancelLabel="Нет, не включать"
    status={a.start ? 'Ответ передаётся PLC одной подтверждённой командой' : TWIN_REASONS[twin.reason] ?? 'Условия включения не выполнены'}
    onCancel={() => answerStartPrompt(false)}
    className="twin-start-confirmation"
  >
    <div className="question-heading">
      <h3>Палеты и механизмы находятся в указанном положении?</h3>
      <p>{startPrompt.pallet
        ? `П${startPrompt.pallet} у робота, П${3 - startPrompt.pallet} у оператора. ${liftText}. Герконы соответствуют настроенной конфигурации.`
        : 'PLC не определил допустимое положение палет. Ответ «Да» будет отклонён и записан в журнал предупреждений.'}</p>
    </div>
    <div className="confirmation-actions">
      <button className={`primary ${a.start ? '' : 'command-unavailable'}`} type="button" disabled={!a.start} aria-disabled={!a.start} onClick={() => answerStartPrompt(true)}>Да, включить магазин</button>
      <button type="button" onClick={() => answerStartPrompt(false)}>Нет, не включать</button>
    </div>
  </OperatorConfirmationLayout>;
  const startDialogPortal = startDialog && typeof document !== 'undefined' ? createPortal(startDialog, document.body) : startDialog;

  if (!full) {
    const driveReady = twin.powered && twin.homed && !twin.homeRequired && !twin.driveError;
    const driveText = twin.driveError ? 'Авария привода' : !twin.powered ? 'Привод выключен' : !twin.homed || twin.homeRequired ? 'Требуется HOME' : 'Готов к работе';
    const lockPositionKnown = twin.sensors.lockIn !== twin.sensors.lockOut;
    const stopPositionKnown = twin.sensors.stopIn !== twin.sensors.stopOut;
    const couplingText = twin.confirmed && lockPositionKnown
      ? `Зацеплена П${twin.selected || twin.robotPallet}`
      : twin.sensors.lockOut && !twin.sensors.lockIn ? 'Активирован' : twin.sensors.lockIn && !twin.sensors.lockOut ? 'Не активирован' : 'Положение не определено';
    const stopText = twin.confirmed && stopPositionKnown
      ? `Удерживает П${3 - (twin.selected || twin.robotPallet)}`
      : twin.sensors.stopOut && !twin.sensors.stopIn ? 'Активирован' : twin.sensors.stopIn && !twin.sensors.stopOut ? 'Не активирован' : 'Положение не определено';
    const arrangement = twin.confirmed ? `П${twin.robotPallet} у робота · П${3 - twin.robotPallet} у оператора` : 'Неизвестно';
    const prerequisiteChecks: ConfigurationCondition[] = [
      { label: 'Режим', actual: manualReady ? 'Ручной, цикл остановлен' : 'Не ручной / цикл идёт', expected: 'Ручной, цикл остановлен', action: 'Перейдите в ручной режим и остановите цикл.', ok: manualReady },
      { label: 'Защита', actual: safetyReady ? 'Готова' : 'Не готова', expected: 'Готова', action: 'Восстановите готовность контура безопасности.', ok: safetyReady },
      { label: 'Двери', actual: doorsLocked ? 'Заперты' : 'Не заперты', expected: 'Заперты', action: 'Закройте и заблокируйте двери.', ok: doorsLocked },
      { label: 'Связь HMI', actual: hmiAlive ? 'Есть' : 'Нет', expected: 'Есть', action: 'Восстановите связь HMI с PLC.', ok: hmiAlive },
      { label: 'Операция робота', actual: magazine.state.busy ? 'Идёт' : 'Нет', expected: 'Нет', action: 'Дождитесь завершения операции робота.', ok: !magazine.state.busy },
      { label: 'Механизм', actual: twin.busy ? 'Занят' : 'Ожидает', expected: 'Ожидает', action: 'Дождитесь завершения движения механизма.', ok: !twin.busy },
    ];
    const sharedChecks: ConfigurationCondition[] = [
      ...prerequisiteChecks,
      { label: 'Привод', actual: twin.powered ? 'Включён' : 'Выключен', expected: 'Включён', action: 'Включите привод каретки.', ok: twin.powered },
      { label: 'HOME', actual: twin.homed && !twin.homeRequired ? 'Найден' : 'Требуется HOME', expected: 'Найден', action: 'Выполните поиск HOME.', ok: twin.homed && !twin.homeRequired },
      { label: 'Ось / I/O', actual: `${twin.axisBound ? 'Подключена' : 'Нет связи'} / ${twin.ioMapped ? 'Подключён' : 'Нет связи'}`, expected: 'Подключены', action: 'Проверьте подключение оси и сигналов I/O.', ok: twin.axisBound && twin.ioMapped },
      { label: 'Каретка', actual: twin.standstill ? 'Остановлена' : 'Движется', expected: 'Остановлена', action: 'Дождитесь остановки каретки.', ok: twin.standstill },
      { label: 'Подъём П2', actual: cylinderPosition(twin.sensors.liftDown, twin.sensors.liftUp), expected: 'Один конечный геркон', action: 'Проверьте оба геркона подъёма П2.', ok: twin.sensors.liftUp !== twin.sensors.liftDown },
      { label: 'Параметры', actual: twin.configValid ? 'Проверены PLC' : 'Недействительны', expected: 'Проверены PLC', action: 'Проверьте параметры механизма в расширенном управлении.', ok: twin.configValid },
      { label: 'Авария', actual: twin.error ? `0x${twin.error.toString(16)}` : 'Нет', expected: 'Нет', action: 'Откройте восстановление и устраните причину аварии.', ok: !twin.error },
    ];
    const sharedBlockers = a.confirm || twin.confirmed ? [] : sharedChecks.filter((check) => !check.ok);
    const plcReason = TWIN_REASONS[twin.reason] || '';
    const globalConfigurationBlocker = !connected || (!a.confirm && !twin.confirmed);
    const configurationOption = (id: 1 | 2) => {
      const expected = twinSignalPattern(twin.config, id);
      const expectedLockOut = expected.lockOut;
      const expectedStopOut = expected.stopOut;
      const target = id === 1 ? twin.config.workP1 : twin.config.workP2;
      const lockOk = expectedLockOut
        ? twin.sensors.lockOut && !twin.sensors.lockIn : twin.sensors.lockIn && !twin.sensors.lockOut;
      const stopOk = expectedStopOut
        ? twin.sensors.stopOut && !twin.sensors.stopIn : twin.sensors.stopIn && !twin.sensors.stopOut;
      const coordinateOk = Math.abs(twin.position - target) <= twin.config.tolerance;
      const allowed = a.confirm && twin.candidate === id;
      const confirmed = twin.confirmed && twin.robotPallet === id;
      const robotChecks: ConfigurationCondition[] = [
        { label: 'Позиция каретки', actual: `${twin.position.toFixed(1)} мм`, expected: `${target.toFixed(1)} ± ${twin.config.tolerance.toFixed(1)} мм`, action: `Установите каретку в рабочую позицию П${id}.`, ok: coordinateOk },
      ];
      const magazineChecks: ConfigurationCondition[] = [
        { label: 'Подъём П2', actual: cylinderPosition(twin.sensors.liftDown, twin.sensors.liftUp), expected: expected.liftUp ? 'Верх' : 'Низ',
          action: `Установите П2 ${expected.liftUp ? 'вверх' : 'вниз'} по настроенной конфигурации.`, ok: twin.sensors.liftUp === expected.liftUp && twin.sensors.liftDown === expected.liftDown },
        { label: 'Замок', actual: cylinderPosition(twin.sensors.lockIn, twin.sensors.lockOut), expected: expectedLockOut ? 'Выдвинут' : 'Втянут', action: `Проверьте замок: датчик должен подтвердить положение «${expectedLockOut ? 'выдвинут' : 'втянут'}».`, ok: lockOk },
        { label: 'Фиксатор', actual: cylinderPosition(twin.sensors.stopIn, twin.sensors.stopOut), expected: expectedStopOut ? 'Выдвинут' : 'Втянут', action: `Проверьте фиксатор: датчик должен подтвердить положение «${expectedStopOut ? 'выдвинут' : 'втянут'}».`, ok: stopOk },
      ];
      const plcChecks: ConfigurationCondition[] = [
        { label: 'Выбранная палета', actual: twin.candidate ? `П${twin.candidate}` : 'Не определена', expected: `П${id}`, action: `Установите механизм в рабочее положение П${id}.`, ok: twin.candidate === id },
      ];
      const localBlockers = [...robotChecks, ...magazineChecks, ...plcChecks].filter((check) => !check.ok);
      const groups = [
        { key: 'robot', title: 'Позиция каретки', checks: robotChecks },
        { key: 'magazine', title: 'Герконы механизмов', checks: magazineChecks },
        { key: 'plc', title: 'Положение палеты', checks: plcChecks },
      ];
      const optionReady = confirmed || allowed;
      const blockerText = optionReady || globalConfigurationBlocker ? '' : localBlockers[0]?.action ?? `PLC не разрешает подтверждение: ${plcReason || 'условия не выполнены'}.`;
      const diagnosticsOpen = configurationDetailsExpanded === id;
      return <section className={`twin-configuration-option${optionReady ? ' ready' : ' blocked'}${confirmed ? ' confirmed' : ''}`} key={id}>
        <header className="twin-configuration-option-header"><div><small>КОНФИГУРАЦИЯ {id}</small><strong>П{id} у робота · П{3 - id} у оператора</strong></div>
          <span className={optionReady ? 'ok' : 'missing'}>{confirmed ? 'Подтверждена' : optionReady ? 'Готова' : 'Не готова'}</span></header>
        {(optionReady || blockerText) && <div className={`twin-configuration-option-message${optionReady ? ' ready' : ' blocked'}`}>
          {optionReady ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
          <span>{confirmed ? 'Конфигурация подтверждена PLC' : allowed ? 'PLC разрешает подтверждение этой конфигурации' : blockerText}</span>
        </div>}
        {!optionReady && <button type="button" className="twin-configuration-details-toggle" aria-expanded={diagnosticsOpen}
          aria-controls={`twin-configuration-diagnostics-${selected + 1}-${id}`}
          onClick={() => setConfigurationDetailsExpanded(diagnosticsOpen ? null : id)}>
          <span>{localBlockers.length ? `Подробности (${localBlockers.length})` : 'Диагностика PLC'}</span>
          <ChevronDown aria-hidden="true" />
        </button>}
        {diagnosticsOpen && <div className="twin-configuration-groups" id={`twin-configuration-diagnostics-${selected + 1}-${id}`}>
          {groups.map((group) => {
            const expanded = configurationExpandedSection === `${id}-${group.key}`;
            return <TwinConfigurationGroup key={group.key} id={`twin-configuration-${selected + 1}-${id}-${group.key}`} title={group.title}
              ready={group.checks.every((check) => check.ok)} expanded={expanded}
              onToggle={() => setConfigurationExpandedSection(expanded ? '' : `${id}-${group.key}`)}>
              <div className="twin-configuration-checks">{group.checks.map((check) => <TwinConfigurationCheck key={check.label} {...check} />)}</div>
            </TwinConfigurationGroup>;
          })}
        </div>}
        <button type="button" disabled={!connected || confirmed} className={`twin-configuration-confirm${allowed ? ' primary' : ' command-unavailable'}`} aria-disabled={!allowed || confirmed}
          onClick={() => run('confirm', { pallet: id, revision: twin.revision })}>{confirmed ? 'Конфигурация подтверждена' : `Подтвердить конфигурацию ${id}`}</button>
      </section>;
    };
    const quickConfigurationOption = (id: 1 | 2) => {
      const confirmed = twin.confirmed && twin.robotPallet === id;
      const allowed = connected && a.confirm && twin.candidate === id;
      const status = confirmed ? 'Подтверждена PLC' : !connected ? 'Нет связи с PLC' : allowed ? 'Можно подтвердить'
        : a.confirm && twin.candidate ? `PLC определил П${twin.candidate} у робота` : 'Выбор пока недоступен';
      return <button key={id} type="button" className={`twin-configuration-quick-option${confirmed ? ' confirmed' : allowed ? ' ready' : ' command-unavailable'}`}
        disabled={!connected || confirmed} aria-disabled={!allowed || confirmed}
        onClick={() => run('confirm', { pallet: id, revision: twin.revision })}>
        <small>КОНФИГУРАЦИЯ {id}</small>
        <strong>П{id} у робота</strong>
        <span>П{3 - id} у оператора</span>
        <em>{status}</em>
      </button>;
    };
    const chooseCard = (card: Exclude<typeof activeCard, null>) => {
      setActiveCard((current) => current === card ? null : card);
      if (card !== 'pallets') setMatrixOpen(false);
    };
    const toggleMagazine = () => {
      if (hasError) { onExtended?.(); return; }
      if (twin.busy) { run('stop'); return; }
      if (twin.enabled) { run('disable'); return; }
      if (!startAllowed) { setActiveCard('readiness'); return; }
      if (twin.confirmed) { run('enable'); return; }
      openStartPrompt();
    };
    const magazineAllowed = hasError || twin.busy || twin.enabled || a.start || a.enable;
    const magazineActionText = hasError ? 'Перейти к восстановлению' : twin.busy ? 'Остановить смену'
      : twin.enabled ? 'Выключить магазин' : 'Включить магазин';
    const MagazineActionIcon = hasError ? ShieldAlert : twin.busy ? CircleStop : Power;
    const swapAllowed = twin.busy || a.swap;
    const jogButton = (positive: boolean) => <button
      type="button"
      disabled={!connected || local}
      aria-disabled={!a.jog}
      className={a.jog ? '' : 'command-unavailable'}
      title={local ? 'JOG доступен после подключения оси PLC' : 'Удерживать для движения'}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        stopJog();
        const action: TwinAction = positive ? 'jogPositive' : 'jogNegative';
        releaseRef.current = () => onCommand('jogRelease');
        run(action);
        jogTimer.current = setInterval(() => run(action), 150);
      }}
      onPointerUp={stopJog}
      onPointerCancel={stopJog}
      onLostPointerCapture={stopJog}
    >{positive ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}<span>JOG {positive ? '+' : '−'}</span></button>;

    const popupActions = (children: ReactNode) => <TwinQuickCommands>{children}</TwinQuickCommands>;
    const mechanismButton = (label: string, action: TwinAction, allowed: boolean, Icon: LucideIcon, primary = false) => <button
      type="button"
      disabled={!connected || ((action === 'driveReset' || action === 'reset') && !allowed)}
      className={`${primary ? 'primary ' : ''}${allowed ? '' : 'command-unavailable'}`.trim()}
      aria-disabled={!allowed}
      onClick={() => run(action)}
    ><Icon aria-hidden="true" /><span>{label}</span></button>;

    return <section className={`two-pallet-control compact magazine-quick-panel twin-quick-panel tone-${quickTone} ${hasError ? 'fault' : ''} ${className}`} onPointerDown={(event) => event.stopPropagation()} aria-label={`Управление двухпалетным магазином ${selected + 1}`}>
      <div className="twin-sheet-grip" aria-hidden="true" />
      <header className="twin-quick-header">
        <div className="twin-quick-summary"><div><h2>Магазин {selected + 1}</h2><button className="twin-readiness-trigger" type="button" title={quickStatusText} aria-expanded={activeCard === 'readiness'} onClick={() => chooseCard('readiness')} aria-label={`Готовность магазина: ${quickStatusText}`}><Indicator active tone={readinessTone} /><span className="twin-readiness-text">{quickStatusText}</span><ChevronDown aria-hidden="true" /></button></div></div>
        <button className={`twin-configuration-button ${twin.confirmed ? 'known' : 'unknown'}${activeCard === 'configuration' ? ' active' : ''}`} type="button" onClick={() => chooseCard('configuration')} aria-haspopup="dialog" aria-expanded={activeCard === 'configuration'}>
          <span className="twin-configuration-copy"><small>Конфигурация магазина</small></span>
          <span className={`twin-configuration-status ${twin.confirmed ? 'known selected' : `unknown${a.confirm ? ' selectable' : ''}`}`}><i aria-hidden="true" /><strong>{twin.confirmed ? arrangement : 'Не настроено'}</strong></span>
          <ChevronDown className="twin-configuration-chevron" aria-hidden="true" />
        </button>
        <button className={`twin-quick-swap ${swapAllowed ? '' : 'command-unavailable'}`} type="button" disabled={!connected} aria-disabled={!swapAllowed} onClick={() => run(twin.busy ? 'stop' : 'swap')}>
          {twin.busy ? <CircleStop aria-hidden="true" /> : <MoveHorizontal aria-hidden="true" />}<span>{twin.busy ? 'Остановить смену' : 'Поменять палеты'}</span>
        </button>
        <nav className="machine-quick-tabs magazine-quick-tabs twin-quick-magazine-tabs" aria-label="Выбор магазина">
          {[0, 1].map((index) => <button key={index} className={selected === index ? 'active' : ''} type="button" onClick={() => onSelect(index)}>Магазин {index + 1}</button>)}
        </nav>
        <div className="twin-quick-header-actions">
          <button className="twin-quick-extended" type="button" onClick={onExtended} title="Расширенное управление" aria-label="Расширенное управление"><Settings /></button>
          <button className="twin-quick-close" type="button" onClick={onClose} title="Закрыть меню" aria-label="Закрыть меню"><X /></button>
        </div>
      </header>

      <div className="twin-quick-content">
        <button className={`twin-quick-power ${twin.enabled ? 'enabled' : a.start || a.enable ? 'ready' : ''} ${magazineAllowed ? '' : 'command-unavailable'}`} type="button" disabled={!connected} aria-disabled={!magazineAllowed} onClick={toggleMagazine}>
          <MagazineActionIcon aria-hidden="true" /><span>{magazineActionText}</span>
        </button>
        <TwinQuickCard icon={Gauge} title="Привод" status={driveText} detail={`${twin.position.toFixed(1)} мм`} tone={twin.driveError ? 'red' : driveReady ? 'green' : twin.powered ? 'amber' : 'gray'} interactive active={activeCard === 'drive'} onClick={() => chooseCard('drive')} />
        <TwinQuickCard icon={Boxes} title="Палеты" status={arrangement} detail="2 × 96" tone={twin.confirmed ? 'blue' : 'amber'} interactive active={activeCard === 'pallets'} onClick={() => chooseCard('pallets')} />
        <TwinQuickCard icon={ArrowUpDown} title="Подъём П2" status={liftText} tone={twin.sensors.liftUp || twin.sensors.liftDown ? 'blue' : 'amber'} interactive active={activeCard === 'lift'} onClick={() => chooseCard('lift')} />
        <TwinQuickCard icon={Link2} title="Замок" status={couplingText} tone={twin.confirmed ? 'blue' : 'amber'} interactive active={activeCard === 'lock'} onClick={() => chooseCard('lock')} />
        <TwinQuickCard icon={LockKeyhole} title="Фиксатор" status={stopText} tone={twin.confirmed ? 'blue' : 'amber'} interactive active={activeCard === 'stop'} onClick={() => chooseCard('stop')} />
      </div>

      {activeCard === 'readiness' && <TwinQuickPopup title={`Готовность магазина ${selected + 1}`} subtitle={startStateText} wide onClose={() => setActiveCard(null)}>
        <p className="twin-readiness-lead">{startAllowed || twin.enabled ? 'PLC разрешает включение или магазин уже включён.' : `Первая причина запрета PLC: ${startBlocker}.`}</p>
        {readinessContent}
      </TwinQuickPopup>}

      {activeCard === 'configuration' && <TwinQuickPopup title={`Конфигурация магазина ${selected + 1}`}
        subtitle={twin.confirmed ? arrangement : 'Выберите фактическое положение палет'} configuration onClose={() => setActiveCard(null)}
        headerAction={<button type="button" className="twin-configuration-more" onClick={() => { setActiveCard(null); setConfigurationDialogOpen(true); }}>
          Подробнее <ChevronRight aria-hidden="true" />
        </button>}>
        <p className="twin-configuration-quick-lead">Проверьте положение палет перед подтверждением.</p>
        <div className="twin-configuration-quick-options">{quickConfigurationOption(1)}{quickConfigurationOption(2)}</div>
        {(!connected || !a.confirm) && !twin.confirmed && <p className="twin-configuration-quick-blocker"><AlertCircle aria-hidden="true" />
          <span>{!connected ? 'Нет связи с PLC.' : plcReason || sharedBlockers[0]?.action || 'PLC пока не разрешает подтверждение.'}</span>
        </p>}
      </TwinQuickPopup>}

      {configurationDialogOpen && typeof document !== 'undefined' && createPortal(
        <div className="twin-configuration-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setConfigurationDialogOpen(false); }}>
          <section className="twin-configuration-dialog" role="dialog" aria-modal="true" aria-labelledby="twin-configuration-title" aria-describedby="twin-configuration-subtitle">
            <header className="twin-configuration-dialog-header">
              <div><h2 id="twin-configuration-title">Конфигурация магазина {selected + 1}</h2><p id="twin-configuration-subtitle">Проверьте положение палет и подтвердите конфигурацию</p></div>
              <button type="button" onClick={() => setConfigurationDialogOpen(false)} aria-label="Закрыть окно конфигурации"><X aria-hidden="true" /></button>
            </header>
            <div className="twin-configuration-dialog-body">
              <section className={`twin-configuration-overview${globalConfigurationBlocker ? ' blocked' : ' ready'}`}>
                {globalConfigurationBlocker ? <>
                  <div className="twin-configuration-overview-summary"><AlertCircle aria-hidden="true" /><div>
                    <strong>Подтверждение пока недоступно</strong>
                    <span>{!connected ? 'Нет связи с PLC.' : plcReason || sharedBlockers[0]?.action || 'PLC пока не разрешает подтверждение.'}</span>
                  </div>
                  {sharedBlockers.length > 0 && <button type="button" className="twin-configuration-overview-toggle" aria-expanded={configurationSummaryExpanded}
                    aria-controls="twin-configuration-overview-checks" onClick={() => setConfigurationSummaryExpanded((expanded) => !expanded)}>
                    {configurationSummaryExpanded ? 'Скрыть' : `Показать условия · ${sharedBlockers.length}`}
                    <ChevronDown aria-hidden="true" />
                  </button>}</div>
                  {configurationSummaryExpanded && sharedBlockers.length > 0 && <div className="twin-configuration-prerequisites" id="twin-configuration-overview-checks">
                    {sharedBlockers.map((check) => <TwinConfigurationCheck key={check.label} {...check} />)}
                  </div>}
                </> : <div className="twin-configuration-overview-summary"><CheckCircle2 aria-hidden="true" /><div>
                  <strong>Общие условия выполнены</strong><span>Проверьте положение палет перед подтверждением.</span>
                </div></div>}
              </section>
              <div className="twin-configurations">{configurationOption(1)}{configurationOption(2)}</div>
              <p className="twin-configuration-note"><Info aria-hidden="true" /><span>Перед подтверждением проверьте фактическое положение обеих палет. Подробные сигналы доступны в диагностике.</span></p>
            </div>
          </section>
        </div>, document.body,
      )}

      {activeCard === 'drive' && <aside className="machine-mechanism-card robot-control-menu robot-position-control-menu twin-drive-control-menu" role="dialog" aria-label="Ручное управление приводом каретки" onPointerDown={(event) => event.stopPropagation()}>
        <header className="robot-mini-header">
          <div><h3>Мини-пульт привода</h3><span>РЕЖИМ {driveView === 'points' ? 'ТОЧКИ' : 'JOG'} <Indicator active={driveReady} tone={driveReady ? 'green' : 'blue'} /> {driveReady ? 'Готов' : 'Не готов'}</span></div>
          <button type="button" onClick={() => setActiveCard(null)} title="Свернуть" aria-label="Закрыть управление приводом">−</button>
        </header>
        <SegmentedControl
          className="robot-position-view-control"
          value={driveView}
          options={[{ value: 'points', label: 'Точки' }, { value: 'jog', label: 'Пульт JOG' }]}
          onChange={(value) => { stopJog(); setDriveView(value as 'points' | 'jog'); }}
          ariaLabel="Режим управления приводом каретки"
        />
        <div className="machine-mechanism-state">
          <span><Indicator active={connected && twin.axisBound} tone="blue" />Текущая координата</span>
          <strong>{twin.position.toFixed(2)} мм</strong>
        </div>
        <div className="twin-drive-service-actions">
          {mechanismButton(twin.powered ? 'Выключить' : 'Включить', twin.powered ? 'powerOff' : 'powerOn', twin.powered ? a.driveReset : a.power, Power)}
          {mechanismButton('Найти HOME', 'home', a.home, Home, true)}
          {mechanismButton('Сброс ошибки', 'driveReset', a.driveReset && twin.driveError, RotateCcw)}
        </div>
        {driveView === 'points' ? <div className="twin-drive-points">
          <section className="twin-drive-point">
            <div><MapPin aria-hidden="true" /><span><small>Точка привода</small><strong>Загрузка / выгрузка</strong></span><b>{twin.config.exchange.toFixed(2)} мм</b></div>
            <div>{mechanismButton('Перейти', 'toOperator', a.move, Play, true)}{mechanismButton('Запомнить', 'teachOperator', a.teachOperator, Save)}</div>
          </section>
          <section className="twin-drive-point">
            <div><MapPin aria-hidden="true" /><span><small>Точка привода</small><strong>Работа у робота · П{twin.selected || '—'}</strong></span><b>{(twin.selected === 2 ? twin.config.workP2 : twin.config.workP1).toFixed(2)} мм</b></div>
            <div>{mechanismButton('Перейти', 'toRobot', a.move, Play, true)}{mechanismButton('Запомнить', 'teachRobot', a.teachWork, Save)}</div>
          </section>
        </div> : <div className="twin-drive-jog">
          <div className="twin-drive-jog-buttons">{!local && <>{jogButton(false)}{jogButton(true)}</>} {local && <p>JOG станет доступен после подключения оси SoftMotion.</p>}</div>
          <button className="twin-drive-stop" type="button" disabled={!connected} onClick={() => { stopJog(); run('stop'); }}><CircleStop aria-hidden="true" />Стоп</button>
        </div>}
        <footer className="twin-drive-footer">
          <span>Питание <b>{twin.powered ? 'ВКЛ' : 'ВЫКЛ'}</b></span><span>HOME <b>{twin.homed && !twin.homeRequired ? 'ГОТОВ' : 'ТРЕБУЕТСЯ'}</b></span><span>Ось / I/O <b>{twin.axisBound ? '✓' : '—'} / {twin.ioMapped ? '✓' : '—'}</b></span>
        </footer>
        {!a.home && <p className="twin-home-blocker"><ShieldAlert aria-hidden="true" /><span>HOME недоступен: {homeBlocker}</span></p>}
        {(twin.driveError || !driveReady) && <p><ShieldAlert aria-hidden="true" /><span>{twin.driveError ? 'Обнаружена ошибка привода' : !twin.powered ? 'Привод выключен' : !twin.homed || twin.homeRequired ? 'Требуется поиск HOME' : 'Проверьте привязку оси и входов/выходов'}</span></p>}
      </aside>}

      {activeCard === 'pallets' && <TwinQuickPopup title={`Палеты магазина ${selected + 1}`} subtitle={arrangement} wide={matrixOpen} onClose={() => { setActiveCard(null); setMatrixOpen(false); }}>
        <nav className="twin-popup-pallet-tabs">{[1, 2].map((id) => <button key={id} type="button" className={pallet === id ? 'active' : ''} onClick={() => { setPallet(id); setMatrixOpen(false); }}>П{id}<small>{selectedRole(id)}</small></button>)}</nav>
        <div className="twin-popup-metrics"><span><b>{palletBlanks}</b>Заготовок</span><span><b>{palletDetails}</b>Деталей</span><span><b>{palletEmpty}</b>Свободно</span><span><b>{p.loaded ? 'Да' : 'Нет'}</b>Загрузка подтверждена</span></div>
        {popupActions(<>{button('Заполнить палету', 'fill', edit, { pallet })}{button('Очистить палету', 'clear', edit, { pallet })}{button('Загрузка завершена', 'loaded', edit, { pallet })}<button type="button" className={matrixOpen ? 'active' : ''} onClick={() => setMatrixOpen((open) => !open)}>Матрица · 12 рядов × 8 мест</button></>)}
        {matrixOpen && <MagazineMatrix slots={p.slots} productTypes={p.productTypes} columns={8} activeCount={96}
          onSlotClick={edit && connected ? (index) => run('slot', { pallet, slot: index + 1, content: p.slots[index] === 'empty' ? 1 : p.slots[index] === 'blank' ? 2 : 0, productType: p.productTypes[index] }) : undefined} />}
      </TwinQuickPopup>}

      {activeCard === 'lift' && <TwinMechanismPopup magazine={selected + 1} icon={ArrowUpDown} title="Подъём палеты П2" state={liftText}
        stateKnown={twin.sensors.liftDown !== twin.sensors.liftUp}
        onClose={() => setActiveCard(null)}>
        {mechanismButton('Опустить П2', 'lower', a.lower, ArrowDown)}
        {mechanismButton('Поднять П2', 'raise', a.raise, ArrowUp, true)}
      </TwinMechanismPopup>}

      {activeCard === 'lock' && <TwinMechanismPopup magazine={selected + 1} icon={LockKeyhole} title="Замок каретки" state={couplingText}
        stateKnown={lockPositionKnown}
        onClose={() => setActiveCard(null)}>
        {mechanismButton('Втянуть', 'lockIn', a.lock, UnlockKeyhole)}
        {mechanismButton('Выдвинуть', 'lockOut', a.lock, LockKeyhole, true)}
      </TwinMechanismPopup>}

      {activeCard === 'stop' && <TwinMechanismPopup magazine={selected + 1} icon={LockKeyhole} title="Фиксатор палеты" state={stopText}
        stateKnown={stopPositionKnown}
        onClose={() => setActiveCard(null)}>
        {mechanismButton('Втянуть', 'stopIn', a.stop, UnlockKeyhole)}
        {mechanismButton('Выдвинуть', 'stopOut', a.stop, LockKeyhole, true)}
      </TwinMechanismPopup>}
      {startDialogPortal}
    </section>;
  }

  const readyCount = readinessChecks.filter(([, ok]) => ok).length;
  const fullStatusText = !connected ? 'Нет связи с PLC' : hasError ? 'Авария · ручное восстановление'
    : twin.busy ? TWIN_STEPS[twin.step] ?? 'Перемещение палет' : startStateText;
  const fullStatusTone = !connected ? 'muted' : hasError ? 'danger' : twin.busy ? 'warning'
    : twin.enabled ? (ready ? 'active' : 'warning') : startAllowed ? 'active' : 'warning';
  const fullStatusReason = !twin.enabled && !startAllowed ? startBlocker : twin.enabled ? arrangementText : 'Все условия включения выполнены';
  const magazineDot = (index: number) => {
    const other = state.magazines[index];
    const otherTwin = other.twin ?? createTwinState();
    return otherTwin.error || other.state.error ? 'danger' : otherTwin.enabled ? 'active' : '';
  };
  const jogHoldButton = (positive: boolean) => <button
    type="button"
    disabled={!connected}
    aria-disabled={!a.jog}
    className={a.jog ? '' : 'command-unavailable'}
    title="Удерживать для движения"
    onPointerDown={(event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      stopJog();
      const action: TwinAction = positive ? 'jogPositive' : 'jogNegative';
      releaseRef.current = () => onCommand('jogRelease');
      run(action);
      jogTimer.current = setInterval(() => run(action), 150);
    }}
    onPointerUp={stopJog}
    onPointerCancel={stopJog}
    onLostPointerCapture={stopJog}
  >{positive ? 'JOG + · удерживать' : 'JOG − · удерживать'}</button>;
  const enableMagazine = () => {
    if (twin.enabled) { run('disable'); return; }
    if (!startAllowed) { setFullTab('overview'); setReadinessOpen(true); return; }
    if (twin.confirmed) { run('enable'); return; }
    openStartPrompt();
  };
  const sensorEntries = Object.entries(twin.sensors) as [keyof typeof TWIN_SENSOR_LABELS, boolean][];
  const activeSensorCount = sensorEntries.filter(([, value]) => value).length;

  return <aside className={`side-panel twin-extended-panel ${hasError ? 'fault' : ''} ${className}`} onPointerDown={(event) => event.stopPropagation()} aria-label={`Расширенное управление двухпалетным магазином ${selected + 1}`}>
    <header className="tx-header">
      <div className="tx-heading">
        <span className="tx-magazine-icon"><Boxes aria-hidden="true" /></span>
        <div><p>{local ? 'Локальная модель · без OPC UA' : 'Расширенное управление'}</p><h2>Магазин {String(selected + 1).padStart(2, '0')}</h2></div>
      </div>
      <button className="tx-close" type="button" onClick={onClose} aria-label="Закрыть управление магазином"><X aria-hidden="true" /></button>
    </header>

    <SegmentedControl className="tx-magazine-switch" value={String(selected)} ariaLabel="Выбор магазина" thumbFullHeight
      options={[0, 1].map((index) => ({ value: String(index), label: <>
        <span className="tx-magazine-label">Магазин <b>{String(index + 1).padStart(2, '0')}</b></span>
        <i className={magazineDot(index)} aria-hidden="true" />
      </> }))}
      onChange={(value) => onSelect(Number(value))} />

    <div className="tx-status" data-tone={fullStatusTone}><div><i aria-hidden="true" /><strong>{fullStatusText}</strong></div>
      <small>{fullStatusReason}</small></div>
    {magazine.state.error && !twin.error && <div className="tx-alarm" role="status"><AlertCircle aria-hidden="true" />
      <div><strong>Ошибка роботной операции магазина</strong>
        <p>{magazine.state.activeErrors.join(' · ') || 'Сначала устраните ошибку робота, затем сбросьте магазин.'}</p></div></div>}

    <Tabs value={fullTab} onValueChange={(tab) => {
      if (tab === 'setup' && fullTab !== 'setup') setDraft({ ...twin.config });
      setFullTab(tab as TwinFullTab);
    }} className="tx-tabs">
      <TabsList className="tx-tabs-list" data-active-tab={fullTab} aria-label="Разделы управления магазином">
        <TabsTrigger value="overview"><Gauge aria-hidden="true" />Обзор</TabsTrigger>
        <TabsTrigger value="pallets"><Boxes aria-hidden="true" />Палеты</TabsTrigger>
        <TabsTrigger value="recovery"><RotateCcw aria-hidden="true" />Восстановление</TabsTrigger>
        <TabsTrigger value="diagnostics"><Info aria-hidden="true" />Диагностика{hasError && <i className="tx-tab-alert" aria-hidden="true" />}</TabsTrigger>
        <TabsTrigger value="setup"><Settings aria-hidden="true" />Наладка</TabsTrigger>
      </TabsList>
      <div className="tx-scroll" key={`${selected}-${fullTab}`}>

        <TabsContent value="overview" className="tx-tab-content">
          <section>
            <div className="tx-section-heading"><h3><Gauge aria-hidden="true" />Состояние механизма</h3>
              <span className="tx-tag">{twin.enabled ? (ready ? 'Включён · готов' : 'Включён · не готов') : 'Выключен'}</span></div>
            <div className="tx-step"><i aria-hidden="true" /><div><span>Расстановка палет</span>
              <strong>{twin.confirmed ? `П${twin.robotPallet} у робота · П${3 - twin.robotPallet} у оператора · ${liftText}` : TWIN_REASONS[twin.reason] ?? `Причина ${twin.reason}`}</strong></div></div>
            <div className="tx-rows">
              <div><span>Привод каретки</span><b>{twin.powered ? `${twin.position.toFixed(1)} мм` : 'Выключен'}</b></div>
              <div><span>Поиск Home</span><b>{twin.homed && !twin.homeRequired ? 'Привязана' : 'Требуется'}</b></div>
              <div><span>Мест в магазине</span><b>192</b></div>
              <div><span>Мест в ячейке</span><b>384</b></div>
            </div>
          </section>
          <section>
            <div className="tx-section-heading"><h3><CheckCircle2 aria-hidden="true" />Готовность к запуску</h3>
              <button type="button" className="tx-text-button" aria-expanded={readinessOpen} onClick={() => setReadinessOpen((open) => !open)}>
                {readinessOpen ? 'Скрыть' : `Показать условия · ${readinessChecks.filter(([, ok]) => !ok).length}`}<ChevronDown aria-hidden="true" />
              </button></div>
            {readinessOpen ? readinessContent
              : <p className="tx-note">Выполнено {readyCount} / {readinessChecks.length} условий{!twin.enabled && !startAllowed ? `. Первая блокировка: ${startBlocker}` : ''}.</p>}
          </section>
        </TabsContent>

        <TabsContent value="pallets" className="tx-tab-content">
          <section>
            <div className="tx-section-heading"><h3><Boxes aria-hidden="true" />Палеты магазина</h3><span className="tx-tag">2 × 96 мест</span></div>
            <div className="tx-pallets">{twin.pallets.map((item, index) => {
              const id = index + 1;
              return <button key={id} type="button" className={`tx-pallet${pallet === id ? ' selected' : ''}`} onClick={() => { setPallet(id); setMatrixOpen(true); }}>
                <div className="tx-pallet-heading"><strong>П{id}</strong>
                  <span>{twin.confirmed ? twin.robotPallet === id ? 'у робота' : 'у оператора' : twin.busy ? 'обмен' : 'не подтверждена'}</span>
                  <small>{String(id).padStart(2, '0')}</small></div>
                <div className="tx-pallet-metrics">
                  <div><span>Заготовки</span><b>{item.slots.filter((slot) => slot === 'blank').length}</b></div>
                  <div><span>Детали</span><b>{item.slots.filter((slot) => slot === 'detail').length}</b></div>
                  <div><span>Свободно</span><b>{item.slots.filter((slot) => slot === 'empty').length}</b></div>
                </div>
                <div className="tx-pallet-loaded" data-loaded={item.loaded}>{item.loaded ? 'Загрузка подтверждена' : 'Загрузка не подтверждена'}</div>
              </button>;
            })}</div>
          </section>
          <section>
            <div className="tx-section-heading"><h3>Содержимое П{pallet}</h3><span className="tx-tag">12 рядов × 8 мест</span></div>
            <div className="tx-inventory-actions">
              {button('Заполнить палету', 'fill', edit, { pallet })}
              {button('Очистить палету', 'clear', edit, { pallet })}
              {button('Загрузка завершена', 'loaded', edit, { pallet })}
            </div>
            <MagazineMatrix slots={p.slots} productTypes={p.productTypes} columns={8} activeCount={96}
              onSlotClick={edit && connected ? (index) => run('slot', { pallet, slot: index + 1, content: p.slots[index] === 'empty' ? 1 : p.slots[index] === 'blank' ? 2 : 0, productType: p.productTypes[index] }) : undefined} />
          </section>
        </TabsContent>

        <TabsContent value="recovery" className="tx-tab-content">
          <section>
            <div className="tx-section-heading"><h3><RotateCcw aria-hidden="true" />После аварии привода</h3><span className="tx-tag">Ручной режим</span></div>
            <p className="tx-note">Сбросить привод → опустить П2 → Home → восстановить расстановку → сбросить магазин → нажать «Включить магазин» и ответить на запрос.</p>
            <div className="tx-command-grid">
              {button('Питание оси', 'powerOn', a.power)}
              {button('Отключить ось', 'powerOff', a.driveReset)}
              {button('Сброс привода', 'driveReset', a.driveReset && twin.driveError)}
              {button('Поиск Home', 'home', a.home)}
              {button('Сброс магазина', 'reset', a.reset && !!twin.error)}
            </div>
            {!a.home && <p className="tx-warning"><ShieldAlert aria-hidden="true" /><span>HOME недоступен: {homeBlocker}</span></p>}
          </section>
          <section>
            <div className="tx-section-heading"><h3>Пневмоцилиндры</h3><span className="tx-tag">5/2 бистабильные</span></div>
            <div className="tx-command-grid">
              {button('Опустить П2', 'lower', a.lower)}
              {button('Поднять П2', 'raise', a.raise)}
              {button('Замок втянуть', 'lockIn', a.lock)}
              {button('Замок выдвинуть', 'lockOut', a.lock)}
              {button('Фиксатор втянуть', 'stopIn', a.stop)}
              {button('Фиксатор выдвинуть', 'stopOut', a.stop)}
            </div>
            <p className="tx-note">Снятие команды с катушек не останавливает цилиндр посередине хода.</p>
          </section>
          <section>
            <div className="tx-section-heading"><h3>Каретка</h3><span className="tx-tag">{twin.position.toFixed(1)} мм</span></div>
            <div className="tx-command-grid">
              {button('К оператору', 'toOperator', a.move)}
              {button('К роботу', 'toRobot', a.move)}
              {!local && jogHoldButton(false)}
              {!local && jogHoldButton(true)}
            </div>
            {local && <p className="tx-note">JOG станет доступен после подключения оси SoftMotion.</p>}
          </section>
        </TabsContent>

        <TabsContent value="diagnostics" className="tx-tab-content">
          <section>
            <div className="tx-section-heading"><h3><Gauge aria-hidden="true" />Обратная связь</h3><span className="tx-tag">{twin.standstill ? 'Остановлена' : 'Движется'}</span></div>
            <div className="tx-feedback-grid">
              <div><span>Координата каретки</span><b>{twin.position.toFixed(2)} мм</b></div>
              <div><span>Ось SoftMotion</span><b>{twin.axisBound ? 'Подключена' : 'Нет связи'}</b></div>
              <div><span>Ввод-вывод</span><b>{twin.ioMapped ? 'Подключён' : 'Нет связи'}</b></div>
              <div><span>Поиск Home</span><b>{twin.homed && !twin.homeRequired ? 'Привязана' : 'Требуется'}</b></div>
            </div>
          </section>
          <section>
            <div className="tx-section-heading"><h3><Info aria-hidden="true" />Герконы и датчики</h3><span className="tx-tag">{activeSensorCount} / {sensorEntries.length} активны</span></div>
            <div className="tx-signals">{sensorEntries.map(([key, value]) => <div key={key} data-active={value}>
              <i aria-hidden="true" /><span>{TWIN_SENSOR_LABELS[key] ?? key}</span><b>{value ? '1' : '0'}</b>
            </div>)}</div>
            <p className="tx-note">1 — активен, 0 — неактивен. Активный сигнал сам по себе не означает готовность механизма.</p>
          </section>
          <section>
            <div className="tx-section-heading"><h3><AlertCircle aria-hidden="true" />Аварии механизма</h3>
              <span className="tx-tag" data-alert={hasError}>{twin.error ? 'Есть' : 'Нет'}</span></div>
            {twin.error
              ? <p className="tx-warning"><ShieldAlert aria-hidden="true" /><span>Авария на шаге «{TWIN_STEPS[twin.faultStep] ?? twin.faultStep}». Маска: 0x{twin.error.toString(16)}. Причины и условия сброса — в журнале.</span></p>
              : <p className="tx-positive">Активных ошибок механизма нет.</p>}
          </section>
        </TabsContent>

        <TabsContent value="setup" className="tx-tab-content">
          <section className="tx-auto-swap-setting">
            <div className="tx-section-heading"><h3><MoveHorizontal aria-hidden="true" />Автоматическая смена палет</h3>
              <span className="tx-tag" data-active={twin.autoSwapEnabled}>{twin.autoSwapEnabled ? 'Включена' : 'Выключена'}</span></div>
            <div className="tx-auto-swap-row">
              <p className="tx-note">Когда активная палета закончена и вторая подтверждена как загруженная, механизм автоматически подаст её роботу. Уже начавшийся обмен отключение не прерывает.</p>
              <div className="tx-auto-swap-switch" role="group" aria-label="Автоматическая смена палет">
                <button type="button" className={!twin.autoSwapEnabled ? 'active' : ''} aria-pressed={!twin.autoSwapEnabled}
                  disabled={!connected || !twin.autoSwapEnabled} onClick={() => run('autoSwap', { autoSwapEnabled: false })}>Выкл</button>
                <button type="button" className={twin.autoSwapEnabled ? 'active' : ''} aria-pressed={twin.autoSwapEnabled}
                  disabled={!connected || twin.autoSwapEnabled} onClick={() => run('autoSwap', { autoSwapEnabled: true })}>Вкл</button>
              </div>
            </div>
          </section>
          <section>
            <div className="tx-section-heading"><h3><Settings aria-hidden="true" />Параметры механизма</h3>
              <span className="tx-tag">{twin.configValid ? 'Проверены PLC' : 'Не проверены'}</span></div>
            <p className="tx-note">Физические координаты и полярность задаются после проверки механики. Числа локальной модели служат только для анимации.</p>
            <div className="tx-parameters">{parameterLabels.map(([key, label]) => <label key={key}><span>{label}</span>
              <input type="number" value={Number(draft[key])} onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })} /></label>)}</div>
            <div className="tx-signal-patterns">
              <table aria-label="Ожидаемые герконы конфигураций П1 и П2">
                <thead><tr><th scope="col">Геркон</th><th scope="col">Сейчас</th>
                  <th scope="col">П1 у робота</th><th scope="col">П2 у робота</th></tr></thead>
                <tbody>{TWIN_SIGNALS.map(([key, label, bit]) => <tr key={key}>
                  <th scope="row">{label}</th><td data-active={twin.sensors[key]}>{twin.sensors[key] ? 1 : 0}</td>
                  {(['p1Signals', 'p2Signals'] as const).map((field, index) => <td key={field}>
                    <label><input type="checkbox" aria-label={`${label}: П${index + 1} у робота`} checked={!!(draft[field] & bit)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setDraft((previous) => ({ ...previous, signalsConfigured: true,
                          [field]: checked ? previous[field] | bit : previous[field] & ~bit }));
                      }} /><span>{draft[field] & bit ? 1 : 0}</span></label>
                  </td>)}
                </tr>)}</tbody>
              </table>
            </div>
            <p className="tx-note">Отмечено — сигнал должен быть 1, снято — 0. В каждой паре задайте один конечный геркон.
              Сочетания замка и фиксатора должны различать П1 и П2. После сохранения подтвердите расстановку заново.</p>
            <label className="tx-check"><input type="checkbox" checked={draft.configured} onChange={(event) => setDraft({ ...draft, configured: event.target.checked })} />
              <span>Параметры проверены на механизме</span></label>
            <div className="tx-form-actions">{button('Сохранить параметры', 'config', a.config, { config: draft })}</div>
            <p className="tx-note">Сохранение доступно в ручном режиме при выключенном магазине и снятом питании привода.</p>
          </section>
        </TabsContent>
      </div>
    </Tabs>

    <footer className="tx-footer">
      <div className="tx-power-bar">
        <button type="button" className={`tx-button tx-power${twin.enabled ? ' is-enabled' : ''}${twin.enabled || startAllowed ? '' : ' command-unavailable'}`}
          disabled={!connected} aria-disabled={!(twin.enabled || startAllowed)} onClick={enableMagazine}>
          <Power aria-hidden="true" />{twin.enabled ? 'Выключить магазин' : 'Включить магазин'}
        </button>
        <button type="button" className={`tx-button${a.swap ? '' : ' command-unavailable'}`} disabled={!connected} aria-disabled={!a.swap} onClick={() => run('swap')}>
          <MoveHorizontal aria-hidden="true" />Сменить палеты
        </button>
        <button type="button" className="tx-button tx-stop" disabled={!connected} onClick={() => { stopJog(); run('stop'); }}>
          <CircleStop aria-hidden="true" />Стоп
        </button>
      </div>
      <div className="tx-footer-meta">
        <span className="tx-connection" data-mode={local ? 'local' : connected ? 'live' : 'offline'}><i aria-hidden="true" />
          {local ? 'Локальная модель · без команд в PLC' : connected ? 'Связь с PLC' : 'Нет связи с PLC'}</span>
        <span>{manualReady ? 'Ручной режим' : 'Автоматический режим'} · 192 места в магазине · 384 в ячейке</span>
      </div>
    </footer>
    {startDialogPortal}
  </aside>;
}
