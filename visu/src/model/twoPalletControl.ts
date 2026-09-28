import type { CellState, MagazineData, ProductType, SlotType } from './types';
import type { TwoPalletPreviewController, PalletId } from './twoPalletPreview';

export interface PalletInventory { slots: SlotType[]; productTypes: ProductType[]; loaded: boolean }
export interface TwinConfig {
  configured: boolean; p1LockOut: boolean; exchange: number; workP1: number; workP2: number;
  home: number; tolerance: number; velocity: number; acceleration: number; deceleration: number;
  jerk: number; cylinderMs: number; moveMs: number; homeMs: number; pulseMs: number;
  signalsConfigured: boolean; p1Signals: number; p2Signals: number;
}
export const TWIN_CONFIG_FIELDS: Record<keyof TwinConfig, string> = {
  configured: 'xConfigured', p1LockOut: 'xP1LockOut', exchange: 'lrExchange', workP1: 'lrWorkP1', workP2: 'lrWorkP2',
  home: 'lrHome', tolerance: 'lrTolerance', velocity: 'lrVelocity', acceleration: 'lrAcceleration',
  deceleration: 'lrDeceleration', jerk: 'lrJerk', cylinderMs: 'tCylinder', moveMs: 'tMove', homeMs: 'tHome', pulseMs: 'tPulse',
  signalsConfigured: 'xSignalPatternsConfigured', p1Signals: 'uiP1Signals', p2Signals: 'uiP2Signals',
};
// The bit order is shared with ST_TWO_PALLET_CONFIG. Every unchecked signal is
// required to be FALSE; these are complete patterns, not masks of ignored inputs.
export const TWIN_SIGNALS = [
  ['liftDown', 'Подъём П2: низ', 1], ['liftUp', 'Подъём П2: верх', 2],
  ['lockIn', 'Замок: втянут', 4], ['lockOut', 'Замок: выдвинут', 8],
  ['stopIn', 'Фиксатор: втянут', 16], ['stopOut', 'Фиксатор: выдвинут', 32],
] as const;
export function normalizeTwinConfig(config: TwinConfig): TwinConfig {
  return config.signalsConfigured ? config : { ...config, signalsConfigured: true,
    p1Signals: config.p1LockOut ? 26 : 38, p2Signals: config.p1LockOut ? 38 : 26 };
}
export function twinSignalPattern(config: TwinConfig, pallet: number) {
  const normalized = normalizeTwinConfig(config);
  const bits = pallet === 2 ? normalized.p2Signals : normalized.p1Signals;
  return { liftDown: !!(bits & 1), liftUp: !!(bits & 2), lockIn: !!(bits & 4),
    lockOut: !!(bits & 8), stopIn: !!(bits & 16), stopOut: !!(bits & 32) };
}
// Offline controller only; PLC validates the real command and configuration.
function validSignalConfiguration(c: TwinConfig): boolean {
  return [c.p1Signals, c.p2Signals].every((bits) => Number.isInteger(bits) && bits >= 0 && bits <= 63
    && [1, 2].includes(bits & 3) && [4, 8].includes(bits & 12) && [16, 32].includes(bits & 48))
    && (c.p1Signals & 60) !== (c.p2Signals & 60);
}
export type TwinAction = 'enable' | 'confirm' | 'start' | 'rejectStart' | 'disable' | 'swap' | 'powerOn' | 'powerOff' | 'driveReset' | 'home'
  | 'lower' | 'raise' | 'select1' | 'select2' | 'toOperator' | 'toRobot' | 'stop' | 'reset' | 'jogPositive'
  | 'jogNegative' | 'jogRelease' | 'loaded' | 'clear' | 'fill' | 'slot' | 'config' | 'teachOperator' | 'teachRobot'
  | 'lockIn' | 'lockOut' | 'stopIn' | 'stopOut' | 'autoSwap';
