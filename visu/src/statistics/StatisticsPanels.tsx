import { useEffect, useMemo, useState } from 'react';
import calendarMonthOutlineIcon from '@iconify-icons/material-symbols/calendar-month-outline';
import cancelOutlineIcon from '@iconify-icons/material-symbols/cancel-outline';
import checkCircleOutlineIcon from '@iconify-icons/material-symbols/check-circle-outline';
import closeIcon from '@iconify-icons/material-symbols/close';
import databaseOutlineIcon from '@iconify-icons/material-symbols/database-outline';
import deleteOutlineIcon from '@iconify-icons/material-symbols/delete-outline';
import editOutlineIcon from '@iconify-icons/material-symbols/edit-outline';
import errorOutlineIcon from '@iconify-icons/material-symbols/error-outline';
import factoryOutlineIcon from '@iconify-icons/material-symbols/factory-outline';
import microwaveGenOutlineIcon from '@iconify-icons/material-symbols/microwave-gen-outline';
import ovenGenOutlineIcon from '@iconify-icons/material-symbols/oven-gen-outline';
import personOutlineIcon from '@iconify-icons/material-symbols/person-outline';
import refreshIcon from '@iconify-icons/material-symbols/refresh';
import saveOutlineIcon from '@iconify-icons/material-symbols/save-outline';
import scheduleOutlineIcon from '@iconify-icons/material-symbols/schedule-outline';
import toolsWrenchOutlineIcon from '@iconify-icons/material-symbols/tools-wrench-outline';
import trophyOutlineIcon from '@iconify-icons/material-symbols/trophy-outline';
import warningOutlineIcon from '@iconify-icons/material-symbols/warning-outline';
import chartLineIcon from '@iconify-icons/mdi/chart-line';
import robotIndustrialOutlineIcon from '@iconify-icons/mdi/robot-industrial-outline';
import shieldAlertOutlineIcon from '@iconify-icons/mdi/shield-alert-outline';
import { Icon, type IconProps } from '@iconify/react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AppUser } from '../auth/client';
import {
  statisticsApi, toLocalInput,
  type OperatorInterval, type ShiftTemplate, type ShiftTemplateDraft,
  type StatisticsPreset, type StatisticsSummary,
} from './client';

const PERIODS: Array<{ value: StatisticsPreset; label: string; operator: boolean }> = [
  { value: 'current-shift', label: 'Текущая смена', operator: true },
  { value: 'previous-shift', label: 'Предыдущая смена', operator: true },
  { value: '24h', label: '24 часа', operator: false },
  { value: '7d', label: '7 дней', operator: true },
  { value: '30d', label: '30 дней', operator: true },
  { value: 'all', label: 'Всё время', operator: true },
  { value: 'custom', label: 'Произвольный', operator: false },
];
const DAY_OPTIONS = [
  { value: 1, label: 'Пн' }, { value: 2, label: 'Вт' }, { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' }, { value: 5, label: 'Пт' }, { value: 6, label: 'Сб' }, { value: 0, label: 'Вс' },
];
const EMPTY_TEMPLATE: ShiftTemplateDraft = {
  name: 'Смена', days: [1, 2, 3, 4, 5], startMinute: 480, endMinute: 1200,
  timezone: 'Asia/Yekaterinburg', enabled: true,
};

type StatisticsIcon = IconProps['icon'];

const EQUIPMENT_ICONS = {
  'machine-1': microwaveGenOutlineIcon,
  'machine-2': ovenGenOutlineIcon,
  'machine-3': factoryOutlineIcon,
  robot: robotIndustrialOutlineIcon,
} as const;

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const TREND_TIME_FORMATTER = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const TREND_DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });

const formatDuration = (milliseconds: number) => {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  return `${hours} ч ${minutes % 60} мин`;
};
const formatDateTime = (timestamp: number) => DATE_TIME_FORMATTER.format(timestamp);
const minuteToTime = (minute: number) => `${Math.floor(minute / 60).toString().padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`;
const timeToMinute = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return Math.max(0, Math.min(1439, hours * 60 + minutes));
};

