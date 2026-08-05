FUNCTION_BLOCK FB_MAGAZINE
VAR_INPUT
	stRobotStatus     : ST_ROBOT_STATUS; // Текущие статусы робота
	stMagazineCommand : ST_MAGAZINE_COMMAND; // Команда магазина от автоматической логики
	stHmiCommand      : ST_ROBOT_COMMAND; // Ручная команда магазина с HMI
	xManual           : BOOL; // Разрешение ручного управления
	xReset            : BOOL; // Сброс ошибок магазина
	xGlobalError      : BOOL; // Глобальная ошибка ячейки
	xMode             : BOOL; // Режим робота: TRUE — Modbus, FALSE — SoftMotion
	xHmiEnable        : BOOL; // Импульс включения магазина с HMI
	xHmiDisable       : BOOL; // Импульс отключения магазина с HMI
	xHmiFillBlanks    : BOOL; // Заполнить все активные слоты матрицы заготовками
	xHmiClear         : BOOL; // Полностью очистить содержимое магазина
	xHmiCycleSlot     : BOOL; // Переключить содержимое выбранного слота
	uiHmiEditSlot     : UINT; // Номер слота для ручного редактирования
	uiRows            : UINT; // Число строк матрицы магазина
	uiColumns         : UINT; // Число столбцов матрицы магазина
	lrPitchX          : LREAL; // Шаг между слотами по оси X
	lrPitchY          : LREAL; // Шаг между слотами по оси Y
	lrSafeZ_1           : LREAL; // Безопасная координата по оси Z
	lrSafeZ_2     : LREAL; // Безопасная координата по оси Z (при смене детали на заготовку)
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
	stDetail : ARRAY [1..GVL_CELL_SETTINGS.NumberDetail] OF ST_DETAIL; // Содержимое слотов магазина
	stPoint  : ARRAY [0..GVL_POINT.iPointNumber] OF ST_POINT; // Глобальная таблица точек робота
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
	rtReset            : R_TRIG; // Фронт команды сброса магазина

	xExecuteRequest    : BOOL; // Активный запрос выполнения операции
	xResetRequest      : BOOL; // Активный запрос сброса
	xStopRequest       : BOOL; // Активный запрос остановки
	xManualCommand     : BOOL; // Команда получена из ручного интерфейса
	xDisableRequest    : BOOL; // Сохранённый запрос отключения после текущей операции
	xRobotInMagazineContext : BOOL; // Робот находится в рабочей зоне магазина
	xRobotResetDependencyReady : BOOL; // Каскадная ошибка робота может быть сброшена тем же импульсом

	iActiveSlotCount   : SINT; // Число активных слотов выбранной матрицы
	iInventoryIndex    : SINT; // Индекс изменения содержимого магазина
	iTakeSlot          : SINT; // Слот выбранной заготовки
	iPutSlot           : SINT; // Выбранный свободный слот
	uiStep             : UINT; // Шаг последовательности робота
	uiIndex            : UINT; // Индекс слота для расчёта координат
	uiRow              : UINT; // Строка выбранного слота
	uiColumn           : UINT; // Столбец выбранного слота

	stTakePoint          : ST_POINT; // Рассчитанная рабочая точка взятия
	stPutPoint           : ST_POINT; // Рассчитанная рабочая точка укладки
	stActiveRobotCommand : ST_ROBOT_COMMAND; // Команда роботу текущего шага
	xFinishedCondition   : BOOL; // Текущее содержимое не позволяет продолжить цикл
	fbFaultInjector      : FB_MAGAZINE_FAULT_INJECTOR; // Безопасный сценарий ошибки до движения
	xFaultAllowed        : BOOL; // Владелец разрешает синтетическую проверку
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
END_VAR

// --- BEGIN IMPLEMENTATION ---

rtFillBlanks(CLK := xHmiFillBlanks);
rtClear(CLK := xHmiClear);
rtCycleSlot(CLK := xHmiCycleSlot);

// Активный размер матрицы может быть меньше полного массива деталей.
IF (uiRows > 0)
AND (uiColumns > 0)
AND ((uiRows * uiColumns) <= SINT_TO_UINT(GVL_CELL_SETTINGS.NumberDetail)) THEN
	iActiveSlotCount := UINT_TO_SINT(uiRows * uiColumns);
ELSE
	iActiveSlotCount := 0;
END_IF;

