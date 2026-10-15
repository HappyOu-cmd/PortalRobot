export interface GeometryConfig { configured: boolean; x: number; y: number; z: number; safeZ: number; changeZ: number; speedFactor: number }
export interface GeometryCall { id: number; machine: number; productType: number; station: number; forced: boolean; state: number; reason: number; magazine: number; pallet: number; slot: number }
export interface GeometryStation {
  state: number; enabled: boolean; disablePending: boolean; ready: boolean; occupied: boolean; reserved: boolean; partStored: boolean;
  partAtEnd: boolean; running: boolean; driveAlarm: boolean; error: boolean; robotStopRequired: boolean;
  enableAllowed: boolean; disableAllowed: boolean; confirmAllowed: boolean; confirmationActive: boolean; recoveryRequired: boolean;
  manualStartAllowed: boolean; resetAllowed: boolean; resetBusy: boolean;
  configAllowed: boolean; pointWriteAllowed: boolean; simulationRemoveAllowed: boolean; simulationAlarmAllowed: boolean; configured: boolean; callWaitWarning: boolean;
  produced: number; partId: number; machine: number; productType: number; travel: number; config: GeometryConfig;
  enableBlockers: number | null; confirmBlockers: number | null;
}
export interface GeometrySnapshot {
  available: boolean; supported: boolean; automatic: boolean; autoChangeAllowed: boolean; waitWhenOccupied: boolean;
  settingsAllowed: boolean; transportSeconds: number; feedbackSeconds: number; resetSeconds: number; waitWarningSeconds: number;
  stations: GeometryStation[]; calls: GeometryCall[]; periods: number[]; counts: number[]; callAllowed: boolean[]; cancelAllowed: boolean[];
}
export interface GeometryHistoryCall extends GeometryCall {
  key: string; environment: number; createdAt: number; updatedAt: number; result: 'unchecked' | 'good' | 'defect'; revision: number;
  results: { timestampMs: number; result: string; actorName: string; revision: number }[];
}
export const GEOMETRY_STATES = ['Выключен', 'Свободен', 'Передача роботом', 'Доставка по ленте', 'Ожидает изъятия', 'Нужно подтвердить освобождение', 'Авария', 'Ручной ход'];
export const GEOMETRY_CALL_STATES = ['', 'Вызвана', 'В захвате / ожидание ГК', 'Доставка на ГК', 'На ГК', 'В магазине', 'Отменена', 'Прервана', 'Изъята'];
export const GEOMETRY_REASONS = ['', 'Оба ГК заняты', 'Нет доступного ГК', 'ГК выключен', 'Авария ГК', 'Перезапуск / неизвестное положение'];
export interface GeometryOverviewStatus { text: string; tone: 'gray' | 'green' | 'blue' | 'amber' | 'red' }
export function geometryOverviewStatus(snapshot: GeometrySnapshot | undefined, stationIndex: number, online: boolean): GeometryOverviewStatus {
  const station = snapshot?.stations[stationIndex];
  if (!online || !snapshot?.available || !station) return { text: 'Нет данных', tone: 'gray' };
  if (!snapshot.supported) return { text: 'Недоступен', tone: 'gray' };
  if (station.error || station.driveAlarm || station.state === 6) return { text: 'Авария', tone: 'red' };
  if (station.recoveryRequired || station.confirmationActive || station.state === 5) return { text: 'Указать состояние ГК', tone: 'amber' };
  if (station.disablePending) return { text: 'Выключение после доставки', tone: 'amber' };
  const text = GEOMETRY_STATES[station.state];
  if (!text) return { text: 'Нет данных', tone: 'gray' };
  return { text, tone: station.state === 0 ? 'gray' : station.state === 1 ? 'green' : station.state === 4 ? 'amber' : 'blue' };
}

