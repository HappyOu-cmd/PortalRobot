import { useEffect, useRef } from 'react';

type Direction = 'negative' | 'positive';
const TICKS = Array.from({ length: 48 }, (_, index) => index);
const TRAIL = Array.from({ length: 7 }, (_, index) => index);

/** Visual feedback only: movement comes from coordinate updates, never button presses. */
export function RobotAxisDial({ name, direction, speedRatio, continuous, online, error, ready, busy }: {
  name: string;
  direction: Direction | null;
  speedRatio: number;
  continuous: boolean;
  online: boolean;
  error: boolean;
  ready: boolean;
  busy: boolean;
}) {
  const rotorRef = useRef<HTMLDivElement>(null);
  const rotation = useRef({ angle: -40, velocity: 0 });
  const lastDirection = useRef<Direction>('positive');
  if (direction) lastDirection.current = direction;
  const state = !online ? 'offline' : error ? 'error' : direction ? 'moving' : busy ? 'busy' : ready ? 'ready' : 'disabled';
  const status = !online ? 'Нет связи' : error ? 'Авария' : direction ? `Движение ${direction === 'positive' ? '+' : '−'}` : busy ? 'Выполняется' : ready ? continuous ? 'JOG' : 'ШАГ' : 'Не готов';

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let previousTime = 0;
    // Integrate velocity so stopping and reversing preserve the current angle.
    const targetVelocity = online && direction
      ? (direction === 'positive' ? 1 : -1) * (45 + 195 * Math.sqrt(Math.max(0, Math.min(1, speedRatio))))
      : 0;
    const tick = (time: number) => {
      const elapsed = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
      previousTime = time;
      const current = rotation.current;
      current.velocity += (targetVelocity - current.velocity) * (1 - Math.exp(-elapsed / (targetVelocity ? 0.16 : 0.2)));
      current.angle = (current.angle + current.velocity * elapsed) % 360;
      if (rotorRef.current) rotorRef.current.style.transform = `rotate(${current.angle}deg)`;
      if (targetVelocity || Math.abs(current.velocity) > 0.25) frame = window.requestAnimationFrame(tick);
      else current.velocity = 0;
    };
    const resume = () => {
      window.cancelAnimationFrame(frame);
      previousTime = 0;
      if (reducedMotion.matches || document.hidden || !online) {
        rotation.current.velocity = 0;
        return;
      }
      if (targetVelocity || rotation.current.velocity) frame = window.requestAnimationFrame(tick);
    };
    resume();
    reducedMotion.addEventListener('change', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.cancelAnimationFrame(frame);
      reducedMotion.removeEventListener('change', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [direction, speedRatio, online]);

  return <div className="rj-dial" data-state={state} data-flow={lastDirection.current} role="img" aria-label={`Ось ${name}: ${status}`}>
    <div className="rj-dial-aura" aria-hidden="true" />
    <svg className="rj-dial-scale" viewBox="0 0 160 160" fill="none" aria-hidden="true">
      <circle className="rj-dial-guide" cx="80" cy="80" r="66" />
      {TICKS.map((index) => <line key={index} className={index % 4 === 0 ? 'rj-dial-tick is-major' : 'rj-dial-tick'} x1="80" y1={index % 4 === 0 ? 8 : 5} x2="80" y2="2" transform={`rotate(${index * 7.5} 80 80)`} />)}
    </svg>
    <div ref={rotorRef} className="rj-dial-rotor" aria-hidden="true">
      <svg className="rj-dial-trail" viewBox="0 0 160 160" fill="none">
        <circle className="rj-dial-counterarc" cx="80" cy="80" r="66" pathLength="100" strokeDasharray="17 83" strokeDashoffset="67" />
        {TRAIL.map((index) => <circle key={index} className="rj-dial-tail" cx="80" cy="80" r="66" pathLength="100" strokeDasharray="4.1 95.9" strokeDashoffset={(index + 1) * 4} opacity={1 - index * 0.13} />)}
        <circle className="rj-dial-head-halo" cx="146" cy="80" r="6" />
        <circle className="rj-dial-head" cx="146" cy="80" r="2.6" />
      </svg>
    </div>
    <div className="rj-dial-core" aria-hidden="true">
    </div>
    <span className="rj-dial-flow" data-side="negative" aria-hidden="true">‹</span>
    <span className="rj-dial-flow" data-side="positive" aria-hidden="true">›</span>
  </div>;
}
