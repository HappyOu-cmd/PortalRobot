FUNCTION_BLOCK FB_AXIS_GROUP
VAR_INPUT

END_VAR
VAR_OUTPUT
END_VAR
VAR
	// Внутренние исполняемые булевые переменные
	xEnable      : BOOL; // Импульс включения группы
	xRegulatorOn : BOOL; // Запрос включения регуляторов
	xDriveStart  : BOOL; // Запрос разрешения приводов
	xDisable     : BOOL; // Импульс отключения группы
	xPowerEnable : BOOL; // Защёлкнутый запрос питания
	xReset       : BOOL; // Импульс сброса ошибок
	xResetMC     : BOOL; // Выполняется сброс SoftMotion
	xMoveDirect  : BOOL; // Выполняется прямое перемещение
	xMoveLinear  : BOOL; // Выполняется линейное перемещение
	xStopCmd     : BOOL; // Выполняется остановка
	xHaltCmd     : BOOL; // Выполняется плавная остановка

	iPrevStep : E_AXIS_GROUP_STATE; // Предыдущий шаг автомата

	// Для таймера шага
	tonStepTimeout   : TON; // Таймер превышения времени шага
	xStepTimeout     : BOOL; // Время шага превышено
	xStepChanged     : BOOL; // Шаг изменился в текущем цикле
	xStepTimerEnable : BOOL; // Разрешение таймера шага
	xStepInitialized : BOOL; // Предыдущий шаг инициализирован

	// Для удержания предупреждений
    tpWarningHold : TP; // Удержание предупреждения для отображения
    xWarningPulse : BOOL; // Импульс нового предупреждения

	// ФБ группы осей
	fbReadStatus   : MC_GroupReadStatus; // Чтение состояния группы
	fbReadError    : MC_GroupReadError; // Чтение активной ошибки группы
	fbReadPosition : MC_GroupReadActualPosition; // Чтение текущей позиции группы
	fbGroupEnable  : MC_GroupEnable; // Включение группы
	fbGroupDisable : MC_GroupDisable; // Отключение группы
	fbGroupPower   : SMC_GroupPower; // Управление питанием группы
	fbGroupReset   : MC_GroupReset; // Сброс ошибок группы


	fbMoveDirect : MC_MoveDirectAbsolute; // Прямое абсолютное перемещение
	fbMoveLinear : MC_MoveLinearAbsolute; // Линейное абсолютное перемещение

	fbGroupHalt : MC_GroupHalt; // Плавная остановка группы
	fbGroupStop : MC_GroupStop; // Остановка группы

	stPosition : SMC_POS_REF; // Текущая позиция группы

	// Триггеры на команды
    rtEnable        : R_TRIG; // Фронт команды включения
    rtDisable       : R_TRIG; // Фронт команды отключения
	rtEnablePower   : R_TRIG; // Фронт запроса питания
    rtResetAllError : R_TRIG; // Фронт команды сброса
    rtMoveDirect    : R_TRIG; // Фронт прямого перемещения
    rtMoveLinear    : R_TRIG; // Фронт линейного перемещения
	rtStopCmd       : R_TRIG; // Фронт команды остановки
	rtHaltCmd       : R_TRIG; // Фронт плавной остановки

END_VAR
VAR_IN_OUT
	AxisGroup : AXIS_GROUP_REF_SM3; // Ссылка на группу осей SoftMotion
	GroupData : ST_AXIS_GROUP; // Команды, статусы и диагностика группы
END_VAR

