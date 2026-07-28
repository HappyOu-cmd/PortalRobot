FUNCTION_BLOCK FB_Axis
VAR_IN_OUT
    Axis     : AXIS_REF_SM3;   // ссылка на ось SoftMotion
    AxisData : ST_AXIS;        // все данные оси (команды, параметры, статусы)
END_VAR

VAR CONSTANT
    // ==================================================
    // AXIS / MC / SOFTMOTION ERRORS
    // ==================================================
    AXE_MC_POWER_ERROR       : DWORD := DWORD#16#00000001;
    AXE_MC_RESET_ERROR       : DWORD := DWORD#16#00000002;
    AXE_MC_STOP_ERROR        : DWORD := DWORD#16#00000004;
    AXE_MC_JOG_ERROR         : DWORD := DWORD#16#00000008;
    AXE_MC_HOME_ERROR        : DWORD := DWORD#16#00000010;
    AXE_MC_MOVE_ABS_ERROR    : DWORD := DWORD#16#00000020;
    AXE_MC_MOVE_REL_ERROR    : DWORD := DWORD#16#00000040;
    AXE_READ_POS_ERROR       : DWORD := DWORD#16#00000080;
    AXE_READ_STATUS_ERROR    : DWORD := DWORD#16#00000100;
    AXE_ERRORSTOP            : DWORD := DWORD#16#00000200;
    AXE_FB_ERROR_OCCURRED    : DWORD := DWORD#16#00000400;
    AXE_COMMAND_ABORTED      : DWORD := DWORD#16#00000800;
    AXE_UNKNOWN_ACTUAL_ERROR : DWORD := DWORD#16#00001000;
    AXE_DRIVE_AXIS_ERROR     : DWORD := DWORD#16#00002000;

    // ==================================================
    // LOGICAL ERRORS
    // ==================================================
    LOG_POWER_PERMIT_LOST    : DWORD := DWORD#16#00000001;
    LOG_GLOBAL_DURING_POWER  : DWORD := DWORD#16#00000002;
    LOG_GLOBAL_DURING_READY  : DWORD := DWORD#16#00000004;
    LOG_GLOBAL_DURING_MOTION : DWORD := DWORD#16#00000008;
    LOG_JOG_CONFLICT         : DWORD := DWORD#16#00000010;
    LOG_MOVE_ABS_NOT_HOMED   : DWORD := DWORD#16#00000020;
    LOG_MOVE_REL_NOT_HOMED   : DWORD := DWORD#16#00000040;
    LOG_STEP_TIMEOUT         : DWORD := DWORD#16#00000080;
    LOG_UNKNOWN_STEP         : DWORD := DWORD#16#00000100;

    // ==================================================
    // WARNINGS
    // ==================================================
    WRN_NO_POWER_PERMIT      : DWORD := DWORD#16#00000001;
END_VAR

VAR
    // Триггеры на команды
    rtEnable             : R_TRIG;
    rtDisable            : R_TRIG;
    rtResetAllError      : R_TRIG;
    rtResetAxisError     : R_TRIG;
    rtResetLogicalError  : R_TRIG;
    rtStop               : R_TRIG;
    rtHome               : R_TRIG;
    rtMoveAbsolute       : R_TRIG;
    rtMoveRelative       : R_TRIG;

    // Экземпляры MC-блоков
    fbPower              : MC_Power;
    fbReset              : MC_Reset;
    fbStop               : MC_Stop;
    fbJog                : MC_Jog;
    fbHome               : MC_Home;
    fbMoveAbsolute       : MC_MoveAbsolute;
    fbMoveRelative       : MC_MoveRelative;
    fbReadPosition       : MC_ReadActualPosition;
    fbReadStatus         : MC_ReadStatus;
    fbReadAxisError      : MC_ReadAxisError;

    // Внутренние управляющие флаги 
    xPowerRequest        : BOOL;
    xResetExecute        : BOOL;
    xStopExecute         : BOOL;
    xHomeExecute         : BOOL;
    xMoveAbsExecute      : BOOL;
    xMoveRelExecute      : BOOL;
    xJogForwardExec      : BOOL;
    xJogBackwardExec     : BOOL;

    // Для таймера шага
    iPrevStep            : E_AXIS_STATE := E_AXIS_STATE.DISABLED;
    xStepChanged         : BOOL;
    xStepTimerEnable     : BOOL;
    tonStep              : TON;
    tonStepTimeout       : TON;

    // Для удержания предупреждений
    tpWarningHold        : TP;
    xWarningPulse        : BOOL;

    // Вспомогательные флаги для сброса
    xDoResetAxis         : BOOL;
    xDoResetLogical      : BOOL;
    xNeedMcReset         : BOOL;

    // Актуальная ошибка оси (на основе MC-блоков)
    xAxisErrorActual     : BOOL;
END_VAR
// --- BEGIN IMPLEMENTATION ---

// ======================================================
// 1. ФРОНТЫ (триггеры на команды из структуры)
// ======================================================
rtEnable(CLK := AxisData.Cmd.xEnable);
rtDisable(CLK := AxisData.Cmd.xDisable);
rtResetAllError(CLK := AxisData.Cmd.xResetAllError);
rtResetAxisError(CLK := AxisData.Cmd.xResetAxisError);
rtResetLogicalError(CLK := AxisData.Cmd.xResetLogicalError);
rtStop(CLK := AxisData.Cmd.xStop);
rtHome(CLK := AxisData.Cmd.xHome);
rtMoveAbsolute(CLK := AxisData.Cmd.xMoveAbsolute);
rtMoveRelative(CLK := AxisData.Cmd.xMoveRelative);

