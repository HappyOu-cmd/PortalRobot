import type { CellState, EnclosureDoorId } from './types';
import type { PlcAlarmEvent, PlcAlarmSource, PlcAlarmSeverity, PlcAlarmEffect, CellLogEvent } from '../plc/client';

export type InspectionTarget =
  | { kind: 'machine' | 'magazine'; index: number }
  | { kind: 'robot' | 'air' }
  | { kind: 'cabinet'; side: 'front' | 'rear' }
  | { kind: 'station'; id: EnclosureDoorId };
export type InspectionNode = 'equipment' | 'door' | 'hatch' | 'hatch-lock' | 'chuck' | 'axis-x' | 'axis-y' | 'axis-z'
  | 'gripper-1' | 'gripper-2' | 'rotation' | 'cassette' | 'slot' | 'emergency-stop' | 'phase-relay' | 'safety-relay' | 'pressure';
export interface EquipmentIssue {
  key: string;
  title: string;
  node: InspectionNode;
  severity: PlcAlarmSeverity;
  effect?: PlcAlarmEffect;
  source?: PlcAlarmSource;
  code?: number;
  sequence?: number;
  observedAt?: number;
  origin: 'plc' | 'feedback' | 'local';
}
export interface EquipmentInspection {
  target: InspectionTarget;
  issues: EquipmentIssue[];
  selectedNode: InspectionNode | null;
  xray: boolean;
}
export const NODE_LABELS: Record<InspectionNode, string> = {
  equipment: 'Оборудование', door: 'Операторская дверь', hatch: 'Роботный люк', 'hatch-lock': 'Замок двери / люка', chuck: 'Патрон',
  'axis-x': 'Привод X', 'axis-y': 'Привод Y', 'axis-z': 'Привод Z',
  'gripper-1': 'Захват 1', 'gripper-2': 'Захват 2', rotation: 'Поворот захватов',
  cassette: 'Кассета', slot: 'Рабочая ячейка', 'emergency-stop': 'Аварийная кнопка',
  'phase-relay': 'Контроль фаз', 'safety-relay': 'Реле безопасности', pressure: 'Контроль давления',
};
export const inspectionKey = (target: InspectionTarget): string => {
  if ('index' in target) return `${target.kind}:${target.index}`;
  if (target.kind === 'station') return `station:${target.id}`;
  if (target.kind === 'cabinet') return `cabinet:${target.side}`;
  return target.kind;
};
export const inspectionTitle = (target: InspectionTarget): string => {
  switch (target.kind) {
    case 'machine': return `Станок ${target.index + 1}`;
    case 'magazine': return `Магазин ${target.index + 1}`;
    case 'robot': return 'Портальный робот';
    case 'air': return 'Воздухоподготовка';
    case 'cabinet': return target.side === 'front' ? 'Шкаф оператора' : 'Шкаф управления';
    case 'station': return `Аварийный пост · магазин ${target.id.includes('-1-') ? 1 : 2} · ${target.id.endsWith('front') ? 'спереди' : 'сзади'}`;
  }
};
export const INSPECTION_TARGETS: InspectionTarget[] = [
  ...[0, 1, 2].map((index): InspectionTarget => ({ kind: 'machine', index })),
  { kind: 'robot' }, ...[0, 1].map((index): InspectionTarget => ({ kind: 'magazine', index })),
  { kind: 'cabinet', side: 'front' }, { kind: 'cabinet', side: 'rear' }, { kind: 'air' },
  ...(['magazine-1-front', 'magazine-1-rear', 'magazine-2-front', 'magazine-2-rear'] as const)
    .map((id): InspectionTarget => ({ kind: 'station', id })),
];
export function equipmentSources(target: InspectionTarget): PlcAlarmSource[] {
  if (target.kind === 'machine') return [`machine-${target.index + 1}` as PlcAlarmSource];
  if (target.kind === 'magazine') return [`magazine-${target.index + 1}` as PlcAlarmSource];
  if (target.kind === 'robot') return ['robot', 'axis-x', 'axis-y', 'axis-z', 'axis-group', 'motion-manager', 'point-manager', 'gripper'];
  return [];
}
// Numeric positions are the existing journal contract, including two legacy slots.
const JOURNAL_SOURCES: PlcAlarmSource[] = ['cell', 'robot', 'machine-1', 'machine-2', 'machine-3',
  'magazine-1', 'magazine-2', 'magazine-axis-1', 'magazine-axis-2', 'axis-x', 'axis-y', 'axis-z',
  'axis-group', 'motion-manager', 'point-manager', 'gripper', 'cell-safety'];
