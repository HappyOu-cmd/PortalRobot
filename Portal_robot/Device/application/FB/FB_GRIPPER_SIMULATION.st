FUNCTION_BLOCK FB_GRIPPER_SIMULATION
VAR_INPUT
	xUsePhysicalFeedback : BOOL; // NORMAL SoftMotion: подтверждать реальные датчики
	xPhysicalIoReady : BOOL;
	PhysicalFeedback : ST_GRIPPER_STATUS;
	tPhysicalActionTimeout : TIME := T#10S;
	xTestInitialize : BOOL;
	auiTestContent : ARRAY [1..2] OF UINT;
	uiTestOrientation : UINT;
	xSimulationAccelerationEnable : BOOL; // Разрешить ускорение таймеров только в симуляции
	uiSimulationTimeFactor : UINT := 1; // Коэффициент виртуального времени 1..100
	Command : ST_GRIPPER_COMMAND; // Команда управления захватом
	FaultRequest : ST_GRIPPER_FAULT_REQUEST; // Единый контракт диагностической инъекции

    tGripper1OpenTime  : TIME := T#500MS; // Время открытия первого захвата
    tGripper1CloseTime : TIME := T#500MS; // Время закрытия первого захвата
    tGripper2OpenTime  : TIME := T#500MS; // Время открытия второго захвата
    tGripper2CloseTime : TIME := T#500MS; // Время закрытия второго захвата
    tRotateTime        : TIME := T#700MS; // Время смены рабочего захвата
END_VAR
VAR_OUTPUT
	Status : ST_GRIPPER_STATUS; // Рабочие статусы захвата
	Diag   : ST_GRIPPER_DIAG; // Состояние автомата и активное действие
	Error  : ST_GRIPPER_ERRORS; // Активные и последние ошибки
	FaultStatus : ST_FAULT_INJECTION_STATUS; // Состояние источника для HMI
END_VAR
VAR
	uiEffectiveTimeFactor : UINT;
	udiActionTime : UDINT;
	fbFaultInjector : FB_GRIPPER_FAULT_INJECTOR; // Изоляция тестовых источников от автомата
	eState        : E_GRIPPER_STATE := E_GRIPPER_STATE.IDLE; // Текущее состояние автомата захвата
    eActiveAction : E_ROBOT_ACTION := E_ROBOT_ACTION.NONE; // Выполняемое действие захвата

    tonAction      : TON; // Таймер выполнения действия
    xActionFault   : BOOL; // Неисправность, относящаяся к текущему действию
	xActionValid   : BOOL; // Получено допустимое действие захвата
    xActionRequired: BOOL; // Для действия требуется физическое переключение
    tActionTime    : TIME; // Нормативное время текущего действия
	xActionConfirmed : BOOL;
	xPhysicalGlobalFault : BOOL;
	xPhysicalGripper1Fault : BOOL;
	xPhysicalGripper2Fault : BOOL;
	xPhysicalRotationFault : BOOL;
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

uiEffectiveTimeFactor := uiSimulationTimeFactor;
IF NOT xSimulationAccelerationEnable THEN
	uiEffectiveTimeFactor := UINT#1;
ELSIF uiEffectiveTimeFactor < UINT#1 THEN
	uiEffectiveTimeFactor := UINT#1;
ELSIF uiEffectiveTimeFactor > UINT#100 THEN
	uiEffectiveTimeFactor := UINT#100;
END_IF;

IF NOT xInitialized THEN
    Status.xGripper1Open := TRUE;
    Status.xGripper1Closed := FALSE;

    Status.xGripper2Open := TRUE;
    Status.xGripper2Closed := FALSE;

    Status.xRotatedToBlank := TRUE;
    Status.xRotatedToDetail := FALSE;

    xInitialized := TRUE;
END_IF;

IF xTestInitialize THEN
	Status.xGripper1Open := auiTestContent[1] = UINT#0;
	Status.xGripper1Closed := NOT Status.xGripper1Open;
	Status.xGripper2Open := auiTestContent[2] = UINT#0;
	Status.xGripper2Closed := NOT Status.xGripper2Open;
	Status.xRotatedToBlank := uiTestOrientation = UINT#0;
	Status.xRotatedToDetail := NOT Status.xRotatedToBlank;
	eState := E_GRIPPER_STATE.IDLE;
	Error.dwErrorActive := DWORD#0;
END_IF;

