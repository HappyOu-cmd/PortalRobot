export interface FaultInjectionStatus {
  allowed: boolean;
  active: boolean;
  busy: boolean;
  resetAllowed: boolean;
  rejected: boolean;
  rejectSequence: number;
}

export interface SimulationSettings {
  machineCycle: [number, number, number];
  machineDoorOpen: number;
  machineDoorClose: number;
  machineChuckOpen: number;
  machineChuckClose: number;
  gripper1Open: number;
  gripper1Close: number;
  gripper2Open: number;
  gripper2Close: number;
  gripperChange: number;
}

export const DEFAULT_SIMULATION_SETTINGS: SimulationSettings = {
  machineCycle: [60, 60, 60],
  machineDoorOpen: 1,
  machineDoorClose: 1,
  machineChuckOpen: 1,
  machineChuckClose: 1,
  gripper1Open: 0.5,
  gripper1Close: 0.5,
  gripper2Open: 0.5,
  gripper2Close: 0.5,
  gripperChange: 0.7,
};

const STATUS_LEAVES = ['xAllowed', 'xActive', 'xBusy', 'xResetAllowed', 'xRejected', 'udiRejectSequence'];
const statusSymbols = (root: string) => STATUS_LEAVES.map((leaf) => `${root}.${leaf}`);

export const FAULT_SIMULATION_SYMBOLS = new Set([
  'xErrorSimulationEnable',
  'xErrorSimulationEnabled',
  'xSimulationAccelerationEnable',
  'xSimulationAccelerationActive',
  'xSimulationAccelerationChangeAllowed',
  'uiSimulationTimeFactor',
  'uiSimulationTimeFactorApplied',
  'xSimulationAccelerationError',
  'xSimAxisGroupErrorAllowed',
  'xSimGripper1Fault',
  'xSimGripper2Fault',
  'xSimGripperRotationFault',
  'xSimGripperGlobalFault',
  'tMachineDoorOpenTime',
  'tMachineDoorCloseTime',
  'tMachineChuckOpenTime',
  'tMachineChuckCloseTime',
  'tGripper1OpenTime',
  'tGripper1CloseTime',
  'tGripper2OpenTime',
  'tGripper2CloseTime',
  'tGripperChangeTime',
  ...[1, 2, 3].flatMap((index) => [
    `axMachineSimAlarm[${index}]`,
    `axMachineSimDoorFault[${index}]`,
    `axMachineSimChuckFault[${index}]`,
    `axMachineTimeoutRobotMove[${index}]`,
    `axMachineTimeoutRobotAction[${index}]`,
    `axMachineTimeoutRobotRelease[${index}]`,
    `axMachineTimeoutDoorOpen[${index}]`,
    `axMachineTimeoutDoorClose[${index}]`,
    `axMachineTimeoutChuckOpen[${index}]`,
    `axMachineTimeoutChuckClose[${index}]`,
    `axMachineTimeoutCycleStart[${index}]`,
    `tMachineCycleTime[${index}]`,
    ...statusSymbols(`astAxisFaultStatus[${index}]`),
    ...statusSymbols(`astMachineFaultStatus[${index}]`),
  ]),
  ...statusSymbols('stAxisGroupFaultStatus'),
  ...statusSymbols('stRobotFaultStatus'),
  ...statusSymbols('stCellFaultStatus'),
  ...statusSymbols('stGripperFaultStatus'),
  ...statusSymbols('stPointFaultStatus'),
  ...statusSymbols('stMagazineFaultStatus'),
]);

export function pickFaultSimulationValues(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(([path]) => FAULT_SIMULATION_SYMBOLS.has(path)),
  );
}

export function readBool(values: Record<string, unknown>, path: string, fallback = false) {
  const value = values[path];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value === 'true' || value === 'TRUE' || value === '1';
  return fallback;
}

export function readNumber(values: Record<string, unknown>, path: string, fallback = 0) {
  const value = Number(values[path]);
  return Number.isFinite(value) ? value : fallback;
}

function readOpcUaInt64(value: unknown) {
  if (Array.isArray(value) && value.length === 2) {
    const high = Number(value[0]);
    const low = Number(value[1]);
    if (Number.isInteger(high) && Number.isInteger(low) && high >= 0 && low >= 0) {
      return high * 0x100000000 + low;
    }
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function readTimeSeconds(values: Record<string, unknown>, path: string, fallback: number) {
  const milliseconds = readOpcUaInt64(values[path]);
  return Math.max(0, (milliseconds ?? fallback * 1000) / 1000);
}

export function readInjectionStatus(values: Record<string, unknown>, root: string): FaultInjectionStatus {
  return {
    allowed: readBool(values, `${root}.xAllowed`),
    active: readBool(values, `${root}.xActive`),
    busy: readBool(values, `${root}.xBusy`),
    resetAllowed: readBool(values, `${root}.xResetAllowed`),
    rejected: readBool(values, `${root}.xRejected`),
    rejectSequence: readNumber(values, `${root}.udiRejectSequence`),
  };
}

export function readSimulationSettings(values: Record<string, unknown>): SimulationSettings {
  return {
    machineCycle: [1, 2, 3].map((index) => readTimeSeconds(
      values,
      `tMachineCycleTime[${index}]`,
      DEFAULT_SIMULATION_SETTINGS.machineCycle[index - 1],
    )) as SimulationSettings['machineCycle'],
    machineDoorOpen: readTimeSeconds(values, 'tMachineDoorOpenTime', DEFAULT_SIMULATION_SETTINGS.machineDoorOpen),
    machineDoorClose: readTimeSeconds(values, 'tMachineDoorCloseTime', DEFAULT_SIMULATION_SETTINGS.machineDoorClose),
    machineChuckOpen: readTimeSeconds(values, 'tMachineChuckOpenTime', DEFAULT_SIMULATION_SETTINGS.machineChuckOpen),
    machineChuckClose: readTimeSeconds(values, 'tMachineChuckCloseTime', DEFAULT_SIMULATION_SETTINGS.machineChuckClose),
    gripper1Open: readTimeSeconds(values, 'tGripper1OpenTime', DEFAULT_SIMULATION_SETTINGS.gripper1Open),
    gripper1Close: readTimeSeconds(values, 'tGripper1CloseTime', DEFAULT_SIMULATION_SETTINGS.gripper1Close),
    gripper2Open: readTimeSeconds(values, 'tGripper2OpenTime', DEFAULT_SIMULATION_SETTINGS.gripper2Open),
    gripper2Close: readTimeSeconds(values, 'tGripper2CloseTime', DEFAULT_SIMULATION_SETTINGS.gripper2Close),
    gripperChange: readTimeSeconds(values, 'tGripperChangeTime', DEFAULT_SIMULATION_SETTINGS.gripperChange),
  };
}
