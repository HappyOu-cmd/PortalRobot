import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import arrowLeftIcon from '@iconify-icons/mdi/arrow-left';
import cubeScanIcon from '@iconify-icons/mdi/cube-scan';
import closeIcon from '@iconify-icons/mdi/close';
import { Select } from './ui/Select';
import { Tooltip } from './ui/Tooltip';
import { gatewayApiUrl } from '../api/gateway';
import { ALARM_EFFECT_LABELS, formatAlarmJournalMessage, type CellLogEvent } from '../plc/client';
import {
  equipmentHistoryMatches, equipmentHistoryPrefixes, equipmentNodes, inspectionKey, inspectionTitle,
  INSPECTION_TARGETS, NODE_LABELS, type EquipmentInspection, type InspectionNode, type InspectionTarget,
} from '../model/equipmentInspection';
import { equipmentGuidance } from '../model/equipmentGuidance';
import '../styles/equipment-inspector.css';

const dateTime = (timestamp: number) => new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
}).format(timestamp);
const historyMessage = (event: CellLogEvent) => formatAlarmJournalMessage(event.eventType, event.status, event.code) ?? event.message;
const observedOnConnect = (event: CellLogEvent) => (event.details as { observedOnConnect?: boolean } | null)?.observedOnConnect === true;

function useEquipmentHistory(target: InspectionTarget, liveEvent: CellLogEvent | null, enabled: boolean, connected: boolean, issueSignature: string) {
  const [history, setHistory] = useState<{ key: string; events: CellLogEvent[] }>({ key: '', events: [] });
  const [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const key = inspectionKey(target);
  const buffer = useRef<CellLogEvent[]>([]);
  useEffect(() => {
    buffer.current = [];
    if (!enabled) { setStatus('История локальной модели не сохраняется в журнал PLC.'); return; }
    const controller = new AbortController();
    setStatus('Загрузка истории…');
    const params = new URLSearchParams({ codePrefixes: equipmentHistoryPrefixes(target).join(','),
      eventTypes: 'alarm,equipment-diagnostic', statuses: 'active', order: 'desc', limit: '12' });
    void fetch(gatewayApiUrl(`/api/cell-events?${params}`), { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`Журнал недоступен (HTTP ${response.status})`);
      const result = await response.json() as { events: CellLogEvent[]; appliedCodePrefixes?: string[] };
      if (!Array.isArray(result.appliedCodePrefixes)) throw new Error('Перезапустите обновлённый gateway для истории осмотра');
      if (controller.signal.aborted) return;
      const events = [...buffer.current, ...result.events];
      setHistory({ key, events: [...new Map(events.map((event) => [event.id, event])).values()]
        .filter((event) => equipmentHistoryMatches(target, event)).sort((a, b) => b.timestampMs - a.timestampMs || b.id - a.id).slice(0, 12) });
      setStatus('');
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'Журнал недоступен');
    });
    return () => controller.abort();
  }, [key, enabled, connected, issueSignature, revision]);
  useEffect(() => {
    if (!enabled || !liveEvent || !equipmentHistoryMatches(target, liveEvent)) return;
    buffer.current = [liveEvent, ...buffer.current].slice(0, 12);
    setHistory((previous) => ({ key, events: [liveEvent, ...(previous.key === key ? previous.events : [])
      .filter((event) => event.id !== liveEvent.id)].sort((a, b) => b.timestampMs - a.timestampMs || b.id - a.id).slice(0, 12) }));
  }, [key, enabled, liveEvent]);
  return { events: enabled && history.key === key ? history.events : [], status, retry: () => setRevision((value) => value + 1) };
}

interface Props {
  inspection: EquipmentInspection;
  closing: boolean;
  dataMode: 'live' | 'stale' | 'local';
  liveEvent: CellLogEvent | null;
  slot: number | null;
  onTarget: (target: InspectionTarget) => void;
  onNode: (node: InspectionNode | null) => void;
  onXray: (enabled: boolean) => void;
  onClose: () => void;
}

