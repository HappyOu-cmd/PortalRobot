FUNCTION_BLOCK FB_MACHINE_SIMULATION
VAR_INPUT
	xTestInitialize : BOOL;
	uiTestInitialState : UINT;
	xSimulationAccelerationEnable : BOOL; // Разрешить ускорение таймеров только в симуляции
	uiSimulationTimeFactor : UINT := 1; // До x250 для автоматических тестов Python-Modbus
    Command : ST_MACHINE_IO_COMMAND; // Команды исполнительным механизмам
	FaultRequest : ST_MACHINE_FAULT_REQUEST; // Единый контракт диагностической инъекции

    tDoorOpenTime   : TIME := T#1S; // Время открытия двери
    tDoorCloseTime  : TIME := T#1S; // Время закрытия двери
    tChuckOpenTime  : TIME := T#1S; // Время разжима патрона
    tChuckCloseTime : TIME := T#1S; // Время зажима патрона
    tCycleTime : TIME := T#47S; // Время цикла обработки
END_VAR

VAR_OUTPUT
    Status : ST_MACHINE_IO_STATUS; // Состояние исполнительных механизмов
	Diag   : ST_MACHINE_SIM_DIAG; // Текущие действия симулятора
	Error  : ST_MACHINE_SIM_ERRORS; // Активные и последние ошибки
END_VAR
VAR CONSTANT
	ERR_MACHINE_ALARM : DWORD := DWORD#16#0000_0001; // Авария станка
	ERR_DOOR_FAULT    : DWORD := DWORD#16#0000_0002; // Ошибка двери
	ERR_CHUCK_FAULT   : DWORD := DWORD#16#0000_0004; // Ошибка патрона
END_VAR

VAR
	uiEffectiveTimeFactor : UINT;
	udiDoorOpenTime : UDINT;
	udiDoorCloseTime : UDINT;
	udiChuckOpenTime : UDINT;
	udiChuckCloseTime : UDINT;
	udiCycleStartTime : UDINT;
	udiCycleTime : UDINT;
	tEffectiveDoorOpenTime : TIME;
	tEffectiveDoorCloseTime : TIME;
	tEffectiveChuckOpenTime : TIME;
	tEffectiveChuckCloseTime : TIME;
	tEffectiveCycleStartTime : TIME;
	tEffectiveCycleTime : TIME;
    rtStartCycle : R_TRIG; // Фронт команды запуска цикла

    tonDoorOpen   : TON; // Таймер открытия двери
    tonDoorClose  : TON; // Таймер закрытия двери
    tonChuckClamp : TON; // Таймер зажима патрона
    tonChuckOpen  : TON; // Таймер разжима патрона
    tonCycleStart : TON; // Таймер подтверждения запуска цикла
    tonCycle      : TON; // Таймер обработки

    xDoorOpening   : BOOL; // Выполняется открытие двери
    xDoorClosing   : BOOL; // Выполняется закрытие двери
    xChuckClamping : BOOL; // Выполняется зажим патрона
    xChuckOpening  : BOOL; // Выполняется разжим патрона
    xCycleStarting : BOOL; // Выполняется запуск цикла

    xAlarmLatched : BOOL; // Защёлкнутая авария симулятора
    xInitialized  : BOOL; // Начальные состояния установлены
	xResetRequest : BOOL; // Локальный или переданный станком запрос сброса
END_VAR

// --- BEGIN IMPLEMENTATION ---

uiEffectiveTimeFactor := uiSimulationTimeFactor;
IF NOT xSimulationAccelerationEnable THEN
	uiEffectiveTimeFactor := UINT#1;
ELSIF uiEffectiveTimeFactor < UINT#1 THEN
	uiEffectiveTimeFactor := UINT#1;
ELSIF uiEffectiveTimeFactor > UINT#250 THEN
	uiEffectiveTimeFactor := UINT#250;
END_IF;

udiDoorOpenTime := TIME_TO_UDINT(tDoorOpenTime) / TO_UDINT(uiEffectiveTimeFactor);
udiDoorCloseTime := TIME_TO_UDINT(tDoorCloseTime) / TO_UDINT(uiEffectiveTimeFactor);
udiChuckOpenTime := TIME_TO_UDINT(tChuckOpenTime) / TO_UDINT(uiEffectiveTimeFactor);
udiChuckCloseTime := TIME_TO_UDINT(tChuckCloseTime) / TO_UDINT(uiEffectiveTimeFactor);
udiCycleStartTime := UDINT#200 / TO_UDINT(uiEffectiveTimeFactor);
udiCycleTime := TIME_TO_UDINT(tCycleTime) / TO_UDINT(uiEffectiveTimeFactor);