export const TWIN_COMMANDS: Record<TwinAction, number> = {
  enable: 1, confirm: 2, disable: 3, swap: 4, powerOn: 5, powerOff: 6, driveReset: 7, home: 8,
  lower: 9, raise: 10, select1: 11, select2: 12, toOperator: 13, toRobot: 14, stop: 15, reset: 16,
  jogPositive: 17, jogNegative: 18, jogRelease: 19, loaded: 20, clear: 21, fill: 22, slot: 23, config: 24,
  teachOperator: 25, teachRobot: 26, start: 27, rejectStart: 28,
  lockIn: 29, lockOut: 30, stopIn: 31, stopOut: 32, autoSwap: 33,
};
export interface TwinState {
  live: boolean;
  autoSwapEnabled: boolean;
  robotPallet: PalletId; candidate: number; selected: number; step: number; faultStep: number; revision: number;
  enabled: boolean; confirmed: boolean; ready: boolean; busy: boolean; error: number; homeRequired: boolean; configValid: boolean;
  reason: number; p1: number; p2: number; lift: number; position: number; homed: boolean; powered: boolean;
  standstill: boolean; driveError: boolean; axisBound: boolean; ioMapped: boolean;
  manualLockOut?: boolean; manualStopOut?: boolean;
  sensors: { liftDown: boolean; liftUp: boolean; lockIn: boolean; lockOut: boolean; stopIn: boolean; stopOut: boolean; limitNegative: boolean; limitPositive: boolean; homeSensor: boolean };
  allowed: Record<'confirm' | 'start' | 'enable' | 'swap' | 'power' | 'driveReset' | 'home' | 'lower' | 'raise' | 'select' | 'lock' | 'stop' | 'move' | 'jog' | 'teachOperator' | 'teachWork' | 'reset' | 'edit' | 'edit1' | 'edit2' | 'config', boolean>;
  config: TwinConfig; pallets: [PalletInventory, PalletInventory];
}
export const TWIN_REASONS = ['', 'Выбран статичный магазин', 'Настройте и подтвердите параметры механизма',
  'Не подключены ось SoftMotion или I/O', 'Нет разрешения безопасности', 'Робот не готов к магазину или находится в его зоне',
  'Ошибка привода: сброс, затем Home', 'Противоречивые датчики', 'Требуется поиск дома при опущенной П2',
  'Замок и фиксатор не соответствуют настроенным сочетаниям П1/П2', 'Каретка не остановлена',
  'Каретка не в рабочей позиции выбранной палеты', 'Герконы не соответствуют настроенной конфигурации П1/П2',
  'Нажмите «Включить магазин» и подтвердите положение палет', 'Подтвердите загрузку палеты у оператора',
  'Точки SoftMotion нужны для запуска ячейки; магазин можно включить без них',
  'Проверьте геометрию матрицы магазина',
  'Нет связи HMI с PLC', 'Привод каретки выключен', 'Активна авария механизма магазина',
  'Для первого подтверждения включите ручной режим', '', 'Механизм выполняет команду'];
export const TWIN_STEPS: Record<number, string> = { 0: 'Ожидание', 20: '1/5 · Опускание П2', 30: '2/5 · Возврат к оператору',
  40: '3/5 · Переключение зацепления', 50: '4/5 · Подача к роботу', 60: '5/5 · Рабочее положение подъёма П2',
  100: 'Опускание П2', 110: 'Подъём П2', 120: 'Переключение зацепления', 130: 'Ход каретки', 150: 'Поиск дома', 160: 'JOG',
  170: 'Переключение замка', 180: 'Переключение фиксатора' };
