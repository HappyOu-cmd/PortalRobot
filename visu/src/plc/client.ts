import type { CellState, MachineMode, MachineOperation, MachinePartState, MachinePartType, MagazineOperation, PayloadProductType, ProductType, RobotCoordinateFrame, SlotType, Vec3Mm } from '../model/types';
import type { CyclogramHistory, CyclogramUpdate } from '../model/cyclogram';

export type PlcConnectionStatus = 'connecting' | 'connected' | 'degraded' | 'disconnected';
export type PlcAlarmSeverity = 'alarm' | 'warning';
export type PlcAlarmSource = 'cell' | 'robot' | 'machine-1' | 'machine-2' | 'machine-3' | 'magazine-1' | 'magazine-2' | 'magazine-axis-1' | 'magazine-axis-2' | 'axis-x' | 'axis-y' | 'axis-z' | 'axis-group' | 'motion-manager' | 'point-manager' | 'gripper';

export interface PlcAlarmEvent {
  id: number;
  severity: PlcAlarmSeverity;
  source: PlcAlarmSource;
  code: number;
  text: string;
  active: boolean;
  reportedAt: number;
}

export interface PlcConnectionInfo {
  status: PlcConnectionStatus;
  endpoint: string;
  message: string;
  symbols: number;
  missing: string[];
}

export interface CellLogEvent {
  id: number;
  timestampMs: number;
  sourceId: number;
  source: string;
  eventType: string;
  status: string;
  message: string;
  code: string | null;
  operationId: string | null;
  commandSeq: number | null;
  requestId: string | null;
  oldValue: unknown;
  newValue: unknown;
  details: unknown;
  actor: CellLogActor | null;
}

export interface CellLogActor {
  id: number;
  username: string;
  displayName: string;
  role?: 'admin' | 'operator' | null;
  enabled?: boolean;
}

export interface CellLogHistory {
  serverTime: number;
  retentionMs: number;
  events: CellLogEvent[];
}

export interface PlcAxisManualStatus {
  jogPositiveAllowed: boolean;
  jogNegativeAllowed: boolean;
  homeAllowed: boolean;
  moveAbsoluteAllowed: boolean;
  moveRelativePositiveAllowed: boolean;
  moveRelativeNegativeAllowed: boolean;
  driveReady: boolean;
  busy: boolean;
  error: boolean;
  homed: boolean;
  actualPosition: number;
  targetPosition: number;
  deviation: number;
  minPosition: number;
  maxPosition: number;
  commandVelocity: number;
  maxVelocity: number;
  rejectCode: number;
  rejectReason: string;
  stateCode: number;
  stepName: string;
}

export interface PlcRobotManualStatus {
  drivesPowered: boolean;
  drivesOff: boolean;
  powerTransitionActive: boolean;
  drivesEnableAllowed: boolean;
  drivesDisableAllowed: boolean;
  resetAllowed: boolean;
  stopAllowed: boolean;
  pointsAllowed: boolean;
  gripperAllowed: boolean;
  gripper1OpenAllowed: boolean;
  gripper1CloseAllowed: boolean;
  gripper2OpenAllowed: boolean;
  gripper2CloseAllowed: boolean;
  rotateToBlankAllowed: boolean;
  rotateToDetailAllowed: boolean;
  commandBusy: boolean;
  activeAction: number;
  activePoint: number;
  rejectCode: number;
  rejectReason: string;
}

export interface PlcCellStartReadiness {
  cellIdle: boolean;
  automaticMode: boolean;
  noBlockingError: boolean;
  robotInterfaceReady: boolean;
  configurationValid: boolean;
  drivesReady: boolean;
  robotReady: boolean;
  magazineReady: boolean;
  taskAvailable: boolean;
  safetyHome: boolean;
  met: number;
  total: number;
}

export interface PlcRobotModbusInfo {
  requestedMode: number;
  modeChangeAllowed: boolean;
  settingsChangeAllowed: boolean;
  modeRejectReason: number;
  settingsRejectReason: number;
  ip: [number, number, number, number];
  port: number;
  unitId: number;
  responseTimeoutMs: number;
  pollIntervalMs: number;
  heartbeatTimeoutMs: number;
  configValid: boolean;
  connected: boolean;
  communicationAlive: boolean;
  statusFresh: boolean;
  controllerOn: boolean;
  automaticMode: boolean;
  remoteEnabled: boolean;
  drivesEnabled: boolean;
  homed: boolean;
  emergencyStop: boolean;
  robotAlarm: boolean;
  positionValid: boolean;
  ready: boolean;
  busy: boolean;
  done: boolean;
  error: boolean;
  commandTimeout: boolean;
  ackSeq: number;
  executionState: number;
  alarmCode: number;
  resultCode: number;
  activeCommand: number;
  currentPoint: number;
  gripperStatus: number;
  robotHeartbeat: number;
  statusWord: number;
  operationPhase: number;
  protocolVersion: number;
  actualX: number;
  actualY: number;
  actualZ: number;
  clientError: number;
  readError: number;
  writeError: number;
  transportError: number;
  writeRegisters: number[];
  readRegisters: number[];
}

export interface PlcCellSettings {
  changeAllowed: boolean;
  safetyHome: {
    x: number;
    y: number;
    z: number;
    speedFactor: number;
    toleranceX: number;
    toleranceY: number;
    toleranceZ: number;
  };
  timeouts: {
    robotMove: number;
    robotAction: number;
    robotRelease: number;
    doorOpen: number;
    doorClose: number;
    chuckOpen: number;
    chuckClose: number;
    cycleStart: number;
  };
}

export interface PlcTestEnvironmentInfo {
  requested: number;
  applied: number;
  speedProfile: number;
  changeAllowed: boolean;
  scenarioApplyAllowed: boolean;
  simulatorActive: boolean;
  benchKey: boolean;
  benchKeyLost: boolean;
  rejectReason: number;
}

export interface PlcRuntimeInfo {
  cellRunning: boolean;
  cellStopPending: boolean;
  globalError: boolean;
  readyToStart: boolean;
  cellStartAllowed: boolean;
  cellStopAllowed: boolean;
  cellResetAllowed: boolean;
  manualModeAllowed: boolean;
  automaticModeAllowed: boolean;
  drivesReady: boolean;
  robotReady: boolean;
  magazineReady: boolean;
  safetyHomeRequired: boolean;
  robotAtSafetyHome: boolean;
  cellSettings: PlcCellSettings;
  testEnvironment: PlcTestEnvironmentInfo;
  startReadiness: PlcCellStartReadiness;
  readyMachines: number;
  manualMode: boolean;
  selectedMachine: number;
  operatorPromptActive: boolean;
  operatorChoiceAllowed: boolean;
  operatorCancelAllowed: boolean;
  operatorPrompt: number;
  operatorTypeMask: number;
  operatorMachineMask: number;
  cellStateCode: number;
  robotStateCode: number;
  robotActionCode: number;
  robotPointCode: number;
  magazineStateCode: number;
  magazineStateCodes: [number, number];
  cellStep: string;
  robotStep: string;
  machineSteps: string[];
  magazineStep: string;
  magazineSteps: [string, string];
  activeMagazine: number;
  activeAlarmCount: number;
  activeWarningCount: number;
  alarmEvents: PlcAlarmEvent[];
  equipmentLoad: [number, number, number, number];
  modbusMode: boolean;
  robotModbus: PlcRobotModbusInfo;
  multiTypeCount: number;
  multiTypeMagazineConfigAllowed: boolean;
  multiTypeCountAllowed: boolean;
  multiTypeMachineAllowed: [boolean, boolean, boolean];
  multiTypeConfigurationValid: boolean;
  multiTypeSelectedType: number;
  multiTypeReturningBlank: boolean;
  hmiConnectionAlive: boolean;
  manualRecoveryActive: boolean;
  continuousMode: boolean;
  speedOverridePercent: number;
  manualStep: number;
  axisManual: [PlcAxisManualStatus, PlcAxisManualStatus, PlcAxisManualStatus];
  robotManual: PlcRobotManualStatus;
}

interface GatewayMessage {
  type: 'connection' | 'snapshot' | 'ack' | 'cyclogram-history' | 'cyclogram-update' | 'cell-event-history' | 'cell-event';
  status?: PlcConnectionStatus;
  endpoint?: string;
  message?: string;
  symbols?: number;
  missing?: string[];
  values?: Record<string, unknown>;
  robotFrame?: RobotCoordinateFrame;
  full?: boolean;
  requestId?: string;
  ok?: boolean;
  error?: string;
  serverTime?: number;
  retentionMs?: number;
  intervals?: CyclogramHistory['intervals'];
  closed?: CyclogramUpdate['closed'];
  opened?: CyclogramUpdate['opened'];
  events?: CellLogEvent[];
  event?: CellLogEvent;
}

export interface PlcCommand {
  command: string;
  machine?: number;
  magazine?: number;
  zone?: number;
  slot?: number;
  content?: number;
  productType?: number;
  value?: boolean | number;
  direction?: 'positive' | 'negative';
  action?: number;
  point?: number;
}

