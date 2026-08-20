METHOD PRIVATE RunMagazine

// --- BEGIN IMPLEMENTATION ---

// Только технологический шаг фиксирован в PLC. Динамика берётся из настроек
// соответствующей SoftMotion-оси, чтобы не зашивать выдуманные скорости.
auiMagazineEditSlot[1] := GVL_HMI.astMagazineCommand[1].uiEditSlot;
IF auiMagazineEditSlot[1] = UINT#0 THEN
	auiMagazineEditSlot[1] := GVL_HMI.uiMagazineEditSlot;
END_IF;
auiMagazineEditSlot[2] := GVL_HMI.astMagazineCommand[2].uiEditSlot;
GVL_MAGAZINE_AXIS.astAxis[1].MotionParam.lrDistance := GVL_CELL_SETTINGS.lrMagazineIndexDistance;
GVL_MAGAZINE_AXIS.astAxis[1].MotionParam.lrHomePosition := GVL_HMI.alrMagazineHomePosition[1];
GVL_MAGAZINE_AXIS.astAxis[1].MotionParam.lrVelocity := Magazine_1.fSWMaxVelocity;
IF GVL_MAGAZINE_AXIS.astAxis[1].MotionParam.lrVelocity <= LREAL#0.0 THEN
	GVL_MAGAZINE_AXIS.astAxis[1].MotionParam.lrVelocity := Magazine_1.fMaxVelocity;
END_IF;
GVL_MAGAZINE_AXIS.astAxis[1].MotionParam.lrAcceleration := Magazine_1.fSWMaxAcceleration;
IF GVL_MAGAZINE_AXIS.astAxis[1].MotionParam.lrAcceleration <= LREAL#0.0 THEN
	GVL_MAGAZINE_AXIS.astAxis[1].MotionParam.lrAcceleration := Magazine_1.fMaxAcceleration;
END_IF;
GVL_MAGAZINE_AXIS.astAxis[1].MotionParam.lrDeceleration := Magazine_1.fSWMaxDeceleration;
IF GVL_MAGAZINE_AXIS.astAxis[1].MotionParam.lrDeceleration <= LREAL#0.0 THEN
	GVL_MAGAZINE_AXIS.astAxis[1].MotionParam.lrDeceleration := Magazine_1.fMaxDeceleration;
END_IF;
GVL_MAGAZINE_AXIS.astAxis[1].MotionParam.lrJerk := Magazine_1.fSWMaxJerk;
IF GVL_MAGAZINE_AXIS.astAxis[1].MotionParam.lrJerk <= LREAL#0.0 THEN
	GVL_MAGAZINE_AXIS.astAxis[1].MotionParam.lrJerk := Magazine_1.fMaxJerk;
END_IF;

GVL_MAGAZINE_AXIS.astAxis[2].MotionParam.lrDistance := GVL_CELL_SETTINGS.lrMagazineIndexDistance;
GVL_MAGAZINE_AXIS.astAxis[2].MotionParam.lrHomePosition := GVL_HMI.alrMagazineHomePosition[2];
GVL_MAGAZINE_AXIS.astAxis[2].MotionParam.lrVelocity := Magazine_2.fSWMaxVelocity;
IF GVL_MAGAZINE_AXIS.astAxis[2].MotionParam.lrVelocity <= LREAL#0.0 THEN
	GVL_MAGAZINE_AXIS.astAxis[2].MotionParam.lrVelocity := Magazine_2.fMaxVelocity;
END_IF;
GVL_MAGAZINE_AXIS.astAxis[2].MotionParam.lrAcceleration := Magazine_2.fSWMaxAcceleration;
IF GVL_MAGAZINE_AXIS.astAxis[2].MotionParam.lrAcceleration <= LREAL#0.0 THEN
	GVL_MAGAZINE_AXIS.astAxis[2].MotionParam.lrAcceleration := Magazine_2.fMaxAcceleration;
END_IF;
GVL_MAGAZINE_AXIS.astAxis[2].MotionParam.lrDeceleration := Magazine_2.fSWMaxDeceleration;
IF GVL_MAGAZINE_AXIS.astAxis[2].MotionParam.lrDeceleration <= LREAL#0.0 THEN
	GVL_MAGAZINE_AXIS.astAxis[2].MotionParam.lrDeceleration := Magazine_2.fMaxDeceleration;
