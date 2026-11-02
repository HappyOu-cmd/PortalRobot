METHOD PRIVATE RunStatistics

// --- BEGIN IMPLEMENTATION ---

STATISTIC_MAIN(
    xStart := GVL_CELL_MANAGER.Status.xRunning,
    uiSimulationTimeFactor := GVL_CELL_SETTINGS.uiSimulationTimeFactorApplied,
    eActiveAction := GVL_ROBOT.Diag.eActiveAction,
    eActivePoint := GVL_ROBOT.Diag.eActivePoint,
    xBusyMagazine := GVL_MAGAZINE.astStatus[1].xBusy OR GVL_MAGAZINE.astStatus[2].xBusy,
    xBusyMachine_1 := GVL_MACHINE.Status[1].xBusy,
    xBusyMachine_2 := GVL_MACHINE.Status[2].xBusy,
    xBusyMachine_3 := GVL_MACHINE.Status[3].xBusy,
    xCycleActiveMachine_1 := GVL_MACHINE.Status[1].stIo.xCycleActive,
    xCycleActiveMachine_2 := GVL_MACHINE.Status[2].stIo.xCycleActive,
    xCycleActiveMachine_3 := GVL_MACHINE.Status[3].stIo.xCycleActive,
    xBusyRobot := GVL_ROBOT.Status.xBusy,
    udiNowMs := TIME_TO_UDINT(TIME())
);

IF STATISTIC_MAIN.xUpdated THEN
    GVL_STATISTIC.stStatistic := STATISTIC_MAIN.stStatistic;
END_IF;
