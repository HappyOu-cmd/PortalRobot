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
	xHmiApplyPitchX   : BOOL; // Применить новый общий шаг слотов по X
	xHmiApplyPitchY   : BOOL; // Применить новый общий шаг слотов по Y
	xHmiApplySafeAbove : BOOL; // Применить безопасную высоту конкретного магазина
	xHmiApplySafeInside : BOOL; // Применить рабочую высоту конкретного магазина
	uiHmiEditSlot     : UINT; // Номер слота для ручного редактирования
	uiHmiEditDetailType : UINT; // 0=NONE, 1=BLANK, 2=DETAIL
	uiHmiEditProductType : UINT; // Тип изделия 1..3
	lrHmiEditPitchX   : LREAL;
	lrHmiEditPitchY   : LREAL;
	lrHmiEditSafeAbove : LREAL;
	lrHmiEditSafeInside : LREAL;
	xRobotOwnsMagazine : BOOL; // Автомат удерживает этот магазин в текущем цикле
	xRobotCanWorkWithMagazine : BOOL; // Интерфейс робота и обязательные точки готовы
	xSharedGeometryEditAllowed : BOOL; // Оба магазина выключены; общий шаг можно менять
	uiRows            : UINT; // Число строк матрицы магазина
	uiColumns         : UINT; // Число столбцов матрицы магазина
	uiTypeCount       : UINT; // Количество настроенных типов заготовок, 1..3
	auiSlotType       : ARRAY [1..GVL_CELL_SETTINGS.NumberDetail] OF UINT; // Тип секции каждого слота
	FaultRequest  : ST_MAGAZINE_FAULT_REQUEST; // Единый контракт диагностической инъекции
END_VAR
VAR_OUTPUT
	Command : ST_ROBOT_COMMAND; // Текущая пошаговая команда роботу
	Status  : ST_MAGAZINE_STATUS; // Рабочие статусы магазина
	Diag    : ST_MAGAZINE_DIAG; // Состояние автомата магазина
	Error   : ST_MAGAZINE_ERRORS; // Активные и последние ошибки
	FaultStatus : ST_FAULT_INJECTION_STATUS; // Состояние инжектора для HMI
