METHOD PRIVATE ReadPhysicalInputs

// --- BEGIN IMPLEMENTATION ---

// Единственная страница назначения входов. Сначала фильтры, затем технологические FB.
// Тестовые среды используют модели; сырые входы приводов ГК читает RunGeometryControl.
xPhysicalNormal := GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.NORMAL;
GVL_PHYSICAL_IO.xNormalActive := xPhysicalNormal AND GVL_PHYSICAL_IO.xMappingVerified;
xPhysicalInputEnable := GVL_PHYSICAL_IO.xNormalActive;

axPhysicalRaw[1] := GVL_PHYSICAL_IO.xDiMachine1Ready;
axPhysicalRaw[2] := GVL_PHYSICAL_IO.xDiMachine1Alarm;
axPhysicalRaw[3] := GVL_PHYSICAL_IO.xDiMachine1DoorOpen;
axPhysicalRaw[4] := GVL_PHYSICAL_IO.xDiMachine1DoorClosed;
axPhysicalRaw[5] := GVL_PHYSICAL_IO.xDiMachine1HatchLocked;
axPhysicalRaw[6] := GVL_PHYSICAL_IO.xDiMachine1SafetyDoorOpen;
axPhysicalRaw[7] := GVL_PHYSICAL_IO.xDiMachine1SafetyDoorClosed;
axPhysicalRaw[8] := GVL_PHYSICAL_IO.xDiMachine1ChuckClamped;
axPhysicalRaw[9] := GVL_PHYSICAL_IO.xDiMachine1ChuckUnclamped;
axPhysicalRaw[10] := GVL_PHYSICAL_IO.xDiMachine1CycleActive;
axPhysicalRaw[11] := GVL_PHYSICAL_IO.xDiMachine1CycleDone;
axPhysicalRaw[12] := GVL_PHYSICAL_IO.xDiMachine2Ready;
axPhysicalRaw[13] := GVL_PHYSICAL_IO.xDiMachine2Alarm;
axPhysicalRaw[14] := GVL_PHYSICAL_IO.xDiMachine2DoorOpen;
axPhysicalRaw[15] := GVL_PHYSICAL_IO.xDiMachine2DoorClosed;
axPhysicalRaw[16] := GVL_PHYSICAL_IO.xDiMachine2HatchLocked;
axPhysicalRaw[17] := GVL_PHYSICAL_IO.xDiMachine2SafetyDoorOpen;
axPhysicalRaw[18] := GVL_PHYSICAL_IO.xDiMachine2SafetyDoorClosed;
axPhysicalRaw[19] := GVL_PHYSICAL_IO.xDiMachine2ChuckClamped;
axPhysicalRaw[20] := GVL_PHYSICAL_IO.xDiMachine2ChuckUnclamped;
axPhysicalRaw[21] := GVL_PHYSICAL_IO.xDiMachine2CycleActive;
axPhysicalRaw[22] := GVL_PHYSICAL_IO.xDiMachine2CycleDone;
axPhysicalRaw[23] := GVL_PHYSICAL_IO.xDiMachine3Ready;
axPhysicalRaw[24] := GVL_PHYSICAL_IO.xDiMachine3Alarm;
axPhysicalRaw[25] := GVL_PHYSICAL_IO.xDiMachine3DoorOpen;
axPhysicalRaw[26] := GVL_PHYSICAL_IO.xDiMachine3DoorClosed;
axPhysicalRaw[27] := GVL_PHYSICAL_IO.xDiMachine3HatchLocked;
axPhysicalRaw[28] := GVL_PHYSICAL_IO.xDiMachine3SafetyDoorOpen;
axPhysicalRaw[29] := GVL_PHYSICAL_IO.xDiMachine3SafetyDoorClosed;
axPhysicalRaw[30] := GVL_PHYSICAL_IO.xDiMachine3ChuckClamped;
axPhysicalRaw[31] := GVL_PHYSICAL_IO.xDiMachine3ChuckUnclamped;
axPhysicalRaw[32] := GVL_PHYSICAL_IO.xDiMachine3CycleActive;
axPhysicalRaw[33] := GVL_PHYSICAL_IO.xDiMachine3CycleDone;
axPhysicalRaw[34] := GVL_PHYSICAL_IO.xDiGripper1Open;
axPhysicalRaw[35] := GVL_PHYSICAL_IO.xDiGripper1Closed;
axPhysicalRaw[36] := GVL_PHYSICAL_IO.xDiGripper2Open;
axPhysicalRaw[37] := GVL_PHYSICAL_IO.xDiGripper2Closed;
axPhysicalRaw[38] := GVL_PHYSICAL_IO.xDiRotatedToBlank;
axPhysicalRaw[39] := GVL_PHYSICAL_IO.xDiRotatedToDetail;
axPhysicalRaw[40] := GVL_PHYSICAL_IO.xDiCellStartButtonInput;
axPhysicalRaw[41] := GVL_PHYSICAL_IO.xDiCellStopButtonInput;
axPhysicalRaw[42] := GVL_PHYSICAL_IO.xDiCellResetButtonInput;
axPhysicalRaw[43] := GVL_PHYSICAL_IO.xDiEmergencyStopStation1Ok;
axPhysicalRaw[44] := GVL_PHYSICAL_IO.xDiEmergencyStopStation2Ok;
axPhysicalRaw[45] := GVL_PHYSICAL_IO.xDiEmergencyStopStation3Ok;
axPhysicalRaw[46] := GVL_PHYSICAL_IO.xDiEmergencyStopStation4Ok;
axPhysicalRaw[47] := GVL_PHYSICAL_IO.xDiEmergencyStopCabinet1Ok;
axPhysicalRaw[48] := GVL_PHYSICAL_IO.xDiEmergencyStopCabinet2Ok;
axPhysicalRaw[49] := GVL_PHYSICAL_IO.xDiEmergencyStopMpgOk;
axPhysicalRaw[50] := GVL_PHYSICAL_IO.xDiDoor1LockClosed;
axPhysicalRaw[51] := GVL_PHYSICAL_IO.xDiDoor2LockClosed;
axPhysicalRaw[52] := GVL_PHYSICAL_IO.xDiDoor3LockClosed;
axPhysicalRaw[53] := GVL_PHYSICAL_IO.xDiDoor4LockClosed;
axPhysicalRaw[54] := GVL_PHYSICAL_IO.xDiSafetyRelayOkInput;
axPhysicalRaw[55] := GVL_PHYSICAL_IO.xDiPhaseRelayOkInput;
axPhysicalRaw[56] := GVL_PHYSICAL_IO.xDiPressureRelayOkInput;
axPhysicalRaw[57] := GVL_PHYSICAL_IO.xDiMpgAxisXInput;
axPhysicalRaw[58] := GVL_PHYSICAL_IO.xDiMpgAxisYInput;
axPhysicalRaw[59] := GVL_PHYSICAL_IO.xDiMpgAxisZInput;
axPhysicalRaw[60] := GVL_PHYSICAL_IO.xDiMpgMultiplier1Input;
axPhysicalRaw[61] := GVL_PHYSICAL_IO.xDiMpgMultiplier10Input;
axPhysicalRaw[62] := GVL_PHYSICAL_IO.xDiMpgMultiplier100Input;
axPhysicalRaw[63] := GVL_PHYSICAL_IO.xDiMagazine1LockIn;
axPhysicalRaw[64] := GVL_PHYSICAL_IO.xDiMagazine1LockOut;
axPhysicalRaw[65] := GVL_PHYSICAL_IO.xDiMagazine1StopIn;
axPhysicalRaw[66] := GVL_PHYSICAL_IO.xDiMagazine1StopOut;
axPhysicalRaw[67] := GVL_PHYSICAL_IO.xDiMagazine1LiftUp;
axPhysicalRaw[68] := GVL_PHYSICAL_IO.xDiMagazine1LiftDown;
axPhysicalRaw[69] := GVL_PHYSICAL_IO.xDiDoor1UnlockButton;
axPhysicalRaw[70] := GVL_PHYSICAL_IO.xDiDoor2UnlockButton;
axPhysicalRaw[71] := GVL_PHYSICAL_IO.xDiDoor3UnlockButton;
axPhysicalRaw[72] := GVL_PHYSICAL_IO.xDiDoor4UnlockButton;
axPhysicalRaw[73] := GVL_PHYSICAL_IO.xDiMagazine2LockIn;
axPhysicalRaw[74] := GVL_PHYSICAL_IO.xDiMagazine2LockOut;
axPhysicalRaw[75] := GVL_PHYSICAL_IO.xDiMagazine2StopIn;
axPhysicalRaw[76] := GVL_PHYSICAL_IO.xDiMagazine2StopOut;
axPhysicalRaw[77] := GVL_PHYSICAL_IO.xDiMagazine2LiftUp;
axPhysicalRaw[78] := GVL_PHYSICAL_IO.xDiMagazine2LiftDown;

