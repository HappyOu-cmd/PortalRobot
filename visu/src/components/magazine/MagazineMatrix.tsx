import viewGridOutlineIcon from '@iconify-icons/mdi/view-grid-outline';
import { Icon } from '@iconify/react';
import type { SlotType } from '../../model/types';

export interface MagazineMatrixProps {
  slots: SlotType[];
  onSlotClick?: (index: number) => void;
  columns?: number;
  activeCount?: number;
}

export interface MagazineMatrixCardProps {
  id?: string;
  slots: SlotType[];
  columns: number;
  rows: number;
  onSlotClick?: (index: number) => void;
  className?: string;
}

const SLOT_LABELS: Record<SlotType, string> = {
  empty: 'пусто',
  blank: 'заготовка',
  detail: 'деталь',
};

export function MagazineMatrix({ slots, onSlotClick, columns = 10, activeCount = slots.length }: MagazineMatrixProps) {
  return (
    <div
      className={`magazine-matrix ${onSlotClick ? 'editable' : ''}`}
      style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, 1fr)` }}
      aria-label={`Матрица магазина на ${activeCount} слотов`}
    >
      {slots.slice(0, activeCount).map((slot, index) => (
        <button
          key={index}
          type="button"
          disabled={!onSlotClick}
          title={`Слот ${index + 1}: ${SLOT_LABELS[slot]}`}
          aria-label={`Слот ${index + 1}: ${SLOT_LABELS[slot]}`}
          className={`slot ${slot}`}
          onClick={() => onSlotClick?.(index)}
        >
          <span>{index + 1}</span>
        </button>
      ))}
    </div>
  );
}

export function MagazineMatrixCard({
  id,
  slots,
  columns,
  rows,
  onSlotClick,
  className,
}: MagazineMatrixCardProps) {
  const activeCount = Math.min(slots.length, Math.max(0, rows * columns));
  const activeSlots = slots.slice(0, activeCount);
  const blanks = activeSlots.filter((slot) => slot === 'blank').length;
  const details = activeSlots.filter((slot) => slot === 'detail').length;
  const empty = activeCount - blanks - details;

  return <section
    id={id}
    className={`magazine-matrix-card ${className ?? ''}`.trim()}
    aria-label={`Матрица магазина ${columns} на ${rows}`}
    onPointerDown={(event) => event.stopPropagation()}
  >
    <header className="magazine-matrix-card-header">
      <h2>Матрица магазина</h2>
      <Icon icon={viewGridOutlineIcon} aria-hidden="true" />
    </header>
    <div className="magazine-matrix-card-stats" aria-label="Состав магазина">
      <div className="blank"><i aria-hidden="true" /><span>Заготовка</span><strong>{blanks}</strong></div>
      <div className="detail"><i aria-hidden="true" /><span>Деталь</span><strong>{details}</strong></div>
      <div className="empty"><i aria-hidden="true" /><span>Пусто</span><strong>{empty}</strong></div>
    </div>
    <div className="magazine-matrix-card-map">
      <MagazineMatrix
        slots={slots}
        columns={columns}
        activeCount={activeCount}
        onSlotClick={onSlotClick}
      />
    </div>
  </section>;
}