export function EquipmentInspector({ inspection, closing, dataMode, liveEvent, slot, onTarget, onNode, onXray, onClose }: Props) {
  const { target, issues, selectedNode, xray } = inspection;
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const key = inspectionKey(target);
  const issueSignature = issues.filter((issue) => issue.severity === 'alarm').map((issue) => issue.key).join('|');
  const { events: history, status: historyStatus, retry } = useEquipmentHistory(target, liveEvent,
    dataMode !== 'local', dataMode === 'live', issueSignature);
  const lastEvent = history[0];
  const alarms = issues.filter((issue) => issue.severity === 'alarm');
  const warnings = issues.length - alarms.length;
  const affected = new Set(alarms.map((issue) => issue.node));
  const nodes = equipmentNodes(target);
  const selectedIssue = issues.find((issue) => issue.key === expandedIssue && (!selectedNode || issue.node === selectedNode))
    ?? issues.find((issue) => selectedNode && issue.node === selectedNode) ?? issues[0];
  const guidance = selectedIssue ? equipmentGuidance(selectedIssue) : null;
  const showHistoryStatus = historyStatus && (historyStatus !== 'Загрузка истории…' || !lastEvent);

  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { setExpandedIssue(null); setHistoryOpen(false); }, [key]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return <>
    <div className={`inspection-toolbar${closing ? ' is-closing' : ''}`}>
      <button type="button" onClick={onClose}><Icon icon={arrowLeftIcon} />Вся ячейка</button>
      <span>Осмотр оборудования</span>
      <Tooltip content="Приблизить всё выбранное оборудование"><button type="button" onClick={() => onNode(null)} aria-label="Показать оборудование целиком"><Icon icon={cubeScanIcon} /></button></Tooltip>
    </div>
    <div className="inspection-scene-caption" aria-hidden="true">
      <span><i className="fault" />Узел в аварии</span><span><i />Выбранный узел</span>
      <small>Перетаскивание — вращение · колесо / жест — масштаб</small>
    </div>
    <aside className={`equipment-inspector${closing ? ' is-closing' : ''}`} aria-label={`Диагностика: ${inspectionTitle(target)}`}>
      <header className="inspection-heading">
        <div><span className="inspection-eyebrow">ДИАГНОСТИКА ОБОРУДОВАНИЯ</span><h2>{inspectionTitle(target)}</h2></div>
        <button ref={closeRef} className="inspection-close" type="button" onClick={onClose} aria-label="Закрыть осмотр"><Icon icon={closeIcon} /></button>
      </header>
      <Select value={key} onValueChange={(value) => { const next = INSPECTION_TARGETS.find((item) => inspectionKey(item) === value); if (next) onTarget(next); }}
        options={INSPECTION_TARGETS.map((item) => ({ value: inspectionKey(item), label: inspectionTitle(item) }))} ariaLabel="Осматриваемое оборудование" className="inspection-equipment-select" />
      <div className={`inspection-connection ${dataMode}`} role="status"><i />{dataMode === 'live' ? 'Данные PLC' : dataMode === 'stale' ? 'Связь потеряна · последние полученные данные' : 'Локальная модель · не данные PLC'}</div>
      <div className="inspection-scroll">
        <div className="inspection-metrics">
          <div className={alarms.length ? 'has-fault' : ''}><strong>{alarms.length}</strong><span>Аварий сейчас</span></div>
          <div className={warnings ? 'has-warning' : ''}><strong>{warnings}</strong><span>Предупреждений</span></div>
          <div><strong>{affected.size}</strong><span>Затронуто узлов</span></div>
        </div>
        <section className="inspection-last-event">
          <span className="inspection-eyebrow">ПОСЛЕДНЯЯ АВАРИЯ</span>
          <strong>{lastEvent ? dateTime(lastEvent.timestampMs) : historyStatus || 'В доступной истории аварий нет'}</strong>
          {lastEvent && <><p>{historyMessage(lastEvent)}</p><small>{observedOnConnect(lastEvent) ? 'Уже была активна при подключении. Точное время возникновения неизвестно.' : 'Время регистрации в журнале gateway.'}</small></>}
          {lastEvent && showHistoryStatus && <small>{historyStatus} Показана последняя загруженная запись.</small>}
          {historyStatus && historyStatus !== 'Загрузка истории…' && dataMode !== 'local' && <button type="button" onClick={retry}>Повторить загрузку истории</button>}
        </section>
        <section className="inspection-nodes">
          <div className="inspection-section-title"><h3>Узлы оборудования</h3><button type="button" onClick={() => onNode(null)}>Общий вид</button></div>
          <div className="inspection-node-grid">{nodes.map((node) => {
            const alarmCount = alarms.filter((issue) => issue.node === node).length;
            const unavailable = node === 'slot' && slot === null;
            return <button type="button" key={node} className={`${alarmCount ? 'fault ' : ''}${selectedNode === node ? 'selected' : ''}`}
              aria-pressed={selectedNode === node} disabled={unavailable} onClick={() => onNode(selectedNode === node ? null : node)}>
              <i /><span>{NODE_LABELS[node]}{node === 'slot' && slot !== null ? ` №${slot + 1}` : ''}</span><b>{alarmCount || '↗'}</b>
            </button>;
          })}</div>
          {target.kind === 'magazine' && <p className="inspection-note">Статичная кассета, без приводов. {slot === null ? 'PLC не указал однозначную рабочую ячейку; подсвечивается кассета.' : `Рабочая ячейка №${slot + 1} указана в текущей операции PLC.`}</p>}
          <label className="inspection-xray"><input type="checkbox" checked={xray} onChange={(event) => onXray(event.target.checked)} /><span>Показывать выделенные узлы через корпус</span></label>
        </section>
        <section>
          <div className="inspection-section-title"><h3>Активные события</h3><span>{issues.length}</span></div>
          {!issues.length && <div className="inspection-empty"><span>✓</span><div><strong>{dataMode === 'stale' ? 'В последнем снимке активных аварий нет' : 'Активных аварий не получено'}</strong><p>Выберите узел, чтобы рассмотреть его в модели.</p></div></div>}
          <div className="inspection-issue-list">{issues.map((issue) => <button key={issue.key} type="button"
            className={`inspection-issue ${issue.severity}${selectedIssue?.key === issue.key ? ' selected' : ''}`}
            aria-pressed={selectedIssue?.key === issue.key} onClick={() => { setExpandedIssue(issue.key); onNode(issue.node === 'equipment' ? null : issue.node); }}>
            <i /><span><strong>{issue.title}</strong><small>{NODE_LABELS[issue.node]} · {issue.effect ? ALARM_EFFECT_LABELS[issue.effect] : issue.origin === 'local' ? 'Локальная модель' : 'Сигнал оборудования'}</small></span>
            {issue.code !== undefined && <b>{issue.severity === 'warning' ? 'W' : 'E'}{issue.code}</b>}
          </button>)}</div>
          {selectedIssue && guidance && <article className="inspection-explanation" key={selectedIssue.key}>
            <span className="inspection-eyebrow">{NODE_LABELS[selectedIssue.node]}</span>
            <h4>Почему возникло</h4><p>{guidance.cause}</p>
            <h4>Как устранить и сбросить</h4><p>{guidance.recovery}</p>
            <footer>{guidance.documented ? 'Условия из таблицы диагностики проекта. Сброс выполняется штатными органами управления.' : 'Сведения по доступному сигналу. Уточнение причины — в диагностике оборудования.'}</footer>
            {selectedIssue.observedAt && <small className="inspection-observed">HMI впервые увидел событие: {dateTime(selectedIssue.observedAt)}. Это не метка времени возникновения в PLC.</small>}
          </article>}
        </section>
        {history.length > 0 && <section className="inspection-history"><button type="button" className="inspection-history-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen((value) => !value)}><span>Последние аварии оборудования</span><b>{historyOpen ? '−' : '+'}</b></button>
          {historyOpen && <ol>{history.map((event) => <li key={event.id}><time dateTime={new Date(event.timestampMs).toISOString()}>{dateTime(event.timestampMs)}</time><p>{historyMessage(event)}</p></li>)}</ol>}
        </section>}
      </div>
    </aside>
  </>;
}
