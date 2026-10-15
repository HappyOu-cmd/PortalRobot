import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Icon } from '@iconify/react';
import conveyorIcon from '@iconify-icons/material-symbols/conveyor-belt-outline';
import { X, Settings, CheckCircle2, ChevronDown, TriangleAlert, PackageOpen, Power, Gauge, ClipboardList, ScanLine } from 'lucide-react';
import { createGeometrySnapshot, GEOMETRY_STATES, geometryReadinessConditions, type GeometrySnapshot } from '../../model/geometryControl';
import { ConfirmationChoice, OperatorConfirmationLayout } from '../ui/OperatorConfirmationLayout';
import { cn } from '../../lib/utils';
import { QuickStatusCard, type QuickStatusTone } from '../ui/QuickStatusCard';
import { Indicator } from '../ui/Indicator';
import { geometryCommand, GeometryCallsMenu, GeometryConnectionNotice, GeometryDriveMenu, GeometryJournalMenu, GeometryPartMenu, NumberDraft, type GeometryCommand } from './GeometryControlMenus';
import { GeometryReadinessMenu } from './GeometryReadinessMenu';
import './geometry-control.css';

type Command = GeometryCommand;
type GeometryMenu = 'readiness' | 'drive' | 'part' | 'calls' | 'journal';
const EMPTY_GEOMETRY_SNAPSHOT = createGeometrySnapshot();
const MENU_TITLES = { drive: 'Конвейер', part: 'Деталь на ГК', calls: 'Вызов деталей', journal: 'Журнал ГК' };
const MENU_ICONS = { readiness: CheckCircle2, drive: Gauge, part: ScanLine, calls: PackageOpen, journal: ClipboardList };

