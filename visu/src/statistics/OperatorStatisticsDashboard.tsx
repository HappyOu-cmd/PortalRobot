import { useId, useState, type ReactNode } from 'react';
import { Icon, type IconProps } from '@iconify/react';
import { cva } from 'class-variance-authority';
import clockIcon from '@iconify-icons/material-symbols/schedule-outline';
import factoryIcon from '@iconify-icons/material-symbols/factory-outline';
import machineIcon from '@iconify-icons/material-symbols/microwave-gen-outline';
import ovenIcon from '@iconify-icons/material-symbols/oven-gen-outline';
import trophyIcon from '@iconify-icons/material-symbols/trophy-outline';
import warningIcon from '@iconify-icons/material-symbols/warning-outline';
import checkIcon from '@iconify-icons/material-symbols/check-circle-outline';
import cancelIcon from '@iconify-icons/material-symbols/cancel-outline';
import arrowIcon from '@iconify-icons/material-symbols/arrow-outward';
import shieldIcon from '@iconify-icons/mdi/shield-alert-outline';
import robotIcon from '@iconify-icons/mdi/robot-industrial-outline';
import chartIcon from '@iconify-icons/mdi/chart-line';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Dialog } from '../components/ui/Dialog';
import { cn } from '../lib/utils';
import type { StatisticsSummary } from './client';
import './operator-statistics.css';

type SummaryProps = { summary: StatisticsSummary; shiftSummary: StatisticsSummary; allSummary: StatisticsSummary };
const number = new Intl.NumberFormat('ru-RU');
const date = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });
const percent = (value: number, total: number) => total > 0 ? Math.min(100, Math.max(0, value / total * 100)) : 0;
const clamp = (value: number) => Math.min(100, Math.max(0, value));
const mean = (summary: StatisticsSummary) => summary.equipment.length
  ? summary.equipment.reduce((sum, item) => sum + item.loadPercent, 0) / summary.equipment.length : 0;
const duration = (ms: number) => {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
};
const periodLabel = ({ fromMs, toMs }: StatisticsSummary['period']) => date.format(fromMs) === date.format(toMs)
  ? `${date.format(fromMs)} · ${time.format(fromMs)} — ${time.format(toMs)}`
  : `${date.format(fromMs)}, ${time.format(fromMs)} — ${date.format(toMs)}, ${time.format(toMs)}`;
const equipmentIcons = { 'machine-1': machineIcon, 'machine-2': ovenIcon, 'machine-3': factoryIcon, robot: robotIcon };
const surface = cva('sc-card', { variants: { tone: { plain: '', primary: 'sc-card--primary' } }, defaultVariants: { tone: 'plain' } });

function Card({ className, children, primary = false }: { className: string; children: ReactNode; primary?: boolean }) {
  return <section className={cn(surface({ tone: primary ? 'primary' : 'plain' }), className)}>{children}</section>;
}

function Metric({ icon, label, value, detail }: { icon: IconProps['icon']; label: string; value: string; detail: string }) {
  return <Card className="sc-metric">
    <span className="sc-metric-icon"><Icon icon={icon} aria-hidden="true" /></span>
    <div className="sc-metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
  </Card>;
}

function Production({ summary, shiftSummary }: Pick<SummaryProps, 'summary' | 'shiftSummary'>) {
  const plan = shiftSummary.shiftPlan ?? 0;
  const progress = percent(shiftSummary.producedParts, plan);
  return <Card primary className="sc-production">
    <header><h2>Выпущено деталей</h2><span className="sc-icon-disc"><Icon icon={factoryIcon} aria-hidden="true" /></span></header>
    <div className="sc-production-total"><strong>{number.format(summary.producedParts)}</strong><p>Подтверждено укладкой<br />в магазин</p></div>
    <div className="sc-plan">
      <h3>План текущей смены</h3>
      <div className="sc-plan-body">
        <div className="sc-plan-ring" role="img" aria-label={plan > 0 ? `Выполнение плана: ${progress.toFixed(0)}%` : 'План не задан'}>
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="sc-ring-track" cx="60" cy="60" r="51" /><circle className="sc-ring-value" cx="60" cy="60" r="51" pathLength="100" strokeDasharray={`${progress} 100`} /></svg>
          <span>{plan > 0 ? <>{progress.toFixed(0)}<small>%</small></> : '—'}</span>
        </div>
        <div className="sc-plan-copy"><strong>{number.format(shiftSummary.producedParts)} <span>/ {plan > 0 ? number.format(plan) : '—'}</span></strong><span>Факт / план</span></div>
      </div>
      <p>{plan > 0 ? shiftSummary.producedParts >= plan ? 'Сменный план выполнен' : `Осталось выпустить ${number.format(plan - shiftSummary.producedParts)}` : 'План не задан'}</p>
    </div>
  </Card>;
}

