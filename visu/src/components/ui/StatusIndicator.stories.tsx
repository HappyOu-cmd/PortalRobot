import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusIndicator } from './StatusIndicator';

const meta = {
  title: 'Базовые элементы/StatusIndicator',
  component: StatusIndicator,
  tags: ['autodocs'],
  args: { label: 'Робот', value: 'Готов', status: 'success' },
} satisfies Meta<typeof StatusIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Готов: Story = {};
export const Ожидание: Story = { args: { value: 'Ожидание', status: 'warning' } };
export const Авария: Story = { args: { value: 'Авария', status: 'danger' } };
export const Отключен: Story = { args: { value: 'Отключён', status: 'off' } };
