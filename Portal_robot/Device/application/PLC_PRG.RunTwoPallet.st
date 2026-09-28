METHOD PRIVATE RunTwoPallet

// --- BEGIN IMPLEMENTATION ---

GVL_TWO_PALLET.xModeChanged := FALSE;
IF NOT xTwinSimulationInitialized THEN
	FOR uiTwin := 1 TO 2 DO
		// Числа используются только для виртуальных SoftMotion-осей.
		GVL_TWO_PALLET.astSimulationConfig[uiTwin].xConfigured := TRUE;
		GVL_TWO_PALLET.astSimulationConfig[uiTwin].xP1LockOut := TRUE;
		GVL_TWO_PALLET.axSimulationAutoSwapEnabled[uiTwin] := TRUE;
		GVL_TWO_PALLET.astSimulationConfig[uiTwin].lrExchange := 0.0;
		GVL_TWO_PALLET.astSimulationConfig[uiTwin].lrWorkP1 := 100.0;
		GVL_TWO_PALLET.astSimulationConfig[uiTwin].lrWorkP2 := 200.0;
		GVL_TWO_PALLET.astSimulationConfig[uiTwin].lrHome := 0.0;
		GVL_TWO_PALLET.astSimulationConfig[uiTwin].lrTolerance := 1.0;
		GVL_TWO_PALLET.astSimulationConfig[uiTwin].lrVelocity := 100.0;
		GVL_TWO_PALLET.astSimulationConfig[uiTwin].lrAcceleration := 200.0;
		GVL_TWO_PALLET.astSimulationConfig[uiTwin].lrDeceleration := 200.0;
		GVL_TWO_PALLET.astSimulationConfig[uiTwin].lrJerk := 1000.0;
		GVL_TWO_PALLET.astSimulationConfig[uiTwin].tCylinder := T#3S;
		GVL_TWO_PALLET.astSimulationConfig[uiTwin].tMove := T#20S;
		GVL_TWO_PALLET.astSimulationConfig[uiTwin].tHome := T#10S;
		GVL_TWO_PALLET.astSimulationConfig[uiTwin].tPulse := T#150MS;
	END_FOR;
	IF NOT GVL_TWO_PALLET.xAutoSwapDefaultsApplied THEN
		FOR uiTwin := 1 TO 2 DO
			GVL_TWO_PALLET.axAutoSwapEnabled[uiTwin] := TRUE;
		END_FOR;
		GVL_TWO_PALLET.xAutoSwapDefaultsApplied := TRUE;
	END_IF;
	xTwinSimulationInitialized := TRUE;
END_IF;
FOR uiTwin := 1 TO 2 DO
	GVL_TWO_PALLET.auiCommand[uiTwin] := UINT#0;
END_FOR;
IF NOT xTwinStartup THEN
	IF GVL_TWO_PALLET.uiMode = 0 THEN
		GVL_HMI.MagazinePitchX := GVL_TWO_PALLET.lrStaticPitchX;
		GVL_HMI.MagazinePitchY := GVL_TWO_PALLET.lrStaticPitchY;
	ELSE
		GVL_HMI.MagazinePitchX := GVL_TWO_PALLET.lrTwinPitchX;
		GVL_HMI.MagazinePitchY := GVL_TWO_PALLET.lrTwinPitchY;
	END_IF;
	FOR uiTwin := 1 TO 2 DO
		// После перезапуска содержимое сохранено, готовность загрузки подтверждается заново.
		GVL_TWO_PALLET.astStore[uiTwin].axLoaded[1] := FALSE;
		GVL_TWO_PALLET.astStore[uiTwin].axLoaded[2] := FALSE;
		IF GVL_TWO_PALLET.uiMode = 0 THEN
			GVL_DETAIL.astMagazine[uiTwin] := GVL_TWO_PALLET.astStatic[uiTwin];
		END_IF;
	END_FOR;
	xTwinStartup := TRUE;
