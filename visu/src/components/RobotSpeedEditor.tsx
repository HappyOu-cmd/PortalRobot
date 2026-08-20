import {
  useEffect, useRef, useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

export const ROBOT_SPEED_MIN = 0.1;
export const ROBOT_SPEED_MAX = 100;
export const ROBOT_SPEED_FINE_STEP = 0.1;

const SPEED_PRESETS = [0.1, 1, 5, 10, 25, 50, 75, 100];

export const normalizeRobotSpeed = (value: number) => Math.round(Math.max(
  ROBOT_SPEED_MIN,
  Math.min(ROBOT_SPEED_MAX, Number.isFinite(value) ? value : ROBOT_SPEED_MIN),
) * 10) / 10;

function SpeedNudgeButton({ delta, valueRef, disabled, onChange }: {
  delta: number;
  valueRef: MutableRefObject<number>;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);

  const clearRepeat = () => {
    if (delayRef.current) clearTimeout(delayRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    delayRef.current = null;
    intervalRef.current = null;
  };

  const applyDelta = () => {
    const heldFor = Date.now() - startedAtRef.current;
    const effectiveDelta = heldFor > 1800 ? delta * 10 : delta;
    const next = normalizeRobotSpeed(valueRef.current + effectiveDelta);
    valueRef.current = next;
    onChange(next);
  };

  const finish = (event?: ReactPointerEvent<HTMLButtonElement>) => {
    clearRepeat();
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => clearRepeat, []);

  return <button
    type="button"
    disabled={disabled}
    aria-label={`${delta < 0 ? 'Уменьшить' : 'Увеличить'} скорость робота на 0,1 процента`}
    onPointerDown={(event) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      startedAtRef.current = Date.now();
      applyDelta();
      delayRef.current = setTimeout(() => {
        intervalRef.current = setInterval(applyDelta, 110);
      }, 450);
    }}
    onPointerUp={finish}
    onPointerCancel={finish}
    onLostPointerCapture={() => clearRepeat()}
    onClick={(event) => {
      // Клавиатурная активация не создаёт PointerEvent.
      if (event.detail === 0) applyDelta();
    }}
  >{delta < 0 ? '−' : '+'}</button>;
}

export function RobotSpeedEditor({ value, online, onChange, details, compact = false }: {
  value: number;
  online: boolean;
  onChange: (value: number) => void;
  details?: ReactNode;
  compact?: boolean;
}) {
  const normalizedValue = normalizeRobotSpeed(value);
  const valueRef = useRef(normalizedValue);
  const [draft, setDraft] = useState(normalizedValue.toFixed(1));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    valueRef.current = normalizedValue;
    if (!editing) setDraft(normalizedValue.toFixed(1));
  }, [editing, normalizedValue]);

  const change = (nextValue: number) => {
    const normalized = normalizeRobotSpeed(nextValue);
    valueRef.current = normalized;
    setDraft(normalized.toFixed(1));
    onChange(normalized);
  };

  const commitDraft = () => {
    const parsed = Number(draft.replace(',', '.'));
    change(Number.isFinite(parsed) ? parsed : normalizedValue);
    setEditing(false);
  };

  return <div className={`robot-speed-editor ${compact ? 'compact' : ''}`}>
    <div className="robot-speed-editor-head">
      <div><span>Общая скорость робота</span><small>JOG · MOVE ABSOLUTE · MOVE DIRECT</small></div>
      <label>
        <input
          value={draft}
          disabled={!online}
          inputMode="decimal"
          aria-label="Точное значение общей скорости робота"
          onFocus={() => setEditing(true)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setDraft(normalizedValue.toFixed(1));
              event.currentTarget.blur();
            }
          }}
        />
        <span>%</span>
      </label>
    </div>

    <div className="robot-speed-editor-adjust">
      <SpeedNudgeButton delta={-ROBOT_SPEED_FINE_STEP} valueRef={valueRef} disabled={!online || normalizedValue <= ROBOT_SPEED_MIN} onChange={change} />
      <input
        type="range"
        min={0}
        max={ROBOT_SPEED_MAX}
        step={1}
        disabled={!online}
        value={normalizedValue}
        aria-label="Быстрая настройка общей скорости робота"
        onChange={(event) => change(Number(event.target.value))}
      />
      <SpeedNudgeButton delta={ROBOT_SPEED_FINE_STEP} valueRef={valueRef} disabled={!online || normalizedValue >= ROBOT_SPEED_MAX} onChange={change} />
    </div>

    <div className="robot-speed-presets" aria-label="Предустановки скорости">
      {SPEED_PRESETS.map((preset) => <button
        type="button"
        key={preset}
        disabled={!online}
        className={Math.abs(normalizedValue - preset) < 0.05 ? 'active' : ''}
        onClick={() => change(preset)}
      >{preset}%</button>)}
    </div>

    {details && <div className="robot-speed-editor-details">{details}</div>}
  </div>;
}
