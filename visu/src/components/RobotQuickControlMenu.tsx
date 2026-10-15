import * as Dialog from '@radix-ui/react-dialog';
import { Activity, AlertCircle, Box, Crosshair, LockKeyhole, RotateCcw, Save, UnlockKeyhole, X } from 'lucide-react';
import { Icon as ControlIcon } from '@iconify/react';
import homeIcon from '@iconify-icons/material-symbols/home-outline';
import touchIcon from '@iconify-icons/material-symbols/touch-app-outline';
import targetIcon from '@iconify-icons/material-symbols/my-location';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { cn } from '../lib/utils';
import type { CellState } from '../model/types';
import type { PlcCommand, PlcRuntimeInfo } from '../plc/client';
import { RangeInput, SegmentedControl } from './ui/ControlPrimitives';
import { Indicator } from './ui/Indicator';
import { RobotJogKey } from './RobotJogKey';
import { AXIS_HOMING_STATE, RobotAxisHomeButton } from './RobotAxisHomeButton';
import { currentRobotPointLabel, MANUAL_POINT_OPTIONS, robotActionCommand, type RobotManualAction } from './robotManualControl';
import './ui/control-primitives.css';
import './robot-extended-panel.css';
import './robot-quick-control-menu.css';

export type RobotQuickControl = 'position' | 'gripper1' | 'gripper2' | 'rotation';
type PositionView = 'points' | 'remote' | 'home';
type JogDirection = 'positive' | 'negative';
type ActiveJog = { axis: number; direction: JogDirection } | null;

const AXES = ['X', 'Y', 'Z'] as const;
const STEP_VALUES = [0.1, 1, 10, 100] as const;
const SPEED_PRESETS = [10, 25, 50, 100] as const;
const TITLES: Record<RobotQuickControl, string> = {
  position: 'Переход к точке', gripper1: 'Захват 1 — заготовка',
  gripper2: 'Захват 2 — деталь', rotation: 'Поворот двойного захвата',
};

