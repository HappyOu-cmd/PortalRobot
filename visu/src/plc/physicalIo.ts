import map from '../../../DOKS/22-physical-io-map.json' with { type: 'json' };

export interface PhysicalIoSignal {
  direction: 'DI' | 'DO';
  index: number;
  category: string;
  label: string;
  variable: string;
  address: string;
  terminal: string;
  installed: boolean;
  unbound: boolean;
}

export interface PhysicalIoEvent {
  sequence: number;
  timeMs: number;
  timestampMs: number;
  direction: 'DI' | 'DO';
  index: number;
  kind: number;
  oldValue: boolean;
  newValue: boolean;
}

export interface PhysicalIoState {
  available: boolean;
  observedAt: number | null;
  epoch: number;
  sequence: number;
  clockMs: number;
  allowed: boolean;
  blockReason: number;
  doAllowed: boolean;
  doBlockReason: number;
  manualActive: boolean;
  manualStartAllowed: boolean;
  emergencyActive: boolean;
  emergencyResetAllowed: boolean;
  mappingVerified: boolean;
  rawDi: boolean[];
  usedDi: boolean[];
  forcedDi: boolean[];
  outputs: boolean[];
  allowedDo: boolean[];
  allowedDoOn: boolean[];
  forcedDo: boolean[];
  inhibitedDo: boolean[];
  history: PhysicalIoEvent[];
  error?: string;
  archiveError?: string;
}

export const INITIAL_PHYSICAL_IO: PhysicalIoState = {
  available: false, observedAt: null, epoch: 0, sequence: 0, clockMs: 0,
  allowed: false, blockReason: 4, mappingVerified: false,
  doAllowed: false, doBlockReason: 4, emergencyActive: false, emergencyResetAllowed: false,
  manualActive: false, manualStartAllowed: false,
  rawDi: [], usedDi: [], forcedDi: [], outputs: [], allowedDo: [], allowedDoOn: [], forcedDo: [], inhibitedDo: [], history: [],
};

export const PHYSICAL_IO_SIGNALS: PhysicalIoSignal[] = map.channels.map((signal) => ({
  direction: signal.direction as 'DI' | 'DO', index: signal.index,
  category: signal.category, label: signal.label, variable: signal.variable,
  address: signal.address, terminal: signal.terminal, installed: signal.installed,
  unbound: 'unbound' in signal && signal.unbound === true,
}));

export const IO_EVENT_KINDS: Record<number, string> = {
  1: 'Физический вход', 2: 'Вход программы', 3: 'Выход',
  4: 'Ручная подмена', 5: 'Снята вручную', 6: 'Снята PLC',
  7: 'Ручная команда DO', 8: 'DO возвращён оператором', 9: 'DO возвращён программе',
};

export const IO_BLOCK_REASONS: Record<number, string> = {
  0: 'Ручное управление разрешено PLC',
  1: 'Подмена доступна в режиме обычной ячейки',
  2: 'Для подмены включите ручной режим ячейки',
  3: 'Дождитесь останова ячейки и оборудования',
  4: 'Ожидаем связь со страницей диагностики',
  5: 'Нет аппаратного допуска безопасности',
  6: 'Активен экстренный останов',
  7: 'Нажмите «Управлять сигналами вручную»',
};

export type IoEquipmentType = 'all' | 'machines' | 'magazines' | 'line' | 'cell';

export const IO_EQUIPMENT_TYPES: { value: IoEquipmentType; label: string }[] = [
  { value: 'all', label: 'Все типы оборудования' }, { value: 'machines', label: 'Станки' },
  { value: 'magazines', label: 'Магазины' }, { value: 'line', label: 'Линия · ГК' }, { value: 'cell', label: 'Ячейка' },
];

export function ioSignalKey(signal: Pick<PhysicalIoSignal, 'direction' | 'index'>): string {
  return `${signal.direction}:${signal.index}`;
}

export function ioEquipmentType(signal: PhysicalIoSignal): Exclude<IoEquipmentType, 'all'> {
  if (signal.category.startsWith('Станок')) return 'machines';
  if (signal.category.startsWith('Магазин')) return 'magazines';
  if (signal.category.startsWith('ГК')) return 'line';
  return 'cell';
}

export function filterIoSignals(signals: PhysicalIoSignal[], { equipmentType = 'all', category = 'all', query = '', selected }: {
  equipmentType?: IoEquipmentType; category?: string; query?: string; selected?: ReadonlySet<string>;
}): PhysicalIoSignal[] {
  const normalized = query.trim().toLocaleLowerCase('ru');
  return signals.filter((signal) => (equipmentType === 'all' || ioEquipmentType(signal) === equipmentType)
    && (category === 'all' || signal.category === category)
    && (!selected || selected.has(ioSignalKey(signal)))
    && (!normalized || `${signal.category} ${signal.label} ${signal.variable} ${signal.address} ${signal.terminal}`.toLocaleLowerCase('ru').includes(normalized)));
}

export function ioSignalLevel(data: PhysicalIoState, signal: PhysicalIoSignal, kind: 'raw' | 'used', online: boolean): boolean | null {
  if (!online || !data.available) return null;
  if (signal.direction === 'DO') return kind === 'used' ? data.outputs[signal.index - 1] ?? null : null;
  if (kind === 'raw' && (!signal.installed || !data.mappingVerified)) return null;
  return (kind === 'raw' ? data.rawDi : data.usedDi)[signal.index - 1] ?? null;
}
