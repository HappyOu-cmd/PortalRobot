import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cva } from 'class-variance-authority';
import { AlertCircle, Info, Power, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';
import { watchMobileSession, type MobileSession as Session } from './session';
import { MobileHoldButton } from './MobileHoldButton';
import { createPointCheckHold, type CheckPhase } from './pointCheckHold';
import './mobile-points.css';
import './mobile-controls.css';
import './mobile-points-theme-bridge.css';

const labels = [
  'Станок 1 — над станком', 'Станок 1 — подход к патрону', 'Станок 1 — позиция патрона',
  'Станок 2 — над станком', 'Станок 2 — подход к патрону', 'Станок 2 — позиция патрона',
  'Станок 3 — над станком', 'Станок 3 — подход к патрону', 'Станок 3 — позиция патрона',
  'HOME_SAFETY', 'Магазин 1 — базовая точка детали', 'Магазин 2 — базовая точка детали',
];

type PointState = { index: number; x: number; y: number; z: number; speedFactor: number; configured: boolean; checkAllowed: boolean; checkRejectCode: number };
type JogDirection = 'positive' | 'negative';
type MobileAxisState = {
  jogPositiveAllowed: boolean; jogNegativeAllowed: boolean;
  moveRelativePositiveAllowed: boolean; moveRelativeNegativeAllowed: boolean;
  driveReady: boolean; busy: boolean; error: boolean;
  actualPosition: number; minPosition: number; maxPosition: number;
  commandVelocity: number; maxVelocity: number; rejectReason: string;
};
type MobileRobotState = {
  continuousMode: boolean; speedOverridePercent: number; manualStep: number;
  drivesPowered: boolean; drivesOff: boolean; powerTransitionActive: boolean;
  drivesEnableAllowed: boolean; drivesDisableAllowed: boolean; resetAllowed: boolean;
  stopAllowed: boolean; commandBusy: boolean; rejectReason: string;
};
type MobileState = {
  online: boolean; manualMode: boolean; modbusMode: boolean;
  phoneSpeedLimitPercent: number; robot: MobileRobotState; axes: MobileAxisState[];
  points: PointState[]; captureAllowed: boolean; saveAllowed: boolean;
  coordinates: { x: number; y: number; z: number }; checkSpeedPercent: number;
  active: boolean; activeIndex: number; checkState: number; runSeq: number;
  owned: boolean; activeJog: { axis: number; direction: JogDirection } | null;
};
type Draft = { x: string; y: string; z: string; speed: string };
type ActionResult = {
  ok: boolean; sequence?: number;
  point?: { x: number; y: number; z: number; speedFactor: number; configured: boolean };
  phoneSpeedLimitPercent?: number; appliedValue?: number; released?: boolean; leaseId?: string;
};
type RobotCommand = {
  command: 'robot.axis.jog' | 'robot.axis.moveRelative' | 'robot.continuousMode' | 'robot.manualStep'
    | 'robot.speedOverride' | 'robot.enableDrives' | 'robot.disableDrives' | 'robot.stop' | 'robot.reset';
  machine?: number; direction?: JogDirection; value?: boolean | number; leaseId?: string;
};

const button = cva('mobile-points__button', {
  variants: { tone: { primary: 'is-primary', outline: 'is-outline', danger: 'is-danger' } },
  defaultVariants: { tone: 'outline' },
});
const parseNumber = (value: string) => Number(value.replace(',', '.'));
const formatNumber = (value: number, digits = 3) => Number.isFinite(value)
  ? value.toFixed(digits).replace(/\.0+$/, '.0').replace(/(\.\d*?[1-9])0+$/, '$1') : '0.0';
const clampPercent = (value: number, fallback = 0.1) => {
  const numeric = Number(value);
  return Math.max(0.1, Math.min(100, Number.isFinite(numeric) ? numeric : fallback));
};
const createMotionLeaseId = () => {
  const bytes = new Uint8Array(18);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
};
const pointDraft = (point?: PointState | ActionResult['point']): Draft => ({
  x: formatNumber(Number(point?.x ?? 0)), y: formatNumber(Number(point?.y ?? 0)), z: formatNumber(Number(point?.z ?? 0)),
  speed: formatNumber(Number(point?.speedFactor ?? 0), 2),
});

function MobileJogButton({ axis, direction, label, arrow, allowed, online, onJog }: {
  axis: number; direction: JogDirection; label: string; arrow: string; allowed: boolean;
  online: boolean; onJog: (active: boolean) => void;
}) {
  const onJogRef = useRef(onJog);
  onJogRef.current = onJog;
  const pressedRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const [pressed, setPressed] = useState(false);
  const finish = useCallback((event?: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    pointerIdRef.current = null;
    setPressed(false);
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onJogRef.current(false);
  }, []);
  useEffect(() => {
    const release = (event: globalThis.PointerEvent) => {
      if (pointerIdRef.current === event.pointerId) finish();
    };
    const touchRelease = () => finish();
    const blur = () => finish();
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    document.addEventListener('touchend', touchRelease, { capture: true, passive: true });
    document.addEventListener('touchcancel', touchRelease, { capture: true, passive: true });
    window.addEventListener('blur', blur);
    return () => {
      finish();
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
      document.removeEventListener('touchend', touchRelease, true);
      document.removeEventListener('touchcancel', touchRelease, true);
      window.removeEventListener('blur', blur);
    };
  }, [finish]);

  return <button
    type="button"
    className={cn('mobile-jog__direction', `axis-${axis}`, `is-${direction}`, pressed && 'is-pressed', !allowed && 'is-unavailable')}
    disabled={!online}
    aria-disabled={!allowed}
    aria-pressed={pressed}
    aria-label={`${axis === 1 ? 'X' : axis === 2 ? 'Y' : 'Z'} ${direction === 'positive' ? 'в плюс' : 'в минус'}, удерживать для движения`}
    onContextMenu={(event) => event.preventDefault()}
    onDragStart={(event) => event.preventDefault()}
    onPointerDown={(event) => {
      event.preventDefault();
      if (!event.isPrimary || event.button !== 0 || !allowed || pressedRef.current) return;
      pressedRef.current = true;
      pointerIdRef.current = event.pointerId;
      setPressed(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      onJogRef.current(true);
    }}
    onPointerUp={finish}
    onPointerCancel={finish}
    onLostPointerCapture={() => finish()}
    onBlur={() => finish()}
    onClick={(event) => event.preventDefault()}
  ><strong>{label}</strong><span>{arrow}</span></button>;
}

function MobileStepButton({ axis, direction, label, arrow, allowed, online, onStep }: {
  axis: number; direction: JogDirection; label: string; arrow: string; allowed: boolean;
  online: boolean; onStep: () => void;
}) {
  return <button
    type="button"
    className={cn('mobile-jog__direction', `axis-${axis}`, `is-${direction}`, !allowed && 'is-unavailable')}
    disabled={!online}
    aria-disabled={!allowed}
    aria-label={`${axis === 1 ? 'X' : axis === 2 ? 'Y' : 'Z'} ${direction === 'positive' ? 'в плюс' : 'в минус'} на один шаг`}
    onContextMenu={(event) => event.preventDefault()}
    onDragStart={(event) => event.preventDefault()}
    onClick={onStep}
  ><strong>{label}</strong><span>{arrow}</span></button>;
}

function MobileRobotRemote({ state, onCommand, onStop, onMotionHeartbeat, onMotionStop }: {
  state: MobileState | null;
  onCommand: (command: RobotCommand) => Promise<ActionResult | undefined>;
  onStop: () => void;
  onMotionHeartbeat: (leaseId: string) => Promise<unknown>;
  onMotionStop: (leaseId: string) => Promise<unknown>;
}) {
  const activeJogRef = useRef<{ axis: number; direction: JogDirection; leaseId: string;
    held: boolean; accepted: boolean; pulsePending: boolean; timer?: number } | null>(null);
  const robot = state?.robot;
  const axes = state?.axes ?? [];
  const speedLimit = clampPercent(state?.phoneSpeedLimitPercent ?? 10, 10);
  const speed = Math.min(clampPercent(robot?.speedOverridePercent ?? 0.1), speedLimit);
  const modeReady = Boolean(state?.online && !state.modbusMode);
  const motionReady = Boolean(modeReady && state?.manualMode && !state.active);
  const speedPresets = useMemo(() => [10, 25, 50, 100].filter((value) => value <= speedLimit + 0.001 || value === speedLimit), [speedLimit]);
  const stepValues = [0.1, 1, 10, 100] as const;

  const stopActiveJog = useCallback(() => {
    const active = activeJogRef.current;
    activeJogRef.current = null;
    if (!active) return;
    active.held = false;
    if (active.timer !== undefined) window.clearInterval(active.timer);
    // motionStop bypasses the ordinary queue; the explicit FALSE queued after
    // the start is a second guarantee that the axis bit cannot remain latched.
    void onMotionStop(active.leaseId).catch(() => undefined);
    void onCommand({ command: 'robot.axis.jog', machine: active.axis, direction: active.direction, value: false }).catch(() => undefined);
  }, [onCommand, onMotionStop]);
  useEffect(() => {
    const active = activeJogRef.current;
    if (!active) return;
    const sameRemoteJog = state?.activeJog?.axis === active.axis && state.activeJog.direction === active.direction;
    // Before the start response arrives, an old telemetry snapshot naturally
    // has no owner. It must not cancel a finger that is still physically held.
    if (!motionReady || (active.accepted && (!state?.owned || !sameRemoteJog))) stopActiveJog();
  }, [motionReady, state?.owned, state?.activeJog, stopActiveJog]);
  useEffect(() => () => stopActiveJog(), [stopActiveJog]);

  const handleJog = (axis: number, direction: JogDirection, active: boolean) => {
    if (active) {
      stopActiveJog();
      const operation: NonNullable<typeof activeJogRef.current> = {
        axis, direction, leaseId: createMotionLeaseId(), held: true, accepted: false, pulsePending: false,
      };
      activeJogRef.current = operation;
      void onCommand({ command: 'robot.axis.jog', machine: axis, direction, value: true, leaseId: operation.leaseId })
        .then((result) => {
          if (result?.leaseId !== operation.leaseId || activeJogRef.current !== operation || !operation.held) {
            void onMotionStop(operation.leaseId).catch(() => undefined);
            return;
          }
          operation.accepted = true;
          operation.timer = window.setInterval(() => {
            if (!operation.held || operation.pulsePending || activeJogRef.current !== operation) return;
            operation.pulsePending = true;
            void onMotionHeartbeat(operation.leaseId).catch(() => {
              if (activeJogRef.current === operation) stopActiveJog();
            }).finally(() => { operation.pulsePending = false; });
          }, 300);
        });
    } else if (activeJogRef.current?.axis === axis && activeJogRef.current.direction === direction) {
      stopActiveJog();
    }
  };
  const allowed = (axis: number, direction: JogDirection) => {
    const item = axes[axis - 1];
    return Boolean(item && (robot?.continuousMode
      ? direction === 'positive' ? item.jogPositiveAllowed : item.jogNegativeAllowed
      : direction === 'positive' ? item.moveRelativePositiveAllowed : item.moveRelativeNegativeAllowed));
  };
  const directionButton = (axis: number, direction: JogDirection, label: string, arrow: string) => robot?.continuousMode
    ? <MobileJogButton axis={axis} direction={direction} label={label} arrow={arrow} allowed={allowed(axis, direction)} online={motionReady} onJog={(active) => handleJog(axis, direction, active)} />
    : <MobileStepButton axis={axis} direction={direction} label={label} arrow={arrow} allowed={allowed(axis, direction)} online={motionReady} onStep={() => { void onCommand({ command: 'robot.axis.moveRelative', machine: axis, value: (direction === 'positive' ? 1 : -1) * (robot?.manualStep ?? 1), leaseId: createMotionLeaseId() }); }} />;

  return <section className="mobile-jog" aria-label="Мобильный пульт управления роботом">
    <div className="mobile-jog__status">
      <div><span>Режим робота</span><strong>{state?.manualMode ? 'Ручной' : 'Автомат'}</strong></div>
      <div><span>Приводы</span><strong>{robot?.drivesPowered ? 'Включены' : robot?.drivesOff ? 'Выключены' : 'Не готовы'}</strong></div>
      <div><span>PLC</span><strong className={state?.online ? 'is-online' : ''}>{state?.online ? 'Подключен' : 'Нет связи'}</strong></div>
    </div>
    <div className="mobile-jog__toolbar">
      <button type="button" className={cn('mobile-jog__mode', robot?.continuousMode && 'is-active')} disabled={!modeReady || robot?.continuousMode} onClick={() => { stopActiveJog(); onCommand({ command: 'robot.continuousMode', value: true }); }}>Непрерывный</button>
      <button type="button" className={cn('mobile-jog__mode', !robot?.continuousMode && 'is-active')} disabled={!modeReady || !robot?.continuousMode} onClick={() => { stopActiveJog(); onCommand({ command: 'robot.continuousMode', value: false }); }}>Шаговый</button>
    </div>
    <div className="mobile-jog__drive-actions">
      <button type="button" disabled={!state?.online} onClick={() => onCommand({ command: robot?.drivesPowered ? 'robot.disableDrives' : 'robot.enableDrives' })}><Power size={16} />{robot?.drivesPowered ? 'Отключить приводы' : 'Включить приводы'}</button>
      <button type="button" disabled={!state?.online} onClick={() => onCommand({ command: 'robot.reset' })}><RotateCcw size={16} />Сброс</button>
    </div>
    {!state?.online ? <p className="mobile-jog__notice is-error"><AlertCircle size={16} />Нет связи с PLC. Управление недоступно.</p>
      : state.modbusMode ? <p className="mobile-jog__notice is-error"><AlertCircle size={16} />Мобильный JOG доступен только в режиме SoftMotion.</p>
        : !state.manualMode ? <p className="mobile-jog__notice is-error"><AlertCircle size={16} />Переведите ячейку в ручной режим.</p>
          : state.active ? <p className="mobile-jog__notice is-error"><AlertCircle size={16} />Сейчас выполняется проверка точки. Дождитесь останова робота.</p>
          : <>
            <div className="mobile-jog__pad">
              <div className="mobile-jog__xy"><span>XY</span><div className="mobile-jog__xy-pad">
                {directionButton(2, 'positive', 'Y+', '⌃')}
                {directionButton(1, 'negative', 'X−', '‹')}
                <div className="mobile-jog__pad-center" aria-hidden="true" />
                {directionButton(1, 'positive', 'X+', '›')}
                {directionButton(2, 'negative', 'Y−', '⌄')}
              </div></div>
              <div className="mobile-jog__z"><span>Z</span>
                {directionButton(3, 'negative', 'Z−', '↑')}
                {directionButton(3, 'positive', 'Z+', '↓')}
              </div>
            </div>
            {robot?.continuousMode ? <div className="mobile-jog__speed">
              <div><span>Скорость JOG</span><strong>{formatNumber(speed, speed % 1 ? 1 : 0)} %</strong></div>
              <input type="range" min={0.1} max={speedLimit} step={0.1} value={speed} disabled={!modeReady} aria-label="Скорость JOG" onChange={(event) => onCommand({ command: 'robot.speedOverride', value: Math.min(Number(event.target.value), speedLimit) })} />
              <div className="mobile-jog__presets">{speedPresets.map((value) => <button type="button" key={value} className={Math.abs(speed - value) < 0.05 ? 'is-active' : ''} disabled={!modeReady} onClick={() => onCommand({ command: 'robot.speedOverride', value: Math.min(value, speedLimit) })}>{value}%</button>)}</div>
              <p>Глобальный лимит телефона: <strong>{formatNumber(speedLimit, speedLimit % 1 ? 1 : 0)} %</strong></p>
            </div> : <div className="mobile-jog__speed mobile-jog__step">
              <div><span>Шаг перемещения</span><strong>{formatNumber(robot?.manualStep ?? 1, 1)} мм</strong></div>
              <div className="mobile-jog__presets">{stepValues.map((value) => <button type="button" key={value} className={Math.abs((robot?.manualStep ?? 1) - value) < 0.001 ? 'is-active' : ''} disabled={!modeReady} onClick={() => onCommand({ command: 'robot.manualStep', value })}>{value} мм</button>)}</div>
              <p>Скорость движения ограничена телефоном: <strong>{formatNumber(speedLimit, speedLimit % 1 ? 1 : 0)} %</strong></p>
            </div>}
          </>}
    <div className="mobile-jog__coordinates"><span>X <strong>{formatNumber(axes[0]?.actualPosition ?? state?.coordinates.x ?? 0, 1)}</strong></span><span>Y <strong>{formatNumber(axes[1]?.actualPosition ?? state?.coordinates.y ?? 0, 1)}</strong></span><span>Z <strong>{formatNumber(axes[2]?.actualPosition ?? state?.coordinates.z ?? 0, 1)}</strong></span><em>мм</em></div>
    <button type="button" className={button({ tone: 'danger' })} disabled={!state?.online} onClick={() => { stopActiveJog(); onStop(); }}>СТОП</button>
    {robot?.rejectReason && robot.commandBusy && <p className="mobile-jog__notice is-error"><AlertCircle size={16} />{robot.rejectReason}</p>}
  </section>;
}

class MobileApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin', cache: 'no-store', ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw new MobileApiError(body?.error ?? `Gateway: HTTP ${response.status}`, response.status);
  return body;
}

export function MobilePointsApp() {
  const [session, setSession] = useState<Session>({ authenticated: false, user: null });
  const [state, setState] = useState<MobileState | null>(null);
  const [view, setView] = useState<'points' | 'jog'>('points');
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(pointDraft());
  const [baseline, setBaseline] = useState<Draft>(pointDraft());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'check' | 'discard' | null>(null);
  const lastDialogKind = useRef<'check' | 'discard'>('check');
  const dialogKind = dialog ?? lastDialogKind.current;
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [checkPhase, setCheckPhase] = useState<CheckPhase>('ready');
  const [checkHold] = useState(() => createPointCheckHold({
    prepare: () => api<{ holdId: string }>('/api/mobile-points/action', { method: 'POST', body: JSON.stringify({ action: 'prepareCheck' }) }),
    start: (payload) => api<ActionResult>('/api/mobile-points/action', { method: 'POST', body: JSON.stringify({ action: 'check', ...payload }) }),
    pulse: (holdId) => api('/api/mobile-points/action', { method: 'POST', body: JSON.stringify({ action: 'holdCheck', holdId }) }),
    // Release must bypass any pending command and survive pagehide when possible.
    stop: (holdId) => api('/api/mobile-points/action', { method: 'POST', keepalive: true, body: JSON.stringify({ action: 'stop', holdId }) }),
    onPhase: setCheckPhase,
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError)),
  }));
  const lastFocus = useRef<HTMLElement | null>(null);
  const initialized = useRef(false);
  const robotQueueRef = useRef(Promise.resolve());
  const sessionRef = useRef(session);
  const sessionRevisionRef = useRef(0);
  const sessionMonitorRef = useRef<ReturnType<typeof watchMobileSession> | null>(null);
  const dirty = draft.x !== baseline.x || draft.y !== baseline.y || draft.z !== baseline.z || draft.speed !== baseline.speed;
  const valid = [draft.x, draft.y, draft.z, draft.speed].every((value) => value.trim() && Number.isFinite(parseNumber(value)))
    && parseNumber(draft.speed) > 0.1 && parseNumber(draft.speed) <= 1;
  const selected = state?.points[index];
  const running = Boolean(state?.active && state.owned);
  const controlled = Boolean(state?.owned);
  const connectionMessage = !session.authenticated
    ? (session.cellUser ? 'Войдите в мобильный пульт' : 'Сначала войдите на основном HMI')
    : state?.online ? 'Связь с PLC установлена' : error ? 'Нет связи с gateway' : 'Ожидание связи с PLC';

  const applySession = useCallback((next: Session) => {
    const previous = sessionRef.current;
    if (previous.authenticated !== next.authenticated || previous.user?.id !== next.user?.id) {
      checkHold.release();
      sessionRevisionRef.current += 1;
      setState(null);
      initialized.current = false;
      setIndex(0);
      setDialog(null);
      setMessage('');
    }
    sessionRef.current = next;
    setSession(next);
  }, [checkHold]);

  const refresh = useCallback(async (visible = !document.hidden) => {
    if (!sessionRef.current.authenticated) return;
    const revision = sessionRevisionRef.current;
    try {
      const next = await api<MobileState>(`/api/mobile-points/state?visible=${visible ? 1 : 0}`);
      if (revision !== sessionRevisionRef.current) return;
      setState(next);
      checkHold.observe(next);
      if (!initialized.current && next.points.length === 12) {
        const initial = pointDraft(next.points[0]);
        setDraft(initial); setBaseline(initial); initialized.current = true;
      }
      setError('');
    } catch (nextError) {
      if (revision !== sessionRevisionRef.current) return;
      const text = nextError instanceof Error ? nextError.message : String(nextError);
      setError(text);
      checkHold.release();
      setState(null);
      if (nextError instanceof MobileApiError && nextError.status === 401) {
        sessionMonitorRef.current?.replace({ authenticated: false, user: null, cellUser: null });
        void sessionMonitorRef.current?.refresh();
      }
    }
  }, [checkHold]);

  useEffect(() => () => checkHold.release(), [checkHold]);

  useEffect(() => {
    const monitor = watchMobileSession({
      read: () => api<Session>('/api/mobile-points/session'),
      onSession: applySession,
      onError: (nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError)),
    });
    sessionMonitorRef.current = monitor;
    const visibility = () => { if (!document.hidden) void monitor.refresh(); };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      monitor.stop();
      if (sessionMonitorRef.current === monitor) sessionMonitorRef.current = null;
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [applySession]);

  useEffect(() => {
    if (!session.authenticated) return;
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(true); }, 400);
    const visibility = () => { void refresh(!document.hidden); };
    document.addEventListener('visibilitychange', visibility);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [session.authenticated, refresh]);

  const perform = async (action: 'capture' | 'save' | 'stop') => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<ActionResult>('/api/mobile-points/action', {
        method: 'POST', body: JSON.stringify({ action, index: index + 1, speedFactor: parseNumber(draft.speed), draft: {
          x: parseNumber(draft.x), y: parseNumber(draft.y), z: parseNumber(draft.z), speedFactor: parseNumber(draft.speed),
        } }),
      });
      if (result.point && action === 'capture') setDraft((current) => ({ ...current, x: formatNumber(result.point!.x), y: formatNumber(result.point!.y), z: formatNumber(result.point!.z) }));
      if (result.point && action === 'save') {
        const saved = pointDraft(result.point); setDraft(saved); setBaseline(saved);
      }
      setMessage(action === 'capture' ? 'Текущие координаты перенесены в черновик.'
        : action === 'save' ? 'Точка сохранена и подтверждена PLC.'
          : 'Остановка передана в PLC.');
      await refresh();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); }
    finally { setBusy(false); }
  };

  const sendRobotCommand = useCallback((command: RobotCommand): Promise<ActionResult | undefined> => {
    const revision = sessionRevisionRef.current;
    const run = async () => {
      if (!sessionRef.current.authenticated || revision !== sessionRevisionRef.current) return undefined;
      setError('');
      try {
        const result = await api<ActionResult>('/api/mobile-points/action', {
          method: 'POST', body: JSON.stringify({ action: 'robot', ...command }),
        });
        if (revision !== sessionRevisionRef.current) return;
        if (command.command === 'robot.speedOverride' && result.appliedValue !== undefined) {
          setMessage(`Скорость JOG установлена: ${formatNumber(result.appliedValue, result.appliedValue % 1 ? 1 : 0)} %.`);
        } else if (command.command === 'robot.axis.moveRelative') {
          setMessage('Команда шагового перемещения передана в PLC. При потере связи движение будет остановлено.');
        }
        return result;
      } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); }
      finally { await refresh(); }
      return undefined;
    };
    const result = robotQueueRef.current.then(run, run);
    robotQueueRef.current = result.then(() => undefined, () => undefined);
    return result;
  }, [refresh]);
  const stopRobot = useCallback(() => {
    void api<ActionResult>('/api/mobile-points/action', {
      method: 'POST', keepalive: true, body: JSON.stringify({ action: 'robot', command: 'robot.stop' }),
    }).then(() => refresh()).catch((nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError)));
  }, [refresh]);
  const heartbeatMobileMotion = useCallback((leaseId: string) => api('/api/mobile-points/action', {
    method: 'POST', body: JSON.stringify({ action: 'motionHeartbeat', leaseId }),
  }), []);
  const stopMobileMotion = useCallback((leaseId: string) => api('/api/mobile-points/action', {
    method: 'POST', keepalive: true, body: JSON.stringify({ action: 'motionStop', leaseId }),
  }), []);

  const choose = (nextIndex: number) => {
    const next = pointDraft(state?.points[nextIndex]);
    setIndex(nextIndex); setDraft(next); setBaseline(next); setMessage(''); setError('');
  };
  const openDialog = (kind: 'check' | 'discard') => {
    lastFocus.current = document.activeElement as HTMLElement;
    lastDialogKind.current = kind;
    if (kind === 'check') { setCheckPhase('ready'); setError(''); }
    setDialog(kind);
  };
  const logout = async () => {
    setBusy(true);
    try { await api('/api/mobile-points/logout', { method: 'POST' }); }
    finally {
      sessionMonitorRef.current?.replace({ authenticated: false, user: null, cellUser: null });
      void sessionMonitorRef.current?.refresh();
      setBusy(false);
    }
  };

  return <div className="mobile-points">
    <header className="mobile-points__header"><div><h1>{view === 'jog' ? 'Пульт JOG' : 'Точки робота'}</h1><p>{session.authenticated ? `${session.user?.displayName} · ${session.user?.role}` : 'Мобильный доступ'}</p></div>
      {session.authenticated && <button className="mobile-points__text-button" disabled={busy || controlled} onClick={() => { if (dirty) { setPendingIndex(null); openDialog('discard'); } else void logout(); }}>Выйти</button>}
    </header>
    <div className={cn('mobile-points__connection', state?.online && 'is-online')}><Info size={17} /><span>{connectionMessage}</span></div>
    {!session.authenticated ? <main className="mobile-points__main mobile-points__login">
      <h2>Вход в редактор</h2><p>Используйте аккаунт, который открыт на основном экране ячейки.</p>
      <div className="mobile-points__account"><span>На ячейке</span><strong>{session.cellUser ? `${session.cellUser.displayName} · ${session.cellUser.role}` : 'Нет активного аккаунта'}</strong></div>
      <form onSubmit={async (event) => {
        event.preventDefault(); setBusy(true); setError('');
        const data = new FormData(event.currentTarget);
        try {
          const next = await api<Session>('/api/mobile-points/login', { method: 'POST', body: JSON.stringify({ username: data.get('username'), password: data.get('password') }) });
          sessionMonitorRef.current?.replace(next); initialized.current = false; await refresh();
        } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); }
        finally { setBusy(false); }
      }}>
        <label className="mobile-points__field">Логин<input name="username" autoCapitalize="none" autoComplete="username" required /></label>
        <label className="mobile-points__field">Пароль<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p className="mobile-points__notice is-error" role="alert">{error}</p>}
        <button className={button({ tone: 'primary' })} disabled={busy}>{busy ? 'Проверка…' : 'Войти'}</button>
      </form>
    </main> : <>
      <nav className="mobile-points__view-tabs" aria-label="Разделы мобильного управления">
        <button type="button" className={view === 'points' ? 'is-active' : ''} disabled={controlled} onClick={() => setView('points')}>Точки</button>
        <button type="button" className={view === 'jog' ? 'is-active' : ''} disabled={controlled} onClick={() => setView('jog')}>Пульт JOG</button>
      </nav>
      {view === 'jog' ? <main className="mobile-points__main mobile-points__jog-main"><MobileRobotRemote state={state} onCommand={sendRobotCommand} onStop={stopRobot} onMotionHeartbeat={heartbeatMobileMotion} onMotionStop={stopMobileMotion} />
        {message && <p className="mobile-points__notice" role="status">{message}</p>}
        {error && <p className="mobile-points__notice is-error" role="alert">{error}</p>}
      </main> : <main className="mobile-points__main">
      <label className="mobile-points__field">Выберите точку<select value={index} disabled={busy || running || controlled} onChange={(event) => { const next = Number(event.target.value); if (dirty) { setPendingIndex(next); openDialog('discard'); } else choose(next); }}>{labels.map((label, pointIndex) => <option value={pointIndex} key={label}>{label}</option>)}</select></label>
      <div className="mobile-points__meta"><span>Точка {index + 1} из 12</span><span className={dirty || !selected?.configured ? 'is-dirty' : 'is-saved'}>{dirty || !selected?.configured ? 'Не сохранена' : 'Сохранена'}</span></div>
      <h2>Координаты точки</h2>
      <div className="mobile-points__coordinates">{(['x', 'y', 'z'] as const).map((axis) => <label className="mobile-points__coordinate" key={axis}><span>{axis.toUpperCase()}</span><input aria-label={`Координата ${axis.toUpperCase()}`} inputMode="decimal" value={draft[axis]} disabled={busy || running || controlled} onChange={(event) => { setDraft((current) => ({ ...current, [axis]: event.target.value })); setMessage(''); }} /><span>мм</span></label>)}</div>
      <label className="mobile-points__field mobile-points__speed">Коэффициент скорости точки<div><input aria-label="Коэффициент скорости точки" inputMode="decimal" value={draft.speed} disabled={busy || running || controlled} onChange={(event) => setDraft((current) => ({ ...current, speed: event.target.value }))} /><span>×</span></div></label>
      {!valid && <p className="mobile-points__notice is-error" role="alert">XYZ должны быть числами. Коэффициент скорости: от 0,11 до 1,00.</p>}
      <button className={cn(button(), !state?.captureAllowed && 'is-unavailable')} disabled={busy || running || controlled || !state?.online} aria-disabled={!state?.captureAllowed} onClick={() => void perform('capture')}>Взять текущие координаты</button>
      <div className="mobile-points__check-speed"><span>Скорость проверки</span><strong>{formatNumber(state?.checkSpeedPercent ?? 10, 1)} %</strong></div>
      {running ? <section className="mobile-points__running" aria-live="polite"><strong>Проверка точки выполняется</strong><p>Дождитесь останова робота.</p><button className={button({ tone: 'danger' })} disabled={busy} onClick={() => void perform('stop')}>Остановить проверку</button></section> : <div className="mobile-points__actions">
        <button className={cn(button({ tone: 'primary' }), !state?.saveAllowed && 'is-unavailable')} disabled={busy || controlled || !valid || !state?.online} aria-disabled={!state?.saveAllowed} onClick={() => void perform('save')}>Сохранить точку</button>
        <button className={cn(button(), !selected?.checkAllowed && 'is-unavailable')} disabled={busy || controlled || dirty || !valid || !selected?.configured || !state?.online} aria-disabled={!selected?.checkAllowed} onClick={() => openDialog('check')}>Проверить точку</button>
      </div>}
      {dirty && <p className="mobile-points__footer-note">Сначала сохраните изменения</p>}
      {message && <p className="mobile-points__notice" role="status">{message}</p>}
      {error && <p className="mobile-points__notice is-error" role="alert">{error}</p>}
    </main>}
    </>}
    <Dialog.Root open={dialog !== null} onOpenChange={(open) => { if (!open) { checkHold.release(); setDialog(null); } }}><Dialog.Portal><Dialog.Overlay className="mobile-points-dialog__overlay" /><Dialog.Content className="mobile-points-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); lastFocus.current?.focus(); }}>
      <Dialog.Title>{dialogKind === 'check' ? 'Проверка точки' : 'Изменения не сохранены'}</Dialog.Title>
      <Dialog.Description>{dialogKind === 'check' ? 'Освободите рабочую зону. Движение разрешено только пока вы удерживаете кнопку. Отпускание передаёт команду остановки.' : 'Отбросить изменения текущей точки?'}</Dialog.Description>
      {dialogKind === 'check' && selected && <div className="mobile-points-dialog__summary"><strong>{labels[index]}</strong><span>X {baseline.x} · Y {baseline.y} · Z {baseline.z}</span><span>Скорость проверки: {formatNumber(state?.checkSpeedPercent ?? 10, 1)} %</span></div>}
      {dialogKind === 'check' ? <section className="mobile-point-check">
        <p role="status" aria-live="polite">{{ ready: 'Готово к удержанию', starting: 'Передаём команду — удерживайте', moving: 'Движение — удерживайте кнопку', stopping: 'Палец отпущен. Ожидаем остановки PLC…', completed: 'Точка достигнута. Проверка завершена.', stopped: 'Проверка остановлена.', error: 'Проверка прервана. Проверьте сообщение ниже.' }[checkPhase]}</p>
        <MobileHoldButton className="mobile-point-check__hold"
          disabled={dialog !== 'check' || !state?.online || checkPhase === 'stopping' || checkPhase === 'completed'
            || (controlled && ['ready', 'stopped', 'error'].includes(checkPhase))}
          onHold={(held) => {
            if (!held) { checkHold.release(); return; }
            setError('');
            checkHold.press({ index: index + 1, draft: { x: parseNumber(baseline.x), y: parseNumber(baseline.y), z: parseNumber(baseline.z), speedFactor: parseNumber(baseline.speed) } });
          }}>
          <strong>{checkPhase === 'completed' ? 'Проверка завершена' : 'Удерживайте для движения'}</strong>
          <span>Отпустите палец — остановка</span>
        </MobileHoldButton>
        <p className="mobile-point-check__note">После отпускания дождитесь фактического останова. Экранная кнопка не заменяет аппаратный аварийный останов.</p>
        {error && <p className="mobile-points__notice is-error" role="alert">{error}</p>}
      </section> : <div className="mobile-points-dialog__actions"><Dialog.Close asChild><button className={button()}>Отмена</button></Dialog.Close><button className={button({ tone: 'primary' })} onClick={() => { if (pendingIndex === null) { setDraft(baseline); void logout(); } else choose(pendingIndex); setDialog(null); }}>Отбросить</button></div>}
      <Dialog.Close asChild><button className="mobile-points-dialog__close" aria-label="Закрыть окно">Закрыть</button></Dialog.Close>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
