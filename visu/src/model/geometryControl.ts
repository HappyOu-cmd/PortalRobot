export interface GeometryConfig { configured: boolean; x: number; y: number; z: number; safeZ: number; changeZ: number; speedFactor: number }
export interface GeometryCall { id: number; machine: number; productType: number; station: number; forced: boolean; state: number; reason: number; magazine: number; pallet: number; slot: number }
export interface GeometryStation {
  state: number; enabled: boolean; ready: boolean; occupied: boolean; reserved: boolean; partStored: boolean;
  partAtEnd: boolean; running: boolean; driveAlarm: boolean; error: boolean; robotStopRequired: boolean;
  enableAllowed: boolean; disableAllowed: boolean; confirmAllowed: boolean; confirmationActive: boolean; recoveryRequired: boolean;
  manualStartAllowed: boolean; resetAllowed: boolean; resetBusy: boolean;
  configAllowed: boolean; pointWriteAllowed: boolean; simulationRemoveAllowed: boolean; simulationAlarmAllowed: boolean; configured: boolean;
  produced: number; partId: number; machine: number; productType: number; travel: number; config: GeometryConfig;
}
export interface GeometrySnapshot {
  available: boolean; supported: boolean; automatic: boolean; autoChangeAllowed: boolean; waitWhenOccupied: boolean;
  settingsAllowed: boolean; transportSeconds: number; feedbackSeconds: number; resetSeconds: number;
  stations: GeometryStation[]; calls: GeometryCall[]; periods: number[]; counts: number[]; callAllowed: boolean[]; cancelAllowed: boolean[];
}
export interface GeometryHistoryCall extends GeometryCall {
  key: string; environment: number; createdAt: number; updatedAt: number; result: 'unchecked' | 'good' | 'defect'; revision: number;
  results: { timestampMs: number; result: string; actorName: string; revision: number }[];
}
export const GEOMETRY_STATES = ['Выключен', 'Свободен', 'Передача роботом', 'Доставка по ленте', 'Ожидает изъятия', 'Нужно подтвердить освобождение', 'Авария', 'Ручной ход'];
export const GEOMETRY_CALL_STATES = ['', 'Вызвана', 'В захвате / ожидание ГК', 'Доставка на ГК', 'На ГК', 'В магазине', 'Отменена', 'Прервана', 'Изъята'];
export const GEOMETRY_REASONS = ['', 'Оба ГК заняты', 'Нет доступного ГК', 'ГК выключен', 'Авария ГК', 'Перезапуск / неизвестное положение'];
const boolFields = { enabled: 'xEnabled', ready: 'xReady', occupied: 'xOccupied', reserved: 'xReserved', partStored: 'xPartStored', partAtEnd: 'xPartAtEnd', running: 'xDriveRunning', driveAlarm: 'xDriveAlarm', error: 'xError', robotStopRequired: 'xRobotStopRequired', enableAllowed: 'xEnableAllowed', disableAllowed: 'xDisableAllowed', confirmAllowed: 'xConfirmAllowed', confirmationActive: 'xConfirmationActive', recoveryRequired: 'xRecoveryRequired', manualStartAllowed: 'xManualStartAllowed', resetAllowed: 'xResetAllowed', resetBusy: 'xResetBusy', configAllowed: 'xConfigAllowed', pointWriteAllowed: 'xPointWriteAllowed', simulationRemoveAllowed: 'xSimulationRemoveAllowed', simulationAlarmAllowed: 'xSimulationAlarmAllowed', configured: 'xConfigured' } as const;
const numberFields = { state: 'uiState', produced: 'udiProducedPartsTotal', partId: 'udiPartId', machine: 'uiMachine', productType: 'uiProductType', travel: 'rTravel' } as const;
const configFields = { x: 'lrX', y: 'lrY', z: 'lrZ', safeZ: 'lrSafeZ', changeZ: 'lrChangeZ', speedFactor: 'lrSpeedFactor' } as const;
const callFields = { id: 'udiId', machine: 'uiMachine', productType: 'uiProductType', station: 'uiStation', state: 'uiState', reason: 'uiReason', magazine: 'uiMagazine', pallet: 'uiPallet', slot: 'uiSlot' } as const;
const num = (values: Record<string, unknown>, path: string, fallback: number) => values[path] === undefined || !Number.isFinite(Number(values[path])) ? fallback : Number(values[path]);
const bool = (values: Record<string, unknown>, path: string, fallback: boolean) => values[path] === undefined ? fallback : values[path] === true || values[path] === 1;
export const emptyGeometryConfig = (): GeometryConfig => ({ configured: false, x: 0, y: 0, z: 0, safeZ: -300, changeZ: -150, speedFactor: 0.2 });
export function createGeometrySnapshot(): GeometrySnapshot {
  const stations = [1, 2].map(() => ({ ...Object.fromEntries(Object.keys(boolFields).map(f => [f, false])), ...Object.fromEntries(Object.keys(numberFields).map(f => [f, 0])), config: emptyGeometryConfig() }) as GeometryStation);
  return { available: false, supported: false, automatic: false, autoChangeAllowed: false, waitWhenOccupied: true, settingsAllowed: false, transportSeconds: 10, feedbackSeconds: 3, resetSeconds: 1, stations, calls: [1, 2, 3].map(machine => ({ id: 0, machine, productType: 0, station: 0, forced: false, state: 0, reason: 0, magazine: 0, pallet: 0, slot: 0 })), periods: [20, 20, 20], counts: [0, 0, 0], callAllowed: [false, false, false], cancelAllowed: [false, false, false] };
}
export function mapGeometrySnapshot(values: Record<string, unknown>, current = createGeometrySnapshot()): GeometrySnapshot {
  return { ...current, available: current.available || values.xGeometrySupported !== undefined,
    supported: bool(values, 'xGeometrySupported', current.supported), automatic: bool(values, 'xGeometryAutoEnabled', current.automatic), autoChangeAllowed: bool(values, 'xGeometryAutoChangeAllowed', current.autoChangeAllowed), waitWhenOccupied: bool(values, 'xGeometryWaitWhenOccupied', current.waitWhenOccupied), settingsAllowed: bool(values, 'xGeometrySettingsAllowed', current.settingsAllowed),
    transportSeconds: num(values, 'tGeometryTransportTimeout', current.transportSeconds * 1000) / 1000, feedbackSeconds: num(values, 'tGeometryFeedbackTimeout', current.feedbackSeconds * 1000) / 1000, resetSeconds: num(values, 'tGeometryResetPulse', current.resetSeconds * 1000) / 1000,
    stations: current.stations.map((station, i) => {
      const root = `astGeometryStatus[${i + 1}]`, configRoot = `astGeometryConfig[${i + 1}]`;
      return { ...station, ...Object.fromEntries(Object.entries(boolFields).map(([f, tag]) => [f, bool(values, `${root}.${tag}`, station[f as keyof typeof boolFields])])), ...Object.fromEntries(Object.entries(numberFields).map(([f, tag]) => [f, num(values, `${root}.${tag}`, station[f as keyof typeof numberFields])])), config: { ...station.config, configured: bool(values, `${configRoot}.xConfigured`, station.config.configured), ...Object.fromEntries(Object.entries(configFields).map(([f, tag]) => [f, num(values, `${configRoot}.${tag}`, station.config[f as keyof typeof configFields])])) } };
    }), calls: current.calls.map((call, i) => ({ ...call, forced: bool(values, `astGeometryCalls[${i + 1}].xForced`, call.forced), ...Object.fromEntries(Object.entries(callFields).map(([f, tag]) => [f, num(values, `astGeometryCalls[${i + 1}].${tag}`, call[f as keyof typeof callFields])])) })),
    periods: current.periods.map((p, i) => num(values, `auiGeometryPeriod[${i + 1}]`, p)), counts: current.counts.map((p, i) => num(values, `auiGeometryCount[${i + 1}]`, p)), callAllowed: current.callAllowed.map((p, i) => bool(values, `axGeometryCallAllowed[${i + 1}]`, p)), cancelAllowed: current.cancelAllowed.map((p, i) => bool(values, `axGeometryCancelAllowed[${i + 1}]`, p)) };
}
export const geometryConfigPayload = (config: GeometryConfig) => Object.fromEntries(Object.entries(configFields).map(([field, tag]) => [tag, config[field as keyof typeof configFields]]));

export interface GeometryBeltVisual { beltPhase: number; beltTravel: number; sample: number | null; productType: number }
export class GeometryBeltAnimation {
  private travel = 0;
  update(station: GeometryStation | undefined, dt: number, speed: number): GeometryBeltVisual {
    if (station?.running) this.travel -= Math.max(0, Math.min(dt, 0.1)) * Math.max(0, Math.min(speed, 2));
    return { beltTravel: this.travel, beltPhase: ((this.travel / 1.96) % 1 + 1) % 1, sample: station?.partStored && station.partId ? 1 - Math.max(0, Math.min(1, station.partAtEnd ? 1 : station.travel)) : null, productType: station?.productType ?? 0 };
  }
}
