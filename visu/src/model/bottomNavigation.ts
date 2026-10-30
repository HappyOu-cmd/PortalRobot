import type { PlcAlarmSource } from '../plc/client';

export type BottomSection = 'cell' | 'machines' | 'robot' | 'magazine' | 'geometry';
export type BottomNavigationTarget =
  | { kind: 'control'; section: 'cell' | 'robot' }
  | { kind: 'control'; section: 'machines'; index: 0 | 1 | 2 }
  | { kind: 'control'; section: 'magazine'; index: 0 | 1 }
  | { kind: 'control'; section: 'geometry'; station: 1 | 2 };

export type NavigationIcon = BottomSection;

export interface NavigationEntry {
  id: string;
  label: string;
  icon: NavigationIcon;
  target: BottomNavigationTarget;
  sources: readonly PlcAlarmSource[];
  number?: number;
}

export interface NavigationFolder {
  key: BottomSection;
  label: string;
  caption: string;
  sources: readonly PlcAlarmSource[];
  entries: readonly NavigationEntry[];
}

const CELL_SOURCES: readonly PlcAlarmSource[] = ['cell', 'cell-safety', 'controller-cpu-1', 'controller-cpu-2', 'controller-modules'];
const ROBOT_SOURCES: readonly PlcAlarmSource[] = ['robot', 'axis-x', 'axis-y', 'axis-z', 'axis-group', 'motion-manager', 'point-manager', 'gripper'];

export const BOTTOM_NAV_FOLDERS: readonly NavigationFolder[] = [
  {
    key: 'cell', label: 'Линия', caption: 'Линия', sources: CELL_SOURCES,
    entries: [
      { id: 'cell-control', label: 'Управление', icon: 'cell', target: { kind: 'control', section: 'cell' }, sources: CELL_SOURCES },
    ],
  },
  {
    key: 'robot', label: 'Робот', caption: 'Робот', sources: ROBOT_SOURCES,
    entries: [
      { id: 'robot-control', label: 'Управление', icon: 'robot', target: { kind: 'control', section: 'robot' }, sources: ROBOT_SOURCES },
    ],
  },
  {
    key: 'machines', label: 'Станки', caption: 'Станки', sources: ['machine-1', 'machine-2', 'machine-3'],
    entries: [
      { id: 'machine-1', label: 'Станок 1', icon: 'machines', number: 1, target: { kind: 'control', section: 'machines', index: 0 }, sources: ['machine-1'] },
      { id: 'machine-2', label: 'Станок 2', icon: 'machines', number: 2, target: { kind: 'control', section: 'machines', index: 1 }, sources: ['machine-2'] },
      { id: 'machine-3', label: 'Станок 3', icon: 'machines', number: 3, target: { kind: 'control', section: 'machines', index: 2 }, sources: ['machine-3'] },
    ],
  },
  {
    key: 'magazine', label: 'Магазины', caption: 'Магазины', sources: ['magazine-1', 'magazine-2'],
    entries: [
      { id: 'magazine-1', label: 'Магазин 1', icon: 'magazine', number: 1, target: { kind: 'control', section: 'magazine', index: 0 }, sources: ['magazine-1'] },
      { id: 'magazine-2', label: 'Магазин 2', icon: 'magazine', number: 2, target: { kind: 'control', section: 'magazine', index: 1 }, sources: ['magazine-2'] },
    ],
  },
  {
    key: 'geometry', label: 'Геометрический контроль', caption: 'ГК', sources: ['geometry-1', 'geometry-2'],
    entries: [
      { id: 'geometry-1', label: 'ГК 1', icon: 'geometry', number: 1, target: { kind: 'control', section: 'geometry', station: 1 }, sources: ['geometry-1'] },
      { id: 'geometry-2', label: 'ГК 2', icon: 'geometry', number: 2, target: { kind: 'control', section: 'geometry', station: 2 }, sources: ['geometry-2'] },
    ],
  },
];
