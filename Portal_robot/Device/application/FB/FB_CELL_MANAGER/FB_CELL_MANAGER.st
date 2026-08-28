FUNCTION_BLOCK FB_CELL_MANAGER
VAR_INPUT
	xStart            : BOOL; // Импульс запуска цикла или отмены остановки
	xStop             : BOOL; // Импульс контролируемой остановки
	xResetRequest     : BOOL; // Необработанный запрос сброса от HMI
	xReset            : BOOL; // Общий сброс владельцев ошибок
	xOperatorChoice   : BOOL; // Импульс ответа активному предпусковому опросу
	xOperatorCancel   : BOOL; // Импульс отмены предпускового опроса
	uiOperatorChoice  : UINT; // Выбранное содержимое, тип продукции или станок
	xManual           : BOOL; // Ручной режим ячейки
	xGlobalError      : BOOL; // Глобальная ошибка ячейки
	xDrivesReady      : BOOL; // Приводы готовы
	xMotionBusy       : BOOL; // Оси ещё движутся
	xRobotInterfaceReady : BOOL; // Выбранный интерфейс робота готов к работе
	lrRobotActualX    : LREAL; // Фактическая координата робота X
	lrRobotActualY    : LREAL; // Фактическая координата робота Y
	lrRobotActualZ    : LREAL; // Фактическая координата робота Z
	stSafetyHomePoint : ST_POINT; // Настроенная безопасная точка повторного запуска
	lrSafetyHomeToleranceX : LREAL; // Допуск HOME_SAFETY по X
	lrSafetyHomeToleranceY : LREAL; // Допуск HOME_SAFETY по Y
	lrSafetyHomeToleranceZ : LREAL; // Допуск HOME_SAFETY по Z
	lrStoppedPoseTolerance : LREAL; // Допуск контроля позы после штатной остановки
	Config            : ST_MULTI_TYPE_CONFIG; // Активная конфигурация типов
	xConfigurationValid : BOOL; // Конфигурация прошла проверку
	stRobotStatus     : ST_ROBOT_STATUS; // Состояние робота
	astMagazineStatus : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF ST_MAGAZINE_STATUS;
	astMachineStatus  : ARRAY [1..3] OF ST_MACHINE_PUBLIC; // Состояния станков
	astMachineDiag    : ARRAY [1..3] OF ST_MACHINE_DIAG; // Автоматы станков
	FaultRequest      : ST_CELL_FAULT_REQUEST; // Диагностическая инъекция
END_VAR
VAR_OUTPUT
	Command            : ST_CELL_COMMAND; // Команды существующим блокам ячейки
	Status             : ST_CELL_STATUS; // Общий контракт состояния ячейки
	Diag               : ST_CELL_DIAG; // Общий контракт диагностики ячейки
	Error              : ST_CELL_ERRORS; // Общий контракт ошибок ячейки
	CycleStatus        : ST_CELL_CYCLE_STATUS; // Расширенная диагностика универсального цикла
	FaultStatus        : ST_FAULT_INJECTION_STATUS; // Инъекция логической ошибки ячейки
END_VAR
VAR
	eState               : E_CELL_MANAGER_STATE := E_CELL_MANAGER_STATE.IDLE; // Состояние универсального автомата
	eMagazineOperation   : E_MAGAZINE_OPERATION; // Выполняемая операция магазина
	eMachineOperation    : E_MACHINE_OPERATION; // Зафиксированная операция станка
	xRunning             : BOOL; // Защёлка автоматического цикла
	xStopRequested       : BOOL; // Остановка после безопасного шага
	xReadyToStart        : BOOL; // Условия запуска выполнены
	xRobotReady          : BOOL; // Робот готов принять маршрут
	xMagazineReady       : BOOL; // Магазин готов к операции
	stMagazineStatus     : ST_MAGAZINE_STATUS; // Снимок выбранного магазина для существующего автомата
	uiActiveMagazine     : UINT; // Защёлкнутый магазин текущего цикла
	xMagazine1Available  : BOOL;
	xMagazine2Available  : BOOL;
	xAlternateMagazineAvailable : BOOL; // Второй магазин готов принять непрерывный автоматический цикл
	xAnyMachineBusy      : BOOL; // Хотя бы один станок обслуживается
	xMachineServiceStarted : BOOL; // Выбранный станок вошёл в рецепт
	xReselectAfterRobotRelease : BOOL; // После снятия команды требуется повторный выбор
	xChangePrepared      : BOOL; // Для CHANGE зафиксированы совместимый станок и два корректных слота
	xFaultAllowed        : BOOL; // Инъекция разрешена в полностью остановленной ячейке
	xResetAllowed        : BOOL; // Локальная ошибка может быть сброшена
	xPayloadRouteWarningActive : BOOL; // Предупреждение о несовпадении типа груза и назначения уже выдано
	xPrestartGripper1Occupied : BOOL; // Снимок занятости первого захвата на момент запуска опроса
	xPrestartGripper2Occupied : BOOL; // Снимок занятости второго захвата на момент запуска опроса
	xSafetyHomeRequired : BOOL; // Защёлка обязательного возврата в HOME_SAFETY
	xRobotAtSafetyHome  : BOOL; // Робот находится в допустимом диапазоне HOME_SAFETY
	xStoppedPoseValid   : BOOL; // После штатной остановки сохранена доверенная поза
	xWasRunning         : BOOL; // Состояние цикла на предыдущем вызове
	xStartCheckCellIdle           : BOOL; // Отдельные условия запуска для HMI
	xStartCheckAutomaticMode      : BOOL;
	xStartCheckNoBlockingError    : BOOL;
	xStartCheckRobotInterfaceReady: BOOL;
	xStartCheckConfigurationValid : BOOL;
	xStartCheckDrivesReady        : BOOL;
	xStartCheckRobotReady         : BOOL;
	xStartCheckMagazineReady      : BOOL;
	xStartCheckTaskAvailable      : BOOL;
	xStartCheckSafetyHome         : BOOL;
	xOperatorPromptState          : BOOL; // Текущий шаг ожидает ответ HMI
	xOperatorChoiceAllowed        : BOOL;
	xOperatorCancelAllowed        : BOOL;
	uiOperatorPrompt              : UINT;
	uiOperatorTypeMask            : UINT;
	uiOperatorMachineMask         : UINT;
	uiStartConditionsMet         : UINT;
	lrStoppedPoseX      : LREAL; // Доверенная координата X штатной остановки
	lrStoppedPoseY      : LREAL; // Доверенная координата Y штатной остановки
	lrStoppedPoseZ      : LREAL; // Доверенная координата Z штатной остановки
	uiReadyMachines      : UINT; // Число доступных маршрутных целей
	uiMachine            : UINT; // Индекс станка
	uiCandidateMachine   : UINT; // Результат выбора
	uiSelectedMachine    : UINT; // Зафиксированный станок
	uiSelectedType       : UINT; // Тип маршрута
	uiBlankPayloadType   : UINT; // Тип заготовки в первом захвате
	uiDetailPayloadType  : UINT; // Тип готовой детали во втором захвате
	axMachineStartPending: ARRAY [1..3] OF BOOL; // Станок обслужен, но xProcessing ещё не подтверждён
	iTakeSlot            : SINT; // Зарезервированный слот заготовки
	iPutSlot             : SINT; // Зарезервированный слот укладки
	iTakeOriginSlot      : SINT; // Исходный слот заготовки для приоритетного возврата
	rtStart              : R_TRIG; // Фронт запуска
	rtStop               : R_TRIG; // Фронт остановки
	rtReset              : R_TRIG; // Фронт сброса
	rtOperatorChoice     : R_TRIG; // Один ответ не переносится на следующий шаг опроса
	rtOperatorCancel     : R_TRIG; // Фронт отмены предпускового опроса
	fbFaultInjector      : FB_CELL_FAULT_INJECTOR; // Проверка противоречивого груза
END_VAR
VAR CONSTANT
	FIRST_MACHINE     : UINT := UINT#1;
	LAST_MACHINE      : UINT := UINT#3;
	MACHINE_SWITCH_DEADBAND : TIME := T#1S; // Минимальный выигрыш времени для смены ожидаемой цели
	START_PENDING_ESTIMATE  : TIME := T#1S; // Оценка перехода от освобождения робота до xProcessing
	ERR_BOTH_GRIPPERS : DWORD := DWORD#16#0000_0001;
	ERR_ROBOT         : DWORD := DWORD#16#0000_0002;
	ERR_MAGAZINE      : DWORD := DWORD#16#0000_0004;
	ERR_MACHINE       : DWORD := DWORD#16#0000_0008;
	ERR_GLOBAL_STOP   : DWORD := DWORD#16#0000_0010;
	WRN_START_NOT_READY       : UINT := UINT#4;
	WRN_STOP_NOT_RUNNING      : UINT := UINT#5;
	WRN_SIM_ERROR_NOT_ALLOWED : UINT := UINT#8;
	WRN_PAYLOAD_ROUTE_MISMATCH : UINT := UINT#9;
	WRN_SAFETY_HOME_REQUIRED   : UINT := UINT#10;
	WRN_GRIPPER1_CONTENT       : UINT := UINT#15;
	WRN_GRIPPER2_CONTENT       : UINT := UINT#16;
	WRN_PAYLOAD_TYPE_CHOICE    : UINT := UINT#17;
	WRN_DETAIL_SLOT_REQUIRED   : UINT := UINT#18;
	WRN_START_MACHINE_REQUIRED : UINT := UINT#19;
	WRN_START_MACHINE_CHOICE   : UINT := UINT#20;
	WRN_OPERATOR_REPLY_REJECTED: UINT := UINT#21;
	WRN_OPERATOR_CANCEL_REJECTED: UINT := UINT#22;
