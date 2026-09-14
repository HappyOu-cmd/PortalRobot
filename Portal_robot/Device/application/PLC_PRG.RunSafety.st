METHOD PRIVATE RunSafety

// --- BEGIN IMPLEMENTATION ---

CELL_SAFETY(
	axDoorLockClosedInput := GVL_CELL_SAFETY_IO.axDoorLockClosedInput,
	axDoorUnlockButtonInput := GVL_CELL_SAFETY_IO.axDoorUnlockButtonInput,
	axEmergencyStopButtonStationInput := GVL_CELL_SAFETY_IO.axEmergencyStopButtonStationInput,
	axEmergencyStopCabinetInput := GVL_CELL_SAFETY_IO.axEmergencyStopCabinetInput,
	xEmergencyStopMpgInput := GVL_CELL_SAFETY_IO.xEmergencyStopMpgInput,
	xPhaseRelayOkInput := GVL_CELL_SAFETY_IO.xPhaseRelayOkInput,
	xPressureRelayOkInput := GVL_CELL_SAFETY_IO.xPressureRelayOkInput,
	xSafetyRelayOkInput := GVL_CELL_SAFETY_IO.xSafetyRelayOkInput,
	xCellStartButtonInput := GVL_CELL_SAFETY_IO.xCellStartButtonInput,
	xCellStopButtonInput := GVL_CELL_SAFETY_IO.xCellStopButtonInput,
	xCellResetButtonInput := GVL_CELL_SAFETY_IO.xCellResetButtonInput,
	xMpgAxisXInput := GVL_CELL_SAFETY_IO.xMpgAxisXInput,
	xMpgAxisYInput := GVL_CELL_SAFETY_IO.xMpgAxisYInput,
	xMpgAxisZInput := GVL_CELL_SAFETY_IO.xMpgAxisZInput,
	xMpgMultiplier1Input := GVL_CELL_SAFETY_IO.xMpgMultiplier1Input,
	xMpgMultiplier10Input := GVL_CELL_SAFETY_IO.xMpgMultiplier10Input,
	xMpgMultiplier100Input := GVL_CELL_SAFETY_IO.xMpgMultiplier100Input,
	xSafetyRelayReset := GVL_HMI.xSafetyRelayReset,
	astMagazineStatus := GVL_MAGAZINE.astStatus,
	FaultRequest := stSafetyFaultRequest
);

GVL_CELL_SAFETY_IO.axDoorUnlockOutput := CELL_SAFETY.axDoorUnlockOutput;
GVL_CELL_SAFETY_IO.axDoorButtonLampOutput := CELL_SAFETY.axDoorButtonLampOutput;
GVL_CELL_SAFETY_IO.xSafetyRelayResetOutput := CELL_SAFETY.xSafetyRelayResetOutput;

// Физические Старт/Стоп/Сброс — равноправные дубли HMI-команд, но только по фронту.
GVL_CELL_CONTROL.xEnable := GVL_CELL_CONTROL.xEnable OR CELL_SAFETY.xCellEnablePulse;
GVL_CELL_CONTROL.xDisable := GVL_CELL_CONTROL.xDisable OR CELL_SAFETY.xCellDisablePulse;
GVL_CELL_CONTROL.xReset := GVL_CELL_CONTROL.xReset OR CELL_SAFETY.xCellResetPulse;

GVL_CELL_CONTROL.xGlobalError := CELL_SAFETY.Status.xGlobalError;
IF GVL_CELL_CONTROL.xGlobalError THEN
	GVL_CELL_CONTROL.xManual := TRUE;
END_IF;
