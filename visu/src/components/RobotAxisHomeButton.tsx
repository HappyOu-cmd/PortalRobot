import { Icon } from '@iconify/react';
import homeIcon from '@iconify-icons/material-symbols/home-outline';
import { cn } from '../lib/utils';
import type { PlcAxisManualStatus, PlcCommand } from '../plc/client';

export const AXIS_HOMING_STATE = 6; // E_AXIS_STATE.HOMING
const AXES = ['X', 'Y', 'Z'] as const;

export function RobotAxisHomeButton({ axis, status, online, onSend, className }: {
  axis: number;
  status: Pick<PlcAxisManualStatus, 'homeAllowed' | 'homed' | 'stateCode'>;
  online: boolean;
  onSend: (command: PlcCommand) => void;
  className?: string;
}) {
  const searching = online && status.stateCode === AXIS_HOMING_STATE;
  const indicator = searching ? 'searching' : online && status.homed ? 'found' : 'idle';

  return <button
    type="button"
    className={cn('rj-home-button', !status.homeAllowed && 'command-unavailable', className)}
    data-state={indicator}
    disabled={!online || searching}
    aria-disabled={!online || !status.homeAllowed || searching}
    aria-label={`HOME оси ${AXES[axis - 1]}${!online ? ': нет связи' : searching ? ': выполняется' : status.homed ? ': найден' : ': не найден'}`}
    onClick={() => onSend({ command: 'robot.axis.home', machine: axis })}
  >
    <span><Icon icon={homeIcon} aria-hidden="true" />HOME</span><i aria-hidden="true" data-state={indicator} />
  </button>;
}