// Не создаём подтверждение позиции по прошедшему времени в NORMAL.
IF xUsePhysicalFeedback THEN
	Status.xGripper1Open := PhysicalFeedback.xGripper1Open;
	Status.xGripper1Closed := PhysicalFeedback.xGripper1Closed;
	Status.xGripper2Open := PhysicalFeedback.xGripper2Open;
	Status.xGripper2Closed := PhysicalFeedback.xGripper2Closed;
	Status.xRotatedToBlank := PhysicalFeedback.xRotatedToBlank;
	Status.xRotatedToDetail := PhysicalFeedback.xRotatedToDetail;
END_IF;
xPhysicalGlobalFault := xUsePhysicalFeedback AND NOT xPhysicalIoReady;
xPhysicalGripper1Fault := xUsePhysicalFeedback AND Status.xGripper1Open AND Status.xGripper1Closed;
xPhysicalGripper2Fault := xUsePhysicalFeedback AND Status.xGripper2Open AND Status.xGripper2Closed;
xPhysicalRotationFault := xUsePhysicalFeedback AND Status.xRotatedToBlank AND Status.xRotatedToDetail;

// Ошибочная обратная связь блокирует владельца и до начала действия.
// Используем существующие биты GRIPPER и принятый эффект ROBOT_STOP.
IF xPhysicalGlobalFault THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_GRIP_GLOBAL;
	eState := E_GRIPPER_STATE.ERROR;
END_IF;
IF xPhysicalGripper1Fault THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_GRIPPER_1;
	eState := E_GRIPPER_STATE.ERROR;
END_IF;
IF xPhysicalGripper2Fault THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_GRIPPER_2;
	eState := E_GRIPPER_STATE.ERROR;
END_IF;
IF xPhysicalRotationFault THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_GRIP_ROTATE;
	eState := E_GRIPPER_STATE.ERROR;
END_IF;

rtReset(CLK := Command.xReset);

fbFaultInjector(
	Request := FaultRequest,
	eActiveAction := eActiveAction
);
FaultStatus := fbFaultInjector.Status;

IF rtReset.Q
AND (eState = E_GRIPPER_STATE.ERROR) THEN
	IF Command.xExecute THEN
		Diag.stWarning.uiCode := WRN_RESET_EXECUTE_ACTIVE;
	ELSIF fbFaultInjector.xGlobalFault OR xPhysicalGlobalFault THEN
		Diag.stWarning.uiCode := WRN_RESET_GLOBAL_FAULT;
	ELSIF fbFaultInjector.xGripper1Fault OR xPhysicalGripper1Fault THEN
		Diag.stWarning.uiCode := WRN_RESET_GRIPPER_1_FAULT;
	ELSIF fbFaultInjector.xGripper2Fault OR xPhysicalGripper2Fault THEN
		Diag.stWarning.uiCode := WRN_RESET_GRIPPER_2_FAULT;
	ELSIF fbFaultInjector.xRotationFault OR xPhysicalRotationFault THEN
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


xActionFault := fbFaultInjector.xActionFault;
xActionConfirmed := FALSE;
CASE eActiveAction OF
	E_ROBOT_ACTION.UNCLAMP_1:
		xActionConfirmed := Status.xGripper1Open AND NOT Status.xGripper1Closed;
		xActionFault := xActionFault OR xPhysicalGripper1Fault;
	E_ROBOT_ACTION.CLAMP_1:
		xActionConfirmed := Status.xGripper1Closed AND NOT Status.xGripper1Open;
		xActionFault := xActionFault OR xPhysicalGripper1Fault;
	E_ROBOT_ACTION.UNCLAMP_2:
		xActionConfirmed := Status.xGripper2Open AND NOT Status.xGripper2Closed;
		xActionFault := xActionFault OR xPhysicalGripper2Fault;
	E_ROBOT_ACTION.CLAMP_2:
		xActionConfirmed := Status.xGripper2Closed AND NOT Status.xGripper2Open;
		xActionFault := xActionFault OR xPhysicalGripper2Fault;
	E_ROBOT_ACTION.ROTATE_TO_BLANK:
		xActionConfirmed := Status.xRotatedToBlank AND NOT Status.xRotatedToDetail;
		xActionFault := xActionFault OR xPhysicalRotationFault;
	E_ROBOT_ACTION.ROTATE_TO_DETAIL:
		xActionConfirmed := Status.xRotatedToDetail AND NOT Status.xRotatedToBlank;
		xActionFault := xActionFault OR xPhysicalRotationFault;
END_CASE;
tActionTime := T#0S;

