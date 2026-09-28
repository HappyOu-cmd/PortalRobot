// Local animation controller only. No PLC commands, tags or process inventory.
export type PalletId = 1 | 2;
export const INSPECTION_BELT_SPAN = 1.96;
export const INSPECTION_SAMPLE_SPAN = 1.76;
export interface TwoPalletPose {
  p1: number; p2: number; carriage: number; lift: number; selector: number;
}
interface AnimationStep { label: string; target: Partial<TwoPalletPose>; duration: number }
export interface TwoPalletSnapshot extends TwoPalletPose {
  selected: PalletId; busy: boolean; paused: boolean; label: string; speed: number;
  beltDirection: -1 | 0 | 1; sample: number | null; showParts: boolean;
  canSwap: boolean; canRaise: boolean; canSelect: boolean;
}
const close = (a: number, b: number) => Math.abs(a - b) < 0.001;
const initialPose = (id: PalletId): TwoPalletPose => ({
  p1: id === 1 ? 1 : 0, p2: id === 2 ? 1 : 0,
  carriage: 1, lift: 1, selector: id === 1 ? 0 : 1,
});

export class TwoPalletPreviewController {
  readonly pose = initialPose(1);
  selected: PalletId = 1;
  beltPhase = 0;
  beltTravel = 0;
  sample: number | null = null;
  beltDirection: -1 | 0 | 1 = 0;
  showParts = false;
  private speed = 1;
  private paused = false;
  private label = 'П1 у робота · П2 у оператора';
  private steps: AnimationStep[] = [];
  private start = { ...this.pose };
  private elapsed = 0;
  private publishElapsed = 0;
  private listeners = new Set<() => void>();
  private snapshot: TwoPalletSnapshot = this.makeSnapshot();

  private separated(): boolean {
    return (close(this.pose.p1, 1) && close(this.pose.p2, 0))
      || (close(this.pose.p1, 0) && close(this.pose.p2, 1));
  }
  private makeSnapshot(): TwoPalletSnapshot {
    const busy = this.steps.length > 0;
    return { ...this.pose, selected: this.selected, busy, paused: this.paused,
      label: this.label, speed: this.speed, beltDirection: this.beltDirection,
      sample: this.sample, showParts: this.showParts,
      canSwap: !busy && this.separated() && close(this.pose.carriage, 1),
      canRaise: !busy,
      canSelect: !busy && close(this.pose.carriage, 0) && close(this.pose.p1, 0)
        && close(this.pose.p2, 0) && close(this.pose.lift, 0),
    };
  }
  getSnapshot = (): TwoPalletSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(): void {
    this.snapshot = this.makeSnapshot();
    this.listeners.forEach((listener) => listener());
  }
  private run(steps: AnimationStep[]): void {
    if (this.steps.length) return;
    this.steps = steps;
    this.start = { ...this.pose };
    this.elapsed = 0;
    this.paused = false;
    this.label = steps[0].label;
    this.publish();
  }
  reset(id: PalletId): void {
    Object.assign(this.pose, initialPose(id));
    this.selected = id;
    this.steps = [];
    this.paused = false;
    this.elapsed = 0;
    this.beltDirection = 0;
    this.sample = null;
    this.label = `П${id} у робота · П${id === 1 ? 2 : 1} у оператора`;
    this.publish();
  }
  swap(targetLiftUp = true): void {
    if (!this.makeSnapshot().canSwap) return;
    const from: PalletId = close(this.pose.p1, 1) ? 1 : 2;
    const to: PalletId = from === 1 ? 2 : 1;
    this.run([
      { label: '1/5 · Опускаем П2', target: { lift: 0 }, duration: 1.5 },
      { label: `2/5 · Возвращаем П${from} к оператору`, target: { carriage: 0, [from === 1 ? 'p1' : 'p2']: 0 }, duration: 2.8 },
      { label: `3/5 · Зацепляем П${to}, фиксируем П${from}`, target: { selector: to === 1 ? 0 : 1 }, duration: 0.7 },
      { label: `4/5 · Подаём П${to} к роботу`, target: { carriage: 1, [to === 1 ? 'p1' : 'p2']: 1 }, duration: 2.8 },
      // Lift always follows completed carriage motion, in BOTH directions.
      { label: targetLiftUp ? `5/5 · Поднимаем П2 ${to === 2 ? 'у робота' : 'у оператора'}` : '5/5 · Подтверждаем низ П2',
        target: { lift: targetLiftUp ? 1 : 0 }, duration: targetLiftUp ? 1.5 : 0.05 },
    ]);
  }
  lift(up: boolean): void {
    if (this.steps.length) return;
    this.run([{ label: up ? 'Поднимаем П2' : 'Опускаем П2', target: { lift: up ? 1 : 0 }, duration: 1.5 }]);
  }
  move(toRobot: boolean): void {
    if (this.steps.length || !close(this.pose.lift, 0)) return;
    const position = this.selected === 1 ? this.pose.p1 : this.pose.p2;
    if (!close(position, this.pose.carriage)) return;
    this.run([{ label: `П${this.selected} ${toRobot ? 'к роботу' : 'к оператору'}`,
      target: { carriage: toRobot ? 1 : 0, [this.selected === 1 ? 'p1' : 'p2']: toRobot ? 1 : 0 }, duration: 2.8 }]);
  }
  select(id: PalletId): void {
    if (!this.makeSnapshot().canSelect) return;
    this.run([{ label: `Зацепление П${id}`, target: { selector: id === 1 ? 0 : 1 }, duration: 0.7 }]);
  }
  togglePause(): void { this.paused = !this.paused; this.publish(); }
  stop(): void { this.steps = []; this.paused = false; this.label = 'Остановлено · требуется восстановление'; this.publish(); }
  follow(pose: TwoPalletPose, publish = false): void { this.steps = []; Object.assign(this.pose, pose); this.selected = pose.selector < 0.5 ? 1 : 2; if (publish) this.publish(); }
  setSpeed(value: number): void { this.speed = Math.max(0.25, Math.min(2, value)); this.publish(); }
  setBelt(direction: -1 | 0 | 1): void { this.beltDirection = direction; this.publish(); }
  setParts(value: boolean): void { this.showParts = value; this.publish(); }
  addSample(): void { if (this.sample === null) this.sample = 1; this.publish(); }
  removeSample(): void { this.sample = null; this.publish(); }

