import { Download, Pause, Play, Trash2, ZoomIn, ZoomOut, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  CYCLOGRAM_CATEGORY_COLORS,
  CYCLOGRAM_LANES,
  isVisibleCyclogramInterval,
  type CyclogramHistory,
  type CyclogramInterval,
} from '../../model/cyclogram';
import { Dialog } from '../ui/Dialog';

const MIN_WINDOW_MS = 60_000;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_WINDOW_MS = 60_000;
const FRAME_INTERVAL_MS = 1_000 / 30;
const HEADER_HEIGHT = 42;
const ROW_HEIGHT = 50;
const TICK_STEPS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 30 * 60_000, 60 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];

export interface CyclogramPanelProps {
  history: CyclogramHistory;
  onClose: () => void;
  onExport: (scope: 'all' | 'visible', fromMs?: number, toMs?: number) => void;
  onClear: () => void;
  dragHandle?: ReactNode;
  initialPaused?: boolean;
  className?: string;
}

interface HoveredInterval {
  interval: CyclogramInterval;
  x: number;
  y: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const formatTime = (timestamp: number, withDate = false) => new Intl.DateTimeFormat('ru-RU', {
  ...(withDate ? { day: '2-digit', month: '2-digit' } : {}),
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).format(timestamp);
const formatRange = (fromMs: number, toMs: number) => `${formatTime(fromMs, true)} — ${formatTime(toMs, true)}`;
const formatDuration = (durationMs: number) => {
  const total = Math.max(0, Math.floor(durationMs / 1_000));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return `${hours ? `${hours} ч ` : ''}${minutes ? `${minutes} мин ` : ''}${seconds} с`;
};
const tickStep = (windowMs: number) => TICK_STEPS.find((step) => windowMs / step <= 10) ?? TICK_STEPS.at(-1) ?? 60 * 60_000;

function CanvasTimeline({ intervals, fromMs, toMs, nowMs, paused, onHover, onPan }: {
  intervals: CyclogramInterval[];
  fromMs: number;
  toMs: number;
  nowMs: number;
  paused: boolean;
  onHover: (interval: HoveredInterval | null) => void;
  onPan: (deltaPixels: number, width: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; lastX: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: HEADER_HEIGHT + ROW_HEIGHT * CYCLOGRAM_LANES.length });
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const resize = () => setSize({
      width: Math.max(0, viewport.clientWidth),
      height: HEADER_HEIGHT + ROW_HEIGHT * CYCLOGRAM_LANES.length,
    });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const timelineEnd = toMs;
  const timelineStart = timelineEnd - (toMs - fromMs);
  const pan = (deltaPixels: number) => {
    if (!paused || size.width <= 0) return;
    onPan(deltaPixels, size.width);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0) return;
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * pixelRatio);
    canvas.height = Math.round(size.height * pixelRatio);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    context.fillStyle = '#fbfcfd';
    context.fillRect(0, 0, size.width, size.height);

    const windowMs = timelineEnd - timelineStart;
    const toX = (timestamp: number) => ((timestamp - timelineStart) / windowMs) * size.width;
    const step = tickStep(windowMs);
    const firstTick = Math.ceil(timelineStart / step) * step;
    context.font = '12px Inter, Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (let tick = firstTick; tick <= timelineEnd; tick += step) {
      const x = Math.round(toX(tick)) + 0.5;
      context.strokeStyle = 'rgba(183, 198, 208, .42)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x, HEADER_HEIGHT - 10);
      context.lineTo(x, size.height);
      context.stroke();
      context.fillStyle = '#6f8090';
      context.fillText(formatTime(tick, windowMs >= 60 * 60_000), x, 15);
    }
    context.strokeStyle = '#dfe7ec';
    context.beginPath();
    context.moveTo(0, HEADER_HEIGHT + 0.5);
    context.lineTo(size.width, HEADER_HEIGHT + 0.5);
    context.stroke();