function Experience({ summary }: { summary: StatisticsSummary }) {
  const experience = summary.experience;
  return <Card className="sc-experience">
    <header><h2>Опыт оператора</h2><span className="sc-icon-disc"><Icon icon={trophyIcon} aria-hidden="true" /></span></header>
    {experience ? <>
      <div className="sc-level"><strong>{experience.level}</strong><span>уровень</span><b>{number.format(experience.xp)} <small>XP</small></b></div>
      <div className="sc-track"><i style={{ width: `${clamp(experience.progressPercent)}%` }} /></div>
      <p>{experience.level >= 100 ? 'Максимальный уровень' : <>До следующего уровня <b>{number.format(Math.max(0, experience.nextThreshold - experience.xp))} XP</b></>}</p>
    </> : <p className="sc-empty">Данные об опыте пока недоступны</p>}
  </Card>;
}

function Dynamics({ summary }: { summary: StatisticsSummary }) {
  const fillId = useId().replace(/:/g, '');
  const shortPeriod = summary.period.toMs - summary.period.fromMs <= 36 * 3_600_000;
  return <Card className="sc-dynamics">
    <header><h2>Динамика загрузки</h2><span className="sc-chart-legend"><i />Средняя загрузка ячейки, %</span></header>
    <div className="sc-chart" role="img" aria-label={`График средней загрузки ячейки за период: ${summary.period.label}`}>
      {summary.trend.length > 0 ? <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={summary.trend} margin={{ top: 14, right: 12, bottom: 0, left: -18 }}>
          <defs><linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1769e8" stopOpacity={.14} /><stop offset="100%" stopColor="#1769e8" stopOpacity={.015} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="#e8ebef" strokeDasharray="3 5" />
          <XAxis dataKey="timestampMs" tickFormatter={(value: number) => (shortPeriod ? time : shortDate).format(value)} tick={{ fontSize: 11, fill: '#858b96' }} axisLine={false} tickLine={false} minTickGap={30} dy={8} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: '#858b96' }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ border: '1px solid #edf0f3', borderRadius: 12, padding: '10px 14px', fontSize: 12 }} labelFormatter={(value) => `${date.format(Number(value))}, ${time.format(Number(value))}`} formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Загрузка']} />
          <Area type="monotone" dataKey="loadPercent" stroke="#1769e8" strokeWidth={2.5} fill={`url(#${fillId})`} dot={false} activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff', fill: '#1769e8' }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer> : <p className="sc-empty">Данные появятся после начала сбора</p>}
    </div>
  </Card>;
}

function Equipment({ summary }: { summary: StatisticsSummary }) {
  return <Card className="sc-equipment">
    <header><h2>Загрузка оборудования</h2>{summary.partialData && <span className="sc-partial"><Icon icon={warningIcon} aria-hidden="true" />Неполные данные</span>}</header>
    <div className="sc-equipment-list">{summary.equipment.length > 0 ? summary.equipment.map((item) => <div className="sc-equipment-row" key={item.lane}>
      <span className="sc-equipment-icon"><Icon icon={equipmentIcons[item.lane]} aria-hidden="true" /></span>
      <div><span>{item.label}</span><div className="sc-track"><i style={{ width: `${item.observedMs > 0 ? clamp(item.loadPercent) : 0}%` }} /></div></div>
      <strong>{item.observedMs > 0 ? <>{item.loadPercent.toFixed(0)}<small>%</small></> : '—'}</strong>
    </div>) : <p className="sc-empty">Нет данных об оборудовании</p>}</div>
  </Card>;
}

