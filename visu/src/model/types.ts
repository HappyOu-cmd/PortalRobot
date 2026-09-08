export type Direction = 1 | -1;
export type SlotType = 'empty' | 'blank' | 'detail';
export type ProductType = 1 | 2 | 3;
export type PayloadProductType = 0 | ProductType;
export type MachineMode = 'off' | 'enabled' | 'processing' | 'change' | 'error';
export type MachineOperation = 'NONE' | 'LOAD' | 'UNLOAD' | 'CHANGE';
export type MachinePartState = 'EMPTY' | 'LOADED' | 'UNKNOWN';
export type MachinePartType = 'UNKNOWN' | 'BLANK' | 'DETAIL';
export type MagazineOperation = 'NONE' | 'PUT' | 'TAKE' | 'CHANGE' | 'RETURN_BLANK';
export interface Vec3Mm {
  x: number;
  y: number;
  z: number;
}

export interface RobotCoordinateFrame {
  sequence: number;
  timestampMs: number;
  sourceTimestampMs: number;
  coordinates: Vec3Mm;
}

export interface CoordinateConfig {
  origin: Vec3Mm;
  direction: { x: Direction; y: Direction; z: Direction };
}

export interface MachineLayout {
  position: Vec3Mm;
}

export interface PartGeometryLayout {
  diameter: number;
  length: number;
}

export interface PartMaterialLayout {
  color: string;
  opacity: number;
}

export interface ProductPartMaterials {
  blank: PartMaterialLayout;
  detail: PartMaterialLayout;
}

export interface GripperPayloadPoseLayout {
  offset: Vec3Mm;
  rotationDeg: Vec3Mm;
}

export interface StaticMagazineLayout {
  position: Vec3Mm;
  pitchX: number;
  pitchY: number;
  workingHeight: number;
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
  partGeometry: PartGeometryLayout;
  productPartMaterials: [ProductPartMaterials, ProductPartMaterials, ProductPartMaterials];
  gripperPayloadPose: GripperPayloadPoseLayout;
  staticMagazines: StaticMagazineLayout[];
  animation: {
    motionResponse: number;
    mechanismResponse: number;
  };
}

export interface MachineState {
  productType: ProductType;
  plcState: number;
  enabled: boolean;
  alarm: boolean;
  disablePending: boolean;
  powerAllowed: boolean;
  resetAllowed: boolean;
  manualControlAllowed: boolean;
  manualDoorOpenAllowed: boolean;
  manualDoorCloseAllowed: boolean;
  manualHatchOpenAllowed: boolean;
  manualHatchCloseAllowed: boolean;
  manualChuckOpenAllowed: boolean;
  manualChuckCloseAllowed: boolean;
  doorOpen: boolean;
  doorClosed: boolean;
  hatchOpen: boolean;
  hatchClosed: boolean;
  chuckOpen: boolean;
  chuckClosed: boolean;
  partPresent: boolean;
  partReady: boolean;
  mode: MachineMode;
  currentStep: string;
  serviceRequired: boolean;
  canAcceptService: boolean;
  recommendedOperation: MachineOperation;
  actualOperation: MachineOperation;
  partState: MachinePartState;
  partType: MachinePartType;
  cycleExpectedS: number;
  cycleElapsedS: number;
  cycleRemainingS: number;
  measuredCycleS: number;
  useHmiCycleTime: boolean;
  cycleOvertime: boolean;
  activeErrors: string[];
  lastErrors: string[];
}

export interface RobotState {
  currentPoint: number;
  x: number;
  y: number;
  z: number;
  busy: boolean;
  done: boolean;
  error: boolean;
  powerAllowed: boolean;
  stopAllowed: boolean;
  resetAllowed: boolean;
  blankProductType: PayloadProductType;
  detailProductType: PayloadProductType;
  blankAvailable: boolean;
  detailAvailable: boolean;
  gripper1Open: boolean;
  gripper1Closed: boolean;
  gripper2Open: boolean;
  gripper2Closed: boolean;
  rotatedToBlank: boolean;
  rotatedToDetail: boolean;
}

export interface MagazineState {
  enabled: boolean;
  disablePending: boolean;
  ready: boolean;
  busy: boolean;
  done: boolean;
  error: boolean;
  finished: boolean;
  canTake: boolean;
  canPut: boolean;
  canChange: boolean;
  canEnable: boolean;
  powerAllowed: boolean;
  enableSequenceAllowed: boolean;
  enableCheckRobotReady: boolean;
  enableCheckNoError: boolean;
  enableCheckRobotReleased: boolean;
  enableCheckContent: boolean;
  enableCheckGeometry: boolean;
  fillAllowed: boolean;
  clearAllowed: boolean;
  editAllowed: boolean;
  pitchEditAllowed: boolean;
  currentBlank: number;
  currentFreeSlot: number;
  selectedBlank: number;
  selectedFreeSlot: number;
  actualOperation: MagazineOperation;
  rows: number;
  columns: number;
  pitchX: number;
  pitchY: number;
  safeAbove: number;
  safeInside: number;
  activeErrors: string[];
  lastErrors: string[];
}

export interface MagazineData {
  slots: SlotType[];
  productTypes: ProductType[];
  state: MagazineState;
}

export interface CellState {
	robot: RobotState;
  machines: MachineState[];
  magazines: [MagazineData, MagazineData];
}