// ======================================================
// 2. СТАТУСЫ ОТ MC-БЛОКОВ (запись в структуру)
// ======================================================
AxisData.Status.xPowered := fbPower.Status;

AxisData.Status.xLocalError :=
    fbPower.Error OR
    fbReset.Error OR
    fbStop.Error OR
    fbJog.Error OR
    fbHome.Error OR
    fbMoveAbsolute.Error OR
    fbMoveRelative.Error OR
    fbReadPosition.Error OR
    fbReadStatus.Error OR
    fbReadStatus.Errorstop OR
    fbReadStatus.FBErrorOccured;

AxisData.Status.xMotionBusy :=
    fbStop.Busy OR
    fbJog.Busy OR
    fbHome.Busy OR
    fbMoveAbsolute.Busy OR
    fbMoveRelative.Busy;

// MC_Reset нужен только для аппаратных/SoftMotion ошибок
xNeedMcReset := fbReadStatus.Errorstop OR fbReadStatus.FBErrorOccured OR fbReadAxisError.AxisError;

AxisData.ErrorCodes.dwAxisError := AxisData.ErrorCodes.dwAxisErrorActual OR AxisData.ErrorCodes.dwAxisErrorLatched;
AxisData.ErrorCodes.dwLogicalError := AxisData.ErrorCodes.dwLogicalErrorLatched;
AxisData.ErrorCodes.dwAllError := AxisData.ErrorCodes.dwAxisError OR AxisData.ErrorCodes.dwLogicalError;

// ======================================================
// 3. ЗНАЧЕНИЯ ПО УМОЛЧАНИЮ ДЛЯ ИСПОЛНИТЕЛЬНЫХ ФЛАГОВ
// ======================================================
xResetExecute    := FALSE;
xStopExecute     := FALSE;
xHomeExecute     := FALSE;
xMoveAbsExecute  := FALSE;
xMoveRelExecute  := FALSE;
xJogForwardExec  := FALSE;
xJogBackwardExec := FALSE;

AxisData.Status.xDone := FALSE;
xWarningPulse := FALSE;

