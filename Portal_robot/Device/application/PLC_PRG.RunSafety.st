METHOD PRIVATE RunSafety

// --- BEGIN IMPLEMENTATION ---

FOR uiTwin := 1 TO 2 DO
	axTwinSafetyBusy[uiTwin] := (GVL_TWO_PALLET.uiMode = 1) AND (GVL_TWO_PALLET.astStatus[uiTwin].xBusy
		OR (GVL_TWO_PALLET.astInput[uiTwin].xAxisBound AND NOT GVL_TWO_PALLET.astInput[uiTwin].xStandstill));
END_FOR;
FOR uiMachine := UINT#1 TO UINT#4 DO
	axButtonStationInput[uiMachine] := GVL_CELL_SAFETY_IO.axDoorUnlockButtonInput[uiMachine]
		OR ((GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.SIMULATION)
			AND GVL_CELL_SAFETY_IO.axSimDoorUnlockButtonInput[uiMachine]);
	axButtonStationEmergencyStopInput[uiMachine] := GVL_CELL_SAFETY_IO.axEmergencyStopButtonStationInput[uiMachine]
		OR ((GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.SIMULATION)
			AND GVL_CELL_SAFETY_IO.axSimEmergencyStopButtonStationInput[uiMachine]);
END_FOR;
CELL_SAFETY(
	axMagazineMechanismBusy := axTwinSafetyBusy,
	axDoorLockClosedInput := GVL_CELL_SAFETY_IO.axDoorLockClosedInput,
	axDoorUnlockButtonInput := axButtonStationInput,
	axEmergencyStopButtonStationInput := axButtonStationEmergencyStopInput,
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

// HMI записывает payload, затем CommandSeq. Gateway удерживает единственного
// писателя до AckSeq. Даже запись между RunSafety и PublishHmi не теряется:
// PLC никогда не перезаписывает запрос, а обработает его в следующем скане.
uiCellModeRejectReason := UINT#0;
udiCellModeCommandSnapshot := GVL_HMI.udiCellModeCommandSeq;
IF (udiCellModeCommandSnapshot <> UDINT#0)
AND (udiCellModeCommandSnapshot <> GVL_HMI.udiCellModeAckSeq) THEN
	IF GVL_HMI.xCellManualRequest
	AND GVL_CELL_MANAGER.Status.xRunning
	AND NOT GVL_CELL_CONTROL.xGlobalError THEN
		uiCellModeRejectReason := UINT#2;
	ELSIF NOT GVL_HMI.xCellManualRequest
	AND GVL_CELL_CONTROL.xGlobalError THEN
		uiCellModeRejectReason := UINT#3;
	ELSE
		GVL_CELL_CONTROL.xManual := GVL_HMI.xCellManualRequest;
	END_IF;
	IF uiCellModeRejectReason = UINT#0 THEN
		GVL_HMI.uiCellModeResult := UINT#1;
	ELSE
		GVL_HMI.uiCellModeResult := uiCellModeRejectReason;
	END_IF;
	// Ack публикуется после фактического режима в PublishHmi, включая отказ.
END_IF;

IF GVL_CELL_CONTROL.xGlobalError THEN
	GVL_CELL_CONTROL.xManual := TRUE;
END_IF;

// Разрешения рассчитываются после применения режима и Safety текущего скана.
xRobotHmiPermit := GVL_CELL_CONTROL.xManual AND NOT GVL_CELL_MANAGER.Status.xRunning;
xRobotAutoPowerOff := NOT GVL_CELL_CONTROL.xManual
	AND (GVL_ROBOT.Status.xError
		OR GVL_AXIS.arrAxis[1].Status.xError
		OR GVL_AXIS.arrAxis[2].Status.xError
		OR GVL_AXIS.arrAxis[3].Status.xError
		OR GVL_AXIS_GROUP.AxisGroup.Status.xLocalError
		OR GVL_AXIS_GROUP.AxisGroup.Status.xLogicalError
		OR GVL_AXIS_GROUP.AxisGroup.Status.xGroupError);