function LoadCard({ label, percent, kind }: { label: string; percent: number; kind: string }) {
  return <article className={`statistics-load-card ${kind}`}>
    <div><span><Icon icon={kind === 'robot' ? robotIndustrialOutlineIcon : chartLineIcon} aria-hidden="true" />{label}</span><b>{percent.toFixed(1)}%</b></div>
    <div className="statistics-load-track"><i style={{ width: `${Math.min(100, percent)}%` }} /></div>
  </article>;
}

function OperatorKpiCard({ tone, icon, label, value, detail }: {
  tone: string;
  icon: StatisticsIcon;
  label: string;
  value: string | number;
  detail: string;
}) {
  return <article className={tone}>
    <Icon icon={icon} aria-hidden="true" />
    <div><span>{label}</span><b>{value}</b><small>{detail}</small></div>
  </article>;
}

const averageLoad = (summary: StatisticsSummary) => summary.equipment.length === 0
  ? 0
  : summary.equipment.reduce((total, item) => total + item.loadPercent, 0) / summary.equipment.length;

const percentOf = (value: number, total: number) => total > 0 ? Math.min(100, Math.max(0, value / total * 100)) : 0;

function OperatorMiniTrend({ summary }: { summary: StatisticsSummary }) {
  return <div className="statistics-operator-sparkline">
    {summary.trend.length > 1 && <ResponsiveContainer width="100%" height="100%">
      <LineChart data={summary.trend}><Line type="monotone" dataKey="loadPercent" stroke="#126fe5" strokeWidth={1.5} dot={false} isAnimationActive={false} /></LineChart>
    </ResponsiveContainer>}
  </div>;
}

