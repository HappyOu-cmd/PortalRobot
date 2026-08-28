FUNCTION_BLOCK FB_ROBOT
VAR_INPUT
	xTestInitialize : BOOL;
	auiTestGripperContent : ARRAY [1..2] OF UINT;
	auiTestGripperType : ARRAY [1..2] OF UINT;
	uiTestOrientation : UINT;
	xExternalCommandInhibit : BOOL; // Запрет приёма следующей команды стендом после снятия физического ключа
	xSimulationAccelerationEnable : BOOL; // Разрешить ускорение виртуальных таймеров только в симуляции
	uiSimulationTimeFactor : UINT := 1; // Коэффициент виртуального времени 1..100

	stMachine_1_Command : ST_ROBOT_COMMAND; // Команда роботу от первого станка
	stMachine_2_Command : ST_ROBOT_COMMAND; // Команда роботу от второго станка
	stMachine_3_Command : ST_ROBOT_COMMAND; // Команда роботу от третьего станка
	stMagazineCommand   : ST_ROBOT_COMMAND; // Команда роботу от магазина
	stCellCommand       : ST_ROBOT_COMMAND; // Команда позиционирования от менеджера ячейки
	uiBlankPayloadType  : UINT; // Тип заготовки из состояния цикла
	uiDetailPayloadType : UINT; // Тип готовой детали из состояния цикла
	stHmiCommand        : ST_ROBOT_COMMAND; // Ручная команда роботу с HMI
	xReset              : BOOL; // Сброс ошибок робота
    xMode               : BOOL; // Режим робота: TRUE — Modbus, FALSE — SoftMotion
	xManual      		: BOOL; // 1 - ручной режим работы, 0 - автоматический режим работы
	xGlobalError        : BOOL; // Глобальная ошибка ячейки
	xEquipmentStopRequired : BOOL; // Владелец оборудования требует зависимую ошибку робота
	xModbusBusy         : BOOL; // Внешний робот выполняет команду
	xModbusDone         : BOOL; // Внешний робот завершил команду
	xModbusError        : BOOL; // Ошибка обмена или внешнего робота
	stModbusStatus      : ST_ROBOT_MODBUS_STATUS; // Декодированная обратная связь SC-500
	xHmiDrivesEnable    : BOOL; // Исходный запрос HMI на включение приводов
	xHmiDrivesDisable   : BOOL; // Исходный запрос HMI на отключение приводов
	xHmiStop            : BOOL; // Исходный запрос HMI на остановку
	xHmiDrivesEnableAccepted : BOOL; // RunMotion принял запрос включения в исходном состоянии цикла
	xHmiDrivesDisableAccepted : BOOL; // RunMotion принял запрос отключения в исходном состоянии цикла
	xHmiStopAccepted    : BOOL; // RunMotion принял запрос остановки в исходном состоянии цикла
	xHmiDrivesEnableAllowed : BOOL; // Текущее разрешение включения от владельца Motion-слоя
	xHmiDrivesDisableAllowed : BOOL; // Текущее разрешение отключения от владельца Motion-слоя
	xHmiStopAllowed     : BOOL; // Текущее разрешение остановки от владельца Motion-слоя
	xHmiPermit          : BOOL; // Ручные команды HMI разрешены режимом ячейки
	xManualRecoveryAllowed : BOOL; // Разрешить включение приводов в аварийном ручном восстановлении
	xDrivesPowered      : BOOL; // Все три привода включены
	xDrivesOff          : BOOL; // Все три привода и группа фактически отключены
	xDrivesReady        : BOOL; // Все приводы готовы к движению
	xDriveError         : BOOL; // Активна ошибка оси или группы осей
	xMotionBusy         : BOOL; // Одна из осей выполняет движение
	xSingleAxisMotionBusy : BOOL; // Один из FB_AXIS владеет осью; групповое движение запускать нельзя
	FaultRequest        : ST_ROBOT_FAULT_REQUEST; // Единый контракт диагностической инъекции
	tGripper1OpenTime   : TIME := T#500MS; // Время открытия первого захвата в модели
	tGripper1CloseTime  : TIME := T#500MS; // Время закрытия первого захвата в модели
	tGripper2OpenTime   : TIME := T#500MS; // Время открытия второго захвата в модели
	tGripper2CloseTime  : TIME := T#500MS; // Время закрытия второго захвата в модели
	tGripperChangeTime  : TIME := T#700MS; // Время смены рабочего захвата в модели

    stPoint : ARRAY [0..GVL_POINT.iPointNumber] OF ST_POINT; // Глобальная таблица точек робота

    xSimBlankAvailable : BOOL; // Начальное наличие заготовки в модели захвата

END_VAR
VAR_OUTPUT
	Command       : ST_ROBOT_COMMAND; // Выбранная команда текущего цикла
	ModbusCommand : ST_ROBOT_COMMAND; // Команда внешнему роботу по Modbus
	Status        : ST_ROBOT_STATUS; // Рабочие статусы робота
	Diag          : ST_ROBOT_DIAG; // Состояние автомата и активная команда
	Error         : ST_ROBOT_ERRORS; // Активные и последние ошибки
	GripperDiag   : ST_GRIPPER_DIAG; // Диагностика внутреннего блока захвата
	GripperError  : ST_GRIPPER_ERRORS; // Активные и последние ошибки захвата
	FaultStatus : ST_ROBOT_FAULT_STATUS; // Сводное состояние инжекторов робота
