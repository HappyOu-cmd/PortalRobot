import { useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, Copy, Database, FlaskConical,
  Play, Plus, Save, Server, Square, Trash2, X,
} from 'lucide-react';

type Slot = { content: number; productType: number };
type Machine = { state: number; productType: number };
type Scenario = {
  id?: number;
  name: string;
  description: string;
  schemaVersion: number;
  initialState: {
    typeCount: number;
    magazineEnabled: boolean;
    machines: Machine[];
    slots: Slot[];
    grippers: Slot[];
    orientation: number;
    faultMasks: { cell: number; robot: number; magazine: number; machines: number[] };
  };
  expectations: Record<string, unknown>;
};
type RunCase = { status: string; reason?: string; scenario?: Scenario };
type Run = {
  id: number;
  suite: string;
  status: string;
  stage: string;
  currentCase: number;
  totalCases: number;
  passed: number;
  failed: number;
  startedAt: number;
  error?: string;
  lastFailure?: string;
  cases?: RunCase[];
};
type Status = {
  available?: boolean;
  error?: string | null;
  activeRunId: number | null;
  simulatorControl?: {
    available: boolean;
    modbusRunning: boolean;
    sessionActive: boolean;
    apiVersion: number;
    error?: string | null;
  };
  plc?: {
    connected: boolean;
    requestedEnvironment: number;
    appliedEnvironment: number;
    environmentChangeAllowed: boolean;
    simulatorActive: boolean;
    robotReady: boolean;
    benchKey: boolean;
    benchKeyLost: boolean;
    rejectReason: number;
  };
};

const fresh = (): Scenario => ({
  name: 'Новый сценарий',
  description: '',
  schemaVersion: 1,
  expectations: {},
  initialState: {
    typeCount: 1,
    magazineEnabled: true,
    machines: [{ state: 1, productType: 1 }, { state: 0, productType: 1 }, { state: 0, productType: 1 }],
    slots: Array.from({ length: 120 }, (_, index) => ({ content: index === 0 ? 1 : 0, productType: 1 })),
    grippers: [{ content: 0, productType: 0 }, { content: 0, productType: 0 }],
    orientation: 0,
    faultMasks: { cell: 0, robot: 0, magazine: 0, machines: [0, 0, 0] },
  },
});

