METHOD PRIVATE RunCellControl

// --- BEGIN IMPLEMENTATION ---

uiMagazine := GVL_CELL_MANAGER.Status.uiActiveMagazine;
IF (uiMagazine < UINT#1) OR (uiMagazine > UINT#2) THEN
	uiMagazine := UINT#1;
END_IF;

TYPE_CONFIG(
	xTestInitialize := xTestInitializePulse,
	stTestScenario := GVL_HMI.stTestScenario,
	Command := GVL_HMI.stMultiType.Command,
	xCellRunning := GVL_CELL_MANAGER.Status.xRunning,
	xMotionBusy := xMotionBusy,
	stRobotStatus := GVL_ROBOT.Status,
	stMagazineStatus := GVL_MAGAZINE.astStatus[uiMagazine],
	astMachineStatus := GVL_MACHINE.Status,
	uiRows := GVL_HMI.MagazineRows,
	uiColumns := GVL_HMI.MagazineColumns,
	Config => GVL_MULTI_TYPE.Config,
	Status => GVL_MULTI_TYPE.ConfigStatus
);

CELL_MANAGER(
	xStart := GVL_CELL_CONTROL.xStart,
	xStop := GVL_CELL_CONTROL.xStop,
	xResetRequest := GVL_HMI.xCellReset,
	xReset := GVL_CELL_CONTROL.xReset,
	xOperatorChoice := GVL_HMI.xCellOperatorChoice,
	xOperatorCancel := GVL_HMI.xCellOperatorCancel,
	uiOperatorChoice := GVL_HMI.uiCellOperatorChoice,
	xManual := GVL_CELL_CONTROL.xManual,
	xManualRequest := GVL_HMI.xCellManual,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xDrivesReady := xDrivesReady,
	xMotionBusy := xMotionBusy,
	xRobotInterfaceReady := xRobotInterfaceReady,
	lrRobotActualX := lrRobotActualX,
	lrRobotActualY := lrRobotActualY,
	lrRobotActualZ := lrRobotActualZ,
	stSafetyHomePoint := GVL_POINT.Points[E_POINT_NAME.HOME_SAFETY],
	lrSafetyHomeToleranceX := GVL_CELL_SETTINGS.lrSafetyHomeToleranceX,
	lrSafetyHomeToleranceY := GVL_CELL_SETTINGS.lrSafetyHomeToleranceY,
	lrSafetyHomeToleranceZ := GVL_CELL_SETTINGS.lrSafetyHomeToleranceZ,
	lrStoppedPoseTolerance := GVL_CELL_SETTINGS.lrStoppedPoseTolerance,
	Config := GVL_MULTI_TYPE.Config,
	xConfigurationValid := GVL_MULTI_TYPE.ConfigStatus.xConfigurationValid,
	stRobotStatus := GVL_ROBOT.Status,
	astMagazineStatus := GVL_MAGAZINE.astStatus,
	astMachineStatus := GVL_MACHINE.Status,
	astMachineDiag := GVL_MACHINE.Diag,
	FaultRequest := stCellFaultRequest,
	Command => GVL_CELL_MANAGER.Command,
	Status => GVL_CELL_MANAGER.Status,
	Diag => GVL_CELL_MANAGER.Diag,
	Error => GVL_CELL_MANAGER.Error,
	CycleStatus => GVL_MULTI_TYPE.CycleStatus
);

IF GVL_MULTI_TYPE.ConfigStatus.stWarning.udiSequence
<> udiLastTypeConfigWarningSequence THEN
	GVL_CELL_MANAGER.Diag.stWarning := GVL_MULTI_TYPE.ConfigStatus.stWarning;
	udiLastTypeConfigWarningSequence := GVL_MULTI_TYPE.ConfigStatus.stWarning.udiSequence;
END_IF;

// Сначала снимаем команды обоих владельцев, затем маршрутизируем единственную
// команду менеджера выбранному магазину.
FOR uiMagazine := UINT#1 TO UINT#2 DO
	GVL_MAGAZINE.astAutoCommand[uiMagazine].xEnable := FALSE;
	GVL_MAGAZINE.astAutoCommand[uiMagazine].xDisable := GVL_CELL_CONTROL.xDisable;
	GVL_MAGAZINE.astAutoCommand[uiMagazine].xExecute := FALSE;
	GVL_MAGAZINE.astAutoCommand[uiMagazine].xStop := FALSE;
	GVL_MAGAZINE.astAutoCommand[uiMagazine].eOperation := E_MAGAZINE_OPERATION.NONE;
	GVL_MAGAZINE.astAutoCommand[uiMagazine].iTakeSlot := SINT#0;
	GVL_MAGAZINE.astAutoCommand[uiMagazine].iPutSlot := SINT#0;
END_FOR;
IF (GVL_CELL_MANAGER.Status.uiActiveMagazine >= UINT#1)
AND (GVL_CELL_MANAGER.Status.uiActiveMagazine <= UINT#2) THEN
	GVL_MAGAZINE.astAutoCommand[GVL_CELL_MANAGER.Status.uiActiveMagazine] :=
		GVL_CELL_MANAGER.Command.stMagazine;
	GVL_MAGAZINE.astAutoCommand[GVL_CELL_MANAGER.Status.uiActiveMagazine].xEnable := FALSE;
	GVL_MAGAZINE.astAutoCommand[GVL_CELL_MANAGER.Status.uiActiveMagazine].xDisable :=
		GVL_CELL_CONTROL.xDisable;
END_IF;
