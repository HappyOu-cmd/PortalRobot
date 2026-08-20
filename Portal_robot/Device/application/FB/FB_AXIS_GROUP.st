FUNCTION_BLOCK FB_AXIS_GROUP
VAR_INPUT
	FaultRequest : ST_AXIS_GROUP_FAULT_REQUEST; // Единый контракт диагностической инъекции
	xResetPermit : BOOL; // Общий сброс разрешён ручным режимом и остановленной ячейкой
	xAxesPowered : BOOL; // Питанием физических осей владеют FB_AXIS; группа только наблюдает готовность
	lrVelocityOverride : LREAL; // Общий коэффициент только группового MOVE_DIRECT, 0.001..1.0
END_VAR
VAR_OUTPUT
	FaultStatus : ST_FAULT_INJECTION_STATUS; // Состояние инжектора для HMI
END_VAR
VAR
	// Внутренние исполняемые булевые переменные
	xEnable      : BOOL; // Импульс включения группы
	xDisable     : BOOL; // Импульс отключения группы
	xReset       : BOOL; // Импульс сброса ошибок
	xResetMC     : BOOL; // Выполняется сброс SoftMotion
	xMoveDirect  : BOOL; // Выполняется прямое перемещение
	xMoveLinear  : BOOL; // Выполняется линейное перемещение
	xStopCmd     : BOOL; // Выполняется остановка
	xHaltCmd     : BOOL; // Выполняется плавная остановка
	lrAppliedVelocityOverride : LREAL; // Коэффициент после защитного ограничения PLC
	xFaultAllowed : BOOL; // Безопасные условия тестового запуска
	
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
	fbGroupReset   : MC_GroupReset; // Сброс ошибок группы

	
	fbMoveDirect : MC_MoveDirectAbsolute; // Прямое абсолютное перемещение
	fbMoveLinear : MC_MoveLinearAbsolute; // Линейное абсолютное перемещение
	fbFaultInjector : FB_AXIS_GROUP_FAULT_INJECTOR; // Изолированная инъекция библиотечной ошибки
	
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
	// ==================================================
    // Ошибки блоков движения группы
    // ==================================================
	MOTION_ERR_ENABLE        : DWORD := 1; // Ошибка включения группы
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
	MOTION_ERR_SIMULATED        : DWORD := 4096; // Тестовая ошибка MC_MoveDirectAbsolute

	WRN_NO_POWER_PERMIT       : UINT := 1; // Нет разрешения питания
	WRN_MOVE_COMMAND_CONFLICT : UINT := 2; // Одновременно заданы два типа движения
	WRN_GLOBAL_ERROR_ACTIVE   : UINT := 3; // Сброс отклонён из-за глобальной ошибки
	WRN_MOTION_ERROR_ACTIVE   : UINT := 4; // Сброс отклонён из-за активной Motion-ошибки
	WRN_RESET_VERIFY_TIMEOUT  : UINT := 5; // Не получено подтверждение сброса за допустимое время
	WRN_GROUP_ERROR_AFTER_RESET : UINT := 6; // Группа осталась в ErrorStop после сброса
	WRN_GROUP_RESET_ERROR     : UINT := 7; // MC_GroupReset завершился ошибкой
	WRN_GROUP_RESET_TIMEOUT   : UINT := 8; // Превышено время выполнения MC_GroupReset
	WRN_SIM_ERROR_NOT_ALLOWED : UINT := 9; // Тестовая ошибка запрещена текущим состоянием группы
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Коэффициент симуляции не изменяет динамику группы осей робота.
lrAppliedVelocityOverride := MAX(0.001, MIN(1.0, lrVelocityOverride));

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
	stPosition := fbReadPosition.Position;
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

GroupData.Status.xLogicalError :=
    GroupData.Error.dwLogicalErrorLatched <> DWORD#0;

GroupData.Status.xLocalError :=
    GroupData.Status.xGroupError
    OR GroupData.Status.xLogicalError;