axPhysicalRaw[79] := GVL_PHYSICAL_IO.xDiGk1PartAtEnd;
axPhysicalRaw[80] := GVL_PHYSICAL_IO.xDiGk2PartAtEnd;

axPhysicalRaw[81] := GVL_PHYSICAL_IO.xDiGk1DriveAlarm;
axPhysicalRaw[82] := GVL_PHYSICAL_IO.xDiGk1DriveRunning;
axPhysicalRaw[83] := GVL_PHYSICAL_IO.xDiGk2DriveAlarm;
axPhysicalRaw[84] := GVL_PHYSICAL_IO.xDiGk2DriveRunning;
// Клеммы сохраняются отдельно: ручная подмена не пишет в переменную I/O Mapping.
FOR uiIoIndex := UINT#1 TO UINT#84 DO
    axIoRawDi[uiIoIndex] := axPhysicalRaw[uiIoIndex];
END_FOR;
ReadIoOverrides();
FOR uiIoIndex := UINT#1 TO UINT#84 DO
    IF axIoForced[uiIoIndex] THEN
        axPhysicalRaw[uiIoIndex] := axIoForceValue[uiIoIndex];
    END_IF;
END_FOR;

FOR uiPhysicalInput := 1 TO 80 DO
	tPhysicalRise := GVL_CELL_SETTINGS.tInputFilterRise;
	tPhysicalFall := GVL_CELL_SETTINGS.tInputFilterFall;
	// Срабатывание опасного состояния не задерживается; восстановление фильтруется.
	CASE uiPhysicalInput OF
		2, 13, 24, 41:
			tPhysicalRise := T#0MS;
		1, 3, 4, 5, 6, 7, 8, 9, 12, 14, 15, 16, 17, 18, 19, 20, 23, 25, 26, 27, 28, 29, 30, 31, 34, 35, 36, 37, 38, 39, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 63, 64, 65, 66, 67, 68, 73, 74, 75, 76, 77, 78, 79, 80:
			tPhysicalFall := T#0MS;
	END_CASE;
	xPhysicalInputEnable := xPhysicalNormal AND (GVL_PHYSICAL_IO.xMappingVerified OR axIoForced[uiPhysicalInput]);
	afbPhysicalInputFilter[uiPhysicalInput](
		xEnable := xPhysicalInputEnable, xInput := axPhysicalRaw[uiPhysicalInput],
		tRise := tPhysicalRise, tFall := tPhysicalFall);
	axPhysicalFiltered[uiPhysicalInput] := afbPhysicalInputFilter[uiPhysicalInput].xFiltered;
	IF NOT xPhysicalInputEnable THEN
		axPhysicalButtonArmed[uiPhysicalInput] := FALSE;
	ELSIF NOT axPhysicalRaw[uiPhysicalInput] THEN
		axPhysicalButtonArmed[uiPhysicalInput] := TRUE;
	END_IF;
