import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '@iconify/react';
import arrowIcon from '@iconify-icons/material-symbols/arrow-forward';
import targetIcon from '@iconify-icons/material-symbols/my-location';
import homeIcon from '@iconify-icons/material-symbols/home-outline';
import touchIcon from '@iconify-icons/material-symbols/touch-app-outline';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/utils';
import type { PlcCommand, PlcRuntimeInfo } from '../plc/client';
import { SegmentedControl } from './ui/ControlPrimitives';
import { RobotSpeedEditor } from './RobotSpeedEditor';
import { RobotAxisDial } from './RobotAxisDial';
import { RobotMotionSettings } from './RobotMotionSettings';

const AXES = ['X', 'Y', 'Z'] as const;
const STEPS = [0.1, 1, 10, 100];
type Direction = 'negative' | 'positive';
const commandClass = cva('rj-button', {
  variants: { unavailable: { true: 'command-unavailable', false: '' }, primary: { true: 'rj-primary', false: '' } },
});

function JogKey({ axis, direction, allowed, online, continuous, step, onJog, onStep }: {
  axis: string;
  direction: Direction;
  allowed: boolean;
  online: boolean;
  continuous: boolean;
  step: number;
  onJog: (active: boolean) => void;
  onStep: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const heldRef = useRef(false);
  const keyboardHeldRef = useRef(false);
  const pointerRef = useRef<number | null>(null);
  const onJogRef = useRef(onJog);
  onJogRef.current = onJog;
  const finish = (event?: ReactPointerEvent<HTMLButtonElement>) => {
    if (event && pointerRef.current !== event.pointerId) return;
    pointerRef.current = null;
    keyboardHeldRef.current = false;
    setPressed(false);
    if (heldRef.current) {
      heldRef.current = false;
      onJogRef.current(false);
    }
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const start = () => {
    setPressed(true);
    if (continuous && !heldRef.current) {
      heldRef.current = true;
      onJogRef.current(true);
    }
  };
  useEffect(() => {
    const release = () => finish();
    const visibility = () => { if (document.hidden) release(); };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', visibility);
      if (heldRef.current) {
        heldRef.current = false;
        onJogRef.current(false);
      }
    };
  }, []);
  useEffect(() => { if (!online) finish(); }, [online]);
  const negative = direction === 'negative';
  return <button
    type="button"
    className={cn('rj-key', commandClass({ unavailable: !allowed }))}
    data-direction={direction}
    data-pressed={pressed}
    disabled={!online}
    aria-disabled={!allowed || !online}
    aria-label={`${axis} ${negative ? 'в минус' : 'в плюс'}: ${continuous ? 'удерживать для движения' : `шаг ${step} мм`}`}
    onPointerDown={(event) => {
      if (event.button !== 0 || pointerRef.current !== null) return;
      event.preventDefault();
      pointerRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      start();
    }}
    onPointerUp={finish}
    onPointerCancel={finish}
    onLostPointerCapture={finish}
    onBlur={() => finish()}
    onKeyDown={(event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (!event.repeat && !keyboardHeldRef.current && pointerRef.current === null) {
        keyboardHeldRef.current = true;
        start();
      }
    }}
    onKeyUp={(event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      finish();
    }}
    onClick={() => { if (!continuous) onStep(); }}
  >
    <span className="rj-key-wave" aria-hidden="true" />
    <Icon icon={arrowIcon} aria-hidden="true" />
    <strong>{axis}<span>{negative ? '−' : '+'}</span></strong>
    <small>{continuous ? 'Удерживать' : `${negative ? '−' : '+'} ${step} мм`}</small>
  </button>;
}

export function RobotJogConsole({ runtime, online, selectedAxis, continuous, target, onSelectAxis, onModeChange,
  onTargetChange, onTargetFocus, onTargetBlur, onJog, onSend, numericTarget,
}: {
  runtime: PlcRuntimeInfo;
  online: boolean;
  selectedAxis: number;
  continuous: boolean;
  target: string;
  onSelectAxis: (axis: number) => void;
  onModeChange: (continuous: boolean) => void;
  onTargetChange: (value: string) => void;
  onTargetFocus: () => void;
  onTargetBlur: () => void;
  onJog: (direction: Direction, active: boolean) => void;
  onSend: (command: PlcCommand) => void;
  numericTarget: () => number;
}) {
  const axis = runtime.axisManual[selectedAxis - 1];
  const name = AXES[selectedAxis - 1];
  const previousPosition = useRef({ axis: selectedAxis, value: axis.actualPosition, time: 0, online });
  const [motion, setMotion] = useState<{ axis: number; direction: Direction; speedRatio: number } | null>(null);
  useEffect(() => {
    const previous = previousPosition.current;
    const time = performance.now();
    previousPosition.current = { axis: selectedAxis, value: axis.actualPosition, time, online };
    const delta = axis.actualPosition - previous.value;
    if (!online || !previous.online || previous.axis !== selectedAxis || Math.abs(delta) < 0.00001) {
      setMotion(null);
      return;
    }
    // Estimated speed controls only the visual tempo, not robot motion.
    const elapsed = Math.max(0.05, (time - previous.time) / 1000);
    const speedRatio = Math.min(1, Math.abs(delta) / elapsed / Math.max(1, axis.maxVelocity));
    setMotion({ axis: selectedAxis, direction: delta > 0 ? 'positive' : 'negative', speedRatio });
    const timeout = window.setTimeout(() => setMotion(null), 500);
    return () => window.clearTimeout(timeout);
  }, [axis.actualPosition, axis.maxVelocity, selectedAxis, online]);
  const direction = online && motion?.axis === selectedAxis ? motion.direction : null;
  const moving = direction !== null;
  const progress = Math.max(0, Math.min(100, (axis.actualPosition - axis.minPosition) / Math.max(1, axis.maxPosition - axis.minPosition) * 100));
  const validTarget = target.trim() !== '' && Number.isFinite(Number(target.replace(',', '.')));

  return <div className="rj-console" data-moving={moving} data-direction={direction ?? 'none'}>
    <section className="rj-surface rj-control">
      <div className="rj-section-head"><div><span className="rj-eyebrow">РУЧНОЕ ПОЗИЦИОНИРОВАНИЕ</span><h3>Пульт перемещения</h3></div><span className="rj-status" data-moving={moving} data-error={axis.error}><i />{!online ? 'Нет связи' : axis.error ? 'Авария оси' : moving ? 'В движении' : axis.busy ? 'Выполняется' : axis.driveReady ? 'Готов к движению' : 'Привод не готов'}</span></div>

      <SegmentedControl className="rj-axis-selector" value={String(selectedAxis)} onChange={(value) => onSelectAxis(Number(value))} ariaLabel="Выбор оси робота" thumbFullHeight options={AXES.map((axisName, index) => ({
        value: String(index + 1),
        label: <span className="rj-axis-option"><span><b>{axisName}</b><i data-ready={runtime.axisManual[index].driveReady} data-busy={online && runtime.axisManual[index].busy} /></span><strong>{runtime.axisManual[index].actualPosition.toFixed(1)}<small>мм</small></strong></span>,
      }))} />

      <SegmentedControl className="rj-mode-selector" value={continuous ? 'continuous' : 'precise'} onChange={(value) => onModeChange(value === 'continuous')} ariaLabel="Режим перемещения" options={[
        { value: 'continuous', label: <><Icon icon={touchIcon} />Непрерывно</> },
        { value: 'precise', label: <><Icon icon={targetIcon} />Точное перемещение</> },
      ]} />

      <div className="rj-pad" aria-label={`Пульт оси ${name}`}>
        <JogKey key={`${selectedAxis}-${continuous}-negative`} axis={name} direction="negative" continuous={continuous} step={runtime.manualStep} online={online} allowed={continuous ? axis.jogNegativeAllowed : axis.moveRelativeNegativeAllowed} onJog={(active) => onJog('negative', active)} onStep={() => onSend({ command: 'robot.axis.moveRelative', machine: selectedAxis, value: -runtime.manualStep })} />
        <RobotAxisDial key={selectedAxis} name={name} direction={direction} speedRatio={motion?.axis === selectedAxis ? motion.speedRatio : 0} continuous={continuous} online={online} error={axis.error} ready={axis.driveReady} busy={axis.busy} />
        <JogKey key={`${selectedAxis}-${continuous}-positive`} axis={name} direction="positive" continuous={continuous} step={runtime.manualStep} online={online} allowed={continuous ? axis.jogPositiveAllowed : axis.moveRelativePositiveAllowed} onJog={(active) => onJog('positive', active)} onStep={() => onSend({ command: 'robot.axis.moveRelative', machine: selectedAxis, value: runtime.manualStep })} />
      </div>

      <div className="rj-travel"><div className="rj-travel-track"><i style={{ width: `${progress}%` }} /><b style={{ left: `${progress}%` }} /></div><div><span>{axis.minPosition.toFixed(0)} мм</span><span>Диапазон оси {name}</span><span>{axis.maxPosition.toFixed(0)} мм</span></div></div>
      <p className="rj-hint">{runtime.manualRecoveryActive ? 'Аварийное восстановление: непрерывное движение одной оси' : continuous ? 'Удерживайте направление. Отпустите, чтобы остановить ось.' : 'Одно нажатие — один шаг выбранной длины.'}</p>

      {!continuous && <div className="rj-precision">
        <div className="rj-step-heading"><span>Длина шага</span><small>мм</small></div>
        <SegmentedControl className="rj-step-selector" value={String(runtime.manualStep)} options={STEPS.map((value) => ({ value: String(value), label: String(value).replace('.', ',') }))} disabled={!online} onChange={(value) => onSend({ command: 'robot.manualStep', value: Number(value) })} ariaLabel="Длина шага в миллиметрах" />
        <div className="rj-target-row">
          <label className="rj-target"><span>Целевая координата {name}</span><span><input value={target} inputMode="decimal" disabled={!online} aria-label={`Целевая координата ${name}`} aria-invalid={!validTarget} onFocus={onTargetFocus} onChange={(event) => onTargetChange(event.target.value)} onBlur={onTargetBlur} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><small>мм</small></span></label>
          <button type="button" className={commandClass({ primary: true, unavailable: !axis.moveAbsoluteAllowed })} disabled={!online || !validTarget} aria-disabled={!axis.moveAbsoluteAllowed || !online || !validTarget} onClick={() => onSend({ command: 'robot.axis.moveAbsolute', machine: selectedAxis, value: numericTarget() })}><Icon icon={arrowIcon} />Переместить</button>
        </div>
        <div className="rj-target-meta"><span>Отклонение от цели <b>{axis.deviation.toFixed(1)} мм</b></span><button type="button" className={commandClass({ unavailable: !axis.homeAllowed })} disabled={!online} aria-disabled={!axis.homeAllowed || !online} onClick={() => onSend({ command: 'robot.axis.home', machine: selectedAxis })}><Icon icon={homeIcon} />Home<i data-ready={axis.homed} /></button></div>
      </div>}
      {axis.rejectReason && <div className="rj-reject" role="status">{axis.rejectReason}</div>}
    </section>

    <section className="rj-surface rj-speed">
      <RobotSpeedEditor value={runtime.speedOverridePercent} online={online} onChange={(value) => onSend({ command: 'robot.speedOverride', value })} details={<><span>Заданная скорость <b>{axis.commandVelocity.toFixed(1)} мм/с</b></span><span>Максимум <b>{axis.maxVelocity.toFixed(0)} мм/с</b></span></>} />
    </section>
    <RobotMotionSettings settings={runtime.cellSettings.robotMotion} online={online} changeAllowed={runtime.cellSettings.changeAllowed} onSend={onSend} />
  </div>;
}
