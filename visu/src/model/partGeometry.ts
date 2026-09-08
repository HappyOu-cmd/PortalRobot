import type { PartGeometryLayout, ProductPartMaterials } from './types';
import { CELL_LAYOUT_PRESET } from '../config/cellLayoutPreset';

export const DEFAULT_PART_GEOMETRY: PartGeometryLayout = structuredClone(CELL_LAYOUT_PRESET.partGeometry);

export const DEFAULT_PRODUCT_PART_MATERIALS: [ProductPartMaterials, ProductPartMaterials, ProductPartMaterials] = structuredClone(CELL_LAYOUT_PRESET.productPartMaterials);