END_IF;
GVL_MAGAZINE_AXIS.astAxis[2].MotionParam.lrJerk := Magazine_2.fSWMaxJerk;
IF GVL_MAGAZINE_AXIS.astAxis[2].MotionParam.lrJerk <= LREAL#0.0 THEN
	GVL_MAGAZINE_AXIS.astAxis[2].MotionParam.lrJerk := Magazine_2.fMaxJerk;
END_IF;

fbMagazine1(
	uiMagazineId := UINT#1,
	xTestInitialize := xTestInitializePulse,
	xTestEnabled := GVL_HMI.stTestScenario.xMagazineEnabled,
	stRobotStatus := GVL_ROBOT.Status,
	astMachineStatus := GVL_MACHINE.Status,
	auiMachineType := GVL_MULTI_TYPE.Config.auiMachineType,
	stMagazineCommand := GVL_MAGAZINE.astAutoCommand[1],
	stHmiCommand := GVL_HMI.stRobotCommand,
	xManual := GVL_CELL_CONTROL.xManual AND NOT GVL_CELL_MANAGER.Status.xRunning,
	xReset := GVL_CELL_CONTROL.xReset OR GVL_HMI.astMagazineCommand[1].xReset,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xHmiEnable := GVL_HMI.astMagazineCommand[1].xEnable OR GVL_HMI.xMagazineEnable,
	xHmiDisable := GVL_HMI.astMagazineCommand[1].xDisable OR GVL_HMI.xMagazineDisable,
	xHmiFillBlanks := GVL_HMI.astMagazineCommand[1].xFillZone1 OR GVL_HMI.xMagazineFillBlanks,
	xHmiClear := GVL_HMI.astMagazineCommand[1].xClearZone1 OR GVL_HMI.xMagazineClear,
	xHmiCycleSlot := GVL_HMI.astMagazineCommand[1].xCycleZone1Slot OR GVL_HMI.xMagazineCycleSlot,
	xHmiApplySlot := GVL_HMI.astMagazineCommand[1].xApplyZone1Slot,
	uiHmiEditSlot := auiMagazineEditSlot[1],
	uiHmiEditDetailType := GVL_HMI.astMagazineCommand[1].uiEditDetailType,
	uiHmiEditProductType := GVL_HMI.astMagazineCommand[1].uiEditProductType,
	xHmiPowerOn := GVL_HMI.astMagazineCommand[1].xPowerOn,
	xHmiPowerOff := GVL_HMI.astMagazineCommand[1].xPowerOff,
	xHmiHome := GVL_HMI.astMagazineCommand[1].xHome,
	xHmiIndex := GVL_HMI.astMagazineCommand[1].xIndex,
	xHmiAxisStop := GVL_HMI.astMagazineCommand[1].xStop,
	xHmiConfirmRecovery := GVL_HMI.astMagazineCommand[1].xConfirmRecovery,
	xHmiApplyRecoverySlot := GVL_HMI.astMagazineCommand[1].xApplyRecoverySlot,
	xHmiClearRecoveryZones := GVL_HMI.astMagazineCommand[1].xClearRecoveryZones,
	uiHmiRecoveryZone := GVL_HMI.astMagazineCommand[1].uiRecoveryZone,
	uiHmiRecoverySlot := GVL_HMI.astMagazineCommand[1].uiRecoverySlot,
	eHmiRecoveryDetailType := GVL_HMI.astMagazineCommand[1].eRecoveryDetailType,
	uiHmiRecoveryProductType := GVL_HMI.astMagazineCommand[1].uiRecoveryProductType,
	xRobotOwnsMagazine := (GVL_CELL_MANAGER.Status.uiActiveMagazine = UINT#1)
		AND (GVL_CELL_MANAGER.Status.xRunning OR GVL_ROBOT.Status.xBusy),
	stAxisStatus := GVL_MAGAZINE_AXIS.astAxis[1].Status,
	lrIndexTolerance := GVL_HMI.alrMagazineIndexTolerance[1],
	uiRows := UINT#12,
	uiColumns := UINT#10,
	uiTypeCount := GVL_MULTI_TYPE.Config.uiTypeCount,
	auiSlotType := GVL_MULTI_TYPE.Config.auiSlotType,
	FaultRequest := astMagazineFaultRequest[1],
	stInventory := GVL_DETAIL.astMagazine[1],
	AxisCommand => GVL_MAGAZINE_AXIS.astAxis[1].Command,
	Command => GVL_MAGAZINE.astCommand[1],
	Status => GVL_MAGAZINE.astStatus[1],
	Diag => GVL_MAGAZINE.astDiag[1],
	Error => GVL_MAGAZINE.astError[1]
);

MAGAZINE_AXIS_1(
	FaultRequest := astMagazineAxisFaultRequest[1],
	xResetPermit := NOT GVL_CELL_CONTROL.xGlobalError,
	Axis := Magazine_1,
	AxisData := GVL_MAGAZINE_AXIS.astAxis[1]
);

fbMagazine2(
	uiMagazineId := UINT#2,
	xTestInitialize := xTestInitializePulse,
	xTestEnabled := FALSE,
	stRobotStatus := GVL_ROBOT.Status,
	astMachineStatus := GVL_MACHINE.Status,
	auiMachineType := GVL_MULTI_TYPE.Config.auiMachineType,
	stMagazineCommand := GVL_MAGAZINE.astAutoCommand[2],
	stHmiCommand := GVL_HMI.stRobotCommand,
	xManual := GVL_CELL_CONTROL.xManual AND NOT GVL_CELL_MANAGER.Status.xRunning,
	xReset := GVL_CELL_CONTROL.xReset OR GVL_HMI.astMagazineCommand[2].xReset,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xHmiEnable := GVL_HMI.astMagazineCommand[2].xEnable,
	xHmiDisable := GVL_HMI.astMagazineCommand[2].xDisable,
	xHmiFillBlanks := GVL_HMI.astMagazineCommand[2].xFillZone1,
	xHmiClear := GVL_HMI.astMagazineCommand[2].xClearZone1,
	xHmiCycleSlot := GVL_HMI.astMagazineCommand[2].xCycleZone1Slot,
	xHmiApplySlot := GVL_HMI.astMagazineCommand[2].xApplyZone1Slot,
	uiHmiEditSlot := auiMagazineEditSlot[2],
	uiHmiEditDetailType := GVL_HMI.astMagazineCommand[2].uiEditDetailType,
	uiHmiEditProductType := GVL_HMI.astMagazineCommand[2].uiEditProductType,
	xHmiPowerOn := GVL_HMI.astMagazineCommand[2].xPowerOn,
	xHmiPowerOff := GVL_HMI.astMagazineCommand[2].xPowerOff,
	xHmiHome := GVL_HMI.astMagazineCommand[2].xHome,
	xHmiIndex := GVL_HMI.astMagazineCommand[2].xIndex,
	xHmiAxisStop := GVL_HMI.astMagazineCommand[2].xStop,
	xHmiConfirmRecovery := GVL_HMI.astMagazineCommand[2].xConfirmRecovery,
	xHmiApplyRecoverySlot := GVL_HMI.astMagazineCommand[2].xApplyRecoverySlot,
	xHmiClearRecoveryZones := GVL_HMI.astMagazineCommand[2].xClearRecoveryZones,
	uiHmiRecoveryZone := GVL_HMI.astMagazineCommand[2].uiRecoveryZone,
	uiHmiRecoverySlot := GVL_HMI.astMagazineCommand[2].uiRecoverySlot,
	eHmiRecoveryDetailType := GVL_HMI.astMagazineCommand[2].eRecoveryDetailType,
	uiHmiRecoveryProductType := GVL_HMI.astMagazineCommand[2].uiRecoveryProductType,
	xRobotOwnsMagazine := (GVL_CELL_MANAGER.Status.uiActiveMagazine = UINT#2)
		AND (GVL_CELL_MANAGER.Status.xRunning OR GVL_ROBOT.Status.xBusy),
	stAxisStatus := GVL_MAGAZINE_AXIS.astAxis[2].Status,
	lrIndexTolerance := GVL_HMI.alrMagazineIndexTolerance[2],
	uiRows := UINT#12,
	uiColumns := UINT#10,
	uiTypeCount := GVL_MULTI_TYPE.Config.uiTypeCount,
	auiSlotType := GVL_MULTI_TYPE.Config.auiSlotType,
	FaultRequest := astMagazineFaultRequest[2],
	stInventory := GVL_DETAIL.astMagazine[2],
	AxisCommand => GVL_MAGAZINE_AXIS.astAxis[2].Command,
	Command => GVL_MAGAZINE.astCommand[2],
	Status => GVL_MAGAZINE.astStatus[2],
	Diag => GVL_MAGAZINE.astDiag[2],
	Error => GVL_MAGAZINE.astError[2]
);

MAGAZINE_AXIS_2(
	FaultRequest := astMagazineAxisFaultRequest[2],
	xResetPermit := NOT GVL_CELL_CONTROL.xGlobalError,
	Axis := Magazine_2,
	AxisData := GVL_MAGAZINE_AXIS.astAxis[2]
);
