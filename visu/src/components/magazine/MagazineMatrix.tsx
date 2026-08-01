import type { SlotType } from '../../model/types';

export interface MagazineMatrixProps {
  slots: SlotType[];
  onSlotClick?: (index: number) => void;
  columns?: number;
  activeCount?: number;
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