export function GeometryControlPanel({ snapshot = EMPTY_GEOMETRY_SNAPSHOT, online, authorized, simulation, onCommand, onRequestState, onExtended, onClose, dragHandle, className, selectedStation, onStationChange }: {
  snapshot?: GeometrySnapshot; online: boolean; authorized: boolean; simulation: boolean; onCommand: Command; onExtended: () => void;
  onClose: () => void; dragHandle?: ReactNode; className?: string; selectedStation?: 1 | 2; onStationChange?: (stationId: 1 | 2) => void;
  onRequestState: (stationId: 1 | 2) => void;
}) {
  const [localSelected, setLocalSelected] = useState(0);
  const [menu, setMenu] = useState<GeometryMenu>('drive');
  const [menuOpen, setMenuOpen] = useState(false);
  const [journalView, setJournalView] = useState<'calls' | 'quality'>('calls');
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selected = selectedStation === undefined ? localSelected : selectedStation - 1;
  const station = snapshot.stations[selected], stationId = selected + 1;
  const setSelected = (index: number) => { setMenuOpen(false); setLocalSelected(index); onStationChange?.((index + 1) as 1 | 2); };
  const extended = () => { setMenuOpen(false); onExtended(); };
  const toggle = (target: GeometryMenu, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setMenuOpen(current => menu === target ? !current : true);
    setMenu(target);
  };
  const triggerProps = (target: GeometryMenu) => ({
    className: cn('geometry-control-trigger', menuOpen && menu === target && 'active'),
    ariaExpanded: menuOpen && menu === target,
    ariaControls: 'geometry-quick-control-menu',
    onClick: (event: MouseEvent<HTMLButtonElement>) => toggle(target, event.currentTarget),
  });
  const tone: QuickStatusTone = !online ? 'gray' : station.error ? 'red' : station.state === 5 ? 'amber' : station.ready ? 'green' : station.enabled ? 'blue' : 'gray';
  const pending = snapshot.calls.filter(call => call.state >= 1 && call.state <= 3).length;
  const MenuIcon = MENU_ICONS[menu];
  const powerAllowed = station.recoveryRequired || (station.enabled ? station.disableAllowed : station.enableAllowed);

  return <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
    <section className={cn('machine-quick-panel geometry-quick-panel', `tone-${tone}`, className)} aria-label="Геометрический контроль" onPointerDown={event => event.stopPropagation()}>
      {dragHandle}
      <header className="machine-quick-header geometry-quick-header">
        <div className="machine-quick-summary"><h2>Геометрический контроль {stationId}</h2>
          <button className={cn('cell-readiness-trigger geometry-control-trigger geometry-quick-state', menuOpen && menu === 'readiness' && 'active')}
            type="button" aria-expanded={menuOpen && menu === 'readiness'} aria-controls="geometry-quick-control-menu"
            aria-label={`Состояние и условия включения ГК ${stationId}`} onClick={event => toggle('readiness', event.currentTarget)}>
            <Indicator active={online && tone !== 'gray'} tone={tone === 'gray' ? 'blue' : tone} />
            <span>{!online ? 'Нет связи' : GEOMETRY_STATES[station.state]}</span><ChevronDown aria-hidden="true" />
          </button>
        </div>
        <nav className="machine-quick-tabs geometry-station-tabs" aria-label="Выбор геометрического контроля">{[0, 1].map(index => <button key={index} className={selected === index ? 'active' : ''} type="button" onClick={() => setSelected(index)}>ГК {index + 1}</button>)}</nav>
        <div className="quick-panel-header-actions"><button className="extended-control extended-control--icon" type="button" onClick={extended} title="Расширенное управление ГК" aria-label="Расширенное управление ГК"><Settings /></button><button className="panel-close-button" type="button" onClick={onClose} aria-label="Закрыть"><X /></button></div>
      </header>
      <div className="machine-quick-content-row geometry-quick-content-row">
        <button className={cn('machine-quick-power', station.enabled ? 'enabled' : 'ready', !powerAllowed && 'command-unavailable')} type="button" disabled={!online} aria-disabled={!powerAllowed} onClick={() => station.recoveryRequired ? onRequestState(stationId as 1 | 2) : onCommand(geometryCommand(station.enabled ? 2 : 1, stationId))}>{station.recoveryRequired ? <CheckCircle2 /> : <Power />}<span>{station.recoveryRequired ? 'Указать состояние ГК' : station.enabled ? 'Выключить ГК' : 'Включить ГК'}</span></button>
        <div className="machine-quick-status-grid">
          <QuickStatusCard icon={Gauge} title="Конвейер" status={!online ? 'Нет связи' : station.driveAlarm || station.error ? 'Авария' : station.running ? 'В работе' : 'Остановлен'} tone={!online ? 'gray' : station.error ? 'red' : station.running ? 'green' : 'gray'} interactive {...triggerProps('drive')} />
          <QuickStatusCard icon={ScanLine} title="Деталь на ГК" status={!online ? 'Нет связи' : station.partStored ? `Станок ${station.machine} · тип ${station.productType}` : station.occupied ? 'Проверьте станцию' : 'Детали нет'} detail={station.partStored ? `#${station.partId}` : undefined} tone={!online ? 'gray' : station.partStored ? 'blue' : station.occupied ? 'amber' : 'gray'} interactive {...triggerProps('part')} />
          <QuickStatusCard icon={PackageOpen} title="Вызовы" status={!online ? 'Нет связи' : snapshot.automatic ? 'Автоматический вызов' : 'Вручную'} detail={pending ? `${pending} ждут` : '—'} tone={!online ? 'gray' : pending ? 'blue' : 'gray'} interactive {...triggerProps('calls')} />
          <QuickStatusCard icon={ClipboardList} title="Журнал контроля" status="Вызовы и результаты" detail="Все ГК" tone="gray" interactive {...triggerProps('journal')} />
        </div>
      </div>
      <Dialog.Content id="geometry-quick-control-menu" className={menu === 'readiness' ? 'cell-start-readiness geometry-context-menu geometry-readiness-menu' : 'machine-mechanism-card geometry-context-menu'} data-menu={menu} aria-describedby={undefined}
        onInteractOutside={event => { if ((event.target as HTMLElement).closest('.geometry-control-trigger')) event.preventDefault(); }}
        onOpenAutoFocus={event => event.preventDefault()}
        onCloseAutoFocus={event => { event.preventDefault(); if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true }); }}>
        {menu === 'readiness' ? <GeometryReadinessMenu key={stationId} station={station} stationId={stationId} online={online} /> : <>
        <header><span className="machine-mechanism-icon">{menu === 'drive' ? <Icon icon={conveyorIcon} /> : <MenuIcon aria-hidden="true" />}</span>
          <div><small>ГЕОМЕТРИЧЕСКИЙ КОНТРОЛЬ {stationId}</small><Dialog.Title asChild><h3>{MENU_TITLES[menu]}</h3></Dialog.Title></div>
          <button type="button" onClick={extended} aria-label="Расширенное управление ГК" title="Расширенное управление ГК"><Settings /></button>
          <Dialog.Close asChild><button type="button" aria-label="Закрыть меню ГК"><X /></button></Dialog.Close>
        </header>
        {menu === 'drive' && <GeometryDriveMenu station={station} stationId={stationId} online={online} onCommand={onCommand} />}
        {menu === 'part' && <GeometryPartMenu station={station} stationId={stationId} online={online} simulation={simulation} onCommand={onCommand} />}
        {menu === 'calls' && <GeometryCallsMenu snapshot={snapshot} online={online} onCommand={onCommand} onJournal={() => { setJournalView('calls'); setMenu('journal'); }} />}
        {menu === 'journal' && <GeometryJournalMenu authorized={authorized} view={journalView} onViewChange={setJournalView} />}
        <GeometryConnectionNotice online={online} supported={snapshot.supported} />
        </>}
      </Dialog.Content>
    </section>
  </Dialog.Root>;
}

