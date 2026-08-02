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
	MASK_LOCAL_ERROR         : DWORD := ERR_ROBOT_WRONG_ACTION OR ERR_ROBOT_MODBUS_STUB; // Собственные первопричины робота
END_VAR

// --- BEGIN IMPLEMENTATION ---

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
ModbusCommand.xReset := xReset;
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

Command.xReset := xReset;

// =====================================================
// Автомат FB_ROBOT
// =====================================================

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

        IF xReset
        AND NOT Command.xExecute
        AND NOT Command.xStop
        AND NOT xGlobalError
        AND NOT stMotionManager.Status.xError
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
stMotionManager.Command.xReset := xReset;

// В ST_MOTION_MANAGER_COMMAND нет отдельного xStop.
// Поэтому Stop передаётся как ошибка верхнего уровня.
stMotionManager.Command.xGlobalError :=
    xGlobalError OR Command.xStop;


// =====================================================
// Вызов FB_MOTION_MANAGER
// =====================================================

fbMotionManager(
    stPoint := stPoint,
    xReset := xReset,
    stMotionManager := stMotionManager,
    GroupData := GroupData,
    stPointManager := stPointManager
);


// =====================================================
// Вызов FB_GRIPPER
// =====================================================

stGripperCommand.xExecute := xGripperExecute;
stGripperCommand.xReset := xReset;
stGripperCommand.eAction := eActiveAction;

fbGripper(
	Command := stGripperCommand,
	Diag => GripperDiag,
	Error => GripperError
);


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

Diag.eState := eState;
Diag.eActiveAction := eActiveAction;
Diag.eActivePoint := eActivePoint;
Error.dwAlarmActive := Error.dwErrorActive AND MASK_LOCAL_ERROR;
Status.xExternalError := (Error.dwErrorActive AND (ERR_ROBOT_MOTION OR ERR_ROBOT_GRIPPER)) <> DWORD#0;

IF Error.dwErrorActive <> DWORD#0 THEN
	Error.dwErrorLast := Error.dwErrorActive;
END_IF;

Error.stErrorActive := UpdateErrorView(dwError := Error.dwErrorActive);
Error.stErrorLast := UpdateErrorView(dwError := Error.dwErrorLast);
