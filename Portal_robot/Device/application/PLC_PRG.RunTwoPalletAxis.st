METHOD PRIVATE RunTwoPalletAxis

// --- BEGIN IMPLEMENTATION ---

// Используем две существующие виртуальные SoftMotion-оси прежних магазинов.
// Ссылки назначаются каждый скан до проверки __ISVALIDREF и вызова FB_AXIS.
GVL_TWO_PALLET.Axis1 REF= Magazine_1;
GVL_TWO_PALLET.Axis2 REF= Magazine_2;
GVL_TWO_PALLET.astInput[1].xAxisBound := __ISVALIDREF(GVL_TWO_PALLET.Axis1);
GVL_TWO_PALLET.astInput[2].xAxisBound := __ISVALIDREF(GVL_TWO_PALLET.Axis2);
FOR uiTwin := 1 TO 2 DO
	GVL_TWO_PALLET.astAxis[uiTwin].Command.xEnable := GVL_TWO_PALLET.astOutput[uiTwin].xPowerOn;
	GVL_TWO_PALLET.astAxis[uiTwin].Command.xDisable := GVL_TWO_PALLET.astOutput[uiTwin].xPowerOff
		OR (GVL_TWO_PALLET.uiMode = 0);
	GVL_TWO_PALLET.astAxis[uiTwin].Command.xPowerPermit := (GVL_TWO_PALLET.uiMode = 1)
		AND CELL_SAFETY.Status.xReady AND GVL_TWO_PALLET.astInput[uiTwin].xIoMapped;
	GVL_TWO_PALLET.astAxis[uiTwin].Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError;
	GVL_TWO_PALLET.astAxis[uiTwin].Command.xResetAllError := GVL_TWO_PALLET.astOutput[uiTwin].xDriveReset;
	GVL_TWO_PALLET.astAxis[uiTwin].Command.xStop := GVL_TWO_PALLET.astOutput[uiTwin].xStop;
	GVL_TWO_PALLET.astAxis[uiTwin].Command.xHome := GVL_TWO_PALLET.astOutput[uiTwin].xHome;
	GVL_TWO_PALLET.astAxis[uiTwin].Command.xMoveAbsolute := GVL_TWO_PALLET.astOutput[uiTwin].xMove;
	GVL_TWO_PALLET.astAxis[uiTwin].Command.xJogPositive := GVL_TWO_PALLET.astOutput[uiTwin].xJogPositive;
	GVL_TWO_PALLET.astAxis[uiTwin].Command.xJogNegative := GVL_TWO_PALLET.astOutput[uiTwin].xJogNegative;
	GVL_TWO_PALLET.astAxis[uiTwin].MotionParam.lrTargetPosition := GVL_TWO_PALLET.astOutput[uiTwin].lrTarget;
	GVL_TWO_PALLET.astAxis[uiTwin].MotionParam.lrHomePosition := GVL_TWO_PALLET.astActiveConfig[uiTwin].lrHome;
	GVL_TWO_PALLET.astAxis[uiTwin].MotionParam.lrVelocity := GVL_TWO_PALLET.astActiveConfig[uiTwin].lrVelocity;
	GVL_TWO_PALLET.astAxis[uiTwin].MotionParam.lrAcceleration := GVL_TWO_PALLET.astActiveConfig[uiTwin].lrAcceleration;
	GVL_TWO_PALLET.astAxis[uiTwin].MotionParam.lrDeceleration := GVL_TWO_PALLET.astActiveConfig[uiTwin].lrDeceleration;
	GVL_TWO_PALLET.astAxis[uiTwin].MotionParam.lrJerk := GVL_TWO_PALLET.astActiveConfig[uiTwin].lrJerk;
	GVL_TWO_PALLET.astAxis[uiTwin].Timeouts := GVL_CELL_SETTINGS.stAxisTimeouts;
	GVL_TWO_PALLET.astAxis[uiTwin].Timeouts.tHomeTimeout := GVL_TWO_PALLET.astActiveConfig[uiTwin].tHome;
	GVL_TWO_PALLET.astAxis[uiTwin].Timeouts.tMoveTimeout := GVL_TWO_PALLET.astActiveConfig[uiTwin].tMove;
END_FOR;
IF __ISVALIDREF(GVL_TWO_PALLET.Axis1) THEN
	TWIN_AXIS_1(Axis := GVL_TWO_PALLET.Axis1, AxisData := GVL_TWO_PALLET.astAxis[1],
		xResetPermit := GVL_CELL_CONTROL.xManual AND NOT GVL_CELL_MANAGER.Status.xRunning);
