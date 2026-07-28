FUNCTION_BLOCK FB_Axis
VAR_IN_OUT
    Axis     : AXIS_REF_SM3;   // ссылка на ось SoftMotion
    AxisData : ST_AXIS;        // все данные оси (команды, параметры, статусы)
END_VAR

VAR CONSTANT
    // ==================================================
    // Ошибки оси, MC-блоков и SoftMotion
    // ==================================================
    AXE_MC_POWER_ERROR       : DWORD := DWORD#16#00000001; // Ошибка MC_Power
    AXE_MC_RESET_ERROR       : DWORD := DWORD#16#00000002; // Ошибка MC_Reset
    AXE_MC_STOP_ERROR        : DWORD := DWORD#16#00000004; // Ошибка MC_Stop
    AXE_MC_JOG_ERROR         : DWORD := DWORD#16#00000008; // Ошибка MC_Jog
    AXE_MC_HOME_ERROR        : DWORD := DWORD#16#00000010; // Ошибка MC_Home
    AXE_MC_MOVE_ABS_ERROR    : DWORD := DWORD#16#00000020; // Ошибка абсолютного перемещения
    AXE_MC_MOVE_REL_ERROR    : DWORD := DWORD#16#00000040; // Ошибка относительного перемещения
    AXE_READ_POS_ERROR       : DWORD := DWORD#16#00000080; // Ошибка чтения позиции
    AXE_READ_STATUS_ERROR    : DWORD := DWORD#16#00000100; // Ошибка чтения статуса
    AXE_ERRORSTOP            : DWORD := DWORD#16#00000200; // Ось находится в ErrorStop
    AXE_FB_ERROR_OCCURRED    : DWORD := DWORD#16#00000400; // SoftMotion сообщил внутреннюю ошибку
    AXE_COMMAND_ABORTED      : DWORD := DWORD#16#00000800; // Команда движения прервана
    AXE_UNKNOWN_ACTUAL_ERROR : DWORD := DWORD#16#00001000; // Неизвестная текущая ошибка
    AXE_DRIVE_AXIS_ERROR     : DWORD := DWORD#16#00002000; // Ошибка привода

    // ==================================================
    // Логические ошибки блока
    // ==================================================
    LOG_POWER_PERMIT_LOST    : DWORD := DWORD#16#00000001; // Снято разрешение питания
    LOG_GLOBAL_DURING_POWER  : DWORD := DWORD#16#00000002; // Глобальная ошибка при включении
    LOG_GLOBAL_DURING_READY  : DWORD := DWORD#16#00000004; // Глобальная ошибка в готовности
    LOG_GLOBAL_DURING_MOTION : DWORD := DWORD#16#00000008; // Глобальная ошибка при движении
    LOG_JOG_CONFLICT         : DWORD := DWORD#16#00000010; // Одновременно заданы Jog+ и Jog-
    LOG_MOVE_ABS_NOT_HOMED   : DWORD := DWORD#16#00000020; // Абсолютное движение без поиска дома
    LOG_MOVE_REL_NOT_HOMED   : DWORD := DWORD#16#00000040; // Относительное движение без поиска дома
    LOG_STEP_TIMEOUT         : DWORD := DWORD#16#00000080; // Превышено время шага
    LOG_UNKNOWN_STEP         : DWORD := DWORD#16#00000100; // Неизвестный шаг автомата

    // ==================================================
    // Предупреждения блока
    // ==================================================
    WRN_NO_POWER_PERMIT : DWORD := DWORD#16#00000001; // Нет разрешения подачи питания
END_VAR