IF udiDoorOpenTime < UDINT#1 THEN udiDoorOpenTime := UDINT#1; END_IF;
IF udiDoorCloseTime < UDINT#1 THEN udiDoorCloseTime := UDINT#1; END_IF;
IF udiChuckOpenTime < UDINT#1 THEN udiChuckOpenTime := UDINT#1; END_IF;
IF udiChuckCloseTime < UDINT#1 THEN udiChuckCloseTime := UDINT#1; END_IF;
IF udiCycleStartTime < UDINT#1 THEN udiCycleStartTime := UDINT#1; END_IF;
IF udiCycleTime < UDINT#1 THEN udiCycleTime := UDINT#1; END_IF;

tEffectiveDoorOpenTime := UDINT_TO_TIME(udiDoorOpenTime);
tEffectiveDoorCloseTime := UDINT_TO_TIME(udiDoorCloseTime);
tEffectiveChuckOpenTime := UDINT_TO_TIME(udiChuckOpenTime);
tEffectiveChuckCloseTime := UDINT_TO_TIME(udiChuckCloseTime);
tEffectiveCycleStartTime := UDINT_TO_TIME(udiCycleStartTime);
tEffectiveCycleTime := UDINT_TO_TIME(udiCycleTime);

// =====================================================
// Первичная инициализация
// =====================================================

IF NOT xInitialized THEN
    Status.xDoorOpen := FALSE;
    Status.xDoorClosed := TRUE;

    Status.xChuckClamped := TRUE;
    Status.xChuckUnclamped := FALSE;

    Status.xCycleActive := FALSE;
    Status.xCycleDone := FALSE;
    Status.xAlarm := FALSE;

    xInitialized := TRUE;
END_IF;

