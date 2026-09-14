METHOD PRIVATE RunMagazine

// --- BEGIN IMPLEMENTATION ---

auiMagazineEditSlot[1] := GVL_HMI.astMagazineCommand[1].uiEditSlot;
IF auiMagazineEditSlot[1] = UINT#0 THEN
	auiMagazineEditSlot[1] := GVL_HMI.uiMagazineEditSlot;
END_IF;
auiMagazineEditSlot[2] := GVL_HMI.astMagazineCommand[2].uiEditSlot;

fbMagazine1(
	uiMagazineId := UINT#1,
	xTestInitialize := xTestInitializePulse OR xTestAbortActive,
	xTestEnabled := GVL_HMI.stTestScenario.axMagazineEnabled[1],
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
	xHmiFillBlanks := GVL_HMI.astMagazineCommand[1].xFill OR GVL_HMI.xMagazineFillBlanks,
	xHmiClear := GVL_HMI.astMagazineCommand[1].xClear OR GVL_HMI.xMagazineClear,
	xHmiCycleSlot := GVL_HMI.astMagazineCommand[1].xCycleSlot OR GVL_HMI.xMagazineCycleSlot,
	xHmiApplySlot := GVL_HMI.astMagazineCommand[1].xApplySlot,
	xHmiApplyPitchX := GVL_HMI.astMagazineCommand[1].xApplyPitchX,
	xHmiApplyPitchY := GVL_HMI.astMagazineCommand[1].xApplyPitchY,
	uiHmiEditSlot := auiMagazineEditSlot[1],
	uiHmiEditDetailType := GVL_HMI.astMagazineCommand[1].uiEditDetailType,
	uiHmiEditProductType := GVL_HMI.astMagazineCommand[1].uiEditProductType,
	lrHmiEditPitchX := GVL_HMI.astMagazineCommand[1].lrEditPitchX,
	lrHmiEditPitchY := GVL_HMI.astMagazineCommand[1].lrEditPitchY,
	xRobotOwnsMagazine := (GVL_CELL_MANAGER.Status.uiActiveMagazine = UINT#1)
		AND (GVL_CELL_MANAGER.Status.xRunning OR GVL_ROBOT.Status.xBusy),
	xRobotCanWorkWithMagazine := xRobotInterfaceReady
		AND xPointTableReady
		AND NOT GVL_ROBOT.Status.xError,
	xSharedGeometryEditAllowed := NOT GVL_MAGAZINE.astStatus[1].xEnabled
		AND NOT GVL_MAGAZINE.astStatus[2].xEnabled
		AND NOT GVL_HMI.xMagazineEnable
		AND NOT GVL_HMI.astMagazineCommand[1].xEnable
		AND NOT GVL_HMI.astMagazineCommand[2].xEnable,
	uiRows := UINT#12,
	uiColumns := UINT#10,
	uiTypeCount := GVL_MULTI_TYPE.Config.uiTypeCount,
	auiSlotType := GVL_MULTI_TYPE.Config.auiSlotType,
	FaultRequest := astMagazineFaultRequest[1],
	stInventory := GVL_DETAIL.astMagazine[1],
	lrPitchX := GVL_HMI.MagazinePitchX,
	lrPitchY := GVL_HMI.MagazinePitchY,
	Command => GVL_MAGAZINE.astCommand[1],
	Status => GVL_MAGAZINE.astStatus[1],
	Diag => GVL_MAGAZINE.astDiag[1],
	Error => GVL_MAGAZINE.astError[1]
);

fbMagazine2(
	uiMagazineId := UINT#2,
	xTestInitialize := xTestInitializePulse OR xTestAbortActive,
	xTestEnabled := GVL_HMI.stTestScenario.axMagazineEnabled[2],
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
	xHmiFillBlanks := GVL_HMI.astMagazineCommand[2].xFill,
	xHmiClear := GVL_HMI.astMagazineCommand[2].xClear,
	xHmiCycleSlot := GVL_HMI.astMagazineCommand[2].xCycleSlot,
	xHmiApplySlot := GVL_HMI.astMagazineCommand[2].xApplySlot,
	xHmiApplyPitchX := GVL_HMI.astMagazineCommand[2].xApplyPitchX,
	xHmiApplyPitchY := GVL_HMI.astMagazineCommand[2].xApplyPitchY,
	uiHmiEditSlot := auiMagazineEditSlot[2],
	uiHmiEditDetailType := GVL_HMI.astMagazineCommand[2].uiEditDetailType,
	uiHmiEditProductType := GVL_HMI.astMagazineCommand[2].uiEditProductType,
	lrHmiEditPitchX := GVL_HMI.astMagazineCommand[2].lrEditPitchX,
	lrHmiEditPitchY := GVL_HMI.astMagazineCommand[2].lrEditPitchY,
	xRobotOwnsMagazine := (GVL_CELL_MANAGER.Status.uiActiveMagazine = UINT#2)
		AND (GVL_CELL_MANAGER.Status.xRunning OR GVL_ROBOT.Status.xBusy),
	xRobotCanWorkWithMagazine := xRobotInterfaceReady
		AND xPointTableReady
		AND NOT GVL_ROBOT.Status.xError,
	xSharedGeometryEditAllowed := NOT GVL_MAGAZINE.astStatus[1].xEnabled
		AND NOT GVL_MAGAZINE.astStatus[2].xEnabled
		AND NOT GVL_HMI.xMagazineEnable
		AND NOT GVL_HMI.astMagazineCommand[1].xEnable
		AND NOT GVL_HMI.astMagazineCommand[2].xEnable,
	uiRows := UINT#12,
	uiColumns := UINT#10,
	uiTypeCount := GVL_MULTI_TYPE.Config.uiTypeCount,
	auiSlotType := GVL_MULTI_TYPE.Config.auiSlotType,
	FaultRequest := astMagazineFaultRequest[2],
	stInventory := GVL_DETAIL.astMagazine[2],
	lrPitchX := GVL_HMI.MagazinePitchX,
	lrPitchY := GVL_HMI.MagazinePitchY,
	Command => GVL_MAGAZINE.astCommand[2],
	Status => GVL_MAGAZINE.astStatus[2],
	Diag => GVL_MAGAZINE.astDiag[2],
	Error => GVL_MAGAZINE.astError[2]
);
