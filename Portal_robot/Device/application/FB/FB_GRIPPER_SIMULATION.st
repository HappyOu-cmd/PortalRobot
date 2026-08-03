FUNCTION_BLOCK FB_GRIPPER_SIMULATION
VAR_INPUT
	Command : ST_GRIPPER_COMMAND; // Команда управления захватом

    xSimGripper1Fault : BOOL; // Имитация неисправности первого захвата
    xSimGripper2Fault : BOOL; // Имитация неисправности второго захвата
    xSimRotationFault : BOOL; // Имитация неисправности поворота
    xSimGlobalFault   : BOOL; // Имитация общей неисправности захвата

    tGripperTime : TIME := T#500MS; // Время открытия или закрытия захвата
    tRotateTime  : TIME := T#700MS; // Время поворота захвата
END_VAR
VAR_OUTPUT
	Status : ST_GRIPPER_STATUS; // Рабочие статусы захвата
	Diag   : ST_GRIPPER_DIAG; // Состояние автомата и активное действие
	Error  : ST_GRIPPER_ERRORS; // Активные и последние ошибки
END_VAR
VAR
	eState        : E_GRIPPER_STATE := E_GRIPPER_STATE.IDLE; // Текущее состояние автомата захвата
    eActiveAction : E_ROBOT_ACTION := E_ROBOT_ACTION.NONE; // Выполняемое действие захвата

    tonAction      : TON; // Таймер выполнения действия
    xActionFault   : BOOL; // Неисправность, относящаяся к текущему действию
	xActionValid   : BOOL; // Получено допустимое действие захвата
    xActionRequired: BOOL; // Для действия требуется физическое переключение
    tActionTime    : TIME; // Нормативное время текущего действия
    xInitialized   : BOOL; // Начальные состояния установлены
	rtReset         : R_TRIG; // Фронт команды сброса захвата
END_VAR
VAR CONSTANT 
	ERR_GRIPPER_1   : DWORD := DWORD#16#0000_0001; // Ошибка первого захвата
    ERR_GRIPPER_2   : DWORD := DWORD#16#0000_0002; // Ошибка второго захвата
    ERR_GRIP_ROTATE : DWORD := DWORD#16#0000_0004; // Ошибка механизма поворота
    ERR_GRIP_ACTION : DWORD := DWORD#16#0000_0008; // Недопустимое действие захвата
    ERR_GRIP_GLOBAL : DWORD := DWORD#16#0000_0010; // Общая ошибка захвата
	WRN_RESET_EXECUTE_ACTIVE : UINT := 1; // Команда захвата ещё активна
	WRN_RESET_GLOBAL_FAULT   : UINT := 2; // Общая неисправность ещё активна
	WRN_RESET_GRIPPER_1_FAULT: UINT := 3; // Неисправность первого захвата ещё активна
	WRN_RESET_GRIPPER_2_FAULT: UINT := 4; // Неисправность второго захвата ещё активна
	WRN_RESET_ROTATION_FAULT : UINT := 5; // Неисправность поворота ещё активна
END_VAR

// --- BEGIN IMPLEMENTATION ---

IF NOT xInitialized THEN
    Status.xGripper1Open := TRUE;
    Status.xGripper1Closed := FALSE;

    Status.xGripper2Open := TRUE;
    Status.xGripper2Closed := FALSE;

    Status.xRotatedToBlank := TRUE;
    Status.xRotatedToDetail := FALSE;

    xInitialized := TRUE;
END_IF;

rtReset(CLK := Command.xReset);

IF rtReset.Q
AND (eState = E_GRIPPER_STATE.ERROR) THEN
	IF Command.xExecute THEN
		Diag.stWarning.uiCode := WRN_RESET_EXECUTE_ACTIVE;
	ELSIF xSimGlobalFault THEN
		Diag.stWarning.uiCode := WRN_RESET_GLOBAL_FAULT;
	ELSIF xSimGripper1Fault THEN
		Diag.stWarning.uiCode := WRN_RESET_GRIPPER_1_FAULT;
	ELSIF xSimGripper2Fault THEN
		Diag.stWarning.uiCode := WRN_RESET_GRIPPER_2_FAULT;
	ELSIF xSimRotationFault THEN
		Diag.stWarning.uiCode := WRN_RESET_ROTATION_FAULT;
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


xActionFault := FALSE;
tActionTime := tGripperTime;

CASE eActiveAction OF

    E_ROBOT_ACTION.UNCLAMP_1,
    E_ROBOT_ACTION.CLAMP_1:
        xActionFault := xSimGripper1Fault;

    E_ROBOT_ACTION.UNCLAMP_2,
    E_ROBOT_ACTION.CLAMP_2:
        xActionFault := xSimGripper2Fault;

    E_ROBOT_ACTION.ROTATE_TO_BLANK,
    E_ROBOT_ACTION.ROTATE_TO_DETAIL:
        xActionFault := xSimRotationFault;
        tActionTime := tRotateTime;

END_CASE;


tonAction(
    IN := (eState = E_GRIPPER_STATE.EXECUTE)
          AND NOT xActionFault
          AND NOT xSimGlobalFault,
    PT := tActionTime
);