export function GeometryCellSettings({ snapshot = EMPTY_GEOMETRY_SNAPSHOT, online, onCommand, timeouts = false }: { snapshot?: GeometrySnapshot; online: boolean; onCommand: Command; timeouts?: boolean }) {
  const setting = (index: number, value: number) => onCommand(geometryCommand(16, 0, index, value));
  const timings = [
    { id: 2, value: snapshot.transportSeconds, label: 'Доставка детали до датчика, с', min: 1, max: 600, step: 0.1 },
    { id: 3, value: snapshot.feedbackSeconds, label: 'Подтверждение пуска / останова, с', min: 0.1, max: 60, step: 0.1 },
    { id: 4, value: snapshot.resetSeconds, label: 'Импульс сброса аварии, с', min: 0.1, max: 10, step: 0.1 },
    { id: 5, value: snapshot.waitWarningSeconds, label: 'Ожидание свободного ГК до предупреждения, с', min: 1, max: 3600, step: 1 },
  ];
  return <section className="geometry-cell-settings">
    <h3>{timeouts ? 'Геометрический контроль' : 'Если ГК недоступен после взятия детали'}</h3>
    {timeouts ? <div className="cell-settings-grid">{timings.map(({ id, value, label, min, max, step }) =>
      <NumberDraft online={online} allowed={snapshot.settingsAllowed} key={id} label={label} min={min} max={max} step={step} value={value}
        onApply={v => setting(id, Math.round(v * 1000))} />)}</div>
      : <><select disabled={!online} aria-disabled={!snapshot.settingsAllowed} value={snapshot.waitWhenOccupied ? 1 : 0} onChange={e => setting(1, Number(e.target.value))}>
        <option value={1}>Ждать освобождения любого ГК</option><option value={0}>Уложить в магазин с предупреждением</option>
      </select><p className="panel-note">До взятия вызванная деталь остаётся в станке, пока не появится свободный ГК.</p></>}
    <p className="panel-note">{snapshot.settingsAllowed ? 'Настройка применяется в PLC.' : 'Остановите ячейку и приводы ГК для изменения настройки.'}</p>
  </section>;
}

export function GeometryRecoveryPrompt({ snapshot, online, onCommand, requestedStation = null, onClose }: {
  snapshot?: GeometrySnapshot; online: boolean; onCommand: Command; requestedStation?: 1 | 2 | null; onClose: () => void;
}) {
  const activeIndex = snapshot?.stations.findIndex(s => s.confirmationActive) ?? -1;
  const requested = requestedStation ? snapshot?.stations[requestedStation - 1] : undefined;
  useEffect(() => {
    if (requested && !requested.recoveryRequired && !requested.confirmationActive) onClose();
  }, [requested?.recoveryRequired, requested?.confirmationActive, onClose]);
  const index = activeIndex >= 0 ? activeIndex : requested?.recoveryRequired ? requestedStation! - 1 : -1;
  if (!snapshot || index < 0) return null;
  const station = snapshot.stations[index];
  const reject = () => { onCommand(geometryCommand(4, index + 1)); onClose(); };
  const confirmBlocker = geometryReadinessConditions(station, online, 'confirm').find(condition => !condition.ready);
  const confirmationStatus = !online ? 'Нет связи с PLC.'
    : !station.confirmAllowed && confirmBlocker ? `Подтверждение недоступно: ${confirmBlocker.blocked}`
      : 'Подтверждение относится ко всей ленте, включая участок до датчика.';
  return <OperatorConfirmationLayout title={`ГК ${index + 1}`} context={station.confirmationActive ? 'Включение геометрического контроля' : 'Состояние геометрического контроля'} description="После выключения, аварии или перезапуска нужно вручную проверить всю ленту." icon={<Icon icon={conveyorIcon} />} steps={['Проверить станцию', 'Указать состояние']} step={2} cancelLabel={station.confirmationActive ? 'Не включать' : 'Закрыть'} status={confirmationStatus} cancelDisabled={!online} onCancel={station.confirmationActive ? reject : onClose}>
    <h3>Укажите состояние станции ГК</h3><div className="confirmation-choices"><ConfirmationChoice icon={<CheckCircle2 />} title="Станция свободна" description={station.confirmationActive ? 'Станция проверена; включить ГК' : 'Вся лента проверена; ГК останется выключенным'} className={!station.confirmAllowed ? 'geometry-muted' : ''} disabled={!online} onClick={() => onCommand(geometryCommand(3, index + 1))} /><ConfirmationChoice icon={<PackageOpen />} title="Деталь ещё в ГК" description="Оставить ГК выключенным; убрать деталь вручную" disabled={!online} onClick={reject} /></div>{station.partAtEnd && <p><TriangleAlert size={18} /> Уберите деталь из станции ГК.</p>}
  </OperatorConfirmationLayout>;
}
