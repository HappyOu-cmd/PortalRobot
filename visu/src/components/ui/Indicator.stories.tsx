import type { Meta, StoryObj } from '@storybook/react-vite';
import { Indicator } from './Indicator';

const meta = {
  title: 'Базовые элементы/Индикатор',
  component: Indicator,
  tags: ['autodocs'],
  args: { active: true, tone: 'green' },
} satisfies Meta<typeof Indicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Работает: Story = {};
export const Авария: Story = { args: { tone: 'red' } };
export const Отключен: Story = { args: { active: false } };
