import { CircleStop, Play, RotateCcw } from 'lucide-react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CommandButton } from './CommandButton';

const meta = {
  title: 'Базовые элементы/Командная кнопка',
  component: CommandButton,
  tags: ['autodocs'],
  args: { label: 'Старт', icon: Play, tone: 'primary', onClick: () => undefined },
} satisfies Meta<typeof CommandButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Старт: Story = {};
export const Стоп: Story = { args: { label: 'Стоп', icon: CircleStop, tone: 'stop' } };
export const Сброс: Story = { args: { label: 'Сброс', icon: RotateCcw, tone: 'neutral' } };
