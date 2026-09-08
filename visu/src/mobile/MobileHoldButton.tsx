import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type PointerEvent } from 'react';
import { cn } from '../lib/utils';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & { onHold: (held: boolean) => void };

export function MobileHoldButton({ onHold, disabled, className, children, ...props }: Props) {
  const callback = useRef(onHold);
  callback.current = onHold;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const elementRef = useRef<HTMLButtonElement | null>(null);
  const pointer = useRef<number | 'keyboard' | 'touch' | null>(null);
  const [held, setHeld] = useState(false);
  const finish = useCallback(() => {
    if (pointer.current === null) return;
    pointer.current = null;
    document.documentElement.classList.remove('is-mobile-holding');
    setHeld(false);
    callback.current(false);
  }, []);
  const begin = useCallback((id: number | 'keyboard' | 'touch') => {
    if (disabledRef.current || pointer.current !== null) return;
    pointer.current = id;
    document.documentElement.classList.add('is-mobile-holding');
    setHeld(true);
    callback.current(true);
  }, []);
  const endPointer = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointer.current !== event.pointerId) return;
    event.preventDefault();
    finish();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  useEffect(() => { if (disabled) finish(); }, [disabled, finish]);
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    // React delegates touch listeners as passive in some WebKit versions. The
    // native non-passive path is what actually suppresses magnifier/callout and
    // also provides a fallback when Pointer Events are cancelled by Safari.
    const prevent = (event: Event) => event.preventDefault();
    const touchStart = (event: TouchEvent) => {
      event.preventDefault();
      // Modern Safari emits Pointer Events as well. Do not let both input
      // streams claim the same hold; touch is only a fallback for old WebKit.
      if (!window.PointerEvent && event.touches.length === 1) begin('touch');
    };
    const touchEnd = (event: TouchEvent) => { event.preventDefault(); finish(); };
    element.addEventListener('touchstart', touchStart, { passive: false });
    element.addEventListener('touchmove', prevent, { passive: false });
    element.addEventListener('touchend', touchEnd, { passive: false });
    element.addEventListener('touchcancel', touchEnd, { passive: false });
    element.addEventListener('contextmenu', prevent);
    element.addEventListener('selectstart', prevent);
    element.addEventListener('gesturestart', prevent, { passive: false });
    element.addEventListener('gesturechange', prevent, { passive: false });
    element.addEventListener('gestureend', prevent, { passive: false });
    return () => {
      element.removeEventListener('touchstart', touchStart);
      element.removeEventListener('touchmove', prevent);
      element.removeEventListener('touchend', touchEnd);
      element.removeEventListener('touchcancel', touchEnd);
      element.removeEventListener('contextmenu', prevent);
      element.removeEventListener('selectstart', prevent);
      element.removeEventListener('gesturestart', prevent);
      element.removeEventListener('gesturechange', prevent);
      element.removeEventListener('gestureend', prevent);
    };
  }, [begin, finish]);
  useEffect(() => {
    // Pointer capture is not perfectly reliable when iOS moves browser chrome,
    // retargets a touch, or interrupts React event delivery. A release anywhere
    // in the document must terminate the hold and its JOG heartbeat.
    const pointerRelease = (event: globalThis.PointerEvent) => {
      if (pointer.current === 'keyboard' || pointer.current === null) return;
      if (pointer.current === 'touch' || pointer.current === event.pointerId) finish();
    };
    const touchRelease = (event: TouchEvent) => {
      if (event.touches.length === 0 && pointer.current !== 'keyboard') finish();
    };
    window.addEventListener('pointerup', pointerRelease, true);
    window.addEventListener('pointercancel', pointerRelease, true);
    document.addEventListener('touchend', touchRelease, { capture: true, passive: true });
    document.addEventListener('touchcancel', touchRelease, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerup', pointerRelease, true);
      window.removeEventListener('pointercancel', pointerRelease, true);
      document.removeEventListener('touchend', touchRelease, true);
      document.removeEventListener('touchcancel', touchRelease, true);
    };
  }, [finish]);
  useEffect(() => {
    const visibility = () => { if (document.hidden) finish(); };
    window.addEventListener('blur', finish);
    window.addEventListener('pagehide', finish);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      finish();
      window.removeEventListener('blur', finish);
      window.removeEventListener('pagehide', finish);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [finish]);
  return <button {...props} ref={elementRef} type="button" disabled={disabled}
    className={cn('mobile-hold-control', className, held && 'is-held')} aria-pressed={held}
    onContextMenu={(event) => event.preventDefault()}
    onDragStart={(event) => event.preventDefault()}
    onPointerDown={(event) => {
      event.preventDefault();
      if (!event.isPrimary || event.button !== 0 || pointer.current !== null) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      begin(event.pointerId);
    }}
    onPointerUp={endPointer} onPointerCancel={endPointer}
    onLostPointerCapture={endPointer} onBlur={finish}
    onKeyDown={(event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (!event.repeat) begin('keyboard');
    }}
    onKeyUp={(event) => {
      if (pointer.current !== 'keyboard' || (event.key !== ' ' && event.key !== 'Enter')) return;
      event.preventDefault(); finish();
    }}
    onClick={(event) => event.preventDefault()}
  >{children}</button>;
}