END_FOR;

// Датчики используются FB_GEOMETRY_CONTROL; в NORMAL доступна диагностическая подмена до подтверждения карты.
GVL_PHYSICAL_IO.axGkPartAtEnd[1] := axPhysicalFiltered[79];
GVL_PHYSICAL_IO.axGkPartAtEnd[2] := axPhysicalFiltered[80];

IF xPhysicalNormal THEN
	GVL_MACHINE.astPhysicalInput[1].xReady := axPhysicalFiltered[1];
	GVL_MACHINE.astPhysicalInput[1].xAlarm := axPhysicalFiltered[2];
	GVL_MACHINE.astPhysicalInput[1].xDoorOpen := axPhysicalFiltered[3];
	GVL_MACHINE.astPhysicalInput[1].xDoorClosed := axPhysicalFiltered[4];
	GVL_MACHINE.astPhysicalInput[1].xHatchLocked := axPhysicalFiltered[5];
	GVL_MACHINE.astPhysicalInput[1].xSafetyDoorOpen := axPhysicalFiltered[6];
	GVL_MACHINE.astPhysicalInput[1].xSafetyDoorClosed := axPhysicalFiltered[7];
	GVL_MACHINE.astPhysicalInput[1].xChuckClamped := axPhysicalFiltered[8];
	GVL_MACHINE.astPhysicalInput[1].xChuckUnclamped := axPhysicalFiltered[9];
	GVL_MACHINE.astPhysicalInput[1].xCycleActive := axPhysicalFiltered[10];
	GVL_MACHINE.astPhysicalInput[1].xCycleDone := axPhysicalFiltered[11];
	GVL_MACHINE.astPhysicalInput[2].xReady := axPhysicalFiltered[12];
	GVL_MACHINE.astPhysicalInput[2].xAlarm := axPhysicalFiltered[13];
	GVL_MACHINE.astPhysicalInput[2].xDoorOpen := axPhysicalFiltered[14];
	GVL_MACHINE.astPhysicalInput[2].xDoorClosed := axPhysicalFiltered[15];
	GVL_MACHINE.astPhysicalInput[2].xHatchLocked := axPhysicalFiltered[16];
	GVL_MACHINE.astPhysicalInput[2].xSafetyDoorOpen := axPhysicalFiltered[17];
	GVL_MACHINE.astPhysicalInput[2].xSafetyDoorClosed := axPhysicalFiltered[18];
	GVL_MACHINE.astPhysicalInput[2].xChuckClamped := axPhysicalFiltered[19];
	GVL_MACHINE.astPhysicalInput[2].xChuckUnclamped := axPhysicalFiltered[20];
	GVL_MACHINE.astPhysicalInput[2].xCycleActive := axPhysicalFiltered[21];
	GVL_MACHINE.astPhysicalInput[2].xCycleDone := axPhysicalFiltered[22];
	GVL_MACHINE.astPhysicalInput[3].xReady := axPhysicalFiltered[23];
	GVL_MACHINE.astPhysicalInput[3].xAlarm := axPhysicalFiltered[24];
	GVL_MACHINE.astPhysicalInput[3].xDoorOpen := axPhysicalFiltered[25];
	GVL_MACHINE.astPhysicalInput[3].xDoorClosed := axPhysicalFiltered[26];
	GVL_MACHINE.astPhysicalInput[3].xHatchLocked := axPhysicalFiltered[27];
	GVL_MACHINE.astPhysicalInput[3].xSafetyDoorOpen := axPhysicalFiltered[28];
	GVL_MACHINE.astPhysicalInput[3].xSafetyDoorClosed := axPhysicalFiltered[29];
	GVL_MACHINE.astPhysicalInput[3].xChuckClamped := axPhysicalFiltered[30];
	GVL_MACHINE.astPhysicalInput[3].xChuckUnclamped := axPhysicalFiltered[31];
	GVL_MACHINE.astPhysicalInput[3].xCycleActive := axPhysicalFiltered[32];
	GVL_MACHINE.astPhysicalInput[3].xCycleDone := axPhysicalFiltered[33];
	GVL_PHYSICAL_IO.stGripperFeedback.xGripper1Open := axPhysicalFiltered[34];
	GVL_PHYSICAL_IO.stGripperFeedback.xGripper1Closed := axPhysicalFiltered[35];
	GVL_PHYSICAL_IO.stGripperFeedback.xGripper2Open := axPhysicalFiltered[36];
	GVL_PHYSICAL_IO.stGripperFeedback.xGripper2Closed := axPhysicalFiltered[37];
	GVL_PHYSICAL_IO.stGripperFeedback.xRotatedToBlank := axPhysicalFiltered[38];
	GVL_PHYSICAL_IO.stGripperFeedback.xRotatedToDetail := axPhysicalFiltered[39];
	GVL_CELL_SAFETY_IO.xCellStartButtonInput := axPhysicalFiltered[40] AND axPhysicalButtonArmed[40];
	GVL_CELL_SAFETY_IO.xCellStopButtonInput := axPhysicalFiltered[41];
	GVL_CELL_SAFETY_IO.xCellResetButtonInput := axPhysicalFiltered[42] AND axPhysicalButtonArmed[42];
	GVL_CELL_SAFETY_IO.axEmergencyStopButtonStationInput[1] := NOT axPhysicalFiltered[43];
	GVL_CELL_SAFETY_IO.axEmergencyStopButtonStationInput[2] := NOT axPhysicalFiltered[44];
	GVL_CELL_SAFETY_IO.axEmergencyStopButtonStationInput[3] := NOT axPhysicalFiltered[45];
	GVL_CELL_SAFETY_IO.axEmergencyStopButtonStationInput[4] := NOT axPhysicalFiltered[46];
	GVL_CELL_SAFETY_IO.axEmergencyStopCabinetInput[1] := NOT axPhysicalFiltered[47];
	GVL_CELL_SAFETY_IO.axEmergencyStopCabinetInput[2] := NOT axPhysicalFiltered[48];
	GVL_CELL_SAFETY_IO.xEmergencyStopMpgInput := NOT axPhysicalFiltered[49];
	GVL_CELL_SAFETY_IO.axDoorLockClosedInput[1] := axPhysicalFiltered[50];
	GVL_CELL_SAFETY_IO.axDoorLockClosedInput[2] := axPhysicalFiltered[51];
	GVL_CELL_SAFETY_IO.axDoorLockClosedInput[3] := axPhysicalFiltered[52];
	GVL_CELL_SAFETY_IO.axDoorLockClosedInput[4] := axPhysicalFiltered[53];
	GVL_CELL_SAFETY_IO.xSafetyRelayOkInput := axPhysicalFiltered[54];
	GVL_CELL_SAFETY_IO.xPhaseRelayOkInput := axPhysicalFiltered[55];
	GVL_CELL_SAFETY_IO.xPressureRelayOkInput := axPhysicalFiltered[56];
	GVL_CELL_SAFETY_IO.xMpgAxisXInput := axPhysicalFiltered[57];
	GVL_CELL_SAFETY_IO.xMpgAxisYInput := axPhysicalFiltered[58];
	GVL_CELL_SAFETY_IO.xMpgAxisZInput := axPhysicalFiltered[59];
	GVL_CELL_SAFETY_IO.xMpgMultiplier1Input := axPhysicalFiltered[60];
	GVL_CELL_SAFETY_IO.xMpgMultiplier10Input := axPhysicalFiltered[61];
	GVL_CELL_SAFETY_IO.xMpgMultiplier100Input := axPhysicalFiltered[62];
	GVL_TWO_PALLET.astInput[1].xLockIn := axPhysicalFiltered[63];
	GVL_TWO_PALLET.astInput[1].xLockOut := axPhysicalFiltered[64];
	GVL_TWO_PALLET.astInput[1].xStopIn := axPhysicalFiltered[65];
	GVL_TWO_PALLET.astInput[1].xStopOut := axPhysicalFiltered[66];
	GVL_TWO_PALLET.astInput[1].xLiftUp := axPhysicalFiltered[67];
	GVL_TWO_PALLET.astInput[1].xLiftDown := axPhysicalFiltered[68];
	GVL_CELL_SAFETY_IO.axDoorUnlockButtonInput[1] := axPhysicalFiltered[69] AND axPhysicalButtonArmed[69];
	GVL_CELL_SAFETY_IO.axDoorUnlockButtonInput[2] := axPhysicalFiltered[70] AND axPhysicalButtonArmed[70];
	GVL_CELL_SAFETY_IO.axDoorUnlockButtonInput[3] := axPhysicalFiltered[71] AND axPhysicalButtonArmed[71];
	GVL_CELL_SAFETY_IO.axDoorUnlockButtonInput[4] := axPhysicalFiltered[72] AND axPhysicalButtonArmed[72];
	GVL_TWO_PALLET.astInput[2].xLockIn := axPhysicalFiltered[73];
	GVL_TWO_PALLET.astInput[2].xLockOut := axPhysicalFiltered[74];
	GVL_TWO_PALLET.astInput[2].xStopIn := axPhysicalFiltered[75];
	GVL_TWO_PALLET.astInput[2].xStopOut := axPhysicalFiltered[76];
	GVL_TWO_PALLET.astInput[2].xLiftUp := axPhysicalFiltered[77];
	GVL_TWO_PALLET.astInput[2].xLiftDown := axPhysicalFiltered[78];
	GVL_TWO_PALLET.astInput[1].xIoMapped := GVL_PHYSICAL_IO.xNormalActive;
	GVL_TWO_PALLET.astInput[2].xIoMapped := GVL_PHYSICAL_IO.xNormalActive;
	GVL_MACHINE.astPhysicalInput[1].tRemaining := T#0MS;
	GVL_MACHINE.astPhysicalInput[2].tRemaining := T#0MS;
	GVL_MACHINE.astPhysicalInput[3].tRemaining := T#0MS;
