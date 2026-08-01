import type { Meta, StoryObj } from '@storybook/react-vite';
import { Select } from './Select';

const options = [
  { value: 'auto', label: 'Автоматический' },
  { value: 'manual', label: 'Ручной' },
  { value: 'service', label: 'Сервисный', disabled: true },
];

const meta = {
  title: 'Базовые элементы/Select',
  component: Select,
  tags: ['autodocs'],
  args: { ariaLabel: 'Режим работы', options, defaultValue: 'auto' },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;
export const РежимРаботы: Story = {};
export const Недоступен: Story = { args: { disabled: true } };
