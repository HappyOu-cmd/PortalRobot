import type { Meta, StoryObj } from '@storybook/react-vite';
import { HMI_SCENARIOS } from '../../model/scenarios';
import { MachineCard } from './MachineCard';

const normal = HMI_SCENARIOS.normal();
const alarm = HMI_SCENARIOS.alarm();

const meta = {
  title: 'Станки/Карточка станка',
  component: MachineCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div style={{ width: 520, height: 330, display: 'grid' }}><Story /></div>],
  args: { index: 0, state: normal.machines[0], step: normal.machines[0].currentStep, active: false, onClick: () => undefined },
} satisfies Meta<typeof MachineCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Готов: Story = {};
export const Обработка: Story = { args: { index: 1, state: normal.machines[1], step: 'Обработка детали' } };
export const Авария: Story = { args: { index: 1, state: alarm.machines[1], step: alarm.machines[1].currentStep } };
export const Выбран: Story = { args: { active: true } };
