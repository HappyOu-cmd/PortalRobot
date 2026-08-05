FUNCTION_BLOCK FB_ROBOT
VAR_INPUT

	stMachine_1_Command : ST_ROBOT_COMMAND; // Команда роботу от первого станка
	stMachine_2_Command : ST_ROBOT_COMMAND; // Команда роботу от второго станка
	stMachine_3_Command : ST_ROBOT_COMMAND; // Команда роботу от третьего станка
	stMagazineCommand   : ST_ROBOT_COMMAND; // Команда роботу от магазина
	stCellCommand       : ST_ROBOT_COMMAND; // Команда позиционирования от менеджера ячейки
	stHmiCommand        : ST_ROBOT_COMMAND; // Ручная команда роботу с HMI
	xReset              : BOOL; // Сброс ошибок робота
    xMode               : BOOL; // Режим робота: TRUE — Modbus, FALSE — SoftMotion
	xManual      		: BOOL; // 1 - ручной режим работы, 0 - автоматический режим работы
	xGlobalError        : BOOL; // Глобальная ошибка ячейки
	xModbusBusy         : BOOL; // Внешний робот выполняет команду
	xModbusDone         : BOOL; // Внешний робот завершил команду
	xModbusError        : BOOL; // Ошибка обмена или внешнего робота
	xHmiDrivesEnable    : BOOL; // Исходный запрос HMI на включение приводов
	xHmiDrivesDisable   : BOOL; // Исходный запрос HMI на отключение приводов
	xHmiStop            : BOOL; // Исходный запрос HMI на остановку
	xHmiPermit          : BOOL; // Ручные команды HMI разрешены режимом ячейки
	xDrivesReady        : BOOL; // Все приводы готовы к движению
	xDriveError         : BOOL; // Активна ошибка оси или группы осей
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

    xMotionExecute  : BOOL; // Запрос выполнения перемещения
    xGripperExecute : BOOL; // Запрос выполнения действия захвата
	xMagazineCommandActive : BOOL; // Активная команда получена от FB_MAGAZINE
	rtReset               : R_TRIG; // Фронт команды сброса робота
	rtHmiDrivesEnable     : R_TRIG; // Фронт запроса включения приводов с HMI
	rtHmiDrivesDisable    : R_TRIG; // Фронт запроса отключения приводов с HMI
	rtHmiStop             : R_TRIG; // Фронт запроса остановки с HMI
	xPowerAllowed         : BOOL; // Визуальная доступность кнопки питания приводов
	xStopAllowed          : BOOL; // Визуальная доступность кнопки остановки
	xResetAllowed         : BOOL; // Визуальная доступность кнопки сброса
	xResetAccepted        : BOOL; // Общий сброс принят владельцем робота
	fbRobotFaultInjector  : FB_ROBOT_FAULT_INJECTOR; // Безопасная недопустимая команда робота
	xRobotFaultAllowed    : BOOL; // Владелец готов проверить тестовую команду

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
    ERR_ROBOT_MODBUS_STUB  : DWORD := DWORD#16#0000_0008; // Ошибка внешнего робота или Modbus
	ERR_ROBOT_STOP         : DWORD := DWORD#16#0000_0010; // Остановка команды робота
	WRN_RESET_EXECUTE_ACTIVE : UINT := 1; // Команда робота ещё активна
	WRN_RESET_STOP_ACTIVE    : UINT := 2; // Команда остановки ещё активна
	WRN_RESET_GLOBAL_ERROR   : UINT := 3; // Глобальная ошибка ещё активна
	WRN_RESET_MOTION_ERROR   : UINT := 4; // Ошибка менеджера движения ещё активна
	WRN_RESET_GRIPPER_ERROR  : UINT := 5; // Ошибка захвата ещё активна
	WRN_RESET_MODBUS_ERROR   : UINT := 6; // Ошибка внешнего робота ещё активна
	WRN_HMI_MANUAL_REQUIRED  : UINT := 7; // Ручная команда запрещена режимом ячейки
	WRN_DRIVES_ENABLE_ERROR  : UINT := 8; // Включение приводов запрещено активной ошибкой
	WRN_STOP_DRIVES_NOT_READY: UINT := 9; // Остановка недоступна при неготовых приводах
	WRN_SIM_ERROR_NOT_ALLOWED: UINT := 11; // Тестовая команда запрещена текущим состоянием
END_VAR

// --- BEGIN IMPLEMENTATION ---

rtHmiDrivesEnable(CLK := xHmiDrivesEnable);
rtHmiDrivesDisable(CLK := xHmiDrivesDisable);
rtHmiStop(CLK := xHmiStop);

xPowerAllowed := xHmiPermit
	AND (xDrivesReady
		OR (NOT xGlobalError
			AND (eState <> E_ROBOT_STATE.ERROR)
			AND NOT xDriveError));
xStopAllowed := xHmiPermit AND xDrivesReady;

IF (rtHmiDrivesEnable.Q OR rtHmiDrivesDisable.Q)
AND NOT xPowerAllowed THEN
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
AND NOT xStopAllowed THEN
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
xMagazineCommandActive := FALSE;