END_VAR

// --- BEGIN IMPLEMENTATION ---

rtStart(CLK := xStart);
rtStop(CLK := xStop);
rtReset(CLK := xResetRequest);
rtOperatorChoice(CLK := xOperatorChoice);
rtOperatorCancel(CLK := xOperatorCancel);

// Выбор выполняется только между операциями. Внутренний автомат по-прежнему
// работает с одним снимком, поэтому уже отлажанный маршрут не размазывается
// по двум владельцам и не переключается посреди TAKE/CHANGE.
xMagazine1Available := astMagazineStatus[1].xEnabled
	AND astMagazineStatus[1].xReady
	AND NOT astMagazineStatus[1].xBusy
	AND NOT astMagazineStatus[1].xError
	AND NOT astMagazineStatus[1].xDisablePending
	AND NOT astMagazineStatus[1].xFinished;
xMagazine2Available := astMagazineStatus[2].xEnabled
	AND astMagazineStatus[2].xReady
	AND NOT astMagazineStatus[2].xBusy
	AND NOT astMagazineStatus[2].xError
	AND NOT astMagazineStatus[2].xDisablePending
	AND NOT astMagazineStatus[2].xFinished;

// После полной выработки или операторского запроса отключения активного магазина
// автомат не требует нового Start. Переключение выполняется только когда робот
// и старый магазин уже освобождены.
xAlternateMagazineAvailable := FALSE;
IF uiActiveMagazine = UINT#1 THEN
	xAlternateMagazineAvailable := xMagazine2Available;
ELSIF uiActiveMagazine = UINT#2 THEN
	xAlternateMagazineAvailable := xMagazine1Available;
