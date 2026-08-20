import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, CheckCircle2, Filter, LoaderCircle, Pause, Play,
  RefreshCw, Search, SlidersHorizontal, X,
} from 'lucide-react';
import type { CellLogEvent } from '../plc/client';

const SOURCES = [
  [1, 'Станок 1'], [2, 'Станок 2'], [3, 'Станок 3'], [4, 'Магазин'],
  [5, 'Робот'], [6, 'Оператор'], [7, 'Аварии'], [8, 'Система и связь'],
] as const;

const STATUS_LABELS: Record<string, string> = {
  changed: 'Изменено', started: 'Начато', requested: 'Запрошено', accepted: 'Принято',
  completed: 'Завершено', active: 'Активно', restored: 'Восстановлено', stopped: 'Остановлено',
  rejected: 'Отклонено', error: 'Ошибка', lost: 'Потеряно', warning: 'Предупреждение',
};

const CATEGORY_TYPES: Record<string, string[]> = {
  cycle: ['cell-cycle'],
  equipment: ['power', 'state', 'door', 'chuck', 'processing'],
  robot: ['command', 'action', 'target-point', 'current-point', 'gripper', 'orientation', 'modbus-command'],
  product: ['part', 'operation', 'slot-content'],
  connection: ['connection', 'modbus-connection'],
  operator: ['operator-command', 'plc-rejection'],
  alarm: ['alarm', 'warning'],
};

const STATE_STATUSES: Record<string, string[]> = {
  active: ['active', 'started', 'accepted', 'requested'],
  completed: ['completed', 'restored', 'stopped'],
  rejected: ['rejected', 'error', 'lost', 'warning'],
  changed: ['changed'],
};

const PAGE_SIZE = 150;
const TABLE_HEADER_HEIGHT = 37;
const EVENT_ROW_HEIGHT = 58;
const EVENT_ROW_OVERSCAN = 8;