VAR CONSTANT
	// ==================================================
    // Логические ошибки группы
    // ==================================================
	LOG_STEP_TIMEOUT             : DWORD := 1; // Превышено время шага
	LOG_INVALID_STATE            : DWORD := 2; // Неизвестный шаг автомата
	LOG_POWER_PERMIT_READY       : DWORD := 4; // Нет разрешения питания в готовности
	LOG_POWER_PERMIT_LOST_DIRECT : DWORD := 8; // Разрешение питания снято при движении
	MASK_LOCAL_LOGICAL_ERROR      : DWORD := LOG_STEP_TIMEOUT OR LOG_INVALID_STATE; // Локальные логические первопричины

	// ==================================================
    // Ошибки блоков движения группы
    // ==================================================
	MOTION_ERR_ENABLE        : DWORD := 1; // Ошибка включения группы
	MOTION_ERR_POWER         : DWORD := 2; // Ошибка питания группы
	MOTION_ERR_DISABLE       : DWORD := 4; // Ошибка отключения группы
	MOTION_ERR_RESET         : DWORD := 8; // Ошибка сброса группы
	MOTION_ERR_MOVE_DIRECT   : DWORD := 16; // Ошибка прямого перемещения
	MOTION_ERR_MOVE_LINEAR   : DWORD := 32; // Ошибка линейного перемещения
	MOTION_ERR_HALT          : DWORD := 64; // Ошибка плавной остановки
	MOTION_ERR_STOP          : DWORD := 128; // Ошибка остановки
	MOTION_ERR_READ_POSITION : DWORD := 256; // Ошибка чтения позиции
	MOTION_ERR_READ_STATUS   : DWORD := 512; // Ошибка чтения статуса
	MOTION_ERR_READ_GROUP_ERROR : DWORD := 1024; // Ошибка чтения кода ошибки группы
	MOTION_ERR_GROUP_ERROR_STOP : DWORD := 2048; // Группа SoftMotion находится в ErrorStop

	WRN_NO_POWER_PERMIT       : UINT := 1; // Нет разрешения питания
	WRN_MOVE_COMMAND_CONFLICT : UINT := 2; // Одновременно заданы два типа движения
	WRN_GLOBAL_ERROR_ACTIVE   : UINT := 3; // Сброс отклонён из-за глобальной ошибки
	WRN_MOTION_ERROR_ACTIVE   : UINT := 4; // Сброс отклонён из-за активной Motion-ошибки
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
GroupData.Error.dwLogicalErrorNew := DWORD#0;
GroupData.Error.dwMotionErrorNew := DWORD#0;


// =============================================================================
// 2. Фронты команд
// =============================================================================
rtDisable(CLK := GroupData.Command.xDisable);
rtEnablePower(CLK := GroupData.Command.xPowerEnable);
rtResetAllError(CLK := GroupData.Command.xReset);
rtMoveDirect(CLK := GroupData.Command.xMoveDirect);
rtMoveLinear(CLK := GroupData.Command.xMoveLinear);
rtHaltCmd(CLK := GroupData.Command.xHaltCmd);
rtStopCmd(CLK := GroupData.Command.xStopCmd);


// =============================================================================
// 3. Чтение состояния группы и координат
// =============================================================================
fbReadStatus(
    Enable    := TRUE,
    AxisGroup := AxisGroup
);