// Тестовый Motion-FB запускается только в неподвижной готовой группе.
xFaultAllowed := fbReadStatus.Valid
	AND fbReadStatus.GroupStandby
	AND (GroupData.Diag.iStep = E_AXIS_GROUP_STATE.READY)
	AND NOT GroupData.Status.xLocalError
	AND NOT GroupData.Command.xGlobalError
	AND NOT GroupData.Command.xMoveDirect
	AND NOT GroupData.Command.xMoveLinear;

fbFaultInjector(
	Request := FaultRequest,
	xOwnerAllowed := xFaultAllowed,
	xReset := GroupData.Command.xReset,
	Position := stPosition,
	AxisGroup := AxisGroup
);
FaultStatus := fbFaultInjector.Status;

IF fbFaultInjector.Status.xRejected THEN
	GroupData.Diag.sWarningText := 'Simulated SM3 error is not allowed';
	GroupData.Diag.stWarning.uiCode := WRN_SIM_ERROR_NOT_ALLOWED;
	GroupData.Diag.stWarning.udiSequence := GroupData.Diag.stWarning.udiSequence + UDINT#1;
	IF GroupData.Diag.stWarning.udiSequence = UDINT#0 THEN
		GroupData.Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
	xWarningPulse := TRUE;
END_IF;


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

		ELSIF fbReadStatus.Valid AND fbReadStatus.GroupStandby THEN
			// MC_GroupReset всегда возвращает группу в GroupStandby. Если питание
			// запрошено, используем это состояние без повторного MC_GroupEnable;
			// иначе сначала синхронизируем группу с программным шагом DISABLED.
			IF rtEnablePower.Q THEN
				GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ENABLING_POWER;
			ELSE
				GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_GROUP;
			END_IF;

        ELSIF rtEnablePower.Q THEN
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ENABLING_POWER;
        END_IF;


    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.ENABLING_POWER:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'ENABLING_POWER';
        GroupData.Diag.tStepPreset := GroupData.Timeouts.tPowerTimeout;
        GroupData.Diag.iPowerMode := E_AXIS_GROUP_POWER_MODE.ON;

        IF fbReadStatus.GroupErrorStop THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF NOT GroupData.Command.xPowerPermit
           OR GroupData.Command.xGlobalError THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_POWER;

        ELSIF xStepTimeout THEN
            GroupData.Error.dwLogicalErrorNew :=
                GroupData.Error.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_POWER;

		ELSIF xAxesPowered AND fbReadStatus.Valid THEN
			IF fbReadStatus.GroupStandby THEN
				GroupData.Diag.iStep := E_AXIS_GROUP_STATE.READY;
			ELSIF fbReadStatus.GroupDisabled THEN
				GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ENABLING_GROUP;
			END_IF;
		END_IF;


    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.ENABLING_GROUP:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'ENABLING_GROUP';
        GroupData.Diag.tStepPreset := GroupData.Timeouts.tGroupTimeout;
        GroupData.Diag.iPowerMode := E_AXIS_GROUP_POWER_MODE.ON;

		// MC_GroupEnable допустим только из GroupDisabled. Execute формируется
		// исключительно на этом шаге: после перехода в GroupStandby он снимается,
		// чтобы новый фронт не вызвал MC_GroupEnable повторно после MC_GroupReset.
		xEnable := fbReadStatus.Valid AND fbReadStatus.GroupDisabled;

		IF fbReadStatus.GroupErrorStop THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

		ELSIF fbReadStatus.Valid AND fbReadStatus.GroupStandby THEN

			GroupData.Diag.iStep := E_AXIS_GROUP_STATE.READY;

		ELSIF xEnable AND fbGroupEnable.Error THEN

			GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF NOT GroupData.Command.xPowerPermit
           OR GroupData.Command.xGlobalError THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_GROUP;

        ELSIF xStepTimeout THEN
            GroupData.Error.dwLogicalErrorNew :=
                GroupData.Error.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_GROUP;

		END_IF;


    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.READY:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'READY';
        GroupData.Diag.tStepPreset := T#0S;
        GroupData.Diag.iPowerMode := E_AXIS_GROUP_POWER_MODE.ON;

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

		IF fbReadStatus.GroupErrorStop THEN
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF xStepTimeout THEN
            GroupData.Error.dwLogicalErrorNew :=
                GroupData.Error.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

		ELSIF fbReadStatus.GroupStandby THEN
			// Операторский Stop завершает только движение и сохраняет GroupStandby.
			// Отключение группы выполняется лишь по отдельному запросу питания/ошибке.
			IF GroupData.Command.xPowerPermit
			AND NOT GroupData.Command.xDisable
			AND NOT GroupData.Command.xGlobalError
			AND NOT GroupData.Status.xLocalError THEN
				GroupData.Diag.iStep := E_AXIS_GROUP_STATE.READY;
			ELSE
				GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_GROUP;
			END_IF;
		END_IF;


    // -------------------------------------------------------------------------
    E_AXIS_GROUP_STATE.DISABLING_GROUP:
    // -------------------------------------------------------------------------
        GroupData.Diag.sStepName := 'DISABLING_GROUP';
        GroupData.Diag.tStepPreset := GroupData.Timeouts.tGroupTimeout;
        GroupData.Diag.iPowerMode := E_AXIS_GROUP_POWER_MODE.ON;

		// MC_GroupDisable допустим только из GroupStandby.
		xDisable := fbReadStatus.Valid AND fbReadStatus.GroupStandby;

		IF fbReadStatus.GroupErrorStop THEN

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

		ELSIF fbReadStatus.Valid AND fbReadStatus.GroupDisabled THEN

			GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_POWER;

		ELSIF xDisable AND fbGroupDisable.Error THEN

			GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF xStepTimeout THEN
            GroupData.Error.dwLogicalErrorNew :=
                GroupData.Error.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

		ELSIF xDisable AND fbGroupDisable.Done
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

        ELSIF NOT xAxesPowered THEN

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

		IF rtResetAllError.Q AND xResetPermit THEN

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

				IF fbReadStatus.GroupStandby AND NOT xAxesPowered THEN
					GroupData.Diag.iStep :=
						E_AXIS_GROUP_STATE.DISABLING_GROUP;

				ELSIF fbReadStatus.GroupDisabled AND NOT xAxesPowered THEN
					GroupData.Diag.iStep :=
						E_AXIS_GROUP_STATE.DISABLED;

				ELSIF fbReadStatus.GroupDisabled THEN
					GroupData.Diag.iStep :=
						E_AXIS_GROUP_STATE.ENABLING_GROUP;

                ELSIF fbReadStatus.GroupStandby THEN
                    GroupData.Diag.iStep :=
                        E_AXIS_GROUP_STATE.READY;

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

		// Ошибка оси могла исчезнуть между принятием общей команды и этим циклом.
		// В таком случае MC_GroupReset не вызывается, иначе он вернёт 78
		// (no error to be resetted); остаётся только очистить внутренние защёлки.
		IF fbReadStatus.Valid AND NOT fbReadStatus.GroupErrorStop THEN
			xResetMC := FALSE;
			GroupData.Diag.iStep := E_AXIS_GROUP_STATE.RESET_VERIFY;

		ELSE
			xResetMC := TRUE;
		END_IF;

		IF GroupData.Command.xGlobalError THEN
            GroupData.Diag.sWarningText :=
                'Global error became active during group reset';

            GroupData.Diag.stWarning.uiCode := WRN_GLOBAL_ERROR_ACTIVE;
            GroupData.Diag.stWarning.udiSequence := GroupData.Diag.stWarning.udiSequence + UDINT#1;
            IF GroupData.Diag.stWarning.udiSequence = UDINT#0 THEN
                GroupData.Diag.stWarning.udiSequence := UDINT#1;
            END_IF;

            xWarningPulse := TRUE;
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

		ELSIF xResetMC AND fbGroupReset.Error THEN
            GroupData.Diag.sWarningText :=
                'MC_GroupReset finished with error';

            GroupData.Diag.stWarning.uiCode := WRN_GROUP_RESET_ERROR;
            GroupData.Diag.stWarning.udiSequence := GroupData.Diag.stWarning.udiSequence + UDINT#1;
            IF GroupData.Diag.stWarning.udiSequence = UDINT#0 THEN
                GroupData.Diag.stWarning.udiSequence := UDINT#1;
            END_IF;

            xWarningPulse := TRUE;
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

		ELSIF xResetMC AND xStepTimeout THEN
            GroupData.Diag.sWarningText :=
                'MC_GroupReset timeout';

            GroupData.Diag.stWarning.uiCode := WRN_GROUP_RESET_TIMEOUT;
            GroupData.Diag.stWarning.udiSequence := GroupData.Diag.stWarning.udiSequence + UDINT#1;
            IF GroupData.Diag.stWarning.udiSequence = UDINT#0 THEN
                GroupData.Diag.stWarning.udiSequence := UDINT#1;
            END_IF;

            xWarningPulse := TRUE;
            GroupData.Error.dwLogicalErrorNew :=
                GroupData.Error.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

		ELSIF xResetMC AND fbGroupReset.Done THEN
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
            GroupData.Diag.sWarningText :=
                'Global error became active during reset verification';

            GroupData.Diag.stWarning.uiCode := WRN_GLOBAL_ERROR_ACTIVE;
            GroupData.Diag.stWarning.udiSequence := GroupData.Diag.stWarning.udiSequence + UDINT#1;
            IF GroupData.Diag.stWarning.udiSequence = UDINT#0 THEN
                GroupData.Diag.stWarning.udiSequence := UDINT#1;
            END_IF;

            xWarningPulse := TRUE;
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF xStepTimeout THEN
            GroupData.Diag.sWarningText :=
                'Reset verification timeout';

            GroupData.Diag.stWarning.uiCode := WRN_RESET_VERIFY_TIMEOUT;
            GroupData.Diag.stWarning.udiSequence := GroupData.Diag.stWarning.udiSequence + UDINT#1;
            IF GroupData.Diag.stWarning.udiSequence = UDINT#0 THEN
                GroupData.Diag.stWarning.udiSequence := UDINT#1;
            END_IF;

            xWarningPulse := TRUE;
            GroupData.Error.dwLogicalErrorNew :=
                GroupData.Error.dwLogicalErrorNew
                OR LOG_STEP_TIMEOUT;

            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF fbReadStatus.Valid
           AND fbReadStatus.GroupErrorStop
           AND fbReadError.Valid
           AND (TO_UDINT(fbReadError.GroupErrorID) <> UDINT#0) THEN

            // Причина ошибки осталась активной после завершения сброса.
            GroupData.Diag.sWarningText :=
                'Axis group error remains active after reset';

            GroupData.Diag.stWarning.uiCode := WRN_GROUP_ERROR_AFTER_RESET;
            GroupData.Diag.stWarning.udiSequence := GroupData.Diag.stWarning.udiSequence + UDINT#1;
            IF GroupData.Diag.stWarning.udiSequence = UDINT#0 THEN
                GroupData.Diag.stWarning.udiSequence := UDINT#1;
            END_IF;

            xWarningPulse := TRUE;
            GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ERROR;

        ELSIF fbReadStatus.Valid
           AND NOT fbReadStatus.GroupErrorStop THEN

            GroupData.Error.dwLogicalErrorLatched := DWORD#0;
            GroupData.Error.dwMotionErrorLatched := DWORD#0;
            GroupData.Error.dwMotionErrorPrevious := DWORD#0;

			IF fbReadStatus.GroupStandby AND NOT xAxesPowered THEN
				GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLING_GROUP;

			ELSIF fbReadStatus.GroupDisabled AND NOT xAxesPowered THEN
				GroupData.Diag.iStep := E_AXIS_GROUP_STATE.DISABLED;

			ELSIF fbReadStatus.GroupDisabled THEN
				GroupData.Diag.iStep := E_AXIS_GROUP_STATE.ENABLING_GROUP;

            ELSIF fbReadStatus.GroupStandby THEN
                GroupData.Diag.iStep := E_AXIS_GROUP_STATE.READY;

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
// 8. Вызовы Motion FB
// =============================================================================
fbGroupEnable(
    AxisGroup := AxisGroup,
    Execute   := xEnable
);

fbGroupDisable(
    AxisGroup := AxisGroup,
    Execute   := xDisable
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
	// MOVE_DIRECT принадлежит группе: общий коэффициент умножается на коэффициент точки.
	VelFactor   := MAX(0.001, MIN(1.0,
		GroupData.MotionParam.VelFactor * lrAppliedVelocityOverride)),
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
// 9. Маска Motion-ошибок
// =============================================================================
GroupData.Error.dwMotionErrorActive := DWORD#0;

IF fbGroupEnable.Error THEN
    GroupData.Error.dwMotionErrorActive :=
        GroupData.Error.dwMotionErrorActive
        OR MOTION_ERR_ENABLE;
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

IF fbFaultInjector.xError THEN
	GroupData.Error.dwMotionErrorActive :=
		GroupData.Error.dwMotionErrorActive
		OR MOTION_ERR_SIMULATED;
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
    OR SHL(GroupData.Error.dwLogicalErrorLatched, 16);


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

GroupData.Status.xLogicalError :=
    GroupData.Error.dwLogicalErrorLatched <> DWORD#0;

GroupData.Status.xLocalError :=
    GroupData.Status.xGroupError
    OR GroupData.Status.xLogicalError;

GroupData.Status.xSimErrorAllowed := FaultStatus.xAllowed;
	
GroupData.Status.xMoveDirectDone := fbMoveDirect.Done;

// Код ошибки самой группы не совпадает с ErrorID диагностических Motion FB.
IF fbReadError.Valid
   AND (TO_UDINT(fbReadError.GroupErrorID) <> UDINT#0) THEN
    GroupData.Diag.udiActualErrorID := TO_UDINT(fbReadError.GroupErrorID);
    GroupData.Diag.sErrorText := 'Axis group error';
ELSIF (GroupData.Error.dwMotionErrorLatched AND MOTION_ERR_SIMULATED) <> DWORD#0 THEN
	GroupData.Diag.udiActualErrorID := fbFaultInjector.udiErrorID;
	GroupData.Diag.sErrorText := 'Simulated MC_MoveDirectAbsolute error';
ELSIF fbGroupEnable.Error THEN
	GroupData.Diag.udiActualErrorID := TO_UDINT(fbGroupEnable.ErrorID);
	GroupData.Diag.sErrorText := 'MC_GroupEnable error';
ELSIF fbGroupDisable.Error THEN
	GroupData.Diag.udiActualErrorID := TO_UDINT(fbGroupDisable.ErrorID);
	GroupData.Diag.sErrorText := 'MC_GroupDisable error';
ELSIF fbGroupReset.Error THEN
    GroupData.Diag.udiActualErrorID := TO_UDINT(fbGroupReset.ErrorID);
    GroupData.Diag.sErrorText := 'MC_GroupReset error';
ELSIF fbMoveDirect.Error THEN
	GroupData.Diag.udiActualErrorID := TO_UDINT(fbMoveDirect.ErrorID);
	GroupData.Diag.sErrorText := 'MC_MoveDirectAbsolute error';
ELSIF fbMoveLinear.Error THEN
	GroupData.Diag.udiActualErrorID := TO_UDINT(fbMoveLinear.ErrorID);
	GroupData.Diag.sErrorText := 'MC_MoveLinearAbsolute error';
ELSIF fbGroupHalt.Error THEN
	GroupData.Diag.udiActualErrorID := TO_UDINT(fbGroupHalt.ErrorID);
	GroupData.Diag.sErrorText := 'MC_GroupHalt error';
ELSIF fbGroupStop.Error THEN
	GroupData.Diag.udiActualErrorID := TO_UDINT(fbGroupStop.ErrorID);
	GroupData.Diag.sErrorText := 'MC_GroupStop error';
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

// Для общей кнопки публикуется готовность владельца группы, а не только
// состояние диагностического инжектора.
FaultStatus.xResetAllowed := (GroupData.Diag.iStep = E_AXIS_GROUP_STATE.ERROR)
	AND xResetPermit
	AND NOT GroupData.Command.xGlobalError
	AND (GroupData.Status.xLocalError
		OR GroupData.Status.xLogicalError
		OR GroupData.Status.xGroupError);
