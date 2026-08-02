FUNCTION_BLOCK FB_MACHINE_SIMULATION
VAR_INPUT
    Command : ST_MACHINE_IO_COMMAND; // Команды исполнительным механизмам

    xSimMachineAlarm : BOOL; // Имитация общей аварии станка
    xSimDoorFault    : BOOL; // Имитация неисправности двери
    xSimChuckFault   : BOOL; // Имитация неисправности патрона

    tDoorTime  : TIME := T#1S; // Время открытия или закрытия двери
    tChuckTime : TIME := T#1S; // Время зажима или разжима патрона
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
END_VAR

// --- BEGIN IMPLEMENTATION ---

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


// =====================================================
// Детектор запуска цикла
// =====================================================

rtStartCycle(CLK := Command.xStartCycle);


// =====================================================
// Формирование и сброс аварии
// =====================================================

IF xSimMachineAlarm THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE_ALARM;
END_IF;

IF xSimDoorFault
AND (xDoorOpening OR xDoorClosing) THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_DOOR_FAULT;
END_IF;

IF xSimChuckFault
AND (xChuckClamping OR xChuckOpening) THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_CHUCK_FAULT;
END_IF;

IF Command.xReset
AND NOT xSimMachineAlarm
AND NOT xSimDoorFault
AND NOT xSimChuckFault THEN
	Error.dwErrorLast := Error.dwErrorActive;
	Error.dwErrorActive := DWORD#0;
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
    IN := xDoorOpening AND NOT xSimDoorFault,
    PT := tDoorTime
);

tonDoorClose(
    IN := xDoorClosing AND NOT xSimDoorFault,
    PT := tDoorTime
);

tonChuckClamp(
    IN := xChuckClamping AND NOT xSimChuckFault,
    PT := tChuckTime
);

tonChuckOpen(
    IN := xChuckOpening AND NOT xSimChuckFault,
    PT := tChuckTime
);

tonCycleStart(
    IN := xCycleStarting,
    PT := T#200MS
);

tonCycle(
    IN := Status.xCycleActive AND NOT xAlarmLatched,
    PT := tCycleTime
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

IF Error.dwErrorActive <> DWORD#0 THEN
	Error.dwErrorLast := Error.dwErrorActive;
END_IF;

Error.stErrorActive := UpdateErrorView(dwError := Error.dwErrorActive);
Error.stErrorLast := UpdateErrorView(dwError := Error.dwErrorLast);