export type GeometryPartPosition = 'empty' | 'placed' | 'conveying' | 'operator' | 'unknown';
// Фиксированные этапы PLC, без расчёта координаты детали по времени или rTravel.
export function geometryPartPosition(station: GeometryStation | undefined, online: boolean): GeometryPartPosition {
  if (!online || !station) return 'unknown';
  if (station.partAtEnd) return 'operator';
  if (!station.partStored) {
    if (station.recoveryRequired || station.confirmationActive || station.state === 5) return 'unknown';
    return station.occupied && !station.reserved ? 'unknown' : 'empty';
  }
  if (station.running) return 'conveying';
  if (station.recoveryRequired || station.confirmationActive || station.error || station.driveAlarm || station.state === 5 || station.state === 6) return 'unknown';
  if (station.reserved || station.state === 2) return 'placed';
  if (station.state === 3) return 'conveying';
  // State 4 сохраняется и при трёхсекундном подтверждении изъятия после спада датчика.
  if (station.state === 4) return 'operator';
  return 'unknown';
}

const boolFields = { enabled: 'xEnabled', disablePending: 'xDisablePending', ready: 'xReady', occupied: 'xOccupied', reserved: 'xReserved', partStored: 'xPartStored', partAtEnd: 'xPartAtEnd', running: 'xDriveRunning', driveAlarm: 'xDriveAlarm', error: 'xError', robotStopRequired: 'xRobotStopRequired', enableAllowed: 'xEnableAllowed', disableAllowed: 'xDisableAllowed', confirmAllowed: 'xConfirmAllowed', confirmationActive: 'xConfirmationActive', recoveryRequired: 'xRecoveryRequired', manualStartAllowed: 'xManualStartAllowed', resetAllowed: 'xResetAllowed', resetBusy: 'xResetBusy', configAllowed: 'xConfigAllowed', pointWriteAllowed: 'xPointWriteAllowed', simulationRemoveAllowed: 'xSimulationRemoveAllowed', simulationAlarmAllowed: 'xSimulationAlarmAllowed', configured: 'xConfigured', callWaitWarning: 'xCallWaitWarning' } as const;
const numberFields = { state: 'uiState', produced: 'udiProducedPartsTotal', partId: 'udiPartId', machine: 'uiMachine', productType: 'uiProductType', travel: 'rTravel' } as const;
const configFields = { x: 'lrX', y: 'lrY', z: 'lrZ', safeZ: 'lrSafeZ', changeZ: 'lrChangeZ', speedFactor: 'lrSpeedFactor' } as const;
const callFields = { id: 'udiId', machine: 'uiMachine', productType: 'uiProductType', station: 'uiStation', state: 'uiState', reason: 'uiReason', magazine: 'uiMagazine', pallet: 'uiPallet', slot: 'uiSlot' } as const;
const num = (values: Record<string, unknown>, path: string, fallback: number) => values[path] === undefined || !Number.isFinite(Number(values[path])) ? fallback : Number(values[path]);
const bool = (values: Record<string, unknown>, path: string, fallback: boolean) => values[path] === undefined ? fallback : values[path] === true || values[path] === 1;
const blockers = (value: unknown, fallback: number | null) => value === undefined ? fallback
  : value !== null && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 0xffffffff ? Number(value) : null;