export function equipmentHistoryPrefixes(target: InspectionTarget): string[] {
  const sources = equipmentSources(target);
  return sources.length ? sources.map((source) => `${JOURNAL_SOURCES.indexOf(source)}:`)
    : [`io:${inspectionKey(target)}:`];
}
export function equipmentHistoryMatches(target: InspectionTarget, event: CellLogEvent): boolean {
  return ['alarm', 'equipment-diagnostic'].includes(event.eventType) && event.status === 'active'
    && equipmentHistoryPrefixes(target).some((prefix) => event.code?.startsWith(prefix));
}
export function alarmNode(source: PlcAlarmSource, code: number, severity: PlcAlarmSeverity = 'alarm'): InspectionNode {
  // Warnings have a separate code space: W4 must never be treated as alarm bit 4.
  if (severity !== 'alarm') return 'equipment';
  if (source.startsWith('machine-')) {
    if ([24, 25].includes(code)) return 'hatch-lock';
    if ([4, 5, 13, 18, 19].includes(code)) return 'hatch';
    if ([6, 7, 10, 20, 21].includes(code)) return 'chuck';
    if (code === 23) return 'door';
  }
  if (source === 'axis-x' || source === 'axis-y' || source === 'axis-z') return source;
  if (source === 'gripper') return (['gripper-1', 'gripper-2', 'rotation'] as const)[code] ?? 'equipment';
  if (source === 'cell-safety') {
    if (code <= 6) return 'emergency-stop';
    if (code === 7) return 'phase-relay';
    if (code === 8) return 'pressure';
    if (code === 9) return 'safety-relay';
    if (code >= 10 && code <= 13) return 'hatch-lock';
  }
  if (source.startsWith('magazine-')) return code === 4 ? 'slot' : [1, 2, 3, 7].includes(code) ? 'cassette' : 'equipment';
  return 'equipment';
}
export function equipmentNodes(target: InspectionTarget): InspectionNode[] {
  switch (target.kind) {
    case 'machine': return ['door', 'hatch', 'hatch-lock', 'chuck'];
    case 'robot': return ['axis-x', 'axis-y', 'axis-z', 'gripper-1', 'gripper-2', 'rotation'];
    case 'magazine': return ['cassette', 'slot'];
    case 'station': return ['emergency-stop', 'hatch-lock'];
    case 'cabinet': return target.side === 'rear' ? ['emergency-stop', 'phase-relay', 'safety-relay'] : ['emergency-stop'];
    case 'air': return ['pressure'];
  }
}
export function equipmentIssues(target: InspectionTarget, events: PlcAlarmEvent[], state: CellState, live: boolean,
  alarmTexts: Partial<Record<PlcAlarmSource, string[]>>): EquipmentIssue[] {
  const sources = equipmentSources(target);
  const issues: EquipmentIssue[] = events.filter((event) => event.active && sources.includes(event.source)).map((event) => ({
    key: `plc:${event.id}`, title: event.text, node: alarmNode(event.source, event.code, event.severity),
    severity: event.severity, effect: event.effect, source: event.source, code: event.code,
    sequence: event.id, observedAt: event.reportedAt, origin: 'plc',
  }));
  const add = (key: string, title: string, node: InspectionNode, origin: EquipmentIssue['origin'] = live ? 'feedback' : 'local') => {
    issues.push({ key, title, node, severity: 'alarm', origin });
  };
  const addSafety = (key: string, title: string, node: InspectionNode, code: number) => {
    issues.push({ key, title, node, severity: 'alarm', effect: 'global-stop', source: 'cell-safety', code,
      origin: live ? 'feedback' : 'local' });
  };
  const mechanism = target.kind === 'machine' ? state.machines[target.index]
    : target.kind === 'magazine' ? state.magazines[target.index]?.state : null;
  if (mechanism) {
    for (const title of mechanism.activeErrors) {
      if (issues.some((issue) => issue.title === title)) continue;
      const source = sources[0];
      const code = alarmTexts[source]?.indexOf(title) ?? -1;
      if (code >= 0 && issues.some((issue) => issue.source === source && issue.code === code && issue.severity === 'alarm')) continue;
      issues.push({ key: `state:${title}`, title, node: code >= 0 ? alarmNode(source, code) : 'equipment',
        severity: 'alarm', source, code: code >= 0 ? code : undefined, origin: live ? 'feedback' : 'local' });
    }
    const failed = 'alarm' in mechanism ? mechanism.alarm || mechanism.mode === 'error' : mechanism.error;
    if (failed && !issues.some((issue) => issue.severity === 'alarm')) add('state:error', 'Оборудование сообщает аварию без детализации', 'equipment');
  }
  if (target.kind === 'robot' && state.robot.error && !issues.some((issue) => issue.severity === 'alarm')) add('robot:error', 'Робот сообщает аварию без детализации', 'equipment');
  if (target.kind === 'station') {
    const stationIds: EnclosureDoorId[] = ['magazine-1-front', 'magazine-1-rear', 'magazine-2-front', 'magazine-2-rear'];
    const stationIndex = stationIds.indexOf(target.id);
    if (state.buttonStations[target.id].emergencyStopPressed) addSafety('emergency-stop', 'Нажата аварийная кнопка', 'emergency-stop', stationIndex);
    const magazineIndex = stationIndex < 2 ? 0 : 1;
    if (state.magazines[magazineIndex].state.enabled && !state.enclosureDoors[target.id].locked) {
      addSafety('door-lock', `Замок двери ${stationIndex + 1} открыт при включённом магазине ${magazineIndex + 1}`, 'hatch-lock', 10 + stationIndex);
    }
  }
  if (target.kind === 'cabinet') {
    if (state.controlCabinets[target.side].emergencyStopPressed) addSafety('emergency-stop', 'Нажата аварийная кнопка', 'emergency-stop', target.side === 'front' ? 4 : 5);
    if (target.side === 'rear' && state.controlCabinets.rear.phaseRelayFault) addSafety('phase-relay', 'Неисправность контроля фаз', 'phase-relay', 7);
    if (target.side === 'rear' && state.controlCabinets.rear.safetyRelayFault) addSafety('safety-relay', 'Реле безопасности не взведено', 'safety-relay', 9);
  }
  if (target.kind === 'air' && state.controlCabinets.airPreparation.lowPressure) addSafety('pressure', 'Реле контроля давления не в норме', 'pressure', 8);
  if (target.kind === 'magazine' && inspectionSlot(state, target) === null) {
    for (const issue of issues) if (issue.node === 'slot') issue.node = 'cassette';
  }
  return issues.sort((a, b) => Number(a.severity === 'warning') - Number(b.severity === 'warning'));
}

/** PLC slots are one-based. Never colour a guessed cell for CHANGE or an invalid index. */
export function inspectionSlot(state: CellState, target: InspectionTarget): number | null {
  if (target.kind !== 'magazine') return null;
  const magazine = state.magazines[target.index];
  if (!magazine) return null;
  const { actualOperation, selectedBlank, selectedFreeSlot } = magazine.state;
  const slot = actualOperation === 'TAKE' ? selectedBlank
    : actualOperation === 'PUT' || actualOperation === 'RETURN_BLANK' ? selectedFreeSlot : 0;
  return Number.isInteger(slot) && slot > 0 && slot <= magazine.slots.length ? slot - 1 : null;
}
