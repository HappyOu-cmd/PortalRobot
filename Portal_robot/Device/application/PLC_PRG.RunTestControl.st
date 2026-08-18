METHOD PRIVATE RunTestControl

// --- BEGIN IMPLEMENTATION ---

// Test environment is independent from the robot control interface.
rtTestEnvironmentApply(CLK := GVL_HMI.xTestEnvironmentApply);
rtTestSpeedProfileApply(CLK := GVL_HMI.xTestSpeedProfileApply);
rtTestScenarioApply(CLK := GVL_HMI.xTestScenarioApply);
xTestInitializePulse := FALSE;

xTestStable := NOT GVL_CELL_MANAGER.Status.xRunning
	AND NOT GVL_ROBOT.Status.xBusy
	AND NOT GVL_MAGAZINE.astStatus[1].xBusy
	AND NOT GVL_MAGAZINE.astStatus[2].xBusy
	AND NOT xMotionBusy;
FOR uiTestIndex := UINT#1 TO UINT#3 DO
	xTestStable := xTestStable
		AND NOT GVL_MACHINE.Status[uiTestIndex].xBusy
		AND NOT GVL_MACHINE.Status[uiTestIndex].xProcessing;
END_FOR;

GVL_HMI.xTestEnvironmentChangeAllowed := xTestStable;
GVL_HMI.xTestScenarioApplyAllowed := xTestStable
	AND GVL_HMI.xTestSessionActive
	AND (GVL_CELL_SETTINGS.eTestEnvironment <> E_CELL_TEST_ENVIRONMENT.NORMAL)
	AND ((GVL_CELL_SETTINGS.eTestEnvironment <> E_CELL_TEST_ENVIRONMENT.SC500_BENCH)
		OR GVL_TEST_IO.xSc500BenchKeyInput)
	AND ((GVL_CELL_SETTINGS.eTestEnvironment <> E_CELL_TEST_ENVIRONMENT.SIMULATION)
		OR NOT GVL_ROBOT_MODBUS.xModeActive
		OR GVL_ROBOT_MODBUS.Status.xSimulatorActive);
GVL_HMI.xSc500BenchKeyActive := GVL_TEST_IO.xSc500BenchKeyInput;

