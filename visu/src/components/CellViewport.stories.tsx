import { useEffect, useMemo, useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DEFAULT_LAYOUT, DEFAULT_STATE } from '../model/defaults';
import type { CellState, RobotCoordinateFrame } from '../model/types';
import type { SceneActivity } from '../model/visualEffects';
import { CellViewport } from './CellViewport';

const meta = {
  title: 'Ячейка/3D-эффекты',
  component: CellViewport,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CellViewport>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultArgs = {
  layout: DEFAULT_LAYOUT,
  state: DEFAULT_STATE,
  selectedMachine: null,
  cameraPreset: 'front' as const,
  onMachineSelect: () => {},
};

function EffectsPreview({ alarm = false }: { alarm?: boolean }) {
  const state = useMemo<CellState>(() => ({
    ...structuredClone(DEFAULT_STATE),
    robot: { ...structuredClone(DEFAULT_STATE).robot, busy: true },
  }), []);
  const coordinatesRef = useRef<RobotCoordinateFrame>({
    sequence: 0,
    timestampMs: Date.now(),
    sourceTimestampMs: Date.now(),
    coordinates: { x: 3100, y: 680, z: 260 },
  });
  useEffect(() => {
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      const phase = ((performance.now() - startedAt) / 7000) % 1;
      coordinatesRef.current = {
        sequence: coordinatesRef.current.sequence + 1,
        timestampMs: Date.now(),
        sourceTimestampMs: Date.now(),
        coordinates: { x: 2900 + phase * 4200, y: 680, z: 260 + Math.sin(phase * Math.PI) * 360 },
      };
    }, 50);
    return () => window.clearInterval(timer);
  }, []);
  const activity: SceneActivity = {
    live: true,
    operationTarget: { kind: 'machine', index: 1 },
    activeMachines: [1],
    activeMagazines: [0],
    robotBusy: true,
    alarmTargets: alarm ? [{ kind: 'machine', index: 2 }, { kind: 'portal' }] : [],
  };
  return <div style={{ width: '100vw', height: '100vh', minHeight: 700 }}>
    <CellViewport
      layout={DEFAULT_LAYOUT}
      state={state}
      robotCoordinatesRef={coordinatesRef}
      selectedMachine={null}
      cameraPreset="front"
      onMachineSelect={() => {}}
      visualEffects={{ operationHighlight: true, cameraFocus: false, alarmBeacons: true }}
      sceneActivity={activity}
    />
  </div>;
}

export const АктивнаяОперация: Story = {
  args: defaultArgs,
  render: () => <EffectsPreview />,
};

export const ОперацияСАварией: Story = {
  args: defaultArgs,
  render: () => <EffectsPreview alarm />,
};