export const emptyGeometryConfig = (): GeometryConfig => ({ configured: false, x: 0, y: 0, z: 0, safeZ: -300, changeZ: -150, speedFactor: 0.2 });
export function createGeometrySnapshot(): GeometrySnapshot {
  const stations = [1, 2].map(() => ({ ...Object.fromEntries(Object.keys(boolFields).map(f => [f, false])), ...Object.fromEntries(Object.keys(numberFields).map(f => [f, 0])), enableBlockers: null, confirmBlockers: null, config: emptyGeometryConfig() }) as GeometryStation);
  return { available: false, supported: false, automatic: false, autoChangeAllowed: false, waitWhenOccupied: true, settingsAllowed: false, transportSeconds: 10, feedbackSeconds: 3, resetSeconds: 1, waitWarningSeconds: 180, stations, calls: [1, 2, 3].map(machine => ({ id: 0, machine, productType: 0, station: 0, forced: false, state: 0, reason: 0, magazine: 0, pallet: 0, slot: 0 })), periods: [20, 20, 20], counts: [0, 0, 0], callAllowed: [false, false, false], cancelAllowed: [false, false, false] };
}
export function mapGeometrySnapshot(values: Record<string, unknown>, current = createGeometrySnapshot()): GeometrySnapshot {
  return { ...current, available: current.available || values.xGeometrySupported !== undefined,
    supported: bool(values, 'xGeometrySupported', current.supported), automatic: bool(values, 'xGeometryAutoEnabled', current.automatic), autoChangeAllowed: bool(values, 'xGeometryAutoChangeAllowed', current.autoChangeAllowed), waitWhenOccupied: bool(values, 'xGeometryWaitWhenOccupied', current.waitWhenOccupied), settingsAllowed: bool(values, 'xGeometrySettingsAllowed', current.settingsAllowed),
    transportSeconds: num(values, 'tGeometryTransportTimeout', current.transportSeconds * 1000) / 1000, feedbackSeconds: num(values, 'tGeometryFeedbackTimeout', current.feedbackSeconds * 1000) / 1000, resetSeconds: num(values, 'tGeometryResetPulse', current.resetSeconds * 1000) / 1000, waitWarningSeconds: num(values, 'tGeometryWaitWarningTimeout', current.waitWarningSeconds * 1000) / 1000,
    stations: current.stations.map((station, i) => {
      const root = `astGeometryStatus[${i + 1}]`, configRoot = `astGeometryConfig[${i + 1}]`;
      return { ...station, ...Object.fromEntries(Object.entries(boolFields).map(([f, tag]) => [f, bool(values, `${root}.${tag}`, station[f as keyof typeof boolFields])])), ...Object.fromEntries(Object.entries(numberFields).map(([f, tag]) => [f, num(values, `${root}.${tag}`, station[f as keyof typeof numberFields])])), enableBlockers: blockers(values[`${root}.dwEnableBlockers`], station.enableBlockers), confirmBlockers: blockers(values[`${root}.dwConfirmBlockers`], station.confirmBlockers), config: { ...station.config, configured: bool(values, `${configRoot}.xConfigured`, station.config.configured), ...Object.fromEntries(Object.entries(configFields).map(([f, tag]) => [f, num(values, `${configRoot}.${tag}`, station.config[f as keyof typeof configFields])])) } };
    }), calls: current.calls.map((call, i) => ({ ...call, forced: bool(values, `astGeometryCalls[${i + 1}].xForced`, call.forced), ...Object.fromEntries(Object.entries(callFields).map(([f, tag]) => [f, num(values, `astGeometryCalls[${i + 1}].${tag}`, call[f as keyof typeof callFields])])) })),
    periods: current.periods.map((p, i) => num(values, `auiGeometryPeriod[${i + 1}]`, p)), counts: current.counts.map((p, i) => num(values, `auiGeometryCount[${i + 1}]`, p)), callAllowed: current.callAllowed.map((p, i) => bool(values, `axGeometryCallAllowed[${i + 1}]`, p)), cancelAllowed: current.cancelAllowed.map((p, i) => bool(values, `axGeometryCancelAllowed[${i + 1}]`, p)) };
}
export const geometryConfigPayload = (config: GeometryConfig) => Object.fromEntries(Object.entries(configFields).map(([field, tag]) => [tag, config[field as keyof typeof configFields]]));