CASE eActiveAction OF
	E_ROBOT_ACTION.UNCLAMP_1:
		tActionTime := tGripper1OpenTime;
	E_ROBOT_ACTION.CLAMP_1:
		tActionTime := tGripper1CloseTime;
	E_ROBOT_ACTION.UNCLAMP_2:
		tActionTime := tGripper2OpenTime;
	E_ROBOT_ACTION.CLAMP_2:
		tActionTime := tGripper2CloseTime;
	E_ROBOT_ACTION.ROTATE_TO_BLANK,
	E_ROBOT_ACTION.ROTATE_TO_DETAIL:
		tActionTime := tRotateTime;

END_CASE;

	udiActionTime := TIME_TO_UDINT(tActionTime) / TO_UDINT(uiEffectiveTimeFactor);
	IF udiActionTime < UDINT#1 THEN
		udiActionTime := UDINT#1;
	END_IF;
	tActionTime := UDINT_TO_TIME(udiActionTime);


IF xUsePhysicalFeedback THEN
	tActionTime := tPhysicalActionTimeout;
END_IF;

tonAction(
    IN := (eState = E_GRIPPER_STATE.EXECUTE)
          AND NOT xActionFault
          AND NOT fbFaultInjector.xGlobalFault AND NOT xPhysicalGlobalFault,
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
					xActionRequired := NOT (Status.xGripper1Open AND NOT Status.xGripper1Closed);

				E_ROBOT_ACTION.CLAMP_1:
					xActionRequired := NOT (Status.xGripper1Closed AND NOT Status.xGripper1Open);

				E_ROBOT_ACTION.UNCLAMP_2:
					xActionRequired := NOT (Status.xGripper2Open AND NOT Status.xGripper2Closed);

				E_ROBOT_ACTION.CLAMP_2:
					xActionRequired := NOT (Status.xGripper2Closed AND NOT Status.xGripper2Open);

				E_ROBOT_ACTION.ROTATE_TO_BLANK:
					xActionRequired := NOT (Status.xRotatedToBlank AND NOT Status.xRotatedToDetail);

				E_ROBOT_ACTION.ROTATE_TO_DETAIL:
					xActionRequired := NOT (Status.xRotatedToDetail AND NOT Status.xRotatedToBlank);

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

		// Снятие Execute отменяет только незавершённое виртуальное действие и
		// сохраняет последнюю подтверждённую позицию захвата.
		IF NOT Command.xExecute THEN
			Status.xBusy := FALSE;
			eActiveAction := E_ROBOT_ACTION.NONE;
			eState := E_GRIPPER_STATE.IDLE;

		ELSIF fbFaultInjector.xGlobalFault OR xPhysicalGlobalFault THEN
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

        ELSIF xUsePhysicalFeedback THEN
			IF xActionConfirmed THEN
				eState := E_GRIPPER_STATE.DONE;
			ELSIF tonAction.Q THEN
				CASE eActiveAction OF
					E_ROBOT_ACTION.UNCLAMP_1, E_ROBOT_ACTION.CLAMP_1:
						Error.dwErrorActive := Error.dwErrorActive OR ERR_GRIPPER_1;
					E_ROBOT_ACTION.UNCLAMP_2, E_ROBOT_ACTION.CLAMP_2:
						Error.dwErrorActive := Error.dwErrorActive OR ERR_GRIPPER_2;
					E_ROBOT_ACTION.ROTATE_TO_BLANK, E_ROBOT_ACTION.ROTATE_TO_DETAIL:
						Error.dwErrorActive := Error.dwErrorActive OR ERR_GRIP_ROTATE;
				END_CASE;
				eState := E_GRIPPER_STATE.ERROR;
			END_IF;

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
        AND NOT fbFaultInjector.xGlobalFault
        AND NOT fbFaultInjector.xGripper1Fault
		AND NOT fbFaultInjector.xGripper2Fault
		AND NOT fbFaultInjector.xRotationFault
		AND NOT xPhysicalGlobalFault
		AND NOT xPhysicalGripper1Fault
		AND NOT xPhysicalGripper2Fault
		AND NOT xPhysicalRotationFault THEN

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
FaultStatus.xResetAllowed := (Error.dwErrorActive <> DWORD#0)
	AND NOT FaultStatus.xActive
	AND NOT xPhysicalGlobalFault
	AND NOT xPhysicalGripper1Fault
	AND NOT xPhysicalGripper2Fault
	AND NOT xPhysicalRotationFault;