interface CellEventPage {
  serverTime: number;
  retentionMs: number;
  total: number;
  events: CellLogEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

const sourceTone = (sourceId: number) => sourceId === 7 ? 'alarm' : sourceId === 6 ? 'operator' : sourceId === 8 ? 'system' : `source-${sourceId}`;
const formatDate = (timestamp: number) => new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(timestamp);
const formatTime = (timestamp: number) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }).format(timestamp);
const dateTimeInputValue = (timestamp: number) => {
  const date = new Date(timestamp);
  const local = new Date(timestamp - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const mergeEvents = (primary: CellLogEvent[], secondary: CellLogEvent[]) => {
  const ids = new Set<number>();
  return [...primary, ...secondary].filter((event) => {
    if (ids.has(event.id)) return false;
    ids.add(event.id);
    return true;
  });
};
const errorText = async (response: Response) => {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { error?: string };
    return body.error || `HTTP ${response.status}`;
  } catch { return text || `HTTP ${response.status}`; }
};

export function CellEventLog({ liveEvent, online, onClose, className }: {
  liveEvent: CellLogEvent | null;
  online: boolean;
  onClose: () => void;
  className?: string;
}) {
  const now = Date.now();
  const [sourceFilters, setSourceFilters] = useState<number[]>([]);
  const [textFilter, setTextFilter] = useState('');
  const [debouncedText, setDebouncedText] = useState('');
  const [period, setPeriod] = useState('8');
  const [customFrom, setCustomFrom] = useState(() => dateTimeInputValue(now - 8 * 3_600_000));
  const [customTo, setCustomTo] = useState(() => dateTimeInputValue(now));
  const [level, setLevel] = useState('all');
  const [category, setCategory] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [operationId, setOperationId] = useState('');
  const [commandSeq, setCommandSeq] = useState('');
  const [code, setCode] = useState('');
  const [events, setEvents] = useState<CellLogEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [live, setLive] = useState(true);
  const [pendingLive, setPendingLive] = useState(0);
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(360);
  const tableRef = useRef<HTMLDivElement>(null);
  const activeQueryRef = useRef('');
  const activeRangeRef = useRef({ fromMs: 0, toMs: Number.MAX_SAFE_INTEGER });
  const loadingMoreRef = useRef(false);
  const liveBufferRef = useRef<CellLogEvent[]>([]);
  const lastLiveIdRef = useRef<number | null>(liveEvent?.id ?? null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedText(textFilter.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [textFilter]);

  const eventTypes = useMemo(() => CATEGORY_TYPES[category] ?? [], [category]);
  const statuses = useMemo(() => STATE_STATUSES[stateFilter] ?? [], [stateFilter]);
  const queryIdentity = JSON.stringify({
    sourceFilters, text: debouncedText, period, customFrom, customTo, level, category,
    stateFilter, order, operationId: operationId.trim(), commandSeq: commandSeq.trim(), code: code.trim(), refreshSequence,
  });

  const buildBaseQuery = useCallback(() => {
    const timestamp = Date.now();
    const customFromMs = new Date(customFrom).getTime();
    const customToMs = new Date(customTo).getTime();
    const fromMs = period === 'all' ? 0 : period === 'custom'
      ? (Number.isFinite(customFromMs) ? customFromMs : timestamp - 8 * 3_600_000)
      : timestamp - Number(period) * 3_600_000;
    const toMs = period === 'custom' && Number.isFinite(customToMs) ? customToMs : timestamp;
    activeRangeRef.current = { fromMs, toMs: period === 'custom' ? toMs : Number.MAX_SAFE_INTEGER };
    const parameters = new URLSearchParams({
      from: String(fromMs), to: String(toMs), limit: String(PAGE_SIZE), level, order,
    });
    if (sourceFilters.length) parameters.set('sources', sourceFilters.join(','));
    if (statuses.length) parameters.set('statuses', statuses.join(','));
    if (eventTypes.length) parameters.set('eventTypes', eventTypes.join(','));
    if (debouncedText) parameters.set('text', debouncedText);
    if (operationId.trim()) parameters.set('operationId', operationId.trim());
    if (commandSeq.trim()) parameters.set('commandSeq', commandSeq.trim());
    if (code.trim()) parameters.set('code', code.trim());
    return parameters.toString();
  }, [code, commandSeq, customFrom, customTo, debouncedText, eventTypes, level, operationId, order, period, sourceFilters, statuses]);

  useEffect(() => {
    const controller = new AbortController();
    const baseQuery = buildBaseQuery();
    activeQueryRef.current = baseQuery;
    liveBufferRef.current = [];
    setEvents([]);
    setNextCursor(null);
    setLoading(true);
    setLoadError('');
    setPendingLive(0);
    setScrollTop(0);
    if (tableRef.current) tableRef.current.scrollTop = 0;
    void fetch(`/api/cell-events?${baseQuery}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(await errorText(response));
      return response.json() as Promise<CellEventPage>;
    }).then((page) => {
      if (activeQueryRef.current !== baseQuery) return;
      const buffered = liveBufferRef.current;
      const combined = order === 'desc' ? mergeEvents(buffered, page.events) : page.events;
      setEvents(combined);
      setTotal(Math.max(page.total, combined.length));
      setNextCursor(page.nextCursor);
    }).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLoadError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (activeQueryRef.current === baseQuery) setLoading(false);
    });
    return () => controller.abort();
  // queryIdentity intentionally provides one stable dependency for all filters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryIdentity]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const baseQuery = activeQueryRef.current;
    const parameters = new URLSearchParams(baseQuery);
    parameters.set('cursor', nextCursor);
    try {
      const response = await fetch(`/api/cell-events?${parameters}`);
      if (!response.ok) throw new Error(await errorText(response));
      const page = await response.json() as CellEventPage;
      if (activeQueryRef.current !== baseQuery) return;
      setEvents((current) => mergeEvents(current, page.events));
      setTotal(page.total);
      setNextCursor(page.nextCursor);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [nextCursor]);

  const eventMatches = useCallback((event: CellLogEvent) => {
    const { fromMs, toMs } = activeRangeRef.current;
    if (event.timestampMs < fromMs || event.timestampMs > toMs) return false;
    if (sourceFilters.length && !sourceFilters.includes(event.sourceId)) return false;
    if (statuses.length && !statuses.includes(event.status)) return false;
    if (eventTypes.length && !eventTypes.includes(event.eventType)) return false;
    const isError = event.eventType === 'alarm' || ['error', 'rejected', 'lost'].includes(event.status);
    const isWarning = event.eventType === 'warning' || event.status === 'warning';
    if (level === 'error' && !isError) return false;
    if (level === 'warning' && !isWarning) return false;
    if (level === 'info' && (isError || isWarning)) return false;
    if (operationId.trim() && event.operationId !== operationId.trim()) return false;
    if (commandSeq.trim() && String(event.commandSeq ?? '') !== commandSeq.trim()) return false;
    if (code.trim() && String(event.code ?? '') !== code.trim()) return false;
    if (debouncedText) {
      const haystack = `${event.message} ${event.eventType} ${event.code ?? ''} ${event.operationId ?? ''} ${event.requestId ?? ''}`.toLocaleLowerCase('ru-RU');
      if (!haystack.includes(debouncedText.toLocaleLowerCase('ru-RU'))) return false;
    }
    return true;
  }, [code, commandSeq, debouncedText, eventTypes, level, operationId, sourceFilters, statuses]);

  useEffect(() => {
    if (!liveEvent || lastLiveIdRef.current === liveEvent.id) return;
    lastLiveIdRef.current = liveEvent.id;
    if (!eventMatches(liveEvent)) return;
    if (!live || order !== 'desc') {
      setPendingLive((current) => current + 1);
      return;
    }
    liveBufferRef.current = mergeEvents([liveEvent], liveBufferRef.current);
    setEvents((current) => mergeEvents([liveEvent], current));
    setTotal((current) => current + 1);
  }, [eventMatches, live, liveEvent, order]);

  useEffect(() => {
    const element = tableRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));
    observer.observe(element);
    setViewportHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  const firstVisible = Math.max(0, Math.floor(Math.max(0, scrollTop - TABLE_HEADER_HEIGHT) / EVENT_ROW_HEIGHT) - EVENT_ROW_OVERSCAN);
  const lastVisible = Math.min(events.length, Math.ceil((Math.max(0, scrollTop - TABLE_HEADER_HEIGHT) + viewportHeight) / EVENT_ROW_HEIGHT) + EVENT_ROW_OVERSCAN);
  const visibleEvents = events.slice(firstVisible, lastVisible);

  useEffect(() => {
    if (nextCursor && lastVisible >= events.length - 10) void loadMore();
  }, [events.length, lastVisible, loadMore, nextCursor]);

  const toggleSource = (sourceId: number) => setSourceFilters((current) => current.includes(sourceId)
    ? current.filter((item) => item !== sourceId)
    : [...current, sourceId].sort((left, right) => left - right));
  const refresh = () => { setPendingLive(0); setRefreshSequence((current) => current + 1); };
  const toggleLive = () => {
    if (live) { setLive(false); return; }
    setLive(true);
    refresh();
  };

  return <section className={`cell-event-panel ${className ?? ''}`} aria-label="Журнал работы ячейки">
    <header className="cell-event-heading">
      <div><h2>Журнал работы ячейки</h2><p>Серверная выборка событий оборудования, действий оператора, аварий и связи</p></div>
      <div><span className={online ? 'online' : ''}><i />{online ? live ? 'Живое обновление' : 'Обновление приостановлено' : 'Gateway не подключён к PLC'}</span><button type="button" onClick={onClose} aria-label="Закрыть журнал"><X /></button></div>
    </header>

    <div className="cell-event-toolbar">
      <label className="cell-event-search"><Search /><input value={textFilter} onChange={(event) => setTextFilter(event.target.value)} placeholder="Поиск по событию, ID операции, коду…" /></label>
      <select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Период журнала">
        <option value="1">Последний час</option><option value="8">Последние 8 часов</option>
        <option value="24">Последние сутки</option><option value="168">Последние 7 дней</option>
        <option value="custom">Произвольный период</option><option value="all">Вся история</option>
      </select>
      <select value={level} onChange={(event) => setLevel(event.target.value)} aria-label="Уровень события">
        <option value="all">Все уровни</option><option value="info">Информация</option>
        <option value="warning">Предупреждения</option><option value="error">Ошибки</option>
      </select>
      <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Категория события">
        <option value="all">Все категории</option><option value="cycle">Цикл ячейки</option>
        <option value="equipment">Механизмы станков</option><option value="robot">Робот</option>
        <option value="product">Изделия и магазин</option><option value="connection">Связь</option>
        <option value="operator">Действия оператора</option><option value="alarm">Аварии</option>
      </select>
      <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} aria-label="Состояние события">
        <option value="all">Все состояния</option><option value="active">Активные и начатые</option>
        <option value="completed">Завершённые и восстановленные</option><option value="rejected">Ошибки и отклонения</option>
        <option value="changed">Изменения</option>
      </select>
      <select value={order} onChange={(event) => setOrder(event.target.value as 'desc' | 'asc')} aria-label="Порядок событий">
        <option value="desc">Сначала новые</option><option value="asc">Сначала старые</option>
      </select>
      <button type="button" className={live ? 'active live' : ''} onClick={toggleLive}>{live ? <Pause /> : <Play />}{live ? 'Пауза' : `Продолжить${pendingLive ? ` · ${pendingLive}` : ''}`}</button>
      <button type="button" onClick={refresh}><RefreshCw />Обновить</button>
      <span><Filter />Загружено {events.length} из {total}</span>
    </div>

    {period === 'custom' && <div className="cell-event-custom-period">
      <label><span>От</span><input type="datetime-local" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
      <label><span>До</span><input type="datetime-local" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label>
    </div>}

    <details className="cell-event-advanced-filter">
      <summary><SlidersHorizontal />Точные фильтры</summary>
      <div>
        <label><span>ID операции</span><input value={operationId} onChange={(event) => setOperationId(event.target.value)} placeholder="cycle-…" /></label>
        <label><span>CommandSeq</span><input inputMode="numeric" value={commandSeq} onChange={(event) => setCommandSeq(event.target.value.replace(/\D/g, ''))} placeholder="42" /></label>
        <label><span>Код события</span><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="0" /></label>
      </div>
    </details>

    <div className="cell-event-source-filter" role="group" aria-label="Фильтр принадлежности событий">
      <button type="button" className={sourceFilters.length === 0 ? 'active' : ''} onClick={() => setSourceFilters([])}>Все</button>
      {SOURCES.map(([id, label]) => <button type="button" className={`${sourceFilters.includes(id) ? 'active ' : ''}${sourceTone(id)}`.trim()} key={id} onClick={() => toggleSource(id)}><i />{id}. {label}</button>)}
    </div>

    <div className="cell-event-table" ref={tableRef} role="region" aria-label="Хронология работы ячейки" tabIndex={0} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div className="cell-event-table-head"><span>ID</span><span>Время</span><span>Принадлежность</span><span>Событие</span><span>Статус</span><span>Связь</span></div>
      {loading && events.length === 0 ? <div className="cell-event-empty"><LoaderCircle className="spin" /><strong>Загрузка журнала</strong><span>Gateway выполняет выборку из архива.</span></div>
        : loadError && events.length === 0 ? <div className="cell-event-empty error"><AlertCircle /><strong>Журнал недоступен</strong><span>{loadError}</span><button type="button" onClick={refresh}>Повторить</button></div>
          : events.length === 0 ? <div className="cell-event-empty"><CheckCircle2 /><strong>Событий не найдено</strong><span>Измените фильтры или дождитесь новых событий.</span></div>
            : <div className="cell-event-virtual-space" style={{ height: events.length * EVENT_ROW_HEIGHT + (nextCursor ? 42 : 0) }}>
              {visibleEvents.map((event, offset) => {
                const index = firstVisible + offset;
                return <article className={`cell-event-row ${sourceTone(event.sourceId)} status-${event.status}`} key={event.id} style={{ transform: `translateY(${index * EVENT_ROW_HEIGHT}px)` }}>
                  <span className="cell-event-id">#{event.id}</span>
                  <span className="cell-event-time"><b>{formatTime(event.timestampMs)}</b><small>{formatDate(event.timestampMs)}</small></span>
                  <span className="cell-event-source"><i />{event.sourceId}. {event.source}</span>
                  <span className="cell-event-message"><b>{event.message}</b><small>{event.eventType}{event.code ? ` · код ${event.code}` : ''}</small></span>
                  <span className="cell-event-status">{['active', 'error', 'rejected', 'lost'].includes(event.status) ? <AlertCircle /> : <Activity />}{STATUS_LABELS[event.status] ?? event.status}</span>
                  <span className="cell-event-links">{event.operationId && <small>Операция <b>{event.operationId}</b></small>}{event.commandSeq !== null && <small>CommandSeq <b>{event.commandSeq}</b></small>}{event.requestId && <small>Request <b>{event.requestId.slice(0, 8)}</b></small>}</span>
                </article>;
              })}
              {nextCursor && <button className="cell-event-load-more" type="button" style={{ transform: `translateY(${events.length * EVENT_ROW_HEIGHT}px)` }} onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore && <LoaderCircle className="spin" />}{loadingMore ? 'Загрузка…' : loadError ? 'Повторить загрузку' : order === 'desc' ? 'Загрузить более ранние события' : 'Загрузить более поздние события'}
              </button>}
            </div>}
    </div>
  </section>;
}
