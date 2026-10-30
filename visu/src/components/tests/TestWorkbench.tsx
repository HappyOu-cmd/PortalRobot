import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import flaskIcon from '@iconify-icons/mdi/flask-outline';
import playIcon from '@iconify-icons/mdi/play';
import stopIcon from '@iconify-icons/mdi/stop';
import closeIcon from '@iconify-icons/mdi/close';
import alertIcon from '@iconify-icons/mdi/alert-circle-outline';
import checkIcon from '@iconify-icons/mdi/check-circle-outline';
import { gatewayApiUrl } from '../../api/gateway';
import { cn } from '../../lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { TestScenarioEditor } from './TestScenarioEditor';
import { TestSuiteHelp } from './TestSuiteHelp';
import { chooseCase, decisions, freshScenario, normalizeScenario, runBlockedReason, runProgress, runStatuses, stages, suites,
  type Catalog, type Run, type RunCase, type Scenario, type TestStatus } from './testWorkbenchState';
import './test-workbench.css';

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(gatewayApiUrl(path), { ...options,
    headers: options?.body ? { 'Content-Type': 'application/json', ...options.headers } : options?.headers });
  let body;
  try { body = await response.json(); }
  catch { throw new Error(`Gateway вернул не JSON (HTTP ${response.status}). Проверьте адрес gateway.`); }
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  if (body === null) throw new Error('Gateway вернул пустой ответ');
  return body as T;
}
const format = (value: unknown) => typeof value === 'boolean' ? value ? 'Да' : 'Нет'
  : typeof value === 'string' ? decisions[value] ?? value : JSON.stringify(value) ?? 'Нет данных';
const time = (value: number) => new Date(value).toLocaleString('ru-RU');
const caseStatus = (status: string) => status === 'PASS' ? 'Пройден' : status === 'FAIL' ? 'Не пройден' : runStatuses[status] ?? status;

function CaseDiagnostics({ item, onEdit }: { item: RunCase; onEdit: (value: Scenario) => void }) {
  const checks = item.diagnostics?.checks ?? [];
  const expectations = item.diagnostics?.expectations ?? item.scenario?.expectations ?? {};
  return <section className="tw-case-detail" aria-label="Диагностика выбранного теста">
    <div className="tw-detail-heading"><div><span>Тест {item.caseIndex}</span><h3>{item.name}</h3></div><span className="tw-result" data-status={item.status}>{caseStatus(item.status)}</span></div>
    {item.scenario?.description && <p>{item.scenario.description}</p>}
    <div className="tw-verdict" data-status={item.status}><Icon icon={item.status === 'PASS' ? checkIcon : alertIcon} /><div>
      <strong>{item.status === 'PASS' ? 'Сценарий выполнен по плану' : 'Сценарий отклонился от плана'}</strong>
      <p>{item.reason || 'Подробная причина не сохранена в этом отчёте.'}</p>{item.stage && <small>Этап: {stages[item.stage] ?? item.stage}</small>}</div></div>
    {checks.length ? <div className="tw-checks"><table><thead><tr><th>Проверка</th><th>Ожидали</th><th>Получили</th><th>Итог</th></tr></thead><tbody>
      {checks.map((check, i) => <tr key={i} data-pass={check.passed}><th scope="row">{check.label}</th><td>{format(check.expected)}</td><td>{format(check.actual)}</td><td>{check.passed ? 'Совпало' : 'Расхождение'}</td></tr>)}
    </tbody></table></div> : <p className="tw-muted">В этом отчёте нет подробных проверок. Новый runner сохраняет их для успешных и неуспешных случаев.</p>}
    {!!Object.keys(expectations).length && <details><summary>Условия успешного прохождения</summary><dl className="tw-values">{Object.entries(expectations).map(([key, value]) => <div key={key}><dt>{({ firstDecision: 'Первое решение', fullCycle: 'Полный цикл', expectedMagazine: 'Магазин', applyRejected: 'Ожидается отказ загрузки', callStates: 'Состояния вызовов ГК', destinations: 'Назначения ГК' } as Record<string, string>)[key] ?? key}</dt><dd>{format(value)}</dd></div>)}</dl></details>}
    {item.diagnostics?.observed && <details><summary>Теги PLC и подтверждения команд</summary><dl className="tw-values tw-tags">{Object.entries(item.diagnostics.observed).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{format(value)}</dd></div>)}</dl></details>}
    {item.snapshot && <details><summary>Полный снимок при сбое</summary><pre>{JSON.stringify(item.snapshot, null, 2)}</pre></details>}
    <footer><span>{item.durationMs == null ? 'Длительность не сохранена' : `${(item.durationMs / 1000).toFixed(1)} с`}</span>{item.scenario && <button type="button" onClick={() => onEdit(item.scenario!)}>Открыть сценарий в редакторе</button>}</footer>
  </section>;
}