Command.xExecute := FALSE;
Command.xStop := FALSE;
Command.xReset := FALSE;
Command.eAction := E_ROBOT_ACTION.NONE;
Command.eSetPoint := E_POINT_NAME.NONE;
Command.iTakeSlot := 0;
Command.iPutSlot := 0;

ModbusCommand.xExecute := FALSE;
ModbusCommand.xStop := FALSE;
ModbusCommand.xReset := FALSE;
ModbusCommand.eAction := E_ROBOT_ACTION.NONE;
ModbusCommand.eSetPoint := E_POINT_NAME.NONE;
ModbusCommand.iTakeSlot := 0;
ModbusCommand.iPutSlot := 0;

//Определяем какой режим работы активен
IF NOT xManual THEN
	IF stCellCommand.xExecute OR stCellCommand.xStop THEN
		Command := stCellCommand;
	ELSIF stMachine_1_Command.xExecute THEN
		Command := stMachine_1_Command;
	ELSIF stMachine_2_Command.xExecute THEN
		Command := stMachine_2_Command;
	ELSIF stMachine_3_Command.xExecute THEN
		Command := stMachine_3_Command;
	ELSIF stMagazineCommand.xExecute OR stMagazineCommand.xStop THEN
		Command := stMagazineCommand;
		xMagazineCommandActive := TRUE;
	END_IF
ELSE
	IF stMagazineCommand.xExecute OR stMagazineCommand.xStop THEN
		Command := stMagazineCommand;
		xMagazineCommandActive := TRUE;
	ELSE
		Command := stHmiCommand;
	END_IF
END_IF;

// Готовность сброса рассчитывается после выбора актуального владельца команды.
// Ошибки вложенных FB считаются сбрасываемыми только после снятия удерживаемого
// источника и публикации их собственного xResetAllowed.
xResetAllowed := xHmiPermit
	AND NOT xGlobalError
	AND (xDriveError
		OR ((eState = E_ROBOT_STATE.ERROR)
			AND NOT Command.xExecute
			AND NOT Command.xStop
			AND NOT xModbusError
			AND (NOT stMotionManager.Status.xError
				OR FaultStatus.stPoint.xResetAllowed)
			AND (NOT fbGripper.Status.xError
				OR FaultStatus.stGripper.xResetAllowed)));
xResetAccepted := xReset AND xResetAllowed;
ModbusCommand.xReset := xResetAccepted;

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
    ELSIF xGlobalError THEN
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

// Ошибка оси или группы является первопричиной в Motion-слое и отдельной
// каскадной ошибкой робота для его публичного статуса и журнала.
IF NOT xMode AND xDriveError THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_MOTION;
	eState := E_ROBOT_STATE.ERROR;
END_IF;

CASE eState OF

    E_ROBOT_STATE.IDLE:

        Status.xBusy := FALSE;
        Status.xDone := FALSE;
        Status.xError := FALSE;

        IF Command.xExecute
		AND (xMagazineCommandActive
			OR ((Command.eSetPoint <> E_POINT_NAME.MAGAZINE_TAKE_DETAIL)
				AND (Command.eSetPoint <> E_POINT_NAME.MAGAZINE_PUT_DETAIL)
				AND (Command.eSetPoint <> E_POINT_NAME.MAGAZINE_CHANGE_DETAIL))) THEN
            eActiveAction := Command.eAction;
            eActivePoint := Command.eSetPoint;

            IF xMode THEN
                eState := E_ROBOT_STATE.MODBUS_STUB;

            ELSE
                CASE Command.eAction OF

                    E_ROBOT_ACTION.MOVE_TO_POINT:
                        eState := E_ROBOT_STATE.MOTION;

                    E_ROBOT_ACTION.UNCLAMP_1,
                    E_ROBOT_ACTION.CLAMP_1,
                    E_ROBOT_ACTION.UNCLAMP_2,
                    E_ROBOT_ACTION.CLAMP_2,
                    E_ROBOT_ACTION.ROTATE_TO_BLANK,
                    E_ROBOT_ACTION.ROTATE_TO_DETAIL:
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
        xMotionExecute := TRUE;

        IF Command.xStop OR xGlobalError THEN
            Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_STOP;
            eState := E_ROBOT_STATE.ERROR;

        ELSIF stMotionManager.Status.xError THEN
            Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_MOTION;
            eState := E_ROBOT_STATE.ERROR;

        ELSIF stMotionManager.Status.xDone THEN
            eState := E_ROBOT_STATE.DONE;
        END_IF;


    E_ROBOT_STATE.GRIPPER:

        Status.xBusy := TRUE;
        xGripperExecute := TRUE;

        IF Command.xStop OR xGlobalError THEN
            Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_STOP;
            eState := E_ROBOT_STATE.ERROR;

        ELSIF fbGripper.Status.xError THEN
            Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_GRIPPER;
            eState := E_ROBOT_STATE.ERROR;

        ELSIF fbGripper.Status.xDone THEN
            eState := E_ROBOT_STATE.DONE;
        END_IF;


    E_ROBOT_STATE.DONE:

        Status.xBusy := FALSE;
        Status.xDone := TRUE;

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

        IF NOT Command.xExecute THEN
            Status.xDone := FALSE;
            eActiveAction := E_ROBOT_ACTION.NONE;
            eState := E_ROBOT_STATE.IDLE;
        END_IF;


    E_ROBOT_STATE.MODBUS_STUB:
		Status.xBusy := TRUE;
		ModbusCommand := Command;
		ModbusCommand.xExecute := TRUE;

		IF Command.xStop OR xGlobalError THEN
			ModbusCommand.xStop := TRUE;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_STOP;
			eState := E_ROBOT_STATE.ERROR;
		ELSIF xModbusError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_MODBUS_STUB;
			eState := E_ROBOT_STATE.ERROR;
		ELSIF xModbusDone THEN
			eState := E_ROBOT_STATE.DONE;
		END_IF;


    E_ROBOT_STATE.ERROR:

        Status.xBusy := FALSE;
        Status.xDone := FALSE;
        Status.xError := TRUE;

        IF xResetAccepted
        AND NOT Command.xExecute
        AND NOT Command.xStop
        AND NOT xGlobalError
        AND NOT stMotionManager.Status.xError
		AND (xMode OR NOT xDriveError)
		AND NOT fbGripper.Status.xError
		AND NOT xModbusError THEN

			Error.dwErrorLast := Error.dwErrorActive;
            Error.dwErrorActive := DWORD#0;
            Status.xError := FALSE;
            eActiveAction := E_ROBOT_ACTION.NONE;
            eState := E_ROBOT_STATE.IDLE;
        END_IF;

