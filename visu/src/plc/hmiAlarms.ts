import { ALARM_EFFECT_LABELS, ALARM_SOURCE_LABELS, type PlcAlarmEvent, type PlcAlarmSource } from './client';
import type { ControllerAlarmEvent, ControllerDiagnostics } from './controllerDiagnostics';
import alarmCatalog from '../../alarm-catalog.json';

export type HmiAlarmEvent = PlcAlarmEvent | ControllerAlarmEvent;

export const hasResettablePlcWarnings = (events: HmiAlarmEvent[], controllerWarningResetAllowed: boolean) => events.some((event) =>
  event.source !== 'controller' && event.active && event.severity === 'warning'
  && (event.source !== 'controller-cpu-1' || controllerWarningResetAllowed));

export const hmiAlarmSourceLabel = (event: HmiAlarmEvent) => event.source === 'controller'
  ? 'Контроллер (HMI)' : ALARM_SOURCE_LABELS[event.source];

export const hmiAlarmEffectLabel = (event: HmiAlarmEvent) => event.effect === 'notification'
  ? controllerPlcAlarmKey(event.code) ? 'Диагностика контроллера · передаётся в PLC' : 'Уведомление HMI · без команды останова'
  : ALARM_EFFECT_LABELS[event.effect];

export function controllerPlcAlarmKey(code: string | number): { source: PlcAlarmSource; code: number; severity: 'alarm' | 'warning' } | null {
  if (typeof code !== 'string') return null;
  const parts = code.split(':');
  const mapping = alarmCatalog.controllerDiagnostics;
  if (parts[0] !== 'controller') return null;
  if (parts[1] === 'led') {
    const cpuCode = code.slice('controller:led:'.length);
    if (cpuCode === 'unknown' || cpuCode === '00') return null;
    if (cpuCode === '5C') return { source: mapping.cpuSources[0] as PlcAlarmSource, code: mapping.memoryWarningCode, severity: 'warning' };
    let index = mapping.cpuAlarmCodes.indexOf(cpuCode);
    if (index < 0) index = mapping.cpuAlarmCodes.indexOf('*');
    return { source: mapping.cpuSources[Math.floor(index / 32)] as PlcAlarmSource, code: index % 32, severity: 'alarm' };
  }
  if (parts[1] === 'module' && parts.length === 4) {
    const error = Number(parts[3]);
    if (Number.isInteger(error) && error > 0) return { source: mapping.moduleSource as PlcAlarmSource, code: error <= 5 ? error - 1 : 5, severity: 'alarm' };
  }
  return null;
}

export function controllerAlarmEvents(controller: ControllerDiagnostics | undefined, gatewayAvailable: boolean, plcEvents: PlcAlarmEvent[] = []): ControllerAlarmEvent[] {
  return (controller?.alarms ?? []).filter((event) => {
    const key = controllerPlcAlarmKey(event.code);
    return !key || !plcEvents.some((plc) => plc.active && plc.source === key.source && plc.code === key.code && plc.severity === key.severity);
  }).map((event) => !gatewayAvailable && event.active ? { ...event, stale: true } : event);
}

const isNewerAlarmEvent = (candidate: HmiAlarmEvent, current: HmiAlarmEvent) =>
  candidate.reportedAt > current.reportedAt
  || (candidate.reportedAt === current.reportedAt && (typeof candidate.id === 'number' && typeof current.id === 'number'
    ? candidate.id > current.id : String(candidate.id) > String(current.id)));

export const selectLatestActiveEvent = (events: HmiAlarmEvent[]) => events.reduce<HmiAlarmEvent | null>((selected, event) => {
  if (!event.active) return selected;
  if (!selected) return event;
  if (event.severity !== selected.severity) return event.severity === 'alarm' ? event : selected;
  return isNewerAlarmEvent(event, selected) ? event : selected;
}, null);

export const selectNewestReceivedEvent = (events: HmiAlarmEvent[]) => events.reduce<HmiAlarmEvent | null>((selected, event) => (
  !selected || isNewerAlarmEvent(event, selected) ? event : selected
), null);

export const alarmEventIdentity = (event: HmiAlarmEvent | null) => event
  ? `${event.id}:${event.severity}:${event.effect}:${event.source}:${event.code}:${event.reportedAt}` : '';
