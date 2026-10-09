import { useEffect, useState } from 'react';
import { Activity, BarChart3, Clock3, Database, HardDrive, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { Dialog } from '../components/ui/Dialog';
import { StatisticsEditor } from '../statistics/StatisticsPanels';
import { archiveApi, type ArchiveKey, type ArchiveSnapshot, type ArchiveStatus } from './client';
import './admin-panel.css';

type Tab = 'archives' | 'statistics' | 'actions';
const KEYS: ArchiveKey[] = ['statistics', 'events', 'cyclogram'];
const INFO = {
  statistics: { title: 'Статистика', subtitle: 'Телеметрия, производственные факты и интервалы операторов', icon: BarChart3 },
  events: { title: 'Журнал событий', subtitle: 'Состояния оборудования, команды, аварии и связь', icon: Activity },
  cyclogram: { title: 'Циклограмма', subtitle: 'Подробная история работы робота и станков', icon: Database },
};
const ACTIONS: Record<string, string> = {
  'retention-changed': 'Изменён срок хранения',
  'clock-reset': 'Срок продлён',
  'manual-clear': 'Архив очищен вручную',
  'expired-clear': 'Архив очищен по истечении срока',
  'range-clear': 'Удалена часть статистики',
};
const formatBytes = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Нет данных';
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  const level = Math.min(units.length - 1, Math.max(0, Math.floor(Math.log(Math.max(1, value)) / Math.log(1024))));
  return `${(value / 1024 ** level).toLocaleString('ru-RU', { maximumFractionDigits: level ? 1 : 0 })} ${units[level]}`;
};
const formatDate = (value: number) => new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(value);
const countText = (status: ArchiveStatus) => {
  if (!status.counts) return 'Хранилище недоступно';
  if (status.key === 'statistics') {
    return `${(status.counts.equipment ?? 0).toLocaleString('ru-RU')} минутных записей · ${(status.counts.facts ?? 0).toLocaleString('ru-RU')} событий · ${(status.counts.intervals ?? 0).toLocaleString('ru-RU')} интервалов`;
  }
  const count = status.key === 'events' ? status.counts.events : status.counts.intervals;
  return `${(count ?? 0).toLocaleString('ru-RU')} записей`;
};

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('archives');
  const [snapshot, setSnapshot] = useState<ArchiveSnapshot | null>(null);
  const [days, setDays] = useState<Record<ArchiveKey, string>>({ statistics: '90', events: '90', cyclogram: '90' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<ArchiveKey | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [clearKey, setClearKey] = useState<ArchiveKey | null>(null);

  const applySnapshot = (value: ArchiveSnapshot) => {
    setSnapshot(value);
    setDays(Object.fromEntries(KEYS.map((key) => [key, String(value.archives[key].retentionDays)])) as Record<ArchiveKey, string>);
  };
  const load = async () => {
    setLoading(true);
    setError('');
    try { applySnapshot(await archiveApi.status()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const run = async (key: ArchiveKey, action: 'save' | 'reset' | 'clear') => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      if (action === 'save') {
        const value = Number(days[key]);
        if (!Number.isInteger(value) || value < 1 || value > 3650) throw new Error('Укажи срок от 1 до 3650 дней');
        applySnapshot(await archiveApi.setRetention(key, value));
        setNotice(`Срок архива «${INFO[key].title}» изменён. Новый отсчёт начался сейчас.`);
      } else if (action === 'reset') {
        applySnapshot(await archiveApi.resetClock(key));
        setNotice(`Срок архива «${INFO[key].title}» продлён с текущего момента.`);
      } else {
        const result = await archiveApi.clear(key);
        applySnapshot(result);
        setClearKey(null);
        setNotice(`Архив «${INFO[key].title}» очищен, новый отсчёт начался сейчас.`);
      }
    } catch (reason) { if (action === 'clear') setClearKey(null); setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(null); }
  };
  const disk = snapshot?.disk;
  const diskUsed = disk?.available && disk.totalBytes && disk.freeBytes !== null
    ? Math.max(0, Math.min(100, (1 - disk.freeBytes / disk.totalBytes) * 100)) : 0;

  return <section className="admin-panel" aria-label="Администрирование">
    <header className="admin-panel__header">
      <div className="admin-panel__identity"><span className="admin-panel__icon"><Database aria-hidden="true" /></span><div><span>СИСТЕМА · АДМИНИСТРАТОР</span><h2>Администрирование</h2><p>Архивы, сроки хранения и редактор статистики</p></div></div>
      <div className="admin-panel__header-actions"><button type="button" onClick={() => void load()} disabled={loading} title="Обновить данные" aria-label="Обновить данные"><RefreshCw aria-hidden="true" /></button><button type="button" onClick={onClose} title="Закрыть" aria-label="Закрыть администрирование"><X aria-hidden="true" /></button></div>
    </header>
    <nav className="admin-panel__tabs" aria-label="Разделы администрирования">
      <button type="button" className={tab === 'archives' ? 'active' : ''} onClick={() => { setTab('archives'); void load(); }}><HardDrive aria-hidden="true" />Хранилища</button>
      <button type="button" className={tab === 'statistics' ? 'active' : ''} onClick={() => setTab('statistics')}><BarChart3 aria-hidden="true" />Редактор статистики</button>
      <button type="button" className={tab === 'actions' ? 'active' : ''} onClick={() => { setTab('actions'); void load(); }}><Clock3 aria-hidden="true" />Действия</button>
    </nav>
    {(error || notice) && <div className={`admin-panel__message${error ? ' error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    <div className="admin-panel__content">
      {tab === 'archives' && <>
        <section className="admin-panel__disk">
          <span className="admin-panel__disk-icon"><HardDrive aria-hidden="true" /></span>
          <div><span className="admin-panel__eyebrow">ДИСК ШЛЮЗА</span><strong>{disk?.available ? formatBytes(disk.freeBytes) : 'Свободное место недоступно'}</strong><small>{disk?.available ? `свободно из ${formatBytes(disk.totalBytes)}` : 'Gateway не смог прочитать состояние диска'}</small></div>
          {disk?.available && <div className="admin-panel__disk-meter"><span>Занято {Math.round(diskUsed)}%</span><div><i style={{ width: `${diskUsed}%` }} /></div></div>}
        </section>
        {loading && !snapshot ? <p className="admin-panel__empty">Читаем состояние архивов…</p> : <div className="admin-panel__cards">
          {KEYS.map((key) => {
            const status = snapshot?.archives[key];
            if (!status) return null;
            const info = INFO[key];
            const Icon = info.icon;
            const progress = Math.min(100, status.elapsedDays / status.retentionDays * 100);
            return <article className="admin-panel__card" key={key}>
              <header><span className="admin-panel__card-icon"><Icon aria-hidden="true" /></span><div><span className="admin-panel__eyebrow">АРХИВ ДАННЫХ</span><h3>{info.title}</h3><p>{info.subtitle}</p></div></header>
              <div className="admin-panel__card-stats"><strong>{countText(status)}</strong><span>На диске: {formatBytes(status.sizeBytes)}</span></div>
              <div className="admin-panel__deadline"><div><span>Прошло {status.elapsedDays} из {status.retentionDays} дней</span><b>Осталось {status.remainingDays} дней</b></div><div className="admin-panel__deadline-track"><i style={{ width: `${progress}%` }} /></div><small>От {formatDate(status.startedAtMs)} до {formatDate(status.expiresAtMs)}</small></div>
              <div className="admin-panel__retention"><label htmlFor={`retention-${key}`}>Срок хранения, дней</label><div><input id={`retention-${key}`} type="number" min="1" max="3650" step="1" value={days[key]} onChange={(event) => setDays((current) => ({ ...current, [key]: event.target.value }))} disabled={busy !== null || !status.available} /><button type="button" onClick={() => void run(key, 'save')} disabled={busy !== null || !status.available || days[key] === String(status.retentionDays)}>Сохранить</button></div><small>Изменение срока запускает новый отсчёт для всего архива.</small></div>
              <footer><button type="button" onClick={() => void run(key, 'reset')} disabled={busy !== null || !status.available}><RotateCcw aria-hidden="true" />Сбросить счёт срока</button><button className="danger" type="button" onClick={() => setClearKey(key)} disabled={busy !== null || !status.available}><Trash2 aria-hidden="true" />Очистить</button></footer>
              {key === 'statistics' && <button className="admin-panel__editor-link" type="button" onClick={() => setTab('statistics')}>Редактировать отдельные периоды и интервалы →</button>}
              {!status.available && <p className="admin-panel__store-error">{status.error}</p>}
            </article>;
          })}
        </div>}
        <p className="admin-panel__footnote">По окончании срока соответствующий архив очищается автоматически. Настройки смен и учётные записи сохраняются.</p>
      </>}
      {tab === 'statistics' && <StatisticsEditor />}
      {tab === 'actions' && <section className="admin-panel__actions"><header><span className="admin-panel__eyebrow">ИСТОРИЯ АДМИНИСТРИРОВАНИЯ</span><h3>Операции с архивами</h3></header>{snapshot?.actions.length ? snapshot.actions.map((action) => <article key={action.id}><time>{formatDate(action.timestampMs)}</time><strong>{ACTIONS[action.action] ?? action.action}</strong><span>{INFO[action.key].title}</span><small>{action.actorName ?? 'Система'}</small></article>) : <p>Операций пока нет</p>}</section>}
    </div>
    <Dialog open={clearKey !== null} onOpenChange={(open) => { if (!open && busy === null) setClearKey(null); }} title={clearKey ? `Очистить архив «${INFO[clearKey].title}»?` : 'Очистить архив?'} description="Все накопленные записи выбранного архива будут удалены. Отсчёт срока начнётся заново." footer={<><button className="admin-panel__dialog-cancel" type="button" onClick={() => setClearKey(null)} disabled={busy !== null}>Отмена</button><button className="admin-panel__dialog-danger" type="button" onClick={() => { if (clearKey) void run(clearKey, 'clear'); }} disabled={busy !== null}>Очистить архив</button></>}><p>Это действие нельзя отменить. Очистка статистики сохраняет расписание смен и текущую авторизацию оператора; запись циклограммы продолжится с текущего состояния PLC.</p></Dialog>
  </section>;
}
