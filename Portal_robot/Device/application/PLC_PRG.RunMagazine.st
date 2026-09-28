METHOD PRIVATE RunMagazine

// --- BEGIN IMPLEMENTATION ---

auiMagazineEditSlot[1] := GVL_HMI.astMagazineCommand[1].uiEditSlot;
IF auiMagazineEditSlot[1] = UINT#0 THEN
	auiMagazineEditSlot[1] := GVL_HMI.uiMagazineEditSlot;
END_IF;
auiMagazineEditSlot[2] := GVL_HMI.astMagazineCommand[2].uiEditSlot;

fbMagazine1(
	uiMagazineId := UINT#1,
	xMechanismReady := (GVL_TWO_PALLET.uiMode = 0) OR GVL_TWO_PALLET.astStatus[1].xReady,
	xTestInitialize := xTestInitializePulse OR xTestAbortActive,
	xTestEnabled := GVL_HMI.stTestScenario.axMagazineEnabled[1],
	stRobotStatus := GVL_ROBOT.Status,
	astMachineStatus := GVL_MACHINE.Status,
	auiMachineType := GVL_MULTI_TYPE.Config.auiMachineType,
	stMagazineCommand := GVL_MAGAZINE.astAutoCommand[1],
	stHmiCommand := GVL_HMI.stRobotCommand,
	xManual := GVL_CELL_CONTROL.xManual AND NOT GVL_CELL_MANAGER.Status.xRunning,
	xReset := GVL_CELL_CONTROL.xReset OR GVL_HMI.astMagazineCommand[1].xReset OR ((GVL_TWO_PALLET.uiMode = 1) AND (GVL_TWO_PALLET.auiCommand[1] = 16) AND GVL_TWO_PALLET.astStatus[1].xCommandAccepted),
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xHmiEnable := ((GVL_TWO_PALLET.uiMode = 0) AND (GVL_HMI.astMagazineCommand[1].xEnable OR GVL_HMI.xMagazineEnable))
		OR ((GVL_TWO_PALLET.uiMode = 1) AND GVL_TWO_PALLET.astStatus[1].xReady
			AND NOT fbMagazine1.Status.xEnabled AND NOT fbMagazine1.Status.xFinished),
	xHmiDisable := GVL_HMI.astMagazineCommand[1].xDisable OR GVL_HMI.xMagazineDisable OR ((GVL_TWO_PALLET.uiMode = 1) AND (NOT GVL_TWO_PALLET.astStatus[1].xEnabled OR GVL_TWO_PALLET.astStatus[1].xBusy)),
	xHmiFillBlanks := (GVL_TWO_PALLET.uiMode = 0) AND (GVL_HMI.astMagazineCommand[1].xFill OR GVL_HMI.xMagazineFillBlanks),
	xHmiClear := (GVL_TWO_PALLET.uiMode = 0) AND (GVL_HMI.astMagazineCommand[1].xClear OR GVL_HMI.xMagazineClear),
	xHmiCycleSlot := (GVL_TWO_PALLET.uiMode = 0) AND (GVL_HMI.astMagazineCommand[1].xCycleSlot OR GVL_HMI.xMagazineCycleSlot),
	xHmiApplySlot := (GVL_TWO_PALLET.uiMode = 0) AND (GVL_HMI.astMagazineCommand[1].xApplySlot),
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
	uiRows := GVL_CELL_SETTINGS.MagazineRows,
	uiColumns := GVL_CELL_SETTINGS.MagazineColumns,
	uiTypeCount := GVL_MULTI_TYPE.Config.uiTypeCount,
	auiSlotType := GVL_MULTI_TYPE.Config.auiSlotType,
	FaultRequest := astMagazineFaultRequest[1],
	stInventory := GVL_DETAIL.astMagazine[1],
	lrPitchX := GVL_HMI.MagazinePitchX,
	lrPitchY := GVL_HMI.MagazinePitchY,
	Command => GVL_MAGAZINE.astCommand[1],
	Status => GVL_MAGAZINE.astPartStatus[1],
	Diag => GVL_MAGAZINE.astDiag[1],
	Error => GVL_MAGAZINE.astError[1]
);