CASE eState OF

    E_GRIPPER_STATE.IDLE:

        Status.xBusy := FALSE;
        Status.xDone := FALSE;
        Status.xError := FALSE;

        IF Command.xExecute THEN
            eActiveAction := Command.eAction;
			xActionValid := TRUE;
			xActionRequired := TRUE;

            CASE Command.eAction OF

				E_ROBOT_ACTION.UNCLAMP_1:
					xActionRequired := NOT Status.xGripper1Open;

				E_ROBOT_ACTION.CLAMP_1:
					xActionRequired := NOT Status.xGripper1Closed;

				E_ROBOT_ACTION.UNCLAMP_2:
					xActionRequired := NOT Status.xGripper2Open;

				E_ROBOT_ACTION.CLAMP_2:
					xActionRequired := NOT Status.xGripper2Closed;

				E_ROBOT_ACTION.ROTATE_TO_BLANK:
					xActionRequired := NOT Status.xRotatedToBlank;

				E_ROBOT_ACTION.ROTATE_TO_DETAIL:
					xActionRequired := NOT Status.xRotatedToDetail;

            ELSE
				xActionValid := FALSE;
                Error.dwErrorActive := Error.dwErrorActive OR ERR_GRIP_ACTION;
                eState := E_GRIPPER_STATE.ERROR;
            END_CASE;

			IF xActionValid THEN
				IF xActionRequired THEN
					eState := E_GRIPPER_STATE.EXECUTE;
				ELSE
					eState := E_GRIPPER_STATE.DONE;
				END_IF;
			END_IF;
        END_IF;


    E_GRIPPER_STATE.EXECUTE:

        Status.xBusy := TRUE;
        Status.xDone := FALSE;

        IF xSimGlobalFault THEN
            Error.dwErrorActive := Error.dwErrorActive OR ERR_GRIP_GLOBAL;
            eState := E_GRIPPER_STATE.ERROR;

        ELSIF xActionFault THEN

            CASE eActiveAction OF

                E_ROBOT_ACTION.UNCLAMP_1,
                E_ROBOT_ACTION.CLAMP_1:
                    Error.dwErrorActive := Error.dwErrorActive OR ERR_GRIPPER_1;

                E_ROBOT_ACTION.UNCLAMP_2,
                E_ROBOT_ACTION.CLAMP_2:
                    Error.dwErrorActive := Error.dwErrorActive OR ERR_GRIPPER_2;

                E_ROBOT_ACTION.ROTATE_TO_BLANK,
                E_ROBOT_ACTION.ROTATE_TO_DETAIL:
                    Error.dwErrorActive := Error.dwErrorActive OR ERR_GRIP_ROTATE;

            END_CASE;

            eState := E_GRIPPER_STATE.ERROR;

        ELSIF tonAction.Q THEN

            CASE eActiveAction OF

                E_ROBOT_ACTION.UNCLAMP_1:
                    Status.xGripper1Open := TRUE;
                    Status.xGripper1Closed := FALSE;

                E_ROBOT_ACTION.CLAMP_1:
                    Status.xGripper1Open := FALSE;
                    Status.xGripper1Closed := TRUE;

                E_ROBOT_ACTION.UNCLAMP_2:
                    Status.xGripper2Open := TRUE;
                    Status.xGripper2Closed := FALSE;

                E_ROBOT_ACTION.CLAMP_2:
                    Status.xGripper2Open := FALSE;
                    Status.xGripper2Closed := TRUE;

                E_ROBOT_ACTION.ROTATE_TO_BLANK:
                    Status.xRotatedToBlank := TRUE;
                    Status.xRotatedToDetail := FALSE;

                E_ROBOT_ACTION.ROTATE_TO_DETAIL:
                    Status.xRotatedToBlank := FALSE;
                    Status.xRotatedToDetail := TRUE;

            END_CASE;

            eState := E_GRIPPER_STATE.DONE;
        END_IF;


    E_GRIPPER_STATE.DONE:

        Status.xBusy := FALSE;
        Status.xDone := TRUE;

        IF NOT Command.xExecute THEN
            Status.xDone := FALSE;
            eActiveAction := E_ROBOT_ACTION.NONE;
            eState := E_GRIPPER_STATE.IDLE;
        END_IF;


    E_GRIPPER_STATE.ERROR:

        Status.xBusy := FALSE;
        Status.xDone := FALSE;
        Status.xError := TRUE;

        IF Command.xReset
        AND NOT Command.xExecute
        AND NOT xSimGlobalFault
        AND NOT xSimGripper1Fault
		AND NOT xSimGripper2Fault
		AND NOT xSimRotationFault THEN

			Error.dwErrorLast := Error.dwErrorActive;
            Error.dwErrorActive := DWORD#0;
            Status.xError := FALSE;
            eActiveAction := E_ROBOT_ACTION.NONE;
            eState := E_GRIPPER_STATE.IDLE;
        END_IF;

END_CASE;

Diag.eState := eState;
Diag.eActiveAction := eActiveAction;

IF Error.dwErrorActive <> DWORD#0 THEN
	Error.dwErrorLast := Error.dwErrorActive;
END_IF;

Error.stErrorActive := UpdateErrorView(dwError := Error.dwErrorActive);
Error.stErrorLast := UpdateErrorView(dwError := Error.dwErrorLast);
Error.dwAlarmActive := Error.dwErrorActive;
