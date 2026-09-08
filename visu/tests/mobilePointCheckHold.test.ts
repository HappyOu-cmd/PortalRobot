import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createPointCheckHold, type CheckPhase } from '../src/mobile/pointCheckHold.ts';

const payload = { index: 10, draft: { x: 1, y: 2, z: 3, speedFactor: 0.5 } };
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const fixture = () => {
  const phases: CheckPhase[] = [];
  const errors: unknown[] = [];
  const calls: string[] = [];
  const deps = {
    prepare: async () => { calls.push('prepare'); return { holdId: 'hold1' }; },
    start: async () => { calls.push('start'); return { sequence: 41 }; },
    pulse: async () => { calls.push('pulse'); },
    stop: async () => { calls.push('stop'); },
    onPhase: (phase: CheckPhase) => phases.push(phase),
    onError: (error: unknown) => errors.push(error),
  };
  return { deps, phases, errors, calls };
};

test('releasing before preparation completes never sends a start', async () => {
  const value = fixture();
  let prepare!: (result: { holdId: string }) => void;
  value.deps.prepare = () => new Promise((resolve) => { prepare = resolve; });
  const control = createPointCheckHold(value.deps);
  control.press(payload);
  control.release();
  prepare({ holdId: 'hold1' });
  await flush();
  assert.deepEqual(value.calls, ['stop']);
  assert.equal(value.phases.at(-1), 'stopped');
});

test('release sends stop before start ACK and never resumes from late ACK', async () => {
  const value = fixture();
  let acknowledge!: (result: { sequence: number }) => void;
  value.deps.start = () => new Promise((resolve) => { acknowledge = resolve; });
  const control = createPointCheckHold(value.deps);
  control.press(payload);
  await flush();
  control.release();
  assert.equal(value.calls.at(-1), 'stop');
  acknowledge({ sequence: 41 });
  await flush();
  assert.equal(value.calls.filter((call) => call === 'stop').length, 2);
  assert.equal(value.phases.includes('moving'), false);
  control.observe({ online: true, runSeq: 41, active: false, checkState: 3 });
  assert.equal(value.phases.at(-1), 'stopped');
});

test('holding pulses; PLC completion terminates the hold without restarting', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const value = fixture();
  const control = createPointCheckHold(value.deps);
  t.after(() => control.release());
  control.press(payload);
  await flush();
  t.mock.timers.tick(300);
  await flush();
  assert.equal(value.calls.at(-1), 'pulse');
  control.observe({ online: true, runSeq: 40, active: false, checkState: 2 });
  assert.equal(value.phases.at(-1), 'moving');
  control.observe({ online: true, runSeq: 41, active: true, checkState: 1 });
  control.observe({ online: true, runSeq: 41, active: false, checkState: 2 });
  const count = value.calls.length;
  t.mock.timers.tick(3000);
  control.release();
  assert.equal(value.calls.length, count);
  assert.equal(value.phases.at(-1), 'completed');
});

test('terminal snapshot arriving before HTTP acknowledgement is not lost', async () => {
  const value = fixture();
  let acknowledge!: (result: { sequence: number }) => void;
  value.deps.start = () => new Promise((resolve) => { acknowledge = resolve; });
  const control = createPointCheckHold(value.deps);
  control.press(payload);
  await flush();
  control.observe({ online: true, runSeq: 41, active: false, checkState: 2 });
  acknowledge({ sequence: 41 });
  await flush();
  assert.equal(value.phases.at(-1), 'completed');
});

test('pulse failure releases immediately and stops further heartbeat', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const value = fixture();
  value.deps.pulse = async () => { throw new Error('offline'); };
  const control = createPointCheckHold(value.deps);
  control.press(payload);
  await flush();
  t.mock.timers.tick(300);
  await flush();
  assert.equal(value.calls.at(-1), 'stop');
  assert.equal(value.errors.length, 1);
  assert.equal(value.phases.at(-1), 'error');
});

test('loss of PLC connection cancels even while page is visible', async () => {
  const value = fixture();
  const control = createPointCheckHold(value.deps);
  control.press(payload);
  await flush();
  control.observe({ online: false, runSeq: 41, active: true, checkState: 1 });
  assert.equal(value.calls.at(-1), 'stop');
  assert.equal(value.phases.at(-1), 'stopping');
});

test('mobile touch styles cover descendants and restore document scrolling', () => {
  const css = readFileSync(new URL('../src/mobile/mobile-controls.css', import.meta.url), 'utf8');
  assert.match(css, /\.mobile-points-dialog button \*/);
  assert.match(css, /-webkit-user-select: none/);
  assert.match(css, /-webkit-touch-callout: none/);
  assert.match(css, /html\.is-mobile-holding/);
  assert.match(css, /-webkit-user-drag: none/);
  assert.match(css, /mobile-hold-control[^}]*touch-action: none/);
  assert.match(css, /#root[^}]*height: auto;[^}]*overflow: visible/s);
  assert.match(css, /safe-area-inset-bottom/);
});

test('hold control has a non-passive iOS touch path and blocks native selection', () => {
  const source = readFileSync(new URL('../src/mobile/MobileHoldButton.tsx', import.meta.url), 'utf8');
  assert.match(source, /addEventListener\('touchstart', touchStart, \{ passive: false \}\)/);
  assert.match(source, /addEventListener\('touchmove', prevent, \{ passive: false \}\)/);
  assert.match(source, /addEventListener\('touchend', touchEnd, \{ passive: false \}\)/);
  assert.match(source, /addEventListener\('touchcancel', touchEnd, \{ passive: false \}\)/);
  assert.match(source, /addEventListener\('selectstart', prevent\)/);
  assert.match(source, /addEventListener\('contextmenu', prevent\)/);
  assert.match(source, /window\.addEventListener\('pointerup', pointerRelease, true\)/);
  assert.match(source, /window\.addEventListener\('pointercancel', pointerRelease, true\)/);
  assert.match(source, /document\.addEventListener\('touchend', touchRelease, \{ capture: true, passive: true \}\)/);
  assert.match(source, /if \(!window\.PointerEvent/);
});

test('PLC completion statically latches Motion Done, not the cleared FB_ROBOT Done pulse', () => {
  const source = readFileSync(new URL('../../Portal_robot/Device/application/PLC_PRG.RunRobot.st', import.meta.url), 'utf8');
  assert.match(source, /xPointCheckSeenDone := FALSE/);
  assert.match(source, /xPointCheckSeenDone := xPointCheckSeenDone OR \(xPointCheckSeenBusy\s+AND GVL_MOTION_MANAGER.stMotionManager.Status.xDone/);
  assert.match(source, /Status.eCurrentPoint = ePointCheckName/);
  assert.match(source, /ELSIF xPointCheckSeenDone AND NOT GVL_ROBOT.Status.xBusy AND NOT xMotionBusy\s+AND NOT GVL_MOTION_MANAGER.stMotionManager.Status.xBusy THEN\s+GVL_HMI.uiPointCheckState := UINT#2;\s+xPointCheckActive := FALSE/);
});