IF xTestInitialize THEN
	xDoorOpening := FALSE;
	xDoorClosing := FALSE;
	xChuckClamping := FALSE;
	xChuckOpening := FALSE;
	xCycleStarting := FALSE;
	xAlarmLatched := FALSE;
	Status.xDoorOpen := FALSE;
	Status.xDoorClosed := TRUE;
	Status.xChuckClamped := (uiTestInitialState = UINT#2) OR (uiTestInitialState = UINT#3);
	Status.xChuckUnclamped := NOT Status.xChuckClamped;
	Status.xCycleActive := uiTestInitialState = UINT#2;
	Status.xCycleDone := uiTestInitialState = UINT#3;
	Status.xAlarm := FALSE;
	Error.dwErrorActive := DWORD#0;
END_IF;


// =====================================================
// Детектор запуска цикла
// =====================================================

rtStartCycle(CLK := Command.xStartCycle);


// =====================================================
// Формирование и сброс аварии
// =====================================================

xResetRequest := FaultRequest.xReset OR Command.xReset;

IF FaultRequest.xEnabled AND FaultRequest.xMachineAlarm THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE_ALARM;
END_IF;

IF FaultRequest.xEnabled
AND FaultRequest.xDoorFault
AND (xDoorOpening OR xDoorClosing) THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_DOOR_FAULT;
END_IF;

IF FaultRequest.xEnabled
AND FaultRequest.xChuckFault
AND (xChuckClamping OR xChuckOpening) THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_CHUCK_FAULT;
END_IF;

IF xResetRequest
AND NOT (FaultRequest.xEnabled AND FaultRequest.xMachineAlarm)
AND NOT (FaultRequest.xEnabled AND FaultRequest.xDoorFault)
AND NOT (FaultRequest.xEnabled AND FaultRequest.xChuckFault) THEN
	Error.dwErrorLast := Error.dwErrorActive;
	Error.dwErrorActive := DWORD#0;
END_IF;

// Отдельный сброс симулятора также отменяет зависшее тестовое действие.
// Штатный Command.xReset сохраняет прежнее поведение и только снимает ошибку.
IF FaultRequest.xReset THEN
	xDoorOpening := FALSE;
	xDoorClosing := FALSE;
	xChuckClamping := FALSE;
	xChuckOpening := FALSE;
	xCycleStarting := FALSE;
END_IF;

xAlarmLatched := Error.dwErrorActive <> DWORD#0;


// =====================================================
// Приём команд станка
// =====================================================

IF NOT xAlarmLatched THEN

    // Открытие двери
    IF Command.xOpenDoor
    AND NOT Status.xDoorOpen
    AND NOT Status.xCycleActive THEN
        xDoorOpening := TRUE;
        xDoorClosing := FALSE;
    END_IF;

    // Закрытие двери
    IF Command.xCloseDoor
    AND NOT Status.xDoorClosed THEN
        xDoorClosing := TRUE;
        xDoorOpening := FALSE;
    END_IF;

    // Зажим патрона
    IF Command.xClampChuck
    AND NOT Status.xChuckClamped
    AND NOT Status.xCycleActive THEN
        xChuckClamping := TRUE;
        xChuckOpening := FALSE;
    END_IF;

    // Разжим патрона
    IF Command.xUnclampChuck
    AND NOT Status.xChuckUnclamped
    AND NOT Status.xCycleActive THEN
        xChuckOpening := TRUE;
        xChuckClamping := FALSE;
    END_IF;

    // Запуск обработки
    IF rtStartCycle.Q
    AND Status.xDoorClosed
    AND Status.xChuckClamped
    AND NOT Status.xCycleActive THEN
        xCycleStarting := TRUE;
        Status.xCycleDone := FALSE;
    END_IF;

END_IF;


// =====================================================
// Таймеры механизмов
// =====================================================

tonDoorOpen(
    IN := xDoorOpening
		AND NOT (FaultRequest.xEnabled AND FaultRequest.xDoorFault),
	PT := tEffectiveDoorOpenTime
);

tonDoorClose(
    IN := xDoorClosing
		AND NOT (FaultRequest.xEnabled AND FaultRequest.xDoorFault),
	PT := tEffectiveDoorCloseTime
);

tonChuckClamp(
    IN := xChuckClamping
		AND NOT (FaultRequest.xEnabled AND FaultRequest.xChuckFault),
	PT := tEffectiveChuckCloseTime
);

tonChuckOpen(
    IN := xChuckOpening
		AND NOT (FaultRequest.xEnabled AND FaultRequest.xChuckFault),
	PT := tEffectiveChuckOpenTime
);

tonCycleStart(
    IN := xCycleStarting,
    PT := tEffectiveCycleStartTime
);

tonCycle(
    IN := Status.xCycleActive AND NOT xAlarmLatched,
    PT := tEffectiveCycleTime
);


// =====================================================
// Завершение открытия двери
// =====================================================

IF tonDoorOpen.Q THEN
    Status.xDoorOpen := TRUE;
    Status.xDoorClosed := FALSE;

    xDoorOpening := FALSE;
END_IF;


// =====================================================
// Завершение закрытия двери
// =====================================================

IF tonDoorClose.Q THEN
    Status.xDoorClosed := TRUE;
    Status.xDoorOpen := FALSE;

    xDoorClosing := FALSE;
END_IF;


// =====================================================
// Завершение зажима патрона
// =====================================================

IF tonChuckClamp.Q THEN
    Status.xChuckClamped := TRUE;
    Status.xChuckUnclamped := FALSE;

    xChuckClamping := FALSE;
END_IF;


// =====================================================
// Завершение разжима патрона
// =====================================================

IF tonChuckOpen.Q THEN
    Status.xChuckUnclamped := TRUE;
    Status.xChuckClamped := FALSE;

    xChuckOpening := FALSE;
END_IF;


// =====================================================
// Запуск цикла
// =====================================================

IF tonCycleStart.Q THEN
    Status.xCycleActive := TRUE;
    xCycleStarting := FALSE;
END_IF;


// =====================================================
// Завершение цикла
// =====================================================

IF tonCycle.Q THEN
    Status.xCycleActive := FALSE;
    Status.xCycleDone := TRUE;
END_IF;


// =====================================================
// Реакция на аварийное состояние
// =====================================================

IF xAlarmLatched THEN
    Status.xCycleActive := FALSE;

    xDoorOpening := FALSE;
    xDoorClosing := FALSE;

    xChuckClamping := FALSE;
    xChuckOpening := FALSE;

    xCycleStarting := FALSE;
END_IF;


// =====================================================
// Выходной статус
// =====================================================

Status.xAlarm := xAlarmLatched;
Status.xReady := NOT xAlarmLatched AND NOT Status.xCycleActive;

Diag.xDoorOpening := xDoorOpening;
Diag.xDoorClosing := xDoorClosing;
Diag.xChuckClamping := xChuckClamping;
Diag.xChuckOpening := xChuckOpening;
Diag.xCycleStarting := xCycleStarting;
Diag.xResetAllowed := (Error.dwErrorActive <> DWORD#0)
	AND NOT (FaultRequest.xEnabled AND FaultRequest.xMachineAlarm)
	AND NOT (FaultRequest.xEnabled AND FaultRequest.xDoorFault)
	AND NOT (FaultRequest.xEnabled AND FaultRequest.xChuckFault);

IF Error.dwErrorActive <> DWORD#0 THEN
	Error.dwErrorLast := Error.dwErrorActive;
END_IF;

Error.stErrorActive := UpdateErrorView(dwError := Error.dwErrorActive);
Error.stErrorLast := UpdateErrorView(dwError := Error.dwErrorLast);