const clone = <T,>(value: T): T => structuredClone(value);

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: options?.body ? { 'Content-Type': 'application/json', ...options.headers } : options?.headers,
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Gateway вернул не JSON для ${path} (HTTP ${response.status}). Проверьте gateway и адрес страницы.`);
  }
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : `HTTP ${response.status}`;
    throw new Error(message);
  }
  if (body === null) throw new Error(`Gateway вернул пустой ответ для ${path} (HTTP ${response.status}).`);
  return body as T;
}

const contents = ['Пусто', 'Заготовка', 'Деталь'];
const machineStates = ['Отключён', 'Пуст и готов', 'Обрабатывает', 'Деталь готова'];
const environments = ['Обычная ячейка', 'Симуляция', 'Стенд SC-500'];
const rejectReasons = [
  '',
  'оборудование или цикл ещё заняты',
  'неизвестная тестовая среда',
  'для стенда нужны Modbus и физический ключ',
  'PLC не видит признак Python-симулятора',
  'FAST разрешён только в остановленной симуляции',
];
const runStatuses: Record<string, string> = {
  QUEUED: 'В очереди', RUNNING: 'Выполняется', PASS: 'Пройден', FAIL: 'Есть ошибки',
  ERROR: 'Ошибка запуска', ABORTED: 'Остановлен',
};
const runStages: Record<string, string> = {
  queued: 'Ожидание запуска', connected: 'Runner подключён', load: 'Подготовка сценария',
  running: 'Автоматический цикл', cleanup: 'Восстановление', finished: 'Завершено',
};
const typeClass = (type: number) => (type ? `type-${type}` : '');

function StateBadge({ ok, label, warning = false }: { ok: boolean; label: string; warning?: boolean }) {
  return <span className={`test-state-badge ${ok ? 'ready' : warning ? 'warning' : ''}`}>
    {ok ? <CheckCircle2 /> : <AlertTriangle />}{label}
  </span>;
}

export function TestWorkbench({
  onSend,
  onClose,
  className = '',
}: {
  onSend: (message: { command: string; value?: boolean | number }) => void;
  onClose: () => void;
  className?: string;
}) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [editor, setEditor] = useState<Scenario>(fresh);
  const [runs, setRuns] = useState<Run[]>([]);
  const [status, setStatus] = useState<Status>({ activeRunId: null });
  const [selected, setSelected] = useState<number[]>([]);
  const [suite, setSuite] = useState('smoke');
  const [robotInterface, setRobotInterface] = useState('softmotion');
  const [environment, setEnvironment] = useState('simulation');
  const [speedProfile, setSpeedProfile] = useState('realtime');
  const [seed, setSeed] = useState(1);
  const [count, setCount] = useState(100);
  const [error, setError] = useState('');

  const refresh = async () => {
    const [stored, history, system] = await Promise.all([
      api<Scenario[]>('/api/test-scenarios'),
      api<Run[]>('/api/test-runs?limit=20'),
      api<Status>('/api/test-system/status'),
    ]);
    setScenarios(stored);
    setRuns(history);
    setStatus(system);
  };

  useEffect(() => {
    refresh().catch((refreshError) => setError(String(refreshError)));
    const timer = window.setInterval(() => refresh().catch(() => undefined), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const editState = (update: (state: Scenario['initialState']) => void) => {
    setEditor((value) => {
      const next = clone(value);
      update(next.initialState);
      return next;
    });
  };

  const save = async () => {
    try {
      const row = await api<Scenario>(editor.id ? `/api/test-scenarios/${editor.id}` : '/api/test-scenarios', {
        method: editor.id ? 'PUT' : 'POST',
        body: JSON.stringify(editor),
      });
      setEditor(row);
      await refresh();
      setError('');
    } catch (saveError) {
      setError(String(saveError));
    }
  };

  const capture = async () => {
    try {
      const row = await api<Scenario>('/api/test-scenarios/capture-current', { method: 'POST', body: '{}' });
      setEditor(row);
      await refresh();
      setError('');
    } catch (captureError) {
      setError(String(captureError));
    }
  };

  const remove = async () => {
    if (!editor.id || !window.confirm(`Удалить «${editor.name}»?`)) return;
    try {
      await api(`/api/test-scenarios/${editor.id}`, { method: 'DELETE' });
      setEditor(fresh());
      await refresh();
      setError('');
    } catch (removeError) {
      setError(String(removeError));
    }
  };

  const start = async () => {
    try {
      setError('');
      await api('/api/test-runs', {
        method: 'POST',
        body: JSON.stringify({ suite, environment, robotInterface, speedProfile, seed, count, scenarioIds: selected }),
      });
      await refresh();
    } catch (startError) {
      setError(String(startError));
    }
  };

  const openFailedScenario = async (runId: number) => {
    try {
      const run = await api<Run>(`/api/test-runs/${runId}`);
      const failed = [...(run.cases ?? [])].reverse().find((item) => item.status === 'FAIL' && item.scenario);
      if (!failed?.scenario) throw new Error('В прогоне нет сохранённого FAIL-сценария');
      const source = clone(failed.scenario);
      setEditor({
        id: undefined,
        name: `${source.name || 'Сгенерированный сценарий'} — повтор FAIL`,
        description: source.description ?? '',
        schemaVersion: source.schemaVersion ?? 1,
        initialState: source.initialState,
        expectations: source.expectations ?? {},
      });
      setError('');
    } catch (openError) {
      setError(String(openError));
    }
  };

  const active = runs.find((run) => run.id === status.activeRunId);
  const completedCases = active ? active.passed + active.failed : 0;
  const progress = active ? Math.round((completedCases / Math.max(1, active.totalCases)) * 100) : 0;
  const runBlockedReason = !status.available
    ? status.error || 'Хранилище тестов недоступно'
    : !status.plc?.connected
      ? 'Нет связи gateway с PLC'
      : status.activeRunId
        ? 'Другой прогон уже выполняется'
        : robotInterface === 'python-modbus' && !status.simulatorControl?.available
          ? 'Запустите или перезапустите Python-симулятор: управляющий API недоступен'
          : robotInterface === 'python-modbus' && !status.simulatorControl?.modbusRunning
            ? 'В Python-симуляторе не запущен Modbus Server'
        : environment === 'sc500_bench' && !status.plc?.benchKey
          ? 'Для стенда включите физический ключ'
          : '';

  return <aside className={`test-workbench side-panel ${className}`}>
    <header className="test-workbench-header">
      <div className="test-title-mark"><FlaskConical /></div>
      <div>
        <span>ПРОВЕРКА ЛОГИКИ PLC</span>
        <h2>Сценарии и автоматические тесты</h2>
        <p>Подготовка состояния ячейки, запуск прогона и разбор результата</p>
      </div>
      <button className="test-icon-button" type="button" onClick={onClose} aria-label="Закрыть экран тестов"><X /></button>
    </header>

    {error && <div className="test-error" role="alert"><AlertTriangle /><span>{error}</span><button type="button" onClick={() => setError('')}><X /></button></div>}

    <section className="test-system-strip">
      <div className="test-system-title">
        <Server />
        <div><strong>Среда выполнения</strong><small>Применяется PLC только в безопасном состоянии</small></div>
      </div>
      <div className="test-segmented">
        {environments.map((label, value) => <button
          key={label}
          type="button"
          className={status.plc?.appliedEnvironment === value ? 'active' : ''}
          disabled={!status.plc?.environmentChangeAllowed || Boolean(status.activeRunId)}
          onClick={() => onSend({ command: 'test.environment.set', value })}
        >{label}</button>)}
      </div>
      <div className="test-system-states">
        <StateBadge ok={Boolean(status.plc?.connected)} label={status.plc?.connected ? 'PLC подключён' : 'Нет связи с PLC'} />
        <StateBadge ok={Boolean(status.plc?.robotReady)} label={status.plc?.robotReady ? 'Робот готов' : 'Робот не готов'} />
        <StateBadge ok={Boolean(status.plc?.simulatorActive)} warning label={status.plc?.simulatorActive ? 'Python опознан' : 'Python не активен'} />
        <StateBadge ok={Boolean(status.simulatorControl?.available && status.simulatorControl?.modbusRunning)} warning label={status.simulatorControl?.available ? status.simulatorControl.modbusRunning ? 'Test API готов' : 'Modbus остановлен' : 'Test API недоступен'} />
        <StateBadge ok={Boolean(status.plc?.benchKey)} warning label={status.plc?.benchKey ? 'Ключ стенда включён' : status.plc?.benchKeyLost ? 'Ключ стенда потерян' : 'Ключ стенда выключен'} />
        <span className="test-environment-summary">Запрошено: <b>{environments[status.plc?.requestedEnvironment ?? 0]}</b> · применено: <b>{environments[status.plc?.appliedEnvironment ?? 0]}</b>{status.plc?.rejectReason ? ` · Запрещено: ${rejectReasons[status.plc.rejectReason] ?? `код ${status.plc.rejectReason}`}` : ''}</span>
      </div>
    </section>

    <div className="test-layout">
      <section className="test-card test-scenario-list">
        <header className="test-card-header">
          <div><span>БИБЛИОТЕКА</span><h3>Сценарии</h3></div>
          <b>{scenarios.length}</b>
        </header>
        <div className="test-toolbar">
          <button type="button" onClick={() => setEditor(fresh())}><Plus />Создать</button>
          <button type="button" onClick={capture}><Copy />Снять с PLC</button>
        </div>
        <div className="test-scenario-scroll">
          {scenarios.length === 0 && <div className="test-empty-state"><Database /><b>Сценариев пока нет</b><small>Создайте новый или снимите текущее состояние PLC</small></div>}
          {scenarios.map((item) => <div key={item.id} className={`test-scenario-item ${editor.id === item.id ? 'active' : ''}`}>
            <label title="Добавить сценарий в прогон">
              <input
                type="checkbox"
                checked={selected.includes(item.id!)}
                onChange={(event) => setSelected((ids) => event.target.checked
                  ? [...ids, item.id!]
                  : ids.filter((id) => id !== item.id))}
              />
            </label>
            <button type="button" onClick={() => setEditor(clone(item))}>
              <b>{item.name}</b>
              <small>{item.description || 'Без описания'}</small>
            </button>
          </div>)}
        </div>
        <footer>{selected.length ? `В прогон выбрано: ${selected.length}` : 'Без выбора запускается весь набор'}</footer>
      </section>

      <section className="test-card test-editor">
        <header className="test-editor-head">
          <div className="test-editor-fields">
            <input aria-label="Название сценария" value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
            <input aria-label="Описание сценария" placeholder="Краткое описание сценария" value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} />
          </div>
          <div className="test-editor-actions">
            <button type="button" title="Создать копию" onClick={() => setEditor({ ...clone(editor), id: undefined, name: `${editor.name} — копия` })}><Copy /></button>
            <button type="button" className="primary" title="Сохранить" onClick={save}><Save /></button>
            <button type="button" className="danger" title="Удалить" disabled={!editor.id} onClick={remove}><Trash2 /></button>
          </div>
        </header>

        <div className="test-editor-scroll">
          <div className="test-section-heading"><div><span>01</span><b>Конфигурация ячейки</b></div><small>Состояние до запуска автоматики</small></div>
          <div className="test-config-row">
            <label>Количество типов
              <select value={editor.initialState.typeCount} onChange={(event) => editState((state) => {
                const typeCount = Number(event.target.value);
                state.typeCount = typeCount;
                state.machines.forEach((item) => { item.productType = Math.min(Math.max(1, item.productType), typeCount); });
                state.slots.forEach((item) => { item.productType = Math.min(Math.max(1, item.productType), typeCount); });
                state.grippers.forEach((item) => { if (item.content) item.productType = Math.min(Math.max(1, item.productType), typeCount); });
              })}>{[1, 2, 3].map((value) => <option key={value} value={value}>{value}</option>)}</select>
            </label>
            <label className="test-check-field"><input type="checkbox" checked={editor.initialState.magazineEnabled} onChange={(event) => editState((state) => { state.magazineEnabled = event.target.checked; })} /><span><b>Магазин включён</b><small>Участвует в выборе задания</small></span></label>
          </div>

          <div className="test-machine-grid">
            {editor.initialState.machines.map((machine, index) => <div key={index}>
              <header><span>0{index + 1}</span><b>Станок {index + 1}</b></header>
              <label>Состояние<select value={machine.state} onChange={(event) => editState((state) => {
                state.machines[index].state = Number(event.target.value);
                state.machines[index].productType = Math.max(1, state.machines[index].productType);
              })}>{machineStates.map((label, value) => <option key={label} value={value}>{label}</option>)}</select></label>
              <label>Тип изделия<select value={machine.productType} onChange={(event) => editState((state) => { state.machines[index].productType = Number(event.target.value); })}>{Array.from({ length: editor.initialState.typeCount }, (_, value) => <option value={value + 1} key={value}>Тип {value + 1}</option>)}</select></label>
            </div>)}
          </div>

          <div className="test-section-heading"><div><span>02</span><b>Робот и аварии</b></div><small>Захваты, ориентация и начальные маски</small></div>
          <div className="test-gripper-row">
            {editor.initialState.grippers.map((gripper, index) => <div key={index}>
              <b>Захват {index + 1}</b>
              <label>Содержимое<select value={gripper.content} onChange={(event) => editState((state) => {
                state.grippers[index].content = Number(event.target.value);
                state.grippers[index].productType = state.grippers[index].content ? Math.max(1, state.grippers[index].productType) : 0;
              })}>{(index === 0 ? [0, 1] : [0, 2]).map((value) => <option key={value} value={value}>{contents[value]}</option>)}</select></label>
              <label>Тип<select disabled={!gripper.content} value={gripper.productType} onChange={(event) => editState((state) => { state.grippers[index].productType = Number(event.target.value); })}>{Array.from({ length: editor.initialState.typeCount }, (_, value) => <option key={value} value={value + 1}>Тип {value + 1}</option>)}</select></label>
            </div>)}
            <div><b>Ориентация</b><label>Рабочая сторона<select value={editor.initialState.orientation} onChange={(event) => editState((state) => { state.orientation = Number(event.target.value); })}><option value={0}>К заготовке</option><option value={1}>К детали</option></select></label></div>
          </div>

          <div className="test-fault-grid">
            <header><AlertTriangle /><div><b>Начальные маски аварий</b><small>0 — аварий нет</small></div></header>
            {(['cell', 'robot', 'magazine'] as const).map((owner) => <label key={owner}><span>{owner === 'cell' ? 'Ячейка' : owner === 'robot' ? 'Робот' : 'Магазин'}</span><input type="number" min={0} value={editor.initialState.faultMasks[owner]} onChange={(event) => editState((state) => { state.faultMasks[owner] = Math.max(0, Number(event.target.value) || 0); })} /></label>)}
            {editor.initialState.faultMasks.machines.map((mask, index) => <label key={index}><span>Станок {index + 1}</span><input type="number" min={0} value={mask} onChange={(event) => editState((state) => { state.faultMasks.machines[index] = Math.max(0, Number(event.target.value) || 0); })} /></label>)}
          </div>

          <div className="test-section-heading test-magazine-heading">
            <div><span>03</span><b>Магазин 1 · Zone 2 — 120 слотов</b></div>
            <small>ЛКМ — содержимое · ПКМ — тип изделия</small>
          </div>
          <div className="test-slot-legend"><span className="blank">Заготовка</span><span className="detail">Готовая деталь</span><span className="type-two">Тип 2</span><span className="type-three">Тип 3</span></div>
          <div className="test-slot-grid">
            {editor.initialState.slots.map((slot, index) => <button
              type="button"
              key={index}
              className={`${typeClass(slot.productType)} content-${slot.content}`}
              title={`Слот ${index + 1}: ${contents[slot.content]}; ПКМ — сменить тип`}
              onClick={() => editState((state) => {
                const item = state.slots[index];
                item.content = (item.content + 1) % 3;
                item.productType = Math.max(1, item.productType);
              })}
              onContextMenu={(event) => {
                event.preventDefault();
                editState((state) => {
                  const item = state.slots[index];
                  item.productType = item.productType % state.typeCount + 1;
                });
              }}
            ><span>{index + 1}</span><b>{slot.content ? contents[slot.content][0] : '—'}</b><small>Т{slot.productType}</small></button>)}
          </div>
        </div>
      </section>

      <section className="test-card test-run-panel">
        <header className="test-card-header"><div><span>УПРАВЛЕНИЕ</span><h3>Прогон</h3></div><Activity /></header>
        <div className="test-run-settings">
          <label>Набор тестов<select value={suite} onChange={(event) => setSuite(event.target.value)}><option value="smoke">Smoke — 10 основных</option><option value="regression">Regression — 70</option><option value="generated">Generated</option></select></label>
          <label>Интерфейс робота<select value={robotInterface} onChange={(event) => setRobotInterface(event.target.value)}>{environment === 'sc500_bench' ? <option value="sc500-modbus">SC-500 Modbus</option> : <><option value="softmotion">SoftMotion</option><option value="python-modbus">Python Modbus</option></>}</select></label>
          <label>Среда<select value={environment} onChange={(event) => {
            const next = event.target.value;
            setEnvironment(next);
            if (next === 'sc500_bench') {
              setRobotInterface('sc500-modbus');
              setSpeedProfile('realtime');
            } else if (robotInterface === 'sc500-modbus') setRobotInterface('softmotion');
          }}><option value="simulation">Симуляция</option><option value="sc500_bench">Стенд SC-500</option></select></label>
          <label>Скорость<select value={speedProfile} onChange={(event) => setSpeedProfile(event.target.value)}><option value="realtime">Realtime</option><option value="fast" disabled={environment === 'sc500_bench'}>Fast</option></select></label>
          {suite === 'generated' && <div className="test-generated-fields"><label>Seed<input type="number" value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></label><label>Количество<input type="number" min={1} max={1000} value={count} onChange={(event) => setCount(Number(event.target.value))} /></label></div>}
          {selected.length > 0 && <div className="test-selected-note"><Database /><span>Будут запущены выбранные сценарии: <b>{selected.length}</b></span></div>}
          <button className="test-run-button" type="button" disabled={Boolean(runBlockedReason)} title={runBlockedReason} onClick={start}><Play />Запустить прогон</button>
          {runBlockedReason && <small className="test-run-blocked"><AlertTriangle />{runBlockedReason}</small>}
        </div>

        {active && <div className="test-active-run">
          <header><div><span>ПРОГОН #{active.id}</span><b>{runStages[active.stage] ?? active.stage}</b></div><strong>{progress}%</strong></header>
          <progress max={Math.max(1, active.totalCases)} value={completedCases} />
          <div><span>{completedCases} / {active.totalCases}</span><b className="passed">PASS {active.passed}</b><b className="failed">FAIL {active.failed}</b></div>
          <button type="button" className="danger" onClick={() => api(`/api/test-runs/${active.id}/abort`, { method: 'POST' }).then(refresh).catch((abortError) => setError(String(abortError)))}><Square />Безопасно остановить</button>
        </div>}

        <div className="test-history-heading"><div><span>ПОСЛЕДНИЕ</span><h3>История прогонов</h3></div><b>{runs.length}</b></div>
        <div className="test-run-history">
          {runs.length === 0 && <div className="test-empty-state"><Activity /><b>Прогонов пока нет</b></div>}
          {runs.map((run) => <article key={run.id} className={run.status.toLowerCase()}>
            <header><b>#{run.id} · {run.suite}</b><span>{runStatuses[run.status] ?? run.status}</span></header>
            <small>{new Date(run.startedAt).toLocaleString('ru-RU')} · PASS {run.passed} / FAIL {run.failed}</small>
            {(run.error || run.lastFailure) && <em>{run.error || run.lastFailure}</em>}
            {run.failed > 0 && <button type="button" onClick={() => openFailedScenario(run.id)}>Открыть FAIL-сценарий</button>}
          </article>)}
        </div>
      </section>
    </div>
  </aside>;
}
