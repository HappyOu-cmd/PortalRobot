import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { Tooltip } from './Tooltip';

const meta = {
  title: 'Базовые элементы/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  render: (args) => <Tooltip {...args}><Button size="icon" aria-label="Состояние связи">i</Button></Tooltip>,
  args: { content: 'OPC UA: соединение установлено', children: <span /> },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Подсказка: Story = {};