function Events({ summary }: { summary: StatisticsSummary }) {
  const [open, setOpen] = useState(false);
  const total = summary.commandsAccepted + summary.commandsRejected;
  return <><Card className="sc-events">
    <header><h2>События и команды</h2></header>
    <button className={cn('sc-event-row sc-event-row--interactive', summary.alarmsActivated > 0 && 'sc-event-row--alarm')} onClick={() => setOpen(true)} type="button" aria-label={`Аварии: ${summary.alarmsActivated}. Открыть детализацию`}>
      <Icon icon={shieldIcon} aria-hidden="true" /><span>Аварии</span><strong>{number.format(summary.alarmsActivated)}</strong><Icon icon={arrowIcon} aria-hidden="true" />
    </button>
    <div className={cn('sc-event-row', summary.warningsActivated > 0 && 'sc-event-row--warning')}><Icon icon={warningIcon} aria-hidden="true" /><span>Предупреждения</span><strong>{number.format(summary.warningsActivated)}</strong></div>
    <div className="sc-event-row sc-event-row--commands"><Icon icon={checkIcon} aria-hidden="true" /><span>Команды подтверждены<small>{percent(summary.commandsAccepted, total).toFixed(1)}% от всех команд</small></span><strong>{number.format(summary.commandsAccepted)}</strong></div>
    <div className="sc-event-row"><Icon icon={cancelIcon} aria-hidden="true" /><span>Команды отклонены<small>{percent(summary.commandsRejected, total).toFixed(1)}% от всех команд</small></span><strong>{number.format(summary.commandsRejected)}</strong></div>
  </Card>
    <Dialog title="Аварии за выбранный период" description={periodLabel(summary.period)} open={open} onOpenChange={setOpen} className="sc-alarm-dialog">
      <div className="sc-alarm-list">{summary.alarmBreakdown.length > 0 ? summary.alarmBreakdown.map((alarm) => <div key={alarm.code || alarm.message}><span>{alarm.message}<small>{alarm.code}</small></span><strong>{alarm.count}</strong></div>) : <p>Аварий за период нет</p>}</div>
    </Dialog>
  </>;
}

export function OperatorStatisticsDashboard({ summary, shiftSummary, allSummary }: SummaryProps) {
  return <div className="statistics-concept">
    <div className="sc-layout">
      <div className="sc-personal"><Production summary={summary} shiftSummary={shiftSummary} />{(summary.experience || allSummary.experience) && <Experience summary={summary.experience ? summary : allSummary} />}</div>
      <div className="sc-analysis">
        <div className="sc-metrics">
          <Metric icon={clockIcon} label="Подтверждённое время" value={duration(summary.responsibilityMs)} detail={`${percent(summary.responsibilityMs, summary.period.toMs - summary.period.fromMs).toFixed(0)}% выбранного периода`} />
          <Metric icon={chartIcon} label="Средняя загрузка за смену" value={shiftSummary.coverageMs > 0 ? `${mean(shiftSummary).toFixed(0)}%` : '—'} detail={`${shiftSummary.coveragePercent.toFixed(0)}% покрытия данных`} />
          <Metric icon={chartIcon} label="Средняя загрузка за всё время" value={allSummary.coverageMs > 0 ? `${mean(allSummary).toFixed(0)}%` : '—'} detail={`${allSummary.coveragePercent.toFixed(0)}% покрытия данных`} />
        </div>
        <Dynamics summary={summary} />
        <div className="sc-details"><Equipment summary={summary} /><Events key={`${summary.period.fromMs}:${summary.period.toMs}`} summary={summary} /></div>
      </div>
    </div>
  </div>;
}
