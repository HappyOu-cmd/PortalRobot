import type { CellState, MachineMode, MachineOperation, MachinePartState, MachinePartType, MagazineOperation, SlotType, Vec3Mm } from '../model/types';
import type { CyclogramHistory, CyclogramUpdate } from '../model/cyclogram';

export type PlcConnectionStatus = 'connecting' | 'connected' | 'degraded' | 'disconnected';
export type PlcAlarmSeverity = 'alarm' | 'warning';
export type PlcAlarmSource = 'cell' | 'robot' | 'machine-1' | 'machine-2' | 'machine-3' | 'magazine' | 'axis-x' | 'axis-y' | 'axis-z' | 'axis-group' | 'motion-manager' | 'point-manager' | 'gripper';

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
  readyMachines: number;
  manualMode: boolean;
  selectedMachine: number;
  cellStateCode: number;
  robotStateCode: number;
  robotActionCode: number;
  robotPointCode: number;
  magazineStateCode: number;
  cellStep: string;
  robotStep: string;
  machineSteps: string[];
  magazineStep: string;
  activeAlarmCount: number;
  activeWarningCount: number;
  alarmEvents: PlcAlarmEvent[];
  equipmentLoad: [number, number, number, number];
}

interface GatewayMessage {
  type: 'connection' | 'snapshot' | 'ack' | 'cyclogram-history' | 'cyclogram-update';
  status?: PlcConnectionStatus;
  endpoint?: string;
  message?: string;
  symbols?: number;
  missing?: string[];
  values?: Record<string, unknown>;
  full?: boolean;
  requestId?: string;
  ok?: boolean;
  error?: string;
  serverTime?: number;
  retentionMs?: number;
  intervals?: CyclogramHistory['intervals'];
  closed?: CyclogramUpdate['closed'];
  opened?: CyclogramUpdate['opened'];
}

export interface PlcCommand {
  command: string;
  machine?: number;
  value?: boolean | number;
}

