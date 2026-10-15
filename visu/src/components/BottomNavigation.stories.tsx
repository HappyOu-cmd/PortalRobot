import { useState, type ComponentProps, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { BottomNavigation } from './BottomNavigation';
import type { BottomNavigationTarget } from '../model/bottomNavigation';
import type { PlcAlarmEvent } from '../plc/client';

function NavigationPreview(props: ComponentProps<typeof BottomNavigation>) {
  const [selection, setSelection] = useState<BottomNavigationTarget | null>(null);
  return <div style={{ width: 'min(744px, 100%)', '--bottom-menu-space': '744px', '--bottom-overview-surface': '#fff', '--ui-border': '#d8e3ea' } as CSSProperties}>
    <BottomNavigation {...props} onNavigate={setSelection} />
    <output style={{ display: 'block', fontSize: 14 }}>{selection ? JSON.stringify(selection) : 'Откройте папку и выберите оборудование или экран.'}</output>
  </div>;
}

const alarm: PlcAlarmEvent = { id: 1, source: 'machine-2', severity: 'alarm', effect: 'equipment-stop', code: 1, text: 'Авария станка 2', active: true, reportedAt: 0 };
const warning: PlcAlarmEvent = { id: 2, source: 'magazine-1', severity: 'warning', effect: 'warning', code: 1, text: 'Предупреждение магазина 1', active: true, reportedAt: 0 };

const meta = {
  title: 'Навигация/Папки оборудования',
  component: BottomNavigation,
  tags: ['autodocs'],
  args: { alarmEvents: [], onNavigate: () => {} },
  render: (args) => <NavigationPreview {...args} />,
} satisfies Meta<typeof BottomNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Обычная: Story = {};
export const Авария: Story = { args: { alarmEvents: [alarm] } };
export const Предупреждение: Story = { args: { alarmEvents: [warning] } };
export const РазныеСостоянияВОднойПапке: Story = { args: { alarmEvents: [alarm, { ...warning, source: 'machine-1', text: 'Предупреждение станка 1' }] } };
export const ОдиночныеЗначки: Story = { args: { alarmEvents: [{ ...alarm, source: 'gripper', text: 'Авария захвата робота' }, { ...warning, source: 'cell-safety', text: 'Предупреждение безопасности ячейки' }] } };
export const СброшенныеСобытия: Story = { args: { alarmEvents: [{ ...alarm, active: false }, { ...warning, active: false }] } };