fbMagazine2(
	uiMagazineId := UINT#2,
	xMechanismReady := (GVL_TWO_PALLET.uiMode = 0) OR GVL_TWO_PALLET.astStatus[2].xReady,
	xTestInitialize := xTestInitializePulse OR xTestAbortActive,
	xTestEnabled := GVL_HMI.stTestScenario.axMagazineEnabled[2],
	stRobotStatus := GVL_ROBOT.Status,
	astMachineStatus := GVL_MACHINE.Status,
	auiMachineType := GVL_MULTI_TYPE.Config.auiMachineType,
	stMagazineCommand := GVL_MAGAZINE.astAutoCommand[2],
	stHmiCommand := GVL_HMI.stRobotCommand,
	xManual := GVL_CELL_CONTROL.xManual AND NOT GVL_CELL_MANAGER.Status.xRunning,
	xReset := GVL_CELL_CONTROL.xReset OR GVL_HMI.astMagazineCommand[2].xReset OR ((GVL_TWO_PALLET.uiMode = 1) AND (GVL_TWO_PALLET.auiCommand[2] = 16) AND GVL_TWO_PALLET.astStatus[2].xCommandAccepted),
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xHmiEnable := ((GVL_TWO_PALLET.uiMode = 0) AND (GVL_HMI.astMagazineCommand[2].xEnable))
		OR ((GVL_TWO_PALLET.uiMode = 1) AND GVL_TWO_PALLET.astStatus[2].xReady
			AND NOT fbMagazine2.Status.xEnabled AND NOT fbMagazine2.Status.xFinished),
	xHmiDisable := GVL_HMI.astMagazineCommand[2].xDisable OR ((GVL_TWO_PALLET.uiMode = 1) AND (NOT GVL_TWO_PALLET.astStatus[2].xEnabled OR GVL_TWO_PALLET.astStatus[2].xBusy)),
	xHmiFillBlanks := (GVL_TWO_PALLET.uiMode = 0) AND (GVL_HMI.astMagazineCommand[2].xFill),
	xHmiClear := (GVL_TWO_PALLET.uiMode = 0) AND (GVL_HMI.astMagazineCommand[2].xClear),
	xHmiCycleSlot := (GVL_TWO_PALLET.uiMode = 0) AND (GVL_HMI.astMagazineCommand[2].xCycleSlot),
	xHmiApplySlot := (GVL_TWO_PALLET.uiMode = 0) AND (GVL_HMI.astMagazineCommand[2].xApplySlot),
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
	uiRows := GVL_CELL_SETTINGS.MagazineRows,
	uiColumns := GVL_CELL_SETTINGS.MagazineColumns,
	uiTypeCount := GVL_MULTI_TYPE.Config.uiTypeCount,
	auiSlotType := GVL_MULTI_TYPE.Config.auiSlotType,
	FaultRequest := astMagazineFaultRequest[2],
	stInventory := GVL_DETAIL.astMagazine[2],
	lrPitchX := GVL_HMI.MagazinePitchX,
	lrPitchY := GVL_HMI.MagazinePitchY,
	Command => GVL_MAGAZINE.astCommand[2],
	Status => GVL_MAGAZINE.astPartStatus[2],
	Diag => GVL_MAGAZINE.astDiag[2],
	Error => GVL_MAGAZINE.astError[2]
);

// Сохранить физический инвентарь текущей палеты после подтверждённых действий робота.
FOR uiTwin := 1 TO 2 DO
	GVL_MAGAZINE.astStatus[uiTwin] := GVL_MAGAZINE.astPartStatus[uiTwin];
	IF NOT GVL_TWO_PALLET.astStatus[uiTwin].xError THEN axTwinRobotStopLatched[uiTwin] := FALSE;
	ELSIF GVL_ROBOT.Status.uiMagazineContext = uiTwin THEN axTwinRobotStopLatched[uiTwin] := TRUE; END_IF;
	IF GVL_TWO_PALLET.uiMode = 1 THEN
		uiTwinPallet := GVL_TWO_PALLET.astStatus[uiTwin].uiRobotPallet;
		IF (uiTwinPallet >= UINT#1) AND (uiTwinPallet <= UINT#2) THEN
			GVL_TWO_PALLET.astStore[uiTwin].astPallet[uiTwinPallet] := GVL_DETAIL.astMagazine[uiTwin];
		END_IF;
		GVL_MAGAZINE.astStatus[uiTwin].xReady := GVL_MAGAZINE.astStatus[uiTwin].xReady AND GVL_TWO_PALLET.astStatus[uiTwin].xReady;
		GVL_MAGAZINE.astStatus[uiTwin].xEnableSequenceAllowed := GVL_TWO_PALLET.astStatus[uiTwin].xEnableAllowed;
		GVL_MAGAZINE.astStatus[uiTwin].xEnabled := GVL_TWO_PALLET.astStatus[uiTwin].xEnabled;
		GVL_MAGAZINE.astStatus[uiTwin].xBusy := GVL_MAGAZINE.astPartStatus[uiTwin].xBusy OR GVL_TWO_PALLET.astStatus[uiTwin].xBusy;
		GVL_MAGAZINE.astStatus[uiTwin].xFillAllowed := FALSE;
		GVL_MAGAZINE.astStatus[uiTwin].xClearAllowed := FALSE;
		GVL_MAGAZINE.astStatus[uiTwin].xEditAllowed := FALSE;
		GVL_MAGAZINE.astStatus[uiTwin].xError := GVL_MAGAZINE.astStatus[uiTwin].xError OR GVL_TWO_PALLET.astStatus[uiTwin].xError;
		GVL_MAGAZINE.astError[uiTwin].dwErrorActive := GVL_MAGAZINE.astError[uiTwin].dwErrorActive
			OR GVL_TWO_PALLET.astError[uiTwin].dwErrorActive;
		GVL_MAGAZINE.astError[uiTwin].dwAlarmActive := GVL_MAGAZINE.astError[uiTwin].dwAlarmActive
			OR GVL_TWO_PALLET.astError[uiTwin].dwAlarmActive;
		GVL_MAGAZINE.astStatus[uiTwin].xRobotStopRequired := GVL_MAGAZINE.astStatus[uiTwin].xRobotStopRequired
			OR axTwinRobotStopLatched[uiTwin];
		IF axTwinRobotStopLatched[uiTwin] THEN
			GVL_MAGAZINE.astCommand[uiTwin].xStop := TRUE;
			GVL_MAGAZINE.astCommand[uiTwin].xExecute := FALSE;
		END_IF;
	ELSE
		GVL_TWO_PALLET.astStatic[uiTwin] := GVL_DETAIL.astMagazine[uiTwin];
	END_IF;
END_FOR;

IF GVL_TWO_PALLET.uiMode = 0 THEN
	GVL_TWO_PALLET.lrStaticPitchX := GVL_HMI.MagazinePitchX;
	GVL_TWO_PALLET.lrStaticPitchY := GVL_HMI.MagazinePitchY;
ELSE
	GVL_TWO_PALLET.lrTwinPitchX := GVL_HMI.MagazinePitchX;
	GVL_TWO_PALLET.lrTwinPitchY := GVL_HMI.MagazinePitchY;
END_IF;