    for (let index = 0; index < CYCLOGRAM_LANES.length; index += 1) {
      const y = HEADER_HEIGHT + index * ROW_HEIGHT;
      context.fillStyle = index % 2 === 0 ? 'rgba(247, 250, 252, .72)' : '#fff';
      context.fillRect(0, y, size.width, ROW_HEIGHT);
      context.strokeStyle = '#e5ecef';
      context.beginPath();
      context.moveTo(0, y + ROW_HEIGHT + 0.5);
      context.lineTo(size.width, y + ROW_HEIGHT + 0.5);
      context.stroke();
    }

    for (const interval of intervals) {
      const laneIndex = CYCLOGRAM_LANES.findIndex((lane) => lane.id === interval.lane);
      const end = interval.endMs ?? nowMs;
      if (laneIndex < 0 || interval.startMs >= timelineEnd || end <= timelineStart) continue;
      const x = Math.max(0, toX(interval.startMs));
      const endX = Math.min(size.width, toX(end));
      const width = Math.max(2, endX - x);
      const y = HEADER_HEIGHT + laneIndex * ROW_HEIGHT + 8;
      const color = CYCLOGRAM_CATEGORY_COLORS[interval.category] ?? CYCLOGRAM_CATEGORY_COLORS['robot-active'];
      context.fillStyle = color.fill;
      context.beginPath();
      context.roundRect(x + 1, y, Math.max(1, width - 2), ROW_HEIGHT - 16, 4);
      context.fill();
      if (width > 86) {
        context.save();
        context.beginPath();
        context.rect(x + 7, y, Math.max(0, width - 14), ROW_HEIGHT - 16);
        context.clip();
        context.fillStyle = color.text;
        context.font = '500 12px Inter, Arial, sans-serif';
        context.textAlign = 'left';
        context.fillText(interval.label, x + 9, y + (ROW_HEIGHT - 16) / 2);
        context.restore();
      }
    }

    if (!paused && nowMs >= timelineStart && nowMs <= timelineEnd) {
      const nowX = Math.round(toX(nowMs)) + 0.5;
      context.strokeStyle = '#1769d2';
      context.setLineDash([5, 5]);
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(nowX, 0);
      context.lineTo(nowX, size.height);
      context.stroke();
      context.setLineDash([]);
    }
  }, [fromMs, intervals, nowMs, paused, size, timelineEnd, timelineStart]);

  const intervalAt = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (size.width <= 0) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const laneIndex = Math.floor((y - HEADER_HEIGHT) / ROW_HEIGHT);
    const lane = CYCLOGRAM_LANES[laneIndex];
    if (!lane) return null;
    const timestamp = timelineStart + (x / size.width) * (timelineEnd - timelineStart);
    const interval = intervals.find((candidate) => candidate.lane === lane.id
      && candidate.startMs <= timestamp && (candidate.endMs ?? nowMs) >= timestamp);
    return interval ? { interval, x, y } : null;
  };

  return <div className={`cyclogram-viewport${paused ? ' is-paused' : ''}`} ref={viewportRef}
    onWheel={(event) => { if (paused) { event.preventDefault(); pan(event.deltaY || event.deltaX); } }}>
    <canvas ref={canvasRef} className="cyclogram-canvas" aria-label="Временная шкала циклограммы"
      onPointerMove={(event) => {
        if (drag.current?.pointerId === event.pointerId) {
          pan(event.clientX - drag.current.lastX);
          drag.current.lastX = event.clientX;
        }
        onHover(intervalAt(event));
      }}
      onPointerLeave={() => onHover(null)}
      onPointerDown={(event) => {
        if (!paused) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, lastX: event.clientX };
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        drag.current = null;
      }}
      onPointerCancel={() => { drag.current = null; }} />
  </div>;
}