const CELL_STATES = [
  'Ожидание запуска', 'Проверяет содержимое захватов', 'Выбирает станок',
  'Перемещается к станку', 'Снимает команду робота', 'Ожидает станок',
  'Обслуживает станок', 'Работает с магазином', 'Завершает работу с магазином',
  'Ожидает обслуживание магазина', 'Ошибка менеджера ячейки',
];
const ROBOT_STATES = ['Готов', 'Перемещается', 'Работает захватом', 'Команда завершена', 'Ошибка робота', 'Команда Modbus'];
const AXIS_MANUAL_STATES = [
  'Отключена', 'Включение привода', 'Отключение привода', 'Готова', 'Ручной Jog',
  'Торможение Jog', 'Поиск Home', 'Абсолютное перемещение', 'Шаговое перемещение',
  'Остановка', 'Завершение остановки', 'Сброс менеджера оси', 'Сброс ошибки привода',
  'Завершение сброса', 'Проверка после сброса',
];
const HMI_MANUAL_REJECT_REASONS = [
  '',
  'Нет связи с HMI',
  'Требуется ручной режим и остановленная ячейка',
  'Активно управление по Modbus',
  'В аварийном восстановлении разрешён только непрерывный Jog',
  'Обнаружена ошибка привода',
  'Приводы не включены',
  'Другая ось уже выполняет ручное движение',
  'Перед шаговым движением выполните Home',
  'Команда выходит за программный предел оси',
  'Одновременно запрошены несовместимые команды',
  'Робот уже выполняет команду',
  'Механизм уже находится в требуемом состоянии',
  'Внешний робот не подтвердил готовность',
];
const ROBOT_ACTIONS = ['Нет действия', 'Движение к точке', 'Открывает захват 1', 'Закрывает захват 1', 'Открывает захват 2', 'Закрывает захват 2', 'Поворот к заготовке', 'Поворот к детали'];
const POINT_NAMES = [
  'NONE',
  'MACHINE_1_ABOVE', 'MACHINE_1_INSIDE', 'MACHINE_1_CHUCK_APROACH', 'MACHINE_1_CHUCK_POSITION',
  'MACHINE_2_ABOVE', 'MACHINE_2_INSIDE', 'MACHINE_2_CHUCK_APROACH', 'MACHINE_2_CHUCK_POSITION',
  'MACHINE_3_ABOVE', 'MACHINE_3_INSIDE', 'MACHINE_3_CHUCK_APROACH', 'MACHINE_3_CHUCK_POSITION',
  'MAGAZINE_DETAIL', 'MAGAZINE_TAKE_DETAIL', 'MAGAZINE_PUT_DETAIL', 'MAGAZINE_CHANGE_DETAIL',
  'HOME_SAFETY', 'MAGAZINE_RETURN_BLANK', 'MAGAZINE_SAFE', 'MAGAZINE_IN_SLOT', 'MAGAZINE_CHANGE',
];
const MACHINE_STATES = [
  'Станок выключен', 'Укажите тип детали в патроне',
  'Ожидается подтверждение запуска обработки', 'Ожидается подтверждение закрытия двери',
  'Станок готов', 'Подготовка операции', 'Подготовка операции',
  'Переход к следующему шагу', 'Робот завершает команду', 'Робот перемещается',
  'Робот выполняет действие', 'Станок открывает дверь', 'Станок закрывает дверь',
  'Станок открывает патрон', 'Станок закрывает патрон', 'Запуск обработки',
  'Обслуживание завершено', 'Ошибка станка',
];
const MAGAZINE_STATES = [
  'Магазин отключён', 'Готов к работе', 'Выбирает операцию', 'Готовит шаг',
  'Выполняет команду робота', 'Снимает команду робота', 'Переходит к следующему шагу',
  'Операция завершена', 'Ошибка магазина',
];
const ALARM_SOURCES: PlcAlarmSource[] = [
  'cell', 'robot', 'machine-1', 'machine-2', 'machine-3', 'magazine-1', 'magazine-2',
  'magazine-axis-1', 'magazine-axis-2', 'axis-x', 'axis-y', 'axis-z', 'axis-group',
  'motion-manager', 'point-manager', 'gripper',
];
const AXIS_ALARM_TEXTS = [
  'Ошибка MC_Power', 'Ошибка MC_Reset', 'Ошибка MC_Stop', 'Ошибка MC_Jog',
  'Ошибка MC_Home', 'Ошибка MC_MoveAbsolute', 'Ошибка MC_MoveRelative',
  'Ошибка чтения позиции оси', 'Ошибка чтения статуса оси', 'Ось находится в ErrorStop',
  'SoftMotion сообщил внутреннюю ошибку', 'Команда движения прервана',
  'Неизвестная ошибка оси', 'Ошибка привода', 'Потеря силовой готовности привода', '',
  'Снято разрешение питания оси', 'Глобальная ошибка при включении оси',
  'Глобальная ошибка в состоянии готовности оси', 'Глобальная ошибка во время движения оси',
  'Одновременно заданы Jog+ и Jog-', 'MoveAbsolute запрещён до Home',
  'MoveRelative запрещён до Home', 'Превышено время шага оси', 'Неизвестное состояние оси',
];
const AXIS_GROUP_ALARM_TEXTS = [
	'Ошибка MC_GroupEnable', 'Зарезервировано: питание осей выполняет FB_AXIS', 'Ошибка MC_GroupDisable',
  'Ошибка MC_GroupReset', 'Ошибка MC_MoveDirectAbsolute', 'Ошибка MC_MoveLinearAbsolute',
  'Ошибка MC_GroupHalt', 'Ошибка MC_GroupStop', 'Ошибка чтения позиции группы',
  'Ошибка чтения статуса группы', 'Ошибка чтения кода группы',
  'Группа SoftMotion находится в ErrorStop', 'Тестовая ошибка MC_MoveDirectAbsolute (SM3)', '', '', '',
  'Превышено время шага группы', 'Неизвестное состояние группы',
  'Нет разрешения питания группы в состоянии готовности',
  'Разрешение питания группы снято во время движения',
];
const MACHINE_ALARM_TEXTS = [
  'Не удалось выбрать операцию',
  'В рецепте неизвестная команда',
  'Ошибка перемещения робота',
  'Ошибка действия захвата',
  'Не удалось открыть дверь',
  'Не удалось закрыть дверь',
  'Не удалось разжать патрон',
  'Не удалось зажать патрон',
  'Не удалось запустить цикл станка',
  'Получена глобальная ошибка ячейки',
  'Неизвестное состояние изделия в станке',
  'Станок сообщил аварию',
  'Индекс рецепта вышел за границы',
  'Дверь закрыта при роботе внутри',
  'Авария станка возникла в ожидании',
  'TIMEOUT перемещения робота',
  'TIMEOUT действия захвата',
  'TIMEOUT освобождения интерфейса робота',
  'TIMEOUT открытия двери',
  'TIMEOUT закрытия двери',
  'TIMEOUT разжима патрона',
  'TIMEOUT зажима патрона',
  'TIMEOUT подтверждения запуска цикла',
];
export const ALARM_SOURCE_LABELS: Record<PlcAlarmSource, string> = {
  cell: 'Ячейка', robot: 'Робот', 'machine-1': 'Станок 1', 'machine-2': 'Станок 2', 'machine-3': 'Станок 3',
  'magazine-1': 'Магазин 1', 'magazine-2': 'Магазин 2', 'magazine-axis-1': 'Привод магазина 1', 'magazine-axis-2': 'Привод магазина 2',
  'axis-x': 'Ось X', 'axis-y': 'Ось Y', 'axis-z': 'Ось Z', 'axis-group': 'Группа осей XYZ', 'motion-manager': 'Менеджер движения', 'point-manager': 'Менеджер точек',
  gripper: 'Захват робота',
};
const ALARM_TEXTS: Partial<Record<PlcAlarmSource, string[]>> = {
  cell: ['Диагностическая ошибка согласованности захватов', 'Ошибка робота во время автоматического цикла', 'Ошибка магазина во время операции', 'Ошибка станка во время обслуживания', 'Получена глобальная ошибка ячейки'],
  robot: ['Неизвестная команда робота', 'Ошибка менеджера движения', 'Ошибка механизма захвата', 'Ошибка связи Modbus TCP', 'Движение остановлено командой или глобальной ошибкой', 'Контроллер внешнего робота сообщил аварию'],
  'machine-1': MACHINE_ALARM_TEXTS,
  'machine-2': MACHINE_ALARM_TEXTS,
  'machine-3': MACHINE_ALARM_TEXTS,
  'magazine-1': ['Операция не может быть выбрана', 'Нет доступной заготовки', 'Нет свободного слота', 'Номер слота вне матрицы', 'Содержимое слота не соответствует операции', 'Робот завершил команду с ошибкой', 'Получена глобальная ошибка ячейки', 'Неверно задана геометрия магазина'],
  'magazine-2': ['Операция не может быть выбрана', 'Нет доступной заготовки', 'Нет свободного слота', 'Номер слота вне матрицы', 'Содержимое слота не соответствует операции', 'Робот завершил команду с ошибкой', 'Получена глобальная ошибка ячейки', 'Неверно задана геометрия магазина'],
  'magazine-axis-1': AXIS_ALARM_TEXTS,
  'magazine-axis-2': AXIS_ALARM_TEXTS,
  'axis-x': AXIS_ALARM_TEXTS,
  'axis-y': AXIS_ALARM_TEXTS,
  'axis-z': AXIS_ALARM_TEXTS,
  'axis-group': AXIS_GROUP_ALARM_TEXTS,
  'motion-manager': ['Недопустимая целевая точка', 'Ошибка группы осей', 'Менеджер движения остановлен глобальной ошибкой'],
  'point-manager': ['Координата X вне допустимых границ', 'Координата Y вне допустимых границ', 'Координата Z вне допустимых границ', 'Недопустимый коэффициент скорости', 'Software Limits оси X отключены или заданы некорректно', 'Software Limits оси Y отключены или заданы некорректно', 'Software Limits оси Z отключены или заданы некорректно'],
  gripper: ['Ошибка захвата 1', 'Ошибка захвата 2', 'Ошибка механизма поворота', 'Недопустимое действие захвата', 'Общая ошибка захвата'],
};
const WARNING_TEXTS: Partial<Record<PlcAlarmSource, Record<number, string>>> = {
  cell: {
    1: 'Общий сброс отклонён: глобальная ошибка всё ещё активна',
    2: 'Общий сброс отклонён: ошибка робота всё ещё активна',
    3: 'Общий сброс отклонён: ошибка магазина всё ещё активна',
    4: 'Запуск ячейки отклонён: условия запуска не выполнены',
    5: 'Остановка ячейки отклонена: автоматический цикл не выполняется',
    6: 'Общий сброс отклонён: активных ошибок нет',
    7: 'Общий сброс отклонён: ячейка или оборудование ещё не остановлены',
    9: 'Маршрут отклонён: тип детали не совпадает с типом назначения',
    10: 'Запуск отклонён: после остановки переместите робот в HOME_SAFETY',
    15: 'Предпусковой опрос отменён: в захвате 1 должна находиться заготовка',
    16: 'Предпусковой опрос отменён: в захвате 2 должна находиться готовая деталь',
    17: 'Предпусковой опрос отменён: выбран недопустимый тип продукции',
    18: 'Запуск отклонён: для детали из захвата 2 нет свободного слота соответствующего типа',
    19: 'Запуск отклонён: нет пустого готового станка для заготовки из захвата 1',
    20: 'Предпусковой опрос отменён: выбранный станок недоступен или не соответствует типу заготовки',
    21: 'Ответ предпускового опроса отклонён PLC',
    22: 'Отмена предпускового опроса отклонена PLC',
    23: 'Количество типов не изменено: выключите магазин и все станки',
    24: 'Тип станка не изменён: станок должен быть выключен и остановлен',
    25: 'Тип слота не изменён: конфигурация магазина сейчас заблокирована',
    26: 'Автораспределение отклонено: каждому типу нужен хотя бы один станок',
  },
  robot: {
    1: 'Сброс робота отклонён: команда выполнения всё ещё активна',
    2: 'Сброс робота отклонён: команда остановки всё ещё активна',
    3: 'Сброс робота отклонён: глобальная ошибка всё ещё активна',
    4: 'Сброс робота отклонён: ошибка менеджера движения всё ещё активна',
    5: 'Сброс робота отклонён: ошибка захвата всё ещё активна',
    6: 'Сброс робота отклонён: ошибка внешнего робота или Modbus всё ещё активна',
    7: 'Команда робота отклонена: включите ручной режим и остановите ячейку',
    8: 'Команда приводов отклонена PLC: проверьте разрешение и состояние движения',
    9: 'Остановка робота отклонена: приводы не готовы',
    10: 'Сброс робота отклонён: активных ошибок робота или приводов нет',
    12: 'Команда расширенного ручного управления отклонена PLC',
    13: 'Переключение интерфейса робота отклонено PLC',
    14: 'Настройки Modbus не применены: проверьте остановку и диапазоны параметров',
  },
  'machine-1': {
    1: 'Сброс станка отклонён: физическая авария всё ещё активна',
    2: 'Сброс станка отклонён: глобальная ошибка всё ещё активна',
    3: 'Сброс станка отклонён: выполняется операция обслуживания',
    4: 'Включение станка отклонено: активна физическая авария',
    5: 'Включение станка отклонено: обработка ещё не завершена',
    6: 'Сброс станка отклонён: активной ошибки нет',
    7: 'Включение станка отклонено: состояние изделия в патроне не определено',
    8: 'Сброс станка отклонён: каскадная ошибка робота ещё не готова к сбросу',
  },
  'machine-2': {
    1: 'Сброс станка отклонён: физическая авария всё ещё активна',
    2: 'Сброс станка отклонён: глобальная ошибка всё ещё активна',
    3: 'Сброс станка отклонён: выполняется операция обслуживания',
    4: 'Включение станка отклонено: активна физическая авария',
    5: 'Включение станка отклонено: обработка ещё не завершена',
    6: 'Сброс станка отклонён: активной ошибки нет',
    7: 'Включение станка отклонено: состояние изделия в патроне не определено',
    8: 'Сброс станка отклонён: каскадная ошибка робота ещё не готова к сбросу',
  },
  'machine-3': {
    1: 'Сброс станка отклонён: физическая авария всё ещё активна',
    2: 'Сброс станка отклонён: глобальная ошибка всё ещё активна',
    3: 'Сброс станка отклонён: выполняется операция обслуживания',
    4: 'Включение станка отклонено: активна физическая авария',
    5: 'Включение станка отклонено: обработка ещё не завершена',
    6: 'Сброс станка отклонён: активной ошибки нет',
    7: 'Включение станка отклонено: состояние изделия в патроне не определено',
    8: 'Сброс станка отклонён: каскадная ошибка робота ещё не готова к сбросу',
  },
  'magazine-1': {
    1: 'Сброс магазина отклонён: операция всё ещё активна',
    2: 'Сброс магазина отклонён: глобальная ошибка всё ещё активна',
    3: 'Сброс магазина отклонён: ошибка робота всё ещё активна',
    4: 'Включение магазина отклонено: глобальная ошибка всё ещё активна',
    5: 'Включение магазина отклонено: содержимое магазина не позволяет продолжить работу',
    6: 'Отключение магазина уже запрошено',
    7: 'Заполнение магазина отклонено: сначала отключите магазин',
    8: 'Заполнение магазина отклонено: неверно задан размер матрицы',
    9: 'Очистка магазина отклонена: сначала отключите магазин',
  },
  'magazine-2': {
    1: 'Сброс магазина отклонён: операция всё ещё активна',
    2: 'Сброс магазина отклонён: глобальная ошибка всё ещё активна',
    3: 'Сброс магазина отклонён: ошибка робота всё ещё активна',
    4: 'Включение магазина отклонено: глобальная ошибка всё ещё активна',
    5: 'Включение магазина отклонено: содержимое магазина не позволяет продолжить работу',
    6: 'Отключение магазина уже запрошено',
    7: 'Заполнение магазина отклонено: проверьте разрешение зоны загрузки',
    8: 'Заполнение магазина отклонено: неверно задан размер матрицы',
    9: 'Очистка магазина отклонена: проверьте разрешение зоны загрузки',
  },
  'axis-x': {
    1: 'Включение оси X отклонено: нет разрешения питания',
    2: 'Сброс оси X не выполнен: глобальная ошибка всё ещё активна',
    3: 'Сброс оси X не выполнен: MC_Reset завершился ошибкой',
    4: 'Сброс оси X не выполнен: превышено время сброса',
    5: 'Сброс оси X не выполнен: физическая ошибка оси всё ещё активна',
    6: 'Сброс оси X не выполнен: защёлкнутая ошибка оси не очищена',
    7: 'Сброс оси X не выполнен: логическая ошибка оси не очищена',
	12: 'Ручная команда оси X отклонена PLC: проверьте причину в панели управления осью',
  },
  'axis-y': {
    1: 'Включение оси Y отклонено: нет разрешения питания',
    2: 'Сброс оси Y не выполнен: глобальная ошибка всё ещё активна',
    3: 'Сброс оси Y не выполнен: MC_Reset завершился ошибкой',
    4: 'Сброс оси Y не выполнен: превышено время сброса',
    5: 'Сброс оси Y не выполнен: физическая ошибка оси всё ещё активна',
    6: 'Сброс оси Y не выполнен: защёлкнутая ошибка оси не очищена',
    7: 'Сброс оси Y не выполнен: логическая ошибка оси не очищена',
	12: 'Ручная команда оси Y отклонена PLC: проверьте причину в панели управления осью',
  },
  'axis-z': {
    1: 'Включение оси Z отклонено: нет разрешения питания',
    2: 'Сброс оси Z не выполнен: глобальная ошибка всё ещё активна',
    3: 'Сброс оси Z не выполнен: MC_Reset завершился ошибкой',
    4: 'Сброс оси Z не выполнен: превышено время сброса',
    5: 'Сброс оси Z не выполнен: физическая ошибка оси всё ещё активна',
    6: 'Сброс оси Z не выполнен: защёлкнутая ошибка оси не очищена',
    7: 'Сброс оси Z не выполнен: логическая ошибка оси не очищена',
	12: 'Ручная команда оси Z отклонена PLC: проверьте причину в панели управления осью',
  },
  'axis-group': {
    1: 'Включение группы отклонено: нет разрешения питания',
    2: 'Одновременно запрошены MoveDirect и MoveLinear',
    3: 'Сброс группы отклонён: глобальная ошибка всё ещё активна',
    4: 'Сброс группы отклонён: ошибка SoftMotion всё ещё активна',
    5: 'Сброс группы не подтверждён: истекло время проверки состояния SoftMotion',
    6: 'Сброс группы не выполнен: SoftMotion всё ещё находится в ErrorStop',
    7: 'Сброс группы не выполнен: MC_GroupReset завершился ошибкой',
    8: 'Сброс группы не выполнен: превышено время выполнения MC_GroupReset',
  },
  'motion-manager': {
    1: 'Сброс менеджера движения отклонён: глобальная ошибка всё ещё активна',
  },
  gripper: {
    1: 'Сброс захвата отклонён: команда выполнения всё ещё активна',
    2: 'Сброс захвата отклонён: общая неисправность всё ещё активна',
    3: 'Сброс захвата отклонён: неисправность первого захвата всё ещё активна',
    4: 'Сброс захвата отклонён: неисправность второго захвата всё ещё активна',
    5: 'Сброс захвата отклонён: неисправность механизма поворота всё ещё активна',
  },
};
const OPERATIONS: MachineOperation[] = ['NONE', 'LOAD', 'UNLOAD', 'CHANGE'];
// Числовые позиции совпадают с E_MAGAZINE_OPERATION в PLC.
const MAGAZINE_OPERATIONS: MagazineOperation[] = ['NONE', 'PUT', 'TAKE', 'CHANGE', 'RETURN_BLANK'];