// Расшифровка причин PLC, без повторного расчёта технологических разрешений в HMI.
const GEOMETRY_CONTROL_CONDITIONS = [
  { mask: 1, key: 'hardware', title: 'Оборудование ГК', done: 'Интерфейс и физические сигналы доступны', blocked: 'ГК недоступен: требуется SoftMotion и подтверждённая карта входов и выходов' },
  { mask: 2, key: 'hmi', title: 'Связь с панелью', done: 'PLC подтверждает связь с HMI', blocked: 'PLC не подтверждает связь с HMI' },
  { mask: 4, key: 'safety', title: 'Общие блокировки', done: 'Общих аварий и остановов нет', blocked: 'Активна общая авария или экстренный останов' },
  { mask: 8, key: 'io', title: 'Управление выходами', done: 'Выходами управляет программа', blocked: 'Включено прямое ручное управление входами и выходами' },
  { mask: 16, key: 'alarm', title: 'Аварии ГК', done: 'Активных аварий станции нет', blocked: 'Устраните причину аварии ГК и выполните сброс' },
  { mask: 32, key: 'point', title: 'Базовая точка', done: 'Точка, безопасная высота и скорость настроены', blocked: 'Задайте базу, SAFE_Z и скорость ГК в разделе «Точки» расширенного управления роботом' },
  { mask: 64, key: 'robot', title: 'Робот у станции', done: 'Робот не взаимодействует с этим ГК', blocked: 'Робот работает с этим ГК или ещё не отошёл от места укладки' },
  { mask: 128, key: 'reservation', title: 'Резерв станции', done: 'Станция не зарезервирована роботом', blocked: 'Этот ГК зарезервирован для передачи детали' },
  { mask: 256, key: 'drive', title: 'Привод конвейера', done: 'Останов привода подтверждён', blocked: 'Привод конвейера ещё работает' },
  { mask: 512, key: 'manual', title: 'Ручной ход ленты', done: 'Ручной пуск ленты выключен', blocked: 'Остановите ручной ход ленты' },
  { mask: 1024, key: 'reset', title: 'Сброс привода', done: 'Импульс сброса не выполняется', blocked: 'Дождитесь завершения импульса сброса привода' },
  { mask: 2048, key: 'disable', title: 'Выключение станции', done: 'Отложенного выключения нет', blocked: 'Дождитесь завершения выключения ГК' },
  { mask: 8192, key: 'transport', title: 'Доставка по ленте', done: 'Автоматическая доставка завершена', blocked: 'По ленте выполняется доставка детали' },
  { mask: 16384, key: 'confirmation', title: 'Проверка состояния', done: 'Станция ожидает подтверждения', blocked: 'Подтверждение пустоты сейчас не требуется' },
  { mask: 32768, key: 'sensor', title: 'Конечный датчик', done: 'Конечный датчик свободен', blocked: 'Уберите деталь: конечный датчик включён' },
] as const;
export interface GeometryReadinessCondition { key: string; ready: boolean; title: string; done: string; blocked: string }
export function geometryReadinessConditions(station: GeometryStation, online: boolean, action: 'enable' | 'confirm' = 'enable'): GeometryReadinessCondition[] {
  if (!online) return [{ key: 'connection', ready: false, title: 'Связь с контроллером', done: '', blocked: 'Нет актуальной связи с PLC' }];
  const mask = action === 'enable' ? station.enableBlockers : station.confirmBlockers;
  if (mask === null) return [{ key: 'data', ready: false, title: 'Условия станции', done: '', blocked: 'Подробные условия станции ещё не получены от PLC' }];
  const conditions: GeometryReadinessCondition[] = GEOMETRY_CONTROL_CONDITIONS
    .filter(condition => action === 'enable' ? condition.mask < 16384 : condition.mask !== 32 || station.confirmationActive)
    .map(condition => ({ ...condition, ready: (mask & condition.mask) === 0 }));
  if (action === 'enable') conditions.push({ key: 'recovery', ready: !station.recoveryRequired && !station.confirmationActive,
    title: 'Проверка всей ленты', done: 'Состояние ленты подтверждено', blocked: 'Проверьте всю ленту и укажите состояние ГК' });
  return conditions;
}

export interface GeometryBeltVisual { beltPhase: number; beltTravel: number; sample: number | null; productType: number; warningPulse: number; operatorPulse: number }
export class GeometryBeltAnimation {
  private travel = 0;
  private warningPhase = 0;
  private operatorPhase = 0;
  update(station: GeometryStation | undefined, dt: number, speed: number, reducedMotion = false,
    warningActive = station?.callWaitWarning ?? false): GeometryBeltVisual {
    if (station?.running) this.travel -= Math.max(0, Math.min(dt, 0.1)) * Math.max(0, Math.min(speed, 2));
    this.warningPhase = warningActive ? (this.warningPhase + Math.max(0, Math.min(dt, 0.1)) / 2) % 1 : 0;
    const partAtOperator = geometryPartPosition(station, true) === 'operator';
    this.operatorPhase = partAtOperator ? (this.operatorPhase + Math.max(0, Math.min(dt, 0.1)) / 0.8) % 1 : 0;
    return { beltTravel: this.travel, beltPhase: ((this.travel / 1.96) % 1 + 1) % 1, sample: station?.partStored && station.partId ? 1 - Math.max(0, Math.min(1, station.partAtEnd ? 1 : station.travel)) : null, productType: station?.productType ?? 0,
      warningPulse: warningActive ? reducedMotion ? 1 : 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(this.warningPhase * Math.PI * 2)) : 0,
      operatorPulse: partAtOperator ? reducedMotion ? 1 : 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(this.operatorPhase * Math.PI * 2)) : 0 };
  }
}
