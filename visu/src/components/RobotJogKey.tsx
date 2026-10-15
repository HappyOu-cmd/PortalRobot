import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '@iconify/react';
import arrowIcon from '@iconify-icons/material-symbols/arrow-forward';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/utils';

type Direction = 'negative' | 'positive';
const keyClass = cva('rj-button', {
  variants: { unavailable: { true: 'command-unavailable', false: '' } },
});

export function RobotJogKey({ axis, direction, allowed, online, continuous, step, onJog, onStep, className, arrow }: {
  axis: string;
  direction: Direction;
  allowed: boolean;
  online: boolean;
  continuous: boolean;
  step: number;
  onJog: (active: boolean) => void;
  onStep: () => void;
  className?: string;
  arrow?: 'up' | 'down' | 'left' | 'right';
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
    className={cn('rj-key', keyClass({ unavailable: !allowed }), className)}
    data-direction={direction}
    data-arrow={arrow}
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
      const stepRequested = keyboardHeldRef.current && !continuous;
      finish();
      if (stepRequested) onStep();
    }}
    onClick={() => { if (!continuous) onStep(); }}
  >
    <span className="rj-key-wave" aria-hidden="true" />
    <Icon icon={arrowIcon} aria-hidden="true" />
    <strong>{axis}<span>{negative ? '−' : '+'}</span></strong>
    <small>{continuous ? 'Удерживать' : `${negative ? '−' : '+'} ${step} мм`}</small>
  </button>;
}
