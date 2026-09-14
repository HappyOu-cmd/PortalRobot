import type { EnclosureDoorState, EnclosureDoorStates } from './types';

export const ENCLOSURE_DOORS = [
  { id: 'magazine-1-front', magazine: 0, side: 'front', label: 'Магазин 1 · передняя дверь' },
  { id: 'magazine-1-rear', magazine: 0, side: 'rear', label: 'Магазин 1 · задняя дверь' },
  { id: 'magazine-2-front', magazine: 1, side: 'front', label: 'Магазин 2 · передняя дверь' },
  { id: 'magazine-2-rear', magazine: 1, side: 'rear', label: 'Магазин 2 · задняя дверь' },
] as const;

export const DEFAULT_ENCLOSURE_DOORS: EnclosureDoorStates = {
  'magazine-1-front': { closed: true, locked: true },
  'magazine-1-rear': { closed: true, locked: true },
  'magazine-2-front': { closed: true, locked: true },
  'magazine-2-rear': { closed: true, locked: true },
};

export const isEnclosureDoorUnsecured = (door: EnclosureDoorState, magazineEnabled: boolean): boolean =>
  magazineEnabled && !door.locked;
