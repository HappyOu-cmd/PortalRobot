FUNCTION_BLOCK FB_STATISTIC
VAR_INPUT
	eActiveAction 			: E_ROBOT_ACTION;
	eActivePoint  			: E_POINT_NAME;
	xStart                  : BOOL;
	uiSimulationTimeFactor  : UINT := 1;
	xBusyMagazine       	: BOOL;
	xBusyMachine_1  		: BOOL;
	xBusyMachine_2  		: BOOL;
	xBusyMachine_3  		: BOOL;
	xCycleActiveMachine_1   : BOOL;
	xCycleActiveMachine_2   : BOOL;
	xCycleActiveMachine_3   : BOOL;
	xBusyRobot          	: BOOL;
END_VAR
VAR_OUTPUT
	stStatistic         	: ST_STATISTIC;
END_VAR
VAR
	xInit                   : BOOL;
	xResetStatistics        : BOOL;
	rtSessionStart          : R_TRIG;
	tTotalPLC				: TIME;
	tSessionTime            : TIME;
	tSessionTimeStart       : TIME;
	fbFactorMachine_1 		: FB_CALCULATE;
	fbFactorMachine_2 		: FB_CALCULATE;
	fbFactorMachine_3 		: FB_CALCULATE;
	fbFactorRobot 			: FB_CALCULATE;
	fbAverageMachine_1  	: FB_CALCULATE;
	fbAverageMachine_2  	: FB_CALCULATE;
	fbAverageMachine_3  	: FB_CALCULATE;
	fbAverageMoveMachine_1  : FB_CALCULATE;
	fbAverageMoveMachine_2  : FB_CALCULATE;
	fbAverageMoveMachine_3  : FB_CALCULATE;
	fbAverageMagazine   	: FB_CALCULATE;
END_VAR

// --- BEGIN IMPLEMENTATION ---

rtSessionStart(CLK := xStart);
xResetStatistics := NOT xInit OR rtSessionStart.Q;

IF xResetStatistics THEN
	tSessionTimeStart := TIME();
	xInit := TRUE;
END_IF

tTotalPlc := TIME();
tSessionTime := tTotalPlc - tSessionTimeStart;

fbFactorMachine_1 (
	tTotalPLC := tSessionTime,
	uiSimulationTimeFactor := uiSimulationTimeFactor,
	xMeasure  := xCycleActiveMachine_1,
	xMode := FALSE,
	xReset := xResetStatistics
);

fbFactorMachine_2 (
	tTotalPLC := tSessionTime,
	uiSimulationTimeFactor := uiSimulationTimeFactor,
	xMeasure  := xCycleActiveMachine_2,
	xMode := FALSE,
	xReset := xResetStatistics
);
fbFactorMachine_3 (
	tTotalPLC := tSessionTime,
	uiSimulationTimeFactor := uiSimulationTimeFactor,
	xMeasure  := xCycleActiveMachine_3,
	xMode := FALSE,
	xReset := xResetStatistics
);

fbFactorRobot (
	tTotalPLC := tSessionTime,
	uiSimulationTimeFactor := uiSimulationTimeFactor,
	xMeasure  := xBusyRobot,
	xMode := FALSE,
	xReset := xResetStatistics
);

fbAverageMachine_1(
	uiSimulationTimeFactor := uiSimulationTimeFactor,
	xMeasure  := xBusyMachine_1,
	xMode := TRUE,
	xReset := xResetStatistics
);

fbAverageMachine_2(
	uiSimulationTimeFactor := uiSimulationTimeFactor,
	xMeasure  := xBusyMachine_2,
	xMode := TRUE,
	xReset := xResetStatistics
);

fbAverageMachine_3(
	uiSimulationTimeFactor := uiSimulationTimeFactor,
	xMeasure  := xBusyMachine_3,
	xMode := TRUE,
	xReset := xResetStatistics
);

fbAverageMoveMachine_1(
	uiSimulationTimeFactor := uiSimulationTimeFactor,
	xMeasure  := eActiveAction = E_ROBOT_ACTION.MOVE_TO_POINT AND eActivePoint = E_POINT_NAME.MACHINE_1_ABOVE AND xBusyRobot,
	xMode := TRUE,
	xReset := xResetStatistics
);

fbAverageMoveMachine_2(
	uiSimulationTimeFactor := uiSimulationTimeFactor,
	xMeasure  := eActiveAction = E_ROBOT_ACTION.MOVE_TO_POINT AND eActivePoint = E_POINT_NAME.MACHINE_2_ABOVE AND xBusyRobot,
	xMode := TRUE,
	xReset := xResetStatistics
);

fbAverageMoveMachine_3(
	uiSimulationTimeFactor := uiSimulationTimeFactor,
	xMeasure  := eActiveAction = E_ROBOT_ACTION.MOVE_TO_POINT AND eActivePoint = E_POINT_NAME.MACHINE_3_ABOVE AND xBusyRobot,
	xMode := TRUE,
	xReset := xResetStatistics
);

fbAverageMagazine(
	uiSimulationTimeFactor := uiSimulationTimeFactor,
	xMeasure  := xBusyMagazine,
	xMode := TRUE,
	xReset := xResetStatistics
);


stStatistic.stMachineStat.rLoadCNC_1 := fbFactorMachine_1.rLoadPercent;
stStatistic.stMachineStat.rLoadCNC_2 := fbFactorMachine_2.rLoadPercent;
stStatistic.stMachineStat.rLoadCNC_3 := fbFactorMachine_3.rLoadPercent;
stStatistic.stRobotStat.rRobot       := fbFactorRobot.rLoadPercent;
stStatistic.stRobotStat.tCNC_1       := fbAverageMachine_1.tAverageTime;
stStatistic.stRobotStat.tCNC_2       := fbAverageMachine_2.tAverageTime;
stStatistic.stRobotStat.tCNC_3       := fbAverageMachine_3.tAverageTime;
stStatistic.stRobotStat.tMoveCNC_1   := fbAverageMoveMachine_1.tAverageTime;
stStatistic.stRobotStat.tMoveCNC_2   := fbAverageMoveMachine_2.tAverageTime;
stStatistic.stRobotStat.tMoveCNC_3   := fbAverageMoveMachine_3.tAverageTime;
stStatistic.stRobotStat.tMagazine    := fbAverageMagazine.tAverageTime;
