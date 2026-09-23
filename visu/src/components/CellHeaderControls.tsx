import checkIcon from '@iconify-icons/mdi/check';
import chevronDownIcon from '@iconify-icons/mdi/chevron-down';
import playOutlineIcon from '@iconify-icons/mdi/play-outline';
import stopIcon from '@iconify-icons/mdi/stop';
import { Icon } from '@iconify/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cva } from 'class-variance-authority';
import { useState } from 'react';
import { cn } from '../lib/utils';
import './cell-header-controls.css';

const statusCard = cva('cell-header-card', {
  variants: {
    tone: {
      system: 'cell-header-card--system',
      alarm: 'cell-header-card--system cell-header-card--alarm',
      mode: 'cell-header-card--mode',
    },
  },
});

type CellHeaderControlsProps = {
  systemText: string;
  modeText: string;
  alarm: boolean;
  online: boolean;
  running: boolean;
  manualMode: boolean;
  stopPending: boolean;
  startAllowed: boolean;
  stopAllowed: boolean;
  manualAllowed: boolean;
  automaticAllowed: boolean;
  onCycleCommand: (command: 'cell.start' | 'cell.stop') => void;
  onModeChange: (manual: boolean) => void;
  onOpen: () => void;
};

export function CellHeaderControls({
  systemText, modeText, alarm, online, running, manualMode, stopPending,
  startAllowed, stopAllowed, manualAllowed, automaticAllowed,
  onCycleCommand, onModeChange, onOpen,
}: CellHeaderControlsProps) {
  const [openMenu, setOpenMenu] = useState<'system' | 'mode' | null>(null);
  const cycleCommand = stopPending || !running ? 'cell.start' : 'cell.stop';
  const cycleLabel = stopPending ? 'Отменить остановку' : running ? 'Остановить ячейку' : 'Запустить ячейку';
  const cycleAllowed = cycleCommand === 'cell.start' ? startAllowed : stopAllowed;
  const changeOpen = (menu: 'system' | 'mode', open: boolean) => {
    setOpenMenu((current) => open ? menu : current === menu ? null : current);
    if (open) onOpen();
  };

  return <div className="cell-header-controls">
    <DropdownMenu.Root open={openMenu === 'system'} onOpenChange={(open) => changeOpen('system', open)} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={statusCard({ tone: alarm ? 'alarm' : 'system' })} title="Пуск и остановка ячейки">
          <span className="cell-header-card__label">СИСТЕМА</span>
          <b className="cell-header-card__value">{systemText}</b>
          <Icon icon={chevronDownIcon} className="cell-header-card__arrow" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="cell-header-menu" side="bottom" align="start" sideOffset={10} collisionPadding={12} aria-label="Пуск и остановка ячейки">
          <DropdownMenu.Label className="cell-header-menu__label">УПРАВЛЕНИЕ ЯЧЕЙКОЙ</DropdownMenu.Label>
          <DropdownMenu.Item
            className={cn('cell-header-menu__item', cycleCommand === 'cell.start' ? 'cell-header-menu__item--start' : 'cell-header-menu__item--stop', !cycleAllowed && 'is-unavailable')}
            disabled={!online}
            aria-disabled={!online || !cycleAllowed}
            onSelect={() => onCycleCommand(cycleCommand)}
          ><Icon icon={cycleCommand === 'cell.start' ? playOutlineIcon : stopIcon} aria-hidden="true" /><span>{cycleLabel}</span></DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    <DropdownMenu.Root open={openMenu === 'mode'} onOpenChange={(open) => changeOpen('mode', open)} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={statusCard({ tone: 'mode' })} title="Переключить режим ячейки">
          <span className="cell-header-card__label">РЕЖИМ</span>
          <b className="cell-header-card__value">{modeText}</b>
          <Icon icon={chevronDownIcon} className="cell-header-card__arrow" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="cell-header-menu cell-header-menu--mode" side="bottom" align="start" sideOffset={10} collisionPadding={12} aria-label="Режим работы ячейки">
          <DropdownMenu.Label className="cell-header-menu__label">РЕЖИМ РАБОТЫ</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={manualMode ? 'manual' : 'automatic'} onValueChange={(value) => onModeChange(value === 'manual')}>
            <DropdownMenu.RadioItem
              value="manual"
              className={cn('cell-header-menu__item', !manualAllowed && 'is-unavailable')}
              disabled={!online}
              aria-disabled={!online || !manualAllowed}
            ><span>Ручной</span><DropdownMenu.ItemIndicator className="cell-header-menu__check"><Icon icon={checkIcon} aria-hidden="true" /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem
              value="automatic"
              className={cn('cell-header-menu__item', !automaticAllowed && 'is-unavailable')}
              disabled={!online}
              aria-disabled={!online || !automaticAllowed}
            ><span>Автомат</span><DropdownMenu.ItemIndicator className="cell-header-menu__check"><Icon icon={checkIcon} aria-hidden="true" /></DropdownMenu.ItemIndicator></DropdownMenu.RadioItem>
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  </div>;
}
