export const TEST_SUITES = new Set(['acceptance', 'recovery', 'smoke', 'regression', 'general', 'generated', 'geometry', 'magazines']);

export function requireTestMagazineMode(mode, expected) {
  if (![0, 1].includes(mode)) throw new Error('Режим магазинов PLC неизвестен');
  if (expected !== undefined && mode !== expected) throw new Error('Тип магазинов сценария не совпадает с PLC. Выберите подходящий сценарий; тип автоматически не меняется.');
}

export function validateTestRun(config, values, scenarios = []) {
  requireTestMagazineMode(values.uiMagazineMode, config.magazineMode);
  if (values['stTestObservability.uiSchemaVersion'] !== 3) throw new Error('PLC не публикует тестовый контракт v3. Обновите ST-исходники и Symbol Configuration перед прогоном.');
  if (!['simulation', 'sc500_bench'].includes(config.environment)) throw new Error('Неизвестная среда тестов');
  if (!['softmotion', 'python-modbus', 'sc500-modbus'].includes(config.robotInterface)) throw new Error('Неизвестный интерфейс робота');
  if (!['realtime', 'fast'].includes(config.speedProfile)) throw new Error('Неизвестный профиль скорости');
  const recovery = ['acceptance', 'recovery'].includes(config.suite) || scenarios.some(s => s.expectations?.testKind === 'fault-recovery');
  if (recovery && (config.environment !== 'simulation' || config.robotInterface !== 'softmotion')) throw new Error('Приёмка и восстановление требуют симуляцию SoftMotion');
  for (const s of scenarios.filter(s => s.expectations?.testKind === 'fault-recovery')) {
    if (s.initialState?.typeCount !== 1 || s.initialState.grippers?.some(g => g.content)
      || s.initialState.geometry?.enabled?.some(Boolean) || s.initialState.geometry?.calls?.some(Boolean)) {
      throw new Error('Сценарий восстановления рассчитан на один тип изделия, пустые начальные захваты и выключенные ГК');
    }
  }
  if (values.uiMagazineMode === 1) {
    if (values.uiTestEnvironmentApplied !== 1) throw new Error('До запуска примените симуляцию и подготовьте оба двухпалетных магазина');
    if (config.environment !== 'simulation' || config.robotInterface !== 'softmotion') throw new Error('Двухпалетные сценарии доступны в симуляции SoftMotion');
    for (const i of [1, 2]) {
      if (!values[`astTwinStatus[${i}].xConfirmed`] || ![1, 2].includes(values[`astTwinStatus[${i}].uiRobotPallet`])) {
        throw new Error(`Перед тестом подтвердите расстановку палет магазина ${i} в симуляции`);
      }
    }
  }
  const general = config.suite === 'general' || scenarios.some(s => s.expectations?.testKind === 'general-four-batches');
  if (general && (values.uiMagazineMode !== 0 || config.environment !== 'simulation')) throw new Error('Генеральный прогон четырёх статичных партий требует статичные магазины и симуляцию');
  if (config.suite === 'magazines' && values.uiMagazineMode !== 1) throw new Error('Набор обмена палет требует двухпалетные магазины');
  if (scenarios.some(s => s.expectations?.firstDecision === 'pallet-swap') && values.uiMagazineMode !== 1) throw new Error('Ожидание обмена палет требует двухпалетный режим');
  const usesGeometry = config.suite === 'geometry' || scenarios.some(s => s.initialState?.geometry?.enabled?.some(Boolean) || s.initialState?.geometry?.calls?.some(Boolean));
  if (usesGeometry && (config.environment !== 'simulation' || config.robotInterface !== 'softmotion')) throw new Error('Сценарии ГК требуют симуляцию SoftMotion');
  for (const s of scenarios) requireTestMagazineMode(values.uiMagazineMode, s.initialState?.magazineMode ?? 0);
  for (const key of ['seed', 'count']) {
    if (!Number.isSafeInteger(config[key]) || (key === 'count' && (config[key] < 1 || config[key] > 1000))) throw new Error(`Недопустимый ${key}`);
  }
}

export function resolveTestSelection(config, getScenario) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Параметры прогона должны быть объектом');
  }
  const suite = String(config?.suite ?? 'smoke').toLowerCase();
  if (!TEST_SUITES.has(suite)) throw new Error(`Неизвестный набор тестов: ${suite}`);
  const fixedCaseIndex = config.fixedCaseIndex ?? null;
  if (fixedCaseIndex !== null) {
    if (!Number.isInteger(fixedCaseIndex) || fixedCaseIndex <= 0) {
      throw new Error('Номер штатного теста должен быть положительным целым числом');
    }
    if (suite === 'generated') {
      throw new Error('Выбор одного штатного теста доступен только для фиксированных наборов');
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
    if (![2, 3].includes(item.schemaVersion) || ![0, 1].includes(item.initialState?.magazineMode)
      || (item.schemaVersion === 2 && item.initialState?.magazineMode !== 0)) {
      throw new Error(`Сценарий #${id} имеет неподдерживаемый контракт`);
    }
    return {
      name: item.name, description: item.description, schemaVersion: item.schemaVersion,
      initialState: item.initialState, expectations: item.expectations,
    };
  });
  return { suite, fixedCaseIndex, scenarios };
}