const emptyPallet = (): PalletInventory => ({ slots: Array<SlotType>(96).fill('empty'), productTypes: Array<ProductType>(96).fill(1), loaded: false });
export function createTwinState(demo = false): TwinState {
  return { live: false, autoSwapEnabled: true, robotPallet: 1, candidate: demo ? 1 : 0, selected: demo ? 1 : 0, step: 0, faultStep: 0, revision: 1,
    enabled: false, confirmed: false, ready: false, busy: false, error: 0, homeRequired: false, configValid: demo, reason: demo ? 13 : 3,
    p1: 1, p2: 0, lift: 1, position: demo ? 1020 : 0, homed: demo, powered: demo, standstill: true,
    driveError: false, axisBound: demo, ioMapped: demo,
    sensors: { liftDown: false, liftUp: demo, lockIn: false, lockOut: demo, stopIn: demo, stopOut: false, limitNegative: false, limitPositive: false, homeSensor: false },
    manualLockOut: undefined, manualStopOut: undefined,
    allowed: { confirm: demo, start: demo, enable: false, swap: false, power: demo, driveReset: demo, home: false,
      lower: demo, raise: demo, select: false, lock: demo, stop: demo, move: false, jog: false, teachOperator: false, teachWork: false,
      reset: demo, edit: false, edit1: false, edit2: false, config: !demo },
    config: normalizeTwinConfig({ configured: demo, p1LockOut: demo, signalsConfigured: false, p1Signals: 0, p2Signals: 0,
      exchange: 0, workP1: demo ? 1020 : 0, workP2: demo ? 1020 : 0,
      home: 0, tolerance: demo ? 2 : 0, velocity: demo ? 200 : 0, acceleration: demo ? 400 : 0, deceleration: demo ? 400 : 0,
      jerk: demo ? 2000 : 0, cylinderMs: demo ? 5000 : 0, moveMs: demo ? 15000 : 0, homeMs: demo ? 30000 : 0, pulseMs: demo ? 200 : 0 }),
    pallets: [emptyPallet(), emptyPallet()],
  };
}
export function twinMagazine(base: MagazineData, twin: TwinState): MagazineData {
  const active = twin.pallets[twin.robotPallet - 1];
  return { ...base, twin, slots: active.slots, productTypes: active.productTypes,
    state: { ...base.state, rows: 12, columns: 8, enabled: twin.enabled, ready: twin.ready,
      busy: twin.busy, error: twin.error !== 0, enableSequenceAllowed: twin.allowed.enable,
      fillAllowed: false, clearAllowed: false, editAllowed: false } };
}
// Offline only. Real feedback and permissions always come from PLC.
export function syncTwinPreview(twin: TwinState, controller: TwoPalletPreviewController): TwinState {
  const pose = controller.getSnapshot();
  const wasBusy = twin.busy;
  const next: TwinState = { ...twin, allowed: { ...twin.allowed }, sensors: { ...twin.sensors },
    p1: pose.p1, p2: pose.p2, lift: pose.lift, selected: pose.selected, busy: pose.busy, standstill: !pose.busy };
  const c = normalizeTwinConfig(next.config);
  next.config = c;
  next.position = c.exchange + pose.carriage * ((pose.selected === 1 ? c.workP1 : c.workP2) - c.exchange);
  const upper = pose.lift >= 0.999, lower = pose.lift <= 0.001;
  if (wasBusy && !pose.busy && twin.step >= 20 && twin.step <= 60) {
    next.manualLockOut = undefined; next.manualStopOut = undefined;
  }
  const expected = twinSignalPattern(c, pose.selected);
  const lockOut = next.manualLockOut ?? expected.lockOut;
  const stopOut = next.manualStopOut ?? expected.stopOut;
  next.sensors = { ...next.sensors, liftUp: upper, liftDown: lower,
    lockOut, lockIn: !lockOut, stopOut, stopIn: !stopOut, homeSensor: pose.carriage < 0.001 };
  const signals = (lower ? 1 : 0) | (upper ? 2 : 0) | (lockOut ? 8 : 4) | (stopOut ? 32 : 16);
  next.selected = (signals & 60) === (c.p1Signals & 60) ? 1 : (signals & 60) === (c.p2Signals & 60) ? 2 : 0;
  const requiredSignals = next.selected === 2 ? c.p2Signals : c.p1Signals;
  next.candidate = !pose.busy && signals === requiredSignals && pose.carriage > 0.999
    && ((next.selected === 1 && pose.p1 > 0.999) || (next.selected === 2 && pose.p2 > 0.999)) ? next.selected : 0;
  if (next.candidate !== twin.candidate) next.revision += 1;
  if (wasBusy && !pose.busy && twin.step >= 20 && twin.step <= 60 && !next.error) {
    next.robotPallet = pose.selected; next.confirmed = next.candidate === pose.selected;
    next.pallets = next.pallets.map((p) => ({ ...p, loaded: false })) as TwinState['pallets'];
  }
  if (wasBusy && !pose.busy && twin.step === 150) { next.homed = true; next.homeRequired = false; }
  next.step = pose.busy ? twin.step : 0;
  const idle = !pose.busy;
  const valid = c.configured && validSignalConfiguration(c) && c.tolerance > 0 && c.tolerance <= 20
    && Math.abs(c.workP1 - c.exchange) > 2 * c.tolerance && Math.abs(c.workP2 - c.exchange) > 2 * c.tolerance
    && (c.workP1 - c.exchange) * (c.workP2 - c.exchange) > 0
    && c.velocity > 0 && c.acceleration > 0 && c.deceleration > 0 && c.jerk > 0
    && c.pulseMs >= 50 && c.cylinderMs > c.pulseMs && c.moveMs > 0 && c.homeMs > 0;
  next.configValid = valid;
  if (!valid || !next.powered || (idle && !next.candidate)) { next.confirmed = false; next.enabled = false; }
  if (pose.busy && twin.step >= 20 && twin.step <= 60) {
    const phase = Number(pose.label.match(/^([1-5])\/5/)?.[1]);
    if (phase) next.step = (phase + 1) * 10;
  }
  next.allowed = { confirm: idle && next.powered && next.homed && !!next.candidate && !next.error && !next.homeRequired,
    start: idle && next.powered && next.homed && !!next.candidate && !next.error && !next.homeRequired,
    enable: idle && next.confirmed && !!next.candidate && !next.error && next.powered,
    swap: idle && next.confirmed && !next.enabled && !!next.candidate && !next.error && next.powered,
    power: idle && !next.driveError, driveReset: idle, home: idle && lower && next.powered && !next.driveError,
    lower: idle, raise: idle && !next.homeRequired,
    select: idle && pose.canSelect, lock: idle, stop: idle, move: idle && lower && next.powered && next.homed && !next.homeRequired,
    jog: idle && lower && next.powered && !next.driveError,
    teachOperator: idle && lower && next.powered && next.homed && !next.homeRequired && !next.driveError,
    teachWork: idle && lower && next.powered && next.homed && !next.homeRequired && !next.driveError && !!next.selected,
    reset: idle && !!next.error && !next.driveError && !next.homeRequired,
    edit1: false, edit2: false,
    edit: true,
    config: idle && !next.enabled && !next.powered };
  if (!valid) {
    for (const key of Object.keys(next.allowed) as (keyof TwinState['allowed'])[]) {
      if (!['config', 'driveReset', 'edit', 'edit1', 'edit2', 'lock', 'stop', 'lower'].includes(key)) next.allowed[key] = false;
    }
  }
  next.allowed.edit1 = next.allowed.edit && (next.robotPallet !== 1 || !next.enabled);
  next.allowed.edit2 = next.allowed.edit && (next.robotPallet !== 2 || !next.enabled);
  next.ready = next.powered && valid && next.enabled && next.confirmed && !next.busy && !next.error && !!next.candidate;
  next.reason = !valid ? 2 : next.driveError ? 6 : next.homeRequired ? 8 : !next.candidate ? upper ? 11 : 12 : !next.confirmed ? 13 : !next.pallets[2 - next.robotPallet].loaded ? 14 : 0;
  return next;
}
export interface TwinCommandData { pallet?: number; revision?: number; slot?: number; content?: number; productType?: number; autoSwapEnabled?: boolean; config?: TwinConfig }
export function commandTwinPreview(twin: TwinState, controller: TwoPalletPreviewController, action: TwinAction, data: TwinCommandData = {}): TwinState {
  const next = structuredClone(twin);
  const a = next.allowed;
  const manual = (step: number, run: () => void) => { next.confirmed = false; next.enabled = false; next.step = step; run(); };
  switch (action) {
    case 'confirm': if (a.confirm && data.revision === next.revision && data.pallet === next.candidate) { next.confirmed = true; next.robotPallet = next.candidate as PalletId; } break;
    case 'start': if (a.start && data.revision === next.revision && data.pallet === next.candidate) { next.confirmed = true; next.robotPallet = next.candidate as PalletId; next.enabled = true; } break;
    case 'rejectStart': break;
    case 'enable': if (a.enable) next.enabled = true; break;
    case 'disable': next.enabled = false; break;
    case 'swap': if (a.swap) { next.step = 20; controller.swap(twinSignalPattern(next.config, 3 - next.robotPallet).liftUp); } break;
    case 'lower': if (a.lower) manual(100, () => controller.lift(false)); break;
    case 'raise': if (a.raise) manual(110, () => controller.lift(true)); break;
    case 'select1': case 'select2': if (a.select) manual(120, () => controller.select(action === 'select1' ? 1 : 2)); break;
    case 'lockIn': case 'lockOut': if (a.lock) { next.manualLockOut = action === 'lockOut'; next.confirmed = false; next.enabled = false; } break;
    case 'stopIn': case 'stopOut': if (a.stop) { next.manualStopOut = action === 'stopOut'; next.confirmed = false; next.enabled = false; } break;
    case 'toOperator': case 'toRobot': if (a.move) manual(130, () => controller.move(action === 'toRobot')); break;
    case 'home': if (a.home) manual(150, () => controller.move(false)); break;
    case 'teachOperator': if (a.teachOperator) { next.config.exchange = next.position; next.confirmed = false; next.revision += 1; } break;
    case 'teachRobot':
      if (a.teachWork && next.selected) {
        if (next.selected === 1) next.config.workP1 = next.position; else next.config.workP2 = next.position;
        next.confirmed = false; next.revision += 1;
      }
      break;
    case 'powerOn': if (a.power) next.powered = true; break;
    case 'powerOff': if (a.driveReset) { next.powered = false; next.confirmed = false; next.enabled = false; } break;
    case 'driveReset': if (a.driveReset && next.driveError) { next.driveError = false; next.powered = false; next.homeRequired = true; next.confirmed = false; next.enabled = false; } break;
    case 'stop':
      if (next.busy || (next.powered && !next.standstill)) {
        next.faultStep = next.step; controller.stop(); next.error |= 0x2000; next.confirmed = false;
      }
      next.enabled = false; next.busy = false; next.step = 0;
      break;
    case 'reset': if (a.reset) { next.error = 0; next.confirmed = false; next.enabled = false; } break;
    case 'config': if (a.config && data.config && data.config.signalsConfigured && validSignalConfiguration(data.config)) {
      next.config = { ...data.config }; next.confirmed = false; next.enabled = false; next.revision += 1;
    } break;
    case 'autoSwap': if (typeof data.autoSwapEnabled === 'boolean') next.autoSwapEnabled = data.autoSwapEnabled; break;
    case 'loaded': case 'fill': case 'clear': case 'slot': {
      const pallet = data.pallet ?? 3 - next.robotPallet;
      if (!([1, 2].includes(pallet) && (pallet === 1 ? a.edit1 : a.edit2))) break;
      const p = next.pallets[pallet - 1];
      p.loaded = action === 'loaded';
      if (action === 'fill' || action === 'clear') p.slots.fill(action === 'fill' ? 'blank' : 'empty');
      if (action === 'slot' && data.slot && data.slot >= 1 && data.slot <= 96) {
        p.slots[data.slot - 1] = data.content === 1 ? 'blank' : data.content === 2 ? 'detail' : 'empty';
        p.productTypes[data.slot - 1] = (data.productType ?? 1) as ProductType;
      }
      break;
    }
  }
  return syncTwinPreview(next, controller);
}
export function changeOfflineMagazineMode(state: CellState, mode: 0 | 1, bank: Map<number, CellState['magazines']>): CellState {
  if (mode === (state.magazineMode ?? 1) || state.magazines.some((m) => m.twin?.busy)) return state;
  bank.set(state.magazineMode ?? 1, structuredClone(state.magazines));
  const magazines = bank.get(mode) ?? state.magazines.map((m) => twinMagazine(m, createTwinState(true))) as CellState['magazines'];
  const restored = structuredClone(magazines);
  for (const magazine of restored) if (magazine.twin) {
    magazine.twin.confirmed = false; magazine.twin.enabled = false; magazine.twin.ready = false;
    magazine.twin.revision += 1;
    for (const pallet of magazine.twin.pallets) pallet.loaded = false;
  }
  return { ...state, magazineMode: mode, magazineModeAllowed: true, magazines: restored };
}