END_VAR
VAR
	fbMotionManager  : FB_MOTION_MANAGER; // Менеджер перемещения по точкам
    fbGripper        : FB_GRIPPER_SIMULATION; // Модель двухпозиционного захвата
	stGripperCommand : ST_GRIPPER_COMMAND; // Команда внутренней модели захвата

    eState        : E_ROBOT_STATE := E_ROBOT_STATE.IDLE; // Текущее состояние автомата робота
    eActiveAction : E_ROBOT_ACTION := E_ROBOT_ACTION.NONE; // Защёлкнутое действие
    eActivePoint  : E_POINT_NAME; // Защёлкнутая целевая точка
	iActiveSlot   : SINT; // Защёлкнутый слот для всей Modbus-транзакции
	uiActiveMagazineId : UINT; // Защёлкнутый магазин для всей Modbus-транзакции
	uiRobotMagazineContext : UINT; // Физический контекст магазина сохраняется между командами
	xEquipmentStopLatched : BOOL; // Робот остановлен именно аварией обслуживаемого оборудования

	xMotionExecute  : BOOL; // Запрос выполнения перемещения
	xGripperExecute : BOOL; // Запрос выполнения действия захвата
	xManualGripperRequest : BOOL; // Ручной захват разрешён независимо от состояния автомата робота
	xManualGripperOverrideExecute : BOOL; // Прямой импульс FB_GRIPPER из ERROR робота
	eManualGripperAction : E_ROBOT_ACTION; // Действие прямого ручного импульса
	xActiveManualGripper : BOOL; // Текущее действие захвата запущено вручную
	xMagazineCommandActive : BOOL; // Активная команда получена от FB_MAGAZINE
	rtReset               : R_TRIG; // Фронт команды сброса робота
	rtHmiDrivesEnable     : R_TRIG; // Фронт запроса включения приводов с HMI
	rtHmiDrivesDisable    : R_TRIG; // Фронт запроса отключения приводов с HMI
	rtHmiStop             : R_TRIG; // Фронт запроса остановки с HMI
	xPowerAllowed         : BOOL; // Визуальная доступность кнопки питания приводов
	xStopAllowed          : BOOL; // Визуальная доступность кнопки остановки
	xResetAllowed         : BOOL; // Визуальная доступность кнопки сброса
	xResetAccepted        : BOOL; // Общий сброс принят владельцем робота
	xExternalResetPending : BOOL; // Удерживает асинхронный Reset до подтверждения SC-500
	xExternalResetIssued  : BOOL; // Reset хотя бы один цикл был передан Modbus-адаптеру
	xModbusCommandStarted : BOOL; // Текущая команда получила собственную активную транзакцию
	tonModbusStartTimeout : TON; // Защита от вечного ожидания приёма команды адаптером
	fbRobotFaultInjector  : FB_ROBOT_FAULT_INJECTOR; // Безопасная недопустимая команда робота
	xRobotFaultAllowed    : BOOL; // Владелец готов проверить тестовую команду
	uiTestBlankPayloadType : UINT;
	uiTestDetailPayloadType : UINT;
	xTestBlankPayloadPending : BOOL;
	xTestDetailPayloadPending : BOOL;

END_VAR

VAR_IN_OUT
    stMotionManager : ST_MOTION_MANAGER; // Данные менеджера движения
    GroupData       : ST_AXIS_GROUP; // Данные группы осей XYZ
    stPointManager  : ST_POINT_MANAGER; // Данные проверки точки
END_VAR

VAR CONSTANT
	ERR_ROBOT_WRONG_ACTION : DWORD := DWORD#16#0000_0001; // Недопустимое действие робота
    ERR_ROBOT_MOTION       : DWORD := DWORD#16#0000_0002; // Ошибка менеджера движения
    ERR_ROBOT_GRIPPER      : DWORD := DWORD#16#0000_0004; // Ошибка захвата
	ERR_ROBOT_MODBUS_COMM  : DWORD := DWORD#16#0000_0008; // Ошибка связи Modbus TCP
	ERR_ROBOT_STOP         : DWORD := DWORD#16#0000_0010; // Остановка команды робота
	ERR_EXTERNAL_ROBOT     : DWORD := DWORD#16#0000_0020; // Контроллер робота сообщил аварию
	WRN_RESET_EXECUTE_ACTIVE : UINT := 1; // Команда робота ещё активна
	WRN_RESET_STOP_ACTIVE    : UINT := 2; // Команда остановки ещё активна
	WRN_RESET_GLOBAL_ERROR   : UINT := 3; // Глобальная ошибка ещё активна
	WRN_RESET_MOTION_ERROR   : UINT := 4; // Ошибка менеджера движения ещё активна
	WRN_RESET_GRIPPER_ERROR  : UINT := 5; // Ошибка захвата ещё активна
	WRN_RESET_MODBUS_ERROR   : UINT := 6; // Ошибка внешнего робота ещё активна
	WRN_HMI_MANUAL_REQUIRED  : UINT := 7; // Ручная команда запрещена режимом ячейки
	WRN_DRIVES_ENABLE_ERROR  : UINT := 8; // Команда приводов отклонена владельцем Motion-слоя
	WRN_STOP_DRIVES_NOT_READY: UINT := 9; // Остановка недоступна при неготовых приводах
	WRN_SIM_ERROR_NOT_ALLOWED: UINT := 11; // Тестовая команда запрещена текущим состоянием