function OperatorSummaryBody({ summary, shiftSummary, allSummary }: {
  summary: StatisticsSummary;
  shiftSummary: StatisticsSummary;
  allSummary: StatisticsSummary;
}) {
  const commandsTotal = summary.commandsAccepted + summary.commandsRejected;
  const periodMs = Math.max(0, summary.period.toMs - summary.period.fromMs);
  const equipmentCount = Math.max(1, summary.equipment.length);
  const averageBusyMs = summary.equipment.reduce((total, item) => total + item.busyMs, 0) / equipmentCount;
  const averageObservedMs = summary.equipment.reduce((total, item) => total + item.observedMs, 0) / equipmentCount;
  const lossMs = Math.max(0, summary.responsibilityMs - averageBusyMs);
  const waitingLossPercent = percentOf(Math.max(0, averageObservedMs - averageBusyMs), lossMs);
  const otherLossPercent = lossMs > 0
    ? Math.max(0, 100 - waitingLossPercent)
    : 100;
  const experience = summary.experience ?? allSummary.experience;
  const periodIsShort = periodMs <= 36 * 60 * 60 * 1000;
  const trendFormatter = periodIsShort ? TREND_TIME_FORMATTER : TREND_DATE_FORMATTER;
  const formatTrendTick = (value: number) => trendFormatter.format(value);

  return <div className="statistics-operator-dashboard">
    <section className="statistics-operator-kpis">
      <OperatorKpiCard tone="time" icon={scheduleOutlineIcon} label="Подтверждённое время" value={formatDuration(summary.responsibilityMs)} detail={`${percentOf(summary.responsibilityMs, periodMs).toFixed(0)}% от выбранного периода`} />
      <OperatorKpiCard tone="alarm" icon={shieldAlertOutlineIcon} label="Аварии" value={summary.alarmsActivated} detail={summary.alarmsActivated === 0 ? 'Без аварий' : 'За выбранный период'} />
      <OperatorKpiCard tone="warning" icon={warningOutlineIcon} label="Предупреждения" value={summary.warningsActivated} detail={summary.warningsActivated === 0 ? 'Нет замечаний' : 'Требуют внимания'} />
      <OperatorKpiCard tone="accepted" icon={checkCircleOutlineIcon} label="Команды подтверждены" value={summary.commandsAccepted} detail={`${percentOf(summary.commandsAccepted, commandsTotal).toFixed(1)}% от всех команд`} />
      <OperatorKpiCard tone="rejected" icon={cancelOutlineIcon} label="Команды отклонены" value={summary.commandsRejected} detail={`${percentOf(summary.commandsRejected, commandsTotal).toFixed(1)}% от всех команд`} />
    </section>

    {experience && <section className="statistics-operator-level">
      <div className="statistics-operator-level-badge"><Icon icon={trophyOutlineIcon} aria-hidden="true" /><span>УРОВЕНЬ</span><strong>{experience.level}</strong></div>
      <div className="statistics-operator-level-progress"><h3>Опыт оператора</h3><div className="statistics-xp-track"><i style={{ width: `${experience.progressPercent}%` }} /></div><small>{experience.xp.toLocaleString('ru-RU')} XP</small></div>
      <div className="statistics-operator-next-level"><span>До следующего уровня</span><b>{experience.level >= 100 ? 'MAX' : `${(experience.nextThreshold - experience.xp).toLocaleString('ru-RU')} XP`}</b></div>
    </section>}

    <section className="statistics-operator-main-grid">
      <article className="statistics-operator-card statistics-operator-equipment">
        <header><h3>Загрузка оборудования</h3>{summary.partialData && <small><Icon icon={warningOutlineIcon} aria-hidden="true" />Неполные данные</small>}</header>
        <div className="statistics-operator-equipment-list">{summary.equipment.map((item) => <div key={item.lane}>
          <span className="statistics-operator-equipment-icon"><Icon icon={EQUIPMENT_ICONS[item.lane]} aria-hidden="true" /></span>
          <div><span>{item.label}</span><div className="statistics-load-track"><i style={{ width: `${Math.min(100, item.loadPercent)}%` }} /></div></div>
          <strong>{item.loadPercent.toFixed(0)}%</strong>
          <small className={item.observedMs > 0 ? 'ok' : ''}>{item.observedMs > 0 ? 'За период' : 'Нет данных'}</small>
        </div>)}</div>
      </article>

      <article className="statistics-operator-card statistics-operator-dynamics">
        <header><h3>Динамика загрузки</h3><span><i />Средняя загрузка ячейки, %</span></header>
        <div className="statistics-operator-chart">
          {summary.trend.length > 0 ? <ResponsiveContainer width="100%" height="100%"><LineChart data={summary.trend} margin={{ top: 12, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="#e8ecef" vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="timestampMs" tickFormatter={formatTrendTick} tick={{ fontSize: 10, fill: '#77848e' }} axisLine={{ stroke: '#e1e6ea' }} tickLine={false} minTickGap={28} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 10, fill: '#77848e' }} axisLine={false} tickLine={false} />
            <Tooltip labelFormatter={(value) => formatDateTime(Number(value))} formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Загрузка']} />
            <Line type="monotone" dataKey="loadPercent" stroke="#126fe5" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#259f54', stroke: '#fff', strokeWidth: 2 }} />
          </LineChart></ResponsiveContainer> : <div className="statistics-empty"><Icon icon={chartLineIcon} aria-hidden="true" /><span>Данные появятся после начала сбора</span></div>}
        </div>
      </article>

      <article className="statistics-operator-card statistics-operator-averages">
        <div><span>Средняя загрузка за смену</span><b>{averageLoad(shiftSummary).toFixed(0)}%</b><small className={shiftSummary.coveragePercent > 0 ? 'ok' : ''}>{shiftSummary.coveragePercent.toFixed(0)}% покрытия данных</small><OperatorMiniTrend summary={shiftSummary} /></div>
        <div><span>Средняя загрузка за всё время</span><b>{averageLoad(allSummary).toFixed(0)}%</b><small className={allSummary.coveragePercent > 0 ? 'ok' : ''}>{allSummary.coveragePercent.toFixed(0)}% покрытия данных</small><OperatorMiniTrend summary={allSummary} /></div>
      </article>

      <article className="statistics-operator-card statistics-operator-time-structure">
        <header><h3>Причины потерь времени</h3></header>
        <div><span><Icon icon={scheduleOutlineIcon} aria-hidden="true" />Ожидание</span><i><b style={{ width: `${waitingLossPercent}%` }} /></i><strong>{waitingLossPercent.toFixed(0)}%</strong></div>
        <div><span><Icon icon={toolsWrenchOutlineIcon} aria-hidden="true" />Сервис</span><i><b style={{ width: 0 }} /></i><strong>—</strong></div>
        <div className="alarm"><span><Icon icon={errorOutlineIcon} aria-hidden="true" />Аварии</span><i><b style={{ width: 0 }} /></i><strong>{summary.alarmsActivated}</strong></div>
        <div className="other"><span>Остальное</span><i><b style={{ width: `${otherLossPercent}%` }} /></i><strong>{otherLossPercent.toFixed(0)}%</strong></div>
      </article>
    </section>
  </div>;
}