const numberValue = (values: Record<string, unknown>, path: string, fallback: number) => {
  const raw = values[path];
  const value = Array.isArray(raw) && raw.length === 2
    ? Number(raw[0]) * 0x1_0000_0000 + Number(raw[1])
    : Number(raw);
  return Number.isFinite(value) ? value : fallback;
};
const percentValue = (values: Record<string, unknown>, path: string, fallback: number) =>
  Math.min(100, Math.max(0, numberValue(values, path, fallback)));
const booleanValue = (values: Record<string, unknown>, path: string, fallback: boolean) =>
  typeof values[path] === 'boolean' ? values[path] as boolean : fallback;
const stringValue = (values: Record<string, unknown>, path: string, fallback: string) =>
  typeof values[path] === 'string' && values[path] ? values[path] as string : fallback;
const productTypeValue = (values: Record<string, unknown>, path: string, fallback: ProductType): ProductType => {
  const value = Math.round(numberValue(values, path, fallback));
  return value === 2 || value === 3 ? value : 1;
};
const payloadProductTypeValue = (values: Record<string, unknown>, path: string, fallback: PayloadProductType): PayloadProductType => {
  const value = Math.round(numberValue(values, path, fallback));
  return value === 1 || value === 2 || value === 3 ? value : 0;
};
const robotStepText = (state: number, action: number, point: number, fallback: string) => {
  if (action === 1) return `Движение в точку ${POINT_NAMES[point] ?? `#${point}`}`;
  if (action > 1) return ROBOT_ACTIONS[action] ?? fallback;
  return ROBOT_STATES[state] ?? fallback;
};
const machineStepText = (values: Record<string, unknown>, number: number, fallback: string) => {
  if (booleanValue(values, `astMachineStatus[${number}].xProcessing`, false)) return 'Обработка';
  const state = numberValue(values, `astMachineDiag[${number}].eState`, -1);
  if (state === 9) {
    const point = numberValue(values, 'stRobotDiag.eActivePoint', 0);
    if ([1, 5, 9].includes(point)) return 'Робот перемещается к станку';
    if ([2, 6, 10].includes(point)) return 'Робот перемещается внутрь станка';
    if ([3, 7, 11].includes(point)) return 'Робот перемещается к патрону';
    if ([4, 8, 12].includes(point)) return 'Робот перемещается в патрон';
  }
  if (state === 10) {
    return ROBOT_ACTIONS[numberValue(values, 'stRobotDiag.eActiveAction', 0)] ?? 'Робот выполняет действие';
  }
  return MACHINE_STATES[state] ?? fallback;
};
const secondsValue = (values: Record<string, unknown>, path: string, fallback: number) =>
  Math.max(0, Math.round(numberValue(values, path, fallback * 1000) / 100) / 10);
