import powerIcon from '@iconify-icons/mdi/power';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';

const meta = {
  title: 'Базовые элементы/Button',
  component: Button,
  tags: ['autodocs'],
  args: { children: 'Включить оборудование', variant: 'success', size: 'md', icon: powerIcon },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Включить: Story = {};
export const Выключить: Story = { args: { children: 'Выключить оборудование', variant: 'danger' } };
export const ОсновнаяКоманда: Story = { args: { children: 'Подтвердить', variant: 'primary', icon: undefined } };
export const Недоступна: Story = { args: { disabled: true } };
