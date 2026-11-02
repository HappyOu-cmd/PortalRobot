FUNCTION_BLOCK FB_STATISTIC
VAR_INPUT
    eActiveAction : E_ROBOT_ACTION;
    eActivePoint : E_POINT_NAME;
    xStart : BOOL;
    uiSimulationTimeFactor : UINT := 1;
    xBusyMagazine : BOOL;
    xBusyMachine_1 : BOOL;
    xBusyMachine_2 : BOOL;
    xBusyMachine_3 : BOOL;
    xCycleActiveMachine_1 : BOOL;
    xCycleActiveMachine_2 : BOOL;
    xCycleActiveMachine_3 : BOOL;
    xBusyRobot : BOOL;
    udiNowMs : UDINT; // Одно чтение TIME() из MainTask
END_VAR
VAR_OUTPUT
    stStatistic : ST_STATISTIC;
    xUpdated : BOOL; // Публикация только после расчёта или нового Start
END_VAR
VAR
    xInit : BOOL;
    xPreviousStart : BOOL;
    xResetStatistics : BOOL;
    udiLastNowMs : UDINT;
    uiTimeFactor : UINT;
    uiPreviousTimeFactor : UINT;
    uliRealDeltaMs : ULINT;
    uliScaledDeltaMs : ULINT;
    uliCalculationAgeMs : ULINT;
    axMeasure : ARRAY [1..11] OF BOOL;
    axPreviousMeasure : ARRAY [1..11] OF BOOL;
    auliCurrentBusyMs : ARRAY [1..11] OF ULINT;
    Sample : ST_STATISTIC_SAMPLE;
    fb_Calculate : FB_CALCULATE;
    uiIndex : UINT;
END_VAR

// --- BEGIN IMPLEMENTATION ---

// 1..4 — загрузка станков и робота; 5..11 — средние времена операций.
axMeasure[1] := xCycleActiveMachine_1;
axMeasure[2] := xCycleActiveMachine_2;
axMeasure[3] := xCycleActiveMachine_3;
axMeasure[4] := xBusyRobot;
axMeasure[5] := xBusyMachine_1;
axMeasure[6] := xBusyMachine_2;
axMeasure[7] := xBusyMachine_3;
axMeasure[8] := xBusyRobot AND (eActiveAction = E_ROBOT_ACTION.MOVE_TO_POINT)
    AND (eActivePoint = E_POINT_NAME.MACHINE_1_ABOVE);
axMeasure[9] := xBusyRobot AND (eActiveAction = E_ROBOT_ACTION.MOVE_TO_POINT)
    AND (eActivePoint = E_POINT_NAME.MACHINE_2_ABOVE);
axMeasure[10] := xBusyRobot AND (eActiveAction = E_ROBOT_ACTION.MOVE_TO_POINT)
    AND (eActivePoint = E_POINT_NAME.MACHINE_3_ABOVE);
axMeasure[11] := xBusyMagazine;

uiTimeFactor := uiSimulationTimeFactor;
IF uiTimeFactor < UINT#1 THEN
    uiTimeFactor := UINT#1;
ELSIF uiTimeFactor > UINT#250 THEN
    uiTimeFactor := UINT#250;
END_IF;

xUpdated := FALSE;
xResetStatistics := NOT xInit OR (xStart AND NOT xPreviousStart);
IF xResetStatistics THEN
    Sample.uliElapsedMs := ULINT#0;
    uliCalculationAgeMs := ULINT#0;
    FOR uiIndex := UINT#1 TO UINT#11 DO
        Sample.auliBusyMs[uiIndex] := ULINT#0;
        Sample.auliCompletedBusyMs[uiIndex] := ULINT#0;
        Sample.auliCompletedCount[uiIndex] := ULINT#0;
        auliCurrentBusyMs[uiIndex] := ULINT#0;
        axPreviousMeasure[uiIndex] := axMeasure[uiIndex];
    END_FOR;
    xInit := TRUE;
ELSE
    // TIME() может переполниться: расширяем разность до масштабирования.
    IF udiNowMs >= udiLastNowMs THEN
        uliRealDeltaMs := UDINT_TO_ULINT(udiNowMs) - UDINT_TO_ULINT(udiLastNowMs);
    ELSE
        uliRealDeltaMs := ULINT#4294967296 + UDINT_TO_ULINT(udiNowMs) - UDINT_TO_ULINT(udiLastNowMs);
    END_IF;
    uliCalculationAgeMs := uliCalculationAgeMs + uliRealDeltaMs;
    // Прошедший интервал принадлежит состоянию и коэффициенту прошлого скана.
    uliScaledDeltaMs := uliRealDeltaMs * UINT_TO_ULINT(uiPreviousTimeFactor);
    Sample.uliElapsedMs := Sample.uliElapsedMs + uliScaledDeltaMs;
    FOR uiIndex := UINT#1 TO UINT#11 DO
        IF axPreviousMeasure[uiIndex] THEN
            Sample.auliBusyMs[uiIndex] := Sample.auliBusyMs[uiIndex] + uliScaledDeltaMs;
            auliCurrentBusyMs[uiIndex] := auliCurrentBusyMs[uiIndex] + uliScaledDeltaMs;
            IF NOT axMeasure[uiIndex] THEN
                Sample.auliCompletedBusyMs[uiIndex] := Sample.auliCompletedBusyMs[uiIndex]
                    + auliCurrentBusyMs[uiIndex];
                Sample.auliCompletedCount[uiIndex] := Sample.auliCompletedCount[uiIndex] + ULINT#1;
                auliCurrentBusyMs[uiIndex] := ULINT#0;
            END_IF;
        END_IF;
        axPreviousMeasure[uiIndex] := axMeasure[uiIndex];
    END_FOR;
END_IF;

udiLastNowMs := udiNowMs;
uiPreviousTimeFactor := uiTimeFactor;
xPreviousStart := xStart;

// Период расчёта — 100 мс реального времени, независимо от ускорения симуляции.
IF xResetStatistics OR (uliCalculationAgeMs >= ULINT#100) THEN
    fb_Calculate(Sample := Sample);
    stStatistic := fb_Calculate.stStatistic;
    uliCalculationAgeMs := ULINT#0;
    xUpdated := TRUE;
END_IF;
