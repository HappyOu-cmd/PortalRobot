FUNCTION_BLOCK FB_MAGAZINE
VAR_INPUT
	uiMagazineId : UINT; // Идентификатор экземпляра 1..2
	xTestInitialize : BOOL;
	xTestEnabled : BOOL;
	stRobotStatus     : ST_ROBOT_STATUS; // Текущие статусы робота
	astMachineStatus  : ARRAY [1..3] OF ST_MACHINE_PUBLIC; // Статусы станков для определения оставшейся работы
	auiMachineType    : ARRAY [1..3] OF UINT; // Тип детали, закреплённый за каждым станком
	stMagazineCommand : ST_MAGAZINE_COMMAND; // Команда магазина от автоматической логики
	stHmiCommand      : ST_ROBOT_COMMAND; // Ручная команда магазина с HMI
	xManual           : BOOL; // Разрешение ручного управления
	xReset            : BOOL; // Сброс ошибок магазина
	xGlobalError      : BOOL; // Глобальная ошибка ячейки
	xHmiEnable        : BOOL; // Импульс включения магазина с HMI
	xHmiDisable       : BOOL; // Импульс отключения магазина с HMI
	xHmiFillBlanks    : BOOL; // Заполнить все активные слоты матрицы заготовками
	xHmiClear         : BOOL; // Полностью очистить содержимое магазина
	xHmiCycleSlot     : BOOL; // Переключить содержимое выбранного слота
	xHmiApplySlot     : BOOL; // Явно записать состояние и тип выбранного слота
	uiHmiEditZone     : UINT; // Редактируемая Zone 1 или Zone 2
	uiHmiEditSlot     : UINT; // Номер слота для ручного редактирования
	uiHmiEditDetailType : UINT; // 0=NONE, 1=BLANK, 2=DETAIL
	uiHmiEditProductType : UINT; // Тип изделия 1..3
	xHmiPowerOn       : BOOL; // Подача питания на сервопривод
	xHmiPowerOff      : BOOL; // Снятие питания с сервопривода
	xHmiHome          : BOOL; // Поиск домашней позиции
	xHmiIndex         : BOOL; // Индекс на 720 мм
	xHmiAxisStop      : BOOL; // Контролируемая остановка сервопривода
	xHmiJogPositive   : BOOL; // Удерживаемый ход конвейера вперёд при выключенном магазине
	xHmiJogNegative   : BOOL; // Удерживаемый ход конвейера назад при выключенном магазине
	xHmiConfirmRecovery : BOOL; // Подтверждение сверки/коррекции после аварийного Home
	xHmiStartContentRecovery : BOOL; // Вход в режим сверки содержимого
	xHmiApplyRecoverySlot : BOOL; // Применить исправление одного слота после Home
	xHmiClearRecoveryZones : BOOL; // Очистить все зоны в режиме восстановления
	uiHmiRecoveryZone : UINT;
	uiHmiRecoverySlot : UINT;
	eHmiRecoveryDetailType : E_DETAIL_TYPE;
	uiHmiRecoveryProductType : UINT;
	xRobotOwnsMagazine : BOOL; // Робот или автомат удерживает этот магазин
	stAxisStatus      : ST_AXIS_STATUS; // Состояние собственного FB_AXIS
	lrIndexTolerance  : LREAL; // Допуск подтверждения относительного хода
	uiRows            : UINT; // Число строк матрицы магазина
	uiColumns         : UINT; // Число столбцов матрицы магазина
	uiTypeCount       : UINT; // Количество настроенных типов заготовок, 1..3
	auiSlotType       : ARRAY [1..GVL_CELL_SETTINGS.NumberDetail] OF UINT; // Тип секции каждого слота
	FaultRequest  : ST_MAGAZINE_FAULT_REQUEST; // Единый контракт диагностической инъекции
END_VAR
VAR_OUTPUT
	Command : ST_ROBOT_COMMAND; // Текущая пошаговая команда роботу
	AxisCommand : ST_AXIS_COMMANDS; // Команда отдельному FB_AXIS магазина
	Status  : ST_MAGAZINE_STATUS; // Рабочие статусы магазина
	Diag    : ST_MAGAZINE_DIAG; // Состояние автомата магазина
	Error   : ST_MAGAZINE_ERRORS; // Активные и последние ошибки
	FaultStatus : ST_FAULT_INJECTION_STATUS; // Состояние инжектора для HMI
END_VAR
VAR_IN_OUT
	stInventory : ST_MAGAZINE_INVENTORY; // Zone 1/2/3 текущего магазина
END_VAR
VAR
	eGrantedOperation : E_MAGAZINE_OPERATION; // Доступная операция магазина
	eActualOperation  : E_MAGAZINE_OPERATION; // Выполняемая операция магазина

	rtExecute          : R_TRIG; // Фронт команды запуска
	rtEnable           : R_TRIG; // Фронт команды включения
	rtDisable          : R_TRIG; // Фронт команды отключения
	rtFillBlanks       : R_TRIG; // Фронт заполнения магазина заготовками
	rtClear            : R_TRIG; // Фронт очистки магазина
	rtCycleSlot        : R_TRIG; // Фронт изменения выбранного слота
	rtApplySlot        : R_TRIG; // Фронт явной записи выбранного слота
	rtReset            : R_TRIG; // Фронт команды сброса магазина
	rtPowerOn          : R_TRIG;
	rtPowerOff         : R_TRIG;
	rtHome             : R_TRIG;
	rtIndex            : R_TRIG;
	rtAxisStop         : R_TRIG;
	rtStartContentRecovery : R_TRIG;
	rtConfirmRecovery  : R_TRIG;
	rtApplyRecoverySlot : R_TRIG;
	rtClearRecoveryZones : R_TRIG;

	xExecuteRequest    : BOOL; // Активный запрос выполнения операции
	xResetRequest      : BOOL; // Активный запрос сброса
	xStopRequest       : BOOL; // Активный запрос остановки
	xManualCommand     : BOOL; // Команда получена из ручного интерфейса
	xDisableRequest    : BOOL; // Сохранённый запрос отключения после текущей операции
	xRobotInMagazineContext : BOOL; // Робот находится в рабочей зоне магазина
	xFaultContextCaptured : BOOL; // Контекст робота зафиксирован при входе в ERROR
	xRobotInMagazineAtFault : BOOL; // Робот был в рабочей зоне этого магазина при ошибке
	xRobotStopRequired : BOOL; // Итоговая реакция ROBOT_STOP, сформированная магазином
	xRobotResetDependencyReady : BOOL; // Каскадная ошибка робота может быть сброшена тем же импульсом
	xContentRecoveryActive : BOOL; // Сверка содержимого при неподвижной оси
	xInventoryVerificationRequired : BOOL; // Ошибка робота могла изменить содержимое слота
	xManualJogActive : BOOL; // Защёлка ручного движения до отпускания кнопок
	xAxisFaultHandled : BOOL; // Ошибка оси уже инвалидировала карту
	xHomeConfirmed : BOOL; // Home выполнен после последнего включения/ручного движения/аварии

	iActiveSlotCount   : SINT; // Число активных слотов выбранной матрицы
	iInventoryIndex    : SINT; // Индекс изменения содержимого магазина
	iTakeSlot          : SINT; // Слот выбранной заготовки
	iPutSlot           : SINT; // Выбранный свободный слот
	iActiveSlot        : SINT; // Единственный слот текущего элементарного движения
	xInventoryCommitted: BOOL; // Все изменения слотов текущей операции подтверждены
	xTakeSlotCommitted  : BOOL; // Изъятие заготовки отражено в матрице после закрытия захвата
	xPutSlotCommitted   : BOOL; // Укладка груза отражена в матрице после открытия захвата
	xRobotCommandStarted : BOOL; // Текущий элементарный шаг действительно принят FB_ROBOT
	xOperationSequenceComplete : BOOL; // Все шаги операции подтверждены до изменения матрицы
	xTakeSlotValid     : BOOL; // Проверка диапазона до обращения к массиву слотов
	xPutSlotValid      : BOOL;
	xTakeSlotHasBlank  : BOOL;
	xPutSlotEmpty      : BOOL;
	xPutProductTypeValid : BOOL;
	uiStep             : UINT; // Шаг последовательности робота
	uiIndex            : UINT; // Индекс слота для расчёта координат

	stActiveRobotCommand : ST_ROBOT_COMMAND; // Команда роботу текущего шага
	xFinishedCondition   : BOOL; // Текущее содержимое не позволяет продолжить цикл
	xMachineHasRelevantPart : BOOL; // В доступном станке есть заготовка, обработка или готовая деталь
	xMachineHasDestination : BOOL; // Для оставшейся работы есть свободный слот соответствующего типа
	xAllSlotsDetails    : BOOL; // Все активные слоты заполнены готовыми деталями
	xNoBlankNoMachinePart : BOOL; // Нет заготовок и нет доступной работы в станках
	xNoBlankNoDestination : BOOL; // Нет заготовок и нет места для возврата груза
	xZone1HasLoad       : BOOL; // В загрузочной зоне есть содержимое для следующего индекса
	uiMachineIndex      : UINT; // Индекс станка при расчёте завершения магазина
	uiMachineTypeIndex  : UINT; // Тип детали проверяемого станка
	uiPutProductType    : UINT; // Тип груза, защёлкнутый до физического PUT
	fbFaultInjector      : FB_MAGAZINE_FAULT_INJECTOR; // Безопасный сценарий ошибки до движения
	xFaultAllowed        : BOOL; // Владелец разрешает синтетическую проверку
	xStartupInitialized  : BOOL;
	xPositionValid       : BOOL;
	xRecoveryRequired    : BOOL;
	xHomeActive          : BOOL;
	xHomeStarted         : BOOL;
	xIndexActive         : BOOL;
	xIndexStarted        : BOOL;
	xIndexDonePulse      : BOOL;
	udiProducedPartsTotal : UDINT; // Монотонный счётчик подтверждённых укладок готовых деталей
	xHomeAllowed         : BOOL;
	xIndexAllowed        : BOOL;
	xRecoveryEditRejected : BOOL;
	xContentRecoveryAllowed : BOOL;
	xManualJogStartAllowed : BOOL;
	lrIndexStartPosition : LREAL;
	lrIndexTargetPosition: LREAL;
	lrIndexDeviation     : LREAL;