export function RobotQuickControlMenu({
  control, open, robot, coordinates, magazines, manual, axisManual, continuousMode, manualStep,
  speedOverridePercent, modbusMode, online, triggerRef, onOpenChange, onSend,
}: {
  control: RobotQuickControl;
  open: boolean;
  robot: CellState['robot'];
  coordinates: { x: number; y: number; z: number };
  magazines: CellState['magazines'];
  manual: PlcRuntimeInfo['robotManual'];
  axisManual: PlcRuntimeInfo['axisManual'];
  continuousMode: boolean;
  manualStep: number;
  speedOverridePercent: number;
  modbusMode: boolean;
  online: boolean;
  triggerRef: RefObject<HTMLButtonElement>;
  onOpenChange: (open: boolean) => void;
  onSend: (command: PlcCommand) => void;
}) {
  const [point, setPoint] = useState(1);
  const [magazine, setMagazine] = useState(1);
  const [slot, setSlot] = useState('1');
  const [positionView, setPositionView] = useState<PositionView>('points');
  const activeJogRef = useRef<ActiveJog>(null);
  const onlineRef = useRef(online);
  const onSendRef = useRef(onSend);
  onlineRef.current = online;
  onSendRef.current = onSend;

  const maxSlot = Math.max(1, Math.min(120, magazines[magazine - 1].state.rows * magazines[magazine - 1].state.columns));
  const slotNumber = Number(slot);
  const slotValid = Number.isInteger(slotNumber) && slotNumber >= 1 && slotNumber <= maxSlot;
  const magazinePoint = point >= 14 && point <= 16;
  const Icon = control === 'position' ? Activity : control === 'rotation' ? RotateCcw : Box;
  const state = !online ? 'Нет данных' : control === 'position' ? currentRobotPointLabel(robot.currentPoint)
    : control === 'rotation' ? robot.rotatedToBlank ? 'К заготовке' : robot.rotatedToDetail ? 'К детали' : 'Не определена'
      : control === 'gripper1' ? robot.gripper1Closed ? 'Закрыт' : robot.gripper1Open ? 'Открыт' : 'Движение'
        : robot.gripper2Closed ? 'Закрыт' : robot.gripper2Open ? 'Открыт' : 'Движение';
  const actions: { action: RobotManualAction; label: string; allowed: boolean }[] = control === 'gripper1'
    ? [{ action: 2, label: 'Открыть', allowed: manual.gripper1OpenAllowed }, { action: 3, label: 'Закрыть', allowed: manual.gripper1CloseAllowed }]
    : control === 'gripper2'
      ? [{ action: 4, label: 'Открыть', allowed: manual.gripper2OpenAllowed }, { action: 5, label: 'Закрыть', allowed: manual.gripper2CloseAllowed }]
      : [{ action: 6, label: 'К заготовке', allowed: manual.rotateToBlankAllowed }, { action: 7, label: 'К детали', allowed: manual.rotateToDetailAllowed }];
  const unavailable = control === 'position' ? !manual.pointsAllowed : actions.every((action) => !action.allowed);
  const speed = Math.max(0.1, Math.min(100, Number(speedOverridePercent) || 0.1));
  const modeReady = online && !modbusMode;
  const jogReady = modeReady && manual.drivesPowered && !manual.commandBusy && axisManual.some((axis) => continuousMode
    ? axis.jogPositiveAllowed || axis.jogNegativeAllowed
    : axis.moveRelativePositiveAllowed || axis.moveRelativeNegativeAllowed);
  const headerReady = positionView === 'points' ? online && manual.pointsAllowed
    : positionView === 'home' ? modeReady && axisManual.some((axis) => axis.homeAllowed) : jogReady;
  const warning = !online ? 'Нет связи с PLC. Управление недоступно.'
    : modbusMode && control === 'position' && positionView !== 'points' ? 'Мини-пульт доступен только в режиме SoftMotion.'
      : control === 'position' && positionView !== 'points' ? ''
        : unavailable ? manual.rejectReason : '';

  const send = (action: RobotManualAction) => {
    if (!online || (action === 1 && magazinePoint && !slotValid)) return;
    // Availability is visual only: PLC owns the final check and rejection warning.
    onSend(robotActionCommand(action, point, slotNumber, magazine));
  };
  const stopActiveJog = () => {
    const active = activeJogRef.current;
    activeJogRef.current = null;
    if (active && onlineRef.current) onSendRef.current({ command: 'robot.axis.jog', machine: active.axis, direction: active.direction, value: false });
  };
  const handleJog = (axis: number, direction: JogDirection, active: boolean) => {
    if (active) {
      stopActiveJog();
      activeJogRef.current = { axis, direction };
    } else if (activeJogRef.current?.axis === axis && activeJogRef.current.direction === direction) activeJogRef.current = null;
    if (onlineRef.current) onSendRef.current({ command: 'robot.axis.jog', machine: axis, direction, value: active });
  };
  const handleStep = (axis: number, direction: JogDirection) => {
    if (onlineRef.current) onSendRef.current({ command: 'robot.axis.moveRelative', machine: axis, value: (direction === 'positive' ? 1 : -1) * manualStep });
  };
  const setJogMode = (nextContinuous: boolean) => {
    stopActiveJog();
    if (online && continuousMode !== nextContinuous) onSend({ command: 'robot.continuousMode', value: nextContinuous });
  };

  useEffect(() => {
    if (!open || !online || control !== 'position' || positionView !== 'remote' || !continuousMode) stopActiveJog();
  }, [open, online, control, positionView, continuousMode]);
  useEffect(() => {
    const handleWindowBlur = () => stopActiveJog();
    window.addEventListener('blur', handleWindowBlur);
    return () => { window.removeEventListener('blur', handleWindowBlur); stopActiveJog(); };
  }, []);

  const directionProps = (axis: number, direction: JogDirection) => ({
    axis: AXES[axis - 1], direction, online: modeReady, continuous: continuousMode, step: manualStep,
    onJog: (active: boolean) => handleJog(axis, direction, active),
    onStep: () => handleStep(axis, direction),
    allowed: continuousMode
      ? direction === 'positive' ? axisManual[axis - 1].jogPositiveAllowed : axisManual[axis - 1].jogNegativeAllowed
      : direction === 'positive' ? axisManual[axis - 1].moveRelativePositiveAllowed : axisManual[axis - 1].moveRelativeNegativeAllowed,
  });
  const jogPad = <div key={continuousMode ? 'continuous' : 'step'} className="robot-mini-pad-body">
    <section className="robot-mini-xy"><span>XY</span><div className="robot-mini-xy-pad">
      <RobotJogKey {...directionProps(2, 'positive')} className="robot-mini-jog-key y-positive" arrow="up" />
      <RobotJogKey {...directionProps(1, 'negative')} className="robot-mini-jog-key x-negative" arrow="left" />
      <div className="robot-mini-pad-center" aria-hidden="true" />
      <RobotJogKey {...directionProps(1, 'positive')} className="robot-mini-jog-key x-positive" arrow="right" />
      <RobotJogKey {...directionProps(2, 'negative')} className="robot-mini-jog-key y-negative" arrow="down" />
    </div></section>
    <section className="robot-mini-z"><span>Z</span><RobotJogKey {...directionProps(3, 'negative')} className="robot-mini-jog-key z-negative" arrow="up" /><RobotJogKey {...directionProps(3, 'positive')} className="robot-mini-jog-key z-positive" arrow="down" /></section>
  </div>;

  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next) stopActiveJog(); onOpenChange(next); }} modal={false}>
    <Dialog.Content
      id="robot-quick-control-menu"
      className={cn('machine-mechanism-card robot-control-menu', control === 'position' && 'robot-position-control-menu robot-redesign')}
      aria-describedby={undefined}
      onInteractOutside={(event) => {
        if ((event.target as HTMLElement).closest('.robot-control-trigger')) event.preventDefault();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
      }}
    >
      {control === 'position' ? <header className="robot-mini-header">
        <div><Dialog.Title asChild><h3>Мини-пульт робота</h3></Dialog.Title><span>Режим {positionView === 'points' ? 'ТОЧКИ' : positionView === 'home' ? 'HOME' : continuousMode ? 'JOG' : 'ШАГОВЫЙ JOG'} <Indicator active={headerReady} tone={headerReady ? 'green' : 'blue'} /> {headerReady ? 'Готов' : 'Не готов'}</span></div>
        <Dialog.Close asChild><button type="button" title="Свернуть" aria-label="Закрыть управление роботом">−</button></Dialog.Close>
      </header> : <header>
        <span className="machine-mechanism-icon"><Icon aria-hidden="true" /></span>
        <div><small>РОБОТ · РУЧНОЕ УПРАВЛЕНИЕ</small><Dialog.Title asChild><h3>{TITLES[control]}</h3></Dialog.Title></div>
        <Dialog.Close asChild><button type="button" title="Закрыть" aria-label="Закрыть управление роботом"><X /></button></Dialog.Close>
      </header>}

      {control === 'position' ? <>
        <SegmentedControl
          className="robot-mini-pill-selector robot-mini-view-selector"
          value={positionView}
          thumbFullHeight
          options={[
            { value: 'points', label: <><Save aria-hidden="true" />Точки</> },
            { value: 'remote', label: <><Crosshair aria-hidden="true" />Пульт JOG</> },
            { value: 'home', label: <><ControlIcon icon={homeIcon} aria-hidden="true" />HOME</> },
          ]}
          onChange={(nextValue) => {
            stopActiveJog();
            setPositionView(nextValue as PositionView);
          }}
          ariaLabel="Режим управления позицией"
        />
        {positionView === 'points' ? <>
          <div className="machine-mechanism-state"><span><Indicator active={online} tone="blue" />Текущая точка</span><strong>{state}</strong></div>
          <div className="robot-control-fields">
            <label><span>Точка робота</span><select aria-label="Точка робота" value={point} onChange={(event) => setPoint(Number(event.target.value))}>
              {MANUAL_POINT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.value}. {option.label}</option>)}
            </select></label>
            {magazinePoint && <div className="robot-control-slot-fields">
              <label><span>Магазин</span><select aria-label="Магазин" value={magazine} onChange={(event) => { setMagazine(Number(event.target.value)); setSlot('1'); }}>
                <option value={1}>Магазин 1</option><option value={2}>Магазин 2</option>
              </select></label>
              <label><span>Активный слот</span><input aria-label="Активный слот" type="number" min={1} max={maxSlot} step={1} value={slot} aria-invalid={!slotValid} onChange={(event) => setSlot(event.target.value)} /></label>
            </div>}
            {magazinePoint && !slotValid && <small className="robot-control-input-error">Введите целый номер слота от 1 до {maxSlot}.</small>}
          </div>
          <div className="machine-mechanism-actions robot-control-point-action">
            <button type="button" disabled={!online || (magazinePoint && !slotValid)} className={cn('rj-button rj-primary', !manual.pointsAllowed && 'command-unavailable')} aria-disabled={!online || !manual.pointsAllowed || (magazinePoint && !slotValid)} onClick={() => send(1)}><span>Перейти к точке</span></button>
          </div>
        </> : <div className="robot-mini-remote">
          {positionView === 'home' ? <div className="robot-mini-home">
            <p>Поиск домашней позиции каждой оси</p>
            {AXES.map((name, index) => {
              const axis = axisManual[index];
              const homeState = !modeReady ? modbusMode ? 'Недоступно в Modbus' : 'Нет связи'
                : axis.stateCode === AXIS_HOMING_STATE ? 'Поиск HOME…' : axis.homed ? 'HOME найден' : 'HOME не найден';
              return <section key={name} className="robot-mini-home-axis">
                <div><strong>Ось {name}</strong><span>{homeState}</span></div>
                <RobotAxisHomeButton axis={index + 1} status={axis} online={modeReady} onSend={(command) => { stopActiveJog(); onSend(command); }} />
                {modeReady && !axis.homeAllowed && axis.rejectReason && <p role="status">{axis.rejectReason}</p>}
              </section>;
            })}
          </div> : <>
            <SegmentedControl
              className="robot-mini-pill-selector robot-mini-mode-selector"
              value={continuousMode ? 'continuous' : 'step'}
              thumbFullHeight
              options={[
                { value: 'continuous', label: <><ControlIcon icon={touchIcon} aria-hidden="true" />Непрерывный</> },
                { value: 'step', label: <><ControlIcon icon={targetIcon} aria-hidden="true" />Шаговый</> },
              ]}
              disabled={!modeReady}
              onChange={(nextValue) => setJogMode(nextValue === 'continuous')}
              ariaLabel="Тип JOG"
            />
            {jogPad}
            {continuousMode ? <div className="robot-mini-adjust">
              <div className="robot-mini-adjust-head"><strong>Скорость</strong><RangeInput min={0.1} max={100} step={0.1} value={speed} disabled={!modeReady} ariaLabel="Скорость JOG" onChange={(value) => onSend({ command: 'robot.speedOverride', value })} /><b>{speed.toFixed(speed % 1 ? 1 : 0)} %</b></div>
              <SegmentedControl
                className="robot-mini-pill-selector robot-mini-presets-selector"
                thumbFullHeight
                value={SPEED_PRESETS.find((value) => Math.abs(speed - value) < 0.05)?.toString() ?? ''}
                options={SPEED_PRESETS.map((value) => ({ value: value.toString(), label: `${value}%` }))}
                disabled={!modeReady}
                onChange={(nextValue) => onSend({ command: 'robot.speedOverride', value: Number(nextValue) })}
                ariaLabel="Предустановки скорости JOG"
              />
            </div> : <div className="robot-mini-adjust">
              <div className="robot-mini-step-label"><strong>Шаг перемещения</strong><b>{manualStep} мм</b></div>
              <SegmentedControl
                className="robot-mini-pill-selector robot-mini-presets-selector"
                thumbFullHeight
                value={manualStep.toString()}
                options={STEP_VALUES.map((value) => ({ value: value.toString(), label: `${value} мм` }))}
                disabled={!modeReady}
                onChange={(nextValue) => onSend({ command: 'robot.manualStep', value: Number(nextValue) })}
                ariaLabel="Предустановки шага перемещения"
              />
            </div>}
          </>}
          <footer className="robot-mini-footer"><div><span>X</span><strong>{coordinates.x.toFixed(1)}</strong><span>Y</span><strong>{coordinates.y.toFixed(1)}</strong><span>Z</span><strong>{coordinates.z.toFixed(1)}</strong></div><button type="button" disabled={!online} className={cn('rj-button', !manual.stopAllowed && 'command-unavailable')} aria-disabled={!manual.stopAllowed} onClick={() => { stopActiveJog(); onSend({ command: 'robot.stop' }); }}>Стоп</button></footer>
        </div>}
      </> : <>
        <div className="machine-mechanism-state"><span><Indicator active={online} tone="blue" />Текущее состояние</span><strong>{state}</strong></div>
        <div className="machine-mechanism-actions">
          {actions.map(({ action, label, allowed }, index) => {
            const ActionIcon = control === 'rotation' ? RotateCcw : index === 0 ? UnlockKeyhole : LockKeyhole;
            return <button key={action} type="button" disabled={!online} className={cn(index === 1 && 'primary', !allowed && 'command-unavailable')} aria-disabled={!online || !allowed} onClick={() => send(action)}><ActionIcon /><span>{label}</span></button>;
          })}
        </div>
      </>}
      {warning && <p><AlertCircle /><span>{warning}</span></p>}
    </Dialog.Content>
  </Dialog.Root>;
}
