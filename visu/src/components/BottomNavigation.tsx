import { useId, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Icon } from '@iconify/react';
import { cva } from 'class-variance-authority';
import closeIcon from '@iconify-icons/mdi/close';
import conveyorIcon from '@iconify-icons/material-symbols/conveyor-belt-outline';
import machineIcon from '@iconify-icons/material-symbols/microwave-gen-outline';
import robotIcon from '@iconify-icons/mdi/robot-industrial-outline';
import magazineIcon from '@iconify-icons/mdi/view-grid-outline';
import geometryIcon from '@iconify-icons/material-symbols/measuring-tape-outline';
import { cn } from '../lib/utils';
import { BOTTOM_NAV_FOLDERS, type BottomNavigationTarget, type BottomSection } from '../model/bottomNavigation';
import type { PlcAlarmEvent, PlcAlarmSource } from '../plc/client';

const ICONS = { cell: conveyorIcon, machines: machineIcon, robot: robotIcon, magazine: magazineIcon, geometry: geometryIcon };
const PRESS_MOVE_TOLERANCE_PX = 14;
const toneClass = cva('', { variants: { tone: { neutral: '', alarm: 'has-alarm', warning: 'has-warning' } } });

function alarmTone(events: readonly PlcAlarmEvent[], sources: readonly PlcAlarmSource[]) {
  let warning = false;
  for (const event of events) {
    if (!event.active || !sources.includes(event.source)) continue;
    if (event.severity === 'alarm') return 'alarm';
    warning = true;
  }
  return warning ? 'warning' : 'neutral';
}

export function BottomNavigation({ onNavigate, alarmEvents }: {
  onNavigate: (target: BottomNavigationTarget) => void;
  alarmEvents: readonly PlcAlarmEvent[];
}) {
  const [folderKey, setFolderKey] = useState<BottomSection | null>(null);
  const [open, setOpen] = useState(false);
  const folderId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const navigatingRef = useRef(false);
  const pointerRef = useRef<{ pointerId: number; key: BottomSection; x: number; y: number } | null>(null);
  const suppressPointerClickRef = useRef(false);
  const folder = BOTTOM_NAV_FOLDERS.find((item) => item.key === folderKey);

  const selectGroup = (key: BottomSection, trigger: HTMLButtonElement) => {
    const group = BOTTOM_NAV_FOLDERS.find((item) => item.key === key);
    if (!group) return;
    if (group.entries.length === 1) {
      navigatingRef.current = true;
      setOpen(false);
      onNavigate(group.entries[0].target);
      return;
    }
    triggerRef.current = trigger;
    navigatingRef.current = false;
    setFolderKey(key);
    setOpen(true);
  };

  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <div className="cell-bottom-nav-wrap">
      <nav className="cell-bottom-nav" aria-label="Разделы управления">
        {BOTTOM_NAV_FOLDERS.map(({ key, label, caption, entries, sources }) => <button
          key={key}
          className={cn(toneClass({ tone: alarmTone(alarmEvents, sources) }), open && folderKey === key && 'active')}
          type="button"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            suppressPointerClickRef.current = true;
            pointerRef.current = { pointerId: event.pointerId, key, x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            const pointer = pointerRef.current;
            pointerRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            if (!pointer || pointer.pointerId !== event.pointerId || pointer.key !== key) return;
            const distance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
            if (distance <= PRESS_MOVE_TOLERANCE_PX) selectGroup(key, event.currentTarget);
            window.setTimeout(() => { suppressPointerClickRef.current = false; }, 0);
          }}
          onPointerCancel={(event) => {
            if (pointerRef.current?.pointerId === event.pointerId) pointerRef.current = null;
            suppressPointerClickRef.current = false;
          }}
          onClick={(event) => {
            if (suppressPointerClickRef.current) {
              suppressPointerClickRef.current = false;
              return;
            }
            selectGroup(key, event.currentTarget);
          }}
          aria-label={entries.length === 1 ? label : `Открыть папку «${label}»`}
          aria-haspopup={entries.length > 1 ? 'dialog' : undefined}
          aria-expanded={entries.length > 1 ? open && folderKey === key : undefined}
          aria-controls={open && folderKey === key ? folderId : undefined}
          title={label}
        >
          <span className={cn('cell-bottom-nav__icon', 'cell-nav-status-icon', toneClass({ tone: alarmTone(alarmEvents, sources) }))} aria-hidden="true">
            <Icon icon={ICONS[key]} />
          </span>
          <span className="cell-bottom-nav__caption">{caption}</span>
        </button>)}
      </nav>
    </div>
    {folder && <Dialog.Portal>
      <Dialog.Overlay className="cell-nav-folder-overlay" />
      <Dialog.Content
        id={folderId}
        className="cell-nav-folder touch-scroll-surface"
        data-count={folder.entries.length}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!navigatingRef.current && triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
        }}
      >
        <header className="cell-nav-folder__header">
          <Dialog.Title className="cell-nav-folder__title">{folder.caption}</Dialog.Title>
          <Dialog.Close asChild>
            <button className="cell-nav-folder__close" type="button" aria-label="Закрыть папку"><Icon icon={closeIcon} aria-hidden="true" /></button>
          </Dialog.Close>
        </header>
        <nav className="cell-nav-folder__grid" aria-label={folder.label}>
          {folder.entries.map((entry) => <button
            className={cn('cell-nav-folder__entry', toneClass({ tone: alarmTone(alarmEvents, entry.sources) }))}
            type="button"
            key={entry.id}
            onClick={() => {
              navigatingRef.current = true;
              setOpen(false);
              onNavigate(entry.target);
            }}
          >
            <span className={cn('cell-nav-folder__icon', 'cell-nav-status-icon', toneClass({ tone: alarmTone(alarmEvents, entry.sources) }))} aria-hidden="true">
              <Icon icon={ICONS[entry.icon]} />
              {entry.number !== undefined && <b>{entry.number}</b>}
            </span>
            <span className="cell-nav-folder__label">{entry.label}</span>
          </button>)}
        </nav>
      </Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
}
