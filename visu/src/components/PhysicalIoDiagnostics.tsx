import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/utils';
import { Dialog } from './ui/Dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/Tabs';
import type { PlcCommand } from '../plc/client';
import { IO_BLOCK_REASONS, IO_EQUIPMENT_TYPES, IO_EVENT_KINDS, PHYSICAL_IO_SIGNALS, filterIoSignals, ioEquipmentType, ioSignalKey, ioSignalLevel,
  type IoEquipmentType, type PhysicalIoSignal, type PhysicalIoState } from '../plc/physicalIo';
import './physical-io-diagnostics.css';

const signalById = new Map(PHYSICAL_IO_SIGNALS.map((signal) => [ioSignalKey(signal), signal]));
const signalCounts = { di: PHYSICAL_IO_SIGNALS.filter((s) => s.direction === 'DI').length, do: PHYSICAL_IO_SIGNALS.filter((s) => s.direction === 'DO').length };
const timeFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
const stateClass = cva('io-signal-state', { variants: { level: { on: 'is-on', off: 'is-off', unknown: 'is-unknown' } } });

function SignalState({ value, label }: { value: boolean | null; label: string }) {
  return <div className="io-level"><span className="io-level-label">{label}</span>
    <span className={stateClass({ level: value === null ? 'unknown' : value ? 'on' : 'off' })}>
      <i aria-hidden="true" /><b>{value === null ? '—' : Number(value)}</b><span>{value === null ? 'Нет данных' : value ? 'Включён' : 'Выключен'}</span>
    </span>
  </div>;
}

function SignalCard({ signal, data, online, canSend, selected, onSelect, onCommand }: {
  signal: PhysicalIoSignal; data: PhysicalIoState; online: boolean; canSend: boolean; selected: boolean;
  onSelect: () => void; onCommand: (command: PlcCommand) => unknown;
}) {
  const isInput = signal.direction === 'DI';
  const used = ioSignalLevel(data, signal, 'used', online);
  const forced = online && data.available && (isInput ? data.forcedDi : data.forcedDo)?.[signal.index - 1] === true;
  const allowed = data.manualActive && (isInput ? data.allowed : data.allowedDo?.[signal.index - 1] === true);
  const reason = IO_BLOCK_REASONS[isInput ? data.blockReason : data.doBlockReason] ?? 'Нет разрешения PLC';
  const commandTitle = allowed ? (isInput ? 'Подменить программный вход' : 'Подать ручную команду на выход')
    : reason;
  return <article className={cn('io-signal-card', forced && 'is-forced', selected && 'is-selected')} title={signal.variable}>
    <div className="io-card-identity">
    <div className="io-card-heading"><div><span>{signal.category}</span><strong>{signal.label}</strong></div>
      <label className="io-card-select" title="Выбрать для своего набора сигналов"><input type="checkbox" aria-label={`Выбрать ${signal.category}: ${signal.label}`} checked={selected} onChange={onSelect} /></label>
    </div>
    <div className="io-card-address"><code>{signal.address}</code><span>{signal.terminal}</span></div>
    {(!signal.installed || forced) && <div className="io-card-notes">
      {!signal.installed && <span>Модуль отсутствует</span>}
      {forced && <span>{isInput ? 'Ручная подмена DI' : 'Ручное управление DO'}</span>}
    </div>}
    </div>
    <div className={cn('io-card-levels', isInput && 'has-physical')}>
      {isInput && <SignalState value={ioSignalLevel(data, signal, 'raw', online)} label="Физический вход" />}
      <SignalState value={used} label="Программное состояние" />
    </div>
    <div className="io-card-controls">
      <button type="button" role="switch" aria-checked={used === true} aria-label={`${used ? 'Выключить' : 'Включить'} ${signal.category}: ${signal.label}`}
        disabled={!canSend || used === null} aria-disabled={!canSend || !allowed || used === null}
        className={cn('io-toggle', used === true && 'is-on', !allowed && 'command-unavailable')} title={commandTitle}
        onClick={() => onCommand({ command: isInput ? 'io.override' : 'io.output', index: signal.index, value: used !== true })}>
        <span className="io-toggle-track" aria-hidden="true"><i /></span>{used ? 'Выключить' : 'Включить'}
      </button>
      {isInput && <button type="button" disabled={!canSend || !forced} title="Вернуть физический вход"
        onClick={() => onCommand({ command: 'io.release', index: signal.index })}>Снять</button>}
    </div>
  </article>;
}