const errorList = (values: Record<string, unknown>, path: string, label: string, fallback: string[]) => {
  if (!(path in values)) return fallback;
  const mask = numberValue(values, path, 0) >>> 0;
  return mask === 0 ? [] : [`${label}: 0x${mask.toString(16).toUpperCase().padStart(8, '0')}`];
};
const alarmText = (source: PlcAlarmSource, severity: PlcAlarmSeverity, code: number) => {
  if (severity === 'warning') return WARNING_TEXTS[source]?.[code] ?? `Предупреждение ${ALARM_SOURCE_LABELS[source]}: код ${code}`;
  return ALARM_TEXTS[source]?.[code] ?? `Ошибка ${ALARM_SOURCE_LABELS[source]}: код ${code}`;
};
const mapAlarmEvents = (values: Record<string, unknown>, current: PlcAlarmEvent[]) => {
  const reportedAt = new Map(current.map((event) => [event.id, event.reportedAt]));
  const now = Date.now();
  const events: PlcAlarmEvent[] = [];
  for (let index = 1; index <= 100; index += 1) {
    const root = `astAlarmEvent[${index}]`;
    const id = numberValue(values, `${root}.udiSequence`, 0);
    if (id === 0) continue;
    const source = ALARM_SOURCES[numberValue(values, `${root}.eSource`, -1)];
    if (!source) continue;
    const severity: PlcAlarmSeverity = numberValue(values, `${root}.eSeverity`, 0) === 1 ? 'warning' : 'alarm';
    const code = numberValue(values, `${root}.uiCode`, 0);
    events.push({
      id,
      source,
      severity,
      code,
      text: alarmText(source, severity, code),
      active: booleanValue(values, `${root}.xActive`, false),
      reportedAt: reportedAt.get(id) ?? now,
    });
  }
  return events.sort((left, right) => right.id - left.id);
};

export function mapRobotCoordinates(
  values: Record<string, unknown>,
  current: Vec3Mm,
): Vec3Mm {
  return {
    x: numberValue(values, 'lrActualX', current.x),
    y: numberValue(values, 'lrActualY', current.y),
    z: numberValue(values, 'lrActualZ', current.z),
  };
}

