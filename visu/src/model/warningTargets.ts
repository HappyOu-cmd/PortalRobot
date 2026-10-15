import type { InspectionNode, InspectionTarget } from './equipmentInspection';
import type { PlcAlarmEvent } from '../plc/client';
import type { CellState } from './types';

export type WarningEquipment = InspectionTarget | { kind: 'geometry'; index: number } | { kind: 'cell' }
  | { kind: 'enclosure-door'; id: import('./types').EnclosureDoorId };
export interface SceneWarningTarget {
  equipment: WarningEquipment;
  node: InspectionNode | 'grippers';
}

export function warningTargetKey({ equipment, node }: SceneWarningTarget): string {
  const id = 'index' in equipment ? equipment.index : 'id' in equipment ? equipment.id : 'side' in equipment ? equipment.side : '';
  return `${equipment.kind}:${id}:${node}`;
}

/** Presentation routing only. Never infer the rejected command's former target from current selection/status. */
export function sceneWarningTargets(events: readonly PlcAlarmEvent[], live: boolean): SceneWarningTarget[] {
  if (!live) return [];
  const result = new Map<string, SceneWarningTarget>();
  const add = (equipment: WarningEquipment, node: SceneWarningTarget['node'] = 'equipment') => {
    const target = { equipment, node };
    result.set(warningTargetKey(target), target);
  };
  for (const event of events) {
    if (!event.active || event.severity !== 'warning') continue;
    const { source, code } = event;
    if (/^machine-[123]$/.test(source)) {
      add({ kind: 'machine', index: Number(source.at(-1)) - 1 }, code === 7 ? 'chuck' : code === 9 ? 'door' : 'equipment');
    } else if (/^magazine-(?:axis-)?[12]$/.test(source)) {
      add({ kind: 'magazine', index: Number(source.at(-1)) - 1 });
    } else if (/^geometry-[12]$/.test(source)) {
      add({ kind: 'geometry', index: Number(source.at(-1)) - 1 });
    } else if (source === 'axis-x' || source === 'axis-y' || source === 'axis-z') {
      add({ kind: 'robot' }, source);
    } else if (source === 'gripper') {
      add({ kind: 'robot' }, code === 3 ? 'gripper-1' : code === 4 ? 'gripper-2' : code === 5 ? 'rotation' : 'grippers');
    } else if (source === 'robot' || source === 'axis-group' || source === 'motion-manager' || source === 'point-manager') {
      add({ kind: 'robot' }, source === 'robot' && code === 5 ? 'grippers' : 'equipment');
    } else if (source === 'cell-safety') {
      const doors = ['magazine-1-front', 'magazine-1-rear', 'magazine-2-front', 'magazine-2-rear'] as const;
      if (code >= 2 && code <= 5) add({ kind: 'enclosure-door', id: doors[code - 2] });
      else add({ kind: 'cabinet', side: 'rear' }, code === 1 ? 'safety-relay' : 'equipment');
    } else if (source === 'cell' && code === 52) {
      // W52 keeps the exact PLC-selected stations through xCallWaitWarning.
      continue;
    } else if (source === 'cell' && (code === 15 || code === 16 || code === 29)) {
      add({ kind: 'robot' }, code === 15 ? 'gripper-1' : 'gripper-2');
    } else if (source === 'cell' && (code === 2 || code === 10)) {
      add({ kind: 'robot' });
    } else if (source === 'cell' && [3, 18, 25, 30].includes(code)) {
      add({ kind: 'magazine', index: 0 });
      add({ kind: 'magazine', index: 1 });
    } else if (source === 'cell' && [19, 20, 24, 26].includes(code)) {
      for (const index of [0, 1, 2]) add({ kind: 'machine', index });
    } else if (source === 'cell' && code === 23) {
      for (const index of [0, 1, 2]) add({ kind: 'machine', index });
      for (const index of [0, 1]) add({ kind: 'magazine', index });
    } else if (source === 'cell' && [50, 51].includes(code)) {
      // These CELL events identify the family, but contain no individual station ID.
      for (const index of [0, 1]) add({ kind: 'geometry', index });
    } else {
      // The journal has no station/slot/command context for these warnings.
      add({ kind: 'cell' });
    }
  }
  return [...result.values()];
}

/** A warning must never paint over a red alarm on the same equipment. */
export function warningTargetHasAlarm(equipment: WarningEquipment, state: CellState, events: readonly PlcAlarmEvent[]): boolean {
  const active = (source: string, code?: number) => events.some(event => event.active && event.severity === 'alarm'
    && event.source === source && (code === undefined || event.code === code));
  switch (equipment.kind) {
    case 'machine': {
      const machine = state.machines[equipment.index];
      return active(`machine-${equipment.index + 1}`) || !!machine && (machine.alarm || machine.mode === 'error' || machine.activeErrors.length > 0);
    }
    case 'magazine': {
      const magazine = state.magazines[equipment.index]?.state;
      return active(`magazine-${equipment.index + 1}`) || active(`magazine-axis-${equipment.index + 1}`)
        || !!magazine && (magazine.error || magazine.activeErrors.length > 0);
    }
    case 'robot': return state.robot.error || ['robot', 'axis-x', 'axis-y', 'axis-z', 'axis-group', 'motion-manager', 'point-manager', 'gripper'].some(source => active(source));
    case 'geometry': {
      const station = state.geometryControl?.stations[equipment.index];
      return active(`geometry-${equipment.index + 1}`) || !!station && (station.error || station.driveAlarm || station.state === 6);
    }
    case 'enclosure-door': {
      const ids = ['magazine-1-front', 'magazine-1-rear', 'magazine-2-front', 'magazine-2-rear'];
      const index = ids.indexOf(equipment.id);
      return active('cell-safety', 10 + index) || state.magazines[index < 2 ? 0 : 1].state.enabled && !state.enclosureDoors[equipment.id].locked;
    }
    case 'cabinet': return state.controlCabinets[equipment.side].emergencyStopPressed
      || active('cell-safety', equipment.side === 'front' ? 4 : 5)
      || equipment.side === 'rear' && (state.controlCabinets.rear.phaseRelayFault || state.controlCabinets.rear.safetyRelayFault
        || active('cell-safety', 7) || active('cell-safety', 9));
    case 'air': return state.controlCabinets.airPreparation.lowPressure || active('cell-safety', 8);
    case 'station': {
      const ids = ['magazine-1-front', 'magazine-1-rear', 'magazine-2-front', 'magazine-2-rear'];
      return state.buttonStations[equipment.id].emergencyStopPressed || active('cell-safety', ids.indexOf(equipment.id));
    }
    case 'cell': return false;
  }
}