// Содержимое магазина изменяется только в отключенном состоянии.
IF Diag.eState = E_MAGAZINE_STATE.DISABLED THEN
	IF rtClear.Q THEN
		FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.NumberDetail DO
			stDetail[iInventoryIndex].xInPosition := FALSE;
			stDetail[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		END_FOR;
	ELSIF rtFillBlanks.Q
	AND (iActiveSlotCount > 0) THEN
		FOR iInventoryIndex := 1 TO GVL_CELL_SETTINGS.NumberDetail DO
			stDetail[iInventoryIndex].xInPosition := iInventoryIndex <= iActiveSlotCount;
			IF iInventoryIndex <= iActiveSlotCount THEN
				stDetail[iInventoryIndex].eDetailType := E_DETAIL_TYPE.BLANK;
			ELSE
				stDetail[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
			END_IF;
		END_FOR;
	ELSIF rtCycleSlot.Q
	AND (uiHmiEditSlot >= 1)
	AND (uiHmiEditSlot <= SINT_TO_UINT(iActiveSlotCount)) THEN
		iInventoryIndex := UINT_TO_SINT(uiHmiEditSlot);
		IF NOT stDetail[iInventoryIndex].xInPosition
		OR (stDetail[iInventoryIndex].eDetailType = E_DETAIL_TYPE.NONE) THEN
			stDetail[iInventoryIndex].xInPosition := TRUE;
			stDetail[iInventoryIndex].eDetailType := E_DETAIL_TYPE.BLANK;
		ELSIF stDetail[iInventoryIndex].eDetailType = E_DETAIL_TYPE.BLANK THEN
			stDetail[iInventoryIndex].xInPosition := TRUE;
			stDetail[iInventoryIndex].eDetailType := E_DETAIL_TYPE.DETAIL;
		ELSE
			stDetail[iInventoryIndex].xInPosition := FALSE;
			stDetail[iInventoryIndex].eDetailType := E_DETAIL_TYPE.NONE;
		END_IF;
	END_IF;
END_IF;

IF iActiveSlotCount > 0 THEN
	Status.iCurrentBlank := FindBlank(
		stDetail := stDetail,
		iSlotCount := iActiveSlotCount
	);
	Status.iCurrentFreeSlot := FindFreeSlot(
		stDetail := stDetail,
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

xFinishedCondition :=
	(NOT stRobotStatus.xBlankAvailable
		AND NOT stRobotStatus.xDetailAvailable
		AND NOT Status.xCanTake)
	OR (stRobotStatus.xBlankAvailable
		AND NOT stRobotStatus.xDetailAvailable
		AND NOT Status.xCanPut)
	OR (NOT stRobotStatus.xBlankAvailable
		AND stRobotStatus.xDetailAvailable
		AND NOT Status.xCanPut);

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
AND stRobotStatus.xDetailAvailable THEN
	eGrantedOperation := E_MAGAZINE_OPERATION.CHANGE;
END_IF;

// Команды магазина с HMI принимаются только в ручном режиме.
xManualCommand := xManual AND (
	(stHmiCommand.eSetPoint = E_POINT_NAME.MAGAZINE_TAKE_DETAIL)
	OR (stHmiCommand.eSetPoint = E_POINT_NAME.MAGAZINE_PUT_DETAIL)
	OR (stHmiCommand.eSetPoint = E_POINT_NAME.MAGAZINE_CHANGE_DETAIL)
);

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

xRobotInMagazineContext := (Diag.eState = E_MAGAZINE_STATE.ROBOT_COMMAND)
	OR (Diag.eState = E_MAGAZINE_STATE.RELEASE_ROBOT_COMMAND)
	OR (stRobotStatus.eCurrentPoint = E_POINT_NAME.MAGAZINE_DETAIL)
	OR (stRobotStatus.eCurrentPoint = E_POINT_NAME.MAGAZINE_TAKE_DETAIL)
	OR (stRobotStatus.eCurrentPoint = E_POINT_NAME.MAGAZINE_PUT_DETAIL)
	OR (stRobotStatus.eCurrentPoint = E_POINT_NAME.MAGAZINE_CHANGE_DETAIL);

xResetRequest := xReset;
rtReset(CLK := xResetRequest);

xRobotResetDependencyReady := (((Error.dwErrorActive AND ERR_ROBOT) = DWORD#0)
		AND NOT xRobotInMagazineContext)
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
AND (xGlobalError OR NOT Status.xCanEnable) THEN
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
AND (Diag.eState <> E_MAGAZINE_STATE.DISABLED) THEN
	Diag.stWarning.uiCode := WRN_FILL_ENABLED;
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
ELSIF rtClear.Q
AND (Diag.eState <> E_MAGAZINE_STATE.DISABLED) THEN
	Diag.stWarning.uiCode := WRN_CLEAR_ENABLED;
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
Command.iTakeSlot := 0;
Command.iPutSlot := 0;

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
		AND Status.xCanEnable
		AND NOT xGlobalError THEN
			Diag.eState := E_MAGAZINE_STATE.IDLE;
		END_IF;

	E_MAGAZINE_STATE.IDLE:
		uiStep := 0;
		eActualOperation := E_MAGAZINE_OPERATION.NONE;

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
		ELSIF xDisableRequest THEN
			Diag.eState := E_MAGAZINE_STATE.DISABLED;
		ELSIF xGlobalError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_GLOBAL_STOP;
			Diag.eState := E_MAGAZINE_STATE.ERROR;
		ELSIF rtExecute.Q THEN
			IF xManualCommand THEN
				CASE stHmiCommand.eSetPoint OF
					E_POINT_NAME.MAGAZINE_TAKE_DETAIL:
						eActualOperation := E_MAGAZINE_OPERATION.TAKE;
					E_POINT_NAME.MAGAZINE_PUT_DETAIL:
						eActualOperation := E_MAGAZINE_OPERATION.PUT;
					E_POINT_NAME.MAGAZINE_CHANGE_DETAIL:
						eActualOperation := E_MAGAZINE_OPERATION.CHANGE;
				ELSE
					eActualOperation := E_MAGAZINE_OPERATION.NONE;
				END_CASE;
				iTakeSlot := stHmiCommand.iTakeSlot;
				iPutSlot := stHmiCommand.iPutSlot;
			ELSE
				eActualOperation := eGrantedOperation;
				iTakeSlot := Status.iCurrentBlank;
				iPutSlot := Status.iCurrentFreeSlot;
			END_IF;

			Diag.eState := E_MAGAZINE_STATE.CHOOSE;
		END_IF;

	E_MAGAZINE_STATE.CHOOSE:
		IF fbFaultInjector.xGeometry
		OR (iActiveSlotCount = 0)
		OR (NOT xMode AND (
			((uiColumns > 1) AND (lrPitchX = 0.0))
			OR ((uiRows > 1) AND (lrPitchY = 0.0))
			OR (lrSafeZ_1 = stPoint[E_POINT_NAME.MAGAZINE_DETAIL].Z)
			OR (stPoint[E_POINT_NAME.MAGAZINE_DETAIL].SpeedFactor <= 0.1)
			OR (stPoint[E_POINT_NAME.MAGAZINE_DETAIL].SpeedFactor > 1.0)
		)) THEN
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
		AND ((iTakeSlot < 1) OR (iTakeSlot > iActiveSlotCount)) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_NO_BLANK OR ERR_INVALID_SLOT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF ((eActualOperation = E_MAGAZINE_OPERATION.PUT)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE))
		AND ((iPutSlot < 1) OR (iPutSlot > iActiveSlotCount)) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_NO_FREE_SLOT OR ERR_INVALID_SLOT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF ((eActualOperation = E_MAGAZINE_OPERATION.TAKE)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE))
		AND (NOT stDetail[iTakeSlot].xInPosition
			OR (stDetail[iTakeSlot].eDetailType <> E_DETAIL_TYPE.BLANK)) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_SLOT_CONTENT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF ((eActualOperation = E_MAGAZINE_OPERATION.PUT)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE))
		AND stDetail[iPutSlot].xInPosition THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_SLOT_CONTENT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF (eActualOperation = E_MAGAZINE_OPERATION.TAKE)
		AND (stRobotStatus.xBlankAvailable OR stRobotStatus.xDetailAvailable) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_WRONG_OPERATION;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF ((eActualOperation = E_MAGAZINE_OPERATION.PUT)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE))
		AND NOT stRobotStatus.xDetailAvailable THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_WRONG_OPERATION;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSE
			IF (eActualOperation = E_MAGAZINE_OPERATION.TAKE)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE) THEN
				uiIndex := SINT_TO_UINT(iTakeSlot - 1);
				uiColumn := uiIndex MOD uiColumns;
				uiRow := uiIndex / uiColumns;
				stTakePoint := stPoint[E_POINT_NAME.MAGAZINE_DETAIL];
				stTakePoint.X := stTakePoint.X + UINT_TO_LREAL(uiColumn) * lrPitchX;
				stTakePoint.Y := stTakePoint.Y + UINT_TO_LREAL(uiRow) * lrPitchY;
			END_IF;

			IF (eActualOperation = E_MAGAZINE_OPERATION.PUT)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE) THEN
				uiIndex := SINT_TO_UINT(iPutSlot - 1);
				uiColumn := uiIndex MOD uiColumns;
				uiRow := uiIndex / uiColumns;
				stPutPoint := stPoint[E_POINT_NAME.MAGAZINE_DETAIL];
				stPutPoint.X := stPutPoint.X + UINT_TO_LREAL(uiColumn) * lrPitchX;
				stPutPoint.Y := stPutPoint.Y + UINT_TO_LREAL(uiRow) * lrPitchY;
			END_IF;

			uiStep := 0;
			Diag.eState := E_MAGAZINE_STATE.PREPARE_STEP;
		END_IF;

	E_MAGAZINE_STATE.PREPARE_STEP:
		stActiveRobotCommand.xExecute := FALSE;
		stActiveRobotCommand.xStop := FALSE;
		stActiveRobotCommand.xReset := xResetRequest;
		stActiveRobotCommand.eAction := E_ROBOT_ACTION.NONE;
		stActiveRobotCommand.eSetPoint := E_POINT_NAME.NONE;
		stActiveRobotCommand.iTakeSlot := iTakeSlot;
		stActiveRobotCommand.iPutSlot := iPutSlot;

		IF xMode THEN
			stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
			CASE eActualOperation OF
				E_MAGAZINE_OPERATION.TAKE:
					stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_TAKE_DETAIL;
				E_MAGAZINE_OPERATION.PUT:
					stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
				E_MAGAZINE_OPERATION.CHANGE:
					stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_CHANGE_DETAIL;
			END_CASE;
			Diag.eState := E_MAGAZINE_STATE.ROBOT_COMMAND;

		ELSE
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
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL] := stTakePoint;
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL].Z := lrSafeZ_1;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_TAKE_DETAIL;
						2:
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL] := stTakePoint;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_TAKE_DETAIL;
						3: stActiveRobotCommand.eAction := E_ROBOT_ACTION.CLAMP_1;
						4:
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL] := stTakePoint;
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL].Z := lrSafeZ_1;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_TAKE_DETAIL;
					ELSE
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
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL] := stPutPoint;
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL].Z := lrSafeZ_1;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
						2:
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL] := stPutPoint;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
						3: stActiveRobotCommand.eAction := E_ROBOT_ACTION.UNCLAMP_2;
						4:
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL] := stPutPoint;
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL].Z := lrSafeZ_1;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
					ELSE
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
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL] := stPutPoint;
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL].Z := lrSafeZ_1;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
						2:
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL] := stPutPoint;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
						3: stActiveRobotCommand.eAction := E_ROBOT_ACTION.UNCLAMP_2;
						4:
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL] := stPutPoint;
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL].Z := lrSafeZ_2;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
						5:
							IF stRobotStatus.xRotatedToDetail THEN
								Diag.eState := E_MAGAZINE_STATE.NEXT;
							ELSE
								stActiveRobotCommand.eAction := E_ROBOT_ACTION.ROTATE_TO_DETAIL;
							END_IF;
						6:
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL] := stTakePoint;
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL].Z := lrSafeZ_2;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_TAKE_DETAIL;
						7:
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL] := stTakePoint;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_TAKE_DETAIL;
						8: stActiveRobotCommand.eAction := E_ROBOT_ACTION.CLAMP_1;
						9:
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL] := stTakePoint;
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL].Z := lrSafeZ_1;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_TAKE_DETAIL;
					ELSE
						Diag.eState := E_MAGAZINE_STATE.DONE;
					END_CASE;
			END_CASE;

			IF Diag.eState = E_MAGAZINE_STATE.PREPARE_STEP THEN
				Diag.eState := E_MAGAZINE_STATE.ROBOT_COMMAND;
			END_IF;
		END_IF;

	E_MAGAZINE_STATE.ROBOT_COMMAND:
		Command := stActiveRobotCommand;
		Command.xExecute := TRUE;

		IF xStopRequest OR xGlobalError THEN
			Command.xStop := TRUE;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_GLOBAL_STOP;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF stRobotStatus.xError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF stRobotStatus.xDone THEN
			IF xMode THEN
				IF (eActualOperation = E_MAGAZINE_OPERATION.PUT)
				OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE) THEN
					stDetail[iPutSlot].xInPosition := TRUE;
					stDetail[iPutSlot].eDetailType := E_DETAIL_TYPE.DETAIL;
				END_IF;
				IF (eActualOperation = E_MAGAZINE_OPERATION.TAKE)
				OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE) THEN
					stDetail[iTakeSlot].xInPosition := FALSE;
					stDetail[iTakeSlot].eDetailType := E_DETAIL_TYPE.NONE;
				END_IF;
			ELSE
				IF (uiStep = 3)
				AND ((eActualOperation = E_MAGAZINE_OPERATION.PUT)
					OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE)) THEN
					stDetail[iPutSlot].xInPosition := TRUE;
					stDetail[iPutSlot].eDetailType := E_DETAIL_TYPE.DETAIL;
				END_IF;
				IF ((uiStep = 3) AND (eActualOperation = E_MAGAZINE_OPERATION.TAKE))
				OR ((uiStep = 8) AND (eActualOperation = E_MAGAZINE_OPERATION.CHANGE)) THEN
					stDetail[iTakeSlot].xInPosition := FALSE;
					stDetail[iTakeSlot].eDetailType := E_DETAIL_TYPE.NONE;
				END_IF;
			END_IF;

			Diag.eState := E_MAGAZINE_STATE.RELEASE_ROBOT_COMMAND;
		END_IF;

	E_MAGAZINE_STATE.RELEASE_ROBOT_COMMAND:
		IF stRobotStatus.xError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;
		ELSIF NOT stRobotStatus.xBusy AND NOT stRobotStatus.xDone THEN
			IF xMode THEN
				Diag.eState := E_MAGAZINE_STATE.DONE;
			ELSE
				Diag.eState := E_MAGAZINE_STATE.NEXT;
			END_IF;
		END_IF;

	E_MAGAZINE_STATE.NEXT:
		uiStep := uiStep + 1;
		Diag.eState := E_MAGAZINE_STATE.PREPARE_STEP;

	E_MAGAZINE_STATE.DONE:
		IF NOT xExecuteRequest THEN
			eActualOperation := E_MAGAZINE_OPERATION.NONE;
			IF xDisableRequest THEN
				Diag.eState := E_MAGAZINE_STATE.DISABLED;
			ELSE
				Diag.eState := E_MAGAZINE_STATE.IDLE;
			END_IF;
		END_IF;

	E_MAGAZINE_STATE.ERROR:
		IF stRobotStatus.xBusy THEN
			Command := stActiveRobotCommand;
			Command.xExecute := TRUE;
			Command.xStop := TRUE;
		END_IF;

		IF xResetRequest
		AND NOT xExecuteRequest
		AND NOT xGlobalError
		AND xRobotResetDependencyReady THEN
			Error.dwErrorLast := Error.dwErrorActive;
			Error.dwErrorActive := DWORD#0;
			eActualOperation := E_MAGAZINE_OPERATION.NONE;
			Diag.eState := E_MAGAZINE_STATE.DISABLED;
		END_IF;
