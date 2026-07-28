FUNCTION_BLOCK FB_MACHINE_SIMULATION 
VAR_INPUT
    stCommand : ST_MACHINE_IO_COMMAND;

    xSimMachineAlarm : BOOL;
    xSimDoorFault    : BOOL;
    xSimChuckFault   : BOOL;

    tDoorTime  : TIME := T#5S;
    tChuckTime : TIME := T#3S;
    tCycleTime : TIME := T#60S;
END_VAR

VAR_OUTPUT
    stStatus : ST_MACHINE_IO_STATUS;
END_VAR

VAR
    rtStartCycle : R_TRIG;

    tonDoorOpen   : TON;
    tonDoorClose  : TON;
    tonChuckClamp : TON;
    tonChuckOpen  : TON;
    tonCycleStart : TON;
    tonCycle      : TON;

    xDoorOpening   : BOOL;
    xDoorClosing   : BOOL;
    xChuckClamping : BOOL;
    xChuckOpening  : BOOL;
    xCycleStarting : BOOL;

    xAlarmLatched : BOOL;
    xInitialized  : BOOL;
END_VAR
// --- BEGIN IMPLEMENTATION ---

// =====================================================
// Первичная инициализация
// =====================================================

IF NOT xInitialized THEN
    stStatus.xDoorOpen := FALSE;
    stStatus.xDoorClosed := TRUE;

    stStatus.xChuckClamped := TRUE;
    stStatus.xChuckUnclamped := FALSE;

    stStatus.xCycleActive := FALSE;
    stStatus.xCycleDone := FALSE;
    stStatus.xAlarm := FALSE;

    xInitialized := TRUE;
END_IF;


// =====================================================
// Детектор запуска цикла
// =====================================================

rtStartCycle(CLK := stCommand.xStartCycle);


// =====================================================
// Формирование и сброс аварии
// =====================================================

IF xSimMachineAlarm THEN
    xAlarmLatched := TRUE;
END_IF;

IF xSimDoorFault
AND (xDoorOpening OR xDoorClosing) THEN
    xAlarmLatched := TRUE;
END_IF;

IF xSimChuckFault
AND (xChuckClamping OR xChuckOpening) THEN
    xAlarmLatched := TRUE;
END_IF;

IF stCommand.xReset
AND NOT xSimMachineAlarm
AND NOT xSimDoorFault
AND NOT xSimChuckFault THEN
    xAlarmLatched := FALSE;
END_IF;


// =====================================================
// Приём команд станка
// =====================================================

IF NOT xAlarmLatched THEN

    // Открытие двери
    IF stCommand.xOpenDoor
    AND NOT stStatus.xDoorOpen
    AND NOT stStatus.xCycleActive THEN
        xDoorOpening := TRUE;
        xDoorClosing := FALSE;
    END_IF;

    // Закрытие двери
    IF stCommand.xCloseDoor
    AND NOT stStatus.xDoorClosed THEN
        xDoorClosing := TRUE;
        xDoorOpening := FALSE;
    END_IF;

    // Зажим патрона
    IF stCommand.xClampChuck
    AND NOT stStatus.xChuckClamped
    AND NOT stStatus.xCycleActive THEN
        xChuckClamping := TRUE;
        xChuckOpening := FALSE;
    END_IF;

    // Разжим патрона
    IF stCommand.xUnclampChuck
    AND NOT stStatus.xChuckUnclamped
    AND NOT stStatus.xCycleActive THEN
        xChuckOpening := TRUE;
        xChuckClamping := FALSE;
    END_IF;

    // Запуск обработки
    IF rtStartCycle.Q
    AND stStatus.xDoorClosed
    AND stStatus.xChuckClamped
    AND NOT stStatus.xCycleActive THEN
        xCycleStarting := TRUE;
        stStatus.xCycleDone := FALSE;
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
    IN := stStatus.xCycleActive AND NOT xAlarmLatched,
    PT := tCycleTime
);


// =====================================================
// Завершение открытия двери
// =====================================================

IF tonDoorOpen.Q THEN
    stStatus.xDoorOpen := TRUE;
    stStatus.xDoorClosed := FALSE;

    xDoorOpening := FALSE;
END_IF;


// =====================================================
// Завершение закрытия двери
// =====================================================

IF tonDoorClose.Q THEN
    stStatus.xDoorClosed := TRUE;
    stStatus.xDoorOpen := FALSE;

    xDoorClosing := FALSE;
END_IF;


// =====================================================
// Завершение зажима патрона
// =====================================================

IF tonChuckClamp.Q THEN
    stStatus.xChuckClamped := TRUE;
    stStatus.xChuckUnclamped := FALSE;

    xChuckClamping := FALSE;
END_IF;


// =====================================================
// Завершение разжима патрона
// =====================================================

IF tonChuckOpen.Q THEN
    stStatus.xChuckUnclamped := TRUE;
    stStatus.xChuckClamped := FALSE;

    xChuckOpening := FALSE;
END_IF;


// =====================================================
// Запуск цикла
// =====================================================

IF tonCycleStart.Q THEN
    stStatus.xCycleActive := TRUE;
    xCycleStarting := FALSE;
END_IF;


// =====================================================
// Завершение цикла
// =====================================================

IF tonCycle.Q THEN
    stStatus.xCycleActive := FALSE;
    stStatus.xCycleDone := TRUE;
END_IF;


// =====================================================
// Реакция на аварийное состояние
// =====================================================

IF xAlarmLatched THEN
    stStatus.xCycleActive := FALSE;

    xDoorOpening := FALSE;
    xDoorClosing := FALSE;

    xChuckClamping := FALSE;
    xChuckOpening := FALSE;

    xCycleStarting := FALSE;
END_IF;


// =====================================================
// Выходной статус
// =====================================================

stStatus.xAlarm := xAlarmLatched;
