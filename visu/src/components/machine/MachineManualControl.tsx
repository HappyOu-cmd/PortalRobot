import * as Dialog from '@radix-ui/react-dialog';
import { Disc3, DoorOpen, LockKeyhole, PackageOpen, ShieldAlert, UnlockKeyhole, X } from 'lucide-react';
import type { CellState } from '../../model/types';
import { Indicator } from '../ui/Indicator';

export type MachineMechanism = 'door' | 'hatch' | 'chuck';
export type MachineMechanismAction = 'open' | 'close';

export interface MachineMotionRequest {
  machineIndex: number;
  mechanism: MachineMechanism;
  action: MachineMechanismAction;
}

const MECHANISM_LABELS: Record<MachineMechanism, string> = {
  door: 'Операторская дверь',
  hatch: 'Роботный люк',
  chuck: 'Патрон',
};

const ACTION_LABELS: Record<MachineMechanismAction, string> = {
  open: 'Открыть',
  close: 'Закрыть',
};

function mechanismState(machine: CellState['machines'][number], mechanism: MachineMechanism) {
  if (mechanism === 'door') return machine.doorOpen ? 'Открыта' : machine.doorClosed ? 'Закрыта' : 'Нет данных';
  if (mechanism === 'hatch') return machine.hatchOpen ? 'Открыт' : machine.hatchClosed ? 'Закрыт' : 'Движение';
  return machine.chuckOpen ? 'Разжат' : machine.chuckClosed ? 'Зажат' : 'Движение';
}

export function isMachineMotionAllowed(
  machine: CellState['machines'][number],
  mechanism: MachineMechanism,
  action: MachineMechanismAction,
  usePlcData: boolean,
) {
  if (usePlcData) {
    if (mechanism === 'door') return action === 'open' ? machine.manualDoorOpenAllowed : machine.manualDoorCloseAllowed;
    if (mechanism === 'hatch') return action === 'open' ? machine.manualHatchOpenAllowed : machine.manualHatchCloseAllowed;
    return action === 'open' ? machine.manualChuckOpenAllowed : machine.manualChuckCloseAllowed;
  }

  const commonAllowed = !machine.enabled && machine.mode === 'off' && !machine.alarm;
  if (!commonAllowed) return false;
  if (mechanism === 'door') return action === 'open' ? machine.doorClosed : machine.doorOpen;
  if (mechanism === 'hatch') return action === 'open' ? machine.hatchClosed : machine.hatchOpen;
  return action === 'open' ? machine.chuckClosed : machine.chuckOpen;
}

export function MachineManualControlMenu({
  machineIndex,
  machine,
  mechanism,
  usePlcData,
  onRequest,
  onClose,
}: {
  machineIndex: number;
  machine: CellState['machines'][number];
  mechanism: MachineMechanism;
  usePlcData: boolean;
  onRequest: (action: MachineMechanismAction) => void;
  onClose: () => void;
}) {
  const Icon = mechanism === 'door' ? DoorOpen : mechanism === 'hatch' ? PackageOpen : Disc3;
  const opened = mechanism === 'door' ? machine.doorOpen : mechanism === 'hatch' ? machine.hatchOpen : machine.chuckOpen;
  const closed = mechanism === 'door' ? machine.doorClosed : mechanism === 'hatch' ? machine.hatchClosed : machine.chuckClosed;
  const openAllowed = isMachineMotionAllowed(machine, mechanism, 'open', usePlcData);
  const closeAllowed = isMachineMotionAllowed(machine, mechanism, 'close', usePlcData);
  const OpenIcon = mechanism === 'chuck' ? UnlockKeyhole : DoorOpen;

  return <aside className="machine-mechanism-card" role="dialog" aria-label={`Ручное управление: ${MECHANISM_LABELS[mechanism]}`}>
    <header>
      <span className="machine-mechanism-icon"><Icon aria-hidden="true" /></span>
      <div><small>СТАНОК {machineIndex + 1} · РУЧНОЕ УПРАВЛЕНИЕ</small><h3>{MECHANISM_LABELS[mechanism]}</h3></div>
      <button type="button" onClick={onClose} title="Закрыть"><X /></button>
    </header>
    <div className="machine-mechanism-state">
      <span><Indicator active={opened || closed} tone={opened ? 'amber' : closed ? 'green' : 'blue'} />Текущее состояние</span>
      <strong>{mechanismState(machine, mechanism)}</strong>
    </div>
    <div className="machine-mechanism-actions">
      <button type="button" className={openAllowed ? '' : 'command-unavailable'} aria-disabled={!openAllowed} onClick={() => onRequest('open')}>
        <OpenIcon /><span>{mechanism === 'chuck' ? 'Разжать' : 'Открыть'}</span>
      </button>
      <button type="button" className={closeAllowed ? 'primary' : 'primary command-unavailable'} aria-disabled={!closeAllowed} onClick={() => onRequest('close')}>
        <LockKeyhole /><span>{mechanism === 'chuck' ? 'Зажать' : 'Закрыть'}</span>
      </button>
    </div>
    {!machine.manualControlAllowed && usePlcData && <p><ShieldAlert />Включите ручной режим и исключите станок из автоматической обработки</p>}
  </aside>;
}

export function MachineMotionWarning({ request, allowed, onConfirm, onCancel }: {
  request: MachineMotionRequest;
  allowed: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const action = request.mechanism === 'chuck'
    ? request.action === 'open' ? 'Разжать' : 'Зажать'
    : ACTION_LABELS[request.action];

  return <Dialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="machine-motion-warning-overlay" />
      <Dialog.Content className="machine-motion-warning-card" onEscapeKeyDown={onCancel}>
      <div className="machine-motion-warning-icon"><ShieldAlert aria-hidden="true" /></div>
      <span>ОПАСНОЕ ДВИЖЕНИЕ</span>
      <Dialog.Title>Механизм может придавить человека</Dialog.Title>
      <Dialog.Description>Перед выполнением убедитесь, что рядом с механизмом и внутри станка никого нет. Движение может травмировать человека или повредить оборудование.</Dialog.Description>
      <div className="machine-motion-command-summary">
        <span>Станок {request.machineIndex + 1}</span>
        <strong>{action}: {MECHANISM_LABELS[request.mechanism]}</strong>
      </div>
      {!allowed && <div className="machine-motion-blocked"><ShieldAlert /><span>PLC не разрешает команду: нужен ручной режим, а станок должен быть выключен из автообработки.</span></div>}
      <div className="machine-motion-warning-actions">
        <button type="button" onClick={onCancel}>Отмена</button>
        <button className="danger" type="button" onClick={onConfirm}>Понимаю, выполнить</button>
      </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