END_CASE;

Status.xEnabled := Diag.eState <> E_MAGAZINE_STATE.DISABLED;
Status.xDisablePending := xDisableRequest AND Status.xEnabled;
Status.xPowerAllowed := (Status.xEnabled AND NOT xDisableRequest)
	OR ((Diag.eState = E_MAGAZINE_STATE.DISABLED)
		AND Status.xCanEnable
		AND NOT xGlobalError);
Status.xFillAllowed := (Diag.eState = E_MAGAZINE_STATE.DISABLED)
	AND (iActiveSlotCount > 0);
Status.xClearAllowed := Diag.eState = E_MAGAZINE_STATE.DISABLED;
Status.xReady := Diag.eState = E_MAGAZINE_STATE.IDLE;
Status.xBusy := (Diag.eState <> E_MAGAZINE_STATE.DISABLED)
	AND (Diag.eState <> E_MAGAZINE_STATE.IDLE)
	AND (Diag.eState <> E_MAGAZINE_STATE.DONE)
	AND (Diag.eState <> E_MAGAZINE_STATE.ERROR);
Status.xDone := Diag.eState = E_MAGAZINE_STATE.DONE;
Status.xError := Diag.eState = E_MAGAZINE_STATE.ERROR;
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
	AND NOT xGlobalError
	AND xRobotResetDependencyReady;
