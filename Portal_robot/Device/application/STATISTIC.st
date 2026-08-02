PROGRAM STATISTIC
VAR
	fb_Statistic : FB_STATISTIC;
END_VAR

// --- BEGIN IMPLEMENTATION ---

fb_Statistic(
	xStart          := GVL_HMI.xCellStart,
	eActiveAction 	:= GVL_ROBOT.Diag.eActiveAction,
	eActivePoint  	:= GVL_ROBOT.Diag.eActivePoint,
	xBusyMagazine 	:= GVL_MAGAZINE.Status.xBusy,
	xBusyMachine_1 	:= GVL_MACHINE.Status[1].xBusy,
	xBusyMachine_2 	:= GVL_MACHINE.Status[2].xBusy,
	xBusyMachine_3 	:= GVL_MACHINE.Status[3].xBusy,
	xCycleActiveMachine_1 	:= GVL_MACHINE.Status[1].stIo.xCycleActive,
	xCycleActiveMachine_2 	:= GVL_MACHINE.Status[2].stIo.xCycleActive,
	xCycleActiveMachine_3 	:= GVL_MACHINE.Status[3].stIo.xCycleActive,
	xBusyRobot 		:=	GVL_ROBOT.Status.xBusy,
	stStatistic     =>  GVL_STATISTIC.stStatistic
);
