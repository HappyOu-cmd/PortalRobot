import type { PartGeometryLayout, ProductPartMaterials } from './types';

export const DEFAULT_PART_GEOMETRY: PartGeometryLayout = {
  blankDiameter: 50,
  blankLength: 80,
  detailBodyDiameter: 46,
  detailBodyLength: 90,
  detailShoulderDiameter: 54,
  detailShoulderLength: 30,
  detailShoulderOffset: 35,
};

export const DEFAULT_PRODUCT_PART_MATERIALS: [ProductPartMaterials, ProductPartMaterials, ProductPartMaterials] = [
  { blank: { color: '#9fc3df', opacity: 1 }, detail: { color: '#24689a', opacity: 1 } },
  { blank: { color: '#c0acd8', opacity: 1 }, detail: { color: '#70489b', opacity: 1 } },
  { blank: { color: '#91cdc3', opacity: 1 }, detail: { color: '#217a70', opacity: 1 } },
];