END_VAR

// --- BEGIN IMPLEMENTATION ---

rtHmiDrivesEnable(CLK := xHmiDrivesEnable);
rtHmiDrivesDisable(CLK := xHmiDrivesDisable);
rtHmiStop(CLK := xHmiStop);

xPowerAllowed := ((NOT xDrivesOff) AND xHmiDrivesDisableAllowed)
	OR (xDrivesOff AND xHmiDrivesEnableAllowed);
xStopAllowed := xHmiStopAllowed;

IF (rtHmiDrivesEnable.Q AND NOT xHmiDrivesEnableAccepted)
OR (rtHmiDrivesDisable.Q AND NOT xHmiDrivesDisableAccepted) THEN
	IF NOT xHmiPermit THEN
		Diag.stWarning.uiCode := WRN_HMI_MANUAL_REQUIRED;
	ELSE
		Diag.stWarning.uiCode := WRN_DRIVES_ENABLE_ERROR;
	END_IF;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

IF rtHmiStop.Q
AND NOT xHmiStopAccepted THEN
	IF NOT xHmiPermit THEN
		Diag.stWarning.uiCode := WRN_HMI_MANUAL_REQUIRED;
	ELSE
		Diag.stWarning.uiCode := WRN_STOP_DRIVES_NOT_READY;
	END_IF;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

// Команды по умолчанию
xMotionExecute := FALSE;
xGripperExecute := FALSE;
xManualGripperRequest := FALSE;
xManualGripperOverrideExecute := FALSE;
xMagazineCommandActive := FALSE;

Command.xExecute := FALSE;
Command.xStop := FALSE;
Command.xReset := FALSE;
Command.eAction := E_ROBOT_ACTION.NONE;
Command.eSetPoint := E_POINT_NAME.NONE;
Command.iActiveSlot := 0;
Command.uiMagazineId := UINT#0;

ModbusCommand.xExecute := FALSE;
ModbusCommand.xStop := FALSE;
ModbusCommand.xReset := FALSE;
ModbusCommand.eAction := E_ROBOT_ACTION.NONE;
ModbusCommand.eSetPoint := E_POINT_NAME.NONE;
ModbusCommand.iActiveSlot := 0;
ModbusCommand.uiMagazineId := UINT#0;

//Определяем какой режим работы активен
IF NOT xManual THEN
	IF stCellCommand.xExecute OR stCellCommand.xStop THEN
		Command := stCellCommand;
	ELSIF stMachine_1_Command.xExecute OR stMachine_1_Command.xStop THEN
		Command := stMachine_1_Command;
	ELSIF stMachine_2_Command.xExecute OR stMachine_2_Command.xStop THEN
		Command := stMachine_2_Command;
	ELSIF stMachine_3_Command.xExecute OR stMachine_3_Command.xStop THEN
		Command := stMachine_3_Command;
	ELSIF stMagazineCommand.xExecute OR stMagazineCommand.xStop THEN
		Command := stMagazineCommand;
		xMagazineCommandActive := TRUE;
	END_IF;
ELSE
	IF stMagazineCommand.xExecute OR stMagazineCommand.xStop THEN
		Command := stMagazineCommand;
		xMagazineCommandActive := TRUE;
	ELSE
		Command := stHmiCommand;
	END_IF;
END_IF;

// Уже принятую внешним контроллером команду не прерываем. Запрет действует
// только в IDLE, то есть перед началом следующего высокоуровневого действия.
IF xMode
AND xExternalCommandInhibit
AND (eState = E_ROBOT_STATE.IDLE) THEN
	Command.xExecute := FALSE;
END_IF;

// Внешний Stop — самостоятельная приоритетная команда. Он должен дойти до
// адаптера и тогда, когда FB_ROBOT уже защёлкнул ERROR после общей остановки.
IF xMode
AND (xHmiStopAccepted
	OR Command.xStop
	OR (xGlobalError AND stModbusStatus.xBusy)) THEN
	ModbusCommand.xStop := TRUE;
END_IF;

// Класс ошибки определяет оборудование-владелец. FB_ROBOT только выполняет
// зависимую реакцию: активное действие останавливает, неподвижный робот сразу
// переводит в ERROR без бессмысленной команды Stop.
IF xEquipmentStopRequired
AND (eState <> E_ROBOT_STATE.ERROR) THEN
	xEquipmentStopLatched := TRUE;
	IF (eState = E_ROBOT_STATE.MOTION)
	OR (eState = E_ROBOT_STATE.GRIPPER)
	OR (eState = E_ROBOT_STATE.MODBUS) THEN
		Command.xStop := TRUE;
	ELSE
		Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_STOP;
		eState := E_ROBOT_STATE.ERROR;
	END_IF;