export function TestWorkbench({ simulationFactor, simulationFactorApplied, simulationFactorAllowed,
  simulationFactorPending, simulationFactorBusy, simulationFactorError, onSend, onClose, className = '',
}: {
  simulationFactor: number; simulationFactorApplied: number; simulationFactorAllowed: boolean;
  simulationFactorPending: boolean; simulationFactorBusy: boolean; simulationFactorError: boolean;
  onSend: (message: { command: string; value?: boolean | number }) => void; onClose: () => void; className?: string;
}) {
  const [tab, setTab] = useState('run');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [editor, setEditor] = useState<Scenario>(freshScenario);
  const [runs, setRuns] = useState<Run[]>([]);
  const [status, setStatus] = useState<TestStatus>({ activeRunId: null });
  const [catalog, setCatalog] = useState<Catalog>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [source, setSource] = useState('builtin');
  const [suite, setSuite] = useState('acceptance');
  const [fixedCase, setFixedCase] = useState(0);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [caseIndex, setCaseIndex] = useState<number | null>(null);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [robotInterface, setRobotInterface] = useState('softmotion');
  const [environment, setEnvironment] = useState('simulation');
  const [speedProfile, setSpeedProfile] = useState('realtime');
  const [factor, setFactor] = useState(simulationFactor);
  const [seed, setSeed] = useState(1);
  const [count, setCount] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => { setFixedCase(0); }, [status.plc?.magazineMode]);
  useEffect(() => { setFactor(simulationFactor); }, [simulationFactor]);
  useEffect(() => {
    let cancelled = false;
    setCatalog({});
    Promise.all([api<Scenario[]>('/api/test-scenarios'), api<Catalog>('/api/test-catalog')]).then(([saved, entries]) => {
      if (!cancelled) { setScenarios(saved.map(normalizeScenario)); setCatalog(entries); }
    }).catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [refreshKey, status.plc?.magazineMode]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const [system, history] = await Promise.all([api<TestStatus>('/api/test-system/status'), api<Run[]>('/api/test-runs?limit=30')]);
        const id = selectedRunId ?? system.activeRunId ?? history[0]?.id;
        const detail = id ? await api<Run>(`/api/test-runs/${id}`) : null;
        if (!cancelled) { setStatus(system); setRuns(history); setRun(detail); setConnectionError(''); }
      } catch (e) { if (!cancelled) setConnectionError(`Не удалось обновить тесты: ${String(e)}`); }
      if (!cancelled) timer = setTimeout(poll, 1200);
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [selectedRunId, refreshKey]);
  const perform = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); setRefreshKey(value => value + 1); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  const savedSelection = scenarios.filter(s => selected.includes(s.id!));
  const blocked = connectionError || runBlockedReason(status, source === 'saved' ? 'smoke' : suite, robotInterface, environment, source === 'saved' ? savedSelection : [])
    || (source === 'saved' && !savedSelection.length ? 'Выберите сохранённые сценарии во вкладке «Сценарии»' : '')
    || (source === 'builtin' && suite !== 'generated' && !catalog[suite]?.length ? 'Каталог тестов ещё не загружен' : '');
  const start = () => perform(async () => {
    const result = await api<Run>('/api/test-runs', { method: 'POST', body: JSON.stringify({
      suite: source === 'saved' ? 'smoke' : suite, environment, robotInterface,
      speedProfile: robotInterface === 'softmotion' ? (factor > 1 ? 'fast' : 'realtime') : speedProfile,
      simulationTimeFactor: factor, seed, count, scenarioIds: source === 'saved' ? selected : [],
      fixedCaseIndex: source === 'builtin' && suite !== 'generated' && fixedCase ? fixedCase : null,
    }) });
    setSelectedRunId(result.id); setRun(result); setCaseIndex(null); setOnlyFailed(false);
  });
  const edit = (value: Scenario) => { const next = normalizeScenario(value); setEditor({ ...next, id: undefined, name: `${next.name} — повтор` }); setTab('scenarios'); setNotice('Сценарий загружен в редактор. Изменения ещё не сохранены.'); };
  const chooseRun = (id: number) => { setSelectedRunId(id); setRun(null); setCaseIndex(null); setOnlyFailed(false); };
  const cases = run?.cases ?? [];
  const visibleCases = onlyFailed ? cases.filter(c => c.status === 'FAIL') : cases;
  const selectedCase = chooseCase(visibleCases, caseIndex);
  const active = runs.find(r => r.id === status.activeRunId);
  return <aside className={cn('test-workbench test-workbench-v3', className)} aria-label="Автоматические тесты ячейки">
    <header className="tw-header"><span className="tw-mark"><Icon icon={flaskIcon} /></span><div><h2>Автоматические тесты</h2><p>Проверка сценариев и диагностика результата</p></div>
      <span className="tw-connection" data-online={Boolean(status.plc?.connected)}><i />{status.plc?.connected ? 'PLC подключён' : 'Нет связи с PLC'}</span>
      <button className="tw-close" type="button" onClick={onClose} aria-label="Закрыть тесты"><Icon icon={closeIcon} /></button></header>
    {(error || connectionError) && <div className="tw-error" role="alert"><Icon icon={alertIcon} /><span>{error || connectionError}</span><button type="button" aria-label="Скрыть ошибку" onClick={() => { setError(''); setConnectionError(''); }}><Icon icon={closeIcon} /></button></div>}
    {notice && <div className="tw-notice" role="status">{notice}</div>}
    <Tabs className="tw-tabs" value={tab} onValueChange={setTab}>
      <TabsList className="tw-tab-list" aria-label="Разделы тестов"><TabsTrigger value="run">Запуск и результаты</TabsTrigger><TabsTrigger value="scenarios">Сценарии <span>{scenarios.length}</span></TabsTrigger></TabsList>
      <TabsContent value="run" className="tw-tab-content"><div className="tw-run-layout">
        <section className="tw-launch"><div className="tw-launch-heading"><h3>Запуск проверки</h3>
          <TestSuiteHelp catalog={catalog} selectedSuite={source === 'builtin' ? suite : undefined} /></div>
          <label>Источник<select disabled={busy || Boolean(status.activeRunId)} value={source} onChange={e => setSource(e.target.value)}><option value="builtin">Штатные наборы</option><option value="saved">Сохранённые сценарии · {selected.length}</option></select></label>
          {source === 'builtin' ? <><label>Набор<select value={suite} disabled={busy || Boolean(status.activeRunId)} onChange={e => { setSuite(e.target.value); setFixedCase(0); }}>{Object.entries(suites).map(([key, value]) => <option key={key} value={key}>{value.label}{catalog[key] ? ` · ${catalog[key].length}` : ''}</option>)}</select></label><p className="tw-muted">{suites[suite]?.description}</p>
            {suite !== 'generated' && <label>Что проверить<select value={fixedCase} onChange={e => setFixedCase(Number(e.target.value))} disabled={busy || Boolean(status.activeRunId)}><option value={0}>Весь набор · {catalog[suite]?.length ?? '…'} тестов</option>{catalog[suite]?.map(c => <option value={c.index} key={c.index}>{c.index}. {c.name}</option>)}</select></label>}
            {suite === 'generated' && <div className="tw-editor-row"><label>Seed<input type="number" value={seed} onChange={e => setSeed(Number(e.target.value))} /></label><label>Комбинаций<input type="number" min={1} max={1000} value={count} onChange={e => setCount(Number(e.target.value))} /></label></div>}
          </> : <div className="tw-saved-selection"><p>{savedSelection.length ? savedSelection.map(s => s.name).join(', ') : 'Выберите сценарии в библиотеке.'}</p><button type="button" onClick={() => setTab('scenarios')}>Открыть библиотеку</button></div>}
          <details className="tw-settings"><summary>Параметры выполнения</summary>
            <label>Среда<select value={environment} disabled={Boolean(status.activeRunId)} onChange={e => { setEnvironment(e.target.value); setRobotInterface(e.target.value === 'sc500_bench' ? 'sc500-modbus' : 'softmotion'); setSpeedProfile('realtime'); }}><option value="simulation">Симуляция</option><option value="sc500_bench">Стенд SC-500</option></select></label>
            <label>Интерфейс робота<select value={robotInterface} disabled={Boolean(status.activeRunId)} onChange={e => setRobotInterface(e.target.value)}>{environment === 'sc500_bench' ? <option value="sc500-modbus">SC-500 Modbus</option> : <><option value="softmotion">SoftMotion</option><option value="python-modbus">Python Modbus</option></>}</select></label>
            {robotInterface === 'softmotion' ? <label>Скорость симуляции · ×{factor}<input type="range" min={1} max={100} value={factor} disabled={!simulationFactorAllowed || Boolean(status.activeRunId)} onChange={e => setFactor(Number(e.target.value))} /><small>Применяется при запуске. Сейчас ×{simulationFactorApplied}{simulationFactorError ? ' · ошибка лимитов' : simulationFactorBusy ? ' · применение лимитов' : simulationFactorPending ? ' · ожидает применения' : ''}</small></label> : <label>Скорость<select value={speedProfile} disabled={Boolean(status.activeRunId)} onChange={e => setSpeedProfile(e.target.value)}><option value="realtime">Обычная</option>{environment === 'simulation' && <option value="fast">Ускоренная</option>}</select></label>}
            <div className="tw-environment"><span>Среда PLC: {['Обычная', 'Симуляция', 'Стенд SC-500'][status.plc?.appliedEnvironment ?? 0]}</span><button type="button" disabled={!status.plc?.environmentChangeAllowed || Boolean(status.activeRunId)} onClick={() => onSend({ command: 'test.environment.set', value: environment === 'simulation' ? 1 : 2 })}>Применить среду</button></div>
          </details>
          <div className="tw-preflight"><span>Магазины PLC</span><strong>{status.plc?.magazineMode === 0 ? 'Статичные · 2 × 120' : status.plc?.magazineMode === 1 ? 'Двухпалетные · 4 × 96' : 'Тип неизвестен'}</strong><small>Контракт тестов: {status.plc?.testSchemaVersion ? `v${status.plc.testSchemaVersion}` : 'не получен'} · {robotInterface === 'softmotion' ? 'SoftMotion' : robotInterface}</small></div>
          <button className="tw-primary tw-start" type="button" disabled={busy || Boolean(blocked)} onClick={start}><Icon icon={playIcon} />{busy ? 'Подготовка…' : 'Запустить проверку'}</button>
          {blocked && <p className="tw-blocked"><Icon icon={alertIcon} />{blocked}</p>}
          {status.activeRunId && <div className="tw-active" role="status"><strong>Прогон #{status.activeRunId}</strong><p>{stages[active?.stage ?? ''] ?? 'Выполняется'}</p><progress max={100} value={runProgress(active)} /><span>{active?.passed ?? 0} пройдено · {active?.failed ?? 0} ошибок</span>
            <button className="tw-danger" type="button" disabled={busy || active?.status === 'ABORTING'} onClick={() => perform(async () => { await api(`/api/test-runs/${status.activeRunId}/abort`, { method: 'POST' }); })}><Icon icon={stopIcon} />{active?.status === 'ABORTING' ? 'Остановка…' : 'Остановить прогон'}</button>
            {selectedRunId !== status.activeRunId && <button type="button" onClick={() => chooseRun(status.activeRunId!)}>Показать текущий прогон</button>}</div>}
        </section>
        <section className="tw-results"><header className="tw-results-header"><div><h3>Результаты проверки</h3><p>{run ? `Прогон #${run.id} · ${time(run.startedAt)} · ${suites[run.suite]?.label ?? run.suite}` : 'Выберите набор и запустите проверку'}</p></div><label className="tw-history-select">История прогонов<select value={run?.id ?? ''} onChange={e => chooseRun(Number(e.target.value))}><option value="" disabled>Прогонов пока нет</option>{runs.map(r => <option value={r.id} key={r.id}>#{r.id} · {suites[r.suite]?.label ?? r.suite} · {runStatuses[r.status] ?? r.status} · {time(r.startedAt)}</option>)}</select></label></header>
          {run && <div className="tw-summary"><span className="tw-result" data-status={run.status}>{runStatuses[run.status] ?? run.status}</span><b>{run.passed}<small>пройдено</small></b><b data-tone="danger">{run.failed}<small>ошибок</small></b><b>{run.passed + run.failed} / {run.totalCases}<small>проверено</small></b><span>{stages[run.stage] ?? run.stage}</span></div>}
          {run?.error && <div className="tw-verdict" data-status="FAIL"><Icon icon={alertIcon} /><div><strong>Ошибка прогона</strong><p>{run.error}</p></div></div>}
          <div className="tw-results-body"><div className="tw-case-list"><div className="tw-case-list-heading"><strong>Сценарии · {cases.length}</strong><label className="tw-check"><input type="checkbox" checked={onlyFailed} onChange={e => { setOnlyFailed(e.target.checked); setCaseIndex(null); }} />Только ошибки</label></div><div className="tw-case-scroll">{visibleCases.map(c => <button type="button" className="tw-case" key={c.caseIndex} aria-pressed={selectedCase?.caseIndex === c.caseIndex} onClick={() => setCaseIndex(c.caseIndex)}><Icon icon={c.status === 'PASS' ? checkIcon : alertIcon} data-status={c.status} /><span><strong>{c.name}</strong><small>#{c.caseIndex} · {caseStatus(c.status)}{c.stage ? ` · ${stages[c.stage] ?? c.stage}` : ''}</small></span></button>)}{!visibleCases.length && <p className="tw-muted tw-empty">{onlyFailed ? 'Ошибок в завершённых тестах нет.' : status.activeRunId ? 'Runner готовит первый сценарий…' : 'Здесь появятся выполненные сценарии.'}</p>}</div></div>
            <div className="tw-detail-scroll">{selectedCase ? <CaseDiagnostics item={selectedCase} onEdit={edit} /> : <div className="tw-empty-detail"><Icon icon={flaskIcon} /><h3>{onlyFailed ? 'Нет ошибок для разбора' : 'Диагностика каждого сценария'}</h3><p>Выберите тест в списке. Здесь будут причина результата, ожидания и фактические данные PLC.</p></div>}</div>
          </div>
        </section>
      </div></TabsContent>
      <TabsContent value="scenarios" className="tw-tab-content"><div className="tw-library-layout"><section className="tw-library"><h3>Библиотека сценариев</h3><p className="tw-muted">Отметьте сценарии для собственного прогона.</p>
        <button type="button" disabled={busy || !status.plc?.connected} onClick={() => perform(async () => { const value = await api<Scenario>('/api/test-scenarios/capture-current', { method: 'POST', body: '{}' }); setEditor(normalizeScenario(value)); setNotice('Снимок PLC сохранён в библиотеке'); })}>Снять текущее состояние PLC</button>
        <div className="tw-library-scroll">{scenarios.map(s => <div key={s.id} className="tw-library-item" data-active={editor.id === s.id}><input type="checkbox" aria-label={`Включить в прогон: ${s.name}`} checked={selected.includes(s.id!)} onChange={e => setSelected(ids => e.target.checked ? [...ids, s.id!] : ids.filter(id => id !== s.id))} /><button type="button" onClick={() => { setEditor(normalizeScenario(s)); setNotice(''); }}><strong>{s.name}</strong><small>{s.initialState.magazineMode === 1 ? 'Двухпалетные' : 'Статичные'} · {s.description || 'Без описания'}</small></button></div>)}{!scenarios.length && <p className="tw-muted tw-empty">Сохранённых сценариев пока нет. Создайте первый в редакторе.</p>}</div>
        <button type="button" disabled={!selected.length} onClick={() => { setSource('saved'); setTab('run'); }}>К запуску · выбрано {selected.length}</button>
      </section><TestScenarioEditor editor={editor} setEditor={setEditor} busy={busy}
        onSave={() => perform(async () => { const row = await api<Scenario>(editor.id ? `/api/test-scenarios/${editor.id}` : '/api/test-scenarios', { method: editor.id ? 'PUT' : 'POST', body: JSON.stringify(editor) }); setEditor(normalizeScenario(row)); setNotice('Сценарий сохранён'); })}
        onRemove={() => { if (editor.id && window.confirm(`Удалить сценарий «${editor.name}»?`)) void perform(async () => { await api(`/api/test-scenarios/${editor.id}`, { method: 'DELETE' }); setSelected(ids => ids.filter(id => id !== editor.id)); setEditor(freshScenario(status.plc?.magazineMode ?? 0)); }); }} />
      </div></TabsContent>
    </Tabs>
  </aside>;
}