VAR
    // Триггеры на команды
    rtEnable            : R_TRIG; // Фронт команды включения
    rtDisable           : R_TRIG; // Фронт команды отключения
    rtResetAllError     : R_TRIG; // Фронт общего сброса
    rtResetAxisError    : R_TRIG; // Фронт сброса привода
    rtResetLogicalError : R_TRIG; // Фронт сброса логики
    rtStop              : R_TRIG; // Фронт команды остановки
    rtHome              : R_TRIG; // Фронт команды поиска дома
    rtMoveAbsolute      : R_TRIG; // Фронт абсолютного перемещения
    rtMoveRelative      : R_TRIG; // Фронт относительного перемещения

    // Экземпляры MC-блоков
    fbPower        : MC_Power; // Управление питанием привода
    fbReset        : MC_Reset; // Сброс ошибки привода
    fbStop         : MC_Stop; // Контролируемая остановка
    fbJog          : MC_Jog; // Толчковое движение
    fbHome         : MC_Home; // Поиск домашней позиции
    fbMoveAbsolute : MC_MoveAbsolute; // Абсолютное перемещение
    fbMoveRelative : MC_MoveRelative; // Относительное перемещение
    fbReadPosition : MC_ReadActualPosition; // Чтение текущей позиции
    fbReadStatus   : MC_ReadStatus; // Чтение состояния оси
    fbReadAxisError: MC_ReadAxisError; // Чтение кода ошибки привода

    // Внутренние управляющие флаги 
    xPowerRequest    : BOOL; // Защёлкнутый запрос питания
    xResetExecute    : BOOL; // Выполняется сброс привода
    xStopExecute     : BOOL; // Выполняется остановка
    xHomeExecute     : BOOL; // Выполняется поиск дома
    xMoveAbsExecute  : BOOL; // Выполняется абсолютное перемещение
    xMoveRelExecute  : BOOL; // Выполняется относительное перемещение
    xJogForwardExec  : BOOL; // Выполняется Jog в положительную сторону
    xJogBackwardExec : BOOL; // Выполняется Jog в отрицательную сторону

    // Для таймера шага
    iPrevStep        : E_AXIS_STATE := E_AXIS_STATE.DISABLED; // Предыдущий шаг автомата
    xStepChanged     : BOOL; // Шаг изменился в текущем цикле
    xStepTimerEnable : BOOL; // Разрешение таймера шага
    tonStep          : TON; // Таймер времени на шаге
    tonStepTimeout   : TON; // Таймер превышения времени шага

    // Для удержания предупреждений
    tpWarningHold : TP; // Удержание предупреждения для отображения
    xWarningPulse : BOOL; // Импульс нового предупреждения

    // Вспомогательные флаги для сброса
    xDoResetAxis    : BOOL; // Требуется сброс ошибок привода
    xDoResetLogical : BOOL; // Требуется сброс логических ошибок
    xNeedMcReset    : BOOL; // Требуется вызов MC_Reset

    // Актуальная ошибка оси (на основе MC-блоков)
    xAxisErrorActual : BOOL; // Текущая ошибка по выходам MC-блоков
END_VAR

// --- BEGIN IMPLEMENTATION ---

// ======================================================
// 1. ФРОНТЫ (триггеры на команды из структуры)
// ======================================================
rtEnable(CLK := AxisData.Command.xEnable);
rtDisable(CLK := AxisData.Command.xDisable);
rtResetAllError(CLK := AxisData.Command.xResetAllError);
rtResetAxisError(CLK := AxisData.Command.xResetAxisError);
rtResetLogicalError(CLK := AxisData.Command.xResetLogicalError);
rtStop(CLK := AxisData.Command.xStop);
rtHome(CLK := AxisData.Command.xHome);
rtMoveAbsolute(CLK := AxisData.Command.xMoveAbsolute);
rtMoveRelative(CLK := AxisData.Command.xMoveRelative);

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