END_VAR
VAR_IN_OUT
	stInventory : ST_MAGAZINE_INVENTORY; // Единственная кассета текущего магазина
	lrPitchX : LREAL; // Общий фактический шаг слотов по X
	lrPitchY : LREAL; // Общий фактический шаг слотов по Y
	lrSafeAbove : LREAL; // Фактическая безопасная высота текущего магазина
	lrSafeInside : LREAL; // Фактическая рабочая высота текущего магазина
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
	rtApplyPitchX      : R_TRIG;
	rtApplyPitchY      : R_TRIG;
	rtApplySafeAbove   : R_TRIG;
	rtApplySafeInside  : R_TRIG;
	rtReset            : R_TRIG; // Фронт команды сброса магазина

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
	uiMachineIndex      : UINT; // Индекс станка при расчёте завершения магазина
	uiMachineTypeIndex  : UINT; // Тип детали проверяемого станка
	uiPutProductType    : UINT; // Тип груза, защёлкнутый до физического PUT
	fbFaultInjector      : FB_MAGAZINE_FAULT_INJECTOR; // Безопасный сценарий ошибки до движения
	xFaultAllowed        : BOOL; // Владелец разрешает синтетическую проверку
	xStartupInitialized  : BOOL;
	udiProducedPartsTotal : UDINT; // Монотонный счётчик подтверждённых укладок готовых деталей
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
	WRN_ENABLE_ROBOT_NOT_READY : UINT := 15; // Робот не может работать с магазином
	WRN_EDIT_REJECTED : UINT := 14; // Редактирование включённого/занятого магазина запрещено
	WRN_GEOMETRY_EDIT_REJECTED : UINT := 16; // PLC отклонил изменение шага или рабочих высот
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Инвентарь не RETAIN: после запуска PLC обе статичные кассеты пусты.
IF NOT xStartupInitialized THEN
	FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineSlots DO
		stInventory.aSlots[iInventoryIndex].xInPosition := FALSE;
		stInventory.aSlots[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		stInventory.aSlots[iInventoryIndex].uiProductType := UINT#0;
	END_FOR;
	xFaultContextCaptured := FALSE;
	xRobotInMagazineAtFault := FALSE;
	xRobotStopRequired := FALSE;
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
	xDisableRequest := FALSE;
	iTakeSlot := SINT#0;
	iPutSlot := SINT#0;
	iActiveSlot := SINT#0;
	xInventoryCommitted := FALSE;
	xTakeSlotCommitted := FALSE;
	xPutSlotCommitted := FALSE;
	xRobotCommandStarted := FALSE;
	xOperationSequenceComplete := FALSE;
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
rtApplyPitchX(CLK := xHmiApplyPitchX);
rtApplyPitchY(CLK := xHmiApplyPitchY);
rtApplySafeAbove(CLK := xHmiApplySafeAbove);
rtApplySafeInside(CLK := xHmiApplySafeInside);

IF (uiRows > UINT#0)
AND (uiColumns > UINT#0)
AND ((uiRows * uiColumns) <= SINT_TO_UINT(GVL_CELL_SETTINGS.MagazineSlots)) THEN
	iActiveSlotCount := UINT_TO_SINT(uiRows * uiColumns);
ELSE
	iActiveSlotCount := SINT#0;
END_IF;

// Ручная роботная команда принадлежит только выбранному магазину.
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

// Контекст запрещает редактирование и завершает отложенное отключение только
// после фактического выхода робота из конкретного магазина.
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

// Единственную кассету можно менять только у технологически выключенного
// магазина, когда робот не находится внутри и не владеет текущей операцией.
Status.xEditAllowed := ((Diag.eState = E_MAGAZINE_STATE.DISABLED)
		OR (Diag.eState = E_MAGAZINE_STATE.ERROR))
	AND NOT xRobotOwnsMagazine
	AND NOT xRobotInMagazineContext
	AND NOT xGlobalError;
Status.xPitchEditAllowed := Status.xEditAllowed AND xSharedGeometryEditAllowed;

// Шаг матрицы общий для двух магазинов, поэтому менять его разрешено только
// когда оба магазина выключены. Z-параметры принадлежат конкретному магазину.
IF rtApplyPitchX.Q
AND Status.xEditAllowed
AND xSharedGeometryEditAllowed
AND (lrHmiEditPitchX >= LREAL#1.0)
AND (lrHmiEditPitchX <= LREAL#5000.0) THEN
	lrPitchX := lrHmiEditPitchX;
END_IF;
IF rtApplyPitchY.Q
AND Status.xEditAllowed
AND xSharedGeometryEditAllowed
AND (lrHmiEditPitchY >= LREAL#1.0)
AND (lrHmiEditPitchY <= LREAL#5000.0) THEN
	lrPitchY := lrHmiEditPitchY;
END_IF;
IF rtApplySafeAbove.Q
AND Status.xEditAllowed
AND (lrHmiEditSafeAbove >= -LREAL#10000.0)
AND (lrHmiEditSafeAbove <= LREAL#10000.0) THEN
	lrSafeAbove := lrHmiEditSafeAbove;
END_IF;
IF rtApplySafeInside.Q
AND Status.xEditAllowed
AND (lrHmiEditSafeInside >= -LREAL#10000.0)
AND (lrHmiEditSafeInside <= LREAL#10000.0) THEN
	lrSafeInside := lrHmiEditSafeInside;
END_IF;

IF rtClear.Q AND Status.xEditAllowed THEN
	FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineSlots DO
		stInventory.aSlots[iInventoryIndex].xInPosition := FALSE;
		stInventory.aSlots[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		stInventory.aSlots[iInventoryIndex].uiProductType := UINT#0;
	END_FOR;
ELSIF rtFillBlanks.Q
AND (iActiveSlotCount > SINT#0)
AND Status.xEditAllowed THEN
	FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.MagazineSlots DO
		stInventory.aSlots[iInventoryIndex].xInPosition := iInventoryIndex <= iActiveSlotCount;
		IF iInventoryIndex <= iActiveSlotCount THEN
			stInventory.aSlots[iInventoryIndex].eDetailType := E_DETAIL_TYPE.BLANK;
			stInventory.aSlots[iInventoryIndex].uiProductType := auiSlotType[iInventoryIndex];
		ELSE
			stInventory.aSlots[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
			stInventory.aSlots[iInventoryIndex].uiProductType := UINT#0;
		END_IF;
	END_FOR;
ELSIF rtApplySlot.Q
AND Status.xEditAllowed
AND (uiHmiEditSlot >= UINT#1)
AND (uiHmiEditSlot <= SINT_TO_UINT(iActiveSlotCount))
AND (uiHmiEditDetailType <= UINT#2)
AND ((uiHmiEditDetailType = UINT#0)
	OR ((uiHmiEditProductType >= UINT#1) AND (uiHmiEditProductType <= uiTypeCount))) THEN
	iInventoryIndex := UINT_TO_SINT(uiHmiEditSlot);
	CASE uiHmiEditDetailType OF
		UINT#0:
			stInventory.aSlots[iInventoryIndex].xInPosition := FALSE;
			stInventory.aSlots[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
			stInventory.aSlots[iInventoryIndex].uiProductType := UINT#0;
		UINT#1:
			stInventory.aSlots[iInventoryIndex].xInPosition := TRUE;
			stInventory.aSlots[iInventoryIndex].eDetailType := E_DETAIL_TYPE.BLANK;
			stInventory.aSlots[iInventoryIndex].uiProductType := uiHmiEditProductType;
		UINT#2:
			stInventory.aSlots[iInventoryIndex].xInPosition := TRUE;
			stInventory.aSlots[iInventoryIndex].eDetailType := E_DETAIL_TYPE.DETAIL;
			stInventory.aSlots[iInventoryIndex].uiProductType := uiHmiEditProductType;
	END_CASE;
ELSIF rtCycleSlot.Q
AND Status.xEditAllowed
AND (uiHmiEditSlot >= UINT#1)
AND (uiHmiEditSlot <= SINT_TO_UINT(iActiveSlotCount)) THEN
	iInventoryIndex := UINT_TO_SINT(uiHmiEditSlot);
	IF NOT stInventory.aSlots[iInventoryIndex].xInPosition
	OR (stInventory.aSlots[iInventoryIndex].eDetailType = E_DETAIL_TYPE.NONE) THEN
		stInventory.aSlots[iInventoryIndex].xInPosition := TRUE;
		stInventory.aSlots[iInventoryIndex].eDetailType := E_DETAIL_TYPE.BLANK;
		stInventory.aSlots[iInventoryIndex].uiProductType := auiSlotType[iInventoryIndex];
	ELSE
		stInventory.aSlots[iInventoryIndex].xInPosition := FALSE;
		stInventory.aSlots[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		stInventory.aSlots[iInventoryIndex].uiProductType := UINT#0;
	END_IF;
END_IF;

IF iActiveSlotCount > SINT#0 THEN
	Status.iCurrentBlank := FindBlank(stDetail := stInventory.aSlots, iSlotCount := iActiveSlotCount);
	Status.iCurrentFreeSlot := FindFreeSlot(stDetail := stInventory.aSlots, iSlotCount := iActiveSlotCount);
ELSE
	Status.iCurrentBlank := SINT#0;
	Status.iCurrentFreeSlot := SINT#0;
END_IF;

Status.xOutBlank := Status.iCurrentBlank = SINT#0;
Status.xOutFreeSlot := Status.iCurrentFreeSlot = SINT#0;
Status.xCanTake := NOT Status.xOutBlank;
Status.xCanPut := NOT Status.xOutFreeSlot;
Status.xCanChange := Status.xCanTake AND Status.xCanPut;
Status.xCanEnable := FALSE;

IF stRobotStatus.xBlankAvailable AND NOT stRobotStatus.xDetailAvailable THEN
	Status.xCanEnable := Status.xCanPut;
ELSIF stRobotStatus.xDetailAvailable AND NOT stRobotStatus.xBlankAvailable THEN
	Status.xCanEnable := Status.xCanPut;
ELSIF NOT stRobotStatus.xBlankAvailable AND NOT stRobotStatus.xDetailAvailable THEN
	Status.xCanEnable := Status.xCanTake;
END_IF;

// Отсутствие заготовок не завершает магазин, пока из станков ещё можно вернуть
// готовую деталь в свободный слот соответствующего типа.
xMachineHasRelevantPart := FALSE;
xMachineHasDestination := FALSE;
FOR uiMachineIndex := UINT#1 TO UINT#3 DO
	IF astMachineStatus[uiMachineIndex].xEnabled
	AND NOT astMachineStatus[uiMachineIndex].xError
	AND (astMachineStatus[uiMachineIndex].xProcessing
		OR ((astMachineStatus[uiMachineIndex].ePartState = E_PART_STATE.LOADED)
			AND ((astMachineStatus[uiMachineIndex].ePartType = E_PART_TYPE.PART)
				OR (astMachineStatus[uiMachineIndex].ePartType = E_PART_TYPE.DETAIL)))) THEN
		xMachineHasRelevantPart := TRUE;
		uiMachineTypeIndex := auiMachineType[uiMachineIndex];
		IF (uiMachineTypeIndex >= UINT#1)
		AND (uiMachineTypeIndex <= UINT#3)
		AND (Status.stTypeStatus.aiFreeSlot[uiMachineTypeIndex] > SINT#0) THEN
			xMachineHasDestination := TRUE;
		END_IF;
	END_IF;
END_FOR;

IF NOT stRobotStatus.xBlankAvailable
AND NOT stRobotStatus.xDetailAvailable
AND xMachineHasDestination THEN
	Status.xCanEnable := TRUE;
END_IF;

Status.xEnableCheckRobotReady := xRobotCanWorkWithMagazine;
Status.xEnableCheckRobotReleased := NOT xRobotInMagazineContext;
Status.xEnableCheckNoError := NOT xGlobalError
	AND NOT stRobotStatus.xError
	AND (Diag.eState <> E_MAGAZINE_STATE.ERROR)
	AND (Error.dwErrorActive = DWORD#0);
Status.xEnableCheckContent := Status.xCanEnable;
Status.xEnableCheckGeometry := (iActiveSlotCount > SINT#0)
	AND (lrPitchX >= LREAL#1.0)
	AND (lrPitchX <= LREAL#5000.0)
	AND (lrPitchY >= LREAL#1.0)
	AND (lrPitchY <= LREAL#5000.0)
	AND (lrSafeAbove >= -LREAL#10000.0)
	AND (lrSafeAbove <= LREAL#10000.0)
	AND (lrSafeInside >= -LREAL#10000.0)
	AND (lrSafeInside <= LREAL#10000.0);
Status.xEnableSequenceAllowed := (Diag.eState = E_MAGAZINE_STATE.DISABLED)
	AND Status.xEnableCheckRobotReady
	AND Status.xEnableCheckRobotReleased
	AND Status.xEnableCheckNoError
	AND Status.xEnableCheckContent
	AND Status.xEnableCheckGeometry;

// Finished остаётся прежним по смыслу, но теперь оценивает единственную кассету.
xAllSlotsDetails := iActiveSlotCount > SINT#0;
IF xAllSlotsDetails THEN
	FOR uiIndex := UINT#1 TO SINT_TO_UINT(iActiveSlotCount) DO
		IF NOT stInventory.aSlots[UINT_TO_SINT(uiIndex)].xInPosition
		OR (stInventory.aSlots[UINT_TO_SINT(uiIndex)].eDetailType <> E_DETAIL_TYPE.DETAIL) THEN
			xAllSlotsDetails := FALSE;
		END_IF;
	END_FOR;
END_IF;
xNoBlankNoMachinePart := Status.xOutBlank AND NOT xMachineHasRelevantPart;
xNoBlankNoDestination := Status.xOutBlank AND NOT xMachineHasDestination;
xFinishedCondition :=
	(NOT stRobotStatus.xBlankAvailable AND NOT stRobotStatus.xDetailAvailable)
	AND (xAllSlotsDetails OR xNoBlankNoMachinePart OR xNoBlankNoDestination);

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
	ELSIF NOT Status.xEnableCheckRobotReady
	OR NOT Status.xEnableCheckRobotReleased THEN
		Diag.stWarning.uiCode := WRN_ENABLE_ROBOT_NOT_READY;
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
AND NOT Status.xEditAllowed THEN
	Diag.stWarning.uiCode := WRN_FILL_ENABLED;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
ELSIF rtClear.Q
AND NOT Status.xEditAllowed THEN
	Diag.stWarning.uiCode := WRN_CLEAR_ENABLED;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
ELSIF (rtApplyPitchX.Q
	AND (NOT Status.xEditAllowed
		OR NOT xSharedGeometryEditAllowed
		OR (lrHmiEditPitchX < LREAL#1.0)
		OR (lrHmiEditPitchX > LREAL#5000.0)))
OR (rtApplyPitchY.Q
	AND (NOT Status.xEditAllowed
		OR NOT xSharedGeometryEditAllowed
		OR (lrHmiEditPitchY < LREAL#1.0)
		OR (lrHmiEditPitchY > LREAL#5000.0)))
OR (rtApplySafeAbove.Q
	AND (NOT Status.xEditAllowed
		OR (lrHmiEditSafeAbove < -LREAL#10000.0)
		OR (lrHmiEditSafeAbove > LREAL#10000.0)))
OR (rtApplySafeInside.Q
	AND (NOT Status.xEditAllowed
		OR (lrHmiEditSafeInside < -LREAL#10000.0)
		OR (lrHmiEditSafeInside > LREAL#10000.0))) THEN
	Diag.stWarning.uiCode := WRN_GEOMETRY_EDIT_REJECTED;
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
	OR NOT Status.xEditAllowed) THEN
	Diag.stWarning.uiCode := WRN_EDIT_REJECTED;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
ELSIF rtCycleSlot.Q
AND ((uiHmiEditSlot < UINT#1)
	OR (uiHmiEditSlot > SINT_TO_UINT(iActiveSlotCount))
	OR NOT Status.xEditAllowed) THEN
	Diag.stWarning.uiCode := WRN_EDIT_REJECTED;
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
		AND NOT xRobotInMagazineContext THEN
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
		xTakeSlotHasBlank := stInventory.aSlots[iTakeSlot].xInPosition
			AND (stInventory.aSlots[iTakeSlot].eDetailType = E_DETAIL_TYPE.BLANK)
			AND (stInventory.aSlots[iTakeSlot].uiProductType >= UINT#1)
			AND (stInventory.aSlots[iTakeSlot].uiProductType <= uiTypeCount);
		END_IF;

	IF xPutSlotValid THEN
		xPutSlotEmpty := NOT stInventory.aSlots[iPutSlot].xInPosition;
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
						stInventory.aSlots[iTakeSlot].xInPosition := FALSE;
						stInventory.aSlots[iTakeSlot].eDetailType := E_DETAIL_TYPE.NONE;
						stInventory.aSlots[iTakeSlot].uiProductType := UINT#0;
						xTakeSlotCommitted := TRUE;
					END_IF;

				E_MAGAZINE_OPERATION.PUT:
					IF (uiStep = UINT#3) AND NOT xPutSlotCommitted THEN
						stInventory.aSlots[iPutSlot].xInPosition := TRUE;
						stInventory.aSlots[iPutSlot].eDetailType := E_DETAIL_TYPE.DETAIL;
						stInventory.aSlots[iPutSlot].uiProductType := uiPutProductType;
						udiProducedPartsTotal := udiProducedPartsTotal + UDINT#1;
						xPutSlotCommitted := TRUE;
					END_IF;

				E_MAGAZINE_OPERATION.CHANGE:
					IF (uiStep = UINT#3) AND NOT xPutSlotCommitted THEN
						stInventory.aSlots[iPutSlot].xInPosition := TRUE;
						stInventory.aSlots[iPutSlot].eDetailType := E_DETAIL_TYPE.DETAIL;
						stInventory.aSlots[iPutSlot].uiProductType := uiPutProductType;
						udiProducedPartsTotal := udiProducedPartsTotal + UDINT#1;
						xPutSlotCommitted := TRUE;
					ELSIF (uiStep = UINT#8) AND NOT xTakeSlotCommitted THEN
						stInventory.aSlots[iTakeSlot].xInPosition := FALSE;
						stInventory.aSlots[iTakeSlot].eDetailType := E_DETAIL_TYPE.NONE;
						stInventory.aSlots[iTakeSlot].uiProductType := UINT#0;
						xTakeSlotCommitted := TRUE;
					END_IF;

				E_MAGAZINE_OPERATION.RETURN_BLANK:
					IF (uiStep = UINT#3) AND NOT xPutSlotCommitted THEN
						stInventory.aSlots[iPutSlot].xInPosition := TRUE;
						stInventory.aSlots[iPutSlot].eDetailType := E_DETAIL_TYPE.BLANK;
						stInventory.aSlots[iPutSlot].uiProductType := uiPutProductType;
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
						stInventory.aSlots[iTakeSlot].xInPosition := FALSE;
						stInventory.aSlots[iTakeSlot].eDetailType := E_DETAIL_TYPE.NONE;
						stInventory.aSlots[iTakeSlot].uiProductType := UINT#0;
						xTakeSlotCommitted := TRUE;
					END_IF;
				E_MAGAZINE_OPERATION.PUT:
					IF NOT xPutSlotCommitted THEN
						stInventory.aSlots[iPutSlot].xInPosition := TRUE;
						stInventory.aSlots[iPutSlot].eDetailType := E_DETAIL_TYPE.DETAIL;
						stInventory.aSlots[iPutSlot].uiProductType := uiPutProductType;
						udiProducedPartsTotal := udiProducedPartsTotal + UDINT#1;
						xPutSlotCommitted := TRUE;
					END_IF;
				E_MAGAZINE_OPERATION.CHANGE:
					IF NOT xPutSlotCommitted THEN
						stInventory.aSlots[iPutSlot].xInPosition := TRUE;
						stInventory.aSlots[iPutSlot].eDetailType := E_DETAIL_TYPE.DETAIL;
						stInventory.aSlots[iPutSlot].uiProductType := uiPutProductType;
						udiProducedPartsTotal := udiProducedPartsTotal + UDINT#1;
						xPutSlotCommitted := TRUE;
					END_IF;
					IF NOT xTakeSlotCommitted THEN
						stInventory.aSlots[iTakeSlot].xInPosition := FALSE;
						stInventory.aSlots[iTakeSlot].eDetailType := E_DETAIL_TYPE.NONE;
						stInventory.aSlots[iTakeSlot].uiProductType := UINT#0;
						xTakeSlotCommitted := TRUE;
					END_IF;
				E_MAGAZINE_OPERATION.RETURN_BLANK:
					IF NOT xPutSlotCommitted THEN
						stInventory.aSlots[iPutSlot].xInPosition := TRUE;
						stInventory.aSlots[iPutSlot].eDetailType := E_DETAIL_TYPE.BLANK;
						stInventory.aSlots[iPutSlot].uiProductType := uiPutProductType;
						xPutSlotCommitted := TRUE;
					END_IF;
			END_CASE;
			xInventoryCommitted := TRUE;
		END_IF;
		IF NOT xExecuteRequest THEN
			eActualOperation := E_MAGAZINE_OPERATION.NONE;
			IF xDisableRequest
			AND NOT xRobotInMagazineContext THEN
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
IF (Diag.eState = E_MAGAZINE_STATE.ERROR)
AND NOT xFaultContextCaptured THEN
	xRobotInMagazineAtFault := xRobotInMagazineContext;
	xFaultContextCaptured := TRUE;
ELSIF Diag.eState <> E_MAGAZINE_STATE.ERROR THEN
	xRobotInMagazineAtFault := FALSE;
	xFaultContextCaptured := FALSE;
END_IF;

xRobotStopRequired := NOT xGlobalError
	AND (
		((Error.dwErrorActive AND ERR_ROBOT) <> DWORD#0)
		OR (((Error.dwErrorActive AND MASK_EQUIPMENT_ERROR) <> DWORD#0)
			AND xRobotInMagazineAtFault)
	);

// Физический Stop нужен только занятому роботу. При неподвижном роботе внутри
// магазина FB_ROBOT получит зависимую ошибку без пустой команды остановки.
IF (Diag.eState = E_MAGAZINE_STATE.ERROR)
AND xRobotStopRequired
AND stRobotStatus.xBusy THEN
	Command := stActiveRobotCommand;
	Command.xExecute := TRUE;
	Command.xStop := TRUE;
END_IF;

// ERROR технологически отключает магазин немедленно, но причина остаётся
// защёлкнутой до разрешённого Reset.
Status.xEnabled := (Diag.eState <> E_MAGAZINE_STATE.DISABLED)
	AND (Diag.eState <> E_MAGAZINE_STATE.ERROR);
Status.xDisablePending := xDisableRequest AND Status.xEnabled;
Status.xPowerAllowed := Status.xEnabled OR Status.xEnableSequenceAllowed;
Status.xFillAllowed := (iActiveSlotCount > SINT#0) AND Status.xEditAllowed;
Status.xClearAllowed := Status.xEditAllowed;
Status.xReady := (Diag.eState = E_MAGAZINE_STATE.IDLE)
	AND xRobotCanWorkWithMagazine
	AND (Error.dwErrorActive = DWORD#0);
Status.xBusy := (Diag.eState <> E_MAGAZINE_STATE.DISABLED)
	AND (Diag.eState <> E_MAGAZINE_STATE.IDLE)
	AND (Diag.eState <> E_MAGAZINE_STATE.DONE)
	AND (Diag.eState <> E_MAGAZINE_STATE.ERROR);
Status.xDone := Diag.eState = E_MAGAZINE_STATE.DONE;
Status.xError := Diag.eState = E_MAGAZINE_STATE.ERROR;
Status.xRobotStopRequired := xRobotStopRequired;
Status.udiProducedPartsTotal := udiProducedPartsTotal;
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

// Сводка публикуется владельцем содержимого после всех изменений слотов.
UpdateTypeStatus(stMagazineInventory := stInventory);