export function CyclogramPanel({ history, onClose, onExport, onClear, dragHandle, initialPaused = false, className }: CyclogramPanelProps) {
  const [paused, setPaused] = useState(initialPaused);
  const [frozenNow, setFrozenNow] = useState<number | null>(initialPaused ? history.serverTime : null);
  const [windowMs, setWindowMs] = useState(DEFAULT_WINDOW_MS);
  const [clock, setClock] = useState(Date.now());
  const [exportOpen, setExportOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [hovered, setHovered] = useState<HoveredInterval | null>(null);
  const serverOffset = useMemo(() => history.serverTime - Date.now(), [history.serverTime]);
  const liveNow = clock + serverOffset;
  const displayNow = paused ? frozenNow ?? liveNow : liveNow;
  const rangeTo = displayNow;
  const rangeFrom = rangeTo - windowMs;
  const minRangeStart = Math.max(0, displayNow - history.retentionMs);
  const visibleFrom = Math.max(rangeFrom, minRangeStart);
  const visibleTo = rangeTo;
  const filterAnchor = Math.floor(displayNow / 1_000) * 1_000;
  const filtered = useMemo(() => history.intervals.filter((interval) => isVisibleCyclogramInterval(interval)
    && interval.startMs < filterAnchor + 1_000
    && (interval.endMs ?? filterAnchor + 1_000) > Math.max(0, filterAnchor - windowMs - 1_000)),
  [filterAnchor, history.intervals, windowMs]);
  const sliderMin = Math.max(0, liveNow - history.retentionMs + windowMs);
  const sliderMax = liveNow;
  const sliderValue = sliderMax > sliderMin ? Math.round(((visibleTo - sliderMin) / (sliderMax - sliderMin)) * 1000) : 1000;

  useEffect(() => {
    if (paused) return undefined;
    let frame = 0;
    let previousFrame = 0;
    const animate = (timestamp: number) => {
      if (timestamp - previousFrame >= FRAME_INTERVAL_MS) {
        previousFrame = timestamp;
        setClock(Date.now());
      }
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [paused]);

  const togglePaused = () => {
    if (paused) {
      setFrozenNow(null);
      setPaused(false);
      return;
    }
    setFrozenNow(liveNow);
    setPaused(true);
  };
  const adjustZoom = (factor: number) => {
    setWindowMs((current) => clamp(Math.round(current * factor), MIN_WINDOW_MS, Math.min(MAX_WINDOW_MS, history.retentionMs)));
  };
  const exportRange = (scope: 'all' | 'visible') => {
    setExportOpen(false);
    onExport(scope, scope === 'visible' ? visibleFrom : undefined, scope === 'visible' ? visibleTo : undefined);
  };
  const clearTimeline = () => {
    setClearOpen(false);
    setFrozenNow(liveNow);
    setPaused(true);
    setHovered(null);
    onClear();
  };
  const panPausedTimeline = (deltaPixels: number, width: number) => {
    if (!paused || width <= 0) return;
    const minEnd = Math.max(0, liveNow - history.retentionMs + windowMs);
    setFrozenNow((current) => clamp((current ?? liveNow) - (deltaPixels / width) * windowMs, minEnd, liveNow));
  };

  return <section className={`cyclogram-panel ${className ?? ''}`.trim()} aria-label="Циклограмма">
    {dragHandle}
    <header className="cyclogram-heading">
      <div><span>МОНИТОРИНГ ПРОЦЕССА</span><h2>Циклограмма</h2><p>{paused ? 'Просмотр остановлен — перетаскивайте временную шкалу или используйте ползунок.' : 'Живая временная шкала PLC. История сохраняется в шлюзе до 24 часов.'}</p></div>
      <div className="cyclogram-actions">
        <button className={`cyclogram-action${paused ? ' is-active' : ''}`} type="button" onClick={togglePaused} title={paused ? 'Продолжить' : 'Приостановить'}>{paused ? <Play /> : <Pause />}<span>{paused ? 'Продолжить' : 'Пауза'}</span></button>
        <button className="cyclogram-action icon-only" type="button" onClick={() => adjustZoom(2)} disabled={windowMs >= Math.min(MAX_WINDOW_MS, history.retentionMs)} title="Уменьшить масштаб"><ZoomOut /></button>
        <button className="cyclogram-action icon-only" type="button" onClick={() => adjustZoom(.5)} disabled={windowMs <= MIN_WINDOW_MS} title="Увеличить масштаб"><ZoomIn /></button>
        <button className="cyclogram-action export" type="button" onClick={() => setExportOpen(true)} title="Сохранить в Excel"><Download /><span>Excel</span></button>
        <button className="cyclogram-action clear" type="button" onClick={() => setClearOpen(true)} title="Очистить данные циклограммы"><Trash2 /><span>Очистить</span></button>
        <button className="panel-close-button" type="button" onClick={onClose} aria-label="Закрыть циклограмму" title="Закрыть"><X /></button>
      </div>
    </header>
    <div className="cyclogram-status-row"><span className={paused ? 'paused' : 'live'}><i />{paused ? 'ПАУЗА' : 'СЕЙЧАС'}</span><b>{formatRange(visibleFrom, visibleTo)}</b><small>Масштаб: {windowMs < 60 * 60_000 ? `${Math.round(windowMs / 60_000)} мин` : `${Math.round(windowMs / 3_600_000)} ч`}</small></div>
    <div className="cyclogram-chart">
      <div className="cyclogram-lane-labels"><div className="cyclogram-axis-label">Оборудование</div>{CYCLOGRAM_LANES.map((lane) => <div className={`cyclogram-lane-label ${lane.kind}`} key={lane.id}>{lane.label}</div>)}</div>
      <div className="cyclogram-timeline-wrap">
        <CanvasTimeline intervals={filtered} fromMs={visibleFrom} toMs={visibleTo} nowMs={displayNow} paused={paused} onHover={setHovered} onPan={panPausedTimeline} />
        {hovered && <div className="cyclogram-tooltip" style={{ left: clamp(hovered.x, 8, 1000), top: clamp(hovered.y + 16, HEADER_HEIGHT, 200) }}><b>{hovered.interval.label}</b><span>{formatRange(hovered.interval.startMs, hovered.interval.endMs ?? displayNow)}</span><small>{formatDuration((hovered.interval.endMs ?? displayNow) - hovered.interval.startMs)}</small></div>}
      </div>
    </div>
    <div className="cyclogram-scrubber"><span>{paused ? 'Прокрутка архива' : 'Пауза откроет прокрутку архива'}</span><input type="range" min="0" max="1000" value={sliderValue} disabled={!paused || sliderMax <= sliderMin} onChange={(event) => {
      const progress = Number(event.target.value) / 1000;
      setFrozenNow(sliderMin + (sliderMax - sliderMin) * progress);
    }} /><time>{formatTime(visibleTo, true)}</time></div>
    <Dialog open={exportOpen} onOpenChange={setExportOpen} title="Экспорт циклограммы" description="Excel содержит отдельную строку для каждого действия и цветовую диаграмму Ганта." footer={<><button className="dialog-secondary-action" type="button" onClick={() => setExportOpen(false)}>Отмена</button><button className="dialog-primary-action" type="button" onClick={() => exportRange('visible')}>Видимый диапазон</button><button className="dialog-primary-action" type="button" onClick={() => exportRange('all')}>Все 24 часа</button></>}>
      <div className="cyclogram-export-note"><b>Видимый диапазон:</b><span>{formatRange(visibleFrom, visibleTo)}</span><p>Параллельные действия сохраняют общее время, поэтому их можно сравнить по горизонтальной шкале.</p></div>
    </Dialog>
    <Dialog open={clearOpen} onOpenChange={setClearOpen} title="Очистить циклограмму?" description="Циклограмма будет поставлена на паузу, а вся сохранённая история удалена без возможности восстановления." footer={<><button className="dialog-secondary-action" type="button" onClick={() => setClearOpen(false)}>Отмена</button><button className="dialog-danger-action" type="button" onClick={clearTimeline}>Пауза и сброс</button></>}>
      <div className="cyclogram-clear-note"><Trash2 /><p><b>Будут удалены все интервалы за последние 24 часа.</b><span>Если связь с PLC установлена, запись начнётся заново с текущего состояния.</span></p></div>
    </Dialog>
  </section>;
}