ELSIF xPhysicalWasNormal THEN
	GVL_CELL_SAFETY_IO.xCellStartButtonInput := FALSE;
	GVL_CELL_SAFETY_IO.xCellStopButtonInput := FALSE;
	GVL_CELL_SAFETY_IO.xCellResetButtonInput := FALSE;
	GVL_CELL_SAFETY_IO.axEmergencyStopButtonStationInput[1] := FALSE;
	GVL_CELL_SAFETY_IO.axEmergencyStopButtonStationInput[2] := FALSE;
	GVL_CELL_SAFETY_IO.axEmergencyStopButtonStationInput[3] := FALSE;
	GVL_CELL_SAFETY_IO.axEmergencyStopButtonStationInput[4] := FALSE;
	GVL_CELL_SAFETY_IO.axEmergencyStopCabinetInput[1] := FALSE;
	GVL_CELL_SAFETY_IO.axEmergencyStopCabinetInput[2] := FALSE;
	GVL_CELL_SAFETY_IO.xEmergencyStopMpgInput := FALSE;
	GVL_CELL_SAFETY_IO.axDoorLockClosedInput[1] := TRUE;
	GVL_CELL_SAFETY_IO.axDoorLockClosedInput[2] := TRUE;
	GVL_CELL_SAFETY_IO.axDoorLockClosedInput[3] := TRUE;
	GVL_CELL_SAFETY_IO.axDoorLockClosedInput[4] := TRUE;
	GVL_CELL_SAFETY_IO.xSafetyRelayOkInput := TRUE;
	GVL_CELL_SAFETY_IO.xPhaseRelayOkInput := TRUE;
	GVL_CELL_SAFETY_IO.xPressureRelayOkInput := TRUE;
	GVL_CELL_SAFETY_IO.xMpgAxisXInput := FALSE;
	GVL_CELL_SAFETY_IO.xMpgAxisYInput := FALSE;
	GVL_CELL_SAFETY_IO.xMpgAxisZInput := FALSE;
	GVL_CELL_SAFETY_IO.xMpgMultiplier1Input := FALSE;
	GVL_CELL_SAFETY_IO.xMpgMultiplier10Input := FALSE;
	GVL_CELL_SAFETY_IO.xMpgMultiplier100Input := FALSE;
	GVL_CELL_SAFETY_IO.axDoorUnlockButtonInput[1] := FALSE;
	GVL_CELL_SAFETY_IO.axDoorUnlockButtonInput[2] := FALSE;
	GVL_CELL_SAFETY_IO.axDoorUnlockButtonInput[3] := FALSE;
	GVL_CELL_SAFETY_IO.axDoorUnlockButtonInput[4] := FALSE;
END_IF;
xPhysicalWasNormal := xPhysicalNormal;