export function mapPlcSnapshot(
  values: Record<string, unknown>,
  current: CellState,
): CellState {
  const machines = current.machines.map((machine, index) => {
    const number = index + 1;
    const status = `astMachineStatus[${number}]`;
    const io = `astMachineIoStatus[${number}]`;
    const diag = `astMachineDiag[${number}]`;
    const enabled = booleanValue(values, `${status}.xEnabled`, machine.enabled);
    const processing = booleanValue(values, `${status}.xProcessing`, machine.mode === 'processing');
    const alarm = booleanValue(values, `${status}.xAlarm`, machine.alarm);
    const hasError = alarm || booleanValue(values, `${status}.xError`, machine.mode === 'error');
    const serviceRequired = booleanValue(values, `${status}.xServiceRequired`, machine.serviceRequired);
    const actualOperationValue = numberValue(values, `${diag}.eActualOperation`, OPERATIONS.indexOf(machine.actualOperation));
    const plcState = numberValue(values, `${diag}.eState`, machine.plcState);
    const mode: MachineMode = hasError ? 'error' : processing ? 'processing' : !enabled ? 'off' : actualOperationValue !== 0 ? 'change' : 'enabled';
    const partStateValue = numberValue(values, `${status}.ePartState`, machine.partState === 'LOADED' ? 2 : machine.partState === 'EMPTY' ? 1 : 0);
    const partState: MachinePartState = partStateValue === 2 ? 'LOADED' : partStateValue === 1 ? 'EMPTY' : 'UNKNOWN';
    const partTypeValue = numberValue(values, `${status}.ePartType`, machine.partType === 'DETAIL' ? 1 : machine.partType === 'BLANK' ? 2 : 0);
    const partType: MachinePartType = partTypeValue === 1 ? 'DETAIL' : partTypeValue === 2 ? 'BLANK' : 'UNKNOWN';
    return {
      ...machine,
      productType: productTypeValue(values, `stMultiType.Config.auiMachineType[${number}]`, machine.productType),
      plcState,
      enabled,
      alarm,
      disablePending: booleanValue(values, `${status}.xDisablePending`, machine.disablePending),
      powerAllowed: booleanValue(values, `${status}.xPowerAllowed`, machine.powerAllowed),
      resetAllowed: booleanValue(values, `${status}.xResetAllowed`, machine.resetAllowed),
      doorOpen: booleanValue(values, `${io}.xDoorOpen`, machine.doorOpen),
      doorClosed: booleanValue(values, `${io}.xDoorClosed`, machine.doorClosed),
      chuckOpen: booleanValue(values, `${io}.xChuckUnclamped`, machine.chuckOpen),
      chuckClosed: booleanValue(values, `${io}.xChuckClamped`, machine.chuckClosed),
      partPresent: partState === 'LOADED',
      partReady: booleanValue(values, `${status}.xPartReady`, machine.partReady),
      partState,
      partType,
      mode,
      currentStep: machineStepText(values, number, machine.currentStep),
      serviceRequired,
      canAcceptService: booleanValue(values, `${status}.xCanAcceptService`, machine.canAcceptService),
      recommendedOperation: OPERATIONS[numberValue(values, `${status}.eRecommendedOperation`, OPERATIONS.indexOf(machine.recommendedOperation))] ?? 'NONE',
      actualOperation: OPERATIONS[actualOperationValue] ?? 'NONE',
      cycleExpectedS: secondsValue(values, `${status}.tCycleExpected`, machine.cycleExpectedS),
      cycleElapsedS: secondsValue(values, `${status}.tCycleElapsed`, machine.cycleElapsedS),
      cycleRemainingS: secondsValue(values, `${status}.tRemaining`, machine.cycleRemainingS),
      measuredCycleS: secondsValue(values, `${status}.tMeasuredCycle`, machine.measuredCycleS),
      useHmiCycleTime: booleanValue(values, `xUseHmiCycleTime[${number}]`, machine.useHmiCycleTime),
      cycleOvertime: booleanValue(values, `${status}.xCycleOvertime`, machine.cycleOvertime),
      activeErrors: errorList(values, `astMachineError[${number}].dwErrorActive`, `Ошибка станка ${number}`, machine.activeErrors),
      lastErrors: errorList(values, `astMachineError[${number}].dwErrorLast`, `Последняя ошибка станка ${number}`, machine.lastErrors),
    };
  });

  const magazines = current.magazines.map((magazine, magazineIndex) => {
    const number = magazineIndex + 1;
    const zoneLengths = [120, 120, 60] as const;
    const zones = zoneLengths.map((length, zoneIndex) => magazine.zones[zoneIndex].map((slot, index): SlotType => {
      const root = `astMagazineInventory[${number}].aZone${zoneIndex + 1}[${index + 1}]`;
      if (!booleanValue(values, `${root}.xInPosition`, slot !== 'empty')) return 'empty';
      const detailType = numberValue(values, `${root}.eDetailType`, slot === 'blank' ? 1 : slot === 'detail' ? 2 : 0);
      return detailType === 1 ? 'blank' : detailType === 2 ? 'detail' : 'empty';
    }).slice(0, length)) as CellState['magazines'][number]['zones'];
    const zoneProductTypes = zoneLengths.map((length, zoneIndex) => magazine.zoneProductTypes[zoneIndex].map((type, index) =>
      productTypeValue(values, `astMagazineInventory[${number}].aZone${zoneIndex + 1}[${index + 1}].uiProductType`, type)).slice(0, length)) as CellState['magazines'][number]['zoneProductTypes'];
    const status = `astMagazineStatus[${number}]`;
    const axisStatus = `astMagazineAxisStatus[${number}]`;
    return {
      zones,
      zoneProductTypes,
      state: {
        ...magazine.state,
        enabled: booleanValue(values, `${status}.xEnabled`, magazine.state.enabled),
        disablePending: booleanValue(values, `${status}.xDisablePending`, magazine.state.disablePending),
        ready: booleanValue(values, `${status}.xReady`, magazine.state.ready),
        busy: booleanValue(values, `${status}.xBusy`, magazine.state.busy),
        done: booleanValue(values, `${status}.xDone`, magazine.state.done),
        error: booleanValue(values, `${status}.xError`, magazine.state.error),
        finished: booleanValue(values, `${status}.xFinished`, magazine.state.finished),
        canTake: booleanValue(values, `${status}.xCanTake`, magazine.state.canTake),
        canPut: booleanValue(values, `${status}.xCanPut`, magazine.state.canPut),
        canChange: booleanValue(values, `${status}.xCanChange`, magazine.state.canChange),
        canEnable: booleanValue(values, `${status}.xCanEnable`, magazine.state.canEnable),
        powerAllowed: booleanValue(values, `${status}.xPowerAllowed`, magazine.state.powerAllowed),
        enableSequenceAllowed: booleanValue(values, `${status}.xEnableSequenceAllowed`, magazine.state.enableSequenceAllowed),
        enableCheckPowered: booleanValue(values, `${status}.xEnableCheckPowered`, magazine.state.enableCheckPowered),
        enableCheckHomed: booleanValue(values, `${status}.xEnableCheckHomed`, magazine.state.enableCheckHomed),
        enableCheckPositionValid: booleanValue(values, `${status}.xEnableCheckPositionValid`, magazine.state.enableCheckPositionValid),
        enableCheckStationary: booleanValue(values, `${status}.xEnableCheckStationary`, magazine.state.enableCheckStationary),
        enableCheckNoError: booleanValue(values, `${status}.xEnableCheckNoError`, magazine.state.enableCheckNoError),
        enableCheckRobotReleased: booleanValue(values, `${status}.xEnableCheckRobotReleased`, magazine.state.enableCheckRobotReleased),
        enableCheckContent: booleanValue(values, `${status}.xEnableCheckContent`, magazine.state.enableCheckContent),
        enableCheckInventoryVerified: booleanValue(values, `${status}.xEnableCheckInventoryVerified`, magazine.state.enableCheckInventoryVerified),
        fillAllowed: booleanValue(values, `${status}.xFillAllowed`, magazine.state.fillAllowed),
        clearAllowed: booleanValue(values, `${status}.xClearAllowed`, magazine.state.clearAllowed),
        currentBlank: numberValue(values, `${status}.iCurrentBlank`, magazine.state.currentBlank),
        currentFreeSlot: numberValue(values, `${status}.iCurrentFreeSlot`, magazine.state.currentFreeSlot),
        selectedBlank: numberValue(values, `${status}.iSelectedBlank`, magazine.state.selectedBlank),
        selectedFreeSlot: numberValue(values, `${status}.iSelectedFreeSlot`, magazine.state.selectedFreeSlot),
        actualOperation: MAGAZINE_OPERATIONS[numberValue(values, `${status}.eActualOperation`, MAGAZINE_OPERATIONS.indexOf(magazine.state.actualOperation))] ?? 'NONE',
        rows: numberValue(values, 'MagazineRows', magazine.state.rows),
        columns: numberValue(values, 'MagazineColumns', magazine.state.columns),
        pitchX: numberValue(values, 'MagazinePitchX', magazine.state.pitchX),
        pitchY: numberValue(values, 'MagazinePitchY', magazine.state.pitchY),
        safeAbove: numberValue(values, `alrMagazineSafeZ_1[${number}]`, magazine.state.safeAbove),
        safeInside: numberValue(values, `alrMagazineSafeZ_2[${number}]`, magazine.state.safeInside),
        powered: booleanValue(values, `${axisStatus}.xPowered`, magazine.state.powered),
        homed: booleanValue(values, `${status}.xHomed`, magazine.state.homed),
        positionValid: booleanValue(values, `${status}.xPositionValid`, magazine.state.positionValid),
        recoveryRequired: booleanValue(values, `${status}.xRecoveryRequired`, magazine.state.recoveryRequired),
        indexAllowed: booleanValue(values, `${status}.xIndexAllowed`, magazine.state.indexAllowed),
        zone1EditAllowed: booleanValue(values, `${status}.xZone1EditAllowed`, magazine.state.zone1EditAllowed),
        zone2EditAllowed: booleanValue(values, `${status}.xZone2EditAllowed`, magazine.state.zone2EditAllowed),
        jogPositiveAllowed: booleanValue(values, `${status}.xJogPositiveAllowed`, magazine.state.jogPositiveAllowed),
        jogNegativeAllowed: booleanValue(values, `${status}.xJogNegativeAllowed`, magazine.state.jogNegativeAllowed),
        contentRecoveryAllowed: booleanValue(values, `${status}.xContentRecoveryAllowed`, magazine.state.contentRecoveryAllowed),
        contentRecoveryActive: booleanValue(values, `${status}.xContentRecoveryActive`, magazine.state.contentRecoveryActive),
        inventoryVerificationRequired: booleanValue(values, `${status}.xInventoryVerificationRequired`, magazine.state.inventoryVerificationRequired),
        indexing: booleanValue(values, `${status}.xIndexing`, magazine.state.indexing),
        indexDone: booleanValue(values, `${status}.xIndexDone`, magazine.state.indexDone),
        axisError: booleanValue(values, `${status}.xAxisError`, magazine.state.axisError),
        axisBusy: booleanValue(values, `${axisStatus}.xBusy`, magazine.state.axisBusy),
        axisDone: booleanValue(values, `${axisStatus}.xDone`, magazine.state.axisDone),
        axisPosition: numberValue(values, `${axisStatus}.lrActualPosition`, magazine.state.axisPosition),
        axisStep: stringValue(values, `astMagazineAxisDiag[${number}].sStepName`, magazine.state.axisStep),
        activeErrors: errorList(values, `astMagazineError[${number}].dwErrorActive`, `Ошибка магазина ${number}`, magazine.state.activeErrors),
        lastErrors: errorList(values, `astMagazineError[${number}].dwErrorLast`, `Последняя ошибка магазина ${number}`, magazine.state.lastErrors),
      },
    };
  }) as CellState['magazines'];

  return {
    robot: {
      ...mapRobotCoordinates(values, current.robot),
      busy: booleanValue(values, 'stRobotStatus.xBusy', current.robot.busy),
      done: booleanValue(values, 'stRobotStatus.xDone', current.robot.done),
      error: booleanValue(values, 'stRobotStatus.xError', current.robot.error),
      powerAllowed: booleanValue(values, 'stRobotStatus.xPowerAllowed', current.robot.powerAllowed),
      stopAllowed: booleanValue(values, 'stRobotStatus.xStopAllowed', current.robot.stopAllowed),
      resetAllowed: booleanValue(values, 'stRobotStatus.xResetAllowed', current.robot.resetAllowed),
      blankProductType: payloadProductTypeValue(values, 'stRobotStatus.uiBlankPayloadType', current.robot.blankProductType),
      detailProductType: payloadProductTypeValue(values, 'stRobotStatus.uiDetailPayloadType', current.robot.detailProductType),
      blankAvailable: booleanValue(values, 'stRobotStatus.xBlankAvailable', current.robot.blankAvailable),
      detailAvailable: booleanValue(values, 'stRobotStatus.xDetailAvailable', current.robot.detailAvailable),
      gripper1Open: booleanValue(values, 'stRobotStatus.xGripper1Open', current.robot.gripper1Open),
      gripper1Closed: booleanValue(values, 'stRobotStatus.xGripper1Closed', current.robot.gripper1Closed),
      gripper2Open: booleanValue(values, 'stRobotStatus.xGripper2Open', current.robot.gripper2Open),
      gripper2Closed: booleanValue(values, 'stRobotStatus.xGripper2Closed', current.robot.gripper2Closed),
      rotatedToBlank: booleanValue(values, 'stRobotStatus.xRotatedToBlank', current.robot.rotatedToBlank),
      rotatedToDetail: booleanValue(values, 'stRobotStatus.xRotatedToDetail', current.robot.rotatedToDetail),
    },
    machines,
    magazines,
  };
}

