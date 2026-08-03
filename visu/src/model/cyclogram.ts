export type CyclogramLaneId = 'robot' | 'machine-1' | 'machine-2' | 'machine-3';
export type CyclogramActivityCategory = 'robot-active' | 'robot-idle' | 'machine-processing' | 'machine-idle' | 'no-data';

export interface CyclogramLane {
  id: CyclogramLaneId;
  label: string;
  kind: 'robot' | 'machine';
}

export interface CyclogramInterval {
  id: number;
  lane: CyclogramLaneId;
  activityId: string;
  label: string;
  category: CyclogramActivityCategory;
  startMs: number;
  endMs: number | null;
  lastSeenMs: number;
}

export interface CyclogramHistory {
  serverTime: number;
  retentionMs: number;
  intervals: CyclogramInterval[];
}

export interface CyclogramUpdate {
  serverTime: number;
  closed: CyclogramInterval[];
  opened: CyclogramInterval[];
}

export const CYCLOGRAM_LANES: CyclogramLane[] = [
  { id: 'robot', label: 'Робот', kind: 'robot' },
  { id: 'machine-1', label: 'Станок 1', kind: 'machine' },
  { id: 'machine-2', label: 'Станок 2', kind: 'machine' },
  { id: 'machine-3', label: 'Станок 3', kind: 'machine' },
];

export const CYCLOGRAM_CATEGORY_COLORS: Record<CyclogramActivityCategory, { fill: string; text: string }> = {
  'robot-active': { fill: 'rgba(44, 126, 235, .24)', text: '#075ac5' },
  'robot-idle': { fill: 'rgba(130, 145, 156, .22)', text: '#53636f' },
  'machine-processing': { fill: 'rgba(81, 184, 77, .27)', text: '#167337' },
  'machine-idle': { fill: 'rgba(218, 75, 82, .20)', text: '#a52f36' },
  'no-data': { fill: 'rgba(179, 191, 200, .22)', text: '#74848f' },
};

export function isVisibleCyclogramInterval(interval: CyclogramInterval): boolean {
  return interval.endMs === null
    || interval.lane !== 'robot'
    || !interval.activityId.startsWith('work-machine-')
    || interval.endMs - interval.startMs >= 1_000;
}

export function mergeCyclogramUpdate(current: CyclogramHistory, update: CyclogramUpdate): CyclogramHistory {
  const closedById = new Map(update.closed.map((interval) => [interval.id, interval]));
  const existing = current.intervals.map((interval) => closedById.get(interval.id) ?? interval);
  const opened = update.opened
    .sort((left, right) => left.startMs - right.startMs || left.id - right.id);
  return {
    ...current,
    serverTime: update.serverTime,
    intervals: opened.length > 0 ? [...existing, ...opened] : existing,
  };
}
