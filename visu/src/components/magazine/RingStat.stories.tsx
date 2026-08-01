import type { Meta, StoryObj } from '@storybook/react-vite';
import { RingStat } from './RingStat';

const meta = {
  title: 'Магазин/Круговая диаграмма',
  component: RingStat,
  tags: ['autodocs'],
  args: { value: 42, total: 70, tone: 'blue', label: 'Заготовки' },
} satisfies Meta<typeof RingStat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Заготовки: Story = {};
export const Детали: Story = { args: { value: 18, tone: 'green', label: 'Готовые детали' } };
export const Пусто: Story = { args: { value: 0 } };
