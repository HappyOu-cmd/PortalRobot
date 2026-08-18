import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SlotType } from '../../model/types';
import { HMI_SCENARIOS } from '../../model/scenarios';
import { MagazineMatrixCard } from './MagazineMatrix';

const meta = {
  title: 'Магазин/Быстрый редактор матрицы',
  component: MagazineMatrixCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div style={{ position: 'relative', width: 560, height: 520, background: '#f7f9fb' }}><Story /></div>],
} satisfies Meta<typeof MagazineMatrixCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Редактирование: Story = {
  args: { slots: HMI_SCENARIOS.normal().magazines[0].zones[0], columns: 10, rows: 12 },
  render: (args) => {
    const [slots, setSlots] = useState<SlotType[]>(args.slots);
    const cycleSlot = (index: number) => setSlots((current) => {
      const next = [...current];
      const sequence: SlotType[] = ['empty', 'blank', 'detail'];
      next[index] = sequence[(sequence.indexOf(next[index]) + 1) % sequence.length];
      return next;
    });
    return <MagazineMatrixCard {...args} slots={slots} onSlotClick={cycleSlot} />;
  },
};

export const ТолькоПросмотр: Story = {
  args: { slots: HMI_SCENARIOS.magazineBusy().magazines[0].zones[1], columns: 10, rows: 12 },
};

export const ИзменённыйРазмер: Story = {
  args: { slots: HMI_SCENARIOS.normal().magazines[0].zones[0], columns: 10, rows: 12 },
};
