export type Slot = { content: number; productType: number };
export type Scenario = {
  id?: number; name: string; description: string; schemaVersion: number;
  initialState: {
    magazineMode: number; typeCount: number; machines: { state: number; productType: number }[];
    magazines: { enabled: boolean; slots: Slot[]; operatorSlots?: Slot[]; operatorLoaded?: boolean; autoSwap?: boolean }[];
    grippers: Slot[]; orientation: number;
    geometry: { enabled: boolean[]; calls: boolean[]; waitWhenOccupied: boolean };
    faultMasks: { cell: number; robot: number; magazines: number[]; machines: number[] };
  };
  expectations: Record<string, unknown>;
};
export type Check = { label: string; expected: unknown; actual: unknown; passed: boolean };
export type RunCase = {
  caseIndex: number; name: string; status: string; stage?: string; reason?: string; durationMs?: number;
  scenario?: Scenario; snapshot?: Record<string, unknown>;
  diagnostics?: { expectations?: Record<string, unknown>; observed?: Record<string, unknown>; checks?: Check[] };
};
export type Run = {
  id: number; suite: string; status: string; stage: string; currentCase: number; totalCases: number;
  passed: number; failed: number; startedAt: number; finishedAt?: number; error?: string; lastFailure?: string;
  environment?: string; robotInterface?: string; config?: Record<string, unknown>; cases?: RunCase[];
};
export type TestStatus = {
  available?: boolean; error?: string | null; activeRunId: number | null;
  simulatorControl?: { available: boolean; modbusRunning: boolean; error?: string | null };
  plc?: {
    connected: boolean; magazineMode: number | null; testSchemaVersion: number; twinConfirmed?: boolean[];
    requestedEnvironment: number; appliedEnvironment: number; environmentChangeAllowed: boolean;
    simulatorActive: boolean; robotReady: boolean; rejectReason: number;
  };
};
export type Catalog = Record<string, { index: number; name: string; description: string }[]>;
export const suites: Record<string, { label: string; description: string }> = {
  acceptance: { label: 'Приёмка', description: 'Один прогон после правок: штатная работа, аварии, ручное восстановление и подтверждённый выпуск. Для текущего типа магазинов.' },
  recovery: { label: 'Аварии и восстановление', description: '66 причин: станки, магазины, захваты, точки, робот, ячейка и безопасность. После Reset и ручного HOME — новый выпуск без перезагрузки состояния.' },
  smoke: { label: 'Основные', description: 'Базовые операции, захваты, выбор станка, Stop и Reset.' },
  regression: { label: 'Регрессия', description: 'Типы изделий, владельцы ошибок, восстановление и воспроизводимые комбинации.' },
  magazines: { label: 'Магазины и палеты', description: 'Две физические палеты, свой магазин возврата, CHANGE и автоматический обмен.' },
  geometry: { label: 'Геометрический контроль', description: 'Вызовы ГК 1/2, очередность, ожидание и обход занятых станций.' },
  general: { label: 'Полный цикл', description: 'Четыре полные партии статичных кассет с двумя перезагрузками.' },
  generated: { label: 'Сгенерированные', description: 'Повторяемые комбинации по seed, включая намеренный отказ загрузки.' },
};
export const runStatuses: Record<string, string> = {
  STARTING: 'Подготовка', QUEUED: 'В очереди', RUNNING: 'Выполняется', ABORTING: 'Остановка',
  PASS: 'Пройден', FAIL: 'Не пройден', ERROR: 'Ошибка прогона', ABORTED: 'Остановлен',
};
export const stages: Record<string, string> = {
  launch: 'Запуск runner', queued: 'Ожидание', connected: 'Связь с runner', load: 'Загрузка состояния',
  running: 'Проверка сценария', execute: 'Выполнение', recovery: 'Восстановление', cleanup: 'Очистка',
  abort: 'Управляемая остановка', finished: 'Завершено',
  'general-m1-a': 'Партия М1-A', 'general-reload-m1': 'Перезагрузка М1',
  'general-m2-a': 'Партия М2-A', 'general-reload-m2': 'Перезагрузка М2',
  'general-m1-b': 'Партия М1-B', 'general-m2-b': 'Партия М2-B',
  'fault-injection': 'Формирование аварии', 'fault-repair': 'Устранение причины',
  'recovery-reset': 'Общий сброс', 'recovery-home': 'Ручной возврат в HOME',
  'recovery-production': 'Выпуск после восстановления',
  'recovery-equipment': 'Подтверждение палет и включение оборудования',
};
export const decisions: Record<string, string> = {
  'magazine-take': 'Взять заготовку из магазина', 'magazine-put': 'Уложить деталь в магазин',
  'magazine-change': 'Обменять деталь на заготовку в магазине', 'machine-load': 'Загрузить станок',
  'machine-unload': 'Выгрузить станок', 'machine-change': 'Сменить деталь в станке',
  'return-blank': 'Вернуть заготовку', 'held-blank-wait': 'Ждать с заготовкой',
  'no-task': 'Заблокировать запуск без задачи', 'operator-type-choice': 'Запросить тип у оператора',
  'safe-stop': 'Остановиться в безопасной точке', 'robot-error-reset': 'Сбросить аварию робота',
  'geometry-delivery': 'Доставить вызванную деталь на ГК', 'pallet-swap': 'Подать операторскую палету',
};
export function freshScenario(mode = 0): Scenario {
  const slots = (blank = false) => Array.from({ length: mode === 1 ? 96 : 120 }, (_, i) => ({ content: blank && i === 0 ? 1 : 0, productType: 1 }));
  return {
    name: 'Новый сценарий', description: '', schemaVersion: 3, expectations: { fullCycle: true },
    initialState: {
      magazineMode: mode, typeCount: 1, machines: [{ state: 1, productType: 1 }, { state: 0, productType: 1 }, { state: 0, productType: 1 }],
      magazines: [true, false].map(enabled => ({ enabled, slots: slots(enabled), ...(mode === 1 ? { operatorSlots: slots(), operatorLoaded: false, autoSwap: false } : {}) })),
      grippers: [{ content: 0, productType: 0 }, { content: 0, productType: 0 }], orientation: 0,
      geometry: { enabled: [false, false], calls: [false, false, false], waitWhenOccupied: true },
      faultMasks: { cell: 0, robot: 0, magazines: [0, 0], machines: [0, 0, 0] },
    },
  };
}
export function normalizeScenario(value: Scenario): Scenario {
  const next = structuredClone(value);
  const legacy = next.initialState as Scenario['initialState'] & { slots?: Slot[]; magazineEnabled?: boolean; faultMasks: Scenario['initialState']['faultMasks'] & { magazine?: number } };
  legacy.magazineMode ??= 0;
  if (!legacy.magazines && legacy.slots) legacy.magazines = [
    { enabled: Boolean(legacy.magazineEnabled), slots: legacy.slots },
    { enabled: false, slots: legacy.slots.map(s => ({ ...s, content: 0 })) },
  ];
  legacy.faultMasks ??= { cell: 0, robot: 0, magazines: [0, 0], machines: [0, 0, 0] };
  legacy.faultMasks.magazines ??= [legacy.faultMasks.magazine ?? 0, 0];
  legacy.geometry ??= { enabled: [false, false], calls: [false, false, false], waitWhenOccupied: true };
  next.schemaVersion = 3;
  return next;
}
export function runBlockedReason(status: TestStatus, suite: string, robotInterface: string, environment: string, saved: Scenario[] = []): string {
  if (!status.available) return status.error || 'Хранилище тестов недоступно';
  if (!status.plc?.connected) return 'Нет связи gateway с PLC';
  if (status.activeRunId) return 'Другой прогон уже выполняется';
  if (status.plc.testSchemaVersion !== 3) return 'Обновите PLC до тестового контракта v3 и пересоберите Symbol Configuration';
  const mode = status.plc.magazineMode;
  if (mode !== 0 && mode !== 1) return 'Тип магазинов PLC неизвестен';
  if (saved.some(s => s.initialState.magazineMode !== mode)) return 'Тип магазинов сохранённого сценария не совпадает с PLC';
  if ((['acceptance', 'recovery'].includes(suite) || saved.some(s => s.expectations.testKind === 'fault-recovery'))
    && (robotInterface !== 'softmotion' || environment !== 'simulation')) return 'Приёмка и восстановление требуют симуляцию SoftMotion';
  if (mode === 1) {
    if (robotInterface !== 'softmotion' || environment !== 'simulation') return 'Двухпалетные сценарии требуют симуляцию SoftMotion';
    if (status.plc.appliedEnvironment !== 1) return 'Сначала примените симуляцию и подготовьте оба двухпалетных магазина';
    if (status.plc.twinConfirmed?.length !== 2 || !status.plc.twinConfirmed.every(Boolean)) return 'Подтвердите расстановку палет обоих магазинов в симуляции';
  }
  if (suite === 'magazines' && mode !== 1) return 'Для этого набора выберите двухпалетный тип магазинов до тестовой сессии';
  if ((suite === 'general' || saved.some(s => s.expectations.testKind === 'general-four-batches')) && (mode !== 0 || environment !== 'simulation')) return 'Полный цикл четырёх партий требует статичные кассеты и симуляцию';
  if (saved.some(s => s.expectations.firstDecision === 'pallet-swap') && mode !== 1) return 'Обмен палет требует двухпалетный режим';
  if ((suite === 'geometry' || saved.some(s => s.initialState.geometry.enabled.some(Boolean) || s.initialState.geometry.calls.some(Boolean)))
    && (robotInterface !== 'softmotion' || environment !== 'simulation')) return 'Сценарии ГК требуют симуляцию SoftMotion';
  if (robotInterface === 'python-modbus' && !status.simulatorControl?.available) return 'Управляющий API Python-симулятора недоступен';
  if (robotInterface === 'python-modbus' && !status.simulatorControl?.modbusRunning) return 'В Python-симуляторе не запущен Modbus Server';
  return '';
}
export const runProgress = (run?: Run | null) => run ? Math.min(100, Math.round(100 * (run.passed + run.failed) / Math.max(1, run.totalCases))) : 0;
export function chooseCase(cases: RunCase[], selected: number | null): RunCase | undefined {
  return cases.find(c => c.caseIndex === selected) ?? cases.find(c => c.status === 'FAIL') ?? cases.at(-1);
}