export function mapRuntimeInfo(values: Record<string, unknown>, current: PlcRuntimeInfo): PlcRuntimeInfo {
  const cellStateCode = numberValue(values, 'stCellDiag.eState', current.cellStateCode);
  const robotStateCode = numberValue(values, 'stRobotDiag.eState', current.robotStateCode);
  const robotActionCode = numberValue(values, 'stRobotDiag.eActiveAction', current.robotActionCode);
  const robotPointCode = numberValue(values, 'stRobotDiag.eActivePoint', current.robotPointCode);
  const magazineStateCodes = [1, 2].map((index) => numberValue(
    values,
    `astMagazineDiag[${index}].eState`,
    current.magazineStateCodes[index - 1],
  )) as [number, number];
  const activeMagazine = numberValue(values, 'stCellStatus.uiActiveMagazine', current.activeMagazine);
  const magazineStateCode = magazineStateCodes[Math.max(0, Math.min(1, activeMagazine - 1))] ?? magazineStateCodes[0];
  const robotExternalError = booleanValue(values, 'stRobotStatus.xExternalError', false);
  const alarmEvents = mapAlarmEvents(values, current.alarmEvents);
  const axisManual = [1, 2, 3].map((index, offset) => {
    const root = `astAxisHmiStatus[${index}]`;
    const previous = current.axisManual[offset];
    const rejectCode = numberValue(values, `${root}.eRejectReason`, previous.rejectCode);
    const stateCode = numberValue(values, `${root}.eState`, previous.stateCode);
    return {
      jogPositiveAllowed: booleanValue(values, `${root}.xJogPositiveAllowed`, previous.jogPositiveAllowed),
      jogNegativeAllowed: booleanValue(values, `${root}.xJogNegativeAllowed`, previous.jogNegativeAllowed),
      homeAllowed: booleanValue(values, `${root}.xHomeAllowed`, previous.homeAllowed),
      moveAbsoluteAllowed: booleanValue(values, `${root}.xMoveAbsoluteAllowed`, previous.moveAbsoluteAllowed),
      moveRelativePositiveAllowed: booleanValue(values, `${root}.xMoveRelativePositiveAllowed`, previous.moveRelativePositiveAllowed),
      moveRelativeNegativeAllowed: booleanValue(values, `${root}.xMoveRelativeNegativeAllowed`, previous.moveRelativeNegativeAllowed),
      driveReady: booleanValue(values, `${root}.xDriveReady`, previous.driveReady),
      busy: booleanValue(values, `${root}.xBusy`, previous.busy),
      error: booleanValue(values, `${root}.xError`, previous.error),
      homed: booleanValue(values, `${root}.xHomed`, previous.homed),
      actualPosition: numberValue(values, `${root}.lrActualPosition`, previous.actualPosition),
      targetPosition: numberValue(values, `${root}.lrTargetPosition`, previous.targetPosition),
      deviation: numberValue(values, `${root}.lrDeviation`, previous.deviation),
      minPosition: numberValue(values, `${root}.lrMinPosition`, previous.minPosition),
      maxPosition: numberValue(values, `${root}.lrMaxPosition`, previous.maxPosition),
      commandVelocity: numberValue(values, `${root}.lrCommandVelocity`, previous.commandVelocity),
      maxVelocity: numberValue(values, `${root}.lrMaxVelocity`, previous.maxVelocity),
      rejectCode,
      rejectReason: HMI_MANUAL_REJECT_REASONS[rejectCode] ?? `Неизвестная причина запрета (${rejectCode})`,
      stateCode,
      stepName: AXIS_MANUAL_STATES[stateCode] ?? `Неизвестное состояние оси (${stateCode})`,
    };
  }) as [PlcAxisManualStatus, PlcAxisManualStatus, PlcAxisManualStatus];
  const robotRejectCode = numberValue(values, 'stRobotHmiStatus.eRejectReason', current.robotManual.rejectCode);
  const robotManual: PlcRobotManualStatus = {
    drivesPowered: booleanValue(values, 'stRobotHmiStatus.xDrivesPowered', current.robotManual.drivesPowered),
    drivesOff: booleanValue(values, 'stRobotHmiStatus.xDrivesOff', current.robotManual.drivesOff),
    powerTransitionActive: booleanValue(values, 'stRobotHmiStatus.xPowerTransitionActive', current.robotManual.powerTransitionActive),
    drivesEnableAllowed: booleanValue(values, 'stRobotHmiStatus.xDrivesEnableAllowed', current.robotManual.drivesEnableAllowed),
    drivesDisableAllowed: booleanValue(values, 'stRobotHmiStatus.xDrivesDisableAllowed', current.robotManual.drivesDisableAllowed),
    resetAllowed: booleanValue(values, 'stRobotHmiStatus.xResetAllowed', current.robotManual.resetAllowed),
    stopAllowed: booleanValue(values, 'stRobotHmiStatus.xStopAllowed', current.robotManual.stopAllowed),
    pointsAllowed: booleanValue(values, 'stRobotHmiStatus.xPointsAllowed', current.robotManual.pointsAllowed),
    gripperAllowed: booleanValue(values, 'stRobotHmiStatus.xGripperAllowed', current.robotManual.gripperAllowed),
    gripper1OpenAllowed: booleanValue(values, 'stRobotHmiStatus.xGripper1OpenAllowed', current.robotManual.gripper1OpenAllowed),
    gripper1CloseAllowed: booleanValue(values, 'stRobotHmiStatus.xGripper1CloseAllowed', current.robotManual.gripper1CloseAllowed),
    gripper2OpenAllowed: booleanValue(values, 'stRobotHmiStatus.xGripper2OpenAllowed', current.robotManual.gripper2OpenAllowed),
    gripper2CloseAllowed: booleanValue(values, 'stRobotHmiStatus.xGripper2CloseAllowed', current.robotManual.gripper2CloseAllowed),
    rotateToBlankAllowed: booleanValue(values, 'stRobotHmiStatus.xRotateToBlankAllowed', current.robotManual.rotateToBlankAllowed),
    rotateToDetailAllowed: booleanValue(values, 'stRobotHmiStatus.xRotateToDetailAllowed', current.robotManual.rotateToDetailAllowed),
    commandBusy: booleanValue(values, 'stRobotHmiStatus.xCommandBusy', current.robotManual.commandBusy),
    activeAction: numberValue(values, 'stRobotHmiStatus.uiActiveAction', current.robotManual.activeAction),
    activePoint: numberValue(values, 'stRobotHmiStatus.uiActivePoint', current.robotManual.activePoint),
    rejectCode: robotRejectCode,
    rejectReason: HMI_MANUAL_REJECT_REASONS[robotRejectCode] ?? `Неизвестная причина запрета (${robotRejectCode})`,
  };
  return {
    cellRunning: booleanValue(values, 'stCellStatus.xRunning', current.cellRunning),
    cellStopPending: booleanValue(values, 'stCellStatus.xStopPending', current.cellStopPending),
    globalError: booleanValue(values, 'xGlobalError', current.globalError),
    readyToStart: booleanValue(values, 'stCellStatus.xReadyToStart', current.readyToStart),
    cellStartAllowed: booleanValue(values, 'stCellStatus.xStartAllowed', current.cellStartAllowed),
    cellStopAllowed: booleanValue(values, 'stCellStatus.xStopAllowed', current.cellStopAllowed),
    cellResetAllowed: booleanValue(values, 'stCellStatus.xResetAllowed', current.cellResetAllowed),
    manualModeAllowed: booleanValue(values, 'stCellStatus.xManualAllowed', current.manualModeAllowed),
    automaticModeAllowed: booleanValue(values, 'stCellStatus.xAutomaticAllowed', current.automaticModeAllowed),
    drivesReady: booleanValue(values, 'stCellStatus.xDrivesReady', current.drivesReady),
    robotReady: booleanValue(values, 'stCellStatus.xRobotReady', current.robotReady),
    magazineReady: booleanValue(values, 'stCellStatus.xMagazineReady', current.magazineReady),
    safetyHomeRequired: booleanValue(values, 'stCellStatus.xSafetyHomeRequired', current.safetyHomeRequired),
    robotAtSafetyHome: booleanValue(values, 'stCellStatus.xRobotAtSafetyHome', current.robotAtSafetyHome),
    cellSettings: {
      changeAllowed: booleanValue(values, 'xCellSettingsChangeAllowed', current.cellSettings.changeAllowed),
      safetyHome: {
        x: numberValue(values, 'lrSafetyHomeX', current.cellSettings.safetyHome.x),
        y: numberValue(values, 'lrSafetyHomeY', current.cellSettings.safetyHome.y),
        z: numberValue(values, 'lrSafetyHomeZ', current.cellSettings.safetyHome.z),
        speedFactor: numberValue(values, 'lrSafetyHomeSpeedFactor', current.cellSettings.safetyHome.speedFactor),
        toleranceX: numberValue(values, 'lrSafetyHomeToleranceX', current.cellSettings.safetyHome.toleranceX),
        toleranceY: numberValue(values, 'lrSafetyHomeToleranceY', current.cellSettings.safetyHome.toleranceY),
        toleranceZ: numberValue(values, 'lrSafetyHomeToleranceZ', current.cellSettings.safetyHome.toleranceZ),
      },
      timeouts: {
        robotMove: secondsValue(values, 'stCellMachineTimeouts.tRobotMove', current.cellSettings.timeouts.robotMove),
        robotAction: secondsValue(values, 'stCellMachineTimeouts.tRobotAction', current.cellSettings.timeouts.robotAction),
        robotRelease: secondsValue(values, 'stCellMachineTimeouts.tRobotRelease', current.cellSettings.timeouts.robotRelease),
        doorOpen: secondsValue(values, 'stCellMachineTimeouts.tDoorOpen', current.cellSettings.timeouts.doorOpen),
        doorClose: secondsValue(values, 'stCellMachineTimeouts.tDoorClose', current.cellSettings.timeouts.doorClose),
        chuckOpen: secondsValue(values, 'stCellMachineTimeouts.tChuckOpen', current.cellSettings.timeouts.chuckOpen),
        chuckClose: secondsValue(values, 'stCellMachineTimeouts.tChuckClose', current.cellSettings.timeouts.chuckClose),
        cycleStart: secondsValue(values, 'stCellMachineTimeouts.tCycleStart', current.cellSettings.timeouts.cycleStart),
      },
    },
    testEnvironment: {
      requested: numberValue(values, 'uiTestEnvironmentRequest', current.testEnvironment.requested),
      applied: numberValue(values, 'uiTestEnvironmentApplied', current.testEnvironment.applied),
      speedProfile: numberValue(values, 'uiTestSpeedProfileApplied', current.testEnvironment.speedProfile),
      changeAllowed: booleanValue(values, 'xTestEnvironmentChangeAllowed', current.testEnvironment.changeAllowed),
      scenarioApplyAllowed: booleanValue(values, 'xTestScenarioApplyAllowed', current.testEnvironment.scenarioApplyAllowed),
      simulatorActive: booleanValue(values, 'stRobotModbusStatus.xSimulatorActive', current.testEnvironment.simulatorActive),
      benchKey: booleanValue(values, 'xSc500BenchKeyActive', current.testEnvironment.benchKey),
      benchKeyLost: booleanValue(values, 'xSc500BenchKeyLost', current.testEnvironment.benchKeyLost),
      rejectReason: numberValue(values, 'uiTestRejectReason', current.testEnvironment.rejectReason),
    },
    startReadiness: {
      cellIdle: booleanValue(values, 'stCellStatus.xStartCheckCellIdle', current.startReadiness.cellIdle),
      automaticMode: booleanValue(values, 'stCellStatus.xStartCheckAutomaticMode', current.startReadiness.automaticMode),
      noBlockingError: booleanValue(values, 'stCellStatus.xStartCheckNoBlockingError', current.startReadiness.noBlockingError),
      robotInterfaceReady: booleanValue(values, 'stCellStatus.xStartCheckRobotInterfaceReady', current.startReadiness.robotInterfaceReady),
      configurationValid: booleanValue(values, 'stCellStatus.xStartCheckConfigurationValid', current.startReadiness.configurationValid),
      drivesReady: booleanValue(values, 'stCellStatus.xStartCheckDrivesReady', current.startReadiness.drivesReady),
      robotReady: booleanValue(values, 'stCellStatus.xStartCheckRobotReady', current.startReadiness.robotReady),
      magazineReady: booleanValue(values, 'stCellStatus.xStartCheckMagazineReady', current.startReadiness.magazineReady),
      taskAvailable: booleanValue(values, 'stCellStatus.xStartCheckTaskAvailable', current.startReadiness.taskAvailable),
      safetyHome: booleanValue(values, 'stCellStatus.xStartCheckSafetyHome', current.startReadiness.safetyHome),
      met: numberValue(values, 'stCellStatus.uiStartConditionsMet', current.startReadiness.met),
      total: numberValue(values, 'stCellStatus.uiStartConditionsTotal', current.startReadiness.total),
    },
    readyMachines: numberValue(values, 'stCellStatus.uiReadyMachines', current.readyMachines),
    manualMode: booleanValue(values, 'xCellManual', current.manualMode),
    selectedMachine: numberValue(values, 'stCellStatus.uiSelectedMachine', current.selectedMachine),
    operatorPromptActive: booleanValue(values, 'stCellStatus.xOperatorPromptActive', current.operatorPromptActive),
    operatorChoiceAllowed: booleanValue(values, 'stCellStatus.xOperatorChoiceAllowed', current.operatorChoiceAllowed),
    operatorCancelAllowed: booleanValue(values, 'stCellStatus.xOperatorCancelAllowed', current.operatorCancelAllowed),
    operatorPrompt: numberValue(values, 'stCellStatus.uiOperatorPrompt', current.operatorPrompt),
    operatorTypeMask: numberValue(values, 'stCellStatus.uiOperatorTypeMask', current.operatorTypeMask),
    operatorMachineMask: numberValue(values, 'stCellStatus.uiOperatorMachineMask', current.operatorMachineMask),
    cellStateCode,
    robotStateCode,
    robotActionCode,
    robotPointCode,
    magazineStateCode,
    magazineStateCodes,
    cellStep: CELL_STATES[cellStateCode] ?? current.cellStep,
    robotStep: robotExternalError
      ? 'Остановлен внешней ошибкой'
      : robotStepText(robotStateCode, robotActionCode, robotPointCode, current.robotStep),
    machineSteps: [1, 2, 3].map((number, index) =>
      machineStepText(values, number, current.machineSteps[index] ?? 'Нет данных')),
    magazineStep: MAGAZINE_STATES[magazineStateCode] ?? current.magazineStep,
    magazineSteps: magazineStateCodes.map((code, index) => MAGAZINE_STATES[code] ?? current.magazineSteps[index]) as [string, string],
    activeMagazine,
    activeAlarmCount: numberValue(values, 'stAlarmStatus.uiActiveAlarmCount', current.activeAlarmCount),
    activeWarningCount: numberValue(values, 'stAlarmStatus.uiActiveWarningCount', current.activeWarningCount),
    alarmEvents,
    equipmentLoad: [
      percentValue(values, 'rLoadCNC_1', current.equipmentLoad[0]),
      percentValue(values, 'rLoadCNC_2', current.equipmentLoad[1]),
      percentValue(values, 'rLoadCNC_3', current.equipmentLoad[2]),
      percentValue(values, 'rRobot', current.equipmentLoad[3]),
    ],
    modbusMode: booleanValue(values, 'xModbusMode', current.modbusMode),
    robotModbus: {
      requestedMode: numberValue(values, 'uiRobotControlModeRequest', current.robotModbus.requestedMode),
      modeChangeAllowed: booleanValue(values, 'xRobotModeChangeAllowed', current.robotModbus.modeChangeAllowed),
      settingsChangeAllowed: booleanValue(values, 'xModbusSettingsChangeAllowed', current.robotModbus.settingsChangeAllowed),
      modeRejectReason: numberValue(values, 'uiRobotModeRejectReason', current.robotModbus.modeRejectReason),
      settingsRejectReason: numberValue(values, 'uiModbusSettingsRejectReason', current.robotModbus.settingsRejectReason),
      ip: [1, 2, 3, 4].map((index) => numberValue(values, `uiModbusIpOctet${index}`, current.robotModbus.ip[index - 1])) as [number, number, number, number],
      port: numberValue(values, 'uiModbusPort', current.robotModbus.port),
      unitId: numberValue(values, 'uiModbusUnitId', current.robotModbus.unitId),
      responseTimeoutMs: numberValue(values, 'udiModbusResponseTimeoutMs', current.robotModbus.responseTimeoutMs),
      pollIntervalMs: numberValue(values, 'udiModbusPollIntervalMs', current.robotModbus.pollIntervalMs),
      heartbeatTimeoutMs: numberValue(values, 'udiModbusHeartbeatTimeoutMs', current.robotModbus.heartbeatTimeoutMs),
      configValid: booleanValue(values, 'stRobotModbusStatus.xConfigValid', current.robotModbus.configValid),
      connected: booleanValue(values, 'stRobotModbusStatus.xConnected', current.robotModbus.connected),
      communicationAlive: booleanValue(values, 'stRobotModbusStatus.xCommunicationAlive', current.robotModbus.communicationAlive),
      statusFresh: booleanValue(values, 'stRobotModbusStatus.xStatusFresh', current.robotModbus.statusFresh),
      controllerOn: booleanValue(values, 'stRobotModbusStatus.xControllerOn', current.robotModbus.controllerOn),
      automaticMode: booleanValue(values, 'stRobotModbusStatus.xAutomaticMode', current.robotModbus.automaticMode),
      remoteEnabled: booleanValue(values, 'stRobotModbusStatus.xRemoteEnabled', current.robotModbus.remoteEnabled),
      drivesEnabled: booleanValue(values, 'stRobotModbusStatus.xDrivesEnabled', current.robotModbus.drivesEnabled),
      homed: booleanValue(values, 'stRobotModbusStatus.xHomed', current.robotModbus.homed),
      emergencyStop: booleanValue(values, 'stRobotModbusStatus.xEmergencyStop', current.robotModbus.emergencyStop),
      robotAlarm: booleanValue(values, 'stRobotModbusStatus.xRobotAlarm', current.robotModbus.robotAlarm),
      positionValid: booleanValue(values, 'stRobotModbusStatus.xPositionValid', current.robotModbus.positionValid),
      ready: booleanValue(values, 'stRobotModbusStatus.xReady', current.robotModbus.ready),
      busy: booleanValue(values, 'stRobotModbusStatus.xBusy', current.robotModbus.busy),
      done: booleanValue(values, 'stRobotModbusStatus.xDone', current.robotModbus.done),
      error: booleanValue(values, 'stRobotModbusStatus.xError', current.robotModbus.error),
      commandTimeout: booleanValue(values, 'stRobotModbusStatus.xCommandTimeout', current.robotModbus.commandTimeout),
      ackSeq: numberValue(values, 'stRobotModbusStatus.uiAckSeq', current.robotModbus.ackSeq),
      executionState: numberValue(values, 'stRobotModbusStatus.uiExecutionState', current.robotModbus.executionState),
      alarmCode: numberValue(values, 'stRobotModbusStatus.uiAlarmCode', current.robotModbus.alarmCode),
      resultCode: numberValue(values, 'stRobotModbusStatus.uiResultCode', current.robotModbus.resultCode),
      activeCommand: numberValue(values, 'stRobotModbusStatus.uiActiveCommand', current.robotModbus.activeCommand),
      currentPoint: numberValue(values, 'stRobotModbusStatus.uiCurrentPoint', current.robotModbus.currentPoint),
      gripperStatus: numberValue(values, 'stRobotModbusStatus.uiGripperStatus', current.robotModbus.gripperStatus),
      robotHeartbeat: numberValue(values, 'stRobotModbusStatus.uiRobotHeartbeat', current.robotModbus.robotHeartbeat),
      statusWord: numberValue(values, 'stRobotModbusStatus.uiStatusWord', current.robotModbus.statusWord),
      operationPhase: numberValue(values, 'stRobotModbusStatus.uiOperationPhase', current.robotModbus.operationPhase),
      protocolVersion: numberValue(values, 'stRobotModbusStatus.uiProtocolVersion', current.robotModbus.protocolVersion),
      actualX: numberValue(values, 'stRobotModbusStatus.lrActualX', current.robotModbus.actualX),
      actualY: numberValue(values, 'stRobotModbusStatus.lrActualY', current.robotModbus.actualY),
      actualZ: numberValue(values, 'stRobotModbusStatus.lrActualZ', current.robotModbus.actualZ),
      clientError: numberValue(values, 'stRobotModbusStatus.udiClientError', current.robotModbus.clientError),
      readError: numberValue(values, 'stRobotModbusStatus.udiReadError', current.robotModbus.readError),
      writeError: numberValue(values, 'stRobotModbusStatus.udiWriteError', current.robotModbus.writeError),
      transportError: numberValue(values, 'stRobotModbusStatus.udiClientError', 0)
        || numberValue(values, 'stRobotModbusStatus.udiReadError', 0)
        || numberValue(values, 'stRobotModbusStatus.udiWriteError', current.robotModbus.transportError),
      writeRegisters: Array.from({ length: 9 }, (_, index) => numberValue(
        values, `auiRobotModbusWriteRegisters[${index + 1}]`, current.robotModbus.writeRegisters[index] ?? 0)),
      readRegisters: Array.from({ length: 17 }, (_, index) => numberValue(
        values, `auiRobotModbusReadRegisters[${index + 1}]`, current.robotModbus.readRegisters[index] ?? 0)),
    },
    multiTypeCount: numberValue(values, 'stMultiType.Config.uiTypeCount', current.multiTypeCount),
    multiTypeMagazineConfigAllowed: booleanValue(values, 'stMultiType.ConfigStatus.xMagazineConfigAllowed', current.multiTypeMagazineConfigAllowed),
    multiTypeCountAllowed: booleanValue(values, 'stMultiType.ConfigStatus.xTypeCountAllowed', current.multiTypeCountAllowed),
    multiTypeMachineAllowed: [1, 2, 3].map((index) => booleanValue(
      values,
      `stMultiType.ConfigStatus.axMachineTypeAllowed[${index}]`,
      current.multiTypeMachineAllowed[index - 1],
    )) as [boolean, boolean, boolean],
    multiTypeConfigurationValid: booleanValue(values, 'stMultiType.ConfigStatus.xConfigurationValid', current.multiTypeConfigurationValid),
    multiTypeSelectedType: numberValue(values, 'stMultiType.CycleStatus.uiSelectedType', current.multiTypeSelectedType),
    multiTypeReturningBlank: booleanValue(values, 'stMultiType.CycleStatus.xReturningBlank', current.multiTypeReturningBlank),
    hmiConnectionAlive: booleanValue(values, 'xHmiConnectionAlive', current.hmiConnectionAlive),
    manualRecoveryActive: booleanValue(values, 'xManualRecoveryActive', current.manualRecoveryActive),
    continuousMode: booleanValue(values, 'xRobotContinuousMode', current.continuousMode),
    speedOverridePercent: numberValue(values, 'rRobotManualSpeedPercent', current.speedOverridePercent),
    manualStep: numberValue(values, 'lrRobotManualStep', current.manualStep),
    axisManual,
    robotManual,
  };
}

