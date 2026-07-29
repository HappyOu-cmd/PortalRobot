export type Direction = 1 | -1;
export type SlotType = 'empty' | 'blank' | 'detail';
export type MachineMode = 'idle' | 'processing' | 'waiting' | 'error';
export type MachineOperation = 'NONE' | 'LOAD' | 'UNLOAD' | 'CHANGE';
export type MachinePartState = 'EMPTY' | 'LOADED' | 'UNKNOWN';

export interface Vec3Mm {
  x: number;
  y: number;
  z: number;
}

export interface CoordinateConfig {
  origin: Vec3Mm;
  direction: { x: Direction; y: Direction; z: Direction };
}

export interface MachineLayout {
  position: Vec3Mm;
}

export interface CellLayout {
  coordinate: CoordinateConfig;
  floor: { lengthX: number; widthY: number };
  machine: {
    sizeX: number;
    sizeY: number;
    sizeZ: number;
    doorTravel: number;
    machines: MachineLayout[];
  };
  portal: {
    position: Vec3Mm;
    lengthX: number;
    widthY: number;
    frameThicknessZ: number;
    frameDepthY: number;
    frameBottomZ: number;
    supportSize: number;
    supportInsetX: number;
  };
  robot: {
    yBeamHeight: number;
    yBeamWidthX: number;
    zBaseLength: number;
    zColumnWidth: number;
  };
  magazine: {
    position: Vec3Mm;
    sizeX: number;
    sizeY: number;
    sizeZ: number;
    columnsX: number;
    rowsY: number;
    slotDiameter: number;
  };
  animation: {
    motionResponse: number;
    mechanismResponse: number;
  };
}

export interface MachineState {
  enabled: boolean;
  disablePending: boolean;
  doorOpen: boolean;
  doorClosed: boolean;
  chuckOpen: boolean;
  chuckClosed: boolean;
  partPresent: boolean;
  mode: MachineMode;
  currentStep: string;
  serviceRequired: boolean;
  canAcceptService: boolean;
  recommendedOperation: MachineOperation;
  actualOperation: MachineOperation;
  partState: MachinePartState;
  cycleExpectedS: number;
  cycleElapsedS: number;
  measuredCycleS: number;
  useHmiCycleTime: boolean;
  cycleOvertime: boolean;
  activeErrors: string[];
  lastErrors: string[];
}

export interface RobotState {
  x: number;
  y: number;
  z: number;
  gripper1Closed: boolean;
  gripper2Closed: boolean;
  rotatedToBlank: boolean;
  rotatedToDetail: boolean;
}

export interface CellState {
  robot: RobotState;
  machines: MachineState[];
  magazine: SlotType[];
}
