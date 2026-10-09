METHOD PRIVATE RunGeometryControl

// --- BEGIN IMPLEMENTATION ---

xGeometryEnvironmentChanged := NOT xGeometryInitialized
	OR (eGeometryPreviousEnvironment <> GVL_CELL_SETTINGS.eTestEnvironment);
GVL_GEOMETRY_CONTROL.uiEnvironment := TO_UINT(GVL_CELL_SETTINGS.eTestEnvironment);
GVL_GEOMETRY_CONTROL.xSupported := NOT GVL_HMI.xModbusMode
	AND (GVL_CELL_SETTINGS.eTestEnvironment <> E_CELL_TEST_ENVIRONMENT.SC500_BENCH);
IF xGeometryEnvironmentChanged THEN
	FOR uiGeometry := UINT#1 TO UINT#2 DO
		IF GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.NORMAL THEN
			GVL_GEOMETRY_CONTROL.astActiveMemory[uiGeometry] := GVL_GEOMETRY_CONTROL.astMemory[uiGeometry];
		ELSE GVL_GEOMETRY_CONTROL.astActiveMemory[uiGeometry] := GVL_GEOMETRY_CONTROL.astSimulationMemory[uiGeometry]; END_IF;
		GVL_GEOMETRY_CONTROL.astSignals[uiGeometry].xReserve := FALSE;
		GVL_GEOMETRY_CONTROL.astSignals[uiGeometry].xDeposited := FALSE;
		GVL_GEOMETRY_CONTROL.astSignals[uiGeometry].xReleased := FALSE;
		GVL_GEOMETRY_CONTROL.astSignals[uiGeometry].xRobotInteraction := FALSE;
	END_FOR;
	FOR uiGeometryMachine := UINT#1 TO UINT#3 DO
		IF GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.NORMAL THEN
			GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine] := GVL_GEOMETRY_CONTROL.astRetainCalls[uiGeometryMachine];
			GVL_GEOMETRY_CONTROL.auiActiveCount[uiGeometryMachine] := GVL_GEOMETRY_CONTROL.auiCount[uiGeometryMachine];
		ELSE
			GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine] := GVL_GEOMETRY_CONTROL.astSimulationCalls[uiGeometryMachine];
			GVL_GEOMETRY_CONTROL.auiActiveCount[uiGeometryMachine] := GVL_GEOMETRY_CONTROL.auiSimulationCount[uiGeometryMachine];
		END_IF;
		IF (GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiState = UINT#2)
		OR (GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiState = UINT#3) THEN
			GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiState := UINT#7;
			GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiReason := UINT#5;
			F_GEOMETRY_EVENT(Call := GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine]);
		END_IF;
	END_FOR;
	xGeometryInitialized := TRUE;
	eGeometryPreviousEnvironment := GVL_CELL_SETTINGS.eTestEnvironment;
END_IF;
FOR uiGeometry := UINT#1 TO UINT#2 DO
	GVL_GEOMETRY_CONTROL.auiAction[uiGeometry] := UINT#0;
	IF GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.NORMAL THEN
		GVL_GEOMETRY_CONTROL.astActiveConfig[uiGeometry] := GVL_GEOMETRY_CONTROL.astConfig[uiGeometry];
	ELSE GVL_GEOMETRY_CONTROL.astActiveConfig[uiGeometry] := GVL_GEOMETRY_CONTROL.astSimulationConfig[uiGeometry]; END_IF;
END_FOR;
GVL_GEOMETRY_CONTROL.xAutoChangeAllowed := GVL_GEOMETRY_CONTROL.xSupported
	AND xHmiConnectionAlive AND NOT GVL_HMI.xTestSessionActive AND NOT GVL_CELL_CONTROL.xGlobalError;
GVL_GEOMETRY_CONTROL.xSettingsAllowed := GVL_GEOMETRY_CONTROL.xSupported
	AND GVL_CELL_SETTINGS.xCellSettingsChangeAllowed AND xHmiConnectionAlive
	AND NOT GVL_GEOMETRY_CONTROL.astStatus[1].xDriveRunning AND NOT GVL_GEOMETRY_CONTROL.astStatus[2].xDriveRunning
	AND NOT GVL_GEOMETRY_CONTROL.astStatus[1].xResetBusy AND NOT GVL_GEOMETRY_CONTROL.astStatus[2].xResetBusy
	AND NOT GVL_GEOMETRY_CONTROL.astStatus[1].xReserved AND NOT GVL_GEOMETRY_CONTROL.astStatus[2].xReserved
	AND NOT GVL_GEOMETRY_CONTROL.astSignals[1].xRobotInteraction AND NOT GVL_GEOMETRY_CONTROL.astSignals[2].xRobotInteraction
	AND NOT GEOMETRY[1].xRunOutput AND NOT GEOMETRY[2].xRunOutput;
FOR uiGeometryMachine := UINT#1 TO UINT#3 DO
	GVL_GEOMETRY_CONTROL.axCallAllowed[uiGeometryMachine] := GVL_GEOMETRY_CONTROL.xAutoChangeAllowed
		AND GVL_MACHINE.Status[uiGeometryMachine].xEnabled
		AND ((GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiState <= UINT#1)
			OR (GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiState > UINT#3))
		AND (GVL_GEOMETRY_CONTROL.astStatus[1].xEnabled OR GVL_GEOMETRY_CONTROL.astStatus[2].xEnabled);
	GVL_GEOMETRY_CONTROL.axCancelAllowed[uiGeometryMachine] := GVL_GEOMETRY_CONTROL.xAutoChangeAllowed
		AND (GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiState = UINT#1);
END_FOR;

// Упакованный канал: подготовка payload -> CommandSeq -> Result -> Ack.
udiGeometryRequest := GVL_HMI.udiGeometryCommandSeq;
xGeometryRequestFresh := FALSE;
IF (udiGeometryRequest <> UDINT#0) AND (udiGeometryRequest <> GVL_HMI.udiGeometryAckSeq) THEN
	stGeometryRequest := GVL_HMI.stGeometryRequest;
	GVL_HMI.uiGeometryResult := UINT#2;
	IF NOT IsHmiCommandFresh(udiIssuedAtMs := GVL_HMI.udiGeometryIssuedAtMs) THEN
		GVL_HMI.uiGeometryResult := UINT#4;
	ELSIF xHmiConnectionAlive THEN
		xGeometryRequestFresh := TRUE;
		IF (stGeometryRequest.uiAction = UINT#8) AND (stGeometryRequest.uiMachine >= UINT#1)
		AND (stGeometryRequest.uiMachine <= UINT#3) THEN
			uiGeometryMachine := stGeometryRequest.uiMachine;
			IF GVL_GEOMETRY_CONTROL.axCallAllowed[uiGeometryMachine] THEN
				IF GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiState = UINT#1 THEN
					stGeometryCall := GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine];
				ELSE
					GVL_GEOMETRY_CONTROL.udiNextCallId := GVL_GEOMETRY_CONTROL.udiNextCallId + UDINT#1;
					IF GVL_GEOMETRY_CONTROL.udiNextCallId = UDINT#0 THEN GVL_GEOMETRY_CONTROL.udiNextCallId := UDINT#1; END_IF;
					stGeometryCall := stGeometryEmptyCall;
					stGeometryCall.udiId := GVL_GEOMETRY_CONTROL.udiNextCallId;
					stGeometryCall.uiMachine := uiGeometryMachine;
					stGeometryCall.uiProductType := GVL_MULTI_TYPE.Config.auiMachineType[uiGeometryMachine];
				END_IF;
				stGeometryCall.xForced := TRUE; stGeometryCall.uiState := UINT#1;
				GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine] := stGeometryCall;
				GVL_GEOMETRY_CONTROL.auiActiveCount[uiGeometryMachine] := UINT#0;
				F_GEOMETRY_EVENT(Call := stGeometryCall); GVL_HMI.uiGeometryResult := UINT#1;
			END_IF;
		ELSIF (stGeometryRequest.uiAction = UINT#12) AND (stGeometryRequest.uiMachine >= UINT#1)
		AND (stGeometryRequest.uiMachine <= UINT#3) THEN
			uiGeometryMachine := stGeometryRequest.uiMachine;
			IF GVL_GEOMETRY_CONTROL.axCancelAllowed[uiGeometryMachine] THEN
				GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiState := UINT#6;
				F_GEOMETRY_EVENT(Call := GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine]); GVL_HMI.uiGeometryResult := UINT#1;
			END_IF;
		ELSIF (stGeometryRequest.uiAction = UINT#9) AND GVL_GEOMETRY_CONTROL.xAutoChangeAllowed
		AND (stGeometryRequest.udiValue <= UDINT#1) THEN
			GVL_GEOMETRY_CONTROL.xAutoEnabled := stGeometryRequest.udiValue = UDINT#1;
			GVL_HMI.uiGeometryResult := UINT#1;
		ELSIF (stGeometryRequest.uiAction = UINT#10) AND GVL_GEOMETRY_CONTROL.xAutoChangeAllowed
		AND (stGeometryRequest.uiMachine <= UINT#3) AND (stGeometryRequest.udiValue >= UDINT#1)
		AND (stGeometryRequest.udiValue <= UDINT#10000) THEN
			FOR uiGeometryMachine := UINT#1 TO UINT#3 DO
				IF (stGeometryRequest.uiMachine = UINT#0) OR (stGeometryRequest.uiMachine = uiGeometryMachine) THEN
					GVL_GEOMETRY_CONTROL.auiPeriod[uiGeometryMachine] := UDINT_TO_UINT(stGeometryRequest.udiValue);
				END_IF;
			END_FOR;
			GVL_HMI.uiGeometryResult := UINT#1;
		ELSIF (stGeometryRequest.uiAction = UINT#16) AND GVL_GEOMETRY_CONTROL.xSettingsAllowed THEN
			CASE stGeometryRequest.uiMachine OF
				UINT#1: IF stGeometryRequest.udiValue <= UDINT#1 THEN GVL_GEOMETRY_CONTROL.xWaitWhenOccupied := stGeometryRequest.udiValue = UDINT#1; GVL_HMI.uiGeometryResult := UINT#1; END_IF;
				UINT#2: IF (stGeometryRequest.udiValue >= UDINT#100) AND (stGeometryRequest.udiValue <= UDINT#600000) THEN GVL_GEOMETRY_CONTROL.tTransportTimeout := UDINT_TO_TIME(stGeometryRequest.udiValue); GVL_HMI.uiGeometryResult := UINT#1; END_IF;
				UINT#3: IF (stGeometryRequest.udiValue >= UDINT#100) AND (stGeometryRequest.udiValue <= UDINT#60000) THEN GVL_GEOMETRY_CONTROL.tDriveFeedbackTimeout := UDINT_TO_TIME(stGeometryRequest.udiValue); GVL_HMI.uiGeometryResult := UINT#1; END_IF;
				UINT#4: IF (stGeometryRequest.udiValue >= UDINT#100) AND (stGeometryRequest.udiValue <= UDINT#10000) THEN GVL_GEOMETRY_CONTROL.tResetPulse := UDINT_TO_TIME(stGeometryRequest.udiValue); GVL_HMI.uiGeometryResult := UINT#1; END_IF;
			END_CASE;
		ELSIF (stGeometryRequest.uiStation >= UINT#1) AND (stGeometryRequest.uiStation <= UINT#2) THEN
			uiGeometry := stGeometryRequest.uiStation;
			IF (stGeometryRequest.uiAction >= UINT#1) AND (stGeometryRequest.uiAction <= UINT#7) THEN
				GVL_GEOMETRY_CONTROL.auiAction[uiGeometry] := stGeometryRequest.uiAction;
			ELSIF (stGeometryRequest.uiAction = UINT#11) AND GVL_GEOMETRY_CONTROL.xSupported
			AND GVL_POINT_MANAGER.PointManager.Diag.xXLimitValid
			AND GVL_POINT_MANAGER.PointManager.Diag.xYLimitValid
			AND GVL_POINT_MANAGER.PointManager.Diag.xZLimitValid THEN
				stGeometryConfig := stGeometryRequest.Config;
				stGeometryConfig.lrChangeZ := stGeometryConfig.lrSafeZ;
				xGeometryConfigValid := (stGeometryConfig.lrSpeedFactor >= 0.1) AND (stGeometryConfig.lrSpeedFactor <= 1.0)
					AND (stGeometryConfig.lrSafeZ < 0.0) AND (stGeometryConfig.lrSafeZ >= -10000.0)
					AND (stGeometryConfig.lrX >= GVL_POINT_MANAGER.PointManager.Diag.lrX_MinLimit)
					AND (stGeometryConfig.lrX <= GVL_POINT_MANAGER.PointManager.Diag.lrX_MaxLimit)
					AND (stGeometryConfig.lrY >= GVL_POINT_MANAGER.PointManager.Diag.lrY_MinLimit)
					AND (stGeometryConfig.lrY <= GVL_POINT_MANAGER.PointManager.Diag.lrY_MaxLimit)
					AND (stGeometryConfig.lrZ >= GVL_POINT_MANAGER.PointManager.Diag.lrZ_MinLimit)
					AND (stGeometryConfig.lrZ <= GVL_POINT_MANAGER.PointManager.Diag.lrZ_MaxLimit)
					AND ((stGeometryConfig.lrZ + stGeometryConfig.lrSafeZ) >= GVL_POINT_MANAGER.PointManager.Diag.lrZ_MinLimit);
				IF xGeometryConfigValid THEN
					stGeometryConfig.xConfigured := TRUE;
					IF GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.NORMAL THEN GVL_GEOMETRY_CONTROL.astConfig[uiGeometry] := stGeometryConfig;
					ELSE GVL_GEOMETRY_CONTROL.astSimulationConfig[uiGeometry] := stGeometryConfig; END_IF;
					GVL_GEOMETRY_CONTROL.astActiveConfig[uiGeometry] := stGeometryConfig; GVL_HMI.uiGeometryResult := UINT#1;
				END_IF;
			ELSIF (stGeometryRequest.uiAction = UINT#13) AND GVL_GEOMETRY_CONTROL.astStatus[uiGeometry].xPointWriteAllowed
			AND GVL_HMI.xPointEditorCaptureAllowed THEN
				GVL_HMI.stGeometryCapture := GVL_GEOMETRY_CONTROL.astActiveConfig[uiGeometry];
				GVL_HMI.stGeometryCapture.lrX := lrRobotActualX; GVL_HMI.stGeometryCapture.lrY := lrRobotActualY;
				GVL_HMI.stGeometryCapture.lrZ := lrRobotActualZ; GVL_HMI.uiGeometryResult := UINT#1;
			ELSIF ((stGeometryRequest.uiAction = UINT#14) OR (stGeometryRequest.uiAction = UINT#15))
			AND GVL_CELL_SETTINGS.xErrorSimulationEnabled
			AND (GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.SIMULATION)
			AND GVL_GEOMETRY_CONTROL.xSupported THEN
				GVL_GEOMETRY_CONTROL.axSimulationAlarm[uiGeometry] := stGeometryRequest.uiAction = UINT#14;
				GVL_HMI.uiGeometryResult := UINT#1;
			END_IF;
		END_IF;
	END_IF;
END_IF;

FOR uiGeometry := UINT#1 TO UINT#2 DO
	xGeometryStopAttempt := FALSE;
	IF (GVL_HMI.audiGeometryStopSeq[uiGeometry] <> UDINT#0)
	AND (GVL_HMI.audiGeometryStopSeq[uiGeometry] <> GVL_HMI.audiGeometryStopAck[uiGeometry]) THEN
		GVL_GEOMETRY_CONTROL.auiAction[uiGeometry] := UINT#6;
		xGeometryStopAttempt := TRUE;
		GVL_HMI.audiGeometryStopAck[uiGeometry] := GVL_HMI.audiGeometryStopSeq[uiGeometry];
	END_IF;
	IF GVL_CELL_SETTINGS.eTestEnvironment <> E_CELL_TEST_ENVIRONMENT.NORMAL THEN
		GEOMETRY_SIM[uiGeometry](xInitialize := xGeometryEnvironmentChanged OR xTestInitializePulse,
			xRun := GEOMETRY[uiGeometry].xRunOutput, xReset := GEOMETRY[uiGeometry].xResetOutput,
			xDeposited := GVL_GEOMETRY_CONTROL.astSignals[uiGeometry].xDeposited,
			udiPartId := GVL_GEOMETRY_CONTROL.astSignals[uiGeometry].Call.udiId,
			xRemove := GEOMETRY[uiGeometry].xSimulationEmptyConfirmed,
			xAlarm := GVL_GEOMETRY_CONTROL.axSimulationAlarm[uiGeometry],
			uiTimeFactor := SEL(GVL_CELL_SETTINGS.xSimulationAccelerationActive, UINT#1, GVL_CELL_SETTINGS.uiSimulationTimeFactorApplied));
		xGeometryDriveAlarm := GEOMETRY_SIM[uiGeometry].xDriveAlarm;
		xGeometryDriveRunning := GEOMETRY_SIM[uiGeometry].xDriveRunning;
		xGeometryPartAtEnd := GEOMETRY_SIM[uiGeometry].xPartAtEnd;
	ELSE
		uiGeometryDi := UINT#81 + (uiGeometry - UINT#1) * UINT#2;
		xGeometryDriveAlarm := xPhysicalNormal AND (GVL_PHYSICAL_IO.xMappingVerified OR axIoForced[uiGeometryDi]) AND axPhysicalRaw[uiGeometryDi];
		xGeometryDriveRunning := xPhysicalNormal AND (GVL_PHYSICAL_IO.xMappingVerified OR axIoForced[uiGeometryDi + UINT#1]) AND axPhysicalRaw[uiGeometryDi + UINT#1];
		xGeometryPartAtEnd := GVL_PHYSICAL_IO.axGkPartAtEnd[uiGeometry];
	END_IF;
	stGeometrySignals := GVL_GEOMETRY_CONTROL.astSignals[uiGeometry];
	// Ручное движение также считается работой с ГК; состояние последней точки
	// удерживает блокировку ленты вплоть до подтверждённого отхода.
	IF uiGeometry = UINT#1 THEN
		stGeometrySignals.xRobotInteraction := stGeometrySignals.xRobotInteraction
			OR (GVL_ROBOT.Status.eCurrentPoint = E_POINT_NAME.GEOMETRY_1_PLACE)
			OR (GVL_ROBOT.Status.eCurrentPoint = E_POINT_NAME.GEOMETRY_1_CHANGE)
			OR (GVL_ROBOT.Status.xBusy AND ((GVL_ROBOT.Command.eSetPoint = E_POINT_NAME.GEOMETRY_1_PLACE)
				OR (GVL_ROBOT.Command.eSetPoint = E_POINT_NAME.GEOMETRY_1_CHANGE)));
	ELSE
		stGeometrySignals.xRobotInteraction := stGeometrySignals.xRobotInteraction
			OR (GVL_ROBOT.Status.eCurrentPoint = E_POINT_NAME.GEOMETRY_2_PLACE)
			OR (GVL_ROBOT.Status.eCurrentPoint = E_POINT_NAME.GEOMETRY_2_CHANGE)
			OR (GVL_ROBOT.Status.xBusy AND ((GVL_ROBOT.Command.eSetPoint = E_POINT_NAME.GEOMETRY_2_PLACE)
				OR (GVL_ROBOT.Command.eSetPoint = E_POINT_NAME.GEOMETRY_2_CHANGE)));
	END_IF;
	GEOMETRY[uiGeometry](xInitialize := xGeometryEnvironmentChanged, uiAction := GVL_GEOMETRY_CONTROL.auiAction[uiGeometry],
		xSupported := GVL_GEOMETRY_CONTROL.xSupported AND ((GVL_CELL_SETTINGS.eTestEnvironment <> E_CELL_TEST_ENVIRONMENT.NORMAL) OR GVL_PHYSICAL_IO.xMappingVerified),
		xSimulation := GVL_CELL_SETTINGS.eTestEnvironment <> E_CELL_TEST_ENVIRONMENT.NORMAL,
		xGlobalError := GVL_CELL_CONTROL.xGlobalError, xManual := GVL_CELL_CONTROL.xManual,
		xCellRunning := GVL_CELL_MANAGER.Status.xRunning, xRobotBusy := GVL_ROBOT.Status.xBusy,
		xMotionBusy := xMotionBusy, xHmiAlive := xHmiConnectionAlive, xIoManual := xIoManualActive,
		xReset := GVL_CELL_CONTROL.xReset, xDriveAlarm := xGeometryDriveAlarm,
		xDriveRunning := xGeometryDriveRunning, xPartAtEnd := xGeometryPartAtEnd,
		rSimulationTravel := GEOMETRY_SIM[uiGeometry].rTravel,
		Signals := stGeometrySignals, Config := GVL_GEOMETRY_CONTROL.astActiveConfig[uiGeometry],
		tTransport := GVL_GEOMETRY_CONTROL.tTransportTimeout, tFeedback := GVL_GEOMETRY_CONTROL.tDriveFeedbackTimeout,
		tResetPulse := GVL_GEOMETRY_CONTROL.tResetPulse,
		uiTimeFactor := SEL(GVL_CELL_SETTINGS.xSimulationAccelerationActive, UINT#1, GVL_CELL_SETTINGS.uiSimulationTimeFactorApplied),
		Memory := GVL_GEOMETRY_CONTROL.astActiveMemory[uiGeometry], Status => GVL_GEOMETRY_CONTROL.astStatus[uiGeometry],
		Warning => GVL_GEOMETRY_CONTROL.astWarning[uiGeometry]);
	GVL_GEOMETRY_CONTROL.astStatus[uiGeometry].xConfigAllowed := GVL_GEOMETRY_CONTROL.astStatus[uiGeometry].xConfigAllowed AND GVL_HMI.xPointEditorSaveAllowed;
	// Только доступность канала данных и лимитов; физическая карта, Home,
	// режим, ошибки, движение и состояние станции не ограничивают SAVE.
	GVL_GEOMETRY_CONTROL.astStatus[uiGeometry].xPointWriteAllowed := GVL_GEOMETRY_CONTROL.xSupported
		AND xHmiConnectionAlive AND GVL_POINT_MANAGER.PointManager.Diag.xXLimitValid
		AND GVL_POINT_MANAGER.PointManager.Diag.xYLimitValid
		AND GVL_POINT_MANAGER.PointManager.Diag.xZLimitValid;
	GVL_GEOMETRY_CONTROL.astStatus[uiGeometry].xSimulationAlarmAllowed := GVL_GEOMETRY_CONTROL.xSupported
		AND (GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.SIMULATION)
		AND GVL_CELL_SETTINGS.xErrorSimulationEnabled AND xHmiConnectionAlive;
	IF xGeometryRequestFresh AND NOT xGeometryStopAttempt
	AND (udiGeometryRequest <> UDINT#0) AND (udiGeometryRequest <> GVL_HMI.udiGeometryAckSeq)
	AND (stGeometryRequest.uiStation = uiGeometry) AND (stGeometryRequest.uiAction >= UINT#1) AND (stGeometryRequest.uiAction <= UINT#7) THEN
		IF GEOMETRY[uiGeometry].xCommandAccepted THEN GVL_HMI.uiGeometryResult := UINT#1; END_IF;
	END_IF;
	// Точки ГК независимы от механики/баз палет и от включения магазина.
	IF uiGeometry = UINT#1 THEN eGeometryPlace := E_POINT_NAME.GEOMETRY_1_PLACE; eGeometrySafe := E_POINT_NAME.GEOMETRY_1_SAFE; eGeometryChange := E_POINT_NAME.GEOMETRY_1_CHANGE;
	ELSE eGeometryPlace := E_POINT_NAME.GEOMETRY_2_PLACE; eGeometrySafe := E_POINT_NAME.GEOMETRY_2_SAFE; eGeometryChange := E_POINT_NAME.GEOMETRY_2_CHANGE; END_IF;
	GVL_POINT.Points[eGeometryPlace].X := GVL_GEOMETRY_CONTROL.astActiveConfig[uiGeometry].lrX;
	GVL_POINT.Points[eGeometryPlace].Y := GVL_GEOMETRY_CONTROL.astActiveConfig[uiGeometry].lrY;
	GVL_POINT.Points[eGeometryPlace].Z := GVL_GEOMETRY_CONTROL.astActiveConfig[uiGeometry].lrZ;
	GVL_POINT.Points[eGeometryPlace].MagazineSafeZ := GVL_GEOMETRY_CONTROL.astActiveConfig[uiGeometry].lrSafeZ;
	GVL_POINT.Points[eGeometryPlace].MagazineChangeZ := LREAL#0.0;
	GVL_POINT.Points[eGeometryPlace].SpeedFactor := GVL_GEOMETRY_CONTROL.astActiveConfig[uiGeometry].lrSpeedFactor;
	GVL_POINT.Points[eGeometryPlace].xConfigured := GVL_GEOMETRY_CONTROL.astActiveConfig[uiGeometry].xConfigured;
	GVL_POINT.Points[eGeometrySafe] := GVL_POINT.Points[eGeometryPlace];
	GVL_POINT.Points[eGeometrySafe].Z := GVL_POINT.Points[eGeometryPlace].Z + GVL_GEOMETRY_CONTROL.astActiveConfig[uiGeometry].lrSafeZ;
	GVL_POINT.Points[eGeometryChange] := GVL_POINT.Points[eGeometrySafe]; // Legacy CHANGE совпадает с SAFE_Z
END_FOR;
IF (udiGeometryRequest <> UDINT#0) AND (udiGeometryRequest <> GVL_HMI.udiGeometryAckSeq) THEN
	IF GVL_HMI.uiGeometryResult <> UINT#1 THEN
		GVL_GEOMETRY_CONTROL.stCellWarning.uiCode := UINT#51;
		GVL_GEOMETRY_CONTROL.stCellWarning.udiSequence := GVL_GEOMETRY_CONTROL.stCellWarning.udiSequence + UDINT#1;
	END_IF;
	GVL_HMI.udiGeometryAckSeq := udiGeometryRequest;
END_IF;