// ======================================================
// 4. КОНЕЧНЫЙ АВТОМАТ (используем перечисление E_AXIS_STATE)
// ======================================================
CASE AxisData.Diag.iStep OF

    // --------------------------------------------------
    E_AXIS_STATE.DISABLED:
    // --------------------------------------------------
        AxisData.Diag.sStepName := 'DISABLED';
        AxisData.Diag.sWaitReason := 'Waiting Enable command';
        AxisData.Diag.tStepPreset := T#0S;

        xPowerRequest := FALSE;
        AxisData.Status.xHomed := FALSE;

        IF AxisData.Status.xError THEN
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF rtEnable.Q AND NOT AxisData.Cmd.xPowerPermit THEN
            AxisData.ErrorCodes.dwWarningLatched :=
                AxisData.ErrorCodes.dwWarningLatched OR WRN_NO_POWER_PERMIT;
            AxisData.Diag.sWarningText := 'Нет разрешения на запуск двигателя';
            xWarningPulse := TRUE;
            AxisData.Diag.sWaitReason := 'Power permit missing';

        ELSIF NOT AxisData.Cmd.xPowerPermit THEN
            AxisData.Diag.sWaitReason := 'Power permit missing';

        ELSIF rtEnable.Q THEN
            xPowerRequest := TRUE;
            AxisData.Diag.iStep := E_AXIS_STATE.POWERING;
        END_IF;

    // --------------------------------------------------
    E_AXIS_STATE.POWERING:
    // --------------------------------------------------
        AxisData.Diag.sStepName := 'POWERING';
        AxisData.Diag.sWaitReason := 'Waiting MC_Power.Status';
        AxisData.Diag.tStepPreset := AxisData.Timeouts.tPowerTimeout;

        xPowerRequest := TRUE;

        IF NOT AxisData.Cmd.xPowerPermit THEN
            xPowerRequest := FALSE;
            AxisData.ErrorCodes.dwLogicalErrorLatched :=
                AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_POWER_PERMIT_LOST;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF AxisData.Cmd.xGlobalError THEN
            xPowerRequest := FALSE;
            AxisData.ErrorCodes.dwLogicalErrorLatched :=
                AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_GLOBAL_DURING_POWER;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF fbPower.Error THEN
            xPowerRequest := FALSE;
            AxisData.ErrorCodes.dwAxisErrorLatched :=
                AxisData.ErrorCodes.dwAxisErrorLatched OR AXE_MC_POWER_ERROR;
            AxisData.Diag.udiLastErrorID := TO_UDINT(fbPower.ErrorID);
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF fbPower.Status THEN
            AxisData.Diag.iStep := E_AXIS_STATE.READY;

        ELSIF rtDisable.Q THEN
            xPowerRequest := FALSE;
            AxisData.Diag.iStep := E_AXIS_STATE.DISABLED;
        END_IF;

    // --------------------------------------------------
    E_AXIS_STATE.READY:
    // --------------------------------------------------
        AxisData.Diag.sStepName := 'READY';
        AxisData.Diag.sWaitReason := 'Waiting command';
        AxisData.Diag.tStepPreset := T#0S;

        xPowerRequest := TRUE;

        IF NOT AxisData.Cmd.xPowerPermit THEN
            xPowerRequest := FALSE;
            AxisData.Diag.iStep := E_AXIS_STATE.DISABLED;

        ELSIF rtDisable.Q THEN
            xPowerRequest := FALSE;
            AxisData.Diag.iStep := E_AXIS_STATE.DISABLED;

        ELSIF AxisData.Cmd.xGlobalError THEN
            AxisData.ErrorCodes.dwLogicalErrorLatched :=
                AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_GLOBAL_DURING_READY;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF xAxisErrorActual THEN
            AxisData.ErrorCodes.dwAxisErrorLatched :=
                AxisData.ErrorCodes.dwAxisErrorLatched OR AxisData.ErrorCodes.dwAxisErrorActual;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF AxisData.Cmd.xJogPositive AND AxisData.Cmd.xJogNegative THEN
            AxisData.ErrorCodes.dwLogicalErrorLatched :=
                AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_JOG_CONFLICT;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF AxisData.Cmd.xJogPositive OR AxisData.Cmd.xJogNegative THEN
            AxisData.Diag.iStep := E_AXIS_STATE.JOGGING;

        ELSIF rtHome.Q THEN
            AxisData.Diag.iStep := E_AXIS_STATE.HOMING;

        ELSIF rtMoveAbsolute.Q THEN
            IF AxisData.Status.xHomed THEN
                AxisData.Diag.iStep := E_AXIS_STATE.MOVE_ABSOLUTE;
            ELSE
                AxisData.ErrorCodes.dwLogicalErrorLatched :=
                    AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_MOVE_ABS_NOT_HOMED;
                AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
                AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;
            END_IF;

        ELSIF rtMoveRelative.Q THEN
            IF AxisData.Status.xHomed THEN
                AxisData.Diag.iStep := E_AXIS_STATE.MOVE_RELATIVE;
            ELSE
                AxisData.ErrorCodes.dwLogicalErrorLatched :=
                    AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_MOVE_REL_NOT_HOMED;
                AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
                AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;
            END_IF;
        END_IF;

    // --------------------------------------------------
    E_AXIS_STATE.JOGGING:
    // --------------------------------------------------
        AxisData.Diag.sStepName := 'JOGGING';
        AxisData.Diag.sWaitReason := 'Jog active';
        AxisData.Diag.tStepPreset := T#0S;

        xPowerRequest := TRUE;
        xJogForwardExec  := AxisData.Cmd.xJogPositive AND NOT AxisData.Cmd.xJogNegative;
        xJogBackwardExec := AxisData.Cmd.xJogNegative AND NOT AxisData.Cmd.xJogPositive;

        IF NOT AxisData.Cmd.xPowerPermit THEN
            xJogForwardExec := FALSE;
            xJogBackwardExec := FALSE;
            AxisData.ErrorCodes.dwLogicalErrorLatched :=
                AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_POWER_PERMIT_LOST;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF AxisData.Cmd.xGlobalError THEN
            xJogForwardExec := FALSE;
            xJogBackwardExec := FALSE;
            AxisData.ErrorCodes.dwLogicalErrorLatched :=
                AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_GLOBAL_DURING_MOTION;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF xAxisErrorActual THEN
            xJogForwardExec := FALSE;
            xJogBackwardExec := FALSE;
            AxisData.ErrorCodes.dwAxisErrorLatched :=
                AxisData.ErrorCodes.dwAxisErrorLatched OR AxisData.ErrorCodes.dwAxisErrorActual;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF rtStop.Q THEN
            xJogForwardExec := FALSE;
            xJogBackwardExec := FALSE;
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF AxisData.Cmd.xJogPositive AND AxisData.Cmd.xJogNegative THEN
            xJogForwardExec := FALSE;
            xJogBackwardExec := FALSE;
            AxisData.ErrorCodes.dwLogicalErrorLatched :=
                AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_JOG_CONFLICT;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF NOT AxisData.Cmd.xJogPositive AND NOT AxisData.Cmd.xJogNegative THEN
            xJogForwardExec := FALSE;
            xJogBackwardExec := FALSE;
            AxisData.Diag.iStep := E_AXIS_STATE.READY;
        END_IF;

    // --------------------------------------------------
    E_AXIS_STATE.HOMING:
    // --------------------------------------------------
        AxisData.Diag.sStepName := 'HOMING';
        AxisData.Diag.sWaitReason := 'Waiting MC_Home.Done';
        AxisData.Diag.tStepPreset := AxisData.Timeouts.tHomeTimeout;

        xPowerRequest := TRUE;
        xHomeExecute := TRUE;

        IF NOT AxisData.Cmd.xPowerPermit THEN
            xHomeExecute := FALSE;
            AxisData.ErrorCodes.dwLogicalErrorLatched :=
                AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_POWER_PERMIT_LOST;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF AxisData.Cmd.xGlobalError THEN
            xHomeExecute := FALSE;
            AxisData.ErrorCodes.dwLogicalErrorLatched :=
                AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_GLOBAL_DURING_MOTION;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF rtStop.Q THEN
            xHomeExecute := FALSE;
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF fbHome.Error THEN
            xHomeExecute := FALSE;
            AxisData.ErrorCodes.dwAxisErrorLatched :=
                AxisData.ErrorCodes.dwAxisErrorLatched OR AXE_MC_HOME_ERROR;
            AxisData.Diag.udiLastErrorID := TO_UDINT(fbHome.ErrorID);
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF fbHome.CommandAborted THEN
            xHomeExecute := FALSE;
            AxisData.ErrorCodes.dwAxisErrorLatched :=
                AxisData.ErrorCodes.dwAxisErrorLatched OR AXE_COMMAND_ABORTED;
            AxisData.Diag.udiLastErrorID := 3003;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF xAxisErrorActual THEN
            xHomeExecute := FALSE;
            AxisData.ErrorCodes.dwAxisErrorLatched :=
                AxisData.ErrorCodes.dwAxisErrorLatched OR AxisData.ErrorCodes.dwAxisErrorActual;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF fbHome.Done THEN
            xHomeExecute := FALSE;
            AxisData.Status.xHomed := TRUE;
            AxisData.Status.xDone := TRUE;
            AxisData.Diag.iStep := E_AXIS_STATE.READY;
        END_IF;

    // --------------------------------------------------
    E_AXIS_STATE.MOVE_ABSOLUTE:
    // --------------------------------------------------
        AxisData.Diag.sStepName := 'MOVING_ABSOLUTE';
        AxisData.Diag.sWaitReason := 'Waiting MC_MoveAbsolute.Done';
        AxisData.Diag.tStepPreset := AxisData.Timeouts.tMoveTimeout;

        xPowerRequest := TRUE;
        xMoveAbsExecute := TRUE;

        IF NOT AxisData.Cmd.xPowerPermit THEN
            xMoveAbsExecute := FALSE;
            AxisData.ErrorCodes.dwLogicalErrorLatched :=
                AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_POWER_PERMIT_LOST;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF AxisData.Cmd.xGlobalError THEN
            xMoveAbsExecute := FALSE;
            AxisData.ErrorCodes.dwLogicalErrorLatched :=
                AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_GLOBAL_DURING_MOTION;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF rtStop.Q THEN
            xMoveAbsExecute := FALSE;
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF fbMoveAbsolute.Error THEN
            xMoveAbsExecute := FALSE;
            AxisData.ErrorCodes.dwAxisErrorLatched :=
                AxisData.ErrorCodes.dwAxisErrorLatched OR AXE_MC_MOVE_ABS_ERROR;
            AxisData.Diag.udiLastErrorID := TO_UDINT(fbMoveAbsolute.ErrorID);
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF fbMoveAbsolute.CommandAborted THEN
            xMoveAbsExecute := FALSE;
            AxisData.ErrorCodes.dwAxisErrorLatched :=
                AxisData.ErrorCodes.dwAxisErrorLatched OR AXE_COMMAND_ABORTED;
            AxisData.Diag.udiLastErrorID := 3003;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF xAxisErrorActual THEN
            xMoveAbsExecute := FALSE;
            AxisData.ErrorCodes.dwAxisErrorLatched :=
                AxisData.ErrorCodes.dwAxisErrorLatched OR AxisData.ErrorCodes.dwAxisErrorActual;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF fbMoveAbsolute.Done THEN
            xMoveAbsExecute := FALSE;
            AxisData.Status.xDone := TRUE;
            AxisData.Diag.iStep := E_AXIS_STATE.READY;
        END_IF;

    // --------------------------------------------------
    E_AXIS_STATE.MOVE_RELATIVE:
    // --------------------------------------------------
        AxisData.Diag.sStepName := 'MOVING_RELATIVE';
        AxisData.Diag.sWaitReason := 'Waiting MC_MoveRelative.Done';
        AxisData.Diag.tStepPreset := AxisData.Timeouts.tMoveTimeout;

        xPowerRequest := TRUE;
        xMoveRelExecute := TRUE;

        IF NOT AxisData.Cmd.xPowerPermit THEN
            xMoveRelExecute := FALSE;
            AxisData.ErrorCodes.dwLogicalErrorLatched :=
                AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_POWER_PERMIT_LOST;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF AxisData.Cmd.xGlobalError THEN
            xMoveRelExecute := FALSE;
            AxisData.ErrorCodes.dwLogicalErrorLatched :=
                AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_GLOBAL_DURING_MOTION;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF rtStop.Q THEN
            xMoveRelExecute := FALSE;
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF fbMoveRelative.Error THEN
            xMoveRelExecute := FALSE;
            AxisData.ErrorCodes.dwAxisErrorLatched :=
                AxisData.ErrorCodes.dwAxisErrorLatched OR AXE_MC_MOVE_REL_ERROR;
            AxisData.Diag.udiLastErrorID := TO_UDINT(fbMoveRelative.ErrorID);
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF fbMoveRelative.CommandAborted THEN
            xMoveRelExecute := FALSE;
            AxisData.ErrorCodes.dwAxisErrorLatched :=
                AxisData.ErrorCodes.dwAxisErrorLatched OR AXE_COMMAND_ABORTED;
            AxisData.Diag.udiLastErrorID := 3003;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF xAxisErrorActual THEN
            xMoveRelExecute := FALSE;
            AxisData.ErrorCodes.dwAxisErrorLatched :=
                AxisData.ErrorCodes.dwAxisErrorLatched OR AxisData.ErrorCodes.dwAxisErrorActual;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF fbMoveRelative.Done THEN 
            xMoveRelExecute := FALSE;
            AxisData.Status.xDone := TRUE;
            AxisData.Diag.iStep := E_AXIS_STATE.READY;
        END_IF;

    // --------------------------------------------------
    E_AXIS_STATE.STOPPING:
    // --------------------------------------------------
        AxisData.Diag.sStepName := 'STOPPING';
        AxisData.Diag.sWaitReason := 'Waiting MC_Stop.Done';
        AxisData.Diag.tStepPreset := AxisData.Timeouts.tStopTimeout;

        xPowerRequest := TRUE;
        xStopExecute := TRUE;

        IF fbStop.Error THEN
            xStopExecute := FALSE;
            AxisData.ErrorCodes.dwAxisErrorLatched :=
                AxisData.ErrorCodes.dwAxisErrorLatched OR AXE_MC_STOP_ERROR;
            AxisData.Diag.udiLastErrorID := TO_UDINT(fbStop.ErrorID);
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF fbStop.Done THEN
            AxisData.Status.xDone := TRUE;
            AxisData.Diag.iStep := E_AXIS_STATE.STOP_RELEASE;
        END_IF;

    // --------------------------------------------------
    E_AXIS_STATE.STOP_RELEASE:
    // --------------------------------------------------
        AxisData.Diag.sStepName := 'STOP_RELEASE';
        AxisData.Diag.sWaitReason := 'Releasing MC_Stop.Execute';
        AxisData.Diag.tStepPreset := T#1S;

        xPowerRequest := TRUE;
        xStopExecute := FALSE;

        IF NOT fbStop.Busy THEN
            IF AxisData.Cmd.xGlobalError OR
               (AxisData.ErrorCodes.dwAxisErrorLatched <> DWORD#0) OR
               (AxisData.ErrorCodes.dwLogicalErrorLatched <> DWORD#0) OR
               xAxisErrorActual
            THEN
                AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;
            ELSE
                AxisData.Diag.iStep := E_AXIS_STATE.READY;
            END_IF;
        END_IF;

    // --------------------------------------------------
    E_AXIS_STATE.ERROR_RESET_MANAGER:
    // --------------------------------------------------
        AxisData.Diag.sStepName := 'ERROR';
        AxisData.Diag.tStepPreset := T#0S;

        xResetExecute    := FALSE;
        xStopExecute     := FALSE;
        xHomeExecute     := FALSE;
        xMoveAbsExecute  := FALSE;
        xMoveRelExecute  := FALSE;
        xJogForwardExec  := FALSE;
        xJogBackwardExec := FALSE;

        IF AxisData.Timeouts.xDisableOnError THEN
            xPowerRequest := FALSE;
        ELSE
            xPowerRequest := AxisData.Cmd.xPowerPermit AND NOT xAxisErrorActual;
        END_IF;

        IF (AxisData.ErrorCodes.dwAxisError = DWORD#0) AND
           (AxisData.ErrorCodes.dwLogicalError = DWORD#0) AND
           NOT AxisData.Cmd.xGlobalError
        THEN
            AxisData.Diag.iStep := E_AXIS_STATE.DISABLED;

        ELSE
            IF AxisData.Cmd.xGlobalError THEN
                AxisData.Diag.sWaitReason := 'Waiting global error release';
            ELSIF (AxisData.ErrorCodes.dwAxisError <> DWORD#0) AND
                  (AxisData.ErrorCodes.dwLogicalError <> DWORD#0) THEN
                AxisData.Diag.sWaitReason := 'Waiting ResetAllError';
            ELSIF AxisData.ErrorCodes.dwAxisError <> DWORD#0 THEN
                AxisData.Diag.sWaitReason := 'Waiting ResetAxisError or ResetAllError';
            ELSIF AxisData.ErrorCodes.dwLogicalError <> DWORD#0 THEN
                AxisData.Diag.sWaitReason := 'Waiting ResetLogicalError or ResetAllError';
            ELSE
                AxisData.Diag.sWaitReason := 'Waiting reset';
            END_IF;

            IF rtResetAllError.Q THEN
                xDoResetAxis := TRUE;
                xDoResetLogical := TRUE;
                IF xNeedMcReset THEN
                    AxisData.Diag.iStep := E_AXIS_STATE.RESET_AXIS_ERROR;
                ELSE
                    AxisData.Diag.iStep := E_AXIS_STATE.RESET_FINISH;
                END_IF;

            ELSIF rtResetAxisError.Q THEN
                xDoResetAxis := TRUE;
                xDoResetLogical := FALSE;
                IF xNeedMcReset THEN
                    AxisData.Diag.iStep := E_AXIS_STATE.RESET_AXIS_ERROR;
                ELSE
                    AxisData.Diag.iStep := E_AXIS_STATE.RESET_FINISH;
                END_IF;

            ELSIF rtResetLogicalError.Q THEN
                xDoResetAxis := FALSE;
                xDoResetLogical := TRUE;
                AxisData.Diag.iStep := E_AXIS_STATE.RESET_FINISH;
            END_IF;
        END_IF;

    // --------------------------------------------------
    E_AXIS_STATE.RESET_AXIS_ERROR:
    // --------------------------------------------------
        AxisData.Diag.sStepName := 'RESET_AXIS_ERROR';
        AxisData.Diag.sWaitReason := 'Waiting MC_Reset.Done';
        AxisData.Diag.tStepPreset := AxisData.Timeouts.tResetTimeout;

        xPowerRequest := FALSE;
        xResetExecute := TRUE;

        IF fbReset.Error THEN
            xResetExecute := FALSE;
            AxisData.ErrorCodes.dwAxisErrorLatched :=
                AxisData.ErrorCodes.dwAxisErrorLatched OR AXE_MC_RESET_ERROR;
            AxisData.Diag.udiLastErrorID := TO_UDINT(fbReset.ErrorID);
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF fbReset.Done THEN
            xResetExecute := FALSE;
            AxisData.Diag.iStep := E_AXIS_STATE.RESET_RELEASE;
        END_IF;

    // --------------------------------------------------
    E_AXIS_STATE.RESET_RELEASE:
    // --------------------------------------------------
        AxisData.Diag.sStepName := 'RESET_RELEASE';
        AxisData.Diag.sWaitReason := 'Releasing MC_Reset.Execute';
        AxisData.Diag.tStepPreset := T#1S;

        xPowerRequest := FALSE;
        xResetExecute := FALSE;

        IF NOT fbReset.Busy THEN
            AxisData.Diag.iStep := E_AXIS_STATE.RESET_FINISH;
        END_IF;

    // --------------------------------------------------
    E_AXIS_STATE.RESET_FINISH:
    // --------------------------------------------------
        AxisData.Diag.sStepName := 'RESET_FINISH';
        AxisData.Diag.sWaitReason := 'Finishing reset';
        AxisData.Diag.tStepPreset := T#0S;

        xPowerRequest := FALSE;
        xResetExecute := FALSE;

        IF xDoResetAxis THEN
            AxisData.ErrorCodes.dwAxisErrorLatched := DWORD#0;
        END_IF;
        IF xDoResetLogical THEN
            AxisData.ErrorCodes.dwLogicalErrorLatched := DWORD#0;
            AxisData.Diag.xStepTimeout := FALSE;
        END_IF;

        xDoResetAxis := FALSE;
        xDoResetLogical := FALSE;

        // Финальная проверка
        IF AxisData.ErrorCodes.dwAxisErrorActual <> DWORD#0 THEN
            AxisData.ErrorCodes.dwAxisErrorLatched :=
                AxisData.ErrorCodes.dwAxisErrorLatched OR AxisData.ErrorCodes.dwAxisErrorActual;
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF AxisData.ErrorCodes.dwAxisErrorLatched <> DWORD#0 THEN
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF AxisData.ErrorCodes.dwLogicalErrorLatched <> DWORD#0 THEN
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF AxisData.Cmd.xGlobalError THEN
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSE
            AxisData.Diag.iStep := E_AXIS_STATE.DISABLED;
        END_IF;

    // --------------------------------------------------
    ELSE  // неизвестное состояние
    // --------------------------------------------------
        AxisData.ErrorCodes.dwLogicalErrorLatched :=
            AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_UNKNOWN_STEP;
        AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
        AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

END_CASE;

// ======================================================
// 5. ТАЙМЕР ШАГА И КОНТРОЛЬ ТАЙМАУТА
// ======================================================
xStepChanged := (AxisData.Diag.iStep <> iPrevStep);
IF xStepChanged THEN
    iPrevStep := AxisData.Diag.iStep;
    xStepTimerEnable := FALSE;
ELSE
    xStepTimerEnable := TRUE;
END_IF;

tonStep(IN := xStepTimerEnable, PT := T#1000H);
AxisData.Diag.tStepElapsed := tonStep.ET;

tonStepTimeout(
    IN := xStepTimerEnable AND (AxisData.Diag.tStepPreset > T#0S),
    PT := AxisData.Diag.tStepPreset
);

IF tonStepTimeout.Q AND (AxisData.Diag.iStep <> E_AXIS_STATE.ERROR_RESET_MANAGER) THEN
    AxisData.Diag.xStepTimeout := TRUE;
    AxisData.ErrorCodes.dwLogicalErrorLatched := AxisData.ErrorCodes.dwLogicalErrorLatched OR LOG_STEP_TIMEOUT;
    AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);

    xResetExecute    := FALSE;
    xStopExecute     := FALSE;
    xHomeExecute     := FALSE;
    xMoveAbsExecute  := FALSE;
    xMoveRelExecute  := FALSE;
    xJogForwardExec  := FALSE;
    xJogBackwardExec := FALSE;

    AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;
END_IF;

// ======================================================
// 6. УДЕРЖАНИЕ ПРЕДУПРЕЖДЕНИЙ (TP)
// ======================================================
tpWarningHold(IN := xWarningPulse, PT := T#2S);
IF NOT tpWarningHold.Q THEN
    AxisData.ErrorCodes.dwWarningLatched := DWORD#0;
    AxisData.Diag.sWarningText := '';
END_IF;
AxisData.ErrorCodes.dwWarning := AxisData.ErrorCodes.dwWarningLatched;
AxisData.Status.xWarning := (AxisData.ErrorCodes.dwWarning <> DWORD#0);

// ======================================================
// 7. ВЫЗОВ MC-БЛОКОВ
// ======================================================
fbPower(
    Axis := Axis,
    Enable := xPowerRequest,
    bRegulatorOn := xPowerRequest,
    bDriveStart := xPowerRequest
);

fbReset(
    Axis := Axis,
    Execute := xResetExecute
);

fbStop(
    Axis := Axis,
    Execute := xStopExecute,
    Deceleration := AxisData.MotionParam.lrDeceleration,
    Jerk := AxisData.MotionParam.lrJerk
);

fbJog(
    Axis := Axis,
    JogForward := xJogForwardExec,
    JogBackward := xJogBackwardExec,
    Velocity := AxisData.MotionParam.lrVelocity,
    Acceleration := AxisData.MotionParam.lrAcceleration,
    Deceleration := AxisData.MotionParam.lrDeceleration,
    Jerk := AxisData.MotionParam.lrJerk
);

fbHome(
    Axis := Axis,
    Execute := xHomeExecute,
    Position := AxisData.MotionParam.lrHomePosition
);

fbMoveAbsolute(
    Axis := Axis,
    Execute := xMoveAbsExecute,
    Position := AxisData.MotionParam.lrTargetPosition,
    Velocity := AxisData.MotionParam.lrVelocity,
    Acceleration := AxisData.MotionParam.lrAcceleration,
    Deceleration := AxisData.MotionParam.lrDeceleration,
    Jerk := AxisData.MotionParam.lrJerk,
    Direction := MC_DIRECTION.shortest,
    BufferMode := MC_BUFFER_MODE.Aborting
);

fbMoveRelative(
    Axis := Axis,
    Execute := xMoveRelExecute,
    Distance := AxisData.MotionParam.lrDistance,
    Velocity := AxisData.MotionParam.lrVelocity,
    Acceleration := AxisData.MotionParam.lrAcceleration,
    Deceleration := AxisData.MotionParam.lrDeceleration,
    Jerk := AxisData.MotionParam.lrJerk,
    BufferMode := MC_BUFFER_MODE.Aborting
);

fbReadPosition(
    Axis := Axis,
    Enable := TRUE
);

fbReadStatus(
    Axis := Axis,
    Enable := TRUE
);

fbReadAxisError(
    Axis := Axis,
    Enable := TRUE
);

// ======================================================
// 8. ИТОГОВЫЕ СТАТУСЫ (запись в структуру)
// ======================================================
AxisData.Status.lrActualPosition := LREAL_TO_REAL(fbReadPosition.Position);

// Повторно собираем актуальные ошибки (для полноты)
AxisData.ErrorCodes.dwAxisErrorActual := DWORD#0;
AxisData.ErrorCodes.dwAxisErrorActual.0  := fbPower.Error;
AxisData.ErrorCodes.dwAxisErrorActual.1  := fbReset.Error;
AxisData.ErrorCodes.dwAxisErrorActual.2  := fbStop.Error;
AxisData.ErrorCodes.dwAxisErrorActual.3  := fbJog.Error;
AxisData.ErrorCodes.dwAxisErrorActual.4  := fbHome.Error;
AxisData.ErrorCodes.dwAxisErrorActual.5  := fbMoveAbsolute.Error;
AxisData.ErrorCodes.dwAxisErrorActual.6  := fbMoveRelative.Error;
AxisData.ErrorCodes.dwAxisErrorActual.7  := fbReadPosition.Error;
AxisData.ErrorCodes.dwAxisErrorActual.8  := fbReadStatus.Error;
AxisData.ErrorCodes.dwAxisErrorActual.9  := fbReadStatus.Errorstop;
AxisData.ErrorCodes.dwAxisErrorActual.10 := fbReadStatus.FBErrorOccured;
AxisData.ErrorCodes.dwAxisErrorActual.11 := fbReadAxisError.AxisError;

xAxisErrorActual := (AxisData.ErrorCodes.dwAxisErrorActual <> DWORD#0);

AxisData.Status.xLocalError :=
    fbPower.Error OR
    fbReset.Error OR
    fbStop.Error OR
    fbJog.Error OR
    fbHome.Error OR
    fbMoveAbsolute.Error OR
    fbMoveRelative.Error OR
    fbReadPosition.Error OR
    fbReadStatus.Error OR
    fbReadStatus.Errorstop OR
    fbReadStatus.FBErrorOccured OR
    fbReadAxisError.AxisError;

AxisData.Status.xMotionBusy :=
    fbStop.Busy OR
    fbJog.Busy OR
    fbHome.Busy OR
    fbMoveAbsolute.Busy OR
    fbMoveRelative.Busy;

xNeedMcReset :=
    fbReadStatus.Errorstop OR
    fbReadStatus.FBErrorOccured OR
    fbReadAxisError.AxisError;

AxisData.ErrorCodes.dwAxisError := AxisData.ErrorCodes.dwAxisErrorActual OR AxisData.ErrorCodes.dwAxisErrorLatched;
AxisData.ErrorCodes.dwLogicalError := AxisData.ErrorCodes.dwLogicalErrorLatched;
AxisData.ErrorCodes.dwAllError := AxisData.ErrorCodes.dwAxisError OR AxisData.ErrorCodes.dwLogicalError;
AxisData.ErrorCodes.dwDriveAxisErrorID := fbReadAxisError.AxisErrorID;

AxisData.Status.xAxisError := (AxisData.ErrorCodes.dwAxisError <> DWORD#0);
AxisData.Status.xLogicalError := (AxisData.ErrorCodes.dwLogicalError <> DWORD#0);
AxisData.Status.xAxisResetNeeded := AxisData.Status.xAxisError;
AxisData.Status.xLogicalResetNeeded := AxisData.Status.xLogicalError;

AxisData.Status.xError :=
    (AxisData.Diag.iStep = E_AXIS_STATE.ERROR_RESET_MANAGER) OR
    AxisData.Status.xAxisError OR
    AxisData.Status.xLogicalError OR
    AxisData.Cmd.xGlobalError;

AxisData.Status.xBusy :=
    fbPower.Busy OR
    fbReset.Busy OR
    AxisData.Status.xMotionBusy;

AxisData.Status.xCanStartMotion :=
    (AxisData.Diag.iStep = E_AXIS_STATE.READY) AND
    AxisData.Status.xPowered AND
    NOT AxisData.Status.xAxisError AND
    NOT AxisData.Status.xLogicalError AND
    NOT AxisData.Cmd.xGlobalError;

// ======================================================
// 9. ТЕКСТ ОШИБКИ И ID
// ======================================================
AxisData.Diag.sErrorText := '';
AxisData.Diag.udiActualErrorID := 0;

IF (AxisData.ErrorCodes.dwLogicalError AND LOG_POWER_PERMIT_LOST) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Power permit lost';
    AxisData.Diag.udiActualErrorID := 1001;

ELSIF (AxisData.ErrorCodes.dwLogicalError AND LOG_GLOBAL_DURING_POWER) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Global error during power on';
    AxisData.Diag.udiActualErrorID := 1002;

ELSIF (AxisData.ErrorCodes.dwLogicalError AND LOG_GLOBAL_DURING_READY) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Global error in READY state';
    AxisData.Diag.udiActualErrorID := 2000;

ELSIF (AxisData.ErrorCodes.dwLogicalError AND LOG_GLOBAL_DURING_MOTION) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Global error during motion';
    AxisData.Diag.udiActualErrorID := 2100;

ELSIF (AxisData.ErrorCodes.dwLogicalError AND LOG_JOG_CONFLICT) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Jog positive and negative active together';
    AxisData.Diag.udiActualErrorID := 2001;

ELSIF (AxisData.ErrorCodes.dwLogicalError AND LOG_MOVE_ABS_NOT_HOMED) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MoveAbsolute denied: axis not homed';
    AxisData.Diag.udiActualErrorID := 1200;

ELSIF (AxisData.ErrorCodes.dwLogicalError AND LOG_MOVE_REL_NOT_HOMED) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MoveRelative denied: axis not homed';
    AxisData.Diag.udiActualErrorID := 1300;

ELSIF (AxisData.ErrorCodes.dwLogicalError AND LOG_STEP_TIMEOUT) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Step timeout';
    AxisData.Diag.udiActualErrorID := 9000 + INT_TO_UDINT(AxisData.Diag.iLastErrorStep);

ELSIF (AxisData.ErrorCodes.dwLogicalError AND LOG_UNKNOWN_STEP) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Unknown axis step';
    AxisData.Diag.udiActualErrorID := 9999;

ELSIF (AxisData.ErrorCodes.dwAxisError AND AXE_MC_POWER_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_Power error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbPower.ErrorID);

ELSIF (AxisData.ErrorCodes.dwAxisError AND AXE_MC_RESET_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_Reset error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbReset.ErrorID);

ELSIF (AxisData.ErrorCodes.dwAxisError AND AXE_MC_STOP_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_Stop error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbStop.ErrorID);

ELSIF (AxisData.ErrorCodes.dwAxisError AND AXE_MC_JOG_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_Jog error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbJog.ErrorID);

ELSIF (AxisData.ErrorCodes.dwAxisError AND AXE_MC_HOME_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_Home error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbHome.ErrorID);

ELSIF (AxisData.ErrorCodes.dwAxisError AND AXE_MC_MOVE_ABS_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_MoveAbsolute error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbMoveAbsolute.ErrorID);

ELSIF (AxisData.ErrorCodes.dwAxisError AND AXE_MC_MOVE_REL_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_MoveRelative error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbMoveRelative.ErrorID);

ELSIF (AxisData.ErrorCodes.dwAxisError AND AXE_READ_POS_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_ReadActualPosition error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbReadPosition.ErrorID);

ELSIF (AxisData.ErrorCodes.dwAxisError AND AXE_READ_STATUS_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_ReadStatus error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbReadStatus.ErrorID);

ELSIF (AxisData.ErrorCodes.dwAxisError AND AXE_ERRORSTOP) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Axis Errorstop active';
    AxisData.Diag.udiActualErrorID := 3001;

ELSIF (AxisData.ErrorCodes.dwAxisError AND AXE_FB_ERROR_OCCURRED) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'SoftMotion FBErrorOccured active';
    AxisData.Diag.udiActualErrorID := 3002;

ELSIF (AxisData.ErrorCodes.dwAxisError AND AXE_COMMAND_ABORTED) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Motion command aborted';
    AxisData.Diag.udiActualErrorID := 3003;

ELSIF (AxisData.ErrorCodes.dwAxisError AND AXE_UNKNOWN_ACTUAL_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Unknown actual axis error';
    AxisData.Diag.udiActualErrorID := 3004;

ELSIF (AxisData.ErrorCodes.dwAxisError AND AXE_DRIVE_AXIS_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Drive axis error active';
    AxisData.Diag.udiActualErrorID := DWORD_TO_UDINT(fbReadAxisError.AxisErrorID);

ELSIF AxisData.Cmd.xGlobalError THEN
    AxisData.Diag.sErrorText := 'Global error active';
    AxisData.Diag.udiActualErrorID := 5000;
END_IF;

IF AxisData.Diag.udiActualErrorID <> 0 THEN
    AxisData.Diag.udiLastErrorID := AxisData.Diag.udiActualErrorID;
END_IF;