END_IF;
IF __ISVALIDREF(GVL_TWO_PALLET.Axis2) THEN
	TWIN_AXIS_2(Axis := GVL_TWO_PALLET.Axis2, AxisData := GVL_TWO_PALLET.astAxis[2],
		xResetPermit := GVL_CELL_CONTROL.xManual AND NOT GVL_CELL_MANAGER.Status.xRunning);
END_IF;
FOR uiTwin := 1 TO 2 DO
	GVL_TWO_PALLET.astInput[uiTwin].xPowered := GVL_TWO_PALLET.astAxis[uiTwin].Status.xPowered;
	GVL_TWO_PALLET.astInput[uiTwin].xHomed := GVL_TWO_PALLET.astAxis[uiTwin].Status.xHomed;
	GVL_TWO_PALLET.astInput[uiTwin].xStandstill := GVL_TWO_PALLET.astAxis[uiTwin].Status.xStandstill;
	GVL_TWO_PALLET.astInput[uiTwin].xDriveError := GVL_TWO_PALLET.astAxis[uiTwin].Status.xError;
	GVL_TWO_PALLET.astInput[uiTwin].xMotionDone := GVL_TWO_PALLET.astAxis[uiTwin].Status.xDone;
	GVL_TWO_PALLET.astInput[uiTwin].lrPosition := GVL_TWO_PALLET.astAxis[uiTwin].Status.lrActualPosition;
	TWIN_SIM[uiTwin](
		xEnable := (GVL_TWO_PALLET.uiMode = UINT#1)
			AND (GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.SIMULATION),
		uiP1Signals := GVL_TWO_PALLET.astActiveConfig[uiTwin].uiP1Signals,
		Command := GVL_TWO_PALLET.astOutput[uiTwin]);
	IF (GVL_TWO_PALLET.uiMode = UINT#1)
		AND (GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.SIMULATION) THEN
		GVL_TWO_PALLET.astInput[uiTwin].xIoMapped := TRUE;
		GVL_TWO_PALLET.astInput[uiTwin].xLiftDown := TWIN_SIM[uiTwin].xLiftDown;
		GVL_TWO_PALLET.astInput[uiTwin].xLiftUp := TWIN_SIM[uiTwin].xLiftUp;
		GVL_TWO_PALLET.astInput[uiTwin].xLockIn := TWIN_SIM[uiTwin].xLockIn;
		GVL_TWO_PALLET.astInput[uiTwin].xLockOut := TWIN_SIM[uiTwin].xLockOut;
		GVL_TWO_PALLET.astInput[uiTwin].xStopIn := TWIN_SIM[uiTwin].xStopIn;
		GVL_TWO_PALLET.astInput[uiTwin].xStopOut := TWIN_SIM[uiTwin].xStopOut;
		GVL_TWO_PALLET.astInput[uiTwin].xLimitNegative := FALSE;
		GVL_TWO_PALLET.astInput[uiTwin].xLimitPositive := FALSE;
		GVL_TWO_PALLET.astInput[uiTwin].xHomeSensor := GVL_TWO_PALLET.astInput[uiTwin].xHomed
			AND (ABS(GVL_TWO_PALLET.astInput[uiTwin].lrPosition
				- GVL_TWO_PALLET.astActiveConfig[uiTwin].lrHome)
				<= GVL_TWO_PALLET.astActiveConfig[uiTwin].lrTolerance);
		axTwinSimIoOwned[uiTwin] := TRUE;
	ELSIF axTwinSimIoOwned[uiTwin] THEN
		// После выхода из виртуальной среды не оставляем её герконы как реальные.
		GVL_TWO_PALLET.astInput[uiTwin].xIoMapped := FALSE;
		GVL_TWO_PALLET.astInput[uiTwin].xLiftDown := FALSE;
		GVL_TWO_PALLET.astInput[uiTwin].xLiftUp := FALSE;
		GVL_TWO_PALLET.astInput[uiTwin].xLockIn := FALSE;
		GVL_TWO_PALLET.astInput[uiTwin].xLockOut := FALSE;
		GVL_TWO_PALLET.astInput[uiTwin].xStopIn := FALSE;
		GVL_TWO_PALLET.astInput[uiTwin].xStopOut := FALSE;
		GVL_TWO_PALLET.astInput[uiTwin].xLimitNegative := FALSE;
		GVL_TWO_PALLET.astInput[uiTwin].xLimitPositive := FALSE;
		GVL_TWO_PALLET.astInput[uiTwin].xHomeSensor := FALSE;
		axTwinSimIoOwned[uiTwin] := FALSE;
	END_IF;
END_FOR;
