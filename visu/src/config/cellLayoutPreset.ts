import type { CellLayout } from '../model/types';

// Эталонная геометрия ячейки. Этот файл хранится в Git и используется как
// восстановимый источник настроек при первом запуске и миграциях localStorage.
export const CELL_LAYOUT_PRESET: CellLayout = {
  coordinate: {
    origin: { x: 0, y: 40, z: -200 },
    direction: { x: 1, y: 1, z: 1 },
  },
  floor: { lengthX: 13200, widthY: 3900 },
  machine: {
    sizeX: 3680,
    sizeY: 1670,
    sizeZ: 2080,
    doorTravel: 1120,
    machines: [
      { position: { x: 0, y: 1450, z: 0 } },
      { position: { x: 4900, y: 1450, z: 0 } },
      { position: { x: 9800, y: 1450, z: 0 } },
    ],
  },
  portal: {
    position: { x: -260, y: 1710, z: 0 },
    lengthX: 14050,
    widthY: 1950,
    frameThicknessZ: 120,
    frameDepthY: 110,
    frameBottomZ: 3000,
    supportSize: 180,
    supportInsetX: 180,
  },
  robot: {
    yBeamHeight: 190,
    yBeamWidthX: 300,
    zBaseLength: 520,
    zColumnWidth: 120,
  },
  partGeometry: {
    diameter: 39,
    length: 70,
  },
  productPartMaterials: [
    { blank: { color: '#9fc3df', opacity: 1 }, detail: { color: '#24689a', opacity: 1 } },
    { blank: { color: '#c0acd8', opacity: 1 }, detail: { color: '#70489b', opacity: 1 } },
    { blank: { color: '#c84d5a', opacity: 1 }, detail: { color: '#217a70', opacity: 1 } },
  ],
  gripperPayloadPose: {
    offset: { x: -12, y: 0, z: 37 },
    rotationDeg: { x: 0, y: 0, z: 0 },
  },
  staticMagazines: [
    {
      position: { x: 4210, y: 1950, z: 0 },
      pitchX: 60,
      pitchY: 60,
      workingHeight: 820,
    },
    {
      position: { x: 9210, y: 1950, z: 0 },
      pitchX: 60,
      pitchY: 60,
      workingHeight: 820,
    },
  ],
  animation: {
    motionResponse: 7,
    mechanismResponse: 6,
  },
};