const CELL_STATES = [
  'Ожидание запуска', 'Проверяет содержимое захватов', 'Выбирает станок',
  'Перемещается к станку', 'Снимает команду робота', 'Ожидает станок',
  'Обслуживает станок', 'Работает с магазином', 'Завершает работу с магазином',
  'Ожидает обслуживание магазина', 'Ошибка менеджера ячейки',
];
const ROBOT_STATES = ['Готов', 'Перемещается', 'Работает захватом', 'Команда завершена', 'Ошибка робота', 'Команда Modbus'];
const ROBOT_ACTIONS = ['Нет действия', 'Движение к точке', 'Открывает захват 1', 'Закрывает захват 1', 'Открывает захват 2', 'Закрывает захват 2', 'Поворот к заготовке', 'Поворот к детали'];
const POINT_NAMES = [
  'NONE',
  'MACHINE_1_ABOVE', 'MACHINE_1_INSIDE', 'MACHINE_1_CHUCK_APROACH', 'MACHINE_1_CHUCK_POSITION',
  'MACHINE_2_ABOVE', 'MACHINE_2_INSIDE', 'MACHINE_2_CHUCK_APROACH', 'MACHINE_2_CHUCK_POSITION',
  'MACHINE_3_ABOVE', 'MACHINE_3_INSIDE', 'MACHINE_3_CHUCK_APROACH', 'MACHINE_3_CHUCK_POSITION',
  'MAGAZINE_DETAIL', 'MAGAZINE_TAKE_DETAIL', 'MAGAZINE_PUT_DETAIL', 'MAGAZINE_CHANGE_DETAIL',
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
  'cell', 'robot', 'machine-1', 'machine-2', 'machine-3', 'magazine',
  'axis-x', 'axis-y', 'axis-z', 'axis-group', 'motion-manager', 'point-manager',
  'gripper',
];
const AXIS_ALARM_TEXTS = [
  'Ошибка MC_Power', 'Ошибка MC_Reset', 'Ошибка MC_Stop', 'Ошибка MC_Jog',
  'Ошибка MC_Home', 'Ошибка MC_MoveAbsolute', 'Ошибка MC_MoveRelative',
  'Ошибка чтения позиции оси', 'Ошибка чтения статуса оси', 'Ось находится в ErrorStop',
  'SoftMotion сообщил внутреннюю ошибку', 'Команда движения прервана',
  'Неизвестная ошибка оси', 'Ошибка привода', '', '',
  'Снято разрешение питания оси', 'Глобальная ошибка при включении оси',
  'Глобальная ошибка в состоянии готовности оси', 'Глобальная ошибка во время движения оси',
  'Одновременно заданы Jog+ и Jog-', 'MoveAbsolute запрещён до Home',
  'MoveRelative запрещён до Home', 'Превышено время шага оси', 'Неизвестное состояние оси',
];
const AXIS_GROUP_ALARM_TEXTS = [
  'Ошибка MC_GroupEnable', 'Ошибка SMC_GroupPower', 'Ошибка MC_GroupDisable',
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
  cell: 'Ячейка', robot: 'Робот', 'machine-1': 'Станок 1', 'machine-2': 'Станок 2', 'machine-3': 'Станок 3', magazine: 'Магазин',
  'axis-x': 'Ось X', 'axis-y': 'Ось Y', 'axis-z': 'Ось Z', 'axis-group': 'Группа осей XYZ', 'motion-manager': 'Менеджер движения', 'point-manager': 'Менеджер точек',
  gripper: 'Захват робота',
};
const ALARM_TEXTS: Partial<Record<PlcAlarmSource, string[]>> = {
  cell: ['Оба захвата заняты при запуске', 'Ошибка робота во время автоматического цикла', 'Ошибка магазина во время операции', 'Ошибка станка во время обслуживания', 'Получена глобальная ошибка ячейки'],
  robot: ['Неизвестная команда робота', 'Ошибка менеджера движения', 'Ошибка механизма захвата', 'Ошибка обмена с внешним роботом', 'Движение остановлено командой или глобальной ошибкой'],
  'machine-1': MACHINE_ALARM_TEXTS,
  'machine-2': MACHINE_ALARM_TEXTS,
  'machine-3': MACHINE_ALARM_TEXTS,
  magazine: ['Операция не может быть выбрана', 'Нет доступной заготовки', 'Нет свободного слота', 'Номер слота вне матрицы', 'Содержимое слота не соответствует операции', 'Робот завершил команду с ошибкой', 'Получена глобальная ошибка ячейки', 'Неверно задана геометрия магазина'],
  'axis-x': AXIS_ALARM_TEXTS,
  'axis-y': AXIS_ALARM_TEXTS,
  'axis-z': AXIS_ALARM_TEXTS,
  'axis-group': AXIS_GROUP_ALARM_TEXTS,
  'motion-manager': ['Недопустимая целевая точка', 'Ошибка группы осей', 'Менеджер движения остановлен глобальной ошибкой'],
  'point-manager': ['Координата X вне допустимых границ', 'Координата Y вне допустимых границ', 'Координата Z вне допустимых границ', 'Недопустимый коэффициент скорости'],
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
  },
  robot: {
    1: 'Сброс робота отклонён: команда выполнения всё ещё активна',
    2: 'Сброс робота отклонён: команда остановки всё ещё активна',
    3: 'Сброс робота отклонён: глобальная ошибка всё ещё активна',
    4: 'Сброс робота отклонён: ошибка менеджера движения всё ещё активна',
    5: 'Сброс робота отклонён: ошибка захвата всё ещё активна',
    6: 'Сброс робота отклонён: ошибка внешнего робота или Modbus всё ещё активна',
    7: 'Команда робота отклонена: включите ручной режим и остановите ячейку',
    8: 'Команда приводов отклонена: сначала устраните активную ошибку',
    9: 'Остановка робота отклонена: приводы не готовы',
    10: 'Сброс робота отклонён: активных ошибок робота или приводов нет',
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
  magazine: {
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
  'axis-x': {
    1: 'Включение оси X отклонено: нет разрешения питания',
    2: 'Сброс оси X не выполнен: глобальная ошибка всё ещё активна',
    3: 'Сброс оси X не выполнен: MC_Reset завершился ошибкой',
    4: 'Сброс оси X не выполнен: превышено время сброса',
    5: 'Сброс оси X не выполнен: физическая ошибка оси всё ещё активна',
    6: 'Сброс оси X не выполнен: защёлкнутая ошибка оси не очищена',
    7: 'Сброс оси X не выполнен: логическая ошибка оси не очищена',
  },
  'axis-y': {
    1: 'Включение оси Y отклонено: нет разрешения питания',
    2: 'Сброс оси Y не выполнен: глобальная ошибка всё ещё активна',
    3: 'Сброс оси Y не выполнен: MC_Reset завершился ошибкой',
    4: 'Сброс оси Y не выполнен: превышено время сброса',
    5: 'Сброс оси Y не выполнен: физическая ошибка оси всё ещё активна',
    6: 'Сброс оси Y не выполнен: защёлкнутая ошибка оси не очищена',
    7: 'Сброс оси Y не выполнен: логическая ошибка оси не очищена',
  },
  'axis-z': {
    1: 'Включение оси Z отклонено: нет разрешения питания',
    2: 'Сброс оси Z не выполнен: глобальная ошибка всё ещё активна',
    3: 'Сброс оси Z не выполнен: MC_Reset завершился ошибкой',
    4: 'Сброс оси Z не выполнен: превышено время сброса',
    5: 'Сброс оси Z не выполнен: физическая ошибка оси всё ещё активна',
    6: 'Сброс оси Z не выполнен: защёлкнутая ошибка оси не очищена',
    7: 'Сброс оси Z не выполнен: логическая ошибка оси не очищена',
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
const MAGAZINE_OPERATIONS: MagazineOperation[] = ['NONE', 'TAKE', 'PUT', 'CHANGE'];

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

  const magazine = current.magazine.map((slot, index): SlotType => {
    const root = `astMagazineSlot[${index + 1}]`;
    if (!booleanValue(values, `${root}.xInPosition`, slot !== 'empty')) return 'empty';
    const type = numberValue(values, `${root}.eDetailType`, slot === 'blank' ? 1 : slot === 'detail' ? 2 : 0);
    return type === 1 ? 'blank' : type === 2 ? 'detail' : 'empty';
  });

  const magazineStatus = 'stMagazineStatus';
  const magazineState = {
    ...current.magazineState,
    enabled: booleanValue(values, `${magazineStatus}.xEnabled`, current.magazineState.enabled),
    disablePending: booleanValue(values, `${magazineStatus}.xDisablePending`, current.magazineState.disablePending),
    ready: booleanValue(values, `${magazineStatus}.xReady`, current.magazineState.ready),
    busy: booleanValue(values, `${magazineStatus}.xBusy`, current.magazineState.busy),
    done: booleanValue(values, `${magazineStatus}.xDone`, current.magazineState.done),
    error: booleanValue(values, `${magazineStatus}.xError`, current.magazineState.error),
    finished: booleanValue(values, `${magazineStatus}.xFinished`, current.magazineState.finished),
    canTake: booleanValue(values, `${magazineStatus}.xCanTake`, current.magazineState.canTake),
    canPut: booleanValue(values, `${magazineStatus}.xCanPut`, current.magazineState.canPut),
    canChange: booleanValue(values, `${magazineStatus}.xCanChange`, current.magazineState.canChange),
    canEnable: booleanValue(values, `${magazineStatus}.xCanEnable`, current.magazineState.canEnable),
    powerAllowed: booleanValue(values, `${magazineStatus}.xPowerAllowed`, current.magazineState.powerAllowed),
    fillAllowed: booleanValue(values, `${magazineStatus}.xFillAllowed`, current.magazineState.fillAllowed),
    clearAllowed: booleanValue(values, `${magazineStatus}.xClearAllowed`, current.magazineState.clearAllowed),
    currentBlank: numberValue(values, `${magazineStatus}.iCurrentBlank`, current.magazineState.currentBlank),
    currentFreeSlot: numberValue(values, `${magazineStatus}.iCurrentFreeSlot`, current.magazineState.currentFreeSlot),
    selectedBlank: numberValue(values, `${magazineStatus}.iSelectedBlank`, current.magazineState.selectedBlank),
    selectedFreeSlot: numberValue(values, `${magazineStatus}.iSelectedFreeSlot`, current.magazineState.selectedFreeSlot),
    actualOperation: MAGAZINE_OPERATIONS[numberValue(values, `${magazineStatus}.eActualOperation`, MAGAZINE_OPERATIONS.indexOf(current.magazineState.actualOperation))] ?? 'NONE',
    rows: numberValue(values, 'MagazineRows', current.magazineState.rows),
    columns: numberValue(values, 'MagazineColumns', current.magazineState.columns),
    pitchX: numberValue(values, 'MagazinePitchX', current.magazineState.pitchX),
    pitchY: numberValue(values, 'MagazinePitchY', current.magazineState.pitchY),
    safeAbove: numberValue(values, 'MagazineSafeZ_1', current.magazineState.safeAbove),
    safeInside: numberValue(values, 'MagazineSafeZ_2', current.magazineState.safeInside),
    activeErrors: errorList(values, 'stMagazineError.dwErrorActive', 'Ошибка магазина', current.magazineState.activeErrors),
    lastErrors: errorList(values, 'stMagazineError.dwErrorLast', 'Последняя ошибка магазина', current.magazineState.lastErrors),
  };

  return {
    robot: {
      ...mapRobotCoordinates(values, current.robot),
      busy: booleanValue(values, 'stRobotStatus.xBusy', current.robot.busy),
      done: booleanValue(values, 'stRobotStatus.xDone', current.robot.done),
      error: booleanValue(values, 'stRobotStatus.xError', current.robot.error),
      powerAllowed: booleanValue(values, 'stRobotStatus.xPowerAllowed', current.robot.powerAllowed),
      stopAllowed: booleanValue(values, 'stRobotStatus.xStopAllowed', current.robot.stopAllowed),
      resetAllowed: booleanValue(values, 'stRobotStatus.xResetAllowed', current.robot.resetAllowed),
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
    magazine,
    magazineState,
  };
}

export function mapRuntimeInfo(values: Record<string, unknown>, current: PlcRuntimeInfo): PlcRuntimeInfo {
  const cellStateCode = numberValue(values, 'stCellDiag.eState', current.cellStateCode);
  const robotStateCode = numberValue(values, 'stRobotDiag.eState', current.robotStateCode);
  const robotActionCode = numberValue(values, 'stRobotDiag.eActiveAction', current.robotActionCode);
  const robotPointCode = numberValue(values, 'stRobotDiag.eActivePoint', current.robotPointCode);
  const magazineStateCode = numberValue(values, 'stMagazineDiag.eState', current.magazineStateCode);
  const robotExternalError = booleanValue(values, 'stRobotStatus.xExternalError', false);
  const alarmEvents = mapAlarmEvents(values, current.alarmEvents);
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
    readyMachines: numberValue(values, 'stCellStatus.uiReadyMachines', current.readyMachines),
    manualMode: booleanValue(values, 'xCellManual', current.manualMode),
    selectedMachine: numberValue(values, 'stCellStatus.uiSelectedMachine', current.selectedMachine),
    cellStateCode,
    robotStateCode,
    robotActionCode,
    robotPointCode,
    magazineStateCode,
    cellStep: CELL_STATES[cellStateCode] ?? current.cellStep,
    robotStep: robotExternalError
      ? 'Остановлен внешней ошибкой'
      : robotStepText(robotStateCode, robotActionCode, robotPointCode, current.robotStep),
    machineSteps: [1, 2, 3].map((number, index) =>
      machineStepText(values, number, current.machineSteps[index] ?? 'Нет данных')),
    magazineStep: MAGAZINE_STATES[magazineStateCode] ?? current.magazineStep,
    activeAlarmCount: numberValue(values, 'stAlarmStatus.uiActiveAlarmCount', current.activeAlarmCount),
    activeWarningCount: numberValue(values, 'stAlarmStatus.uiActiveWarningCount', current.activeWarningCount),
    alarmEvents,
    equipmentLoad: [
      percentValue(values, 'rLoadCNC_1', current.equipmentLoad[0]),
      percentValue(values, 'rLoadCNC_2', current.equipmentLoad[1]),
      percentValue(values, 'rLoadCNC_3', current.equipmentLoad[2]),
      percentValue(values, 'rRobot', current.equipmentLoad[3]),
    ],
  };
}

export function createPlcClient(callbacks: {
  onConnection: (info: PlcConnectionInfo) => void;
  onSnapshot: (values: Record<string, unknown>, changed: Record<string, unknown>, full: boolean) => void;
  onCyclogramHistory?: (history: CyclogramHistory) => void;
  onCyclogramUpdate?: (update: CyclogramUpdate) => void;
  onCommandError?: (message: string) => void;
}) {
  let socket: WebSocket | null = null;
  let stopped = false;
  let reconnectTimer = 0;
  let snapshotValues: Record<string, unknown> = {};
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = import.meta.env.VITE_GATEWAY_URL ?? `${protocol}//${location.hostname}:3001/ws`;

  const connect = () => {
    if (stopped) return;
    callbacks.onConnection({ status: 'connecting', endpoint: '', message: 'Подключение к шлюзу', symbols: 0, missing: [] });
    socket = new WebSocket(url);
    socket.onopen = () => { snapshotValues = {}; };
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
      } else if (message.type === 'ack' && !message.ok) {
        callbacks.onCommandError?.(message.error ?? 'PLC отклонил команду');
      }
    };
    socket.onclose = () => {
      callbacks.onConnection({ status: 'disconnected', endpoint: '', message: 'Нет связи со шлюзом', symbols: 0, missing: [] });
      reconnectTimer = window.setTimeout(connect, 2000);
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