END_IF;

// RunRobot уже выполнил все PLC-проверки и передал Execute только принятой
// ручной команде. Захват остаётся независимым от состояния осей и робота.
IF xManual AND stHmiCommand.xExecute THEN
	CASE stHmiCommand.eAction OF
		E_ROBOT_ACTION.UNCLAMP_1,
		E_ROBOT_ACTION.CLAMP_1,
		E_ROBOT_ACTION.UNCLAMP_2,
		E_ROBOT_ACTION.CLAMP_2,
		E_ROBOT_ACTION.ROTATE_TO_BLANK,
		E_ROBOT_ACTION.ROTATE_TO_DETAIL:
			xManualGripperRequest := TRUE;
	END_CASE;
END_IF;

// Готовность сброса рассчитывается после выбора актуального владельца команды.
// Ошибки вложенных FB считаются сбрасываемыми только после снятия удерживаемого
// источника и публикации их собственного xResetAllowed.
xResetAllowed := xHmiPermit
	AND (NOT xGlobalError OR xManualRecoveryAllowed)
	AND NOT Command.xExecute
	AND NOT Command.xStop
	AND NOT xMotionBusy
	AND (NOT xMode OR stModbusStatus.xCommunicationAlive)
	AND (xDriveError
		OR (eState = E_ROBOT_STATE.ERROR)
		OR (NOT xMode AND stMotionManager.Status.xError)
		OR (NOT xMode AND fbGripper.Status.xError)
		OR (xMode AND xModbusError))
	AND (xMode OR NOT stMotionManager.Status.xError
		OR FaultStatus.stPoint.xResetAllowed)
	AND (xMode OR NOT fbGripper.Status.xError
		OR FaultStatus.stGripper.xResetAllowed);
xResetAccepted := xReset AND xResetAllowed;
IF xMode AND xResetAccepted THEN
	xExternalResetPending := TRUE;
	xExternalResetIssued := FALSE;
ELSIF NOT xMode THEN
	xExternalResetPending := FALSE;
	xExternalResetIssued := FALSE;
END_IF;