END_IF;
IF xRunning
AND (uiActiveMagazine >= UINT#1)
AND (uiActiveMagazine <= UINT#2) THEN
	// Операторское отключение активного магазина передаёт владение второму
	// только на границе операций. Фактический груз FB_ROBOT при этом остаётся
	// источником истины и будет уложен уже в выбранный магазин.
	IF (astMagazineStatus[uiActiveMagazine].xFinished
		OR (astMagazineStatus[uiActiveMagazine].xDisablePending
			AND ((eState = E_CELL_MANAGER_STATE.PLAN_TARGET)
				OR (eState = E_CELL_MANAGER_STATE.WAIT_TARGET)
				OR (eState = E_CELL_MANAGER_STATE.SELECT_FALLBACK)
				OR (eState = E_CELL_MANAGER_STATE.WAIT_MAGAZINE))))
	AND NOT astMagazineStatus[uiActiveMagazine].xBusy
	AND NOT stRobotStatus.xBusy THEN
		IF xAlternateMagazineAvailable THEN
			IF uiActiveMagazine = UINT#1 THEN
				uiActiveMagazine := UINT#2;
			ELSE
				uiActiveMagazine := UINT#1;
			END_IF;
		ELSE
			// Без готовой замены старый код навечно оставлял магазин владельцем:
			// FB_MAGAZINE видел xRobotOwnsMagazine и не мог завершить Disable.
			// Освобождаем владение и ждём готовый магазин, не останавливая ячейку.
			uiActiveMagazine := UINT#0;
		END_IF;
		eMagazineOperation := E_MAGAZINE_OPERATION.NONE;
		eMachineOperation := E_MACHINE_OPERATION.NONE;
		uiSelectedMachine := UINT#0;
		uiSelectedType := UINT#0;
		iTakeSlot := SINT#0;
		iPutSlot := SINT#0;
		iTakeOriginSlot := SINT#0;
		IF uiActiveMagazine = UINT#0 THEN
			eState := E_CELL_MANAGER_STATE.WAIT_MAGAZINE;
		ELSE
			eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
		END_IF;
	END_IF;
END_IF;

IF (uiActiveMagazine < UINT#1) OR (uiActiveMagazine > UINT#2) THEN
	IF xMagazine1Available THEN
		uiActiveMagazine := UINT#1;
	ELSIF xMagazine2Available THEN
		uiActiveMagazine := UINT#2;
	ELSE
		uiActiveMagazine := UINT#0;
	END_IF;
ELSIF NOT xRunning
AND (astMagazineStatus[uiActiveMagazine].xFinished
	OR astMagazineStatus[uiActiveMagazine].xError
	OR NOT astMagazineStatus[uiActiveMagazine].xEnabled) THEN
	IF (uiActiveMagazine <> UINT#1) AND xMagazine1Available THEN
		uiActiveMagazine := UINT#1;
	ELSIF (uiActiveMagazine <> UINT#2) AND xMagazine2Available THEN
		uiActiveMagazine := UINT#2;
	ELSIF xMagazine1Available THEN
		uiActiveMagazine := UINT#1;
	ELSIF xMagazine2Available THEN
		uiActiveMagazine := UINT#2;
	ELSE
		uiActiveMagazine := UINT#0;
	END_IF;
END_IF;

IF (uiActiveMagazine >= UINT#1) AND (uiActiveMagazine <= UINT#2) THEN
	stMagazineStatus := astMagazineStatus[uiActiveMagazine];
ELSE
	stMagazineStatus := astMagazineStatus[1];
END_IF;

// HOME_SAFETY — это диапазон вокруг именованной точки, а не требование
// побитового совпадения координат. Защёлка снимается только при принятом запуске:
// оператор не сможет подъехать к точке, снова отъехать и запустить цикл.
xRobotAtSafetyHome := (ABS(lrRobotActualX - stSafetyHomePoint.X) <= lrSafetyHomeToleranceX)
	AND (ABS(lrRobotActualY - stSafetyHomePoint.Y) <= lrSafetyHomeToleranceY)
	AND (ABS(lrRobotActualZ - stSafetyHomePoint.Z) <= lrSafetyHomeToleranceZ);

// Штатная остановка не требует HOME_SAFETY, пока робот остаётся в сохранённой
// позе. Любое последующее координатное перемещение (JOG, MoveAbsolute или
// MoveDirect) необратимо снимает доверие до следующего разрешённого запуска.
IF (eState = E_CELL_MANAGER_STATE.IDLE)
AND NOT xRunning
AND NOT xSafetyHomeRequired THEN
	IF NOT xStoppedPoseValid THEN
		lrStoppedPoseX := lrRobotActualX;
		lrStoppedPoseY := lrRobotActualY;
		lrStoppedPoseZ := lrRobotActualZ;
		xStoppedPoseValid := TRUE;
	ELSIF xManual
	AND ((ABS(lrRobotActualX - lrStoppedPoseX) > lrStoppedPoseTolerance)
	OR (ABS(lrRobotActualY - lrStoppedPoseY) > lrStoppedPoseTolerance)
	OR (ABS(lrRobotActualZ - lrStoppedPoseZ) > lrStoppedPoseTolerance)) THEN
		xSafetyHomeRequired := TRUE;
		xStoppedPoseValid := FALSE;
	END_IF;
END_IF;

// FB_ROBOT — источник фактического типа груза. Локальные значения менеджера
// принимаются от него после каждого цикла, что оставляет место для будущей
// инициализации зажатого захвата оператором.
IF stRobotStatus.xBlankAvailable THEN
	uiBlankPayloadType := stRobotStatus.uiBlankPayloadType;
ELSE
	uiBlankPayloadType := UINT#0;
END_IF;
IF stRobotStatus.xDetailAvailable THEN
	uiDetailPayloadType := stRobotStatus.uiDetailPayloadType;
ELSE
	uiDetailPayloadType := UINT#0;
END_IF;

// FB_MACHINE остаётся единственным владельцем таймаута запуска. Диспетчер только
// сохраняет короткое переходное состояние, чтобы новый цикл не исключался из прогноза.
FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
	IF axMachineStartPending[uiMachine]
	AND (astMachineStatus[uiMachine].xProcessing
		OR (astMachineStatus[uiMachine].ePartState = E_PART_STATE.EMPTY)
		OR NOT astMachineStatus[uiMachine].xEnabled
		OR astMachineStatus[uiMachine].xDisablePending
		OR astMachineStatus[uiMachine].xError) THEN
		axMachineStartPending[uiMachine] := FALSE;
	END_IF;
END_FOR;

Command.stRobot.xExecute := FALSE;
Command.stRobot.xStop := FALSE;
Command.stRobot.xReset := xReset;
Command.stRobot.eAction := E_ROBOT_ACTION.NONE;
Command.stRobot.eSetPoint := E_POINT_NAME.NONE;
Command.stRobot.iActiveSlot := SINT#0;
Command.stRobot.uiMagazineId := UINT#0;
Command.uiBlankPayloadType := uiBlankPayloadType;
Command.uiDetailPayloadType := uiDetailPayloadType;

Command.stMagazine.xEnable := FALSE;
Command.stMagazine.xDisable := FALSE;
Command.stMagazine.xExecute := FALSE;
Command.stMagazine.xStop := FALSE;
Command.stMagazine.eOperation := eMagazineOperation;
Command.stMagazine.iTakeSlot := iTakeSlot;
Command.stMagazine.iPutSlot := iPutSlot;
xChangePrepared := FALSE;

FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
	Command.axMachineExecute[uiMachine] := FALSE;
END_FOR;

uiReadyMachines := UINT#0;
xAnyMachineBusy := FALSE;
FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
	IF astMachineStatus[uiMachine].xBusy THEN
		xAnyMachineBusy := TRUE;
	END_IF;
	IF IsMachineEligible(uiMachine := uiMachine) THEN
		uiReadyMachines := uiReadyMachines + UINT#1;
	END_IF;
END_FOR;

xRobotReady := NOT stRobotStatus.xBusy
	AND NOT stRobotStatus.xError;
xMagazineReady := (uiActiveMagazine >= UINT#1)
	AND (uiActiveMagazine <= UINT#2)
	AND stMagazineStatus.xEnabled
	AND stMagazineStatus.xReady
	AND NOT stMagazineStatus.xBusy
	AND NOT stMagazineStatus.xError
	AND NOT stMagazineStatus.xDisablePending;

uiCandidateMachine := SelectMachineBeforeTake();
IF uiCandidateMachine = UINT#0 THEN
	uiCandidateMachine := SelectMachineForUnload(uiCurrentMachine := UINT#0);
END_IF;

CASE Config.uiTypeCount OF
	UINT#1: uiOperatorTypeMask := UINT#1;
	UINT#2: uiOperatorTypeMask := UINT#3;
	UINT#3: uiOperatorTypeMask := UINT#7;
ELSE
	uiOperatorTypeMask := UINT#0;
END_CASE;

// Для специального старта с двумя грузами оператор выбирает только среди действительно
// пустых, готовых и совместимых станков. Окончательная проверка выбора остаётся в PLC.
uiOperatorMachineMask := UINT#0;
IF (uiBlankPayloadType >= UINT#1)
AND (uiBlankPayloadType <= Config.uiTypeCount) THEN
	FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
		IF IsMachineCompatible(
			uiMachine := uiMachine,
			uiProductType := uiBlankPayloadType
		)
		AND astMachineStatus[uiMachine].xCanAcceptService
		AND (astMachineStatus[uiMachine].ePartState = E_PART_STATE.EMPTY) THEN
			CASE uiMachine OF
				UINT#1: uiOperatorMachineMask := uiOperatorMachineMask OR UINT#1;
				UINT#2: uiOperatorMachineMask := uiOperatorMachineMask OR UINT#2;
				UINT#3: uiOperatorMachineMask := uiOperatorMachineMask OR UINT#4;
			END_CASE;
		END_IF;
	END_FOR;
END_IF;

// Условия запуска публикуются раздельно: PLC остаётся единственным владельцем
// технологического решения, а HMI только объясняет его оператору.
xStartCheckCellIdle := (eState = E_CELL_MANAGER_STATE.IDLE) AND NOT xRunning;
xStartCheckAutomaticMode := NOT xManual;
xStartCheckNoBlockingError := NOT xGlobalError AND (Error.dwErrorActive = DWORD#0);
xStartCheckRobotInterfaceReady := xRobotInterfaceReady;
xStartCheckConfigurationValid := xConfigurationValid;
xStartCheckDrivesReady := xDrivesReady;
xStartCheckRobotReady := xRobotReady;
xStartCheckMagazineReady := xMagazineReady;
xStartCheckTaskAvailable := stRobotStatus.xBlankAvailable
		OR stRobotStatus.xDetailAvailable
		OR (uiCandidateMachine > UINT#0);
xStartCheckSafetyHome := NOT xSafetyHomeRequired OR xRobotAtSafetyHome;

xReadyToStart := xStartCheckCellIdle
	AND xStartCheckAutomaticMode
	AND xStartCheckNoBlockingError
	AND xStartCheckRobotInterfaceReady
	AND xStartCheckConfigurationValid
	AND xStartCheckDrivesReady
	AND xStartCheckRobotReady
	AND xStartCheckMagazineReady
	AND xStartCheckTaskAvailable
	AND xStartCheckSafetyHome;

uiStartConditionsMet := UINT#0;
IF xStartCheckCellIdle THEN
	uiStartConditionsMet := uiStartConditionsMet + UINT#1;
END_IF;
IF xStartCheckAutomaticMode THEN
	uiStartConditionsMet := uiStartConditionsMet + UINT#1;
END_IF;
IF xStartCheckNoBlockingError THEN
	uiStartConditionsMet := uiStartConditionsMet + UINT#1;
END_IF;
IF xStartCheckRobotInterfaceReady THEN
	uiStartConditionsMet := uiStartConditionsMet + UINT#1;
END_IF;
IF xStartCheckConfigurationValid THEN
	uiStartConditionsMet := uiStartConditionsMet + UINT#1;
END_IF;
IF xStartCheckDrivesReady THEN
	uiStartConditionsMet := uiStartConditionsMet + UINT#1;
END_IF;
IF xStartCheckRobotReady THEN
	uiStartConditionsMet := uiStartConditionsMet + UINT#1;
END_IF;
IF xStartCheckMagazineReady THEN
	uiStartConditionsMet := uiStartConditionsMet + UINT#1;
END_IF;
IF xStartCheckTaskAvailable THEN
	uiStartConditionsMet := uiStartConditionsMet + UINT#1;
END_IF;
IF xStartCheckSafetyHome THEN
	uiStartConditionsMet := uiStartConditionsMet + UINT#1;
END_IF;

xFaultAllowed := (eState = E_CELL_MANAGER_STATE.IDLE)
	AND NOT xRunning
	AND NOT xGlobalError
	AND NOT xMotionBusy
	AND NOT stRobotStatus.xBusy
	AND NOT stMagazineStatus.xBusy
	AND NOT xAnyMachineBusy
	AND (Error.dwErrorActive = DWORD#0);
fbFaultInjector(Request := FaultRequest, xOwnerAllowed := xFaultAllowed);
FaultStatus := fbFaultInjector.Status;

IF fbFaultInjector.Status.xRejected THEN
	Diag.stWarning.uiCode := WRN_SIM_ERROR_NOT_ALLOWED;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

IF rtStart.Q
AND xSafetyHomeRequired
AND NOT xRobotAtSafetyHome
AND NOT (xRunning AND xStopRequested) THEN
	Diag.stWarning.uiCode := WRN_SAFETY_HOME_REQUIRED;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
ELSIF rtStart.Q AND NOT (xReadyToStart OR (xRunning AND xStopRequested)) THEN
	Diag.stWarning.uiCode := WRN_START_NOT_READY;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

IF rtStop.Q AND NOT xRunning THEN
	Diag.stWarning.uiCode := WRN_STOP_NOT_RUNNING;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

// Ответы HMI принимаются только пока PLC явно публикует активный шаг опроса.
xOperatorPromptState := (eState = E_CELL_MANAGER_STATE.WAIT_GRIPPER1_CONTENT)
	OR (eState = E_CELL_MANAGER_STATE.WAIT_GRIPPER1_TYPE)
	OR (eState = E_CELL_MANAGER_STATE.WAIT_GRIPPER2_CONTENT)
	OR (eState = E_CELL_MANAGER_STATE.WAIT_GRIPPER2_TYPE)
	OR (eState = E_CELL_MANAGER_STATE.WAIT_START_MACHINE);
xOperatorChoiceAllowed := xOperatorPromptState
	AND NOT xManual
	AND NOT xGlobalError
	AND (Error.dwErrorActive = DWORD#0)
	AND xRobotInterfaceReady
	AND xConfigurationValid
	AND xDrivesReady
	AND xRobotReady
	AND xMagazineReady
	AND (NOT xSafetyHomeRequired OR xRobotAtSafetyHome);
// Отмена не должна блокироваться из-за временно потерянной готовности:
// оператор всегда может закрыть незавершённый предпусковой опрос.
xOperatorCancelAllowed := xOperatorPromptState;

IF rtOperatorChoice.Q AND NOT xOperatorChoiceAllowed THEN
	Diag.stWarning.uiCode := WRN_OPERATOR_REPLY_REJECTED;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

IF rtOperatorCancel.Q THEN
	IF xOperatorCancelAllowed THEN
		uiBlankPayloadType := UINT#0;
		uiDetailPayloadType := UINT#0;
		uiSelectedMachine := UINT#0;
		uiSelectedType := UINT#0;
		eMachineOperation := E_MACHINE_OPERATION.NONE;
		eState := E_CELL_MANAGER_STATE.IDLE;
	ELSE
		Diag.stWarning.uiCode := WRN_OPERATOR_CANCEL_REJECTED;
		Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
		IF Diag.stWarning.udiSequence = UDINT#0 THEN
			Diag.stWarning.udiSequence := UDINT#1;
		END_IF;
	END_IF;
END_IF;

// Если оператор или внешний контроллер изменил захваты во время вопроса, старый ответ больше недостоверен.
IF xOperatorPromptState
AND NOT rtOperatorCancel.Q
AND ((stRobotStatus.xBlankAvailable <> xPrestartGripper1Occupied)
	OR (stRobotStatus.xDetailAvailable <> xPrestartGripper2Occupied)) THEN
	Diag.stWarning.uiCode := WRN_OPERATOR_REPLY_REJECTED;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
	uiBlankPayloadType := UINT#0;
	uiDetailPayloadType := UINT#0;
	eState := E_CELL_MANAGER_STATE.IDLE;
END_IF;

IF xOperatorPromptState
AND xManual THEN
	uiBlankPayloadType := UINT#0;
	uiDetailPayloadType := UINT#0;
	uiSelectedMachine := UINT#0;
	uiSelectedType := UINT#0;
	eMachineOperation := E_MACHINE_OPERATION.NONE;
	eState := E_CELL_MANAGER_STATE.IDLE;
END_IF;

IF rtStop.Q OR xManual THEN
	xStopRequested := TRUE;
ELSIF rtStart.Q AND xRunning
AND (eState <> E_CELL_MANAGER_STATE.MACHINE_FAULT_STOP) THEN
	xStopRequested := FALSE;
END_IF;

// Ошибка робота становится ошибкой автоматического цикла только когда ячейка
// действительно выполняет цикл. В IDLE ручная ошибка остаётся у своего
// первичного владельца (ось, группа или робот) и не создаёт ложный каскад.
IF xRunning AND stRobotStatus.xError THEN
	xSafetyHomeRequired := TRUE;
	xStoppedPoseValid := FALSE;
	Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
	eState := E_CELL_MANAGER_STATE.ERROR;
END_IF;

IF xGlobalError
AND (eState <> E_CELL_MANAGER_STATE.IDLE)
AND (eState <> E_CELL_MANAGER_STATE.ERROR) THEN
	// Не каждая общая авария требует возврата. Защёлкиваем только ситуацию,
	// где прервано движение либо робот мог находиться внутри станка/магазина.
	IF stRobotStatus.xBusy
	OR xMotionBusy
	OR (eState = E_CELL_MANAGER_STATE.ROUTE_TO_TARGET)
	OR (eState = E_CELL_MANAGER_STATE.RELEASE_ROBOT_COMMAND)
	OR (eState = E_CELL_MANAGER_STATE.SERVICE_TARGET)
	OR (eState = E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE)
	OR (eState = E_CELL_MANAGER_STATE.RELEASE_MAGAZINE)
	OR (eState = E_CELL_MANAGER_STATE.MACHINE_FAULT_STOP) THEN
		xSafetyHomeRequired := TRUE;
		xStoppedPoseValid := FALSE;
	END_IF;
	Error.dwErrorActive := Error.dwErrorActive OR ERR_GLOBAL_STOP;
	eState := E_CELL_MANAGER_STATE.ERROR;
END_IF;

CASE eState OF
	E_CELL_MANAGER_STATE.IDLE:
		xRunning := FALSE;
		xStopRequested := FALSE;
		xMachineServiceStarted := FALSE;
		xReselectAfterRobotRelease := FALSE;
		eMagazineOperation := E_MAGAZINE_OPERATION.NONE;
		IF fbFaultInjector.xBothGrippers THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_BOTH_GRIPPERS;
			eState := E_CELL_MANAGER_STATE.ERROR;
		ELSIF rtStart.Q AND NOT xManual THEN
			IF xReadyToStart THEN
				xPrestartGripper1Occupied := stRobotStatus.xBlankAvailable;
				xPrestartGripper2Occupied := stRobotStatus.xDetailAvailable;
				uiBlankPayloadType := UINT#0;
				uiDetailPayloadType := UINT#0;
				uiSelectedMachine := UINT#0;
				uiSelectedType := UINT#0;
				eMachineOperation := E_MACHINE_OPERATION.NONE;
				eState := E_CELL_MANAGER_STATE.PRESTART_IDENTIFY;
			END_IF;
		END_IF;

	E_CELL_MANAGER_STATE.PRESTART_IDENTIFY:
		IF xManual THEN
			eState := E_CELL_MANAGER_STATE.IDLE;
		ELSIF xPrestartGripper1Occupied THEN
			eState := E_CELL_MANAGER_STATE.WAIT_GRIPPER1_CONTENT;
		ELSIF xPrestartGripper2Occupied THEN
			eState := E_CELL_MANAGER_STATE.WAIT_GRIPPER2_CONTENT;
		ELSE
			xSafetyHomeRequired := FALSE;
			xStoppedPoseValid := FALSE;
			xRunning := TRUE;
			eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
		END_IF;

	E_CELL_MANAGER_STATE.WAIT_GRIPPER1_CONTENT:
		IF rtOperatorChoice.Q AND xOperatorChoiceAllowed THEN
			IF uiOperatorChoice = UINT#1 THEN
				IF Config.uiTypeCount = UINT#1 THEN
					uiBlankPayloadType := UINT#1;
					IF xPrestartGripper2Occupied THEN
						eState := E_CELL_MANAGER_STATE.WAIT_GRIPPER2_CONTENT;
					ELSE
						xSafetyHomeRequired := FALSE;
						xStoppedPoseValid := FALSE;
						xRunning := TRUE;
						eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
					END_IF;
				ELSE
					eState := E_CELL_MANAGER_STATE.WAIT_GRIPPER1_TYPE;
				END_IF;
			ELSIF uiOperatorChoice = UINT#2 THEN
				Diag.stWarning.uiCode := WRN_GRIPPER1_CONTENT;
				Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
				IF Diag.stWarning.udiSequence = UDINT#0 THEN Diag.stWarning.udiSequence := UDINT#1; END_IF;
				eState := E_CELL_MANAGER_STATE.IDLE;
			ELSE
				Diag.stWarning.uiCode := WRN_OPERATOR_REPLY_REJECTED;
				Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
				IF Diag.stWarning.udiSequence = UDINT#0 THEN Diag.stWarning.udiSequence := UDINT#1; END_IF;
				eState := E_CELL_MANAGER_STATE.IDLE;
			END_IF;
		END_IF;

	E_CELL_MANAGER_STATE.WAIT_GRIPPER1_TYPE:
		IF rtOperatorChoice.Q AND xOperatorChoiceAllowed THEN
			IF (uiOperatorChoice >= UINT#1)
			AND (uiOperatorChoice <= Config.uiTypeCount) THEN
				uiBlankPayloadType := uiOperatorChoice;
				IF xPrestartGripper2Occupied THEN
					eState := E_CELL_MANAGER_STATE.WAIT_GRIPPER2_CONTENT;
				ELSE
					xSafetyHomeRequired := FALSE;
					xStoppedPoseValid := FALSE;
					xRunning := TRUE;
					eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
				END_IF;
			ELSE
				Diag.stWarning.uiCode := WRN_PAYLOAD_TYPE_CHOICE;
				Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
				IF Diag.stWarning.udiSequence = UDINT#0 THEN Diag.stWarning.udiSequence := UDINT#1; END_IF;
				eState := E_CELL_MANAGER_STATE.IDLE;
			END_IF;
		END_IF;

	E_CELL_MANAGER_STATE.WAIT_GRIPPER2_CONTENT:
		IF rtOperatorChoice.Q AND xOperatorChoiceAllowed THEN
			IF uiOperatorChoice = UINT#2 THEN
				IF Config.uiTypeCount = UINT#1 THEN
					uiDetailPayloadType := UINT#1;
				ELSE
					eState := E_CELL_MANAGER_STATE.WAIT_GRIPPER2_TYPE;
				END_IF;
				IF (Config.uiTypeCount = UINT#1) AND xPrestartGripper1Occupied THEN
					eState := E_CELL_MANAGER_STATE.WAIT_START_MACHINE;
				ELSIF Config.uiTypeCount = UINT#1 THEN
					xSafetyHomeRequired := FALSE;
					xStoppedPoseValid := FALSE;
					xRunning := TRUE;
					eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
				END_IF;
			ELSIF uiOperatorChoice = UINT#1 THEN
				Diag.stWarning.uiCode := WRN_GRIPPER2_CONTENT;
				Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
				IF Diag.stWarning.udiSequence = UDINT#0 THEN Diag.stWarning.udiSequence := UDINT#1; END_IF;
				eState := E_CELL_MANAGER_STATE.IDLE;
			ELSE
				Diag.stWarning.uiCode := WRN_OPERATOR_REPLY_REJECTED;
				Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
				IF Diag.stWarning.udiSequence = UDINT#0 THEN Diag.stWarning.udiSequence := UDINT#1; END_IF;
				eState := E_CELL_MANAGER_STATE.IDLE;
			END_IF;
		END_IF;

	E_CELL_MANAGER_STATE.WAIT_GRIPPER2_TYPE:
		IF rtOperatorChoice.Q AND xOperatorChoiceAllowed THEN
			IF (uiOperatorChoice >= UINT#1)
			AND (uiOperatorChoice <= Config.uiTypeCount) THEN
				uiDetailPayloadType := uiOperatorChoice;
				IF xPrestartGripper1Occupied THEN
					eState := E_CELL_MANAGER_STATE.WAIT_START_MACHINE;
				ELSE
					xSafetyHomeRequired := FALSE;
					xStoppedPoseValid := FALSE;
					xRunning := TRUE;
					eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
				END_IF;
			ELSE
				Diag.stWarning.uiCode := WRN_PAYLOAD_TYPE_CHOICE;
				Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
				IF Diag.stWarning.udiSequence = UDINT#0 THEN Diag.stWarning.udiSequence := UDINT#1; END_IF;
				eState := E_CELL_MANAGER_STATE.IDLE;
			END_IF;
		END_IF;

	E_CELL_MANAGER_STATE.WAIT_START_MACHINE:
		IF (uiDetailPayloadType < UINT#1)
		OR (uiDetailPayloadType > Config.uiTypeCount) THEN
			Diag.stWarning.uiCode := WRN_PAYLOAD_TYPE_CHOICE;
			Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
			IF Diag.stWarning.udiSequence = UDINT#0 THEN Diag.stWarning.udiSequence := UDINT#1; END_IF;
			eState := E_CELL_MANAGER_STATE.IDLE;
		ELSIF stMagazineStatus.stTypeStatus.aiFreeSlot[uiDetailPayloadType] = SINT#0 THEN
			Diag.stWarning.uiCode := WRN_DETAIL_SLOT_REQUIRED;
			Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
			IF Diag.stWarning.udiSequence = UDINT#0 THEN Diag.stWarning.udiSequence := UDINT#1; END_IF;
			eState := E_CELL_MANAGER_STATE.IDLE;
		ELSIF uiOperatorMachineMask = UINT#0 THEN
			Diag.stWarning.uiCode := WRN_START_MACHINE_REQUIRED;
			Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
			IF Diag.stWarning.udiSequence = UDINT#0 THEN Diag.stWarning.udiSequence := UDINT#1; END_IF;
			eState := E_CELL_MANAGER_STATE.IDLE;
		ELSIF rtOperatorChoice.Q AND xOperatorChoiceAllowed THEN
			IF ((uiOperatorChoice = UINT#1) AND ((uiOperatorMachineMask AND UINT#1) <> UINT#0))
			OR ((uiOperatorChoice = UINT#2) AND ((uiOperatorMachineMask AND UINT#2) <> UINT#0))
			OR ((uiOperatorChoice = UINT#3) AND ((uiOperatorMachineMask AND UINT#4) <> UINT#0)) THEN
				uiSelectedMachine := uiOperatorChoice;
				uiSelectedType := uiBlankPayloadType;
				eMachineOperation := E_MACHINE_OPERATION.LOAD;
				xSafetyHomeRequired := FALSE;
				xStoppedPoseValid := FALSE;
				xRunning := TRUE;
				eState := E_CELL_MANAGER_STATE.ROUTE_TO_TARGET;
			ELSE
				Diag.stWarning.uiCode := WRN_START_MACHINE_CHOICE;
				Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
				IF Diag.stWarning.udiSequence = UDINT#0 THEN Diag.stWarning.udiSequence := UDINT#1; END_IF;
				eState := E_CELL_MANAGER_STATE.IDLE;
			END_IF;
		END_IF;

	E_CELL_MANAGER_STATE.PLAN_TARGET:
		IF xStopRequested
		AND NOT stRobotStatus.xBusy
		AND NOT stMagazineStatus.xBusy THEN
			xRunning := FALSE;
			eState := E_CELL_MANAGER_STATE.IDLE;

		ELSIF stRobotStatus.xBlankAvailable
		AND stRobotStatus.xDetailAvailable THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_BOTH_GRIPPERS;
			eState := E_CELL_MANAGER_STATE.ERROR;

		ELSIF stRobotStatus.xBlankAvailable THEN
			IF (uiBlankPayloadType < UINT#1)
			OR (uiBlankPayloadType > Config.uiTypeCount) THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_MAGAZINE;
				eState := E_CELL_MANAGER_STATE.ERROR;
			ELSE
				uiSelectedType := uiBlankPayloadType;
				uiCandidateMachine := SelectMachineForHeldBlank(
					uiProductType := uiBlankPayloadType,
					uiCurrentMachine := uiSelectedMachine
				);
				IF uiCandidateMachine > UINT#0 THEN
					uiSelectedMachine := uiCandidateMachine;
					eState := E_CELL_MANAGER_STATE.ROUTE_TO_TARGET;
				ELSE
					uiSelectedMachine := UINT#0;
					eState := E_CELL_MANAGER_STATE.SELECT_FALLBACK;
				END_IF;
			END_IF;

		ELSIF stRobotStatus.xDetailAvailable THEN
			uiBlankPayloadType := UINT#0;
			IF (uiDetailPayloadType < UINT#1)
			OR (uiDetailPayloadType > Config.uiTypeCount) THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE;
				eState := E_CELL_MANAGER_STATE.ERROR;
			ELSIF (stMagazineStatus.stTypeStatus.aiFreeSlot[uiDetailPayloadType] = SINT#0)
			OR NOT xMagazineReady THEN
				eState := E_CELL_MANAGER_STATE.WAIT_MAGAZINE;
			ELSE
				// CHANGE применяется только тогда, когда готовая деталь может быть уложена,
				// а взятая заготовка уже имеет исправный совместимый станок назначения.
				iPutSlot := stMagazineStatus.stTypeStatus.aiFreeSlot[uiDetailPayloadType];
				uiCandidateMachine := SelectMachineBeforeTake();
				uiSelectedMachine := UINT#0;
				uiSelectedType := UINT#0;
				iTakeSlot := SINT#0;
				iTakeOriginSlot := SINT#0;
				eMachineOperation := E_MACHINE_OPERATION.NONE;

				// Закрытый или переходный первый захват исключает CHANGE, даже если
				// логический флаг груза сейчас снят.
				IF stRobotStatus.xGripper1Open
				AND (uiCandidateMachine >= FIRST_MACHINE)
				AND (uiCandidateMachine <= LAST_MACHINE) THEN
					uiSelectedMachine := uiCandidateMachine;
					uiSelectedType := Config.auiMachineType[uiSelectedMachine];
					IF (uiSelectedType >= UINT#1)
					AND (uiSelectedType <= Config.uiTypeCount) THEN
						iTakeSlot := stMagazineStatus.stTypeStatus.aiBlankSlot[uiSelectedType];
					END_IF;
				END_IF;

				// Индексы проверяются до обращения к карте секций. Обычный AND в
				// CODESYS не используется как защита динамического индекса массива.
				IF (iPutSlot >= SINT#1)
				AND (SINT_TO_UINT(iPutSlot) <= SINT_TO_UINT(GVL_CELL_SETTINGS.NumberDetail))
				AND (iTakeSlot >= SINT#1)
				AND (SINT_TO_UINT(iTakeSlot) <= SINT_TO_UINT(GVL_CELL_SETTINGS.NumberDetail))
				AND (iTakeSlot <> iPutSlot) THEN
					xChangePrepared := TRUE;
				END_IF;

				IF xChangePrepared THEN
					iTakeOriginSlot := iTakeSlot;
					eMagazineOperation := E_MAGAZINE_OPERATION.CHANGE;
				ELSE
					// Если следующую заготовку нельзя безопасно назначить, сначала
					// освобождаем второй захват и пересчитываем маршрут после PUT.
					uiSelectedMachine := UINT#0;
					uiSelectedType := UINT#0;
					iTakeSlot := SINT#0;
					iTakeOriginSlot := SINT#0;
					eMagazineOperation := E_MAGAZINE_OPERATION.PUT;
				END_IF;
				eState := E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE;
			END_IF;

		ELSE
			uiBlankPayloadType := UINT#0;
			uiDetailPayloadType := UINT#0;
			uiCandidateMachine := SelectMachineBeforeTake();
			IF uiCandidateMachine > UINT#0 THEN
				IF NOT xMagazineReady THEN
					eState := E_CELL_MANAGER_STATE.WAIT_MAGAZINE;
				ELSE
					uiSelectedMachine := uiCandidateMachine;
					uiSelectedType := Config.auiMachineType[uiSelectedMachine];
					iTakeSlot := stMagazineStatus.stTypeStatus.aiBlankSlot[uiSelectedType];
					iTakeOriginSlot := iTakeSlot;
					iPutSlot := SINT#0;
					eMachineOperation := E_MACHINE_OPERATION.NONE;
					eMagazineOperation := E_MAGAZINE_OPERATION.TAKE;
					eState := E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE;
				END_IF;
			ELSE
				// Заготовок в магазине нет — выбираем готовую деталь для отдельной выгрузки.
				uiCandidateMachine := SelectMachineForUnload(uiCurrentMachine := UINT#0);
				IF uiCandidateMachine > UINT#0 THEN
					uiSelectedMachine := uiCandidateMachine;
					uiSelectedType := Config.auiMachineType[uiSelectedMachine];
					eMachineOperation := E_MACHINE_OPERATION.UNLOAD;
					xMachineServiceStarted := FALSE;
					iTakeSlot := SINT#0;
					iPutSlot := SINT#0;
					IF xMagazineReady THEN
						eState := E_CELL_MANAGER_STATE.ROUTE_TO_TARGET;
					ELSE
						eState := E_CELL_MANAGER_STATE.WAIT_MAGAZINE;
					END_IF;
				ELSE
					IF stMagazineStatus.xFinished THEN
						xRunning := FALSE;
						eState := E_CELL_MANAGER_STATE.IDLE;
					ELSE
						eState := E_CELL_MANAGER_STATE.WAIT_TARGET;
					END_IF;
				END_IF;
			END_IF;
		END_IF;

	E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE:
		Command.stMagazine.xExecute := TRUE;
		IF (eMagazineOperation = E_MAGAZINE_OPERATION.NONE) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_MAGAZINE;
			eState := E_CELL_MANAGER_STATE.ERROR;
		END_IF;

		IF stMagazineStatus.xError THEN
			Command.stMagazine.xExecute := FALSE;
			IF stMagazineStatus.xRobotStopRequired THEN
				xSafetyHomeRequired := TRUE;
				xStoppedPoseValid := FALSE;
				Error.dwErrorActive := Error.dwErrorActive OR ERR_MAGAZINE;
				eState := E_CELL_MANAGER_STATE.ERROR;
			ELSE
				xRunning := FALSE;
				eState := E_CELL_MANAGER_STATE.IDLE;
			END_IF;
		ELSIF stRobotStatus.xError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
			eState := E_CELL_MANAGER_STATE.ERROR;
		ELSIF stMagazineStatus.xDone THEN
			eState := E_CELL_MANAGER_STATE.RELEASE_MAGAZINE;
		END_IF;

	E_CELL_MANAGER_STATE.RELEASE_MAGAZINE:
		IF stMagazineStatus.xError THEN
			IF stMagazineStatus.xRobotStopRequired THEN
				xSafetyHomeRequired := TRUE;
				xStoppedPoseValid := FALSE;
				Error.dwErrorActive := Error.dwErrorActive OR ERR_MAGAZINE;
				eState := E_CELL_MANAGER_STATE.ERROR;
			ELSE
				xRunning := FALSE;
				eState := E_CELL_MANAGER_STATE.IDLE;
			END_IF;
		ELSIF NOT stMagazineStatus.xBusy
		AND NOT stMagazineStatus.xDone THEN
			CASE eMagazineOperation OF
				E_MAGAZINE_OPERATION.TAKE:
					uiBlankPayloadType := uiSelectedType;
				E_MAGAZINE_OPERATION.PUT:
					uiDetailPayloadType := UINT#0;
				E_MAGAZINE_OPERATION.CHANGE:
					uiDetailPayloadType := UINT#0;
					uiBlankPayloadType := uiSelectedType;
				E_MAGAZINE_OPERATION.RETURN_BLANK:
					uiBlankPayloadType := UINT#0;
					uiSelectedType := UINT#0;
					iTakeOriginSlot := SINT#0;
					iTakeSlot := SINT#0;
					iPutSlot := SINT#0;
			END_CASE;
			eMagazineOperation := E_MAGAZINE_OPERATION.NONE;
			eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
		END_IF;

	E_CELL_MANAGER_STATE.ROUTE_TO_TARGET:
		IF eMachineOperation = E_MACHINE_OPERATION.UNLOAD THEN
			IF stRobotStatus.eCurrentPoint = astMachineStatus[uiSelectedMachine].eAbovePoint THEN
				eState := E_CELL_MANAGER_STATE.WAIT_TARGET;
			ELSE
				Command.stRobot.xExecute := TRUE;
				Command.stRobot.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
				Command.stRobot.eSetPoint := astMachineStatus[uiSelectedMachine].eAbovePoint;
				IF stRobotStatus.xDone THEN
					xReselectAfterRobotRelease := FALSE;
					eState := E_CELL_MANAGER_STATE.RELEASE_ROBOT_COMMAND;
				END_IF;
			END_IF;
		ELSE
			IF (uiSelectedMachine >= FIRST_MACHINE)
			AND (uiSelectedMachine <= LAST_MACHINE) THEN
				RaisePayloadRouteWarning(
					uiPayloadType := uiBlankPayloadType,
					uiDestinationType := Config.auiMachineType[uiSelectedMachine]
				);
			END_IF;
			IF NOT IsMachineCompatible(
				uiMachine := uiSelectedMachine,
				uiProductType := uiBlankPayloadType
			) THEN
				xReselectAfterRobotRelease := TRUE;
				eState := E_CELL_MANAGER_STATE.RELEASE_ROBOT_COMMAND;
			ELSIF stRobotStatus.eCurrentPoint = astMachineStatus[uiSelectedMachine].eAbovePoint THEN
				eState := E_CELL_MANAGER_STATE.WAIT_TARGET;
			ELSE
				Command.stRobot.xExecute := TRUE;
				Command.stRobot.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
				Command.stRobot.eSetPoint := astMachineStatus[uiSelectedMachine].eAbovePoint;
				IF stRobotStatus.xDone THEN
					xReselectAfterRobotRelease := FALSE;
					eState := E_CELL_MANAGER_STATE.RELEASE_ROBOT_COMMAND;
				END_IF;
			END_IF;
		END_IF;

	E_CELL_MANAGER_STATE.RELEASE_ROBOT_COMMAND:
		IF stRobotStatus.xError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
			eState := E_CELL_MANAGER_STATE.ERROR;
		ELSIF NOT stRobotStatus.xBusy
		AND NOT stRobotStatus.xDone THEN
			IF eMachineOperation = E_MACHINE_OPERATION.UNLOAD THEN
				eState := E_CELL_MANAGER_STATE.WAIT_TARGET;
			ELSIF xReselectAfterRobotRelease THEN
				xReselectAfterRobotRelease := FALSE;
				eState := E_CELL_MANAGER_STATE.SELECT_FALLBACK;
			ELSIF IsMachineCompatible(
				uiMachine := uiSelectedMachine,
				uiProductType := uiBlankPayloadType
			) THEN
				eState := E_CELL_MANAGER_STATE.WAIT_TARGET;
			ELSE
				eState := E_CELL_MANAGER_STATE.SELECT_FALLBACK;
			END_IF;
		END_IF;

	E_CELL_MANAGER_STATE.WAIT_TARGET:
		IF xStopRequested
		AND NOT stRobotStatus.xBusy THEN
			xRunning := FALSE;
			eState := E_CELL_MANAGER_STATE.IDLE;
		ELSIF (eMachineOperation = E_MACHINE_OPERATION.UNLOAD)
		AND NOT stRobotStatus.xBlankAvailable
		AND NOT stRobotStatus.xDetailAvailable THEN
			uiCandidateMachine := SelectMachineForUnload(uiCurrentMachine := uiSelectedMachine);
			IF uiCandidateMachine = UINT#0 THEN
				uiSelectedMachine := UINT#0;
				uiSelectedType := UINT#0;
				eMachineOperation := E_MACHINE_OPERATION.NONE;
				IF stMagazineStatus.xFinished THEN
					xRunning := FALSE;
					eState := E_CELL_MANAGER_STATE.IDLE;
				ELSE
					eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
				END_IF;
			ELSIF uiCandidateMachine <> uiSelectedMachine THEN
				uiSelectedMachine := uiCandidateMachine;
				uiSelectedType := Config.auiMachineType[uiSelectedMachine];
				eState := E_CELL_MANAGER_STATE.ROUTE_TO_TARGET;
			ELSIF stRobotStatus.eCurrentPoint <> astMachineStatus[uiSelectedMachine].eAbovePoint THEN
				eState := E_CELL_MANAGER_STATE.ROUTE_TO_TARGET;
			ELSIF astMachineStatus[uiSelectedMachine].xCanAcceptService
			AND astMachineStatus[uiSelectedMachine].xServiceRequired
			AND (astMachineStatus[uiSelectedMachine].ePartState = E_PART_STATE.LOADED)
			AND (astMachineStatus[uiSelectedMachine].ePartType = E_PART_TYPE.DETAIL) THEN
				xMachineServiceStarted := FALSE;
				eState := E_CELL_MANAGER_STATE.SERVICE_TARGET;
			END_IF;
		ELSIF stRobotStatus.xBlankAvailable THEN
			uiCandidateMachine := SelectMachineForHeldBlank(
				uiProductType := uiBlankPayloadType,
				uiCurrentMachine := uiSelectedMachine
			);
			IF uiCandidateMachine = UINT#0 THEN
				eState := E_CELL_MANAGER_STATE.SELECT_FALLBACK;
			ELSIF uiCandidateMachine <> uiSelectedMachine THEN
				uiSelectedMachine := uiCandidateMachine;
				eState := E_CELL_MANAGER_STATE.ROUTE_TO_TARGET;
			ELSIF stRobotStatus.eCurrentPoint <> astMachineStatus[uiSelectedMachine].eAbovePoint THEN
				eState := E_CELL_MANAGER_STATE.ROUTE_TO_TARGET;
			ELSIF astMachineStatus[uiSelectedMachine].xCanAcceptService
			AND astMachineStatus[uiSelectedMachine].xServiceRequired THEN
				eMachineOperation := astMachineStatus[uiSelectedMachine].eRecommendedOperation;
				axMachineStartPending[uiSelectedMachine] := FALSE;
				xMachineServiceStarted := FALSE;
				eState := E_CELL_MANAGER_STATE.SERVICE_TARGET;
			END_IF;
		ELSIF stRobotStatus.xDetailAvailable THEN
			// Готовая деталь в захвате обслуживается через общий план PUT.
			eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
		ELSE
			uiCandidateMachine := SelectMachineBeforeTake();
			IF uiCandidateMachine > UINT#0 THEN
				eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
			ELSE
				// В магазине нет заготовки: ожидаем готовую деталь станка,
				// которую можно выгрузить в свободный слот.
				uiCandidateMachine := SelectMachineForUnload(uiCurrentMachine := uiSelectedMachine);
				IF uiCandidateMachine > UINT#0 THEN
					uiSelectedMachine := uiCandidateMachine;
					uiSelectedType := Config.auiMachineType[uiSelectedMachine];
					eMachineOperation := E_MACHINE_OPERATION.UNLOAD;
					xMachineServiceStarted := FALSE;
					iTakeSlot := SINT#0;
					iPutSlot := SINT#0;
					IF xMagazineReady THEN
						eState := E_CELL_MANAGER_STATE.ROUTE_TO_TARGET;
					ELSE
						eState := E_CELL_MANAGER_STATE.WAIT_MAGAZINE;
					END_IF;
				ELSIF stMagazineStatus.xFinished THEN
					xRunning := FALSE;
					eState := E_CELL_MANAGER_STATE.IDLE;
				END_IF;
			END_IF;
		END_IF;

	E_CELL_MANAGER_STATE.SERVICE_TARGET:
		IF (uiSelectedMachine < FIRST_MACHINE)
		OR (uiSelectedMachine > LAST_MACHINE) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE;
			eState := E_CELL_MANAGER_STATE.ERROR;
		ELSIF NOT xMachineServiceStarted
		AND (eMachineOperation <> E_MACHINE_OPERATION.UNLOAD)
		AND NOT IsMachineCompatible(
			uiMachine := uiSelectedMachine,
			uiProductType := uiBlankPayloadType
		) THEN
			RaisePayloadRouteWarning(
				uiPayloadType := uiBlankPayloadType,
				uiDestinationType := Config.auiMachineType[uiSelectedMachine]
			);
			eState := E_CELL_MANAGER_STATE.SELECT_FALLBACK;
		ELSE
			// Тип детали передаётся в FB_ROBOT сразу после фактического закрытия
			// второго захвата, а не после полного выхода робота из станка.
			IF stRobotStatus.xDetailAvailable
			AND ((eMachineOperation = E_MACHINE_OPERATION.CHANGE)
				OR (eMachineOperation = E_MACHINE_OPERATION.UNLOAD)) THEN
				uiDetailPayloadType := Config.auiMachineType[uiSelectedMachine];
			END_IF;
			IF eMachineOperation <> E_MACHINE_OPERATION.UNLOAD THEN
				RaisePayloadRouteWarning(
					uiPayloadType := uiBlankPayloadType,
					uiDestinationType := Config.auiMachineType[uiSelectedMachine]
				);
			END_IF;
			Command.axMachineExecute[uiSelectedMachine] := TRUE;
			IF astMachineStatus[uiSelectedMachine].xBusy THEN
				xMachineServiceStarted := TRUE;
			END_IF;

			IF astMachineStatus[uiSelectedMachine].xServiceRejected THEN
				Command.axMachineExecute[uiSelectedMachine] := FALSE;
				xMachineServiceStarted := FALSE;
				eState := E_CELL_MANAGER_STATE.SELECT_FALLBACK;
			ELSIF astMachineStatus[uiSelectedMachine].xError THEN
				Command.axMachineExecute[uiSelectedMachine] := FALSE;
				xMachineServiceStarted := FALSE;
				// ROBOT_STOP уже публикует сам станок и обрабатывает FB_ROBOT.
				// Локальная ошибка без робота просто исключает станок из маршрута.
				eState := E_CELL_MANAGER_STATE.SELECT_FALLBACK;
			ELSIF stRobotStatus.xError THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
				eState := E_CELL_MANAGER_STATE.ERROR;
			ELSIF astMachineStatus[uiSelectedMachine].xRobotReleased THEN
				IF (eMachineOperation = E_MACHINE_OPERATION.LOAD)
				OR (eMachineOperation = E_MACHINE_OPERATION.CHANGE) THEN
					axMachineStartPending[uiSelectedMachine] := TRUE;
				END_IF;
				uiBlankPayloadType := UINT#0;
				IF (eMachineOperation = E_MACHINE_OPERATION.CHANGE)
				OR (eMachineOperation = E_MACHINE_OPERATION.UNLOAD) THEN
					uiDetailPayloadType := Config.auiMachineType[uiSelectedMachine];
				END_IF;
				uiSelectedMachine := UINT#0;
				uiSelectedType := UINT#0;
				xMachineServiceStarted := FALSE;
				eMachineOperation := E_MACHINE_OPERATION.NONE;
				eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
			END_IF;
		END_IF;

	E_CELL_MANAGER_STATE.MACHINE_FAULT_STOP:
		// Удерживаем штатную остановку до полного освобождения Motion-слоя.
		// Первичная MachineAlarm/Timeout остаётся активной только в FB_MACHINE.
		Command.stRobot.xStop := stRobotStatus.xBusy OR xMotionBusy;
		IF NOT stRobotStatus.xBusy AND NOT xMotionBusy THEN
			xRunning := FALSE;
			xStopRequested := FALSE;
			xMachineServiceStarted := FALSE;
			xReselectAfterRobotRelease := FALSE;
			IF (uiSelectedMachine >= FIRST_MACHINE)
			AND (uiSelectedMachine <= LAST_MACHINE) THEN
				axMachineStartPending[uiSelectedMachine] := FALSE;
			END_IF;
			uiSelectedMachine := UINT#0;
			uiSelectedType := UINT#0;
			eMachineOperation := E_MACHINE_OPERATION.NONE;
			eState := E_CELL_MANAGER_STATE.IDLE;
		END_IF;

	E_CELL_MANAGER_STATE.SELECT_FALLBACK:
		IF (uiBlankPayloadType < UINT#1)
		OR (uiBlankPayloadType > Config.uiTypeCount) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_MAGAZINE;
			eState := E_CELL_MANAGER_STATE.ERROR;
		ELSE
			uiCandidateMachine := SelectMachineForHeldBlank(
				uiProductType := uiBlankPayloadType,
				uiCurrentMachine := uiSelectedMachine
			);
		END_IF;
		IF (eState = E_CELL_MANAGER_STATE.SELECT_FALLBACK)
		AND (uiCandidateMachine > UINT#0) THEN
			uiSelectedMachine := uiCandidateMachine;
			uiSelectedType := uiBlankPayloadType;
			eState := E_CELL_MANAGER_STATE.ROUTE_TO_TARGET;
		ELSIF eState = E_CELL_MANAGER_STATE.SELECT_FALLBACK THEN
			uiSelectedMachine := UINT#0;
			iPutSlot := SINT#0;
			// Исходный слот гарантированно освободился после подтверждённой TAKE.
			IF (iTakeOriginSlot >= SINT#1)
			AND (SINT_TO_UINT(iTakeOriginSlot) <= SINT_TO_UINT(GVL_CELL_SETTINGS.NumberDetail)) THEN
				iPutSlot := iTakeOriginSlot;
			END_IF;
			IF iPutSlot = SINT#0 THEN
				iPutSlot := stMagazineStatus.stTypeStatus.aiFreeSlot[uiBlankPayloadType];
			END_IF;
			IF (iPutSlot > SINT#0) AND xMagazineReady THEN
				eMagazineOperation := E_MAGAZINE_OPERATION.RETURN_BLANK;
				eState := E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE;
			ELSE
				eState := E_CELL_MANAGER_STATE.WAIT_MAGAZINE;
			END_IF;
		END_IF;

	E_CELL_MANAGER_STATE.WAIT_MAGAZINE:
		IF xStopRequested
		AND NOT stMagazineStatus.xBusy
		AND NOT stRobotStatus.xBusy THEN
			xRunning := FALSE;
			eState := E_CELL_MANAGER_STATE.IDLE;
		ELSIF stMagazineStatus.xError THEN
			IF stMagazineStatus.xRobotStopRequired THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_MAGAZINE;
				eState := E_CELL_MANAGER_STATE.ERROR;
			ELSE
				xRunning := FALSE;
				eState := E_CELL_MANAGER_STATE.IDLE;
			END_IF;
		ELSIF stRobotStatus.xBlankAvailable THEN
			IF (uiBlankPayloadType < UINT#1)
			OR (uiBlankPayloadType > Config.uiTypeCount) THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_MAGAZINE;
				eState := E_CELL_MANAGER_STATE.ERROR;
			ELSE
				IF (SelectMachineForHeldBlank(
					uiProductType := uiBlankPayloadType,
					uiCurrentMachine := uiSelectedMachine
				) > UINT#0)
				OR (stMagazineStatus.stTypeStatus.aiFreeSlot[uiBlankPayloadType] > SINT#0) THEN
					eState := E_CELL_MANAGER_STATE.SELECT_FALLBACK;
				END_IF;
			END_IF;
		ELSIF stRobotStatus.xDetailAvailable THEN
			IF (uiDetailPayloadType < UINT#1)
			OR (uiDetailPayloadType > Config.uiTypeCount) THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE;
				eState := E_CELL_MANAGER_STATE.ERROR;
			ELSE
				IF (stMagazineStatus.stTypeStatus.aiFreeSlot[uiDetailPayloadType] > SINT#0)
				AND xMagazineReady THEN
					eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
				END_IF;
			END_IF;
		ELSE
			uiCandidateMachine := SelectMachineBeforeTake();
			IF uiCandidateMachine = UINT#0 THEN
				uiCandidateMachine := SelectMachineForUnload(uiCurrentMachine := uiSelectedMachine);
			END_IF;
			IF uiCandidateMachine > UINT#0 THEN
				IF xMagazineReady THEN
					eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
				ELSE
					eState := E_CELL_MANAGER_STATE.WAIT_MAGAZINE;
				END_IF;
			ELSIF stMagazineStatus.xFinished THEN
				xRunning := FALSE;
				eState := E_CELL_MANAGER_STATE.IDLE;
			END_IF;
		END_IF;

	E_CELL_MANAGER_STATE.ERROR:
		xRunning := FALSE;
		IF stRobotStatus.xBusy THEN
			Command.stRobot.xStop := TRUE;
		END_IF;
		IF stMagazineStatus.xBusy THEN
			Command.stMagazine.xStop := TRUE;
		END_IF;
		xResetAllowed := NOT xGlobalError
			AND NOT stRobotStatus.xBusy
			AND NOT stMagazineStatus.xBusy
			AND NOT xAnyMachineBusy
			AND NOT xMotionBusy;
		IF xReset AND xResetAllowed THEN
			Error.dwErrorLast := Error.dwErrorActive;
			Error.dwErrorActive := DWORD#0;
			IF NOT stRobotStatus.xBlankAvailable THEN
				uiBlankPayloadType := UINT#0;
			END_IF;
			IF NOT stRobotStatus.xDetailAvailable THEN
				uiDetailPayloadType := UINT#0;
			END_IF;
			eState := E_CELL_MANAGER_STATE.IDLE;
		END_IF;
END_CASE;

// Фиксируем позу только после завершённой штатной остановки или нормального
// окончания цикла. Аварийный переход оставляет xSafetyHomeRequired активным.
IF xWasRunning
AND NOT xRunning
AND (eState = E_CELL_MANAGER_STATE.IDLE)
AND NOT xSafetyHomeRequired THEN
	lrStoppedPoseX := lrRobotActualX;
	lrStoppedPoseY := lrRobotActualY;
	lrStoppedPoseZ := lrRobotActualZ;
	xStoppedPoseValid := TRUE;
END_IF;
xWasRunning := xRunning;

IF eState <> E_CELL_MANAGER_STATE.ERROR THEN
	xResetAllowed := FALSE;
END_IF;

Status.xRunning := xRunning;
Status.xStopPending := xStopRequested AND xRunning;
Status.xBusy := xRunning
	AND (eState <> E_CELL_MANAGER_STATE.IDLE)
	AND (eState <> E_CELL_MANAGER_STATE.ERROR);
Status.xWaitingMachine := (eState = E_CELL_MANAGER_STATE.WAIT_TARGET)
	OR (eState = E_CELL_MANAGER_STATE.SELECT_FALLBACK);
Status.xWaitingMagazine := eState = E_CELL_MANAGER_STATE.WAIT_MAGAZINE;
Status.xError := eState = E_CELL_MANAGER_STATE.ERROR;
Status.xReadyToStart := xReadyToStart;
Status.xStartAllowed := xReadyToStart
	OR (xRunning
		AND xStopRequested
		AND NOT xManual
		AND (eState <> E_CELL_MANAGER_STATE.MACHINE_FAULT_STOP));
Status.xStopAllowed := xRunning AND NOT xStopRequested;
Status.xResetAllowed := xResetAllowed;
Status.xManualAllowed := TRUE;
// В общей аварии оператору оставляем только ручное восстановление.
Status.xAutomaticAllowed := NOT xGlobalError;
Status.xDrivesReady := xDrivesReady;
Status.xRobotReady := xRobotReady;
Status.xMagazineReady := xMagazineReady;
Status.xSafetyHomeRequired := xSafetyHomeRequired;
Status.xRobotAtSafetyHome := xRobotAtSafetyHome;
Status.xStartCheckCellIdle := xStartCheckCellIdle;
Status.xStartCheckAutomaticMode := xStartCheckAutomaticMode;
Status.xStartCheckNoBlockingError := xStartCheckNoBlockingError;
Status.xStartCheckRobotInterfaceReady := xStartCheckRobotInterfaceReady;
Status.xStartCheckConfigurationValid := xStartCheckConfigurationValid;
Status.xStartCheckDrivesReady := xStartCheckDrivesReady;
Status.xStartCheckRobotReady := xStartCheckRobotReady;
Status.xStartCheckMagazineReady := xStartCheckMagazineReady;
Status.xStartCheckTaskAvailable := xStartCheckTaskAvailable;
Status.xStartCheckSafetyHome := xStartCheckSafetyHome;
Status.uiStartConditionsMet := uiStartConditionsMet;
Status.uiStartConditionsTotal := UINT#10;
Status.uiReadyMachines := uiReadyMachines;
Status.uiSelectedMachine := uiSelectedMachine;
Status.uiActiveMagazine := uiActiveMagazine;
Status.eMagazineOperation := eMagazineOperation;
CASE eState OF
	E_CELL_MANAGER_STATE.WAIT_GRIPPER1_CONTENT: uiOperatorPrompt := UINT#1;
	E_CELL_MANAGER_STATE.WAIT_GRIPPER1_TYPE: uiOperatorPrompt := UINT#2;
	E_CELL_MANAGER_STATE.WAIT_GRIPPER2_CONTENT: uiOperatorPrompt := UINT#3;
	E_CELL_MANAGER_STATE.WAIT_GRIPPER2_TYPE: uiOperatorPrompt := UINT#4;
	E_CELL_MANAGER_STATE.WAIT_START_MACHINE: uiOperatorPrompt := UINT#5;
ELSE
	uiOperatorPrompt := UINT#0;
END_CASE;
Status.xOperatorPromptActive := uiOperatorPrompt <> UINT#0;
Status.xOperatorChoiceAllowed := Status.xOperatorPromptActive
	AND NOT xManual
	AND NOT xGlobalError
	AND (Error.dwErrorActive = DWORD#0)
	AND xRobotInterfaceReady
	AND xConfigurationValid
	AND xDrivesReady
	AND xRobotReady
	AND xMagazineReady
	AND (NOT xSafetyHomeRequired OR xRobotAtSafetyHome);
Status.xOperatorCancelAllowed := Status.xOperatorPromptActive;
Status.uiOperatorPrompt := uiOperatorPrompt;
Status.uiOperatorTypeMask := uiOperatorTypeMask;
Status.uiOperatorMachineMask := uiOperatorMachineMask;

// Во время TAKE/CHANGE тип будущей заготовки уже известен. Передаём его
// FB_ROBOT до закрытия первого захвата, чтобы авария между CLAMP и DONE не
// оставила физически взятую заготовку с типом 0.
IF ((eMagazineOperation = E_MAGAZINE_OPERATION.TAKE)
	OR (eMagazineOperation = E_MAGAZINE_OPERATION.CHANGE))
AND (uiSelectedType >= UINT#1)
AND (uiSelectedType <= Config.uiTypeCount) THEN
	Command.uiBlankPayloadType := uiSelectedType;
ELSE
	Command.uiBlankPayloadType := uiBlankPayloadType;
END_IF;
Command.uiDetailPayloadType := uiDetailPayloadType;

CASE eState OF
	E_CELL_MANAGER_STATE.IDLE: Diag.eState := E_CELL_STATE.IDLE;
	E_CELL_MANAGER_STATE.PRESTART_IDENTIFY,
	E_CELL_MANAGER_STATE.WAIT_GRIPPER1_CONTENT,
	E_CELL_MANAGER_STATE.WAIT_GRIPPER1_TYPE,
	E_CELL_MANAGER_STATE.WAIT_GRIPPER2_CONTENT,
	E_CELL_MANAGER_STATE.WAIT_GRIPPER2_TYPE,
	E_CELL_MANAGER_STATE.WAIT_START_MACHINE: Diag.eState := E_CELL_STATE.ROUTE_PAYLOAD;
	E_CELL_MANAGER_STATE.PLAN_TARGET, E_CELL_MANAGER_STATE.SELECT_FALLBACK: Diag.eState := E_CELL_STATE.SELECT_MACHINE;
	E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE: Diag.eState := E_CELL_STATE.MAGAZINE;
	E_CELL_MANAGER_STATE.RELEASE_MAGAZINE: Diag.eState := E_CELL_STATE.RELEASE_MAGAZINE;
	E_CELL_MANAGER_STATE.ROUTE_TO_TARGET: Diag.eState := E_CELL_STATE.MOVE_TO_MACHINE;
	E_CELL_MANAGER_STATE.RELEASE_ROBOT_COMMAND: Diag.eState := E_CELL_STATE.RELEASE_ROBOT_COMMAND;
	E_CELL_MANAGER_STATE.WAIT_TARGET: Diag.eState := E_CELL_STATE.WAIT_MACHINE;
	E_CELL_MANAGER_STATE.SERVICE_TARGET: Diag.eState := E_CELL_STATE.SERVICE_MACHINE;
	E_CELL_MANAGER_STATE.MACHINE_FAULT_STOP: Diag.eState := E_CELL_STATE.SERVICE_MACHINE;
	E_CELL_MANAGER_STATE.WAIT_MAGAZINE: Diag.eState := E_CELL_STATE.WAIT_MAGAZINE;
	E_CELL_MANAGER_STATE.ERROR: Diag.eState := E_CELL_STATE.ERROR;
END_CASE;

CycleStatus.eState := eState;
CycleStatus.uiSelectedMachine := uiSelectedMachine;
CycleStatus.uiSelectedType := uiSelectedType;
CycleStatus.uiBlankPayloadType := uiBlankPayloadType;
CycleStatus.uiDetailPayloadType := uiDetailPayloadType;
CycleStatus.iTakeSlot := iTakeSlot;
CycleStatus.iPutSlot := iPutSlot;
CycleStatus.xReturningBlank := (eMagazineOperation = E_MAGAZINE_OPERATION.RETURN_BLANK)
	AND ((eState = E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE)
		OR (eState = E_CELL_MANAGER_STATE.RELEASE_MAGAZINE));
CycleStatus.axMachineStartPending := axMachineStartPending;
CycleStatus.auiBlankCount := stMagazineStatus.stTypeStatus.auiBlankCount;
CycleStatus.auiDetailCount := stMagazineStatus.stTypeStatus.auiDetailCount;
CycleStatus.auiFreeCount := stMagazineStatus.stTypeStatus.auiFreeCount;

Error.dwAlarmActive := Error.dwErrorActive;
IF Error.dwErrorActive <> DWORD#0 THEN
	Error.dwErrorLast := Error.dwErrorActive;
END_IF;
Error.stErrorActive := UpdateErrorView(dwError := Error.dwErrorActive);
Error.stErrorLast := UpdateErrorView(dwError := Error.dwErrorLast);
FaultStatus.xResetAllowed := Status.xResetAllowed AND NOT FaultStatus.xBusy;
