import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SlotType } from '../../model/types';
import { HMI_SCENARIOS } from '../../model/scenarios';
import { MagazineMatrix } from './MagazineMatrix';

const meta = {
  title: 'Магазин/Матрица слотов',
  component: MagazineMatrix,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div style={{ width: 760, padding: 24, background: '#fff' }}><Story /></div>],
} satisfies Meta<typeof MagazineMatrix>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Заполненный: Story = {
  args: { slots: HMI_SCENARIOS.normal().magazine, columns: 10 },
};

export const Пустой: Story = {
  args: { slots: HMI_SCENARIOS.emptyMagazine().magazine, columns: 10 },
};

export const Редактирование: Story = {
  args: { slots: HMI_SCENARIOS.normal().magazine, columns: 10 },
  render: () => {
    const [slots, setSlots] = useState<SlotType[]>(HMI_SCENARIOS.normal().magazine);
    const cycleSlot = (index: number) => setSlots((current) => {
      const next = [...current];
      const sequence: SlotType[] = ['empty', 'blank', 'detail'];
      next[index] = sequence[(sequence.indexOf(next[index]) + 1) % sequence.length];
      return next;
    });
    return <MagazineMatrix slots={slots} columns={10} onSlotClick={cycleSlot} />;
  },
};