export function createPlcClient(callbacks: {
  onConnection: (info: PlcConnectionInfo) => void;
  onSnapshot: (values: Record<string, unknown>, changed: Record<string, unknown>, full: boolean) => void;
  onRobotFrame?: (frame: RobotCoordinateFrame) => void;
  onCyclogramHistory?: (history: CyclogramHistory) => void;
  onCyclogramUpdate?: (update: CyclogramUpdate) => void;
  onCellLogHistory?: (history: CellLogHistory) => void;
  onCellLogEvent?: (event: CellLogEvent) => void;
  onCommandError?: (message: string) => void;
  onAuthenticationRequired?: () => void;
}) {
  let socket: WebSocket | null = null;
  let stopped = false;
  let reconnectTimer = 0;
  let heartbeatTimer = 0;
  let heartbeatValue = 0;
  let snapshotValues: Record<string, unknown> = {};
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = import.meta.env.VITE_GATEWAY_URL ?? `${protocol}//${location.hostname}:3001/ws`;
  const sendHeartbeat = () => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    heartbeatValue = (heartbeatValue + 1) >>> 0;
    socket.send(JSON.stringify({ type: 'command', requestId: crypto.randomUUID(), command: 'hmi.heartbeat', value: heartbeatValue }));
  };

  const connect = () => {
    if (stopped) return;
    callbacks.onConnection({ status: 'connecting', endpoint: '', message: 'Подключение к шлюзу', symbols: 0, missing: [] });
    socket = new WebSocket(url);
    socket.onopen = () => {
      snapshotValues = {};
      window.clearInterval(heartbeatTimer);
      sendHeartbeat();
      heartbeatTimer = window.setInterval(sendHeartbeat, 150);
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as GatewayMessage;
      if (message.type === 'connection') {
        callbacks.onConnection({
          status: message.status ?? 'disconnected', endpoint: message.endpoint ?? '',
          message: message.message ?? '', symbols: message.symbols ?? 0, missing: message.missing ?? [],
        });
      } else if (message.type === 'snapshot' && message.values) {
        const full = message.full !== false;
        if (full) snapshotValues = { ...message.values };
        else Object.assign(snapshotValues, message.values);
        if (message.robotFrame
            && Number.isFinite(message.robotFrame.sequence)
            && Number.isFinite(message.robotFrame.timestampMs)
            && Number.isFinite(message.robotFrame.sourceTimestampMs)
            && Object.values(message.robotFrame.coordinates).every(Number.isFinite)) {
          callbacks.onRobotFrame?.(message.robotFrame);
        }
        callbacks.onSnapshot(snapshotValues, message.values, full);
      } else if (message.type === 'cyclogram-history' && message.intervals
          && typeof message.serverTime === 'number' && typeof message.retentionMs === 'number') {
        callbacks.onCyclogramHistory?.({
          serverTime: message.serverTime,
          retentionMs: message.retentionMs,
          intervals: message.intervals,
        });
      } else if (message.type === 'cyclogram-update' && message.closed && message.opened
          && typeof message.serverTime === 'number') {
        callbacks.onCyclogramUpdate?.({
          serverTime: message.serverTime,
          closed: message.closed,
          opened: message.opened,
        });
      } else if (message.type === 'cell-event-history' && message.events
          && typeof message.serverTime === 'number' && typeof message.retentionMs === 'number') {
        callbacks.onCellLogHistory?.({
          serverTime: message.serverTime,
          retentionMs: message.retentionMs,
          events: message.events,
        });
      } else if (message.type === 'cell-event' && message.event) {
        callbacks.onCellLogEvent?.(message.event);
      } else if (message.type === 'ack' && !message.ok) {
        callbacks.onCommandError?.(message.error ?? 'PLC отклонил команду');
      }
    };
    socket.onclose = (event) => {
      window.clearInterval(heartbeatTimer);
      if (event.code === 4001) callbacks.onAuthenticationRequired?.();
      callbacks.onConnection({ status: 'disconnected', endpoint: '', message: 'Нет связи со шлюзом', symbols: 0, missing: [] });
      if (event.code !== 4001) reconnectTimer = window.setTimeout(connect, 2000);
    };
    socket.onerror = () => socket?.close();
  };

  connect();
  return {
    send(command: PlcCommand) {
      if (socket?.readyState !== WebSocket.OPEN) {
        callbacks.onCommandError?.('Нет связи со шлюзом');
        return false;
      }
      socket.send(JSON.stringify({ type: 'command', requestId: crypto.randomUUID(), ...command }));
      return true;
    },
    clearCyclogram() {
      if (socket?.readyState !== WebSocket.OPEN) {
        callbacks.onCommandError?.('Нет связи со шлюзом');
        return false;
      }
      socket.send(JSON.stringify({ type: 'cyclogram-clear', requestId: crypto.randomUUID() }));
      return true;
    },
    close() {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(heartbeatTimer);
      socket?.close();
    },
    cyclogramExportUrl(scope: 'all' | 'visible', fromMs?: number, toMs?: number) {
      const endpoint = new URL(url, window.location.href);
      endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
      endpoint.pathname = '/api/cyclogram/export';
      endpoint.search = '';
      endpoint.searchParams.set('scope', scope === 'all' ? 'all' : 'visible');
      if (scope === 'visible' && Number.isFinite(fromMs) && Number.isFinite(toMs)) {
        endpoint.searchParams.set('from', String(Math.round(fromMs as number)));
        endpoint.searchParams.set('to', String(Math.round(toMs as number)));
      }
      return endpoint.toString();
    },
  };
}