function SummaryBody({ summary, operatorMode }: { summary: StatisticsSummary; operatorMode: boolean }) {
  return <>
    {operatorMode && summary.experience && <section className="statistics-game-card">
      <div className="statistics-level-badge"><Icon icon={trophyOutlineIcon} aria-hidden="true" /><strong>{summary.experience.level}</strong><span>УРОВЕНЬ</span></div>
      <div className="statistics-level-copy">
        <span>ЛИЧНЫЙ ПРОГРЕСС</span>
        <h3>Опыт оператора</h3>
        <div className="statistics-xp-track"><i style={{ width: `${summary.experience.progressPercent}%` }} /></div>
        <p><b>{summary.experience.xp.toLocaleString('ru-RU')} XP</b><span>{summary.experience.level >= 100 ? 'Максимальный уровень' : `До уровня ${summary.experience.level + 1}: ${(summary.experience.nextThreshold - summary.experience.xp).toLocaleString('ru-RU')} XP`}</span></p>
      </div>
      <div className="statistics-personal-time"><Icon icon={scheduleOutlineIcon} aria-hidden="true" /><span>Подтверждённое время</span><b>{formatDuration(summary.responsibilityMs)}</b></div>
    </section>}

    <section className="statistics-kpi-grid">
      <article><Icon icon={scheduleOutlineIcon} aria-hidden="true" /><span>{operatorMode ? 'Авторизация' : 'Без оператора'}</span><b>{formatDuration(operatorMode ? summary.responsibilityMs : summary.unassignedMs)}</b></article>
      <article><Icon icon={checkCircleOutlineIcon} aria-hidden="true" /><span>Полнота данных</span><b>{summary.coveragePercent.toFixed(1)}%</b></article>
      <article className="alarm"><Icon icon={shieldAlertOutlineIcon} aria-hidden="true" /><span>Аварии</span><b>{summary.alarmsActivated}</b></article>
      <article className="warning"><Icon icon={warningOutlineIcon} aria-hidden="true" /><span>Предупреждения</span><b>{summary.warningsActivated}</b></article>
      <article><Icon icon={chartLineIcon} aria-hidden="true" /><span>Команды переданы</span><b>{summary.commandsAccepted}</b></article>
      <article><Icon icon={cancelOutlineIcon} aria-hidden="true" /><span>Команды отклонены</span><b>{summary.commandsRejected}</b></article>
    </section>

    <section className="statistics-main-grid">
      <div className="statistics-equipment-card">
        <header><div><span>ОБОРУДОВАНИЕ</span><h3>Загрузка за период</h3></div>{summary.partialData && <small><Icon icon={warningOutlineIcon} aria-hidden="true" />Неполные данные</small>}</header>
        <div className="statistics-load-grid">{summary.equipment.map((item) => <LoadCard key={item.lane} label={item.label} percent={item.loadPercent} kind={item.lane} />)}</div>
      </div>
      <div className="statistics-chart-card">
        <header><span>ДИНАМИКА</span><h3>Средняя загрузка ячейки</h3></header>
        <div className="statistics-chart">
          {summary.trend.length > 0 ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={summary.trend} margin={{ top: 8, right: 10, bottom: 0, left: -20 }}>
            <defs><linearGradient id="statisticsLoadFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2f82c5" stopOpacity={0.32} /><stop offset="100%" stopColor="#2f82c5" stopOpacity={0.03} /></linearGradient></defs>
            <CartesianGrid stroke="#e6edf2" vertical={false} />
            <XAxis dataKey="timestampMs" tickFormatter={(value) => new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} tick={{ fontSize: 9, fill: '#718591' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#718591' }} axisLine={false} tickLine={false} />
            <Tooltip labelFormatter={(value) => formatDateTime(Number(value))} formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Загрузка']} />
            <Area type="monotone" dataKey="loadPercent" stroke="#2f82c5" strokeWidth={2} fill="url(#statisticsLoadFill)" />
          </AreaChart></ResponsiveContainer> : <div className="statistics-empty"><Icon icon={chartLineIcon} aria-hidden="true" /><span>Данные появятся после начала сбора</span></div>}
        </div>
      </div>
    </section>
  </>;
}

export function StatisticsPanel({ user, onClose }: { user: AppUser; onClose: () => void }) {
  const admin = user.role === 'admin';
  const [preset, setPreset] = useState<StatisticsPreset>(admin ? '7d' : 'current-shift');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>(admin ? 'all' : String(user.id));
  const [from, setFrom] = useState(toLocalInput(Date.now() - 7 * 86_400_000));
  const [to, setTo] = useState(toLocalInput(Date.now()));
  const [summary, setSummary] = useState<StatisticsSummary | null>(null);
  const [operatorShiftSummary, setOperatorShiftSummary] = useState<StatisticsSummary | null>(null);
  const [operatorAllSummary, setOperatorAllSummary] = useState<StatisticsSummary | null>(null);
  const [operatorRows, setOperatorRows] = useState<Array<{ user: AppUser; summary: StatisticsSummary }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!admin) return;
    statisticsApi.users().then((items) => setUsers(items.filter((item) => item.role === 'operator'))).catch(() => setUsers([]));
  }, [admin]);

  useEffect(() => {
    if (!admin) return;
    let active = true;
    setLoading(true);
    setError('');
    const range = preset === 'custom' ? { from: new Date(from).getTime(), to: new Date(to).getTime() } : {};
    const userId = admin ? selectedUser === 'all' ? 'all' as const : selectedUser === 'unassigned' ? 'unassigned' as const : Number(selectedUser) : user.id;
    statisticsApi.summary({ preset, ...range, userId }).then((value) => {
      if (active) setSummary(value);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [admin, from, preset, revision, selectedUser, to, user.id]);

  useEffect(() => {
    if (admin) return;
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      statisticsApi.summary({ preset: 'current-shift', userId: user.id }),
      statisticsApi.summary({ preset: 'all', userId: user.id }),
    ]).then(([shiftValue, allValue]) => {
      if (!active) return;
      setOperatorShiftSummary(shiftValue);
      setOperatorAllSummary(allValue);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [admin, revision, user.id]);

  useEffect(() => {
    if (!admin || selectedUser !== 'all' || users.length === 0) { setOperatorRows([]); return; }
    let active = true;
    const range = preset === 'custom' ? { from: new Date(from).getTime(), to: new Date(to).getTime() } : {};
    Promise.all(users.map(async (item) => ({ user: item, summary: await statisticsApi.summary({ preset, ...range, userId: item.id }) })))
      .then((rows) => { if (active) setOperatorRows(rows); }).catch(() => { if (active) setOperatorRows([]); });
    return () => { active = false; };
  }, [admin, from, preset, selectedUser, to, users]);

  const displayedSummary = admin ? summary : preset === 'all' ? operatorAllSummary : operatorShiftSummary;

  return <section className={`statistics-panel ${admin ? 'admin' : 'operator'}`} aria-label="Статистика">
    <header className="statistics-heading">
      <div><span>{admin ? 'АНАЛИТИКА ЯЧЕЙКИ' : 'ЛИЧНЫЙ КАБИНЕТ'}</span><h2>{admin ? 'Статистика' : 'Статистика оператора'}</h2><p>{admin ? 'История оборудования, операторов и событий' : 'Минимальная аналитика по работе на ячейке'}</p></div>
      <div><button type="button" onClick={() => setRevision((value) => value + 1)} title="Обновить"><Icon icon={refreshIcon} className={loading ? 'spin' : ''} aria-hidden="true" /></button><button type="button" onClick={onClose} title="Закрыть"><Icon icon={closeIcon} aria-hidden="true" /></button></div>
    </header>
    {admin ? <div className="statistics-toolbar">
      <select value={preset} onChange={(event) => setPreset(event.target.value as StatisticsPreset)}>
        {PERIODS.filter((item) => admin || item.operator).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      {admin && <select value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)}><option value="all">Вся ячейка</option><option value="unassigned">Без оператора</option>{users.map((item) => <option key={item.id} value={item.id}>{item.displayName} (@{item.username})</option>)}</select>}
      {preset === 'custom' && <><label>От <input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>До <input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} /></label></>}
      {displayedSummary && <span><Icon icon={calendarMonthOutlineIcon} aria-hidden="true" />{formatDateTime(displayedSummary.period.fromMs)} — {formatDateTime(displayedSummary.period.toMs)}</span>}
    </div> : <div className="statistics-operator-toolbar">
      <div><button className={preset === 'current-shift' ? 'active' : ''} onClick={() => setPreset('current-shift')}>Текущая смена</button><button className={preset === 'all' ? 'active' : ''} onClick={() => setPreset('all')}>Всё время</button></div>
      {displayedSummary && <span><Icon icon={calendarMonthOutlineIcon} aria-hidden="true" />{formatDateTime(displayedSummary.period.fromMs)} — {formatDateTime(displayedSummary.period.toMs)}</span>}
    </div>}
    <div className="statistics-content">
      {loading && !displayedSummary ? <div className="statistics-empty"><Icon icon={refreshIcon} className="spin" aria-hidden="true" /><strong>Собираем статистику</strong></div>
        : error ? <div className="statistics-empty error"><Icon icon={warningOutlineIcon} aria-hidden="true" /><strong>{error}</strong></div>
          : admin && displayedSummary ? <SummaryBody summary={displayedSummary} operatorMode={false} />
            : displayedSummary && operatorShiftSummary && operatorAllSummary && <OperatorSummaryBody summary={displayedSummary} shiftSummary={operatorShiftSummary} allSummary={operatorAllSummary} />}
      {admin && selectedUser === 'all' && operatorRows.length > 0 && <section className="statistics-operator-table">
        <header><span>ОПЕРАТОРЫ</span><h3>Показатели за выбранный период</h3></header>
        <div className="statistics-table-head"><span>Оператор</span><span>Время</span><span>Средняя загрузка</span><span>Аварии</span><span>Предупреждения</span><span>Команды</span></div>
        {operatorRows.map(({ user: item, summary: row }) => <article key={item.id}><span><Icon icon={personOutlineIcon} aria-hidden="true" /><b>{item.displayName}</b><small>@{item.username}</small></span><span>{formatDuration(row.responsibilityMs)}</span><span>{(row.equipment.reduce((sum, equipment) => sum + equipment.loadPercent, 0) / 4).toFixed(1)}%</span><span>{row.alarmsActivated}</span><span>{row.warningsActivated}</span><span>{row.commandsAccepted}</span></article>)}
      </section>}
    </div>
  </section>;
}

function ShiftScheduleEditor() {
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [draft, setDraft] = useState<ShiftTemplateDraft>(EMPTY_TEMPLATE);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const load = () => statisticsApi.templates().then(setTemplates).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  useEffect(() => { void load(); }, []);
  const save = async () => {
    setError('');
    try {
      if (editingId) await statisticsApi.updateTemplate(editingId, draft);
      else await statisticsApi.createTemplate(draft);
      setDraft(EMPTY_TEMPLATE); setEditingId(null); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const edit = (item: ShiftTemplate) => {
    setEditingId(item.id);
    setDraft({ name: item.name, days: item.days, startMinute: item.startMinute, endMinute: item.endMinute, timezone: item.timezone, enabled: item.enabled });
  };
  return <div className="statistics-settings-layout">
    <section className="statistics-settings-list"><header><span>АКТИВНЫЕ ШАБЛОНЫ</span><h3>Расписание смен</h3></header>
      {templates.length === 0 && <div className="statistics-empty compact"><Icon icon={calendarMonthOutlineIcon} aria-hidden="true" /><span>Смены ещё не настроены</span></div>}
      {templates.map((item) => <article key={item.id} className={!item.enabled ? 'disabled' : ''}><div><b>{item.name}</b><span>{item.days.map((day) => DAY_OPTIONS.find((option) => option.value === day)?.label).join(', ')}</span><strong>{minuteToTime(item.startMinute)} — {minuteToTime(item.endMinute)}</strong></div><button onClick={() => edit(item)}><Icon icon={editOutlineIcon} aria-hidden="true" /></button><button className="danger" onClick={async () => { if (!window.confirm(`Удалить шаблон «${item.name}»?`)) return; await statisticsApi.deleteTemplate(item.id); await load(); }}><Icon icon={deleteOutlineIcon} aria-hidden="true" /></button></article>)}
    </section>
    <section className="statistics-template-form"><header><span>{editingId ? 'РЕДАКТИРОВАНИЕ' : 'НОВЫЙ ШАБЛОН'}</span><h3>{editingId ? 'Изменить смену' : 'Добавить смену'}</h3></header>
      <label>Название<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <div className="statistics-days">{DAY_OPTIONS.map((day) => <button key={day.value} className={draft.days.includes(day.value) ? 'active' : ''} onClick={() => setDraft({ ...draft, days: draft.days.includes(day.value) ? draft.days.filter((value) => value !== day.value) : [...draft.days, day.value] })}>{day.label}</button>)}</div>
      <div className="statistics-time-row"><label>Начало<input type="time" value={minuteToTime(draft.startMinute)} onChange={(event) => setDraft({ ...draft, startMinute: timeToMinute(event.target.value) })} /></label><label>Окончание<input type="time" value={minuteToTime(draft.endMinute)} onChange={(event) => setDraft({ ...draft, endMinute: timeToMinute(event.target.value) })} /></label></div>
      <label className="statistics-toggle"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><i /><span>Шаблон включён</span></label>
      {error && <p className="statistics-form-error"><Icon icon={warningOutlineIcon} aria-hidden="true" />{error}</p>}
      <div className="statistics-form-actions">{editingId && <button onClick={() => { setEditingId(null); setDraft(EMPTY_TEMPLATE); }}>Отмена</button>}<button className="primary" onClick={() => void save()}><Icon icon={saveOutlineIcon} aria-hidden="true" />Сохранить</button></div>
    </section>
  </div>;
}

function StatisticsEditor() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState(toLocalInput(Date.now() - 7 * 86_400_000));
  const [to, setTo] = useState(toLocalInput(Date.now()));
  const [intervals, setIntervals] = useState<OperatorInterval[]>([]);
  const [message, setMessage] = useState('');
  const [deletion, setDeletion] = useState({ equipment: true, facts: true, intervals: true });
  const range = useMemo(() => ({ from: new Date(from).getTime(), to: new Date(to).getTime(), userId: userId ? Number(userId) : undefined }), [from, to, userId]);
  const load = () => statisticsApi.intervals(range).then(setIntervals).catch((reason) => setMessage(reason instanceof Error ? reason.message : String(reason)));
  useEffect(() => { statisticsApi.users().then((items) => setUsers(items.filter((item) => item.role === 'operator'))); }, []);
  useEffect(() => { void load(); }, [range.from, range.to, range.userId]);
  const saveInterval = async (item: OperatorInterval) => {
    const target = users.find((user) => user.id === item.userId);
    if (!target || item.endMs === null) return;
    await statisticsApi.updateInterval(item.id, { userId: item.userId, startMs: item.startMs, endMs: item.endMs });
    await load();
  };
  return <div className="statistics-editor">
    <section className="statistics-editor-toolbar"><select value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Все операторы</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select><label>От<input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>До<input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} /></label><button onClick={load}><Icon icon={refreshIcon} aria-hidden="true" />Обновить</button></section>
    {message && <p className="statistics-form-error"><Icon icon={warningOutlineIcon} aria-hidden="true" />{message}</p>}
    <section className="statistics-interval-list"><header><span>АВТОРИЗАЦИИ</span><h3>Редактирование интервалов</h3></header>
      <div className="statistics-interval-head"><span>Оператор</span><span>Начало</span><span>Окончание</span><span>Действия</span></div>
      {intervals.map((item) => <article key={item.id}><select value={item.userId} onChange={(event) => setIntervals((current) => current.map((value) => value.id === item.id ? { ...value, userId: Number(event.target.value) } : value))}>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select><input type="datetime-local" value={toLocalInput(item.startMs)} onChange={(event) => setIntervals((current) => current.map((value) => value.id === item.id ? { ...value, startMs: new Date(event.target.value).getTime() } : value))} /><input type="datetime-local" value={item.endMs ? toLocalInput(item.endMs) : ''} disabled={item.endMs === null} onChange={(event) => setIntervals((current) => current.map((value) => value.id === item.id ? { ...value, endMs: new Date(event.target.value).getTime() } : value))} /><span><button onClick={() => void saveInterval(item)} disabled={item.endMs === null}><Icon icon={saveOutlineIcon} aria-hidden="true" /></button><button className="danger" onClick={async () => { if (!window.confirm('Жёстко удалить этот операторский интервал?')) return; await statisticsApi.deleteInterval(item.id); await load(); }}><Icon icon={deleteOutlineIcon} aria-hidden="true" /></button></span></article>)}
    </section>
    <section className="statistics-danger-zone"><header><Icon icon={deleteOutlineIcon} aria-hidden="true" /><div><span>НЕОБРАТИМОЕ УДАЛЕНИЕ</span><h3>Удалить статистику диапазона</h3><p>Данные физически удаляются из SQLite. Восстановления и аудита удаления нет.</p></div></header>
      <div className="statistics-delete-options"><label><input type="checkbox" checked={deletion.equipment} onChange={(event) => setDeletion({ ...deletion, equipment: event.target.checked })} />Телеметрия оборудования</label><label><input type="checkbox" checked={deletion.facts} onChange={(event) => setDeletion({ ...deletion, facts: event.target.checked })} />Аварии, предупреждения и команды</label><label><input type="checkbox" checked={deletion.intervals} onChange={(event) => setDeletion({ ...deletion, intervals: event.target.checked })} />Интервалы операторов</label></div>
      <button className="statistics-hard-delete" onClick={async () => { if (!window.confirm(`Безвозвратно удалить выбранную статистику с ${formatDateTime(range.from)} по ${formatDateTime(range.to)}?`)) return; const result = await statisticsApi.hardDelete({ fromMs: range.from, toMs: range.to, userId: range.userId, ...deletion }); setMessage(`Удалено: телеметрия ${result.equipment}, события ${result.facts}, интервалы ${result.intervals}`); await load(); }}><Icon icon={deleteOutlineIcon} aria-hidden="true" />Удалить выбранные данные</button>
    </section>
  </div>;
}

export function StatisticsSettingsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'schedule' | 'editor'>('schedule');
  return <section className="statistics-settings-panel">
    <header className="statistics-heading"><div><span>НАСТРОЙКА ЯЧЕЙКИ · СТАТИСТИКА</span><h2>Управление статистикой</h2><p>Расписание смен и серверные исторические данные</p></div><button type="button" onClick={onClose}><Icon icon={closeIcon} aria-hidden="true" /></button></header>
    <nav className="statistics-settings-tabs"><button className={tab === 'schedule' ? 'active' : ''} onClick={() => setTab('schedule')}><Icon icon={calendarMonthOutlineIcon} aria-hidden="true" />Расписание смен</button><button className={tab === 'editor' ? 'active' : ''} onClick={() => setTab('editor')}><Icon icon={databaseOutlineIcon} aria-hidden="true" />Редактор статистики</button></nav>
    <div className="statistics-settings-content">{tab === 'schedule' ? <ShiftScheduleEditor /> : <StatisticsEditor />}</div>
  </section>;
}