// Недопустимое действие проверяется в IDLE до запуска Motion или захвата.
xRobotFaultAllowed := (eState = E_ROBOT_STATE.IDLE)
	AND NOT Command.xExecute
	AND NOT Command.xStop
	AND NOT xMode
	AND NOT xGlobalError
	AND NOT xDriveError
	AND (Error.dwErrorActive = DWORD#0)
	AND NOT stMotionManager.Status.xError
	AND NOT fbGripper.Status.xError;

fbRobotFaultInjector(
	Request := FaultRequest,
	xOwnerAllowed := xRobotFaultAllowed
);
FaultStatus.stRobot := fbRobotFaultInjector.Status;

IF fbRobotFaultInjector.Status.xRejected THEN
	Diag.stWarning.uiCode := WRN_SIM_ERROR_NOT_ALLOWED;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

IF fbRobotFaultInjector.xWrongAction THEN
	Command.xExecute := TRUE;
	Command.xStop := FALSE;
	Command.eAction := E_ROBOT_ACTION.NONE;
	Command.eSetPoint := E_POINT_NAME.NONE;
END_IF;

Command.xReset := xResetAccepted;

rtReset(CLK := xReset);

IF rtReset.Q
AND ((eState = E_ROBOT_STATE.ERROR) OR xDriveError)
AND NOT xResetAccepted THEN
	IF NOT xHmiPermit THEN
		Diag.stWarning.uiCode := WRN_HMI_MANUAL_REQUIRED;
	ELSIF eState <> E_ROBOT_STATE.ERROR THEN
		// Ошибку Motion-слоя сбрасывают оси и группа тем же общим импульсом.
		Diag.stWarning.uiCode := UINT#0;
    ELSIF Command.xExecute THEN
        Diag.stWarning.uiCode := WRN_RESET_EXECUTE_ACTIVE;
    ELSIF Command.xStop THEN
        Diag.stWarning.uiCode := WRN_RESET_STOP_ACTIVE;
    ELSIF xGlobalError AND NOT xManualRecoveryAllowed THEN
        Diag.stWarning.uiCode := WRN_RESET_GLOBAL_ERROR;
    ELSIF stMotionManager.Status.xError
	OR (NOT xMode AND xDriveError) THEN
        Diag.stWarning.uiCode := WRN_RESET_MOTION_ERROR;
    ELSIF fbGripper.Status.xError THEN
        Diag.stWarning.uiCode := WRN_RESET_GRIPPER_ERROR;
    ELSIF xModbusError THEN
        Diag.stWarning.uiCode := WRN_RESET_MODBUS_ERROR;
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

// =====================================================
// Автомат FB_ROBOT
// =====================================================

// Таймаут исполнения принадлежит FB_ROBOT_MODBUS, но до создания активной
// транзакции его TON ещё не работает. Отдельно ограничиваем фазу ожидания Busy.
tonModbusStartTimeout(
	IN := xMode
		AND (eState = E_ROBOT_STATE.MODBUS)
		AND NOT xModbusCommandStarted,
	PT := T#30S
);

// Ошибка оси или группы является первопричиной в Motion-слое и отдельной
// каскадной ошибкой робота для его публичного статуса и журнала.
IF NOT xMode AND xDriveError THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_MOTION;
	eState := E_ROBOT_STATE.ERROR;
ELSIF xMode AND xModbusError THEN
	IF stModbusStatus.xRobotAlarm THEN
		Error.dwErrorActive := Error.dwErrorActive OR ERR_EXTERNAL_ROBOT;
	ELSE
		Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_MODBUS_COMM;
	END_IF;
	eState := E_ROBOT_STATE.ERROR;
END_IF;

CASE eState OF

    E_ROBOT_STATE.IDLE:

        Status.xBusy := FALSE;
        Status.xDone := FALSE;
        Status.xError := FALSE;

        IF Command.xExecute THEN
            eActiveAction := Command.eAction;
            eActivePoint := Command.eSetPoint;
			iActiveSlot := Command.iActiveSlot;
			uiActiveMagazineId := Command.uiMagazineId;
			IF (Command.uiMagazineId >= UINT#1)
			AND (Command.uiMagazineId <= UINT#2)
			AND (Command.eAction = E_ROBOT_ACTION.MOVE_TO_POINT)
			AND ((Command.eSetPoint = E_POINT_NAME.MAGAZINE_IN_SLOT)
				OR (Command.eSetPoint = E_POINT_NAME.MAGAZINE_CHANGE)) THEN
				uiRobotMagazineContext := Command.uiMagazineId;
			END_IF;

            IF xMode THEN
				xModbusCommandStarted := FALSE;
				eState := E_ROBOT_STATE.MODBUS;

            ELSE
                CASE Command.eAction OF

                    E_ROBOT_ACTION.MOVE_TO_POINT:
                        // CODESYS переводит группу в ошибку, если GroupMoving
                        // запускается при активном single-axis FB. Команда
                        // остаётся в IDLE до освобождения всех FB_AXIS.
                        IF xDrivesReady AND NOT xMotionBusy THEN
                            eState := E_ROBOT_STATE.MOTION;
                        END_IF;

                    E_ROBOT_ACTION.UNCLAMP_1,
                    E_ROBOT_ACTION.CLAMP_1,
                    E_ROBOT_ACTION.UNCLAMP_2,
                    E_ROBOT_ACTION.CLAMP_2,
                    E_ROBOT_ACTION.ROTATE_TO_BLANK,
                    E_ROBOT_ACTION.ROTATE_TO_DETAIL:
						xActiveManualGripper := xManualGripperRequest;
                        eState := E_ROBOT_STATE.GRIPPER;

                ELSE
                    Error.dwErrorActive :=
                        Error.dwErrorActive OR ERR_ROBOT_WRONG_ACTION;

                    eState := E_ROBOT_STATE.ERROR;
                END_CASE;
            END_IF;
        END_IF;


    E_ROBOT_STATE.MOTION:

        Status.xBusy := TRUE;
        xMotionExecute := NOT xSingleAxisMotionBusy;

		IF xHmiStopAccepted OR Command.xStop THEN
			// Операторский Stop отменяет действие штатно. Stop от оборудования
			// дополнительно защёлкивает зависимую ошибку робота.
            xMotionExecute := FALSE;
            Status.xBusy := FALSE;
            Status.xDone := FALSE;
            eActiveAction := E_ROBOT_ACTION.NONE;
            eActivePoint := E_POINT_NAME.NONE;
			IF xEquipmentStopRequired THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_STOP;
				eState := E_ROBOT_STATE.ERROR;
			ELSE
				eState := E_ROBOT_STATE.IDLE;
			END_IF;

        ELSIF xGlobalError THEN
            Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_STOP;
            eState := E_ROBOT_STATE.ERROR;

        ELSIF stMotionManager.Status.xError THEN
            Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_MOTION;
            eState := E_ROBOT_STATE.ERROR;

		ELSIF stMotionManager.Status.xDone THEN
			IF (eActiveAction = E_ROBOT_ACTION.MOVE_TO_POINT)
			AND (eActivePoint <> E_POINT_NAME.MAGAZINE_IN_SLOT)
			AND (eActivePoint <> E_POINT_NAME.MAGAZINE_CHANGE) THEN
				uiRobotMagazineContext := UINT#0;
			END_IF;
            eState := E_ROBOT_STATE.DONE;
        END_IF;


    E_ROBOT_STATE.GRIPPER:

        Status.xBusy := TRUE;
        xGripperExecute := TRUE;

		IF xEquipmentStopRequired THEN
			xGripperExecute := FALSE;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_STOP;
			eState := E_ROBOT_STATE.ERROR;

		ELSIF xGlobalError AND NOT xActiveManualGripper THEN
            Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_STOP;
            eState := E_ROBOT_STATE.ERROR;

        ELSIF fbGripper.Status.xError THEN
            Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_GRIPPER;
            eState := E_ROBOT_STATE.ERROR;

        ELSIF fbGripper.Status.xDone THEN
			xActiveManualGripper := FALSE;
            eState := E_ROBOT_STATE.DONE;
        END_IF;


	E_ROBOT_STATE.DONE:

        Status.xBusy := FALSE;
        Status.xDone := TRUE;

        IF NOT xMode THEN
        CASE eActiveAction OF

            E_ROBOT_ACTION.MOVE_TO_POINT:
                xMotionExecute := TRUE;

            E_ROBOT_ACTION.UNCLAMP_1,
            E_ROBOT_ACTION.CLAMP_1,
            E_ROBOT_ACTION.UNCLAMP_2,
            E_ROBOT_ACTION.CLAMP_2,
            E_ROBOT_ACTION.ROTATE_TO_BLANK,
            E_ROBOT_ACTION.ROTATE_TO_DETAIL:
                xGripperExecute := TRUE;

        END_CASE;
        END_IF;

		IF NOT Command.xExecute THEN
            Status.xDone := FALSE;
			xModbusCommandStarted := FALSE;
            eActiveAction := E_ROBOT_ACTION.NONE;
			eActivePoint := E_POINT_NAME.NONE;
			iActiveSlot := SINT#0;
			uiActiveMagazineId := UINT#0;
			eState := E_ROBOT_STATE.IDLE;
        END_IF;


	E_ROBOT_STATE.MODBUS:
		Status.xBusy := TRUE;
		// Execute — импульс от владельца команды. Адаптер Modbus может
		// быть занят FC03/FC16 дольше этого импульса. Поэтому до терминального
		// ответа передаём защёлкнутые action/point/slot, а не уже снятый Command.
		ModbusCommand.xExecute := TRUE;
		ModbusCommand.eAction := eActiveAction;
		ModbusCommand.eSetPoint := eActivePoint;
		ModbusCommand.iActiveSlot := iActiveSlot;
		ModbusCommand.uiMagazineId := uiActiveMagazineId;
		IF xModbusBusy THEN
			xModbusCommandStarted := TRUE;
		END_IF;

		IF Command.xStop OR xHmiStopAccepted OR xGlobalError THEN
			ModbusCommand.xStop := TRUE;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_STOP;
			eState := E_ROBOT_STATE.ERROR;
		ELSIF xModbusError THEN
			IF stModbusStatus.xRobotAlarm THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_EXTERNAL_ROBOT;
			ELSE
				Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_MODBUS_COMM;
			END_IF;
			eState := E_ROBOT_STATE.ERROR;
		ELSIF tonModbusStartTimeout.Q THEN
			// Адаптер не создал собственную транзакцию: не оставляем публичный
			// xBusy висеть бесконечно без CommandSeq и физического движения.
			ModbusCommand.xExecute := FALSE;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_MODBUS_COMM;
			eState := E_ROBOT_STATE.ERROR;
		ELSIF xModbusCommandStarted AND xModbusDone THEN
			IF (eActiveAction = E_ROBOT_ACTION.MOVE_TO_POINT)
			AND (eActivePoint <> E_POINT_NAME.MAGAZINE_IN_SLOT)
			AND (eActivePoint <> E_POINT_NAME.MAGAZINE_CHANGE) THEN
				uiRobotMagazineContext := UINT#0;
			END_IF;
			eState := E_ROBOT_STATE.DONE;
		END_IF;


    E_ROBOT_STATE.ERROR:

        Status.xBusy := FALSE;
        Status.xDone := FALSE;
        Status.xError := TRUE;

		// Ошибка координатного робота не блокирует независимый ручной захват.
		// Собственная ошибка FB_GRIPPER по-прежнему требует штатного сброса.
		IF NOT xMode AND xManualGripperRequest AND NOT fbGripper.Status.xError THEN
			xManualGripperOverrideExecute := TRUE;
			eManualGripperAction := stHmiCommand.eAction;
		END_IF;

		// В Modbus-режиме входной Reset только защёлкивает запрос для адаптера.
		// Локальную ошибку можно снять лишь после подтверждённого исчезновения
		// внешней аварии; иначе xExternalResetPending очистится до записи 1004.
		IF ((NOT xMode AND xResetAccepted)
			OR (xMode
				AND xExternalResetPending
				AND xExternalResetIssued
				AND NOT xModbusError
				AND NOT stModbusStatus.xBusy
				AND (stModbusStatus.uiExecutionState =
					TO_UINT(E_ROBOT_MODBUS_EXECUTION_STATE.IDLE))))
        AND NOT Command.xExecute
        AND NOT Command.xStop
        AND (NOT xGlobalError OR xManualRecoveryAllowed)
		AND (xMode OR NOT stMotionManager.Status.xError)
		AND (xMode OR NOT xDriveError)
		AND (xMode OR NOT fbGripper.Status.xError)
		AND (NOT xMode OR stModbusStatus.xCommunicationAlive) THEN

			Error.dwErrorLast := Error.dwErrorActive;
			Error.dwErrorActive := DWORD#0;
            Status.xError := FALSE;
			xExternalResetPending := FALSE;
			xExternalResetIssued := FALSE;
			xModbusCommandStarted := FALSE;
			xActiveManualGripper := FALSE;
			xEquipmentStopLatched := FALSE;
            eActiveAction := E_ROBOT_ACTION.NONE;
			eActivePoint := E_POINT_NAME.NONE;
			iActiveSlot := SINT#0;
			uiActiveMagazineId := UINT#0;
			eState := E_ROBOT_STATE.IDLE;
        END_IF;

END_CASE;

IF xMode AND xExternalResetPending THEN
	ModbusCommand.xReset := TRUE;
	xExternalResetIssued := TRUE;
END_IF;

// =====================================================
// Формирование команды FB_MOTION_MANAGER
// =====================================================

stMotionManager.Command.xExecute := NOT xMode AND xMotionExecute;
stMotionManager.Command.eTargetPoint := eActivePoint;
stMotionManager.Command.xReset := NOT xMode AND xResetAccepted;
stMotionManager.Command.xStop := NOT xMode AND (xHmiStopAccepted OR Command.xStop);
stMotionManager.Command.xGlobalError :=
    (NOT xMode AND xGlobalError AND NOT xManualRecoveryAllowed);


// =====================================================
// Вызов FB_MOTION_MANAGER
// =====================================================

fbMotionManager(
    stPoint := stPoint,
    xReset := NOT xMode AND xResetAccepted,
	FaultRequest := FaultRequest.stPoint,
    stMotionManager := stMotionManager,
    GroupData := GroupData,
    stPointManager := stPointManager
);
FaultStatus.stPoint := fbMotionManager.FaultStatus;


// =====================================================
// Вызов FB_GRIPPER
// =====================================================

stGripperCommand.xExecute := NOT xMode
	AND (xGripperExecute OR xManualGripperOverrideExecute);
stGripperCommand.xReset := NOT xMode AND xResetAccepted;
IF xManualGripperOverrideExecute THEN
	stGripperCommand.eAction := eManualGripperAction;
ELSE
	stGripperCommand.eAction := eActiveAction;
END_IF;

fbGripper(
	// Положение и захваты робота не подменяются записью сценария: runner
	// приводит их в нужное состояние штатными командами.
	xTestInitialize := FALSE,
	auiTestContent := auiTestGripperContent,
	uiTestOrientation := uiTestOrientation,
	Command := stGripperCommand,
	FaultRequest := FaultRequest.stGripper,
	xSimulationAccelerationEnable := xSimulationAccelerationEnable,
	uiSimulationTimeFactor := uiSimulationTimeFactor,
	tGripper1OpenTime := tGripper1OpenTime,
	tGripper1CloseTime := tGripper1CloseTime,
	tGripper2OpenTime := tGripper2OpenTime,
	tGripper2CloseTime := tGripper2CloseTime,
	tRotateTime := tGripperChangeTime,
	Diag => GripperDiag,
	Error => GripperError
);
FaultStatus.stGripper := fbGripper.FaultStatus;

IF xTestInitialize THEN
	uiTestBlankPayloadType := auiTestGripperType[1];
	uiTestDetailPayloadType := auiTestGripperType[2];
	xTestBlankPayloadPending := auiTestGripperContent[1] = UINT#1;
	xTestDetailPayloadPending := auiTestGripperContent[2] = UINT#2;
	uiRobotMagazineContext := UINT#0;
	xEquipmentStopLatched := FALSE;
END_IF;


// =====================================================
// Общие статусы
// =====================================================

IF xMode THEN
	CASE stModbusStatus.uiCurrentPoint OF
		10: Status.eCurrentPoint := E_POINT_NAME.MACHINE_1_ABOVE;
		11: Status.eCurrentPoint := E_POINT_NAME.MACHINE_1_INSIDE;
		12: Status.eCurrentPoint := E_POINT_NAME.MACHINE_1_CHUCK_APROACH;
		13: Status.eCurrentPoint := E_POINT_NAME.MACHINE_1_CHUCK_POSITION;
		14: Status.eCurrentPoint := E_POINT_NAME.MACHINE_2_ABOVE;
		15: Status.eCurrentPoint := E_POINT_NAME.MACHINE_2_INSIDE;
		16: Status.eCurrentPoint := E_POINT_NAME.MACHINE_2_CHUCK_APROACH;
		17: Status.eCurrentPoint := E_POINT_NAME.MACHINE_2_CHUCK_POSITION;
		18: Status.eCurrentPoint := E_POINT_NAME.MACHINE_3_ABOVE;
		19: Status.eCurrentPoint := E_POINT_NAME.MACHINE_3_INSIDE;
		20: Status.eCurrentPoint := E_POINT_NAME.MACHINE_3_CHUCK_APROACH;
		21: Status.eCurrentPoint := E_POINT_NAME.MACHINE_3_CHUCK_POSITION;
		22: Status.eCurrentPoint := E_POINT_NAME.HOME_SAFETY;
		23: Status.eCurrentPoint := E_POINT_NAME.MAGAZINE_SAFE;
		24: Status.eCurrentPoint := E_POINT_NAME.MAGAZINE_CHANGE;
		25: Status.eCurrentPoint := E_POINT_NAME.MAGAZINE_IN_SLOT;
	ELSE
		Status.eCurrentPoint := E_POINT_NAME.NONE;
	END_CASE;
	Status.xGripper1Open := (stModbusStatus.uiGripperStatus AND UINT#16#0001) <> UINT#0;
	Status.xGripper1Closed := (stModbusStatus.uiGripperStatus AND UINT#16#0002) <> UINT#0;
	Status.xGripper2Open := (stModbusStatus.uiGripperStatus AND UINT#16#0004) <> UINT#0;
	Status.xGripper2Closed := (stModbusStatus.uiGripperStatus AND UINT#16#0008) <> UINT#0;
	Status.xRotatedToBlank := (stModbusStatus.uiGripperStatus AND UINT#16#0010) <> UINT#0;
	Status.xRotatedToDetail := (stModbusStatus.uiGripperStatus AND UINT#16#0020) <> UINT#0;
ELSE
	Status.eCurrentPoint := stMotionManager.Status.eCurrentPoint;
	Status.xGripper1Open := fbGripper.Status.xGripper1Open;
	Status.xGripper1Closed := fbGripper.Status.xGripper1Closed;
	Status.xGripper2Open := fbGripper.Status.xGripper2Open;
	Status.xGripper2Closed := fbGripper.Status.xGripper2Closed;
	Status.xRotatedToBlank := fbGripper.Status.xRotatedToBlank;
	Status.xRotatedToDetail := fbGripper.Status.xRotatedToDetail;
END_IF;

Status.xBlankAvailable := Status.xGripper1Closed;
Status.xDetailAvailable := Status.xGripper2Closed;
IF Status.xGripper1Open THEN
	Status.uiBlankPayloadType := UINT#0;
	IF NOT xTestBlankPayloadPending THEN
		uiTestBlankPayloadType := UINT#0;
	END_IF;
ELSIF Status.xGripper1Closed THEN
	// Во время загрузки тестового сценария его тип относится к уже заданному
	// содержимому захвата и имеет приоритет над метаданными предыдущего цикла.
	IF xTestBlankPayloadPending
	AND (uiTestBlankPayloadType >= UINT#1)
	AND (uiTestBlankPayloadType <= UINT#3) THEN
		Status.uiBlankPayloadType := uiTestBlankPayloadType;
	ELSIF (uiBlankPayloadType >= UINT#1) AND (uiBlankPayloadType <= UINT#3) THEN
		Status.uiBlankPayloadType := uiBlankPayloadType;
		uiTestBlankPayloadType := uiBlankPayloadType;
	ELSIF (uiTestBlankPayloadType >= UINT#1)
	AND (uiTestBlankPayloadType <= UINT#3) THEN
		Status.uiBlankPayloadType := uiTestBlankPayloadType;
	ELSE
		Status.uiBlankPayloadType := UINT#0;
	END_IF;
	xTestBlankPayloadPending := FALSE;
END_IF;
IF Status.xGripper2Open THEN
	Status.uiDetailPayloadType := UINT#0;
	IF NOT xTestDetailPayloadPending THEN
		uiTestDetailPayloadType := UINT#0;
	END_IF;
ELSIF Status.xGripper2Closed THEN
	IF xTestDetailPayloadPending
	AND (uiTestDetailPayloadType >= UINT#1)
	AND (uiTestDetailPayloadType <= UINT#3) THEN
		Status.uiDetailPayloadType := uiTestDetailPayloadType;
	ELSIF (uiDetailPayloadType >= UINT#1) AND (uiDetailPayloadType <= UINT#3) THEN
		Status.uiDetailPayloadType := uiDetailPayloadType;
		uiTestDetailPayloadType := uiDetailPayloadType;
	ELSIF (uiTestDetailPayloadType >= UINT#1)
	AND (uiTestDetailPayloadType <= UINT#3) THEN
		Status.uiDetailPayloadType := uiTestDetailPayloadType;
	ELSE
		Status.uiDetailPayloadType := UINT#0;
	END_IF;
	xTestDetailPayloadPending := FALSE;
END_IF;
Status.xPowerAllowed := xPowerAllowed;
Status.xStopAllowed := xStopAllowed;
Status.xResetAllowed := xResetAllowed;
Status.uiMagazineContext := uiRobotMagazineContext;

Diag.eState := eState;
Diag.eActiveAction := eActiveAction;
Diag.eActivePoint := eActivePoint;
Error.dwAlarmActive := Error.dwErrorActive;
Status.xExternalError := ((Error.dwErrorActive AND (ERR_ROBOT_MOTION OR ERR_ROBOT_GRIPPER)) <> DWORD#0)
	OR xEquipmentStopLatched;

IF Error.dwErrorActive <> DWORD#0 THEN
	Error.dwErrorLast := Error.dwErrorActive;
END_IF;

Error.stErrorActive := UpdateErrorView(dwError := Error.dwErrorActive);
Error.stErrorLast := UpdateErrorView(dwError := Error.dwErrorLast);
FaultStatus.stRobot.xResetAllowed := Status.xResetAllowed
	AND NOT FaultStatus.stRobot.xBusy;