END_CASE;

// =====================================================
// Формирование команды FB_MOTION_MANAGER
// =====================================================

stMotionManager.Command.xExecute := xMotionExecute;
stMotionManager.Command.eTargetPoint := eActivePoint;
stMotionManager.Command.xReset := xResetAccepted;

// В ST_MOTION_MANAGER_COMMAND нет отдельного xStop.
// Поэтому Stop передаётся как ошибка верхнего уровня.
stMotionManager.Command.xGlobalError :=
    xGlobalError OR Command.xStop;


// =====================================================
// Вызов FB_MOTION_MANAGER
// =====================================================

fbMotionManager(
    stPoint := stPoint,
    xReset := xResetAccepted,
	FaultRequest := FaultRequest.stPoint,
    stMotionManager := stMotionManager,
    GroupData := GroupData,
    stPointManager := stPointManager
);
FaultStatus.stPoint := fbMotionManager.FaultStatus;


// =====================================================
// Вызов FB_GRIPPER
// =====================================================

stGripperCommand.xExecute := xGripperExecute;
stGripperCommand.xReset := xResetAccepted;
stGripperCommand.eAction := eActiveAction;

fbGripper(
	Command := stGripperCommand,
	FaultRequest := FaultRequest.stGripper,
	tGripper1OpenTime := tGripper1OpenTime,
	tGripper1CloseTime := tGripper1CloseTime,
	tGripper2OpenTime := tGripper2OpenTime,
	tGripper2CloseTime := tGripper2CloseTime,
	tRotateTime := tGripperChangeTime,
	Diag => GripperDiag,
	Error => GripperError
);
FaultStatus.stGripper := fbGripper.FaultStatus;


// =====================================================
// Общие статусы
// =====================================================

Status.eCurrentPoint := stMotionManager.Status.eCurrentPoint;
Status.xGripper1Open :=
    fbGripper.Status.xGripper1Open;

Status.xGripper1Closed :=
    fbGripper.Status.xGripper1Closed;

Status.xGripper2Open :=
    fbGripper.Status.xGripper2Open;

Status.xGripper2Closed :=
    fbGripper.Status.xGripper2Closed;

Status.xRotatedToBlank :=
    fbGripper.Status.xRotatedToBlank;

Status.xRotatedToDetail :=
    fbGripper.Status.xRotatedToDetail;

Status.xBlankAvailable := Status.xGripper1Closed;
Status.xDetailAvailable := Status.xGripper2Closed;
Status.xPowerAllowed := xPowerAllowed;
Status.xStopAllowed := xStopAllowed;
Status.xResetAllowed := xResetAllowed;

Diag.eState := eState;
Diag.eActiveAction := eActiveAction;
Diag.eActivePoint := eActivePoint;
Error.dwAlarmActive := Error.dwErrorActive;
Status.xExternalError := (Error.dwErrorActive AND (ERR_ROBOT_MOTION OR ERR_ROBOT_GRIPPER)) <> DWORD#0;

IF Error.dwErrorActive <> DWORD#0 THEN
	Error.dwErrorLast := Error.dwErrorActive;
END_IF;

Error.stErrorActive := UpdateErrorView(dwError := Error.dwErrorActive);
Error.stErrorLast := UpdateErrorView(dwError := Error.dwErrorLast);
FaultStatus.stRobot.xResetAllowed := Status.xResetAllowed
	AND NOT FaultStatus.stRobot.xBusy;