fbReadError(
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
    OR (GroupData.Error.dwMotionErrorLatched <> DWORD#0);

GroupData.Status.xLocalError :=
    GroupData.Status.xGroupError
    OR (GroupData.Error.dwLogicalErrorLatched <> DWORD#0);


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

        IF GroupData.Command.xGlobalError
           OR GroupData.Status.xLocalError THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF rtEnablePower.Q AND NOT GroupData.Command.xPowerPermit THEN
            GroupData.Diag.sWarningText := 'Power permit is not active';
            GroupData.Diag.stWarning.uiCode := WRN_NO_POWER_PERMIT;
            GroupData.Diag.stWarning.udiSequence := GroupData.Diag.stWarning.udiSequence + UDINT#1;
            IF GroupData.Diag.stWarning.udiSequence = UDINT#0 THEN
                GroupData.Diag.stWarning.udiSequence := UDINT#1;
            END_IF;
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

        ELSIF NOT GroupData.Command.xPowerPermit
           OR GroupData.Command.xGlobalError THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_POWER;

        ELSIF xStepTimeout THEN
            GroupData.Error.dwLogicalErrorNew :=
                GroupData.Error.dwLogicalErrorNew
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

        ELSIF NOT GroupData.Command.xPowerPermit
           OR GroupData.Command.xGlobalError THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_GROUP;

        ELSIF xStepTimeout THEN
            GroupData.Error.dwLogicalErrorNew :=
                GroupData.Error.dwLogicalErrorNew
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

        ELSIF NOT GroupData.Command.xPowerPermit
           OR GroupData.Command.xGlobalError
           OR GroupData.Status.xLocalError
           OR rtDisable.Q THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_GROUP;

        ELSIF rtMoveDirect.Q AND rtMoveLinear.Q THEN
            GroupData.Diag.sWarningText :=
                'MoveDirect and MoveLinear requested together';

            GroupData.Diag.stWarning.uiCode := WRN_MOVE_COMMAND_CONFLICT;
            GroupData.Diag.stWarning.udiSequence := GroupData.Diag.stWarning.udiSequence + UDINT#1;
            IF GroupData.Diag.stWarning.udiSequence = UDINT#0 THEN
                GroupData.Diag.stWarning.udiSequence := UDINT#1;
            END_IF;

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
            GroupData.Error.dwLogicalErrorNew :=
                GroupData.Error.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.EMG_STOP;

        ELSIF NOT GroupData.Command.xPowerPermit
           OR GroupData.Command.xGlobalError
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
           OR NOT GroupData.Command.xPowerPermit
           OR GroupData.Command.xGlobalError
           OR GroupData.Status.xLocalError
           OR rtStopCmd.Q THEN

            IF xStepTimeout THEN
                GroupData.Error.dwLogicalErrorNew :=
                    GroupData.Error.dwLogicalErrorNew
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
            GroupData.Error.dwLogicalErrorNew :=
                GroupData.Error.dwLogicalErrorNew
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
            GroupData.Error.dwLogicalErrorNew :=
                GroupData.Error.dwLogicalErrorNew
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
            GroupData.Error.dwLogicalErrorNew :=
                GroupData.Error.dwLogicalErrorNew
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
            GroupData.Error.dwLogicalErrorNew :=
                GroupData.Error.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF NOT fbGroupPower.Status THEN

            IF GroupData.Command.xGlobalError
               OR GroupData.Status.xLocalError
			   OR NOT GroupData.Command.xPowerPermit THEN

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

            IF GroupData.Command.xGlobalError THEN
                GroupData.Diag.sWarningText :=
                    'Global error is still active';

                GroupData.Diag.stWarning.uiCode := WRN_GLOBAL_ERROR_ACTIVE;
                GroupData.Diag.stWarning.udiSequence := GroupData.Diag.stWarning.udiSequence + UDINT#1;
                IF GroupData.Diag.stWarning.udiSequence = UDINT#0 THEN
                    GroupData.Diag.stWarning.udiSequence := UDINT#1;
                END_IF;

                xWarningPulse := TRUE;

            ELSIF fbReadStatus.GroupErrorStop THEN
                    GroupData.Diag.iStep :=
                        E_AXIS_GROUP_STATE.RESETTING;

            ELSIF GroupData.Error.dwMotionErrorActive
                  <> DWORD#0 THEN

                GroupData.Diag.sWarningText :=
                    'Motion FB error is still active';

                GroupData.Diag.stWarning.uiCode := WRN_MOTION_ERROR_ACTIVE;
                GroupData.Diag.stWarning.udiSequence := GroupData.Diag.stWarning.udiSequence + UDINT#1;
                IF GroupData.Diag.stWarning.udiSequence = UDINT#0 THEN
                    GroupData.Diag.stWarning.udiSequence := UDINT#1;
                END_IF;

                xWarningPulse := TRUE;

            ELSE
                // Ошибка устранена — очищаем защёлки.
                GroupData.Error.dwLogicalErrorLatched := DWORD#0;
                GroupData.Error.dwMotionErrorLatched := DWORD#0;
                GroupData.Error.dwMotionErrorPrevious := DWORD#0;

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

        IF GroupData.Command.xGlobalError
           OR fbGroupReset.Error THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF xStepTimeout THEN
            GroupData.Error.dwLogicalErrorNew :=
                GroupData.Error.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF fbGroupReset.Done THEN
            // Статус группы был прочитан до вызова MC_GroupReset.
            // Проверяем результат сброса только со следующего цикла.
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.RESET_VERIFY;
        END_IF;


    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.RESET_VERIFY:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'RESET_VERIFY';
        GroupData.Diag.tStepPreset := GroupData.Timeouts.tGroupTimeout;
        GroupData.Diag.iPowerMode := E_AXIS_GROUP_POWER_MODE.ON;

        IF GroupData.Command.xGlobalError THEN
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF xStepTimeout THEN
            GroupData.Error.dwLogicalErrorNew :=
                GroupData.Error.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF fbReadStatus.Valid
           AND fbReadStatus.GroupErrorStop
           AND fbReadError.Valid
           AND (TO_UDINT(fbReadError.GroupErrorID) <> UDINT#0) THEN

            // Причина ошибки осталась активной после завершения сброса.
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF fbReadStatus.Valid
           AND NOT fbReadStatus.GroupErrorStop THEN

            GroupData.Error.dwLogicalErrorLatched := DWORD#0;
            GroupData.Error.dwMotionErrorLatched := DWORD#0;
            GroupData.Error.dwMotionErrorPrevious := DWORD#0;

            IF NOT fbGroupPower.Status THEN
                GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLED;

            ELSIF fbReadStatus.GroupDisabled THEN
                GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_POWER;

            ELSIF fbReadStatus.GroupStandby THEN
                GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_GROUP;

            ELSE
                GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_POWER;
            END_IF;
        END_IF;


    // -------------------------------------------------------------------------
    ELSE
    // -------------------------------------------------------------------------
        GroupData.Error.dwLogicalErrorNew :=
            GroupData.Error.dwLogicalErrorNew
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
GroupData.Error.dwMotionErrorActive := DWORD#0;

IF fbGroupEnable.Error THEN
    GroupData.Error.dwMotionErrorActive :=
        GroupData.Error.dwMotionErrorActive
        OR MOTION_ERR_ENABLE;
END_IF;

IF fbGroupPower.Error THEN
    GroupData.Error.dwMotionErrorActive :=
        GroupData.Error.dwMotionErrorActive
        OR MOTION_ERR_POWER;
END_IF;

IF fbGroupDisable.Error THEN
    GroupData.Error.dwMotionErrorActive :=
        GroupData.Error.dwMotionErrorActive
        OR MOTION_ERR_DISABLE;
END_IF;

IF fbGroupReset.Error THEN
    GroupData.Error.dwMotionErrorActive :=
        GroupData.Error.dwMotionErrorActive
        OR MOTION_ERR_RESET;
END_IF;

IF fbMoveDirect.Error THEN
    GroupData.Error.dwMotionErrorActive :=
        GroupData.Error.dwMotionErrorActive
        OR MOTION_ERR_MOVE_DIRECT;
END_IF;

IF fbMoveLinear.Error THEN
    GroupData.Error.dwMotionErrorActive :=
        GroupData.Error.dwMotionErrorActive
        OR MOTION_ERR_MOVE_LINEAR;
END_IF;

IF fbGroupHalt.Error THEN
    GroupData.Error.dwMotionErrorActive :=
        GroupData.Error.dwMotionErrorActive
        OR MOTION_ERR_HALT;
END_IF;

IF fbGroupStop.Error THEN
    GroupData.Error.dwMotionErrorActive :=
        GroupData.Error.dwMotionErrorActive
        OR MOTION_ERR_STOP;
END_IF;

IF fbReadPosition.Error THEN
    GroupData.Error.dwMotionErrorActive :=
        GroupData.Error.dwMotionErrorActive
        OR MOTION_ERR_READ_POSITION;
END_IF;

IF fbReadStatus.Error THEN
    GroupData.Error.dwMotionErrorActive :=
        GroupData.Error.dwMotionErrorActive
        OR MOTION_ERR_READ_STATUS;
END_IF;

IF fbReadError.Error THEN
    GroupData.Error.dwMotionErrorActive :=
        GroupData.Error.dwMotionErrorActive
        OR MOTION_ERR_READ_GROUP_ERROR;
END_IF;

IF fbReadStatus.GroupErrorStop THEN
    GroupData.Error.dwMotionErrorActive :=
        GroupData.Error.dwMotionErrorActive
        OR MOTION_ERR_GROUP_ERROR_STOP;
END_IF;


// Только ошибки, которых не было в предыдущем цикле.
GroupData.Error.dwMotionErrorNew :=
    GroupData.Error.dwMotionErrorActive
    AND NOT GroupData.Error.dwMotionErrorPrevious;


// Защёлкиваем новые логические и Motion-ошибки.
GroupData.Error.dwLogicalErrorLatched :=
    GroupData.Error.dwLogicalErrorLatched
    OR GroupData.Error.dwLogicalErrorNew;

GroupData.Error.dwMotionErrorLatched :=
    GroupData.Error.dwMotionErrorLatched
    OR GroupData.Error.dwMotionErrorNew;


// Сохраняем Motion-маску для следующего цикла.
GroupData.Error.dwMotionErrorPrevious :=
    GroupData.Error.dwMotionErrorActive;

GroupData.Error.dwAlarmActive :=
    GroupData.Error.dwMotionErrorLatched
    OR SHL(GroupData.Error.dwLogicalErrorLatched AND MASK_LOCAL_LOGICAL_ERROR, 16);


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
    OR (GroupData.Error.dwMotionErrorLatched <> DWORD#0);

GroupData.Status.xLocalError :=
    GroupData.Status.xGroupError
    OR (GroupData.Error.dwLogicalErrorLatched <> DWORD#0);

GroupData.Status.xMoveDirectDone := fbMoveDirect.Done;

// Код ошибки самой группы не совпадает с ErrorID диагностических Motion FB.
IF fbReadError.Valid
   AND (TO_UDINT(fbReadError.GroupErrorID) <> UDINT#0) THEN
    GroupData.Diag.udiActualErrorID := TO_UDINT(fbReadError.GroupErrorID);
    GroupData.Diag.sErrorText := 'Axis group error';
ELSIF fbGroupReset.Error THEN
    GroupData.Diag.udiActualErrorID := TO_UDINT(fbGroupReset.ErrorID);
    GroupData.Diag.sErrorText := 'MC_GroupReset error';
ELSE
    GroupData.Diag.udiActualErrorID := UDINT#0;
    GroupData.Diag.sErrorText := '';
END_IF;

IF GroupData.Diag.udiActualErrorID <> UDINT#0 THEN
    GroupData.Diag.udiLastErrorID := GroupData.Diag.udiActualErrorID;
END_IF;

// Сохраняем последнюю ненулевую ошибку и формируем удобное представление для HMI.
IF (GroupData.Error.dwMotionErrorLatched <> DWORD#0)
OR (GroupData.Error.dwLogicalErrorLatched <> DWORD#0) THEN
	GroupData.Error.dwMotionErrorLast := GroupData.Error.dwMotionErrorLatched;
	GroupData.Error.dwLogicalErrorLast := GroupData.Error.dwLogicalErrorLatched;
END_IF;

GroupData.Error.stErrorActive := UpdateErrorView(
	dwMotionError := GroupData.Error.dwMotionErrorLatched OR GroupData.Error.dwMotionErrorActive,
	dwLogicalError := GroupData.Error.dwLogicalErrorLatched
);
GroupData.Error.stErrorLast := UpdateErrorView(
	dwMotionError := GroupData.Error.dwMotionErrorLast,
	dwLogicalError := GroupData.Error.dwLogicalErrorLast
);
