import type { CellState, MachineMode, MachineOperation, MachinePartState, SlotType } from '../model/types';

export type PlcConnectionStatus = 'connecting' | 'connected' | 'degraded' | 'disconnected';

export interface PlcConnectionInfo {
  status: PlcConnectionStatus;
  endpoint: string;
  message: string;
  symbols: number;
  missing: string[];
}

export interface PlcRuntimeInfo {
  cellRunning: boolean;
  globalError: boolean;
  selectedMachine: number;
  cellStep: string;
  robotStep: string;
  machineSteps: string[];
  magazineStep: string;
}

interface GatewayMessage {
  type: 'connection' | 'snapshot' | 'ack';
  status?: PlcConnectionStatus;
  endpoint?: string;
  message?: string;
  symbols?: number;
  missing?: string[];
  values?: Record<string, unknown>;
  requestId?: string;
  ok?: boolean;
  error?: string;
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
const MACHINE_STATES = [
  'Станок отключён', 'Готов к работе', 'Выбирает операцию', 'Читает шаг рецепта',
  'Переходит к следующему шагу', 'Снимает команду робота', 'Перемещает робота',
  'Выполняет действие робота', 'Открывает дверь', 'Закрывает дверь',
  'Открывает патрон', 'Закрывает патрон', 'Запускает обработку',
  'Обслуживание завершено', 'Ошибка станка',
];
const MAGAZINE_STATES = [
  'Магазин отключён', 'Готов к работе', 'Выбирает операцию', 'Готовит шаг',
  'Выполняет команду робота', 'Снимает команду робота', 'Переходит к следующему шагу',
  'Операция завершена', 'Ошибка магазина',
];
const OPERATIONS: MachineOperation[] = ['NONE', 'LOAD', 'UNLOAD', 'CHANGE'];

const numberValue = (values: Record<string, unknown>, path: string, fallback: number) => {
  const value = Number(values[path]);
  return Number.isFinite(value) ? value : fallback;
};
const booleanValue = (values: Record<string, unknown>, path: string, fallback: boolean) =>
  typeof values[path] === 'boolean' ? values[path] as boolean : fallback;
const enumText = (values: Record<string, unknown>, path: string, names: string[], fallback: string) =>
  names[numberValue(values, path, -1)] ?? fallback;
const secondsValue = (values: Record<string, unknown>, path: string, fallback: number) =>
  Math.max(0, Math.round(numberValue(values, path, fallback * 1000) / 100) / 10);
const errorList = (values: Record<string, unknown>, path: string, label: string, fallback: string[]) => {
  if (!(path in values)) return fallback;
  const mask = numberValue(values, path, 0) >>> 0;
  return mask === 0 ? [] : [`${label}: 0x${mask.toString(16).toUpperCase().padStart(8, '0')}`];
};

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
    const hasError = booleanValue(values, `${status}.xError`, machine.mode === 'error');
    const serviceRequired = booleanValue(values, `${status}.xServiceRequired`, machine.serviceRequired);
    const mode: MachineMode = !enabled ? 'idle' : hasError ? 'error' : processing ? 'processing' : serviceRequired ? 'waiting' : 'idle';
    const partStateValue = numberValue(values, `${status}.ePartState`, machine.partState === 'LOADED' ? 2 : machine.partState === 'EMPTY' ? 1 : 0);
    const partState: MachinePartState = partStateValue === 2 ? 'LOADED' : partStateValue === 1 ? 'EMPTY' : 'UNKNOWN';
    return {
      ...machine,
      enabled,
      disablePending: booleanValue(values, `axMachineUsed[${number}]`, true) === false && enabled,
      doorOpen: booleanValue(values, `${io}.xDoorOpen`, machine.doorOpen),
      doorClosed: booleanValue(values, `${io}.xDoorClosed`, machine.doorClosed),
      chuckOpen: booleanValue(values, `${io}.xChuckUnclamped`, machine.chuckOpen),
      chuckClosed: booleanValue(values, `${io}.xChuckClamped`, machine.chuckClosed),
      partPresent: partState === 'LOADED',
      partState,
      mode,
      currentStep: enumText(values, `${diag}.eState`, MACHINE_STATES, machine.currentStep),
      serviceRequired,
      canAcceptService: booleanValue(values, `${status}.xCanAcceptService`, machine.canAcceptService),
      recommendedOperation: OPERATIONS[numberValue(values, `${status}.eRecommendedOperation`, OPERATIONS.indexOf(machine.recommendedOperation))] ?? 'NONE',
      actualOperation: OPERATIONS[numberValue(values, `${diag}.eActualOperation`, OPERATIONS.indexOf(machine.actualOperation))] ?? 'NONE',
      cycleExpectedS: secondsValue(values, `${status}.tCycleExpected`, machine.cycleExpectedS),
      cycleElapsedS: secondsValue(values, `${status}.tCycleElapsed`, machine.cycleElapsedS),
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

  return {
    robot: {
      x: numberValue(values, 'lrActualX', current.robot.x),
      y: numberValue(values, 'lrActualY', current.robot.y),
      z: numberValue(values, 'lrActualZ', current.robot.z),
      gripper1Closed: booleanValue(values, 'stRobotStatus.xGripper1Closed', current.robot.gripper1Closed),
      gripper2Closed: booleanValue(values, 'stRobotStatus.xGripper2Closed', current.robot.gripper2Closed),
      rotatedToBlank: booleanValue(values, 'stRobotStatus.xRotatedToBlank', current.robot.rotatedToBlank),
      rotatedToDetail: booleanValue(values, 'stRobotStatus.xRotatedToDetail', current.robot.rotatedToDetail),
    },
    machines,
    magazine,
  };
}

export function mapRuntimeInfo(values: Record<string, unknown>, current: PlcRuntimeInfo): PlcRuntimeInfo {
  const robotState = enumText(values, 'stRobotDiag.eState', ROBOT_STATES, current.robotStep);
  const robotAction = enumText(values, 'stRobotDiag.eActiveAction', ROBOT_ACTIONS, '');
  return {
    cellRunning: booleanValue(values, 'stCellStatus.xRunning', current.cellRunning),
    globalError: booleanValue(values, 'xGlobalError', current.globalError),
    selectedMachine: numberValue(values, 'stCellStatus.uiSelectedMachine', current.selectedMachine),
    cellStep: enumText(values, 'stCellDiag.eState', CELL_STATES, current.cellStep),
    robotStep: robotAction && robotAction !== 'Нет действия' ? robotAction : robotState,
    machineSteps: [1, 2, 3].map((number, index) => enumText(values, `astMachineDiag[${number}].eState`, MACHINE_STATES, current.machineSteps[index] ?? 'Нет данных')),
    magazineStep: enumText(values, 'stMagazineDiag.eState', MAGAZINE_STATES, current.magazineStep),
  };
}

export function createPlcClient(callbacks: {
  onConnection: (info: PlcConnectionInfo) => void;
  onSnapshot: (values: Record<string, unknown>) => void;
  onCommandError?: (message: string) => void;
}) {
  let socket: WebSocket | null = null;
  let stopped = false;
  let reconnectTimer = 0;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = import.meta.env.VITE_GATEWAY_URL ?? `${protocol}//${location.hostname}:3001/ws`;

  const connect = () => {
    if (stopped) return;
    callbacks.onConnection({ status: 'connecting', endpoint: '', message: 'Подключение к шлюзу', symbols: 0, missing: [] });
    socket = new WebSocket(url);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as GatewayMessage;
      if (message.type === 'connection') {
        callbacks.onConnection({
          status: message.status ?? 'disconnected', endpoint: message.endpoint ?? '',
          message: message.message ?? '', symbols: message.symbols ?? 0, missing: message.missing ?? [],
        });
      } else if (message.type === 'snapshot' && message.values) {
        callbacks.onSnapshot(message.values);
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
    close() {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    },
  };
}