END_IF;
GVL_TWO_PALLET.xModeChangeAllowed := GVL_CELL_CONTROL.xManual
	AND NOT GVL_CELL_MANAGER.Status.xRunning AND NOT GVL_ROBOT.Status.xBusy AND NOT xMotionBusy
	AND xHmiConnectionAlive AND NOT GVL_HMI.xTestSessionActive AND NOT GVL_ROBOT.Status.xBlankAvailable AND NOT GVL_ROBOT.Status.xDetailAvailable
	AND (GVL_ROBOT.Status.uiMagazineContext = 0)
	AND NOT GVL_MAGAZINE.astStatus[1].xEnabled AND NOT GVL_MAGAZINE.astStatus[2].xEnabled
	AND NOT GVL_MAGAZINE.astStatus[1].xBusy AND NOT GVL_MAGAZINE.astStatus[2].xBusy
	AND NOT GVL_TWO_PALLET.astStatus[1].xBusy AND NOT GVL_TWO_PALLET.astStatus[2].xBusy
	AND NOT GVL_TWO_PALLET.astInput[1].xPowered AND NOT GVL_TWO_PALLET.astInput[2].xPowered
	AND NOT GVL_TWO_PALLET.astStatus[1].xError AND NOT GVL_TWO_PALLET.astStatus[2].xError;

