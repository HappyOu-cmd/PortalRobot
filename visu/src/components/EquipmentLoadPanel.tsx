export interface EquipmentLoadPanelProps {
  values: readonly [number, number, number, number];
  className?: string;
}

const ITEMS = [
  { label: 'Станок 1', tone: 'machine' },
  { label: 'Станок 2', tone: 'machine' },
  { label: 'Станок 3', tone: 'machine' },
  { label: 'Робот', tone: 'robot' },
] as const;

const RING_RADIUS = 25;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const normalizePercent = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

export function EquipmentLoadPanel({ values, className }: EquipmentLoadPanelProps) {
  return <aside className={`equipment-load-panel ${className ?? ''}`.trim()} aria-label="Загрузка оборудования">
    <h2>Загрузка оборудования</h2>
    <div className="equipment-load-list">
      {ITEMS.map((item, index) => {
        const value = normalizePercent(values[index]);
        const rounded = Math.round(value);
        return <div className={`equipment-load-row ${item.tone}`} key={item.label}>
          <div className="equipment-load-ring" role="progressbar" aria-label={`${item.label}: ${rounded}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={rounded}>
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <circle className="track" cx="32" cy="32" r={RING_RADIUS} />
              <circle className="value" cx="32" cy="32" r={RING_RADIUS} strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH * (1 - value / 100)} />
            </svg>
            <strong>{rounded}%</strong>
          </div>
          <div className="equipment-load-data">
            <div><span>{item.label}</span><strong>{rounded}%</strong></div>
            <div className="equipment-load-bar" aria-hidden="true"><i style={{ width: `${value}%` }} /></div>
          </div>
        </div>;
      })}
    </div>
  </aside>;
}
