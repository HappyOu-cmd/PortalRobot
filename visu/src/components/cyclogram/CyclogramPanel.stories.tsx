import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CyclogramHistory, CyclogramInterval } from '../../model/cyclogram';
import { CyclogramPanel } from './CyclogramPanel';

const now = Date.now();
const interval = (id: number, lane: CyclogramInterval['lane'], label: string, category: CyclogramInterval['category'], startOffsetMs: number, endOffsetMs: number | null): CyclogramInterval => ({
  id,
  lane,
  activityId: `${lane}-${id}`,
  label,
  category,
  startMs: now + startOffsetMs,
  endMs: endOffsetMs === null ? null : now + endOffsetMs,
  lastSeenMs: endOffsetMs === null ? now : now + endOffsetMs,
});

const history = (intervals: CyclogramInterval[]): CyclogramHistory => ({
  serverTime: now,
  retentionMs: 24 * 60 * 60 * 1_000,
  intervals,
});

const meta = {
  title: 'Мониторинг/Циклограмма',
  component: CyclogramPanel,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div style={{ minWidth: 1080, padding: 18, background: '#f5f8fa' }}><Story /></div>],
  args: { onClose: () => {}, onExport: () => {}, onClear: () => {} },
} satisfies Meta<typeof CyclogramPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {
  args: {
    history: history([
      interval(1, 'robot', 'Работа в магазине', 'robot-active', -150_000, -72_000),
      interval(2, 'robot', 'Перемещение к станку 1', 'robot-active', -72_000, -45_000),
      interval(3, 'robot', 'Работа в станке 1', 'robot-active', -45_000, null),
      interval(4, 'machine-1', 'Обработка', 'machine-processing', -210_000, null),
      interval(5, 'machine-2', 'Простой', 'machine-idle', -210_000, -90_000),
      interval(6, 'machine-2', 'Обработка', 'machine-processing', -90_000, null),
      interval(7, 'machine-3', 'Простой', 'machine-idle', -210_000, null),
    ]),
  },
};

export const PausedArchive: Story = {
  args: {
    initialPaused: true,
    history: history([
      interval(1, 'robot', 'Перемещение к магазину от станка 2', 'robot-active', -540_000, -470_000),
      interval(2, 'robot', 'Работа в магазине', 'robot-active', -470_000, -350_000),
      interval(3, 'robot', 'Простой', 'robot-idle', -350_000, -270_000),
      interval(4, 'robot', 'Перемещение к станку 3', 'robot-active', -270_000, -180_000),
      interval(5, 'robot', 'Работа в станке 3', 'robot-active', -180_000, -40_000),
      interval(6, 'machine-1', 'Обработка', 'machine-processing', -600_000, -250_000),
      interval(7, 'machine-1', 'Простой', 'machine-idle', -250_000, -10_000),
      interval(8, 'machine-2', 'Простой', 'machine-idle', -600_000, -420_000),
      interval(9, 'machine-2', 'Обработка', 'machine-processing', -420_000, -10_000),
      interval(10, 'machine-3', 'Простой', 'machine-idle', -600_000, -180_000),
      interval(11, 'machine-3', 'Обработка', 'machine-processing', -180_000, -10_000),
    ]),
  },
};

export const PlcGap: Story = {
  args: {
    history: history([
      interval(1, 'robot', 'Нет данных', 'no-data', -300_000, -180_000),
      interval(2, 'robot', 'Другое действие робота · действие 42 · точка 91', 'robot-active', -180_000, -10_000),
      interval(3, 'machine-1', 'Нет данных', 'no-data', -300_000, -180_000),
      interval(4, 'machine-1', 'Простой', 'machine-idle', -180_000, -10_000),
      interval(5, 'machine-2', 'Нет данных', 'no-data', -300_000, -180_000),
      interval(6, 'machine-2', 'Обработка', 'machine-processing', -180_000, -10_000),
      interval(7, 'machine-3', 'Нет данных', 'no-data', -300_000, -10_000),
    ]),
  },
};
