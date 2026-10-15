import { useEffect, useState, type ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { Icon } from '@iconify/react';
import machineIcon from '@iconify-icons/material-symbols/microwave-gen-outline';
import { PackageOpen, Play, Square, TriangleAlert, X } from 'lucide-react';
import type { PlcCommand } from '../../plc/client';
import { GEOMETRY_CALL_STATES, GEOMETRY_REASONS, type GeometryHistoryCall, type GeometrySnapshot, type GeometryStation } from '../../model/geometryControl';
import { gatewayApiUrl } from '../../api/gateway';
import { cn } from '../../lib/utils';
import { Indicator } from '../ui/Indicator';
import { SegmentedControl, ToggleSwitch } from '../ui/ControlPrimitives';

export type GeometryCommand = (command: PlcCommand) => void;
export const geometryCommand = (action: number, magazine = 0, machine = 0, value = 0): PlcCommand => ({ command: 'geometry.command', action, magazine, machine, value });

const commandButton = cva('geometry-command-button', {
  variants: { variant: { secondary: '', primary: 'geometry-command-button--primary', called: 'geometry-command-button--called', cancel: 'geometry-command-button--cancel', stop: 'geometry-command-button--stop' } },
  defaultVariants: { variant: 'secondary' },
});

export function GeometryCommandButton({ children, online, allowed = true, disabled = false, variant, onClick, className }: {
  children: ReactNode; online: boolean; allowed?: boolean; disabled?: boolean; variant?: 'secondary' | 'primary' | 'called' | 'cancel' | 'stop'; onClick: () => void; className?: string;
}) {
  return <button type="button" className={cn(commandButton({ variant }), !allowed && 'command-unavailable', className)}
    disabled={!online || disabled} aria-disabled={!online || disabled || !allowed} onClick={onClick}>{children}</button>;
}

export function NumberDraft({ value, onApply, label, min = 1, max = 10000, step = 1, online = true, allowed = true, applyLabel = 'Применить' }: {
  value: number; onApply: (value: number) => void; label: string; min?: number; max?: number; step?: number; online?: boolean; allowed?: boolean; applyLabel?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <div className="geometry-number">
    <label><span>{label}</span><input aria-label={label} type="number" min={min} max={max} step={step} disabled={!online}
      value={draft} onChange={e => setDraft(Number(e.target.value))} /></label>
    <GeometryCommandButton online={online} allowed={allowed} onClick={() => onApply(draft)}>{applyLabel}</GeometryCommandButton>
  </div>;
}

export function GeometryConnectionNotice({ online, supported }: { online: boolean; supported: boolean }) {
  if (online && supported) return null;
  return <p className="geometry-message"><TriangleAlert aria-hidden="true" />
    {online ? 'Управление ГК доступно с интерфейсом SoftMotion.' : 'Нет связи с PLC. Управление недоступно.'}
  </p>;
}

function FeedbackRow({ label, value, active = false, tone = 'blue' }: {
  label: string; value: ReactNode; active?: boolean; tone?: 'blue' | 'green' | 'amber' | 'red';
}) {
  return <div className="geometry-feedback-row"><span><Indicator active={active} tone={tone} />{label}</span><strong>{value}</strong></div>;
}

export function GeometryDriveSignals({ station, online }: { station: GeometryStation; online: boolean }) {
  return <div className="geometry-feedback-list">
    <FeedbackRow label="Конвейер" value={!online ? 'Нет данных' : station.running ? 'В работе' : 'Остановлен'} active={online && station.running} tone="green" />
    <FeedbackRow label="Датчик детали" value={!online ? 'Нет данных' : station.partAtEnd ? 'Деталь у датчика' : 'Выключен'} active={online && station.partAtEnd} />
    <FeedbackRow label="Авария привода" value={!online ? 'Нет данных' : station.driveAlarm ? 'Активна' : 'Нет'} active={online && station.driveAlarm} tone="red" />
  </div>;
}

export function GeometryDriveMenu({ station, stationId, online, onCommand }: {
  station: GeometryStation; stationId: number; online: boolean; onCommand: GeometryCommand;
}) {
  return <>
    <GeometryDriveSignals station={station} online={online} />
    <div className="geometry-menu-actions">
      <GeometryCommandButton online={online} allowed={station.manualStartAllowed} variant="primary" onClick={() => onCommand(geometryCommand(5, stationId))}><Play />Пуск вручную</GeometryCommandButton>
      <GeometryCommandButton online={online} variant="stop" onClick={() => onCommand(geometryCommand(6, stationId))}><Square />Стоп</GeometryCommandButton>
    </div>
    <p className="geometry-menu-note">{station.resetBusy ? 'Идёт импульс сброса аварии привода.' : 'Сброс аварии — общей кнопкой в журнале событий.'}</p>
  </>;
}

export function GeometryPartMenu({ station, stationId, online, simulation, onCommand }: {
  station: GeometryStation; stationId: number; online: boolean; simulation: boolean; onCommand: GeometryCommand;
}) {
  const known = online && station.partStored;
  return <>
    <div className={cn('geometry-part-summary', known && 'has-part')}>
      <span className="geometry-part-summary__icon"><PackageOpen aria-hidden="true" /></span>
      <div><span>{!online ? 'Нет данных' : known ? 'Деталь на контроле' : station.occupied ? 'Проверьте всю ленту' : 'Станция свободна'}</span>
        <strong>{known ? `#${station.partId}` : !online ? 'Нет связи' : station.occupied ? 'Нужно подтверждение' : 'Детали нет'}</strong></div>
    </div>
    <div className="geometry-feedback-list">
      <FeedbackRow label="Станок" value={known ? `Станок ${station.machine}` : '—'} active={known} />
      <FeedbackRow label="Тип детали" value={known ? `Тип ${station.productType}` : '—'} active={known} />
      <FeedbackRow label="Положение" value={!online ? 'Нет данных' : station.partAtEnd ? 'У конечного датчика' : known ? 'На ленте' : '—'} active={online && station.partAtEnd} tone="green" />
    </div>
    {known && <div className="geometry-part-travel"><span>Доставка по ленте<strong>{station.partAtEnd ? 'Завершена' : 'До конечного датчика'}</strong></span>
      <div><i style={{ width: `${station.partAtEnd ? 100 : Math.max(0, Math.min(1, station.travel)) * 100}%` }} /></div>
    </div>}
    {simulation && <div className="geometry-menu-actions geometry-menu-actions--single">
      <GeometryCommandButton online={online} allowed={station.simulationRemoveAllowed} onClick={() => onCommand(geometryCommand(7, stationId))}><PackageOpen />Изъять деталь</GeometryCommandButton>
    </div>}
    {online && station.occupied && !station.partStored && <p className="geometry-message"><TriangleAlert />Освобождение всей ленты не подтверждено.</p>}
  </>;
}

const callCard = cva('geometry-call-card', {
  variants: { called: { true: 'geometry-call-card--called', false: '' } },
});

function GeometryMachineCallCard({ snapshot, index, online, onCommand }: {
  snapshot: GeometrySnapshot; index: number; online: boolean; onCommand: GeometryCommand;
}) {
  const call = snapshot.calls[index], period = snapshot.periods[index], count = snapshot.counts[index];
  const pending = call.state >= 1 && call.state <= 3;
  const called = online && pending;
  const canCancel = online && snapshot.cancelAllowed[index];
  const status = !online ? 'Нет связи' : called ? 'Деталь вызвана' : 'Деталь не вызвана';
  return <article className={callCard({ called })} aria-label={`Вызов детали со станка ${index + 1}`}>
    <header><span className="geometry-call-machine-icon"><Icon icon={machineIcon} aria-hidden="true" /></span>
      <div><h4>Станок {index + 1}</h4><span className="geometry-call-status"><i aria-hidden="true" />{status}</span></div>
    </header>
    <div className="geometry-call-counter">
      <span>Счётчик деталей</span><div><b>{online ? count.toLocaleString('ru-RU') : '—'}</b><span>/ {period.toLocaleString('ru-RU')}</span></div>
      <div className="geometry-call-progress"><i style={{ width: `${online && period > 0 ? Math.max(0, Math.min(100, count / period * 100)) : 0}%` }} /></div>
    </div>
    <NumberDraft online={online} allowed={snapshot.autoChangeAllowed} label={`Период станка ${index + 1}, деталей`} value={period}
      onApply={value => onCommand(geometryCommand(10, 0, index + 1, value))} />
    <GeometryCommandButton online={online} allowed={canCancel || snapshot.callAllowed[index]} disabled={!canCancel && !snapshot.callAllowed[index]}
      variant={canCancel ? 'cancel' : called ? 'called' : 'primary'} className="geometry-call-submit"
      onClick={() => onCommand(geometryCommand(canCancel ? 12 : 8, 0, index + 1))}>
      {canCancel ? <X /> : <PackageOpen />}{canCancel ? 'Отменить' : called ? 'Уже вызвана' : 'Вызвать на ГК'}
    </GeometryCommandButton>
    <footer><span>{online && call.id ? `#${call.id}${call.productType ? ` · тип ${call.productType}` : ''}${call.station ? ` · ГК ${call.station}` : pending ? ' · ГК выберет ячейка' : ''}` : 'ГК выберет ячейка'}
      {online && call.reason > 0 && <small>{GEOMETRY_REASONS[call.reason]}</small>}</span>
    </footer>
  </article>;
}

export function GeometryCallsMenu({ snapshot, online, onCommand, onJournal }: {
  snapshot: GeometrySnapshot; online: boolean; onCommand: GeometryCommand; onJournal: () => void;
}) {
  return <div className="geometry-calls-menu">
    <div className="geometry-call-toolbar">
      <ToggleSwitch checked={snapshot.automatic} disabled={!online} className={!snapshot.autoChangeAllowed ? 'command-unavailable' : ''}
        label="Автоматический вызов" description={snapshot.automatic ? 'По счётчикам станков' : 'Вызов деталей вручную'}
        onChange={enabled => onCommand(geometryCommand(9, 0, 0, Number(enabled)))} />
      <NumberDraft online={online} allowed={snapshot.autoChangeAllowed} label="Общий период, деталей" value={snapshot.periods[0]}
        applyLabel="Для всех станков" onApply={value => onCommand(geometryCommand(10, 0, 0, value))} />
    </div>
    <div className="geometry-call-cards">{snapshot.calls.map((_, index) => <GeometryMachineCallCard key={index} snapshot={snapshot} index={index} online={online} onCommand={onCommand} />)}</div>
    <div className="geometry-call-menu-footer"><span>Принудительный вызов обнуляет счётчик станка.</span><button className="geometry-text-button" type="button" onClick={onJournal}>Журнал вызовов</button></div>
  </div>;
}

const date = (value: number) => new Date(value).toLocaleString('ru-RU');

function GeometryJournal({ station, history, authorized }: { station: number; history: boolean; authorized: boolean }) {
  const [rows, setRows] = useState<GeometryHistoryCall[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(gatewayApiUrl(`/api/geometry-control?station=${station}&history=${history ? 1 : 0}`), { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setRows(data.calls); setError(data.error || '');
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Журнал недоступен'); }
    };
    void load();
    const timer = setInterval(load, 1500);
    return () => { controller.abort(); clearInterval(timer); };
  }, [station, history, busy]);
  const result = async (row: GeometryHistoryCall, value: GeometryHistoryCall['result']) => {
    setBusy(row.key);
    try {
      const response = await fetch(gatewayApiUrl('/api/geometry-control/result'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: row.key, result: value, revision: row.revision }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить результат'); }
    finally { setBusy(null); }
  };
  return <div className="geometry-journal">
    {error && <p className="geometry-message" role="status"><TriangleAlert />{error}</p>}
    <table><thead><tr><th>Вызов / время</th><th>Деталь</th><th>ГК / состояние</th><th>{history ? 'Результат' : 'Назначение'}</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}>
      <td><b>#{row.id} · {row.forced ? 'Принудительно' : 'Автоматически'}</b><small>{date(row.createdAt)}{row.environment !== 0 && ' · симуляция'}</small></td>
      <td>Станок {row.machine}<small>Тип {row.productType}</small></td>
      <td>{row.station ? `ГК ${row.station}` : 'Выбирает ячейка'}<small>{GEOMETRY_CALL_STATES[row.state]}{row.reason ? ` · ${GEOMETRY_REASONS[row.reason]}` : ''}</small></td>
      <td>{row.state === 5 && <small>Магазин {row.magazine}{row.pallet ? ` · П${row.pallet}` : ''} · слот {row.slot}</small>}
        {history ? <><select aria-label={`Результат вызова ${row.id}`} disabled={!authorized || busy === row.key} value={row.result} onChange={e => void result(row, e.target.value as GeometryHistoryCall['result'])}>
          <option value="unchecked">Не проверена</option><option value="good">Годная</option><option value="defect">Брак</option>
        </select>{row.results.length > 0 && <details><summary>История отметок</summary>{row.results.map(r => <small key={r.revision}>{date(r.timestampMs)} · {r.actorName} · {r.result === 'good' ? 'Годная' : r.result === 'defect' ? 'Брак' : 'Не проверена'}</small>)}</details>}</> : row.state !== 5 ? '—' : null}
      </td>
    </tr>)}</tbody></table>
    {rows.length === 0 && <p className="geometry-menu-note geometry-journal-empty">Записей пока нет</p>}
  </div>;
}

export function GeometryJournalMenu({ authorized, view, onViewChange }: {
  authorized: boolean; view: 'calls' | 'quality'; onViewChange: (view: 'calls' | 'quality') => void;
}) {
  const [filter, setFilter] = useState(0);
  return <div className="geometry-journal-menu">
    <div className="geometry-journal-toolbar">
      <SegmentedControl value={view} options={[{ value: 'calls', label: 'Журнал вызовов' }, { value: 'quality', label: 'Результаты контроля' }]}
        onChange={value => onViewChange(value as 'calls' | 'quality')} ariaLabel="Журнал геометрического контроля" />
      <label className="geometry-filter"><span>Станция</span><select value={filter} onChange={e => setFilter(Number(e.target.value))}><option value={0}>Все ГК</option><option value={1}>ГК 1</option><option value={2}>ГК 2</option></select></label>
    </div>
    <GeometryJournal key={`${filter}-${view}`} station={filter} history={view === 'quality'} authorized={authorized} />
  </div>;
}