AxisData.Error.dwAxisError := AxisData.Error.dwAxisErrorActual OR AxisData.Error.dwAxisErrorLatched;
AxisData.Error.dwLogicalError := AxisData.Error.dwLogicalErrorLatched;
AxisData.Error.dwAllError := AxisData.Error.dwAxisError OR AxisData.Error.dwLogicalError;

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

        ELSIF rtEnable.Q AND NOT AxisData.Command.xPowerPermit THEN
            AxisData.Error.dwWarningLatched :=
                AxisData.Error.dwWarningLatched OR WRN_NO_POWER_PERMIT;
            AxisData.Diag.sWarningText := 'Нет разрешения на запуск двигателя';
            xWarningPulse := TRUE;
            AxisData.Diag.sWaitReason := 'Power permit missing';

        ELSIF NOT AxisData.Command.xPowerPermit THEN
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

        IF NOT AxisData.Command.xPowerPermit THEN
            xPowerRequest := FALSE;
            AxisData.Error.dwLogicalErrorLatched :=
                AxisData.Error.dwLogicalErrorLatched OR LOG_POWER_PERMIT_LOST;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF AxisData.Command.xGlobalError THEN
            xPowerRequest := FALSE;
            AxisData.Error.dwLogicalErrorLatched :=
                AxisData.Error.dwLogicalErrorLatched OR LOG_GLOBAL_DURING_POWER;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF fbPower.Error THEN
            xPowerRequest := FALSE;
            AxisData.Error.dwAxisErrorLatched :=
                AxisData.Error.dwAxisErrorLatched OR AXE_MC_POWER_ERROR;
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

        IF NOT AxisData.Command.xPowerPermit THEN
            xPowerRequest := FALSE;
            AxisData.Diag.iStep := E_AXIS_STATE.DISABLED;

        ELSIF rtDisable.Q THEN
            xPowerRequest := FALSE;
            AxisData.Diag.iStep := E_AXIS_STATE.DISABLED;

        ELSIF AxisData.Command.xGlobalError THEN
            AxisData.Error.dwLogicalErrorLatched :=
                AxisData.Error.dwLogicalErrorLatched OR LOG_GLOBAL_DURING_READY;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF xAxisErrorActual THEN
            AxisData.Error.dwAxisErrorLatched :=
                AxisData.Error.dwAxisErrorLatched OR AxisData.Error.dwAxisErrorActual;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF AxisData.Command.xJogPositive AND AxisData.Command.xJogNegative THEN
            AxisData.Error.dwLogicalErrorLatched :=
                AxisData.Error.dwLogicalErrorLatched OR LOG_JOG_CONFLICT;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF AxisData.Command.xJogPositive OR AxisData.Command.xJogNegative THEN
            AxisData.Diag.iStep := E_AXIS_STATE.JOGGING;

        ELSIF rtHome.Q THEN
            AxisData.Diag.iStep := E_AXIS_STATE.HOMING;

        ELSIF rtMoveAbsolute.Q THEN
            IF AxisData.Status.xHomed THEN
                AxisData.Diag.iStep := E_AXIS_STATE.MOVE_ABSOLUTE;
            ELSE
                AxisData.Error.dwLogicalErrorLatched :=
                    AxisData.Error.dwLogicalErrorLatched OR LOG_MOVE_ABS_NOT_HOMED;
                AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
                AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;
            END_IF;

        ELSIF rtMoveRelative.Q THEN
            IF AxisData.Status.xHomed THEN
                AxisData.Diag.iStep := E_AXIS_STATE.MOVE_RELATIVE;
            ELSE
                AxisData.Error.dwLogicalErrorLatched :=
                    AxisData.Error.dwLogicalErrorLatched OR LOG_MOVE_REL_NOT_HOMED;
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
        xJogForwardExec  := AxisData.Command.xJogPositive AND NOT AxisData.Command.xJogNegative;
        xJogBackwardExec := AxisData.Command.xJogNegative AND NOT AxisData.Command.xJogPositive;

        IF NOT AxisData.Command.xPowerPermit THEN
            xJogForwardExec := FALSE;
            xJogBackwardExec := FALSE;
            AxisData.Error.dwLogicalErrorLatched :=
                AxisData.Error.dwLogicalErrorLatched OR LOG_POWER_PERMIT_LOST;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF AxisData.Command.xGlobalError THEN
            xJogForwardExec := FALSE;
            xJogBackwardExec := FALSE;
            AxisData.Error.dwLogicalErrorLatched :=
                AxisData.Error.dwLogicalErrorLatched OR LOG_GLOBAL_DURING_MOTION;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF xAxisErrorActual THEN
            xJogForwardExec := FALSE;
            xJogBackwardExec := FALSE;
            AxisData.Error.dwAxisErrorLatched :=
                AxisData.Error.dwAxisErrorLatched OR AxisData.Error.dwAxisErrorActual;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF rtStop.Q THEN
            xJogForwardExec := FALSE;
            xJogBackwardExec := FALSE;
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF AxisData.Command.xJogPositive AND AxisData.Command.xJogNegative THEN
            xJogForwardExec := FALSE;
            xJogBackwardExec := FALSE;
            AxisData.Error.dwLogicalErrorLatched :=
                AxisData.Error.dwLogicalErrorLatched OR LOG_JOG_CONFLICT;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF NOT AxisData.Command.xJogPositive AND NOT AxisData.Command.xJogNegative THEN
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

        IF NOT AxisData.Command.xPowerPermit THEN
            xHomeExecute := FALSE;
            AxisData.Error.dwLogicalErrorLatched :=
                AxisData.Error.dwLogicalErrorLatched OR LOG_POWER_PERMIT_LOST;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF AxisData.Command.xGlobalError THEN
            xHomeExecute := FALSE;
            AxisData.Error.dwLogicalErrorLatched :=
                AxisData.Error.dwLogicalErrorLatched OR LOG_GLOBAL_DURING_MOTION;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF rtStop.Q THEN
            xHomeExecute := FALSE;
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF fbHome.Error THEN
            xHomeExecute := FALSE;
            AxisData.Error.dwAxisErrorLatched :=
                AxisData.Error.dwAxisErrorLatched OR AXE_MC_HOME_ERROR;
            AxisData.Diag.udiLastErrorID := TO_UDINT(fbHome.ErrorID);
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF fbHome.CommandAborted THEN
            xHomeExecute := FALSE;
            AxisData.Error.dwAxisErrorLatched :=
                AxisData.Error.dwAxisErrorLatched OR AXE_COMMAND_ABORTED;
            AxisData.Diag.udiLastErrorID := 3003;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF xAxisErrorActual THEN
            xHomeExecute := FALSE;
            AxisData.Error.dwAxisErrorLatched :=
                AxisData.Error.dwAxisErrorLatched OR AxisData.Error.dwAxisErrorActual;
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

        IF NOT AxisData.Command.xPowerPermit THEN
            xMoveAbsExecute := FALSE;
            AxisData.Error.dwLogicalErrorLatched :=
                AxisData.Error.dwLogicalErrorLatched OR LOG_POWER_PERMIT_LOST;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF AxisData.Command.xGlobalError THEN
            xMoveAbsExecute := FALSE;
            AxisData.Error.dwLogicalErrorLatched :=
                AxisData.Error.dwLogicalErrorLatched OR LOG_GLOBAL_DURING_MOTION;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF rtStop.Q THEN
            xMoveAbsExecute := FALSE;
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF fbMoveAbsolute.Error THEN
            xMoveAbsExecute := FALSE;
            AxisData.Error.dwAxisErrorLatched :=
                AxisData.Error.dwAxisErrorLatched OR AXE_MC_MOVE_ABS_ERROR;
            AxisData.Diag.udiLastErrorID := TO_UDINT(fbMoveAbsolute.ErrorID);
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF fbMoveAbsolute.CommandAborted THEN
            xMoveAbsExecute := FALSE;
            AxisData.Error.dwAxisErrorLatched :=
                AxisData.Error.dwAxisErrorLatched OR AXE_COMMAND_ABORTED;
            AxisData.Diag.udiLastErrorID := 3003;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF xAxisErrorActual THEN
            xMoveAbsExecute := FALSE;
            AxisData.Error.dwAxisErrorLatched :=
                AxisData.Error.dwAxisErrorLatched OR AxisData.Error.dwAxisErrorActual;
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

        IF NOT AxisData.Command.xPowerPermit THEN
            xMoveRelExecute := FALSE;
            AxisData.Error.dwLogicalErrorLatched :=
                AxisData.Error.dwLogicalErrorLatched OR LOG_POWER_PERMIT_LOST;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF AxisData.Command.xGlobalError THEN
            xMoveRelExecute := FALSE;
            AxisData.Error.dwLogicalErrorLatched :=
                AxisData.Error.dwLogicalErrorLatched OR LOG_GLOBAL_DURING_MOTION;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF rtStop.Q THEN
            xMoveRelExecute := FALSE;
            AxisData.Diag.iStep := E_AXIS_STATE.STOPPING;

        ELSIF fbMoveRelative.Error THEN
            xMoveRelExecute := FALSE;
            AxisData.Error.dwAxisErrorLatched :=
                AxisData.Error.dwAxisErrorLatched OR AXE_MC_MOVE_REL_ERROR;
            AxisData.Diag.udiLastErrorID := TO_UDINT(fbMoveRelative.ErrorID);
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF fbMoveRelative.CommandAborted THEN
            xMoveRelExecute := FALSE;
            AxisData.Error.dwAxisErrorLatched :=
                AxisData.Error.dwAxisErrorLatched OR AXE_COMMAND_ABORTED;
            AxisData.Diag.udiLastErrorID := 3003;
            AxisData.Diag.iLastErrorStep := TO_INT(AxisData.Diag.iStep);
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF xAxisErrorActual THEN
            xMoveRelExecute := FALSE;
            AxisData.Error.dwAxisErrorLatched :=
                AxisData.Error.dwAxisErrorLatched OR AxisData.Error.dwAxisErrorActual;
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
            AxisData.Error.dwAxisErrorLatched :=
                AxisData.Error.dwAxisErrorLatched OR AXE_MC_STOP_ERROR;
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
            IF AxisData.Command.xGlobalError OR
               (AxisData.Error.dwAxisErrorLatched <> DWORD#0) OR
               (AxisData.Error.dwLogicalErrorLatched <> DWORD#0) OR
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
            xPowerRequest := AxisData.Command.xPowerPermit AND NOT xAxisErrorActual;
        END_IF;

        IF (AxisData.Error.dwAxisError = DWORD#0) AND
           (AxisData.Error.dwLogicalError = DWORD#0) AND
           NOT AxisData.Command.xGlobalError
        THEN
            AxisData.Diag.iStep := E_AXIS_STATE.DISABLED;

        ELSE
            IF AxisData.Command.xGlobalError THEN
                AxisData.Diag.sWaitReason := 'Waiting global error release';
            ELSIF (AxisData.Error.dwAxisError <> DWORD#0) AND
                  (AxisData.Error.dwLogicalError <> DWORD#0) THEN
                AxisData.Diag.sWaitReason := 'Waiting ResetAllError';
            ELSIF AxisData.Error.dwAxisError <> DWORD#0 THEN
                AxisData.Diag.sWaitReason := 'Waiting ResetAxisError or ResetAllError';
            ELSIF AxisData.Error.dwLogicalError <> DWORD#0 THEN
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
            AxisData.Error.dwAxisErrorLatched :=
                AxisData.Error.dwAxisErrorLatched OR AXE_MC_RESET_ERROR;
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
            AxisData.Error.dwAxisErrorLatched := DWORD#0;
        END_IF;
        IF xDoResetLogical THEN
            AxisData.Error.dwLogicalErrorLatched := DWORD#0;
            AxisData.Diag.xStepTimeout := FALSE;
        END_IF;

        xDoResetAxis := FALSE;
        xDoResetLogical := FALSE;

        // Финальная проверка
        IF AxisData.Error.dwAxisErrorActual <> DWORD#0 THEN
            AxisData.Error.dwAxisErrorLatched :=
                AxisData.Error.dwAxisErrorLatched OR AxisData.Error.dwAxisErrorActual;
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF AxisData.Error.dwAxisErrorLatched <> DWORD#0 THEN
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF AxisData.Error.dwLogicalErrorLatched <> DWORD#0 THEN
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSIF AxisData.Command.xGlobalError THEN
            AxisData.Diag.iStep := E_AXIS_STATE.ERROR_RESET_MANAGER;

        ELSE
            AxisData.Diag.iStep := E_AXIS_STATE.DISABLED;
        END_IF;

    // --------------------------------------------------
    ELSE  // неизвестное состояние
    // --------------------------------------------------
        AxisData.Error.dwLogicalErrorLatched :=
            AxisData.Error.dwLogicalErrorLatched OR LOG_UNKNOWN_STEP;
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
    AxisData.Error.dwLogicalErrorLatched := AxisData.Error.dwLogicalErrorLatched OR LOG_STEP_TIMEOUT;
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
    AxisData.Error.dwWarningLatched := DWORD#0;
    AxisData.Diag.sWarningText := '';
END_IF;
AxisData.Error.dwWarning := AxisData.Error.dwWarningLatched;
AxisData.Status.xWarning := (AxisData.Error.dwWarning <> DWORD#0);

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
AxisData.Error.dwAxisErrorActual := DWORD#0;
AxisData.Error.dwAxisErrorActual.0  := fbPower.Error;
AxisData.Error.dwAxisErrorActual.1  := fbReset.Error;
AxisData.Error.dwAxisErrorActual.2  := fbStop.Error;
AxisData.Error.dwAxisErrorActual.3  := fbJog.Error;
AxisData.Error.dwAxisErrorActual.4  := fbHome.Error;
AxisData.Error.dwAxisErrorActual.5  := fbMoveAbsolute.Error;
AxisData.Error.dwAxisErrorActual.6  := fbMoveRelative.Error;
AxisData.Error.dwAxisErrorActual.7  := fbReadPosition.Error;
AxisData.Error.dwAxisErrorActual.8  := fbReadStatus.Error;
AxisData.Error.dwAxisErrorActual.9  := fbReadStatus.Errorstop;
AxisData.Error.dwAxisErrorActual.10 := fbReadStatus.FBErrorOccured;
AxisData.Error.dwAxisErrorActual.11 := fbReadAxisError.AxisError;

xAxisErrorActual := (AxisData.Error.dwAxisErrorActual <> DWORD#0);

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

AxisData.Error.dwAxisError := AxisData.Error.dwAxisErrorActual OR AxisData.Error.dwAxisErrorLatched;
AxisData.Error.dwLogicalError := AxisData.Error.dwLogicalErrorLatched;
AxisData.Error.dwAllError := AxisData.Error.dwAxisError OR AxisData.Error.dwLogicalError;
AxisData.Error.dwDriveAxisErrorID := fbReadAxisError.AxisErrorID;

AxisData.Status.xAxisError := (AxisData.Error.dwAxisError <> DWORD#0);
AxisData.Status.xLogicalError := (AxisData.Error.dwLogicalError <> DWORD#0);
AxisData.Status.xAxisResetNeeded := AxisData.Status.xAxisError;
AxisData.Status.xLogicalResetNeeded := AxisData.Status.xLogicalError;

AxisData.Status.xError :=
    (AxisData.Diag.iStep = E_AXIS_STATE.ERROR_RESET_MANAGER) OR
    AxisData.Status.xAxisError OR
    AxisData.Status.xLogicalError OR
    AxisData.Command.xGlobalError;

AxisData.Status.xBusy :=
    fbPower.Busy OR
    fbReset.Busy OR
    AxisData.Status.xMotionBusy;

AxisData.Status.xCanStartMotion :=
    (AxisData.Diag.iStep = E_AXIS_STATE.READY) AND
    AxisData.Status.xPowered AND
    NOT AxisData.Status.xAxisError AND
    NOT AxisData.Status.xLogicalError AND
    NOT AxisData.Command.xGlobalError;

// ======================================================
// 9. ТЕКСТ ОШИБКИ И ID
// ======================================================
AxisData.Diag.sErrorText := '';
AxisData.Diag.udiActualErrorID := 0;

IF (AxisData.Error.dwLogicalError AND LOG_POWER_PERMIT_LOST) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Power permit lost';
    AxisData.Diag.udiActualErrorID := 1001;

ELSIF (AxisData.Error.dwLogicalError AND LOG_GLOBAL_DURING_POWER) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Global error during power on';
    AxisData.Diag.udiActualErrorID := 1002;

ELSIF (AxisData.Error.dwLogicalError AND LOG_GLOBAL_DURING_READY) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Global error in READY state';
    AxisData.Diag.udiActualErrorID := 2000;

ELSIF (AxisData.Error.dwLogicalError AND LOG_GLOBAL_DURING_MOTION) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Global error during motion';
    AxisData.Diag.udiActualErrorID := 2100;

ELSIF (AxisData.Error.dwLogicalError AND LOG_JOG_CONFLICT) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Jog positive and negative active together';
    AxisData.Diag.udiActualErrorID := 2001;

ELSIF (AxisData.Error.dwLogicalError AND LOG_MOVE_ABS_NOT_HOMED) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MoveAbsolute denied: axis not homed';
    AxisData.Diag.udiActualErrorID := 1200;

ELSIF (AxisData.Error.dwLogicalError AND LOG_MOVE_REL_NOT_HOMED) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MoveRelative denied: axis not homed';
    AxisData.Diag.udiActualErrorID := 1300;

ELSIF (AxisData.Error.dwLogicalError AND LOG_STEP_TIMEOUT) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Step timeout';
    AxisData.Diag.udiActualErrorID := 9000 + INT_TO_UDINT(AxisData.Diag.iLastErrorStep);

ELSIF (AxisData.Error.dwLogicalError AND LOG_UNKNOWN_STEP) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Unknown axis step';
    AxisData.Diag.udiActualErrorID := 9999;

ELSIF (AxisData.Error.dwAxisError AND AXE_MC_POWER_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_Power error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbPower.ErrorID);

ELSIF (AxisData.Error.dwAxisError AND AXE_MC_RESET_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_Reset error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbReset.ErrorID);

ELSIF (AxisData.Error.dwAxisError AND AXE_MC_STOP_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_Stop error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbStop.ErrorID);

ELSIF (AxisData.Error.dwAxisError AND AXE_MC_JOG_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_Jog error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbJog.ErrorID);

ELSIF (AxisData.Error.dwAxisError AND AXE_MC_HOME_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_Home error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbHome.ErrorID);

ELSIF (AxisData.Error.dwAxisError AND AXE_MC_MOVE_ABS_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_MoveAbsolute error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbMoveAbsolute.ErrorID);

ELSIF (AxisData.Error.dwAxisError AND AXE_MC_MOVE_REL_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_MoveRelative error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbMoveRelative.ErrorID);

ELSIF (AxisData.Error.dwAxisError AND AXE_READ_POS_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_ReadActualPosition error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbReadPosition.ErrorID);

ELSIF (AxisData.Error.dwAxisError AND AXE_READ_STATUS_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'MC_ReadStatus error';
    AxisData.Diag.udiActualErrorID := TO_UDINT(fbReadStatus.ErrorID);

ELSIF (AxisData.Error.dwAxisError AND AXE_ERRORSTOP) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Axis Errorstop active';
    AxisData.Diag.udiActualErrorID := 3001;

ELSIF (AxisData.Error.dwAxisError AND AXE_FB_ERROR_OCCURRED) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'SoftMotion FBErrorOccured active';
    AxisData.Diag.udiActualErrorID := 3002;

ELSIF (AxisData.Error.dwAxisError AND AXE_COMMAND_ABORTED) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Motion command aborted';
    AxisData.Diag.udiActualErrorID := 3003;

ELSIF (AxisData.Error.dwAxisError AND AXE_UNKNOWN_ACTUAL_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Unknown actual axis error';
    AxisData.Diag.udiActualErrorID := 3004;

ELSIF (AxisData.Error.dwAxisError AND AXE_DRIVE_AXIS_ERROR) <> DWORD#0 THEN
    AxisData.Diag.sErrorText := 'Drive axis error active';
    AxisData.Diag.udiActualErrorID := DWORD_TO_UDINT(fbReadAxisError.AxisErrorID);

ELSIF AxisData.Command.xGlobalError THEN
    AxisData.Diag.sErrorText := 'Global error active';
    AxisData.Diag.udiActualErrorID := 5000;
END_IF;

IF AxisData.Diag.udiActualErrorID <> 0 THEN
    AxisData.Diag.udiLastErrorID := AxisData.Diag.udiActualErrorID;
END_IF;

// Сохраняем последнюю ненулевую ошибку и формируем удобное представление для HMI.
IF (AxisData.Error.dwAxisError <> DWORD#0)
OR (AxisData.Error.dwLogicalError <> DWORD#0) THEN
	AxisData.Error.dwAxisErrorLast := AxisData.Error.dwAxisError;
	AxisData.Error.dwLogicalErrorLast := AxisData.Error.dwLogicalError;
END_IF;

AxisData.Error.stErrorActive := UpdateErrorView(
	dwAxisError := AxisData.Error.dwAxisError,
	dwLogicalError := AxisData.Error.dwLogicalError
);
AxisData.Error.stErrorLast := UpdateErrorView(
	dwAxisError := AxisData.Error.dwAxisErrorLast,
	dwLogicalError := AxisData.Error.dwLogicalErrorLast
);
