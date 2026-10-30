METHOD PRIVATE RunCellControl

// --- BEGIN IMPLEMENTATION ---

// Выключенные станки, магазины и ГК не требуют настройки своих точек.
// Общая безопасная точка обязательна при любом составе автоцикла.
xCellPointsReady := GVL_POINT.Points[E_POINT_NAME.HOME_SAFETY].xConfigured;
FOR uiMachine := UINT#1 TO UINT#3 DO
	IF GVL_MACHINE.Status[uiMachine].xEnabled THEN
		xCellPointsReady := xCellPointsReady AND axMachinePointsReady[uiMachine];
	END_IF;
END_FOR;
FOR uiMagazine := UINT#1 TO UINT#2 DO
	IF GVL_MAGAZINE.astStatus[uiMagazine].xEnabled THEN
		xCellPointsReady := xCellPointsReady AND axMagazinePointsReady[uiMagazine];
	END_IF;
	IF GVL_GEOMETRY_CONTROL.astStatus[uiMagazine].xEnabled THEN
		xCellPointsReady := xCellPointsReady
			AND GVL_GEOMETRY_CONTROL.astStatus[uiMagazine].xConfigured;
	END_IF;
END_FOR;

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
	astMagazineStatus := GVL_MAGAZINE.astStatus,
	astMachineStatus := GVL_MACHINE.Status,
	uiRows := GVL_CELL_SETTINGS.MagazineRows,
	uiColumns := GVL_CELL_SETTINGS.MagazineColumns,
	Config => GVL_MULTI_TYPE.Config,
	Status => GVL_MULTI_TYPE.ConfigStatus
);

CELL_MANAGER(
	axMagazineAutoSwapPending := axTwinAutoSwapPending,
	axMagazineExchangeInProgress := axTwinMagazineExchangeInProgress,
	xMagazineExchangeActive := (GVL_TWO_PALLET.uiMode = 1) AND (
		GVL_TWO_PALLET.astStatus[1].xBusy OR GVL_TWO_PALLET.astStatus[2].xBusy
		OR GVL_TWO_PALLET.astStatus[1].xCompleted OR GVL_TWO_PALLET.astStatus[2].xCompleted),
	xStart := GVL_CELL_CONTROL.xStart,
	xStop := GVL_CELL_CONTROL.xStop,
	xTestAbort := xTestAbortActive,
	xResetRequest := GVL_HMI.xCellReset,
	xReset := GVL_CELL_CONTROL.xReset,
	xOperatorChoice := GVL_HMI.xCellOperatorChoice,
	xOperatorCancel := GVL_HMI.xCellOperatorCancel,
	uiOperatorChoice := GVL_HMI.uiCellOperatorChoice,
	xManual := GVL_CELL_CONTROL.xManual,
	xIoManual := xIoManualActive,
	uiModeRejectReason := uiCellModeRejectReason,
	xSettingsRejected := xCellSettingRejected,
	xIoOverrideRejected := xIoOverrideRejected,
    xIoDoRejected := xIoDoRejected,
    xIoEmergencyResetRejected := xIoEmergencyResetRejected,
    xIoEmergencyStopActive := GVL_HMI.xIoEmergencyStopActive,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xSafetyReady := CELL_SAFETY.Status.xReady AND NOT CONTROLLER_DIAGNOSTICS.Status.xAlarmActive,
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
	xPointsConfigured := xCellPointsReady,
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

// Сначала снимаем команды обоих владельцев, затем маршрутизируем единственную
// команду менеджера выбранному магазину.
// Общий Disable ячейки не отключает независимо включённые магазины.
FOR uiMagazine := UINT#1 TO UINT#2 DO
	GVL_MAGAZINE.astAutoCommand[uiMagazine].xEnable := FALSE;
	GVL_MAGAZINE.astAutoCommand[uiMagazine].xDisable := FALSE;
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
END_IF;