udiTwinSnapshot := GVL_HMI.udiTwinCommandSeq;
uiTwinRequestResult := 0;
xTwinInventoryCommand := FALSE;
IF (udiTwinSnapshot <> 0) AND (udiTwinSnapshot <> GVL_HMI.udiTwinAckSeq) THEN
	stTwinRequest := GVL_HMI.stTwinRequest;
	uiTwinRequestResult := 2; // Условие команды не выполнено
	IF (GVL_HMI.udiHmiCommandClockMs - GVL_HMI.udiTwinIssuedAtMs) > 2000 THEN
		uiTwinRequestResult := 4;
	ELSIF (stTwinRequest.uiMagazine = 0) AND (stTwinRequest.uiCommand = 25) THEN
		IF GVL_TWO_PALLET.xModeChangeAllowed AND (stTwinRequest.uiValue <= 1) AND xHmiConnectionAlive THEN
			IF GVL_TWO_PALLET.uiMode <> stTwinRequest.uiValue THEN
				IF GVL_TWO_PALLET.uiMode = 0 THEN
					GVL_TWO_PALLET.lrStaticPitchX := GVL_HMI.MagazinePitchX;
					GVL_TWO_PALLET.lrStaticPitchY := GVL_HMI.MagazinePitchY;
				ELSE
					GVL_TWO_PALLET.lrTwinPitchX := GVL_HMI.MagazinePitchX;
					GVL_TWO_PALLET.lrTwinPitchY := GVL_HMI.MagazinePitchY;
				END_IF;
				GVL_TWO_PALLET.uiMode := stTwinRequest.uiValue;
				GVL_TWO_PALLET.xModeChanged := TRUE;
				FOR uiTwin := 1 TO 2 DO
					IF GVL_TWO_PALLET.uiMode = 0 THEN GVL_DETAIL.astMagazine[uiTwin] := GVL_TWO_PALLET.astStatic[uiTwin]; END_IF;
					// Базы меняются вместе с механикой: старые координаты нельзя молча использовать.
					GVL_POINT.astRetainPoints[13 + uiTwin].xConfigured := FALSE;
				END_FOR;
				IF GVL_TWO_PALLET.uiMode = 0 THEN
					GVL_HMI.MagazinePitchX := GVL_TWO_PALLET.lrStaticPitchX; GVL_HMI.MagazinePitchY := GVL_TWO_PALLET.lrStaticPitchY;
				ELSE
					GVL_HMI.MagazinePitchX := GVL_TWO_PALLET.lrTwinPitchX; GVL_HMI.MagazinePitchY := GVL_TWO_PALLET.lrTwinPitchY;
				END_IF;
				xPointTableReady := FALSE;
			END_IF;
			uiTwinRequestResult := 1;
		END_IF;
	ELSIF (stTwinRequest.uiMagazine >= 1) AND (stTwinRequest.uiMagazine <= 2)
		AND (GVL_TWO_PALLET.uiMode = 1) THEN
		uiTwin := stTwinRequest.uiMagazine;
		IF ((stTwinRequest.uiCommand >= 1) AND (stTwinRequest.uiCommand <= 19))
			OR ((stTwinRequest.uiCommand >= 25) AND (stTwinRequest.uiCommand <= 32)) THEN
			GVL_TWO_PALLET.auiCommand[uiTwin] := stTwinRequest.uiCommand;
			GVL_TWO_PALLET.auiValue[uiTwin] := stTwinRequest.uiValue;
			GVL_TWO_PALLET.audiRevision[uiTwin] := stTwinRequest.udiRevision;
		ELSIF (stTwinRequest.uiCommand >= UINT#20)
			AND (stTwinRequest.uiCommand <= UINT#24) THEN
			xTwinInventoryCommand := TRUE; // Проверить по разрешениям текущего скана ПОСЛЕ вызова FB
		ELSIF stTwinRequest.uiCommand = UINT#33 THEN
			IF (stTwinRequest.uiValue <= UINT#1) AND xHmiConnectionAlive THEN
				IF GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.SIMULATION THEN
					GVL_TWO_PALLET.axSimulationAutoSwapEnabled[uiTwin] := stTwinRequest.uiValue = UINT#1;
				ELSE
					GVL_TWO_PALLET.axAutoSwapEnabled[uiTwin] := stTwinRequest.uiValue = UINT#1;
				END_IF;
				uiTwinRequestResult := UINT#1;
			END_IF;
		END_IF;
	END_IF;
END_IF;

FOR uiTwin := 1 TO 2 DO
	GVL_TWO_PALLET.astActiveConfig[uiTwin] := GVL_TWO_PALLET.astConfig[uiTwin];
	IF GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.SIMULATION THEN
		GVL_TWO_PALLET.astActiveConfig[uiTwin] := GVL_TWO_PALLET.astSimulationConfig[uiTwin];
		xTwinAutoSwapEnabled := GVL_TWO_PALLET.axSimulationAutoSwapEnabled[uiTwin];
	ELSE
		xTwinAutoSwapEnabled := GVL_TWO_PALLET.axAutoSwapEnabled[uiTwin];
	END_IF;
	// Старые RETAIN-параметры сохраняют прежнюю полярность до первой настройки
	// полных сочетаний. Нормализуем только рабочую копию, без записи в RETAIN.
	IF NOT GVL_TWO_PALLET.astActiveConfig[uiTwin].xSignalPatternsConfigured THEN
		GVL_TWO_PALLET.astActiveConfig[uiTwin].uiP1Signals := UINT#38;
		GVL_TWO_PALLET.astActiveConfig[uiTwin].uiP2Signals := UINT#26;
		IF GVL_TWO_PALLET.astActiveConfig[uiTwin].xP1LockOut THEN
			GVL_TWO_PALLET.astActiveConfig[uiTwin].uiP1Signals := UINT#26;
			GVL_TWO_PALLET.astActiveConfig[uiTwin].uiP2Signals := UINT#38;
		END_IF;
		GVL_TWO_PALLET.astActiveConfig[uiTwin].xSignalPatternsConfigured := TRUE;
	END_IF;
	// Legacy power/reset также проходит владельца механизма и его блокировки.
	IF (GVL_TWO_PALLET.auiCommand[uiTwin] = 0) AND (GVL_TWO_PALLET.uiMode = 1) THEN
		IF GVL_HMI.astMagazineCommand[uiTwin].xEnable THEN GVL_TWO_PALLET.auiCommand[uiTwin] := 1; END_IF;
		IF GVL_HMI.astMagazineCommand[uiTwin].xDisable OR GVL_CELL_CONTROL.xDisable THEN GVL_TWO_PALLET.auiCommand[uiTwin] := 3; END_IF;
		IF GVL_HMI.astMagazineCommand[uiTwin].xStop THEN GVL_TWO_PALLET.auiCommand[uiTwin] := 15; END_IF;
		IF GVL_HMI.astMagazineCommand[uiTwin].xReset
			OR (GVL_CELL_CONTROL.xReset AND GVL_TWO_PALLET.astStatus[uiTwin].xResetAllowed) THEN
			GVL_TWO_PALLET.auiCommand[uiTwin] := 16;
		END_IF;
	END_IF;

	// Единственное место преобразования транспортных номеров HMI в интерфейс FB.
	astTwinCommand[uiTwin].xEnable := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#1;
	astTwinCommand[uiTwin].xConfirm := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#2;
	astTwinCommand[uiTwin].xStart := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#27;
	astTwinCommand[uiTwin].xRejectStart := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#28;
	astTwinCommand[uiTwin].xDisable := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#3;
	astTwinCommand[uiTwin].xSwap := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#4;
	astTwinCommand[uiTwin].xPowerOn := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#5;
	astTwinCommand[uiTwin].xPowerOff := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#6;
	astTwinCommand[uiTwin].xDriveReset := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#7;
	astTwinCommand[uiTwin].xHome := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#8;
	astTwinCommand[uiTwin].xLower := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#9;
	astTwinCommand[uiTwin].xRaise := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#10;
	astTwinCommand[uiTwin].xSelectPallet := (GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#11)
		OR (GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#12);
	astTwinCommand[uiTwin].xLockIn := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#29;
	astTwinCommand[uiTwin].xLockOut := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#30;
	astTwinCommand[uiTwin].xStopIn := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#31;
	astTwinCommand[uiTwin].xStopOut := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#32;
	astTwinCommand[uiTwin].xMoveToExchange := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#13;
	astTwinCommand[uiTwin].xMoveToWork := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#14;
	astTwinCommand[uiTwin].xStop := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#15;
	astTwinCommand[uiTwin].xReset := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#16;
	astTwinCommand[uiTwin].xJogPositive := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#17;
	astTwinCommand[uiTwin].xJogNegative := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#18;
	astTwinCommand[uiTwin].xJogRelease := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#19;
	astTwinCommand[uiTwin].xTeachOperator := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#25;
	astTwinCommand[uiTwin].xTeachWork := GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#26;
	astTwinCommand[uiTwin].uiPallet := GVL_TWO_PALLET.auiValue[uiTwin];
	IF GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#11 THEN
		astTwinCommand[uiTwin].uiPallet := UINT#1;
	ELSIF GVL_TWO_PALLET.auiCommand[uiTwin] = UINT#12 THEN
		astTwinCommand[uiTwin].uiPallet := UINT#2;
	END_IF;
	astTwinCommand[uiTwin].udiRevision := GVL_TWO_PALLET.audiRevision[uiTwin];

	// xBusy не покрывает удерживаемый запрос и завершение Disable.
	// Занятость другого магазина/станка сама по себе не запрещает правку инвентаря.
	xTwinRobotOperation := GVL_MAGAZINE.astPartStatus[uiTwin].xBusy
		OR GVL_MAGAZINE.astPartStatus[uiTwin].xDisablePending
		OR GVL_MAGAZINE.astAutoCommand[uiTwin].xExecute
		OR GVL_MAGAZINE.astCommand[uiTwin].xExecute
		OR ((GVL_ROBOT.Status.xBusy OR xMotionBusy)
			AND (GVL_ROBOT.Status.uiMagazineContext = uiTwin));
	xTwinRobotClear := NOT GVL_ROBOT.Status.xBusy AND NOT xMotionBusy
		AND NOT xTwinRobotOperation
		AND GVL_CELL_MANAGER.Status.xMagazineExchangeAllowed
		AND NOT GVL_MACHINE.Status[1].xBusy AND NOT GVL_MACHINE.Status[2].xBusy AND NOT GVL_MACHINE.Status[3].xBusy
		AND NOT GVL_ROBOT.Status.xError AND xRobotInterfaceReady
		AND (GVL_ROBOT.Status.eCurrentPoint <> E_POINT_NAME.NONE)
		AND (GVL_ROBOT.Status.uiMagazineContext <> uiTwin)
		AND (GVL_ROBOT.Status.eCurrentPoint <> E_POINT_NAME.MAGAZINE_CHANGE)
		AND (GVL_ROBOT.Status.eCurrentPoint <> E_POINT_NAME.MAGAZINE_IN_SLOT);
	xTwinOtherLoaded := FALSE;
	IF (GVL_TWO_PALLET.astStatus[uiTwin].uiRobotPallet >= UINT#1)
		AND (GVL_TWO_PALLET.astStatus[uiTwin].uiRobotPallet <= UINT#2) THEN
		uiTwinPallet := UINT#3 - GVL_TWO_PALLET.astStatus[uiTwin].uiRobotPallet;
		xTwinOtherLoaded := GVL_TWO_PALLET.astStore[uiTwin].axLoaded[uiTwinPallet];
	END_IF;
	// Запрос сохраняет цикл, пока робот и автоматы освобождают окно обмена.
	// Готовность зоны проверяет FB_TWO_PALLET; она не должна терять сам запрос.
	axTwinAutoSwapPending[uiTwin] := (GVL_TWO_PALLET.uiMode = UINT#1)
		AND GVL_CELL_MANAGER.Status.xRunning
		AND NOT GVL_CELL_MANAGER.Status.xStopPending
		AND NOT GVL_CELL_CONTROL.xStop
		AND NOT GVL_CELL_CONTROL.xManual
		AND GVL_MAGAZINE.astPartStatus[uiTwin].xFinished
		AND xTwinAutoSwapEnabled
		AND xTwinOtherLoaded
		AND NOT astTwinCommand[uiTwin].xDisable
		AND NOT astTwinCommand[uiTwin].xStop;
	TWIN[uiTwin](
		xSelected := GVL_TWO_PALLET.uiMode = 1,
		xManual := GVL_CELL_CONTROL.xManual AND NOT GVL_CELL_MANAGER.Status.xRunning,
		xSafe := CELL_SAFETY.Status.xReady AND NOT GVL_CELL_CONTROL.xGlobalError
			AND CELL_SAFETY.astEnclosureDoorStatus[uiTwin * 2 - 1].xLocked
			AND CELL_SAFETY.astEnclosureDoorStatus[uiTwin * 2].xLocked
			AND NOT CELL_SAFETY.astEnclosureDoorStatus[uiTwin * 2 - 1].xUnlockOutput
			AND NOT CELL_SAFETY.astEnclosureDoorStatus[uiTwin * 2].xUnlockOutput,
		xRobotClear := xTwinRobotClear,
		xRobotIdle := NOT GVL_ROBOT.Status.xBusy AND NOT xMotionBusy,
		xRobotOperation := xTwinRobotOperation,
		xRobotGeometryReady := NOT GVL_HMI.xModbusMode AND xPointTableReady,
		xRobotMagazineReady := GVL_MAGAZINE.astPartStatus[uiTwin].xEnableCheckNoError
			AND GVL_MAGAZINE.astPartStatus[uiTwin].xEnableCheckGeometry,
		xConnection := xHmiConnectionAlive,
		xStopRequest := GVL_CELL_CONTROL.xStop OR GVL_HMI.astMagazineCommand[uiTwin].xStop OR GVL_TWO_PALLET.xModeChanged,
		xAutoSwap := axTwinAutoSwapPending[uiTwin],
		xOtherLoaded := xTwinOtherLoaded,
		xActivePalletEditAllowed := NOT xTwinRobotOperation,
		xConfigurationChanged := axTwinConfigurationChanged[uiTwin],
		xExternalCommandRejected := axTwinExternalCommandRejected[uiTwin],
		Command := astTwinCommand[uiTwin],
		Config := GVL_TWO_PALLET.astActiveConfig[uiTwin], Input := GVL_TWO_PALLET.astInput[uiTwin],
		Status => GVL_TWO_PALLET.astStatus[uiTwin],
		Diag => GVL_TWO_PALLET.astDiag[uiTwin],
		Error => GVL_TWO_PALLET.astError[uiTwin],
		Output => GVL_TWO_PALLET.astOutput[uiTwin]);
	GVL_TWO_PALLET.astStatus[uiTwin].xAutoSwapEnabled := xTwinAutoSwapEnabled;
	// После Disable, Stop или аварии ожидание обмена не удерживает планировщик.
	axTwinAutoSwapPending[uiTwin] := axTwinAutoSwapPending[uiTwin]
		AND GVL_TWO_PALLET.astStatus[uiTwin].xEnabled
		AND NOT GVL_TWO_PALLET.astStatus[uiTwin].xError;
	axTwinConfigurationChanged[uiTwin] := FALSE;
	axTwinExternalCommandRejected[uiTwin] := FALSE;
	IF GVL_TWO_PALLET.astOutput[uiTwin].xTeachOperator THEN
		IF GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.SIMULATION THEN
			GVL_TWO_PALLET.astSimulationConfig[uiTwin].lrExchange := GVL_TWO_PALLET.astInput[uiTwin].lrPosition;
		ELSE
			GVL_TWO_PALLET.astConfig[uiTwin].lrExchange := GVL_TWO_PALLET.astInput[uiTwin].lrPosition;
		END_IF;
		axTwinConfigurationChanged[uiTwin] := TRUE;
	END_IF;
	IF GVL_TWO_PALLET.astOutput[uiTwin].xTeachWork THEN
		IF GVL_TWO_PALLET.astStatus[uiTwin].uiSelected = UINT#1 THEN
			IF GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.SIMULATION THEN
				GVL_TWO_PALLET.astSimulationConfig[uiTwin].lrWorkP1 := GVL_TWO_PALLET.astInput[uiTwin].lrPosition;
			ELSE
				GVL_TWO_PALLET.astConfig[uiTwin].lrWorkP1 := GVL_TWO_PALLET.astInput[uiTwin].lrPosition;
			END_IF;
		ELSIF GVL_TWO_PALLET.astStatus[uiTwin].uiSelected = UINT#2 THEN
			IF GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.SIMULATION THEN
				GVL_TWO_PALLET.astSimulationConfig[uiTwin].lrWorkP2 := GVL_TWO_PALLET.astInput[uiTwin].lrPosition;
			ELSE
				GVL_TWO_PALLET.astConfig[uiTwin].lrWorkP2 := GVL_TWO_PALLET.astInput[uiTwin].lrPosition;
			END_IF;
		END_IF;
		axTwinConfigurationChanged[uiTwin] := TRUE;
	END_IF;
	// RunCellControl ниже должен видеть запрет уже в скане начала обмена.
	IF GVL_TWO_PALLET.uiMode = 1 THEN
		GVL_MAGAZINE.astStatus[uiTwin].xReady := GVL_MAGAZINE.astPartStatus[uiTwin].xReady
			AND GVL_TWO_PALLET.astStatus[uiTwin].xReady;
		GVL_MAGAZINE.astStatus[uiTwin].xBusy := GVL_MAGAZINE.astPartStatus[uiTwin].xBusy
			OR GVL_TWO_PALLET.astStatus[uiTwin].xBusy;
		GVL_MAGAZINE.astStatus[uiTwin].xEnabled := GVL_TWO_PALLET.astStatus[uiTwin].xEnabled;
	END_IF;
	IF GVL_TWO_PALLET.astStatus[uiTwin].xCompleted THEN
		GVL_TWO_PALLET.astStore[uiTwin].axLoaded[1] := FALSE;
		GVL_TWO_PALLET.astStore[uiTwin].axLoaded[2] := FALSE;
	END_IF;
	IF (uiTwinRequestResult = 2) AND (stTwinRequest.uiMagazine = uiTwin)
		AND (((stTwinRequest.uiCommand >= 1) AND (stTwinRequest.uiCommand <= 19))
			OR ((stTwinRequest.uiCommand >= 25) AND (stTwinRequest.uiCommand <= 32)))
		AND GVL_TWO_PALLET.astStatus[uiTwin].xCommandAccepted THEN uiTwinRequestResult := 1; END_IF;
END_FOR;

IF xTwinInventoryCommand THEN
	uiTwin := stTwinRequest.uiMagazine;
	uiTwinPallet := stTwinRequest.uiValue;
	IF stTwinRequest.uiCommand = UINT#24 THEN
		IF GVL_TWO_PALLET.astStatus[uiTwin].xConfigAllowed
			AND stTwinRequest.Config.xSignalPatternsConfigured
			AND TWIN[uiTwin].IsSignalConfigurationValid(
				uiP1Signals := stTwinRequest.Config.uiP1Signals,
				uiP2Signals := stTwinRequest.Config.uiP2Signals) THEN
			IF GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.SIMULATION THEN
				GVL_TWO_PALLET.astSimulationConfig[uiTwin] := stTwinRequest.Config;
			ELSE
				GVL_TWO_PALLET.astConfig[uiTwin] := stTwinRequest.Config;
			END_IF;
			axTwinConfigurationChanged[uiTwin] := TRUE;
			uiTwinRequestResult := UINT#1;
		END_IF;
	ELSIF ((uiTwinPallet = 1) AND GVL_TWO_PALLET.astStatus[uiTwin].xEdit1Allowed)
		OR ((uiTwinPallet = 2) AND GVL_TWO_PALLET.astStatus[uiTwin].xEdit2Allowed) THEN
		CASE stTwinRequest.uiCommand OF
			20: GVL_TWO_PALLET.astStore[uiTwin].axLoaded[uiTwinPallet] := TRUE; uiTwinRequestResult := 1;
			21, 22:
				FOR uiTwinSlot := 1 TO 96 DO
					GVL_TWO_PALLET.astStore[uiTwin].astPallet[uiTwinPallet].aSlots[uiTwinSlot].xInPosition := stTwinRequest.uiCommand = 22;
					GVL_TWO_PALLET.astStore[uiTwin].astPallet[uiTwinPallet].aSlots[uiTwinSlot].eDetailType := E_DETAIL_TYPE.NONE;
					GVL_TWO_PALLET.astStore[uiTwin].astPallet[uiTwinPallet].aSlots[uiTwinSlot].uiProductType := 0;
					IF stTwinRequest.uiCommand = 22 THEN
						GVL_TWO_PALLET.astStore[uiTwin].astPallet[uiTwinPallet].aSlots[uiTwinSlot].eDetailType := E_DETAIL_TYPE.BLANK;
						GVL_TWO_PALLET.astStore[uiTwin].astPallet[uiTwinPallet].aSlots[uiTwinSlot].uiProductType := GVL_MULTI_TYPE.Config.auiSlotType[uiTwinSlot];
					END_IF;
				END_FOR;
				GVL_TWO_PALLET.astStore[uiTwin].axLoaded[uiTwinPallet] := FALSE; uiTwinRequestResult := 1;
			23:
				IF (stTwinRequest.uiSlot >= 1) AND (stTwinRequest.uiSlot <= 96) AND (stTwinRequest.uiContent <= 2)
					AND ((stTwinRequest.uiContent = 0) OR ((stTwinRequest.uiProductType >= 1) AND (stTwinRequest.uiProductType <= GVL_MULTI_TYPE.Config.uiTypeCount))) THEN
					uiTwinSlot := stTwinRequest.uiSlot;
					GVL_TWO_PALLET.astStore[uiTwin].astPallet[uiTwinPallet].aSlots[uiTwinSlot].xInPosition := stTwinRequest.uiContent <> 0;
					CASE stTwinRequest.uiContent OF
						0: GVL_TWO_PALLET.astStore[uiTwin].astPallet[uiTwinPallet].aSlots[uiTwinSlot].eDetailType := E_DETAIL_TYPE.NONE;
						1: GVL_TWO_PALLET.astStore[uiTwin].astPallet[uiTwinPallet].aSlots[uiTwinSlot].eDetailType := E_DETAIL_TYPE.BLANK;
						2: GVL_TWO_PALLET.astStore[uiTwin].astPallet[uiTwinPallet].aSlots[uiTwinSlot].eDetailType := E_DETAIL_TYPE.DETAIL;
					END_CASE;
					GVL_TWO_PALLET.astStore[uiTwin].astPallet[uiTwinPallet].aSlots[uiTwinSlot].uiProductType := stTwinRequest.uiProductType;
					GVL_TWO_PALLET.astStore[uiTwin].axLoaded[uiTwinPallet] := FALSE; uiTwinRequestResult := 1;
				END_IF;
		END_CASE;
	END_IF;
END_IF;
IF uiTwinRequestResult <> 0 THEN
	GVL_HMI.uiTwinResult := uiTwinRequestResult;
	GVL_HMI.udiTwinAckSeq := udiTwinSnapshot;
	IF uiTwinRequestResult <> 1 THEN
		uiTwin := LIMIT(UINT#1, stTwinRequest.uiMagazine, UINT#2);
		// Команды механизма 1..19 и 25..28 уже формируют предупреждение внутри FB в этом же скане.
		IF GVL_TWO_PALLET.auiCommand[uiTwin] <> stTwinRequest.uiCommand THEN
			axTwinExternalCommandRejected[uiTwin] := TRUE;
		END_IF;
	END_IF;
END_IF;

GVL_CELL_SETTINGS.MagazineRows := 12;
GVL_CELL_SETTINGS.MagazineColumns := 10;
IF GVL_TWO_PALLET.uiMode = 1 THEN GVL_CELL_SETTINGS.MagazineRows := 12; GVL_CELL_SETTINGS.MagazineColumns := 8; END_IF;
GVL_HMI.MagazineRows := GVL_CELL_SETTINGS.MagazineRows;
GVL_HMI.MagazineColumns := GVL_CELL_SETTINGS.MagazineColumns;
FOR uiTwin := 1 TO 2 DO
	IF GVL_TWO_PALLET.uiMode = 1 THEN
		uiTwinPallet := GVL_TWO_PALLET.astStatus[uiTwin].uiRobotPallet;
		IF (uiTwinPallet < UINT#1) OR (uiTwinPallet > UINT#2) THEN
			uiTwinPallet := UINT#1;
		END_IF;
		GVL_DETAIL.astMagazine[uiTwin] := GVL_TWO_PALLET.astStore[uiTwin].astPallet[uiTwinPallet];
	END_IF;
END_FOR;
