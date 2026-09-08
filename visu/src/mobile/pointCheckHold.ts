export type CheckPhase = 'ready' | 'starting' | 'moving' | 'stopping' | 'completed' | 'stopped' | 'error';
type CheckPayload = { index: number; draft: { x: number; y: number; z: number; speedFactor: number } };
type CheckSnapshot = { online: boolean; active: boolean; runSeq: number; checkState: number };
type Dependencies = {
  prepare: () => Promise<{ holdId: string }>;
  start: (payload: CheckPayload & { holdId: string }) => Promise<{ sequence?: number }>;
  pulse: (holdId: string) => Promise<unknown>;
  stop: (holdId: string) => Promise<unknown>;
  onPhase: (phase: CheckPhase) => void;
  onError: (error: unknown) => void;
};

// A press is one transaction, never an automatic restart. Release is independent
// of the start/ack promise, and polling telemetry cannot renew the hold lease.
export function createPointCheckHold(deps: Dependencies) {
  type Press = { held: boolean; holdId?: string; sequence?: number; pulsePending: boolean };
  let current: Press | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let latest: CheckSnapshot | null = null;
  const clearTimer = () => { clearInterval(timer); timer = undefined; };
  const report = (error: unknown) => { deps.onError(error); deps.onPhase('error'); };
  const stop = (press: Press) => {
    if (press.holdId) void deps.stop(press.holdId).catch((error) => { if (current === press) report(error); });
  };
  const release = () => {
    const press = current;
    if (!press?.held) return;
    press.held = false;
    clearTimer();
    deps.onPhase('stopping');
    stop(press);
  };
  const observe = (snapshot: CheckSnapshot) => {
    latest = snapshot;
    const press = current;
    if (!press) return;
    if (!snapshot.online) { release(); return; }
    if (press.sequence && snapshot.runSeq === press.sequence && !snapshot.active && [2, 3, 4].includes(snapshot.checkState)) {
      press.held = false;
      clearTimer();
      current = null;
      deps.onPhase(snapshot.checkState === 2 ? 'completed' : snapshot.checkState === 3 ? 'stopped' : 'error');
    }
  };
  const press = (payload: CheckPayload) => {
    if (current) return;
    const operation: Press = { held: true, pulsePending: false };
    current = operation;
    latest = null;
    deps.onPhase('starting');
    void (async () => {
      try {
        const prepared = await deps.prepare();
        operation.holdId = prepared.holdId;
        if (!operation.held) {
          stop(operation);
          current = null;
          deps.onPhase('stopped');
          return;
        }
        timer = setInterval(() => {
          if (!operation.held || operation.pulsePending) return;
          operation.pulsePending = true;
          void deps.pulse(prepared.holdId).catch((error) => {
            if (current !== operation || !operation.held) return;
            release();
            report(error);
          }).finally(() => { operation.pulsePending = false; });
        }, 300);
        const result = await deps.start({ ...payload, holdId: prepared.holdId });
        operation.sequence = result.sequence;
        if (current !== operation) return;
        if (!operation.held) stop(operation);
        else deps.onPhase('moving');
        if (latest) observe(latest);
      } catch (error) {
        const wasHeld = operation.held;
        operation.held = false;
        clearTimer();
        stop(operation);
        if (current === operation) {
          current = null;
          if (wasHeld) report(error);
          else deps.onPhase('stopped');
        }
      }
    })();
  };
  return { press, release, observe };
}