export function PhysicalIoDiagnostics({ data, online, canManage, onCommand }: {
  data: PhysicalIoState; online: boolean; canManage: boolean; onCommand: (command: PlcCommand) => unknown;
}) {
  const [view, setView] = useState('signals');
  const [expanded, setExpanded] = useState(false);
  const [equipmentType, setEquipmentType] = useState<IoEquipmentType>('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);
  const [onlySelected, setOnlySelected] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const query = useDeferredValue(search);
  const commandRef = useRef(onCommand);
  commandRef.current = onCommand;
  const hasProtocol = data.epoch > 0;

  // Одна аренда на всю вкладку: переключение раздела/полноэкранного вида её не снимает.
  useEffect(() => {
    if (!online || !canManage || !hasProtocol) return;
    const heartbeat = () => commandRef.current({ command: 'io.heartbeat' });
    heartbeat();
    const timer = window.setInterval(heartbeat, 700);
    return () => {
      window.clearInterval(timer);
      commandRef.current({ command: 'io.manual.end' });
    };
  }, [online, canManage, hasProtocol]);

  const categories = useMemo(() => [...new Set(PHYSICAL_IO_SIGNALS.filter((signal) => equipmentType === 'all' || ioEquipmentType(signal) === equipmentType)
    .map((signal) => signal.category))], [equipmentType]);
  const matching = useMemo(() => filterIoSignals(PHYSICAL_IO_SIGNALS, { equipmentType, category, query }), [equipmentType, category, query]);
  const visibleSignals = useMemo(() => matching.filter((signal) => (!onlySelected || selected.has(ioSignalKey(signal)))
    && (!onlyActive || ioSignalLevel(data, signal, 'used', online) === true)), [matching, onlySelected, selected, onlyActive, data, online]);
  const visibleIds = useMemo(() => new Set(visibleSignals.map(ioSignalKey)), [visibleSignals]);
  const history = useMemo(() => [...data.history].reverse().filter((event) => visibleIds.has(ioSignalKey(event))), [data.history, visibleIds]);
  const forcedDi = data.forcedDi.filter(Boolean).length;
  const forcedDo = data.forcedDo?.filter(Boolean).length ?? 0;
  const canSend = online && canManage && data.available;
  const commonReason = !online || !data.available ? (data.error || 'Нет связи с PLC') : !canManage ? 'Просмотр · для управления войдите в аккаунт' : null;
  const toggleSelected = (signal: PhysicalIoSignal) => setSelected((current) => {
    const next = new Set(current), key = ioSignalKey(signal);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const content = <Tabs value={view} onValueChange={setView} className={cn('io-diagnostics', 'io-view-tabs', expanded && 'is-expanded')}>
    <div className="io-toolbar">
      <TabsList className="io-view-selector" aria-label="Раздел входов и выходов"><TabsTrigger value="signals">Сигналы</TabsTrigger><TabsTrigger value="history">Переключения I/O</TabsTrigger></TabsList>
      <span className="io-signal-count">{signalCounts.di} DI · {signalCounts.do} DO</span>
      <div className={cn('io-manual-control', data.manualActive && 'is-active')}>
        <span title={data.manualActive ? 'Все DO удерживают ручные уровни; возврат программе не возобновит прежние задания' : 'Для прямого управления включите ручной режим ячейки; аварии и Busy не запрещают передачу I/O'}>
          {online && data.available ? data.manualActive ? 'Ручное I/O' : 'Управляет программа' : 'Нет данных'}
          {online && data.available && forcedDi + forcedDo > 0 && ` · изменено ${forcedDi + forcedDo}`}
        </span>
        <button type="button" disabled={!canSend} aria-disabled={!canSend || (!data.manualActive && !data.manualStartAllowed)}
          className={cn('io-manual-button', !data.manualActive && !data.manualStartAllowed && 'command-unavailable')}
          title={data.manualActive ? 'Завершить ручное I/O, снять подмены DI и вернуть DO программе' : 'Запомнить текущие DO и передать I/O оператору: прежние задания будут отменены'}
          onClick={() => onCommand({ command: data.manualActive ? 'io.manual.end' : 'io.manual.begin' })}>
          {data.manualActive ? 'Вернуть управление программе' : 'Управлять сигналами вручную'}
        </button>
      </div>
      <div className="io-summary-actions">
        {online && data.emergencyActive && <span className="io-emergency-status" role="status">Экстренный останов активен</span>}
        {data.emergencyActive && <button type="button" disabled={!canSend} aria-disabled={!canSend || !data.emergencyResetAllowed}
          className={cn(!data.emergencyResetAllowed && 'command-unavailable')} title="Снять останов после остановки механизмов и восстановления безопасности. Ячейка не запускается."
          onClick={() => onCommand({ command: 'io.emergencyReset' })}>Снять останов</button>}
        {!expanded && <button type="button" onClick={() => setExpanded(true)}>Подробнее</button>}
      </div>
    </div>
    {commonReason && <p className="io-connection-note" role="status">{commonReason}</p>}
      <div className="io-diagnostics-filters">
        <input type="search" aria-label="Поиск сигнала" placeholder="Сигнал, PLC-имя, адрес…" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="Тип оборудования" value={equipmentType} onChange={(event) => { setEquipmentType(event.target.value as IoEquipmentType); setCategory('all'); }}>
          {IO_EQUIPMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
        <select aria-label="Оборудование" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Всё оборудование</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <label><input type="checkbox" checked={onlyActive} onChange={(event) => setOnlyActive(event.target.checked)} />Только включённые</label>
        <label><input type="checkbox" checked={onlySelected} onChange={(event) => setOnlySelected(event.target.checked)} />Только выбранные · {selected.size}</label>
        <button type="button" disabled={matching.length === 0} onClick={() => setSelected((current) => new Set([...current, ...matching.map(ioSignalKey)]))}>Выбрать по фильтру</button>
        <button type="button" disabled={selected.size === 0} onClick={() => { setSelected(new Set()); setOnlySelected(false); }}>Сбросить выбор</button>
      </div>
      <TabsContent value="signals" className="io-signals-content">
        <div className="io-signal-halves">
          {(['DO', 'DI'] as const).map((direction) => {
            const signals = visibleSignals.filter((signal) => signal.direction === direction);
            const allowed = direction === 'DI' ? data.allowed : data.doAllowed;
            return <section className="io-signal-half" key={direction} aria-label={direction === 'DO' ? 'Дискретные выходы' : 'Дискретные входы'}>
              <div className="io-half-heading"><strong><span className={`io-direction io-direction-${direction.toLowerCase()}`}>{direction}</span>{direction === 'DO' ? 'Выходы' : 'Входы'} <small>{signals.length}</small></strong>
                <span className={cn('io-override-permission', allowed && 'is-allowed')}
                  title={commonReason || IO_BLOCK_REASONS[direction === 'DI' ? data.blockReason : data.doBlockReason]}>{allowed ? 'Управление' : 'Просмотр'}</span>
                {direction === 'DI' && <button type="button" disabled={!canSend || forcedDi === 0}
                  onClick={() => onCommand({ command: 'io.releaseAll' })}>Снять все DI</button>}
              </div>
              <div className="io-signal-cards">{signals.map((signal) => <SignalCard key={ioSignalKey(signal)} signal={signal} data={data} online={online} canSend={canSend}
                selected={selected.has(ioSignalKey(signal))} onSelect={() => toggleSelected(signal)} onCommand={onCommand} />)}
                {signals.length === 0 && <p className="io-table-empty">{onlySelected && !selected.size ? 'Выберите сигналы и включите «Только выбранные»' : 'По этому фильтру сигналов нет'}</p>}
              </div>
            </section>;
          })}
        </div>
      </TabsContent>
      <TabsContent value="history" className="io-history-content"><section className="io-journal" aria-label="Журнал переключений входов и выходов">
        <div className="io-journal-heading"><div><strong>Переключения I/O</strong><span>Последние 100 записей PLC · общий журнал сохраняет историю · действуют фильтры выше</span></div><span>{history.length} / {data.history.length}</span></div>
        <div className="io-journal-scroll"><table className="io-journal-table"><thead><tr><th>Время</th><th>I/O</th><th>Сигнал</th><th>Изменение</th><th>Источник</th></tr></thead><tbody>
          {history.map((event) => {
            const signal = signalById.get(ioSignalKey(event));
            return <tr key={`${data.epoch}:${event.sequence}`}><td><time dateTime={new Date(event.timestampMs).toISOString()}>{timeFormat.format(event.timestampMs)}</time><small>№ {event.sequence}</small></td>
              <td><span className={`io-direction io-direction-${event.direction.toLowerCase()}`}>{event.direction}</span></td>
              <td><strong>{signal?.category} · {signal?.label ?? `Сигнал ${event.index}`}</strong><code>{signal?.address}</code></td>
              <td className="io-edge"><span>{Number(event.oldValue)}</span><span>→</span><b data-active={event.newValue}>{Number(event.newValue)}</b></td><td>{IO_EVENT_KINDS[event.kind] ?? 'Переключение'}</td></tr>;
          })}
          {history.length === 0 && <tr><td colSpan={5} className="io-table-empty">{online && data.available ? 'Переключений по выбранному фильтру нет' : 'Журнал PLC недоступен'}</td></tr>}
        </tbody></table></div>
      </section></TabsContent>
    {(data.error || data.archiveError || !data.mappingVerified) && <p className="io-journal-note">{data.error || data.archiveError || 'Физическая привязка ещё не подтверждена. Клеммы DI показаны без данных; DO отображают команду PLC.'}</p>}
  </Tabs>;

  return expanded ? <Dialog open onOpenChange={setExpanded} title="Входы и выходы" className="io-expanded-dialog">{content}</Dialog> : content;
}
