FUNCTION_BLOCK FB_CALCULATE
VAR_INPUT
    Sample : ST_STATISTIC_SAMPLE;
END_VAR
VAR_OUTPUT
    stStatistic : ST_STATISTIC;
END_VAR
VAR
    arLoad : ARRAY [1..4] OF REAL;
    atAverage : ARRAY [1..7] OF TIME;
    lrLoad : LREAL;
    uliAverageMs : ULINT;
    uiIndex : UINT;
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Вызывается из того же MainTask раз в 100 мс; фронты здесь не собираются.
FOR uiIndex := UINT#1 TO UINT#4 DO
    lrLoad := 0.0;
    IF Sample.uliElapsedMs > ULINT#0 THEN
        lrLoad := ULINT_TO_LREAL(Sample.auliBusyMs[uiIndex]) * 100.0
            / ULINT_TO_LREAL(Sample.uliElapsedMs);
    END_IF;
    IF lrLoad > 100.0 THEN lrLoad := 100.0; END_IF;
    IF lrLoad < 0.0 THEN lrLoad := 0.0; END_IF;
    arLoad[uiIndex] := LREAL_TO_REAL(lrLoad);
END_FOR;

FOR uiIndex := UINT#1 TO UINT#7 DO
    uliAverageMs := ULINT#0;
    IF Sample.auliCompletedCount[uiIndex + UINT#4] > ULINT#0 THEN
        uliAverageMs := Sample.auliCompletedBusyMs[uiIndex + UINT#4]
            / Sample.auliCompletedCount[uiIndex + UINT#4];
    END_IF;
    // Внешний TIME-контракт сохранён; слишком длинный интервал насыщается.
    IF uliAverageMs > ULINT#4294967295 THEN uliAverageMs := ULINT#4294967295; END_IF;
    atAverage[uiIndex] := UDINT_TO_TIME(ULINT_TO_UDINT(uliAverageMs));
END_FOR;

stStatistic.stMachineStat.rLoadCNC_1 := arLoad[1];
stStatistic.stMachineStat.rLoadCNC_2 := arLoad[2];
stStatistic.stMachineStat.rLoadCNC_3 := arLoad[3];
stStatistic.stRobotStat.rRobot := arLoad[4];
stStatistic.stRobotStat.tCNC_1 := atAverage[1];
stStatistic.stRobotStat.tCNC_2 := atAverage[2];
stStatistic.stRobotStat.tCNC_3 := atAverage[3];
stStatistic.stRobotStat.tMoveCNC_1 := atAverage[4];
stStatistic.stRobotStat.tMoveCNC_2 := atAverage[5];
stStatistic.stRobotStat.tMoveCNC_3 := atAverage[6];
stStatistic.stRobotStat.tMagazine := atAverage[7];
