FUNCTION_BLOCK FB_STATISTIC
VAR_INPUT
	eActiveAction 			: E_ROBOT_ACTION;
	eActivePoint  			: E_POINT_NAME;
	xStart                  : BOOL;
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

IF NOT xInit OR xStart THEN
	tSessionTimeStart := TIME();
	xInit := TRUE;
END_IF

tTotalPlc := TIME();
tSessionTime := tTotalPlc - tSessionTimeStart;

fbFactorMachine_1 (
	tTotalPLC := tSessionTime,
	xMeasure  := xCycleActiveMachine_1,
	xMode := FALSE
);

fbFactorMachine_2 (
	tTotalPLC := tSessionTime,
	xMeasure  := xCycleActiveMachine_2,
	xMode := FALSE
);
fbFactorMachine_3 (
	tTotalPLC := tSessionTime,
	xMeasure  := xCycleActiveMachine_3,
	xMode := FALSE
);

fbFactorRobot (
	tTotalPLC := tSessionTime,
	xMeasure  := xBusyRobot,
	xMode := FALSE
);

fbAverageMachine_1(
	xMeasure  := xBusyMachine_1,
	xMode := TRUE
);

fbAverageMachine_2(
	xMeasure  := xBusyMachine_2,
	xMode := TRUE
);

fbAverageMachine_3(
	xMeasure  := xBusyMachine_3,
	xMode := TRUE
);

fbAverageMoveMachine_1(
	xMeasure  := eActiveAction = E_ROBOT_ACTION.MOVE_TO_POINT AND eActivePoint = E_POINT_NAME.MACHINE_1_ABOVE AND xBusyRobot,
	xMode := TRUE
);

fbAverageMoveMachine_2(
	xMeasure  := eActiveAction = E_ROBOT_ACTION.MOVE_TO_POINT AND eActivePoint = E_POINT_NAME.MACHINE_2_ABOVE AND xBusyRobot,
	xMode := TRUE
);

fbAverageMoveMachine_3(
	xMeasure  := eActiveAction = E_ROBOT_ACTION.MOVE_TO_POINT AND eActivePoint = E_POINT_NAME.MACHINE_3_ABOVE AND xBusyRobot,
	xMode := TRUE
);

fbAverageMagazine(
	xMeasure  := xBusyMagazine,
	xMode := TRUE
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
