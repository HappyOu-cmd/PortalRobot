FUNCTION_BLOCK FB_ROBOT
VAR_INPUT

	stMachine_1_Command : ST_ROBOT_COMMAND;
	stMachine_2_Command : ST_ROBOT_COMMAND;
	stMachine_3_Command : ST_ROBOT_COMMAND;
	stMagazineCommand  : ST_ROBOT_COMMAND;
	stHmiCommand        : ST_ROBOT_COMMAND;
	xReset       		: BOOL;
    xMode        		: BOOL;
	xManual      		: BOOL; // 1 - ручной режим работы, 0 - автоматический режим работы
    xGlobalError 		: BOOL;

    stPoint : ARRAY [0..GVL_POINT.iPointNumber] OF ST_POINT;

    xSimBlankAvailable : BOOL;

END_VAR
VAR_OUTPUT
	stStatus : ST_ROBOT_STATUS;
END_VAR
VAR
	stCommand           : ST_ROBOT_COMMAND;
	
	fbMotionManager : FB_MOTION_MANAGER;
    fbGripper       : FB_GRIPPER_SIMULATION;

    eState        : E_ROBOT_STATE := E_ROBOT_STATE.IDLE;
    eActiveAction : E_ROBOT_ACTION := E_ROBOT_ACTION.NONE;
    eActivePoint  : E_POINT_NAME;

    xMotionExecute  : BOOL;
    xGripperExecute : BOOL;

    dwErrorActive : DWORD;
END_VAR

VAR_IN_OUT
    stMotionManager : ST_MOTION_MANAGER;
    GroupData       : ST_AXIS_GROUP;
    stPointManager  : ST_POINT_MANAGER;
END_VAR

VAR CONSTANT
	ERR_ROBOT_WRONG_ACTION : DWORD := DWORD#16#0000_0001;
    ERR_ROBOT_MOTION       : DWORD := DWORD#16#0000_0002;
    ERR_ROBOT_GRIPPER      : DWORD := DWORD#16#0000_0004;
    ERR_ROBOT_MODBUS_STUB  : DWORD := DWORD#16#0000_0008;
    ERR_ROBOT_STOP         : DWORD := DWORD#16#0000_0010;
END_VAR
// --- BEGIN IMPLEMENTATION ---

// Команды по умолчанию
xMotionExecute := FALSE;
xGripperExecute := FALSE;

//Определяем какой режим работы активен
IF NOT xManual THEN
	IF stMachine_1_Command.xExecute THEN
		stCommand := stMachine_1_Command;
	ELSIF stMachine_2_Command.xExecute THEN
		stCommand := stMachine_2_Command;
	ELSIF stMachine_3_Command.xExecute THEN
		stCommand := stMachine_3_Command;
	END_IF
ELSE
	stCommand := stHmiCommand;
END_IF

// =====================================================
// Автомат FB_ROBOT
// =====================================================

CASE eState OF

    E_ROBOT_STATE.IDLE:

        stStatus.xBusy := FALSE;
        stStatus.xDone := FALSE;
        stStatus.xError := FALSE;

        IF stCommand.xExecute THEN
            eActiveAction := stCommand.eAction;
            eActivePoint := stCommand.eSetPoint;

            IF xMode THEN
                eState := E_ROBOT_STATE.MODBUS_STUB;

            ELSE
                CASE stCommand.eAction OF

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
                    dwErrorActive :=
                        dwErrorActive OR ERR_ROBOT_WRONG_ACTION;

                    eState := E_ROBOT_STATE.ERROR;
                END_CASE;
            END_IF;
        END_IF;


    E_ROBOT_STATE.MOTION:

        stStatus.xBusy := TRUE;
        xMotionExecute := TRUE;

        IF stCommand.xStop OR xGlobalError THEN
            dwErrorActive := dwErrorActive OR ERR_ROBOT_STOP;
            eState := E_ROBOT_STATE.ERROR;

        ELSIF stMotionManager.Status.xError THEN
            dwErrorActive := dwErrorActive OR ERR_ROBOT_MOTION;
            eState := E_ROBOT_STATE.ERROR;

        ELSIF stMotionManager.Status.xDone THEN
            eState := E_ROBOT_STATE.DONE;
        END_IF;


    E_ROBOT_STATE.GRIPPER:

        stStatus.xBusy := TRUE;
        xGripperExecute := TRUE;

        IF stCommand.xStop OR xGlobalError THEN
            dwErrorActive := dwErrorActive OR ERR_ROBOT_STOP;
            eState := E_ROBOT_STATE.ERROR;

        ELSIF fbGripper.stStatus.xError THEN
            dwErrorActive := dwErrorActive OR ERR_ROBOT_GRIPPER;
            eState := E_ROBOT_STATE.ERROR;

        ELSIF fbGripper.stStatus.xDone THEN
            eState := E_ROBOT_STATE.DONE;
        END_IF;


    E_ROBOT_STATE.DONE:

        stStatus.xBusy := FALSE;
        stStatus.xDone := TRUE;

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

        IF NOT stCommand.xExecute THEN
            stStatus.xDone := FALSE;
            eActiveAction := E_ROBOT_ACTION.NONE;
            eState := E_ROBOT_STATE.IDLE;
        END_IF;


    E_ROBOT_STATE.MODBUS_STUB:

        dwErrorActive :=
            dwErrorActive OR ERR_ROBOT_MODBUS_STUB;

        eState := E_ROBOT_STATE.ERROR;


    E_ROBOT_STATE.ERROR:

        stStatus.xBusy := FALSE;
        stStatus.xDone := FALSE;
        stStatus.xError := TRUE;

        IF stCommand.xReset
        AND NOT stCommand.xExecute
        AND NOT stCommand.xStop
        AND NOT xGlobalError
        AND NOT stMotionManager.Status.xError
        AND NOT fbGripper.stStatus.xError THEN

            dwErrorActive := DWORD#0;
            stStatus.xError := FALSE;
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
    xGlobalError OR stCommand.xStop;


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

fbGripper(
    xExecute := xGripperExecute,
    xReset := stCommand.xReset,
    eAction := eActiveAction,
);


// =====================================================
// Общие статусы
// =====================================================

stStatus.dwError := dwErrorActive;
stStatus.eCurrentPoint := stMotionManager.Status.eCurrentPoint;
stStatus.xBlankAvailable := stStatus.xGripper1Closed;
stStatus.xDetailAvailable := stStatus.xGripper2Closed;
stStatus.xGripper1Open :=
    fbGripper.stStatus.xGripper1Open;

stStatus.xGripper1Closed :=
    fbGripper.stStatus.xGripper1Closed;

stStatus.xGripper2Open :=
    fbGripper.stStatus.xGripper2Open;

stStatus.xGripper2Closed :=
    fbGripper.stStatus.xGripper2Closed;

stStatus.xRotatedToBlank :=
    fbGripper.stStatus.xRotatedToBlank;

stStatus.xRotatedToDetail :=
    fbGripper.stStatus.xRotatedToDetail;