  tick(delta: number): void {
    if (this.paused) return;
    const dt = Math.max(0, Math.min(delta, 0.1)) * this.speed;
    const step = this.steps[0];
    if (step) {
      this.elapsed = Math.min(step.duration, this.elapsed + dt);
      const t = this.elapsed / step.duration;
      const eased = t * t * (3 - 2 * t);
      for (const key of Object.keys(step.target) as (keyof TwoPalletPose)[]) {
        const target = step.target[key]!;
        this.pose[key] = this.start[key] + (target - this.start[key]) * eased;
      }
      if (t >= 1) {
        Object.assign(this.pose, step.target);
        this.selected = this.pose.selector < 0.5 ? 1 : 2;
        this.steps.shift();
        this.start = { ...this.pose };
        this.elapsed = 0;
        this.label = this.steps[0]?.label ?? (this.separated() && close(this.pose.lift, 1)
          ? `П${close(this.pose.p1, 1) ? 1 : 2} у робота · обмен завершён` : 'Движение завершено');
        this.publish();
      }
    }
    if (this.beltDirection) {
      const travel = dt * this.beltDirection * 0.24;
      this.beltTravel += travel;
      this.beltPhase = ((this.beltTravel / INSPECTION_BELT_SPAN) % 1 + 1) % 1;
      if (this.sample !== null) {
        this.sample = Math.max(0, Math.min(1, this.sample + travel / INSPECTION_SAMPLE_SPAN));
        if ((this.sample === 0 && this.beltDirection < 0) || (this.sample === 1 && this.beltDirection > 0)) this.beltDirection = 0;
      }
    }
    // Only this small panel subscribes. Three.js uses the pose directly each frame.
    if (step || this.beltDirection || this.snapshot.beltDirection !== this.beltDirection) {
      this.publishElapsed += dt;
      if (this.publishElapsed >= 0.1) { this.publishElapsed = 0; this.publish(); }
    }
  }
}