END_VAR
VAR CONSTANT
	ERR_WRONG_OPERATION : DWORD := DWORD#16#0000_0001; // Недопустимая операция магазина
	ERR_NO_BLANK        : DWORD := DWORD#16#0000_0002; // В магазине нет заготовки
	ERR_NO_FREE_SLOT    : DWORD := DWORD#16#0000_0004; // В магазине нет свободного слота
	ERR_INVALID_SLOT    : DWORD := DWORD#16#0000_0008; // Недопустимый номер слота
	ERR_SLOT_CONTENT    : DWORD := DWORD#16#0000_0010; // Содержимое слота не соответствует операции
	ERR_ROBOT           : DWORD := DWORD#16#0000_0020; // Ошибка робота при операции магазина
	ERR_GLOBAL_STOP     : DWORD := DWORD#16#0000_0040; // Остановка по глобальной ошибке
	ERR_GEOMETRY        : DWORD := DWORD#16#0000_0080; // Ошибка параметров матрицы магазина
	MASK_EQUIPMENT_ERROR : DWORD := ERR_WRONG_OPERATION OR ERR_NO_BLANK
		OR ERR_NO_FREE_SLOT OR ERR_INVALID_SLOT OR ERR_SLOT_CONTENT OR ERR_GEOMETRY;
	WRN_RESET_EXECUTE_ACTIVE : UINT := 1; // Операция магазина ещё активна
	WRN_RESET_GLOBAL_ERROR   : UINT := 2; // Глобальная ошибка ещё активна
	WRN_RESET_ROBOT_ERROR    : UINT := 3; // Ошибка робота ещё активна
	WRN_ENABLE_GLOBAL_ERROR  : UINT := 4; // Включение запрещено глобальной ошибкой
	WRN_ENABLE_CONTENT       : UINT := 5; // Содержимое магазина не позволяет включение
	WRN_DISABLE_PENDING      : UINT := 6; // Отключение магазина уже запрошено
	WRN_FILL_ENABLED         : UINT := 7; // Заполнение запрещено для включённого магазина
	WRN_FILL_GEOMETRY        : UINT := 8; // Активная матрица магазина задана неверно
	WRN_CLEAR_ENABLED        : UINT := 9; // Очистка запрещена для включённого магазина
	WRN_SIM_ERROR_NOT_ALLOWED: UINT := 10; // Тестовая ошибка запрещена текущим состоянием
	WRN_INDEX_REJECTED        : UINT := 11;
	WRN_HOME_REJECTED         : UINT := 12;
	WRN_RECOVERY_EDIT_REJECTED: UINT := 13;
	WRN_ZONE1_EDIT_REJECTED : UINT := 14;
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Инвентарь намеренно не RETAIN. Первый вызов всегда начинает с пустых зон.
IF NOT xStartupInitialized THEN
	FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineZone1Slots DO
		stInventory.aZone1[iInventoryIndex].xInPosition := FALSE;
		stInventory.aZone1[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		stInventory.aZone1[iInventoryIndex].uiProductType := UINT#0;
		stInventory.aZone2[iInventoryIndex].xInPosition := FALSE;
		stInventory.aZone2[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		stInventory.aZone2[iInventoryIndex].uiProductType := UINT#0;
	END_FOR;
	FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineZone3Slots DO
		stInventory.aZone3[iInventoryIndex].xInPosition := FALSE;
		stInventory.aZone3[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		stInventory.aZone3[iInventoryIndex].uiProductType := UINT#0;
	END_FOR;
	xPositionValid := FALSE;
	xRecoveryRequired := FALSE;
	xHomeConfirmed := FALSE;
	xContentRecoveryActive := FALSE;
	xInventoryVerificationRequired := FALSE;
	xManualJogActive := FALSE;
	xFaultContextCaptured := FALSE;
	xRobotInMagazineAtFault := FALSE;
	xRobotStopRequired := FALSE;
	xAxisFaultHandled := FALSE;
	xStartupInitialized := TRUE;
END_IF;

IF xTestInitialize THEN
	IF xTestEnabled THEN
		Diag.eState := E_MAGAZINE_STATE.IDLE;
	ELSE
		Diag.eState := E_MAGAZINE_STATE.DISABLED;
	END_IF;
	Error.dwErrorActive := DWORD#0;
	Error.dwAlarmActive := DWORD#0;
	eGrantedOperation := E_MAGAZINE_OPERATION.NONE;
	eActualOperation := E_MAGAZINE_OPERATION.NONE;
	xExecuteRequest := FALSE;
	xResetRequest := FALSE;
	xStopRequest := FALSE;
	xManualCommand := FALSE;
	iTakeSlot := SINT#0;
	iPutSlot := SINT#0;
	iActiveSlot := SINT#0;
	xInventoryCommitted := FALSE;
	xTakeSlotCommitted := FALSE;
	xPutSlotCommitted := FALSE;
	xRobotCommandStarted := FALSE;
	xOperationSequenceComplete := FALSE;
	xContentRecoveryActive := FALSE;
	xInventoryVerificationRequired := FALSE;
	xManualJogActive := FALSE;
	xFaultContextCaptured := FALSE;
	xRobotInMagazineAtFault := FALSE;
	xRobotStopRequired := FALSE;
	uiStep := UINT#0;
	stActiveRobotCommand.xExecute := FALSE;
	stActiveRobotCommand.xStop := FALSE;
	stActiveRobotCommand.xReset := FALSE;
	stActiveRobotCommand.eAction := E_ROBOT_ACTION.NONE;
	stActiveRobotCommand.eSetPoint := E_POINT_NAME.NONE;
	stActiveRobotCommand.iActiveSlot := SINT#0;
	stActiveRobotCommand.uiMagazineId := uiMagazineId;
END_IF;

rtFillBlanks(CLK := xHmiFillBlanks);
rtClear(CLK := xHmiClear);
rtCycleSlot(CLK := xHmiCycleSlot);
rtApplySlot(CLK := xHmiApplySlot);
rtPowerOn(CLK := xHmiPowerOn);
rtPowerOff(CLK := xHmiPowerOff);
rtHome(CLK := xHmiHome);
rtIndex(CLK := xHmiIndex);
rtAxisStop(CLK := xHmiAxisStop);
rtStartContentRecovery(CLK := xHmiStartContentRecovery);
rtConfirmRecovery(CLK := xHmiConfirmRecovery);
rtApplyRecoverySlot(CLK := xHmiApplyRecoverySlot);
rtClearRecoveryZones(CLK := xHmiClearRecoveryZones);

// Приводом разрешено распоряжаться только у технологически выключенного
// магазина. Кнопка "Включить магазин" больше не имеет скрытых побочных
// эффектов Power/Home.
AxisCommand.xEnable := rtPowerOn.Q
	AND (Diag.eState = E_MAGAZINE_STATE.DISABLED)
	AND NOT xGlobalError;
AxisCommand.xDisable := rtPowerOff.Q
	AND (Diag.eState = E_MAGAZINE_STATE.DISABLED)
	AND NOT xContentRecoveryActive
	AND NOT stAxisStatus.xMotionBusy
	AND NOT xHomeActive
	AND NOT xIndexActive
	AND NOT xManualJogActive;
AxisCommand.xGlobalError := xGlobalError;
AxisCommand.xPowerPermit := NOT xGlobalError;
AxisCommand.xResetAllError := xReset;
AxisCommand.xResetAxisError := FALSE;
AxisCommand.xResetLogicalError := FALSE;
AxisCommand.xStop := rtAxisStop.Q OR (xGlobalError AND stAxisStatus.xMotionBusy);
AxisCommand.xHome := FALSE;
AxisCommand.xMoveAbsolute := FALSE;
AxisCommand.xMoveRelative := FALSE;
AxisCommand.xJogPositive := FALSE;
AxisCommand.xJogNegative := FALSE;
xIndexDonePulse := FALSE;

// Питание и технологическое включение магазина независимы. После снятия
// питания старый Home больше не считается пригодным для редактирования зон.
IF NOT stAxisStatus.xPowered THEN
	xHomeConfirmed := FALSE;
	xPositionValid := FALSE;
END_IF;

// Любая ошибка собственной оси означает потерю доверия к физическому
// расположению изделий. Карта очищается один раз, магазин требует Home и
// последующего ручного подтверждения содержимого.
IF stAxisStatus.xError AND NOT xAxisFaultHandled THEN
	FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineZone1Slots DO
		stInventory.aZone1[iInventoryIndex].xInPosition := FALSE;
		stInventory.aZone1[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		stInventory.aZone1[iInventoryIndex].uiProductType := UINT#0;
		stInventory.aZone2[iInventoryIndex].xInPosition := FALSE;
		stInventory.aZone2[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		stInventory.aZone2[iInventoryIndex].uiProductType := UINT#0;
	END_FOR;
	FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineZone3Slots DO
		stInventory.aZone3[iInventoryIndex].xInPosition := FALSE;
		stInventory.aZone3[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		stInventory.aZone3[iInventoryIndex].uiProductType := UINT#0;
	END_FOR;
	xPositionValid := FALSE;
	xRecoveryRequired := TRUE;
	xHomeConfirmed := FALSE;
	xContentRecoveryActive := FALSE;
	xManualJogActive := FALSE;
	IF Diag.eState <> E_MAGAZINE_STATE.DISABLED THEN
		// Корневая авария остаётся у оси; магазин лишь исключается из автомата
		// и после Reset возвращается в DISABLED.
		Diag.eState := E_MAGAZINE_STATE.ERROR;
	END_IF;
	xAxisFaultHandled := TRUE;
ELSIF NOT stAxisStatus.xError THEN
	xAxisFaultHandled := FALSE;
END_IF;

xManualJogStartAllowed := stAxisStatus.xPowered
	AND xHomeConfirmed
	AND stAxisStatus.xCanStartMotion
	AND NOT stAxisStatus.xError
	AND NOT xGlobalError
	AND NOT xRobotOwnsMagazine
	AND NOT xHomeActive
	AND NOT xIndexActive
	AND NOT stAxisStatus.xMotionBusy
	AND NOT xRecoveryRequired
	AND NOT xContentRecoveryActive
	AND (Diag.eState = E_MAGAZINE_STATE.DISABLED);

IF NOT xManualJogActive
AND (xHmiJogPositive <> xHmiJogNegative)
AND xManualJogStartAllowed THEN
	// Ручное движение не является индексной транзакцией: карта очищается, а
	// возврат к работе возможен только после нового Home и сверки.
	FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineZone1Slots DO
		stInventory.aZone1[iInventoryIndex].xInPosition := FALSE;
		stInventory.aZone1[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		stInventory.aZone1[iInventoryIndex].uiProductType := UINT#0;
		stInventory.aZone2[iInventoryIndex].xInPosition := FALSE;
		stInventory.aZone2[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		stInventory.aZone2[iInventoryIndex].uiProductType := UINT#0;
	END_FOR;
	FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineZone3Slots DO
		stInventory.aZone3[iInventoryIndex].xInPosition := FALSE;
		stInventory.aZone3[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		stInventory.aZone3[iInventoryIndex].uiProductType := UINT#0;
	END_FOR;
	xPositionValid := FALSE;
	xRecoveryRequired := TRUE;
	xHomeConfirmed := FALSE;
	xManualJogActive := TRUE;
END_IF;

IF xManualJogActive THEN
	AxisCommand.xJogPositive := xHmiJogPositive AND NOT xHmiJogNegative;
	AxisCommand.xJogNegative := xHmiJogNegative AND NOT xHmiJogPositive;
	IF (NOT xHmiJogPositive AND NOT xHmiJogNegative)
	OR stAxisStatus.xError OR xGlobalError OR xHmiAxisStop THEN
		xManualJogActive := FALSE;
	END_IF;
END_IF;

xHomeAllowed := stAxisStatus.xPowered
	AND stAxisStatus.xCanStartMotion
	AND NOT stAxisStatus.xError
	AND NOT xRobotOwnsMagazine
	AND NOT xGlobalError
	AND NOT xIndexActive
	AND NOT xManualJogActive
	AND NOT xContentRecoveryActive
	AND (Diag.eState = E_MAGAZINE_STATE.DISABLED);
xIndexAllowed := stAxisStatus.xPowered
	AND xHomeConfirmed
	AND stAxisStatus.xCanStartMotion
	AND NOT stAxisStatus.xError
	AND xPositionValid
	AND NOT xRecoveryRequired
	AND NOT xRobotOwnsMagazine
	AND NOT xGlobalError
	AND NOT xHomeActive
	AND NOT xIndexActive
	AND NOT Status.xBusy
	AND NOT xManualJogActive
	AND NOT xContentRecoveryActive
	AND (lrIndexTolerance > LREAL#0.0)
	AND (Diag.eState = E_MAGAZINE_STATE.DISABLED);

IF rtHome.Q THEN
	IF xHomeAllowed THEN
		// Home физически переопределяет привязку ленты. Старую карту нельзя
		// тащить через это движение, даже если SoftMotion завершится штатно.
		FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineZone1Slots DO
			stInventory.aZone1[iInventoryIndex].xInPosition := FALSE;
			stInventory.aZone1[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
			stInventory.aZone1[iInventoryIndex].uiProductType := UINT#0;
			stInventory.aZone2[iInventoryIndex].xInPosition := FALSE;
			stInventory.aZone2[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
			stInventory.aZone2[iInventoryIndex].uiProductType := UINT#0;
		END_FOR;
		FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineZone3Slots DO
			stInventory.aZone3[iInventoryIndex].xInPosition := FALSE;
			stInventory.aZone3[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
			stInventory.aZone3[iInventoryIndex].uiProductType := UINT#0;
		END_FOR;
		xPositionValid := FALSE;
		xHomeConfirmed := FALSE;
		xInventoryVerificationRequired := FALSE;
		xHomeActive := TRUE;
		xHomeStarted := FALSE;
		AxisCommand.xHome := TRUE;
	ELSE
		Diag.stWarning.uiCode := WRN_HOME_REJECTED;
		Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	END_IF;
END_IF;

IF xHomeActive THEN
	IF stAxisStatus.xMotionBusy THEN
		xHomeStarted := TRUE;
	END_IF;
	IF stAxisStatus.xError OR xGlobalError OR rtAxisStop.Q OR rtPowerOff.Q THEN
		xHomeActive := FALSE;
		xHomeStarted := FALSE;
		xPositionValid := FALSE;
		xHomeConfirmed := FALSE;
		xRecoveryRequired := TRUE;
	ELSIF xHomeStarted AND stAxisStatus.xDone THEN
		xHomeActive := FALSE;
		xHomeStarted := FALSE;
		xHomeConfirmed := TRUE;
		IF NOT xRecoveryRequired THEN
			xPositionValid := TRUE;
		END_IF;
	END_IF;
END_IF;

IF rtIndex.Q THEN
	IF xIndexAllowed THEN
		xIndexActive := TRUE;
		xIndexStarted := FALSE;
		lrIndexStartPosition := REAL_TO_LREAL(stAxisStatus.lrActualPosition);
		lrIndexTargetPosition := lrIndexStartPosition + GVL_CELL_SETTINGS.lrMagazineIndexDistance;
		AxisCommand.xMoveRelative := TRUE;
	ELSE
		Diag.stWarning.uiCode := WRN_INDEX_REJECTED;
		Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	END_IF;
END_IF;

IF xIndexActive THEN
	IF stAxisStatus.xMotionBusy THEN
		xIndexStarted := TRUE;
	END_IF;
	IF stAxisStatus.xError OR xGlobalError OR rtAxisStop.Q OR rtPowerOff.Q THEN
		xIndexActive := FALSE;
		xIndexStarted := FALSE;
		xPositionValid := FALSE;
		xRecoveryRequired := TRUE;
		xHomeConfirmed := FALSE;
		FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineZone1Slots DO
			stInventory.aZone1[iInventoryIndex].xInPosition := FALSE;
			stInventory.aZone1[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
			stInventory.aZone1[iInventoryIndex].uiProductType := UINT#0;
			stInventory.aZone2[iInventoryIndex].xInPosition := FALSE;
			stInventory.aZone2[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
			stInventory.aZone2[iInventoryIndex].uiProductType := UINT#0;
		END_FOR;
		FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineZone3Slots DO
			stInventory.aZone3[iInventoryIndex].xInPosition := FALSE;
			stInventory.aZone3[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
			stInventory.aZone3[iInventoryIndex].uiProductType := UINT#0;
		END_FOR;
	ELSIF xIndexStarted AND stAxisStatus.xDone THEN
		lrIndexDeviation := ABS(REAL_TO_LREAL(stAxisStatus.lrActualPosition) - lrIndexTargetPosition);
		IF lrIndexDeviation <= lrIndexTolerance THEN
			// Сначала сохраняем первую половину старой Zone 2 в новую Zone 3.
			FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineZone3Slots DO
				stInventory.aZone3[iInventoryIndex] := stInventory.aZone2[iInventoryIndex];
			END_FOR;
			// Затем вся загрузочная зона становится рабочей.
			FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineZone2Slots DO
				stInventory.aZone2[iInventoryIndex] := stInventory.aZone1[iInventoryIndex];
				stInventory.aZone1[iInventoryIndex].xInPosition := FALSE;
				stInventory.aZone1[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
				stInventory.aZone1[iInventoryIndex].uiProductType := UINT#0;
			END_FOR;
			xIndexDonePulse := TRUE;
		ELSE
			xPositionValid := FALSE;
			xRecoveryRequired := TRUE;
		END_IF;
		xIndexActive := FALSE;
		xIndexStarted := FALSE;
	END_IF;
END_IF;

// После аварийного хода или ошибки робота PLC не выдумывает содержимое.
// Магазин остаётся физически включённым, но технологически выключен до
// подтверждения оператора.
xContentRecoveryAllowed := stAxisStatus.xPowered
	AND xHomeConfirmed
	AND NOT stAxisStatus.xMotionBusy
	AND NOT stAxisStatus.xError
	AND NOT xGlobalError
	AND NOT xRobotOwnsMagazine
	AND NOT xHomeActive
	AND NOT xIndexActive
	AND NOT xManualJogActive
	AND (Diag.eState = E_MAGAZINE_STATE.DISABLED)
	AND (xRecoveryRequired OR xInventoryVerificationRequired);

IF rtStartContentRecovery.Q AND xContentRecoveryAllowed THEN
	xContentRecoveryActive := TRUE;
END_IF;

IF xContentRecoveryActive THEN
	IF rtClearRecoveryZones.Q THEN
	FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineZone1Slots DO
		stInventory.aZone1[iInventoryIndex].xInPosition := FALSE;
		stInventory.aZone1[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		stInventory.aZone1[iInventoryIndex].uiProductType := UINT#0;
		stInventory.aZone2[iInventoryIndex].xInPosition := FALSE;
		stInventory.aZone2[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		stInventory.aZone2[iInventoryIndex].uiProductType := UINT#0;
	END_FOR;
	FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineZone3Slots DO
		stInventory.aZone3[iInventoryIndex].xInPosition := FALSE;
		stInventory.aZone3[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		stInventory.aZone3[iInventoryIndex].uiProductType := UINT#0;
	END_FOR;
	ELSIF rtApplyRecoverySlot.Q THEN
		xRecoveryEditRejected := FALSE;
		IF ((eHmiRecoveryDetailType = E_DETAIL_TYPE.NONE)
			AND (uiHmiRecoveryProductType = UINT#0))
		OR (((eHmiRecoveryDetailType = E_DETAIL_TYPE.BLANK)
				OR (eHmiRecoveryDetailType = E_DETAIL_TYPE.DETAIL))
			AND (uiHmiRecoveryProductType >= UINT#1)
			AND (uiHmiRecoveryProductType <= uiTypeCount)) THEN
			CASE uiHmiRecoveryZone OF
				UINT#1:
					IF (uiHmiRecoverySlot >= UINT#1)
					AND (uiHmiRecoverySlot <= SINT_TO_UINT(GVL_CELL_SETTINGS.MagazineZone1Slots)) THEN
						stInventory.aZone1[uiHmiRecoverySlot].eDetailType := eHmiRecoveryDetailType;
						stInventory.aZone1[uiHmiRecoverySlot].xInPosition := eHmiRecoveryDetailType <> E_DETAIL_TYPE.NONE;
						stInventory.aZone1[uiHmiRecoverySlot].uiProductType := uiHmiRecoveryProductType;
					ELSE
						xRecoveryEditRejected := TRUE;
					END_IF;
				UINT#2:
					IF (uiHmiRecoverySlot >= UINT#1)
					AND (uiHmiRecoverySlot <= SINT_TO_UINT(GVL_CELL_SETTINGS.MagazineZone2Slots)) THEN
						stInventory.aZone2[uiHmiRecoverySlot].eDetailType := eHmiRecoveryDetailType;
						stInventory.aZone2[uiHmiRecoverySlot].xInPosition := eHmiRecoveryDetailType <> E_DETAIL_TYPE.NONE;
						stInventory.aZone2[uiHmiRecoverySlot].uiProductType := uiHmiRecoveryProductType;
					ELSE
						xRecoveryEditRejected := TRUE;
					END_IF;
				UINT#3:
					IF (uiHmiRecoverySlot >= UINT#1)
					AND (uiHmiRecoverySlot <= SINT_TO_UINT(GVL_CELL_SETTINGS.MagazineZone3Slots)) THEN
						stInventory.aZone3[uiHmiRecoverySlot].eDetailType := eHmiRecoveryDetailType;
						stInventory.aZone3[uiHmiRecoverySlot].xInPosition := eHmiRecoveryDetailType <> E_DETAIL_TYPE.NONE;
						stInventory.aZone3[uiHmiRecoverySlot].uiProductType := uiHmiRecoveryProductType;
					ELSE
						xRecoveryEditRejected := TRUE;
					END_IF;
			ELSE
				xRecoveryEditRejected := TRUE;
			END_CASE;
		ELSE
			xRecoveryEditRejected := TRUE;
		END_IF;
		IF xRecoveryEditRejected THEN
			Diag.stWarning.uiCode := WRN_RECOVERY_EDIT_REJECTED;
			Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
		END_IF;
	ELSIF rtConfirmRecovery.Q THEN
		xRecoveryRequired := FALSE;
		xInventoryVerificationRequired := FALSE;
		xPositionValid := TRUE;
		xContentRecoveryActive := FALSE;
	END_IF;
END_IF;

IF xPositionValid AND NOT stAxisStatus.xHomed AND NOT xHomeActive THEN
	xPositionValid := FALSE;
END_IF;

// Активный размер матрицы может быть меньше полного массива деталей.
IF (uiRows > 0)
AND (uiColumns > 0)
AND ((uiRows * uiColumns) <= SINT_TO_UINT(GVL_CELL_SETTINGS.NumberDetail)) THEN
	iActiveSlotCount := UINT_TO_SINT(uiRows * uiColumns);
ELSE
	iActiveSlotCount := 0;
END_IF;

// Zone 1 можно готовить заранее при включённом неподвижном магазине. Zone 2
// доступна только после технологического выключения либо в recovery.
Status.xZone1EditAllowed := stAxisStatus.xPowered
	AND xHomeConfirmed
	AND NOT stAxisStatus.xMotionBusy
	AND NOT xHomeActive
	AND NOT xIndexActive
	AND NOT xManualJogActive
	AND NOT stAxisStatus.xError
	AND NOT xGlobalError
	AND ((xPositionValid AND NOT xRecoveryRequired
		AND NOT xInventoryVerificationRequired)
		OR xContentRecoveryActive);
Status.xZone2EditAllowed := Status.xZone1EditAllowed
	AND ((Diag.eState = E_MAGAZINE_STATE.DISABLED) OR xContentRecoveryActive);

IF NOT stAxisStatus.xMotionBusy
AND NOT xHomeActive
AND NOT xIndexActive
AND NOT xGlobalError THEN
	IF rtClear.Q AND Status.xZone1EditAllowed THEN
		FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.NumberDetail DO
			stInventory.aZone1[iInventoryIndex].xInPosition := FALSE;
			stInventory.aZone1[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
			stInventory.aZone1[iInventoryIndex].uiProductType := UINT#0;
		END_FOR;
	ELSIF rtFillBlanks.Q
	AND (iActiveSlotCount > 0)
	AND Status.xZone1EditAllowed THEN
		FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.NumberDetail DO
			stInventory.aZone1[iInventoryIndex].xInPosition := iInventoryIndex <= iActiveSlotCount;
			IF iInventoryIndex <= iActiveSlotCount THEN
				stInventory.aZone1[iInventoryIndex].eDetailType := E_DETAIL_TYPE.BLANK;
				stInventory.aZone1[iInventoryIndex].uiProductType := auiSlotType[iInventoryIndex];
			ELSE
				stInventory.aZone1[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
				stInventory.aZone1[iInventoryIndex].uiProductType := UINT#0;
			END_IF;
		END_FOR;
	ELSIF rtApplySlot.Q
	AND (uiHmiEditSlot >= UINT#1)
	AND (uiHmiEditSlot <= SINT_TO_UINT(iActiveSlotCount))
	AND (uiHmiEditDetailType <= UINT#2)
	AND ((uiHmiEditDetailType = UINT#0)
		OR ((uiHmiEditProductType >= UINT#1) AND (uiHmiEditProductType <= uiTypeCount)))
	AND ((((uiHmiEditZone = UINT#0) OR (uiHmiEditZone = UINT#1)) AND Status.xZone1EditAllowed)
		OR ((uiHmiEditZone = UINT#2) AND Status.xZone2EditAllowed)) THEN
		iInventoryIndex := UINT_TO_SINT(uiHmiEditSlot);
		IF uiHmiEditZone = UINT#2 THEN
			CASE uiHmiEditDetailType OF
				UINT#0:
					stInventory.aZone2[iInventoryIndex].xInPosition := FALSE;
					stInventory.aZone2[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
					stInventory.aZone2[iInventoryIndex].uiProductType := UINT#0;
				UINT#1:
					stInventory.aZone2[iInventoryIndex].xInPosition := TRUE;
					stInventory.aZone2[iInventoryIndex].eDetailType := E_DETAIL_TYPE.BLANK;
					stInventory.aZone2[iInventoryIndex].uiProductType := uiHmiEditProductType;
				UINT#2:
					stInventory.aZone2[iInventoryIndex].xInPosition := TRUE;
					stInventory.aZone2[iInventoryIndex].eDetailType := E_DETAIL_TYPE.DETAIL;
					stInventory.aZone2[iInventoryIndex].uiProductType := uiHmiEditProductType;
			END_CASE;
		ELSE
			CASE uiHmiEditDetailType OF
				UINT#0:
					stInventory.aZone1[iInventoryIndex].xInPosition := FALSE;
					stInventory.aZone1[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
					stInventory.aZone1[iInventoryIndex].uiProductType := UINT#0;
				UINT#1:
					stInventory.aZone1[iInventoryIndex].xInPosition := TRUE;
					stInventory.aZone1[iInventoryIndex].eDetailType := E_DETAIL_TYPE.BLANK;
					stInventory.aZone1[iInventoryIndex].uiProductType := uiHmiEditProductType;
				UINT#2:
					stInventory.aZone1[iInventoryIndex].xInPosition := TRUE;
					stInventory.aZone1[iInventoryIndex].eDetailType := E_DETAIL_TYPE.DETAIL;
					stInventory.aZone1[iInventoryIndex].uiProductType := uiHmiEditProductType;
			END_CASE;
		END_IF;
	ELSIF rtCycleSlot.Q
	AND (uiHmiEditSlot >= 1)
	AND (uiHmiEditSlot <= SINT_TO_UINT(iActiveSlotCount))
	AND Status.xZone1EditAllowed THEN
		iInventoryIndex := UINT_TO_SINT(uiHmiEditSlot);
		IF NOT stInventory.aZone1[iInventoryIndex].xInPosition
		OR (stInventory.aZone1[iInventoryIndex].eDetailType = E_DETAIL_TYPE.NONE) THEN
			stInventory.aZone1[iInventoryIndex].xInPosition := TRUE;
			stInventory.aZone1[iInventoryIndex].eDetailType := E_DETAIL_TYPE.BLANK;
			stInventory.aZone1[iInventoryIndex].uiProductType := auiSlotType[iInventoryIndex];
		ELSE
			stInventory.aZone1[iInventoryIndex].xInPosition := FALSE;
			stInventory.aZone1[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
			stInventory.aZone1[iInventoryIndex].uiProductType := UINT#0;
		END_IF;
	END_IF;
END_IF;

IF iActiveSlotCount > 0 THEN
	Status.iCurrentBlank := FindBlank(
		stDetail := stInventory.aZone2,
		iSlotCount := iActiveSlotCount
	);
	Status.iCurrentFreeSlot := FindFreeSlot(
		stDetail := stInventory.aZone2,
		iSlotCount := iActiveSlotCount
	);
ELSE
	Status.iCurrentBlank := 0;
	Status.iCurrentFreeSlot := 0;
END_IF;

Status.xOutBlank := Status.iCurrentBlank = 0;
Status.xOutFreeSlot := Status.iCurrentFreeSlot = 0;
Status.xCanTake := NOT Status.xOutBlank;
Status.xCanPut := NOT Status.xOutFreeSlot;
Status.xCanChange := Status.xCanTake AND Status.xCanPut;
Status.xCanEnable := FALSE;

xZone1HasLoad := FALSE;
IF iActiveSlotCount > SINT#0 THEN
	FOR uiIndex := UINT#1 TO SINT_TO_UINT(iActiveSlotCount) DO
		IF stInventory.aZone1[UINT_TO_SINT(uiIndex)].xInPosition
		AND (stInventory.aZone1[UINT_TO_SINT(uiIndex)].eDetailType <> E_DETAIL_TYPE.NONE) THEN
			xZone1HasLoad := TRUE;
		END_IF;
	END_FOR;
END_IF;

IF stRobotStatus.xBlankAvailable
AND NOT stRobotStatus.xDetailAvailable THEN
	Status.xCanEnable := Status.xCanPut;
ELSIF stRobotStatus.xDetailAvailable
AND NOT stRobotStatus.xBlankAvailable THEN
	Status.xCanEnable := Status.xCanPut;
ELSIF NOT stRobotStatus.xBlankAvailable
AND NOT stRobotStatus.xDetailAvailable THEN
	Status.xCanEnable := Status.xCanTake;
END_IF;

// Магазин нельзя выключать только потому, что в нём закончились заготовки:
// при этом робот ещё должен забрать готовые детали из станков.
xMachineHasRelevantPart := FALSE;
xMachineHasDestination := FALSE;
FOR uiMachineIndex := 1 TO 3 DO
	IF astMachineStatus[uiMachineIndex].xEnabled
	AND NOT astMachineStatus[uiMachineIndex].xError
	AND (astMachineStatus[uiMachineIndex].xProcessing
		OR ((astMachineStatus[uiMachineIndex].ePartState = E_PART_STATE.LOADED)
			AND ((astMachineStatus[uiMachineIndex].ePartType = E_PART_TYPE.PART)
				OR (astMachineStatus[uiMachineIndex].ePartType = E_PART_TYPE.DETAIL)))) THEN
		xMachineHasRelevantPart := TRUE;
		uiMachineTypeIndex := auiMachineType[uiMachineIndex];
		IF (uiMachineTypeIndex >= UINT#1)
		AND (uiMachineTypeIndex <= UINT#3) THEN
			IF Status.stTypeStatus.aiFreeSlot[uiMachineTypeIndex] > SINT#0 THEN
				xMachineHasDestination := TRUE;
			END_IF;
		END_IF;
	END_IF;
END_FOR;

// При пустом роботе магазин можно включить не только для TAKE заготовки,
// но и для выгрузки готовой детали из станка в свободный слот.
IF NOT stRobotStatus.xBlankAvailable
AND NOT stRobotStatus.xDetailAvailable
AND xMachineHasDestination THEN
	Status.xCanEnable := TRUE;
END_IF;
// Технологическое включение оценивает только рабочую Zone 2. Загрузка Zone 1
// сама по себе больше не разрешает автомат: сначала оператор выполняет индекс.
Status.xEnableCheckPowered := stAxisStatus.xPowered;
Status.xEnableCheckHomed := xHomeConfirmed;
Status.xEnableCheckPositionValid := xPositionValid;
Status.xEnableCheckStationary := (Diag.eState = E_MAGAZINE_STATE.DISABLED)
	AND NOT stAxisStatus.xMotionBusy
	AND NOT xHomeActive
	AND NOT xIndexActive
	AND NOT xManualJogActive;
Status.xEnableCheckNoError := NOT xGlobalError
	AND NOT stAxisStatus.xError
	AND (Diag.eState <> E_MAGAZINE_STATE.ERROR)
	AND (Error.dwErrorActive = DWORD#0);
Status.xEnableCheckRobotReleased := NOT xRobotOwnsMagazine;
Status.xEnableCheckContent := Status.xCanEnable;
Status.xEnableCheckInventoryVerified := NOT xRecoveryRequired
	AND NOT xInventoryVerificationRequired
	AND NOT xContentRecoveryActive;
Status.xEnableSequenceAllowed := Status.xEnableCheckPowered
	AND Status.xEnableCheckHomed
	AND Status.xEnableCheckPositionValid
	AND Status.xEnableCheckStationary
	AND Status.xEnableCheckNoError
	AND Status.xEnableCheckRobotReleased
	AND Status.xEnableCheckContent
	AND Status.xEnableCheckInventoryVerified;

// Условия автоматического завершения магазина:
// 1. Все активные слоты заняты готовыми деталями.
xAllSlotsDetails := iActiveSlotCount > SINT#0;
IF xAllSlotsDetails THEN
	FOR uiIndex := UINT#1 TO SINT_TO_UINT(iActiveSlotCount) DO
		IF NOT stInventory.aZone2[UINT_TO_SINT(uiIndex)].xInPosition
		OR (stInventory.aZone2[UINT_TO_SINT(uiIndex)].eDetailType <> E_DETAIL_TYPE.DETAIL) THEN
			xAllSlotsDetails := FALSE;
		END_IF;
	END_FOR;
END_IF;
// 2. Заготовок нет и во включённых исправных станках нет оставшейся работы.
xNoBlankNoMachinePart := Status.xOutBlank AND NOT xMachineHasRelevantPart;
// 3. Заготовок нет и свободного места для груза станков больше нет.
xNoBlankNoDestination := Status.xOutBlank AND NOT xMachineHasDestination;

xFinishedCondition :=
	(NOT stRobotStatus.xBlankAvailable
		AND NOT stRobotStatus.xDetailAvailable)
	AND NOT xZone1HasLoad
	AND (xAllSlotsDetails
		OR xNoBlankNoMachinePart
		OR xNoBlankNoDestination);

// Автоматический выбор доступной операции.
eGrantedOperation := E_MAGAZINE_OPERATION.NONE;

IF NOT Status.xOutBlank
AND NOT stRobotStatus.xBlankAvailable
AND NOT stRobotStatus.xDetailAvailable THEN
	eGrantedOperation := E_MAGAZINE_OPERATION.TAKE;

ELSIF NOT Status.xOutFreeSlot
AND Status.xOutBlank
AND stRobotStatus.xDetailAvailable THEN
	eGrantedOperation := E_MAGAZINE_OPERATION.PUT;

ELSIF NOT Status.xOutFreeSlot
AND NOT Status.xOutBlank
AND stRobotStatus.xGripper1Open
AND NOT stRobotStatus.xBlankAvailable
AND stRobotStatus.xDetailAvailable THEN
	eGrantedOperation := E_MAGAZINE_OPERATION.CHANGE;
END_IF;

// Команды магазина с HMI принимаются только в ручном режиме.
xManualCommand := xManual
AND (
	(stHmiCommand.eSetPoint = E_POINT_NAME.MAGAZINE_TAKE_DETAIL)
	OR (stHmiCommand.eSetPoint = E_POINT_NAME.MAGAZINE_PUT_DETAIL)
	OR (stHmiCommand.eSetPoint = E_POINT_NAME.MAGAZINE_CHANGE_DETAIL)
	OR (stHmiCommand.eSetPoint = E_POINT_NAME.MAGAZINE_RETURN_BLANK)
)
AND ((stHmiCommand.uiMagazineId = uiMagazineId)
	OR ((stHmiCommand.uiMagazineId = UINT#0) AND (uiMagazineId = UINT#1)));

IF xManual THEN
	IF xManualCommand THEN
		xExecuteRequest := stHmiCommand.xExecute;
		xStopRequest := stHmiCommand.xStop;
	ELSE
		xExecuteRequest := FALSE;
		xStopRequest := FALSE;
	END_IF;
ELSE
	xExecuteRequest := stMagazineCommand.xExecute;
	xStopRequest := stMagazineCommand.xStop;
END_IF;
xStopRequest := xStopRequest OR rtAxisStop.Q;

xRobotInMagazineContext := (stRobotStatus.uiMagazineContext = uiMagazineId)
	OR ((stRobotStatus.uiMagazineContext = UINT#0)
		AND (xRobotOwnsMagazine OR xManualCommand)
		AND ((stRobotStatus.eCurrentPoint = E_POINT_NAME.MAGAZINE_IN_SLOT)
			OR (stRobotStatus.eCurrentPoint = E_POINT_NAME.MAGAZINE_CHANGE)));
xRobotInMagazineContext := xRobotInMagazineContext
	OR ((xRobotOwnsMagazine OR xManualCommand)
		AND (Diag.eState = E_MAGAZINE_STATE.ROBOT_COMMAND)
		AND (stActiveRobotCommand.eAction = E_ROBOT_ACTION.MOVE_TO_POINT)
		AND ((stActiveRobotCommand.eSetPoint = E_POINT_NAME.MAGAZINE_IN_SLOT)
			OR (stActiveRobotCommand.eSetPoint = E_POINT_NAME.MAGAZINE_CHANGE)));

xResetRequest := xReset;
rtReset(CLK := xResetRequest);

xRobotResetDependencyReady := (((Error.dwErrorActive AND ERR_ROBOT) = DWORD#0)
		AND NOT xRobotInMagazineAtFault)
	OR NOT stRobotStatus.xError
	OR stRobotStatus.xResetAllowed;

IF rtReset.Q
AND (Diag.eState = E_MAGAZINE_STATE.ERROR) THEN
	IF xExecuteRequest THEN
		Diag.stWarning.uiCode := WRN_RESET_EXECUTE_ACTIVE;
	ELSIF xGlobalError THEN
		Diag.stWarning.uiCode := WRN_RESET_GLOBAL_ERROR;
	ELSIF stRobotStatus.xError
	AND NOT stRobotStatus.xResetAllowed THEN
		Diag.stWarning.uiCode := WRN_RESET_ROBOT_ERROR;
	ELSE
		Diag.stWarning.uiCode := UINT#0;
	END_IF;

	IF Diag.stWarning.uiCode <> UINT#0 THEN
		Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
		IF Diag.stWarning.udiSequence = UDINT#0 THEN
			Diag.stWarning.udiSequence := UDINT#1;
		END_IF;
	END_IF;
END_IF;

rtEnable(CLK := xHmiEnable OR (NOT xManual AND stMagazineCommand.xEnable));
rtDisable(CLK := xHmiDisable OR (NOT xManual AND stMagazineCommand.xDisable));

IF rtEnable.Q
AND (Diag.eState = E_MAGAZINE_STATE.DISABLED)
AND NOT Status.xEnableSequenceAllowed THEN
	IF xGlobalError THEN
		Diag.stWarning.uiCode := WRN_ENABLE_GLOBAL_ERROR;
	ELSE
		Diag.stWarning.uiCode := WRN_ENABLE_CONTENT;
	END_IF;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
ELSIF rtDisable.Q
AND xHmiDisable
AND xDisableRequest THEN
	Diag.stWarning.uiCode := WRN_DISABLE_PENDING;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
ELSIF rtFillBlanks.Q
AND (iActiveSlotCount = 0) THEN
	Diag.stWarning.uiCode := WRN_FILL_GEOMETRY;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
ELSIF rtFillBlanks.Q
AND (stAxisStatus.xMotionBusy OR xHomeActive OR xIndexActive OR xGlobalError) THEN
	Diag.stWarning.uiCode := WRN_FILL_ENABLED;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
ELSIF rtClear.Q
AND (stAxisStatus.xMotionBusy OR xHomeActive OR xIndexActive OR xGlobalError) THEN
	Diag.stWarning.uiCode := WRN_CLEAR_ENABLED;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
ELSIF rtApplySlot.Q
AND ((uiHmiEditSlot < UINT#1)
	OR (uiHmiEditSlot > SINT_TO_UINT(iActiveSlotCount))
	OR (uiHmiEditDetailType > UINT#2)
	OR ((uiHmiEditDetailType <> UINT#0)
		AND ((uiHmiEditProductType < UINT#1) OR (uiHmiEditProductType > uiTypeCount)))
	OR (uiHmiEditZone > UINT#2)
	OR (((uiHmiEditZone = UINT#0) OR (uiHmiEditZone = UINT#1)) AND NOT Status.xZone1EditAllowed)
	OR ((uiHmiEditZone = UINT#2) AND NOT Status.xZone2EditAllowed)
	OR stAxisStatus.xMotionBusy
	OR xHomeActive
	OR xIndexActive
	OR xGlobalError) THEN
	Diag.stWarning.uiCode := WRN_ZONE1_EDIT_REJECTED;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

IF rtDisable.Q THEN
	xDisableRequest := TRUE;
END_IF;

rtExecute(CLK := xExecuteRequest);

// Синтетический сценарий входит только в проверочный шаг CHOOSE и не выдаёт
// команду движения роботу до формирования выбранной штатной ошибки.
xFaultAllowed := ((Diag.eState = E_MAGAZINE_STATE.DISABLED)
	OR (Diag.eState = E_MAGAZINE_STATE.IDLE))
	AND NOT xExecuteRequest
	AND NOT xGlobalError
	AND NOT stRobotStatus.xBusy
	AND NOT stRobotStatus.xError
	AND (Error.dwErrorActive = DWORD#0);

fbFaultInjector(
	Request := FaultRequest,
	xOwnerAllowed := xFaultAllowed,
	xComplete := Diag.eState = E_MAGAZINE_STATE.ERROR
);
FaultStatus := fbFaultInjector.Status;

IF fbFaultInjector.Status.xRejected THEN
	Diag.stWarning.uiCode := WRN_SIM_ERROR_NOT_ALLOWED;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

// Значения команды роботу по умолчанию.
Command.xExecute := FALSE;
Command.xStop := FALSE;
Command.xReset := xResetRequest;
Command.eAction := E_ROBOT_ACTION.NONE;
Command.eSetPoint := E_POINT_NAME.NONE;
Command.iActiveSlot := 0;
Command.uiMagazineId := UINT#0;

// Ошибка робота в рабочей зоне принадлежит одновременно роботу и магазину.
IF xRobotInMagazineContext
AND stRobotStatus.xError
AND (Diag.eState <> E_MAGAZINE_STATE.ERROR) THEN
	xInventoryVerificationRequired := TRUE;
	xContentRecoveryActive := FALSE;
	Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
	Diag.eState := E_MAGAZINE_STATE.ERROR;
END_IF;

IF xGlobalError
AND (Diag.eState <> E_MAGAZINE_STATE.DISABLED)
AND (Diag.eState <> E_MAGAZINE_STATE.IDLE)
AND (Diag.eState <> E_MAGAZINE_STATE.ERROR) THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_GLOBAL_STOP;
	Diag.eState := E_MAGAZINE_STATE.ERROR;
END_IF;

CASE Diag.eState OF
	E_MAGAZINE_STATE.DISABLED:
		xDisableRequest := FALSE;
		IF fbFaultInjector.Status.xBusy THEN
			iTakeSlot := 1;
			iPutSlot := 1;
			IF fbFaultInjector.xWrongOperation THEN
				eActualOperation := E_MAGAZINE_OPERATION.NONE;
			ELSIF fbFaultInjector.xNoFreeSlot THEN
				eActualOperation := E_MAGAZINE_OPERATION.PUT;
			ELSE
				eActualOperation := E_MAGAZINE_OPERATION.TAKE;
			END_IF;
			Diag.eState := E_MAGAZINE_STATE.CHOOSE;
		ELSIF rtEnable.Q
		AND Status.xEnableSequenceAllowed THEN
			Diag.eState := E_MAGAZINE_STATE.IDLE;
		END_IF;

	E_MAGAZINE_STATE.IDLE:
		uiStep := 0;
		eActualOperation := E_MAGAZINE_OPERATION.NONE;
		xInventoryCommitted := FALSE;
		xTakeSlotCommitted := FALSE;
		xPutSlotCommitted := FALSE;
		xOperationSequenceComplete := FALSE;

		IF fbFaultInjector.Status.xBusy THEN
			iTakeSlot := 1;
			iPutSlot := 1;
			IF fbFaultInjector.xWrongOperation THEN
				eActualOperation := E_MAGAZINE_OPERATION.NONE;
			ELSIF fbFaultInjector.xNoFreeSlot THEN
				eActualOperation := E_MAGAZINE_OPERATION.PUT;
			ELSE
				eActualOperation := E_MAGAZINE_OPERATION.TAKE;
			END_IF;
			Diag.eState := E_MAGAZINE_STATE.CHOOSE;
		ELSIF xFinishedCondition THEN
			Diag.eState := E_MAGAZINE_STATE.DISABLED;
		// Активный автоматический цикл сначала должен передать владение второму
		// магазину. До этого сохраняем xEnabled + xDisablePending, иначе менеджер
		// остаётся владельцем уже выключенного магазина и не может продолжить груз.
		ELSIF xDisableRequest
		AND NOT xRobotOwnsMagazine THEN
			Diag.eState := E_MAGAZINE_STATE.DISABLED;
		ELSIF xGlobalError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_GLOBAL_STOP;
			Diag.eState := E_MAGAZINE_STATE.ERROR;
		// Автоматический владелец держит xExecute до завершения операции. Если
		// команда пришла раньше включения магазина, фронт был бы поглощён в
		// DISABLED; в IDLE принимаем также активный уровень запроса.
		ELSIF rtExecute.Q OR xExecuteRequest THEN
			IF xManualCommand THEN
				CASE stHmiCommand.eSetPoint OF
					E_POINT_NAME.MAGAZINE_TAKE_DETAIL:
						eActualOperation := E_MAGAZINE_OPERATION.TAKE;
						iTakeSlot := stHmiCommand.iActiveSlot;
					E_POINT_NAME.MAGAZINE_PUT_DETAIL:
						eActualOperation := E_MAGAZINE_OPERATION.PUT;
						iPutSlot := stHmiCommand.iActiveSlot;
					E_POINT_NAME.MAGAZINE_CHANGE_DETAIL:
						// CHANGE требует двух слотов и запускается через ST_MAGAZINE_COMMAND.
						eActualOperation := E_MAGAZINE_OPERATION.NONE;
					E_POINT_NAME.MAGAZINE_RETURN_BLANK:
						eActualOperation := E_MAGAZINE_OPERATION.RETURN_BLANK;
						iPutSlot := stHmiCommand.iActiveSlot;
				ELSE
						eActualOperation := E_MAGAZINE_OPERATION.NONE;
				END_CASE;
			ELSE
				eActualOperation := stMagazineCommand.eOperation;
				iTakeSlot := stMagazineCommand.iTakeSlot;
				iPutSlot := stMagazineCommand.iPutSlot;
			END_IF;

			Diag.eState := E_MAGAZINE_STATE.CHOOSE;
		END_IF;

	E_MAGAZINE_STATE.CHOOSE:
		xTakeSlotValid := (iTakeSlot >= 1) AND (iTakeSlot <= iActiveSlotCount);
		xPutSlotValid := (iPutSlot >= 1) AND (iPutSlot <= iActiveSlotCount);
		xTakeSlotHasBlank := FALSE;
		xPutSlotEmpty := FALSE;

		IF xTakeSlotValid THEN
		xTakeSlotHasBlank := stInventory.aZone2[iTakeSlot].xInPosition
			AND (stInventory.aZone2[iTakeSlot].eDetailType = E_DETAIL_TYPE.BLANK)
			AND (stInventory.aZone2[iTakeSlot].uiProductType >= UINT#1)
			AND (stInventory.aZone2[iTakeSlot].uiProductType <= uiTypeCount);
		END_IF;

	IF xPutSlotValid THEN
		xPutSlotEmpty := NOT stInventory.aZone2[iPutSlot].xInPosition;
	END_IF;
	xPutProductTypeValid := TRUE;
	IF (eActualOperation = E_MAGAZINE_OPERATION.PUT)
	OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE) THEN
		xPutProductTypeValid := (stRobotStatus.uiDetailPayloadType >= UINT#1)
			AND (stRobotStatus.uiDetailPayloadType <= uiTypeCount);
	ELSIF eActualOperation = E_MAGAZINE_OPERATION.RETURN_BLANK THEN
		xPutProductTypeValid := (stRobotStatus.uiBlankPayloadType >= UINT#1)
			AND (stRobotStatus.uiBlankPayloadType <= uiTypeCount);
	END_IF;

		IF fbFaultInjector.xGeometry
		OR (iActiveSlotCount = 0) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_GEOMETRY;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF fbFaultInjector.xWrongOperation
		OR (eActualOperation = E_MAGAZINE_OPERATION.NONE) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_WRONG_OPERATION;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF fbFaultInjector.xNoBlank THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_NO_BLANK;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF fbFaultInjector.xNoFreeSlot THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_NO_FREE_SLOT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF fbFaultInjector.xInvalidSlot THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_INVALID_SLOT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF fbFaultInjector.xSlotContent THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_SLOT_CONTENT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF ((eActualOperation = E_MAGAZINE_OPERATION.TAKE)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE))
		AND NOT xTakeSlotValid THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_NO_BLANK OR ERR_INVALID_SLOT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF ((eActualOperation = E_MAGAZINE_OPERATION.PUT)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE)
			OR (eActualOperation = E_MAGAZINE_OPERATION.RETURN_BLANK))
		AND NOT xPutSlotValid THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_NO_FREE_SLOT OR ERR_INVALID_SLOT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF (eActualOperation = E_MAGAZINE_OPERATION.CHANGE)
		AND (iTakeSlot = iPutSlot) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_INVALID_SLOT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF ((eActualOperation = E_MAGAZINE_OPERATION.TAKE)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE))
		AND NOT xTakeSlotHasBlank THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_SLOT_CONTENT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF ((eActualOperation = E_MAGAZINE_OPERATION.PUT)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE)
			OR (eActualOperation = E_MAGAZINE_OPERATION.RETURN_BLANK))
		AND NOT xPutSlotEmpty THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_SLOT_CONTENT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF ((eActualOperation = E_MAGAZINE_OPERATION.PUT)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE)
			OR (eActualOperation = E_MAGAZINE_OPERATION.RETURN_BLANK))
		AND NOT xPutProductTypeValid THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_SLOT_CONTENT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF (eActualOperation = E_MAGAZINE_OPERATION.TAKE)
		AND (stRobotStatus.xBlankAvailable OR stRobotStatus.xDetailAvailable) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_WRONG_OPERATION;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF (eActualOperation = E_MAGAZINE_OPERATION.CHANGE)
		AND (NOT stRobotStatus.xGripper1Open
			OR stRobotStatus.xBlankAvailable) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_WRONG_OPERATION;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF ((eActualOperation = E_MAGAZINE_OPERATION.PUT)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE))
		AND NOT stRobotStatus.xDetailAvailable THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_WRONG_OPERATION;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF (eActualOperation = E_MAGAZINE_OPERATION.RETURN_BLANK)
		AND (NOT stRobotStatus.xBlankAvailable
			OR stRobotStatus.xDetailAvailable) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_WRONG_OPERATION;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSE
			uiPutProductType := UINT#0;
			IF (eActualOperation = E_MAGAZINE_OPERATION.PUT)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE) THEN
				uiPutProductType := stRobotStatus.uiDetailPayloadType;
			ELSIF eActualOperation = E_MAGAZINE_OPERATION.RETURN_BLANK THEN
				uiPutProductType := stRobotStatus.uiBlankPayloadType;
			END_IF;
			xInventoryCommitted := FALSE;
			xTakeSlotCommitted := FALSE;
			xPutSlotCommitted := FALSE;
			xOperationSequenceComplete := FALSE;
			uiStep := 0;
			Diag.eState := E_MAGAZINE_STATE.PREPARE_STEP;
		END_IF;

	E_MAGAZINE_STATE.PREPARE_STEP:
		xRobotCommandStarted := FALSE;
		stActiveRobotCommand.xExecute := FALSE;
		stActiveRobotCommand.xStop := FALSE;
		stActiveRobotCommand.xReset := xResetRequest;
		stActiveRobotCommand.eAction := E_ROBOT_ACTION.NONE;
		stActiveRobotCommand.eSetPoint := E_POINT_NAME.NONE;

		CASE eActualOperation OF
			E_MAGAZINE_OPERATION.TAKE:
				iActiveSlot := iTakeSlot;
			E_MAGAZINE_OPERATION.PUT,
			E_MAGAZINE_OPERATION.RETURN_BLANK:
				iActiveSlot := iPutSlot;
			E_MAGAZINE_OPERATION.CHANGE:
				IF uiStep <= UINT#5 THEN
					iActiveSlot := iPutSlot;
				ELSE
					iActiveSlot := iTakeSlot;
				END_IF;
		ELSE
			iActiveSlot := SINT#0;
		END_CASE;
		stActiveRobotCommand.iActiveSlot := iActiveSlot;
		stActiveRobotCommand.uiMagazineId := uiMagazineId;

		CASE eActualOperation OF
				E_MAGAZINE_OPERATION.TAKE:
					CASE uiStep OF
						0:
							IF stRobotStatus.xRotatedToDetail THEN
								Diag.eState := E_MAGAZINE_STATE.NEXT;
							ELSE
								stActiveRobotCommand.eAction := E_ROBOT_ACTION.ROTATE_TO_DETAIL;
							END_IF;
						1:
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_SAFE;
						2:
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_IN_SLOT;
						3: stActiveRobotCommand.eAction := E_ROBOT_ACTION.CLAMP_1;
						4:
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_SAFE;
					ELSE
						xOperationSequenceComplete := TRUE;
						Diag.eState := E_MAGAZINE_STATE.DONE;
					END_CASE;

				E_MAGAZINE_OPERATION.PUT:
					CASE uiStep OF
						0:
							IF stRobotStatus.xRotatedToBlank THEN
								Diag.eState := E_MAGAZINE_STATE.NEXT;
							ELSE
								stActiveRobotCommand.eAction := E_ROBOT_ACTION.ROTATE_TO_BLANK;
							END_IF;
						1:
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_SAFE;
						2:
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_IN_SLOT;
						3: stActiveRobotCommand.eAction := E_ROBOT_ACTION.UNCLAMP_2;
						4:
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_SAFE;
					ELSE
						xOperationSequenceComplete := TRUE;
						Diag.eState := E_MAGAZINE_STATE.DONE;
					END_CASE;

				E_MAGAZINE_OPERATION.CHANGE:
					CASE uiStep OF
						0:
							IF stRobotStatus.xRotatedToBlank THEN
								Diag.eState := E_MAGAZINE_STATE.NEXT;
							ELSE
								stActiveRobotCommand.eAction := E_ROBOT_ACTION.ROTATE_TO_BLANK;
							END_IF;
						1:
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_SAFE;
						2:
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_IN_SLOT;
						3: stActiveRobotCommand.eAction := E_ROBOT_ACTION.UNCLAMP_2;
						4:
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_CHANGE;
						5:
							IF stRobotStatus.xRotatedToDetail THEN
								Diag.eState := E_MAGAZINE_STATE.NEXT;
							ELSE
								stActiveRobotCommand.eAction := E_ROBOT_ACTION.ROTATE_TO_DETAIL;
							END_IF;
						6:
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_CHANGE;
						7:
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_IN_SLOT;
						8: stActiveRobotCommand.eAction := E_ROBOT_ACTION.CLAMP_1;
						9:
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_SAFE;
					ELSE
						xOperationSequenceComplete := TRUE;
						Diag.eState := E_MAGAZINE_STATE.DONE;
					END_CASE;

				E_MAGAZINE_OPERATION.RETURN_BLANK:
					CASE uiStep OF
						0:
							IF stRobotStatus.xRotatedToDetail THEN
								Diag.eState := E_MAGAZINE_STATE.NEXT;
							ELSE
								stActiveRobotCommand.eAction := E_ROBOT_ACTION.ROTATE_TO_DETAIL;
							END_IF;
						1:
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_SAFE;
						2:
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_IN_SLOT;
						3: stActiveRobotCommand.eAction := E_ROBOT_ACTION.UNCLAMP_1;
						4:
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_SAFE;
					ELSE
						xOperationSequenceComplete := TRUE;
						Diag.eState := E_MAGAZINE_STATE.DONE;
					END_CASE;
		END_CASE;

		IF Diag.eState = E_MAGAZINE_STATE.PREPARE_STEP THEN
			Diag.eState := E_MAGAZINE_STATE.ROBOT_COMMAND;
		END_IF;

	E_MAGAZINE_STATE.ROBOT_COMMAND:
		Command := stActiveRobotCommand;
		Command.xExecute := TRUE;
		IF stRobotStatus.xBusy THEN
			xRobotCommandStarted := TRUE;
		END_IF;

		IF xStopRequest OR xGlobalError THEN
			Command.xStop := stRobotStatus.xBusy;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_GLOBAL_STOP;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF stRobotStatus.xError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF xRobotCommandStarted AND stRobotStatus.xDone THEN
			// Матрица меняется в момент подтверждённого физического переноса,
			// а не после отхода робота и завершения всей составной операции.
			CASE eActualOperation OF
				E_MAGAZINE_OPERATION.TAKE:
					IF (uiStep = UINT#3) AND NOT xTakeSlotCommitted THEN
						stInventory.aZone2[iTakeSlot].xInPosition := FALSE;
						stInventory.aZone2[iTakeSlot].eDetailType := E_DETAIL_TYPE.NONE;
						stInventory.aZone2[iTakeSlot].uiProductType := UINT#0;
						xTakeSlotCommitted := TRUE;
					END_IF;

				E_MAGAZINE_OPERATION.PUT:
					IF (uiStep = UINT#3) AND NOT xPutSlotCommitted THEN
						stInventory.aZone2[iPutSlot].xInPosition := TRUE;
						stInventory.aZone2[iPutSlot].eDetailType := E_DETAIL_TYPE.DETAIL;
						stInventory.aZone2[iPutSlot].uiProductType := uiPutProductType;
						udiProducedPartsTotal := udiProducedPartsTotal + UDINT#1;
						xPutSlotCommitted := TRUE;
					END_IF;

				E_MAGAZINE_OPERATION.CHANGE:
					IF (uiStep = UINT#3) AND NOT xPutSlotCommitted THEN
						stInventory.aZone2[iPutSlot].xInPosition := TRUE;
						stInventory.aZone2[iPutSlot].eDetailType := E_DETAIL_TYPE.DETAIL;
						stInventory.aZone2[iPutSlot].uiProductType := uiPutProductType;
						udiProducedPartsTotal := udiProducedPartsTotal + UDINT#1;
						xPutSlotCommitted := TRUE;
					ELSIF (uiStep = UINT#8) AND NOT xTakeSlotCommitted THEN
						stInventory.aZone2[iTakeSlot].xInPosition := FALSE;
						stInventory.aZone2[iTakeSlot].eDetailType := E_DETAIL_TYPE.NONE;
						stInventory.aZone2[iTakeSlot].uiProductType := UINT#0;
						xTakeSlotCommitted := TRUE;
					END_IF;

				E_MAGAZINE_OPERATION.RETURN_BLANK:
					IF (uiStep = UINT#3) AND NOT xPutSlotCommitted THEN
						stInventory.aZone2[iPutSlot].xInPosition := TRUE;
						stInventory.aZone2[iPutSlot].eDetailType := E_DETAIL_TYPE.BLANK;
						stInventory.aZone2[iPutSlot].uiProductType := uiPutProductType;
						xPutSlotCommitted := TRUE;
					END_IF;
			END_CASE;
			Diag.eState := E_MAGAZINE_STATE.RELEASE_ROBOT_COMMAND;
		END_IF;

	E_MAGAZINE_STATE.RELEASE_ROBOT_COMMAND:
		IF stRobotStatus.xError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;
		ELSIF NOT stRobotStatus.xBusy AND NOT stRobotStatus.xDone THEN
			Diag.eState := E_MAGAZINE_STATE.NEXT;
		END_IF;

	E_MAGAZINE_STATE.NEXT:
		uiStep := uiStep + 1;
		Diag.eState := E_MAGAZINE_STATE.PREPARE_STEP;

	E_MAGAZINE_STATE.DONE:
		// Страховочная фиксация нужна только если конечный DONE получен без
		// промежуточного обновления. В штатном ходе слоты уже изменены захватами.
		IF xOperationSequenceComplete
		AND NOT xStopRequest
		AND NOT xGlobalError
		AND NOT xInventoryCommitted THEN
			CASE eActualOperation OF
				E_MAGAZINE_OPERATION.TAKE:
					IF NOT xTakeSlotCommitted THEN
						stInventory.aZone2[iTakeSlot].xInPosition := FALSE;
						stInventory.aZone2[iTakeSlot].eDetailType := E_DETAIL_TYPE.NONE;
						stInventory.aZone2[iTakeSlot].uiProductType := UINT#0;
						xTakeSlotCommitted := TRUE;
					END_IF;
				E_MAGAZINE_OPERATION.PUT:
					IF NOT xPutSlotCommitted THEN
						stInventory.aZone2[iPutSlot].xInPosition := TRUE;
						stInventory.aZone2[iPutSlot].eDetailType := E_DETAIL_TYPE.DETAIL;
						stInventory.aZone2[iPutSlot].uiProductType := uiPutProductType;
						udiProducedPartsTotal := udiProducedPartsTotal + UDINT#1;
						xPutSlotCommitted := TRUE;
					END_IF;
				E_MAGAZINE_OPERATION.CHANGE:
					IF NOT xPutSlotCommitted THEN
						stInventory.aZone2[iPutSlot].xInPosition := TRUE;
						stInventory.aZone2[iPutSlot].eDetailType := E_DETAIL_TYPE.DETAIL;
						stInventory.aZone2[iPutSlot].uiProductType := uiPutProductType;
						udiProducedPartsTotal := udiProducedPartsTotal + UDINT#1;
						xPutSlotCommitted := TRUE;
					END_IF;
					IF NOT xTakeSlotCommitted THEN
						stInventory.aZone2[iTakeSlot].xInPosition := FALSE;
						stInventory.aZone2[iTakeSlot].eDetailType := E_DETAIL_TYPE.NONE;
						stInventory.aZone2[iTakeSlot].uiProductType := UINT#0;
						xTakeSlotCommitted := TRUE;
					END_IF;
				E_MAGAZINE_OPERATION.RETURN_BLANK:
					IF NOT xPutSlotCommitted THEN
						stInventory.aZone2[iPutSlot].xInPosition := TRUE;
						stInventory.aZone2[iPutSlot].eDetailType := E_DETAIL_TYPE.BLANK;
						stInventory.aZone2[iPutSlot].uiProductType := uiPutProductType;
						xPutSlotCommitted := TRUE;
					END_IF;
			END_CASE;
			xInventoryCommitted := TRUE;
		END_IF;
		IF NOT xExecuteRequest THEN
			eActualOperation := E_MAGAZINE_OPERATION.NONE;
			IF xDisableRequest
			AND NOT xRobotOwnsMagazine THEN
				Diag.eState := E_MAGAZINE_STATE.DISABLED;
			ELSE
				Diag.eState := E_MAGAZINE_STATE.IDLE;
			END_IF;
		END_IF;

	E_MAGAZINE_STATE.ERROR:
		IF xResetRequest
		AND NOT xExecuteRequest
		AND NOT xStopRequest
		AND NOT FaultStatus.xBusy
		AND NOT xGlobalError
		AND xRobotResetDependencyReady THEN
			Error.dwErrorLast := Error.dwErrorActive;
			Error.dwErrorActive := DWORD#0;
			eActualOperation := E_MAGAZINE_OPERATION.NONE;
			Diag.eState := E_MAGAZINE_STATE.DISABLED;
		END_IF;
END_CASE;

// Класс реакции не размазывается по CASE. Первичная причина остаётся в своей
// маске, а контекст конкретного магазина хранится до принятого сброса.
IF ((Diag.eState = E_MAGAZINE_STATE.ERROR) OR stAxisStatus.xError)
AND NOT xFaultContextCaptured THEN
	xRobotInMagazineAtFault := xRobotInMagazineContext;
	IF xRobotInMagazineAtFault THEN
		xInventoryVerificationRequired := TRUE;
		xContentRecoveryActive := FALSE;
	END_IF;
	xFaultContextCaptured := TRUE;
ELSIF (Diag.eState <> E_MAGAZINE_STATE.ERROR) AND NOT stAxisStatus.xError THEN
	xRobotInMagazineAtFault := FALSE;
	xFaultContextCaptured := FALSE;
END_IF;

xRobotStopRequired := NOT xGlobalError
	AND (((Error.dwErrorActive AND ERR_ROBOT) <> DWORD#0)
	OR ((((Error.dwErrorActive AND MASK_EQUIPMENT_ERROR) <> DWORD#0)
		OR stAxisStatus.xError)
		AND xRobotInMagazineAtFault));

// Физический Stop нужен только занятому роботу. При неподвижном роботе внутри
// магазина FB_ROBOT получит зависимую ошибку без пустой команды остановки.
IF (Diag.eState = E_MAGAZINE_STATE.ERROR)
AND xRobotStopRequired
AND stRobotStatus.xBusy THEN
	Command := stActiveRobotCommand;
	Command.xExecute := TRUE;
	Command.xStop := TRUE;
END_IF;

Status.xEnabled := Diag.eState <> E_MAGAZINE_STATE.DISABLED;
Status.xDisablePending := xDisableRequest AND Status.xEnabled;
Status.xPowerAllowed := (Diag.eState = E_MAGAZINE_STATE.DISABLED)
	AND NOT xRobotOwnsMagazine
	AND NOT stAxisStatus.xMotionBusy
	AND NOT xHomeActive
	AND NOT xIndexActive
	AND NOT xManualJogActive
	AND NOT xContentRecoveryActive
	AND NOT xGlobalError;
Status.xFillAllowed := (iActiveSlotCount > 0) AND Status.xZone1EditAllowed;
Status.xClearAllowed := Status.xZone1EditAllowed;
Status.xReady := (Diag.eState = E_MAGAZINE_STATE.IDLE)
	AND xHomeConfirmed
	AND xPositionValid
	AND NOT xRecoveryRequired
	AND NOT xInventoryVerificationRequired
	AND NOT xContentRecoveryActive
	AND NOT xHomeActive
	AND NOT xIndexActive
	AND NOT stAxisStatus.xError;
Status.xBusy := (Diag.eState <> E_MAGAZINE_STATE.DISABLED)
	AND (Diag.eState <> E_MAGAZINE_STATE.IDLE)
	AND (Diag.eState <> E_MAGAZINE_STATE.DONE)
	AND (Diag.eState <> E_MAGAZINE_STATE.ERROR);
Status.xBusy := Status.xBusy OR xHomeActive OR xIndexActive
	OR xManualJogActive OR stAxisStatus.xMotionBusy;
Status.xDone := Diag.eState = E_MAGAZINE_STATE.DONE;
Status.xError := (Diag.eState = E_MAGAZINE_STATE.ERROR) OR stAxisStatus.xError;
Status.xRobotStopRequired := xRobotStopRequired;
Status.xHomed := xHomeConfirmed;
Status.xPositionValid := xPositionValid;
Status.xRecoveryRequired := xRecoveryRequired;
Status.xIndexAllowed := xIndexAllowed;
Status.xIndexing := xIndexActive;
Status.xIndexDone := xIndexDonePulse;
Status.xAxisError := stAxisStatus.xError;
Status.udiProducedPartsTotal := udiProducedPartsTotal;
Status.xJogPositiveAllowed := xManualJogStartAllowed OR xManualJogActive;
Status.xJogNegativeAllowed := xManualJogStartAllowed OR xManualJogActive;
Status.xContentRecoveryAllowed := xContentRecoveryAllowed;
Status.xContentRecoveryActive := xContentRecoveryActive;
Status.xInventoryVerificationRequired := xInventoryVerificationRequired;
Status.uiMagazineId := uiMagazineId;
Status.eGrantedOperation := eGrantedOperation;
Status.eActualOperation := eActualOperation;
Status.iSelectedBlank := iTakeSlot;
Status.iSelectedFreeSlot := iPutSlot;
Status.xFinished := xFinishedCondition AND NOT Status.xBusy;
Error.dwAlarmActive := Error.dwErrorActive;

IF Error.dwErrorActive <> DWORD#0 THEN
	Error.dwErrorLast := Error.dwErrorActive;
END_IF;

Error.stErrorActive := UpdateErrorView(dwError := Error.dwErrorActive);
Error.stErrorLast := UpdateErrorView(dwError := Error.dwErrorLast);
FaultStatus.xResetAllowed := Status.xError
	AND NOT FaultStatus.xBusy
	AND NOT xExecuteRequest
	AND NOT xStopRequest
	AND NOT xGlobalError
	AND xRobotResetDependencyReady;

// Карта секций публикуется владельцем содержимого после всех изменений слотов.
UpdateTypeStatus(stMagazineInventory := stInventory);
