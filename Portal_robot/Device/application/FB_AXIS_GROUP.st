FUNCTION_BLOCK FB_AXIS_GROUP
VAR_INPUT
	
END_VAR
VAR_OUTPUT
END_VAR
VAR
	// Внутренние исполняемые булевые переменные
	xEnable : BOOL;
	xRegulatorOn: BOOL;
	xDriveStart :BOOL;
	xDisable : BOOL;
	xPowerEnable : BOOL;
	xReset : BOOL;
	xResetMC : BOOL;
	xMoveDirect : BOOL;
	xMoveLinear : BOOL;
	xStopCmd : BOOL;
	xHaltCmd : BOOL; 
	
	iPrevStep        : E_AXIS_GROUP_STATE;
	
	// Для таймера шага
	tonStepTimeout : TON;
	xStepTimeout   : BOOL;
	xStepChanged   : BOOL;
	xStepTimerEnable : BOOL;
	xStepInitialized : BOOL;	
	
	// Для удержания предупреждений
    tpWarningHold        : TP;
    xWarningPulse        : BOOL;
	
	// ФБ группы осей
	fbReadStatus: MC_GroupReadStatus;
	fbReadPosition: MC_GroupReadActualPosition;
	fbGroupEnable: MC_GroupEnable;
	fbGroupDisable: MC_GroupDisable;
	fbGroupPower : SMC_GroupPower;
	fbGroupReset: MC_GroupReset;

	
	fbMoveDirect: MC_MoveDirectAbsolute;
	fbMoveLinear: MC_MoveLinearAbsolute;
	
	fbGroupHalt: MC_GroupHalt;
	fbGroupStop: MC_GroupStop;
	
	stPosition: SMC_POS_REF;
	
	// Триггеры на команды
    rtEnable             : R_TRIG;
    rtDisable            : R_TRIG;
	rtEnablePower        : R_TRIG;
    rtResetAllError      : R_TRIG;
    rtMoveDirect         : R_TRIG;
    rtMoveLinear         : R_TRIG;
	rtStopCmd            : R_TRIG;
	rtHaltCmd			 : R_TRIG;
	
END_VAR
VAR_IN_OUT
	AxisGroup: AXIS_GROUP_REF_SM3;
	GroupData: ST_AXIS_GROUP;
END_VAR

VAR CONSTANT
	// ==================================================
    // LOGICAL ERRORS
    // ==================================================
	LOG_STEP_TIMEOUT             : DWORD := 1;
	LOG_INVALID_STATE            : DWORD := 2;
	LOG_POWER_PERMIT_READY       : DWORD := 4;
	LOG_POWER_PERMIT_LOST_DIRECT : DWORD := 8;
	
	// ==================================================
    // MOTION ERRORS
    // ==================================================
	MOTION_ERR_ENABLE            : DWORD := 1;
	MOTION_ERR_POWER             : DWORD := 2;
	MOTION_ERR_DISABLE 		     : DWORD := 4;
	MOTION_ERR_RESET             : DWORD := 8;
	MOTION_ERR_MOVE_DIRECT       : DWORD := 16;
	MOTION_ERR_MOVE_LINEAR       : DWORD := 32;
	MOTION_ERR_HALT              : DWORD := 64;
	MOTION_ERR_STOP              : DWORD := 128;
	MOTION_ERR_READ_POSITION     : DWORD := 256;
	MOTION_ERR_READ_STATUS       : DWORD := 512;
END_VAR

// --- BEGIN IMPLEMENTATION ---

// =============================================================================
// 1. Добить предупреждения и ошибки
// 2. Сделать логирование ошибок и шагов
// 3. Сделать необходимые сигналы статусов
// =============================================================================

// =============================================================================
// 1. Одноцикловые сигналы
// =============================================================================
xWarningPulse := FALSE;

GroupData.Diag.xStepChanged := FALSE;
GroupData.Diag.dwError.dwLogicalErrorNew := DWORD#0;
GroupData.Diag.dwError.dwMotionErrorNew := DWORD#0;