IF rtTestEnvironmentApply.Q THEN
	GVL_HMI.uiTestRejectReason := UINT#0;
	IF NOT GVL_HMI.xTestEnvironmentChangeAllowed THEN
		GVL_HMI.uiTestRejectReason := UINT#1; // equipment is not idle
	ELSIF GVL_HMI.uiTestEnvironmentRequest > UINT#2 THEN
		GVL_HMI.uiTestRejectReason := UINT#2; // invalid environment
	ELSIF (GVL_HMI.uiTestEnvironmentRequest = UINT#2)
	AND (NOT GVL_ROBOT_MODBUS.xModeActive OR NOT GVL_TEST_IO.xSc500BenchKeyInput) THEN
		GVL_HMI.uiTestRejectReason := UINT#3; // bench requires Modbus and physical key
	ELSIF (GVL_HMI.uiTestEnvironmentRequest = UINT#1)
	AND GVL_ROBOT_MODBUS.xModeActive
	AND NOT GVL_ROBOT_MODBUS.Status.xSimulatorActive THEN
		GVL_HMI.uiTestRejectReason := UINT#4; // Python simulator marker missing
	ELSE
		CASE GVL_HMI.uiTestEnvironmentRequest OF
			UINT#0: GVL_CELL_SETTINGS.eTestEnvironment := E_CELL_TEST_ENVIRONMENT.NORMAL;
			UINT#1: GVL_CELL_SETTINGS.eTestEnvironment := E_CELL_TEST_ENVIRONMENT.SIMULATION;
			UINT#2: GVL_CELL_SETTINGS.eTestEnvironment := E_CELL_TEST_ENVIRONMENT.SC500_BENCH;
		END_CASE;
		GVL_CELL_SETTINGS.eTestSpeedProfile := E_TEST_SPEED_PROFILE.REALTIME;
		xSc500BenchKeyLost := FALSE;
	END_IF;
END_IF;

IF rtTestSpeedProfileApply.Q THEN
	IF (GVL_HMI.uiTestSpeedProfileRequest <= UINT#1)
	AND (GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.SIMULATION)
	AND xTestStable THEN
		IF GVL_HMI.uiTestSpeedProfileRequest = UINT#1 THEN
			GVL_CELL_SETTINGS.eTestSpeedProfile := E_TEST_SPEED_PROFILE.FAST;
		ELSE
			GVL_CELL_SETTINGS.eTestSpeedProfile := E_TEST_SPEED_PROFILE.REALTIME;
		END_IF;
	ELSE
		GVL_HMI.uiTestRejectReason := UINT#5; // FAST is simulation-only
	END_IF;
END_IF;

// Losing the physical key does not interrupt the current SC-500 command.
// As soon as it finishes, robot readiness is removed and no next command can start.
IF (GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.SC500_BENCH)
AND NOT GVL_TEST_IO.xSc500BenchKeyInput THEN
	xSc500BenchKeyLost := TRUE;
	IF NOT GVL_ROBOT_MODBUS.Status.xBusy THEN
		xRobotInterfaceReady := FALSE;
		xDrivesReady := FALSE;
	END_IF;
END_IF;

IF rtTestScenarioApply.Q THEN
	GVL_HMI.uiTestScenarioResult := UINT#0;
	xTestScenarioValid := GVL_HMI.stTestScenario.udiLoadSeq <> UDINT#0
		AND (GVL_HMI.stTestScenario.uiTypeCount >= UINT#1)
		AND (GVL_HMI.stTestScenario.uiTypeCount <= UINT#3);
	FOR uiTestIndex := UINT#1 TO UINT#3 DO
		xTestScenarioValid := xTestScenarioValid
			AND (GVL_HMI.stTestScenario.auiMachineState[uiTestIndex] <= UINT#3)
			AND (GVL_HMI.stTestScenario.auiMachineType[uiTestIndex] >= UINT#1)
			AND (GVL_HMI.stTestScenario.auiMachineType[uiTestIndex]
				<= GVL_HMI.stTestScenario.uiTypeCount);
	END_FOR;
	FOR uiTestIndex := UINT#1 TO UINT#120 DO
		xTestScenarioValid := xTestScenarioValid
			AND (GVL_HMI.stTestScenario.auiSlotContent[uiTestIndex] <= UINT#2)
			AND (GVL_HMI.stTestScenario.auiSlotType[uiTestIndex] >= UINT#1)
			AND (GVL_HMI.stTestScenario.auiSlotType[uiTestIndex]
				<= GVL_HMI.stTestScenario.uiTypeCount);
	END_FOR;
	uiTestFaultOwnerCount := UINT#0;
	IF GVL_HMI.stTestScenario.dwCellFaultMask <> DWORD#0 THEN
		uiTestFaultOwnerCount := uiTestFaultOwnerCount + UINT#1;
	END_IF;
	IF GVL_HMI.stTestScenario.dwRobotFaultMask <> DWORD#0 THEN
		uiTestFaultOwnerCount := uiTestFaultOwnerCount + UINT#1;
	END_IF;
	IF GVL_HMI.stTestScenario.dwMagazineFaultMask <> DWORD#0 THEN
		uiTestFaultOwnerCount := uiTestFaultOwnerCount + UINT#1;
	END_IF;
	FOR uiTestIndex := UINT#1 TO UINT#3 DO
		IF GVL_HMI.stTestScenario.adwMachineFaultMask[uiTestIndex] <> DWORD#0 THEN
			uiTestFaultOwnerCount := uiTestFaultOwnerCount + UINT#1;
		END_IF;
		xTestScenarioValid := xTestScenarioValid
			AND (GVL_HMI.stTestScenario.adwMachineFaultMask[uiTestIndex] <= DWORD#16#0000_07FF);
	END_FOR;
	xTestScenarioValid := xTestScenarioValid
		AND (uiTestFaultOwnerCount <= UINT#1)
		AND (GVL_HMI.stTestScenario.dwCellFaultMask <= DWORD#16#0000_0001)
		AND (GVL_HMI.stTestScenario.dwRobotFaultMask <= DWORD#16#0000_01FF)
		AND (GVL_HMI.stTestScenario.dwMagazineFaultMask <= DWORD#16#0000_003F)
		AND (GVL_HMI.stTestScenario.auiGripperContent[1] <= UINT#1)
		AND ((GVL_HMI.stTestScenario.auiGripperContent[1] = UINT#0)
			= (GVL_HMI.stTestScenario.auiGripperType[1] = UINT#0))
		AND (GVL_HMI.stTestScenario.auiGripperType[1]
			<= GVL_HMI.stTestScenario.uiTypeCount)
		AND ((GVL_HMI.stTestScenario.auiGripperContent[2] = UINT#0)
			OR (GVL_HMI.stTestScenario.auiGripperContent[2] = UINT#2))
		AND ((GVL_HMI.stTestScenario.auiGripperContent[2] = UINT#0)
			= (GVL_HMI.stTestScenario.auiGripperType[2] = UINT#0))
		AND (GVL_HMI.stTestScenario.auiGripperType[2]
			<= GVL_HMI.stTestScenario.uiTypeCount);

	IF NOT GVL_HMI.xTestScenarioApplyAllowed THEN
		GVL_HMI.uiTestScenarioResult := UINT#1;
	ELSIF NOT xTestScenarioValid OR (GVL_HMI.stTestScenario.uiOrientation > UINT#1) THEN
		GVL_HMI.uiTestScenarioResult := UINT#2;
	ELSE
		FOR uiTestIndex := UINT#1 TO UINT#120 DO
			// Сценарий задаёт Zone 2 магазина 1. Все остальные зоны
			// очищаются, чтобы изделия не перетекали между тестами.
			GVL_DETAIL.astMagazine[1].aZone1[uiTestIndex].xInPosition := FALSE;
			GVL_DETAIL.astMagazine[1].aZone1[uiTestIndex].eDetailType := E_DETAIL_TYPE.NONE;
			GVL_DETAIL.astMagazine[1].aZone1[uiTestIndex].uiProductType := UINT#0;
			GVL_DETAIL.astMagazine[2].aZone1[uiTestIndex].xInPosition := FALSE;
			GVL_DETAIL.astMagazine[2].aZone1[uiTestIndex].eDetailType := E_DETAIL_TYPE.NONE;
			GVL_DETAIL.astMagazine[2].aZone1[uiTestIndex].uiProductType := UINT#0;
			GVL_DETAIL.astMagazine[2].aZone2[uiTestIndex].xInPosition := FALSE;
			GVL_DETAIL.astMagazine[2].aZone2[uiTestIndex].eDetailType := E_DETAIL_TYPE.NONE;
			GVL_DETAIL.astMagazine[2].aZone2[uiTestIndex].uiProductType := UINT#0;
			IF uiTestIndex <= UINT#60 THEN
				GVL_DETAIL.astMagazine[1].aZone3[uiTestIndex].xInPosition := FALSE;
				GVL_DETAIL.astMagazine[1].aZone3[uiTestIndex].eDetailType := E_DETAIL_TYPE.NONE;
				GVL_DETAIL.astMagazine[1].aZone3[uiTestIndex].uiProductType := UINT#0;
				GVL_DETAIL.astMagazine[2].aZone3[uiTestIndex].xInPosition := FALSE;
				GVL_DETAIL.astMagazine[2].aZone3[uiTestIndex].eDetailType := E_DETAIL_TYPE.NONE;
				GVL_DETAIL.astMagazine[2].aZone3[uiTestIndex].uiProductType := UINT#0;
			END_IF;
			GVL_DETAIL.astMagazine[1].aZone2[uiTestIndex].xInPosition :=
				GVL_HMI.stTestScenario.auiSlotContent[uiTestIndex] <> UINT#0;
			CASE GVL_HMI.stTestScenario.auiSlotContent[uiTestIndex] OF
				UINT#1: GVL_DETAIL.astMagazine[1].aZone2[uiTestIndex].eDetailType := E_DETAIL_TYPE.BLANK;
				UINT#2: GVL_DETAIL.astMagazine[1].aZone2[uiTestIndex].eDetailType := E_DETAIL_TYPE.DETAIL;
			ELSE
				GVL_DETAIL.astMagazine[1].aZone2[uiTestIndex].eDetailType := E_DETAIL_TYPE.NONE;
			END_CASE;
			IF GVL_HMI.stTestScenario.auiSlotContent[uiTestIndex] = UINT#0 THEN
				GVL_DETAIL.astMagazine[1].aZone2[uiTestIndex].uiProductType := UINT#0;
			ELSE
				GVL_DETAIL.astMagazine[1].aZone2[uiTestIndex].uiProductType :=
					GVL_HMI.stTestScenario.auiSlotType[uiTestIndex];
			END_IF;
		END_FOR;
		// Начальные инъекции: маски переводятся в существующий диагностический
		// контракт, а не обходят владельцев ошибок.
		GVL_HMI.xSimCellBothGrippers :=
			(GVL_HMI.stTestScenario.dwCellFaultMask AND DWORD#16#0000_0001) <> DWORD#0;
		GVL_HMI.xSimRobotWrongAction :=
			(GVL_HMI.stTestScenario.dwRobotFaultMask AND DWORD#16#0000_0001) <> DWORD#0;
		GVL_HMI.xSimGripper1Fault :=
			(GVL_HMI.stTestScenario.dwRobotFaultMask AND DWORD#16#0000_0002) <> DWORD#0;
		GVL_HMI.xSimGripper2Fault :=
			(GVL_HMI.stTestScenario.dwRobotFaultMask AND DWORD#16#0000_0004) <> DWORD#0;
		GVL_HMI.xSimGripperRotationFault :=
			(GVL_HMI.stTestScenario.dwRobotFaultMask AND DWORD#16#0000_0008) <> DWORD#0;
		GVL_HMI.xSimGripperGlobalFault :=
			(GVL_HMI.stTestScenario.dwRobotFaultMask AND DWORD#16#0000_0010) <> DWORD#0;
		GVL_HMI.xSimPointXOutOfLimit :=
			(GVL_HMI.stTestScenario.dwRobotFaultMask AND DWORD#16#0000_0020) <> DWORD#0;
		GVL_HMI.xSimPointYOutOfLimit :=
			(GVL_HMI.stTestScenario.dwRobotFaultMask AND DWORD#16#0000_0040) <> DWORD#0;
		GVL_HMI.xSimPointZOutOfLimit :=
			(GVL_HMI.stTestScenario.dwRobotFaultMask AND DWORD#16#0000_0080) <> DWORD#0;
		GVL_HMI.xSimPointInvalidVelocity :=
			(GVL_HMI.stTestScenario.dwRobotFaultMask AND DWORD#16#0000_0100) <> DWORD#0;
		GVL_HMI.xSimMagazineWrongOperation :=
			(GVL_HMI.stTestScenario.dwMagazineFaultMask AND DWORD#16#0000_0001) <> DWORD#0;
		GVL_HMI.xSimMagazineNoBlank :=
			(GVL_HMI.stTestScenario.dwMagazineFaultMask AND DWORD#16#0000_0002) <> DWORD#0;
		GVL_HMI.xSimMagazineNoFreeSlot :=
			(GVL_HMI.stTestScenario.dwMagazineFaultMask AND DWORD#16#0000_0004) <> DWORD#0;
		GVL_HMI.xSimMagazineInvalidSlot :=
			(GVL_HMI.stTestScenario.dwMagazineFaultMask AND DWORD#16#0000_0008) <> DWORD#0;
		GVL_HMI.xSimMagazineSlotContent :=
			(GVL_HMI.stTestScenario.dwMagazineFaultMask AND DWORD#16#0000_0010) <> DWORD#0;
		GVL_HMI.xSimMagazineGeometry :=
			(GVL_HMI.stTestScenario.dwMagazineFaultMask AND DWORD#16#0000_0020) <> DWORD#0;
		FOR uiTestIndex := UINT#1 TO UINT#3 DO
			GVL_HMI.axMachineSimAlarm[uiTestIndex] :=
				(GVL_HMI.stTestScenario.adwMachineFaultMask[uiTestIndex] AND DWORD#16#0000_0001) <> DWORD#0;
			GVL_HMI.axMachineSimDoorFault[uiTestIndex] :=
				(GVL_HMI.stTestScenario.adwMachineFaultMask[uiTestIndex] AND DWORD#16#0000_0002) <> DWORD#0;
			GVL_HMI.axMachineSimChuckFault[uiTestIndex] :=
				(GVL_HMI.stTestScenario.adwMachineFaultMask[uiTestIndex] AND DWORD#16#0000_0004) <> DWORD#0;
			GVL_HMI.axMachineTimeoutRobotMove[uiTestIndex] :=
				(GVL_HMI.stTestScenario.adwMachineFaultMask[uiTestIndex] AND DWORD#16#0000_0008) <> DWORD#0;
			GVL_HMI.axMachineTimeoutRobotAction[uiTestIndex] :=
				(GVL_HMI.stTestScenario.adwMachineFaultMask[uiTestIndex] AND DWORD#16#0000_0010) <> DWORD#0;
			GVL_HMI.axMachineTimeoutRobotRelease[uiTestIndex] :=
				(GVL_HMI.stTestScenario.adwMachineFaultMask[uiTestIndex] AND DWORD#16#0000_0020) <> DWORD#0;
			GVL_HMI.axMachineTimeoutDoorOpen[uiTestIndex] :=
				(GVL_HMI.stTestScenario.adwMachineFaultMask[uiTestIndex] AND DWORD#16#0000_0040) <> DWORD#0;
			GVL_HMI.axMachineTimeoutDoorClose[uiTestIndex] :=
				(GVL_HMI.stTestScenario.adwMachineFaultMask[uiTestIndex] AND DWORD#16#0000_0080) <> DWORD#0;
			GVL_HMI.axMachineTimeoutChuckOpen[uiTestIndex] :=
				(GVL_HMI.stTestScenario.adwMachineFaultMask[uiTestIndex] AND DWORD#16#0000_0100) <> DWORD#0;
			GVL_HMI.axMachineTimeoutChuckClose[uiTestIndex] :=
				(GVL_HMI.stTestScenario.adwMachineFaultMask[uiTestIndex] AND DWORD#16#0000_0200) <> DWORD#0;
			GVL_HMI.axMachineTimeoutCycleStart[uiTestIndex] :=
				(GVL_HMI.stTestScenario.adwMachineFaultMask[uiTestIndex] AND DWORD#16#0000_0400) <> DWORD#0;
		END_FOR;
		GVL_HMI.xErrorSimulationEnable :=
			(GVL_HMI.stTestScenario.dwCellFaultMask <> DWORD#0)
			OR (GVL_HMI.stTestScenario.dwRobotFaultMask <> DWORD#0)
			OR (GVL_HMI.stTestScenario.dwMagazineFaultMask <> DWORD#0)
			OR (GVL_HMI.stTestScenario.adwMachineFaultMask[1] <> DWORD#0)
			OR (GVL_HMI.stTestScenario.adwMachineFaultMask[2] <> DWORD#0)
			OR (GVL_HMI.stTestScenario.adwMachineFaultMask[3] <> DWORD#0);
		xTestInitializePulse := TRUE;
	END_IF;
	// Ack подтверждает обработку конкретного LoadSeq даже при отклонении.
	GVL_HMI.udiTestScenarioAckSeq := GVL_HMI.stTestScenario.udiLoadSeq;
END_IF;

GVL_HMI.uiTestEnvironmentApplied := TO_UINT(GVL_CELL_SETTINGS.eTestEnvironment);
GVL_HMI.uiTestSpeedProfileApplied := TO_UINT(GVL_CELL_SETTINGS.eTestSpeedProfile);
GVL_HMI.xSc500BenchKeyLost := xSc500BenchKeyLost;
IF GVL_CELL_SETTINGS.eTestEnvironment <> E_CELL_TEST_ENVIRONMENT.NORMAL THEN
	GVL_CELL_SETTINGS.xSimulationAccelerationEnable :=
		(GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.SIMULATION)
		AND (GVL_CELL_SETTINGS.eTestSpeedProfile = E_TEST_SPEED_PROFILE.FAST);
	IF GVL_CELL_SETTINGS.xSimulationAccelerationEnable THEN
		// Ускорение x250 относится только к автоматическим тестам Python-Modbus.
		// SoftMotion сохраняет прежний профиль x25.
		IF GVL_ROBOT_MODBUS.xModeActive THEN
			GVL_CELL_SETTINGS.uiSimulationTimeFactor := UINT#250;
		ELSE
			GVL_CELL_SETTINGS.uiSimulationTimeFactor := UINT#25;
		END_IF;
	ELSE
		GVL_CELL_SETTINGS.uiSimulationTimeFactor := UINT#1;
	END_IF;
END_IF;
