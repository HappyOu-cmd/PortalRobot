export const STATIC_TEST_SUITES = new Set(['smoke', 'regression', 'general', 'generated']);

// The v2 test buffer addresses two static 120-slot magazines. Twin-pallet
// inventories belong to a different PLC owner and must never be loaded here.
export function requireStaticMagazineMode(mode) {
  if (mode === 0) return;
  if (mode === 1) {
    throw new Error('Текущие Smoke, Regression, General и Generated рассчитаны на статичные магазины. В PLC выбран двухпалетный тип; переключите тип до тестовой сессии.');
  }
  throw new Error('Режим магазинов PLC неизвестен. Проверьте связь и символ uiMagazineMode перед запуском теста.');
}

export function resolveStaticTestSelection(config, getScenario) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Параметры прогона должны быть объектом');
  }
  const suite = String(config?.suite ?? 'smoke').toLowerCase();
  if (!STATIC_TEST_SUITES.has(suite)) throw new Error(`Неизвестный набор тестов: ${suite}`);
  const fixedCaseIndex = config.fixedCaseIndex ?? null;
  if (fixedCaseIndex !== null) {
    if (!Number.isInteger(fixedCaseIndex) || fixedCaseIndex <= 0) {
      throw new Error('Номер штатного теста должен быть положительным целым числом');
    }
    if (suite === 'generated') {
      throw new Error('Выбор одного штатного теста доступен только для Smoke, Regression и General');
    }
  }
  const ids = config?.scenarioIds ?? [];
  if (!Array.isArray(ids)) throw new Error('Список сохранённых сценариев должен быть массивом');
  if (ids.some((id) => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new Error('Некорректный или повторяющийся ID сохранённого сценария');
  }
  if (fixedCaseIndex !== null && ids.length) {
    throw new Error('Нельзя одновременно выбрать штатный тест и сохранённые сценарии');
  }
  const scenarios = ids.map((id) => {
    const item = getScenario(id);
    if (!item) throw new Error(`Сохранённый сценарий #${id} не найден`);
    if (item.schemaVersion !== 2 || item.initialState?.magazineMode !== 0) {
      throw new Error(`Сценарий #${id} не соответствует статичной схеме v2`);
    }
    return {
      name: item.name, description: item.description, schemaVersion: item.schemaVersion,
      initialState: item.initialState, expectations: item.expectations,
    };
  });
  return { suite, fixedCaseIndex, scenarios };
}