// =============================================================================
// 2. Фронты команд
// =============================================================================
rtDisable(CLK := GroupData.Cmd.xDisable);
rtEnablePower(CLK := GroupData.Cmd.xPowerEnable);
rtResetAllError(CLK := GroupData.Cmd.xReset);
rtMoveDirect(CLK := GroupData.Cmd.xMoveDirect);
rtMoveLinear(CLK := GroupData.Cmd.xMoveLinear);
rtHaltCmd(CLK := GroupData.Cmd.xHaltCmd);
rtStopCmd(CLK := GroupData.Cmd.xStopCmd);


// =============================================================================
// 3. Чтение состояния группы и координат
// =============================================================================
fbReadStatus(
    Enable    := TRUE,
    AxisGroup := AxisGroup
);

fbReadPosition(
    AxisGroup   := AxisGroup,
    Enable      := TRUE,
    CoordSystem := SMC_COORD_SYSTEM.MCS
);

IF fbReadPosition.Valid THEN
    GroupData.Status.ActualX := fbReadPosition.Position.c.X;
    GroupData.Status.ActualY := fbReadPosition.Position.c.Y;
    GroupData.Status.ActualZ := fbReadPosition.Position.c.Z;
END_IF;


// =============================================================================
// 4. Текущий статус ошибок
// =============================================================================
GroupData.Status.xGroupError :=
    fbReadStatus.Error
    OR fbReadStatus.GroupErrorStop
    OR (GroupData.Diag.dwError.dwMotionErrorLatched <> DWORD#0);

GroupData.Status.xLocalError :=
    GroupData.Status.xGroupError
    OR (GroupData.Diag.dwError.dwLogicalErrorLatched <> DWORD#0);


// =============================================================================
// 5. Команды Motion FB по умолчанию
// =============================================================================
xEnable := FALSE;
xDisable := FALSE;
xResetMC := FALSE;
xMoveDirect := FALSE;
xMoveLinear := FALSE;
xStopCmd := FALSE;
xHaltCmd := FALSE;


// =============================================================================
// 6. Машина состояний
// =============================================================================
CASE GroupData.Diag.iStep OF

    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.DISABLED:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'DISABLED';
        GroupData.Diag.tStepPreset := T#0S;
        GroupData.Diag.iPowerMode := E_AXIS_GROUP_POWER_MODE.OFF;

        IF GroupData.Cmd.xGlobalError
           OR GroupData.Status.xLocalError THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF rtEnablePower.Q AND NOT GroupData.Cmd.xPowerPermit THEN
            GroupData.Diag.sWarningText := 'Power permit is not active';
            xWarningPulse := TRUE;

        ELSIF rtEnablePower.Q THEN
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ENABLING_POWER;
        END_IF;


    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.ENABLING_POWER:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'ENABLING_POWER';
        GroupData.Diag.tStepPreset := GroupData.Timeouts.tPowerTimeout;
        GroupData.Diag.iPowerMode := E_AXIS_GROUP_POWER_MODE.ON;

        IF fbReadStatus.GroupErrorStop
           OR fbGroupPower.Error THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF NOT GroupData.Cmd.xPowerPermit
           OR GroupData.Cmd.xGlobalError THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_POWER;

        ELSIF xStepTimeout THEN
            GroupData.Diag.dwError.dwLogicalErrorNew :=
                GroupData.Diag.dwError.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_POWER;

        ELSIF fbGroupPower.Status THEN
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ENABLING_GROUP;
        END_IF;


    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.ENABLING_GROUP:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'ENABLING_GROUP';
        GroupData.Diag.tStepPreset := GroupData.Timeouts.tGroupTimeout;
        GroupData.Diag.iPowerMode := E_AXIS_GROUP_POWER_MODE.ON;

        xEnable := TRUE;

        IF fbReadStatus.GroupErrorStop
           OR fbGroupEnable.Error THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF NOT GroupData.Cmd.xPowerPermit
           OR GroupData.Cmd.xGlobalError THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_GROUP;

        ELSIF xStepTimeout THEN
            GroupData.Diag.dwError.dwLogicalErrorNew :=
                GroupData.Diag.dwError.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_GROUP;

        ELSIF fbGroupEnable.Done
           AND fbReadStatus.GroupStandby THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.READY;
        END_IF;


    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.READY:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'READY';
        GroupData.Diag.tStepPreset := T#0S;
        GroupData.Diag.iPowerMode := E_AXIS_GROUP_POWER_MODE.ON;

        xEnable := TRUE;

        IF fbReadStatus.GroupErrorStop THEN
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF NOT GroupData.Cmd.xPowerPermit
           OR GroupData.Cmd.xGlobalError
           OR GroupData.Status.xLocalError
           OR rtDisable.Q THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_GROUP;

        ELSIF rtMoveDirect.Q AND rtMoveLinear.Q THEN
            GroupData.Diag.sWarningText :=
                'MoveDirect and MoveLinear requested together';

            xWarningPulse := TRUE;

        ELSIF rtMoveDirect.Q THEN
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.MOVING_DIRECT;

        ELSIF rtMoveLinear.Q THEN
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.MOVING_LINEAR;
        END_IF;


    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.MOVING_DIRECT:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'MOVING_DIRECT';
        GroupData.Diag.tStepPreset := GroupData.Timeouts.tMoveTimeout;
        GroupData.Diag.iPowerMode := E_AXIS_GROUP_POWER_MODE.ON;

        xEnable := TRUE;
        xMoveDirect := TRUE;

        IF fbReadStatus.GroupErrorStop THEN
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF fbMoveDirect.Error THEN
            IF fbReadStatus.GroupMoving THEN
                GroupData.Diag.iStep := E_AXIS_GROUP_STATE.EMG_STOP;
            ELSE
                GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;
            END_IF;

        ELSIF xStepTimeout THEN
            GroupData.Diag.dwError.dwLogicalErrorNew :=
                GroupData.Diag.dwError.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.EMG_STOP;

        ELSIF NOT GroupData.Cmd.xPowerPermit
           OR GroupData.Cmd.xGlobalError
           OR GroupData.Status.xLocalError
           OR rtStopCmd.Q THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.EMG_STOP;

        ELSIF rtHaltCmd.Q THEN
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.HALT_STOP;

        ELSIF fbMoveDirect.Done
           AND fbReadStatus.GroupStandby THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.READY;
        END_IF;

    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.HALT_STOP:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'HALT_STOP';
        GroupData.Diag.tStepPreset := GroupData.Timeouts.tHaltTimeout;
        GroupData.Diag.iPowerMode := E_AXIS_GROUP_POWER_MODE.ON;

        xEnable := TRUE;
        xHaltCmd := TRUE;

        IF fbReadStatus.GroupErrorStop THEN
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF fbGroupHalt.Error
           OR xStepTimeout
           OR NOT GroupData.Cmd.xPowerPermit
           OR GroupData.Cmd.xGlobalError
           OR GroupData.Status.xLocalError
           OR rtStopCmd.Q THEN

            IF xStepTimeout THEN
                GroupData.Diag.dwError.dwLogicalErrorNew :=
                    GroupData.Diag.dwError.dwLogicalErrorNew
                    OR LOG_STEP_TIMEOUT;
            END_IF;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.EMG_STOP;

        ELSIF fbGroupHalt.Done
           AND fbReadStatus.GroupStandby THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.READY;
        END_IF;


    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.EMG_STOP:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'STOPPING';
        GroupData.Diag.tStepPreset := GroupData.Timeouts.tStopTimeout;
        GroupData.Diag.iPowerMode := E_AXIS_GROUP_POWER_MODE.ON;

        xEnable := TRUE;
        xStopCmd := TRUE;

        IF fbReadStatus.GroupErrorStop
           OR fbGroupStop.Error THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF xStepTimeout THEN
            GroupData.Diag.dwError.dwLogicalErrorNew :=
                GroupData.Diag.dwError.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF fbGroupStop.Done THEN
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.WAIT_STOP;
        END_IF;


    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.WAIT_STOP:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'WAIT_STOP';
        GroupData.Diag.tStepPreset := GroupData.Timeouts.tStopTimeout;
        GroupData.Diag.iPowerMode := E_AXIS_GROUP_POWER_MODE.ON;

        xEnable := TRUE;

        IF fbReadStatus.GroupErrorStop THEN
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF xStepTimeout THEN
            GroupData.Diag.dwError.dwLogicalErrorNew :=
                GroupData.Diag.dwError.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF fbReadStatus.GroupStandby THEN
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_GROUP;
        END_IF;


    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.DISABLING_GROUP:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'DISABLING_GROUP';
        GroupData.Diag.tStepPreset := GroupData.Timeouts.tGroupTimeout;
        GroupData.Diag.iPowerMode := E_AXIS_GROUP_POWER_MODE.ON;

        xDisable := TRUE;

        IF fbReadStatus.GroupErrorStop
           OR fbGroupDisable.Error THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF xStepTimeout THEN
            GroupData.Diag.dwError.dwLogicalErrorNew :=
                GroupData.Diag.dwError.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF fbGroupDisable.Done
           AND fbReadStatus.GroupDisabled THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_POWER;
        END_IF;


    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.DISABLING_POWER:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'DISABLING_POWER';
        GroupData.Diag.tStepPreset := GroupData.Timeouts.tPowerTimeout;
        GroupData.Diag.iPowerMode :=
            E_AXIS_GROUP_POWER_MODE.OFF_REQUEST;

        IF xStepTimeout THEN
            GroupData.Diag.dwError.dwLogicalErrorNew :=
                GroupData.Diag.dwError.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF NOT fbGroupPower.Status THEN

            IF GroupData.Cmd.xGlobalError
               OR GroupData.Status.xLocalError
			   OR NOT GroupData.Cmd.xPowerPermit THEN

                GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;
            ELSE
                GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLED;
            END_IF;
        END_IF;


    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.ERROR:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'ERROR';
        GroupData.Diag.tStepPreset := T#0S;

        GroupData.Diag.iPowerMode := E_AXIS_GROUP_POWER_MODE.OFF_REQUEST;

        IF rtResetAllError.Q THEN

            IF GroupData.Cmd.xGlobalError THEN
                GroupData.Diag.sWarningText :=
                    'Global error is still active';

                xWarningPulse := TRUE;

            ELSIF fbReadStatus.GroupErrorStop THEN
                    GroupData.Diag.iStep :=
                        E_AXIS_GROUP_STATE.RESETTING;

            ELSIF GroupData.Diag.dwError.dwMotionErrorActive
                  <> DWORD#0 THEN

                GroupData.Diag.sWarningText :=
                    'Motion FB error is still active';

                xWarningPulse := TRUE;

            ELSE
                // Ошибка устранена — очищаем защёлки.
                GroupData.Diag.dwError.dwLogicalErrorLatched := DWORD#0;
                GroupData.Diag.dwError.dwMotionErrorLatched := DWORD#0;
                GroupData.Diag.dwError.dwMotionErrorPrevious := DWORD#0;

                IF NOT fbGroupPower.Status THEN
                    GroupData.Diag.iStep :=
                        E_AXIS_GROUP_STATE.DISABLED;

                ELSIF fbReadStatus.GroupDisabled THEN
                    GroupData.Diag.iStep :=
                        E_AXIS_GROUP_STATE.DISABLING_POWER;

                ELSIF fbReadStatus.GroupStandby THEN
                    GroupData.Diag.iStep :=
                        E_AXIS_GROUP_STATE.DISABLING_GROUP;

                ELSE
                    GroupData.Diag.iStep :=
                        E_AXIS_GROUP_STATE.DISABLING_POWER;
                END_IF;
            END_IF;
        END_IF;


    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.RESETTING:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'RESETTING';
        GroupData.Diag.tStepPreset := GroupData.Timeouts.tGroupTimeout;
        GroupData.Diag.iPowerMode := E_AXIS_GROUP_POWER_MODE.ON;

        xResetMC := TRUE;

        IF GroupData.Cmd.xGlobalError
           OR fbGroupReset.Error THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF xStepTimeout THEN
            GroupData.Diag.dwError.dwLogicalErrorNew :=
                GroupData.Diag.dwError.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF fbGroupReset.Done THEN

            IF fbReadStatus.GroupErrorStop THEN
                GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;
            ELSE
                GroupData.Diag.dwError.dwLogicalErrorLatched := DWORD#0;
                GroupData.Diag.dwError.dwMotionErrorLatched := DWORD#0;
                GroupData.Diag.dwError.dwMotionErrorPrevious := DWORD#0;

                IF NOT fbGroupPower.Status THEN
                    GroupData.Diag.iStep :=
                        E_AXIS_GROUP_STATE.DISABLED;

                ELSIF fbReadStatus.GroupDisabled THEN
                    GroupData.Diag.iStep :=
                        E_AXIS_GROUP_STATE.DISABLING_POWER;

                ELSIF fbReadStatus.GroupStandby THEN
                    GroupData.Diag.iStep :=
                        E_AXIS_GROUP_STATE.DISABLING_GROUP;

                ELSE
                    GroupData.Diag.iStep :=
                        E_AXIS_GROUP_STATE.DISABLING_POWER;
                END_IF;
            END_IF;
        END_IF;


    // -------------------------------------------------------------------------
    ELSE
    // -------------------------------------------------------------------------
        GroupData.Diag.dwError.dwLogicalErrorNew :=
            GroupData.Diag.dwError.dwLogicalErrorNew
            OR LOG_INVALID_STATE;

        GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

END_CASE;


// =============================================================================
// 7. Целевая позиция
// =============================================================================
GroupData.MotionParam.stTargetPos.c.X := GroupData.MotionParam.lrX;
GroupData.MotionParam.stTargetPos.c.Y := GroupData.MotionParam.lrY;
GroupData.MotionParam.stTargetPos.c.Z := GroupData.MotionParam.lrZ;


// =============================================================================
// 8. Режим питания
// =============================================================================
xPowerEnable :=
    GroupData.Diag.iPowerMode <> E_AXIS_GROUP_POWER_MODE.OFF;

xRegulatorOn :=
    GroupData.Diag.iPowerMode = E_AXIS_GROUP_POWER_MODE.ON;

xDriveStart :=
    GroupData.Diag.iPowerMode = E_AXIS_GROUP_POWER_MODE.ON;


// =============================================================================
// 9. Вызовы Motion FB
// =============================================================================
fbGroupEnable(
    AxisGroup := AxisGroup,
    Execute   := xEnable
);

fbGroupDisable(
    AxisGroup := AxisGroup,
    Execute   := xDisable
);

fbGroupPower(
    AxisGroup    := AxisGroup,
    Enable       := xPowerEnable,
    bRegulatorOn := xRegulatorOn,
    bDriveStart  := xDriveStart
);

fbGroupReset(
    AxisGroup := AxisGroup,
    Execute   := xResetMC
);

fbMoveDirect(
    AxisGroup   := AxisGroup,
    Execute     := xMoveDirect,
    Position    := GroupData.MotionParam.stTargetPos,
    CoordSystem := SMC_COORD_SYSTEM.MCS,
    BufferMode  := MC_BUFFER_MODE.Aborting,
    VelFactor   := GroupData.MotionParam.VelFactor,
    AccFactor   := GroupData.MotionParam.AccFactor,
    JerkFactor  := GroupData.MotionParam.JerkFactor
);

fbMoveLinear(
    AxisGroup := AxisGroup,
    Execute   := xMoveLinear
);

fbGroupHalt(
    AxisGroup    := AxisGroup,
    Execute      := xHaltCmd,
    Deceleration := GroupData.MotionParam.HaltDeceleration,
    Jerk         := GroupData.MotionParam.HaltJerk
);

fbGroupStop(
    AxisGroup    := AxisGroup,
    Execute      := xStopCmd,
    Deceleration := GroupData.MotionParam.HaltDeceleration * 2,
    Jerk         := GroupData.MotionParam.HaltJerk * 2
);


// =============================================================================
// 10. Маска Motion-ошибок
// =============================================================================
GroupData.Diag.dwError.dwMotionErrorActive := DWORD#0;

IF fbGroupEnable.Error THEN
    GroupData.Diag.dwError.dwMotionErrorActive :=
        GroupData.Diag.dwError.dwMotionErrorActive
        OR MOTION_ERR_ENABLE;
END_IF;

IF fbGroupPower.Error THEN
    GroupData.Diag.dwError.dwMotionErrorActive :=
        GroupData.Diag.dwError.dwMotionErrorActive
        OR MOTION_ERR_POWER;
END_IF;

IF fbGroupDisable.Error THEN
    GroupData.Diag.dwError.dwMotionErrorActive :=
        GroupData.Diag.dwError.dwMotionErrorActive
        OR MOTION_ERR_DISABLE;
END_IF;

IF fbGroupReset.Error THEN
    GroupData.Diag.dwError.dwMotionErrorActive :=
        GroupData.Diag.dwError.dwMotionErrorActive
        OR MOTION_ERR_RESET;
END_IF;

IF fbMoveDirect.Error THEN
    GroupData.Diag.dwError.dwMotionErrorActive :=
        GroupData.Diag.dwError.dwMotionErrorActive
        OR MOTION_ERR_MOVE_DIRECT;
END_IF;

IF fbMoveLinear.Error THEN
    GroupData.Diag.dwError.dwMotionErrorActive :=
        GroupData.Diag.dwError.dwMotionErrorActive
        OR MOTION_ERR_MOVE_LINEAR;
END_IF;

IF fbGroupHalt.Error THEN
    GroupData.Diag.dwError.dwMotionErrorActive :=
        GroupData.Diag.dwError.dwMotionErrorActive
        OR MOTION_ERR_HALT;
END_IF;

IF fbGroupStop.Error THEN
    GroupData.Diag.dwError.dwMotionErrorActive :=
        GroupData.Diag.dwError.dwMotionErrorActive
        OR MOTION_ERR_STOP;
END_IF;

IF fbReadPosition.Error THEN
    GroupData.Diag.dwError.dwMotionErrorActive :=
        GroupData.Diag.dwError.dwMotionErrorActive
        OR MOTION_ERR_READ_POSITION;
END_IF;

IF fbReadStatus.Error THEN
    GroupData.Diag.dwError.dwMotionErrorActive :=
        GroupData.Diag.dwError.dwMotionErrorActive
        OR MOTION_ERR_READ_STATUS;
END_IF;


// Только ошибки, которых не было в предыдущем цикле.
GroupData.Diag.dwError.dwMotionErrorNew :=
    GroupData.Diag.dwError.dwMotionErrorActive
    AND NOT GroupData.Diag.dwError.dwMotionErrorPrevious;


// Защёлкиваем новые логические и Motion-ошибки.
GroupData.Diag.dwError.dwLogicalErrorLatched :=
    GroupData.Diag.dwError.dwLogicalErrorLatched
    OR GroupData.Diag.dwError.dwLogicalErrorNew;

GroupData.Diag.dwError.dwMotionErrorLatched :=
    GroupData.Diag.dwError.dwMotionErrorLatched
    OR GroupData.Diag.dwError.dwMotionErrorNew;


// Сохраняем Motion-маску для следующего цикла.
GroupData.Diag.dwError.dwMotionErrorPrevious :=
    GroupData.Diag.dwError.dwMotionErrorActive;


// =============================================================================
// 11. Изменение шага и таймер
// =============================================================================
IF NOT xStepInitialized THEN
    iPrevStep := GroupData.Diag.iStep;
    xStepInitialized := TRUE;
END_IF;

xStepChanged :=
    GroupData.Diag.iStep <> iPrevStep;

GroupData.Diag.xStepChanged := xStepChanged;

IF xStepChanged THEN
    GroupData.Diag.iOldStep := iPrevStep;
    GroupData.Diag.iNewStep := GroupData.Diag.iStep;
    iPrevStep := GroupData.Diag.iStep;
END_IF;


// При переходе в новый шаг таймер один цикл выключен.
// Со следующего цикла начинается отсчёт нового шага.
tonStepTimeout(
    IN :=
        NOT xStepChanged
        AND (GroupData.Diag.tStepPreset > T#0S)
        AND (GroupData.Diag.iStep <> E_AXIS_GROUP_STATE.ERROR),

    PT := GroupData.Diag.tStepPreset
);

xStepTimeout := tonStepTimeout.Q;
GroupData.Diag.xStepTimeout := xStepTimeout;


// =============================================================================
// 12. Финальные статусы
// =============================================================================
GroupData.Status.xGroupError :=
    fbReadStatus.Error
    OR fbReadStatus.GroupErrorStop
    OR (GroupData.Diag.dwError.dwMotionErrorLatched <> DWORD#0);

GroupData.Status.xLocalError :=
    GroupData.Status.xGroupError
    OR (GroupData.Diag.dwError.dwLogicalErrorLatched <> DWORD#0);
	
GroupData.Status.xMoveDirectDone := fbMoveDirect.Done;

