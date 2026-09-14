FUNCTION_BLOCK FB_CELL_SAFETY_FAULT_INJECTOR
VAR_INPUT
	Request : ST_CELL_SAFETY_FAULT_REQUEST;
END_VAR
VAR_OUTPUT
	axEmergencyStopStation : ARRAY [1..4] OF BOOL;
	axEmergencyStopCabinet : ARRAY [1..2] OF BOOL;
	xEmergencyStopMpg   : BOOL;
	xPhaseRelayFault    : BOOL;
	xPressureRelayFault : BOOL;
	xSafetyRelayFault   : BOOL;
	axDoorUnlocked      : ARRAY [1..4] OF BOOL;
	Status              : ST_FAULT_INJECTION_STATUS;
END_VAR
VAR
	uiIndex : UINT;
END_VAR

// --- BEGIN IMPLEMENTATION ---

Status.xAllowed := Request.xEnabled;
Status.xBusy := FALSE;
Status.xRejected := FALSE;
Status.xResetAllowed := FALSE;

FOR uiIndex := UINT#1 TO UINT#4 DO
	axEmergencyStopStation[uiIndex] := Request.xEnabled AND Request.axEmergencyStopStation[uiIndex];
	axDoorUnlocked[uiIndex] := Request.xEnabled AND Request.axDoorUnlocked[uiIndex];
END_FOR;
FOR uiIndex := UINT#1 TO UINT#2 DO
	axEmergencyStopCabinet[uiIndex] := Request.xEnabled AND Request.axEmergencyStopCabinet[uiIndex];
END_FOR;
xEmergencyStopMpg := Request.xEnabled AND Request.xEmergencyStopMpg;
xPhaseRelayFault := Request.xEnabled AND Request.xPhaseRelayFault;
xPressureRelayFault := Request.xEnabled AND Request.xPressureRelayFault;
xSafetyRelayFault := Request.xEnabled AND Request.xSafetyRelayFault;

Status.xActive := xEmergencyStopMpg
	OR xPhaseRelayFault
	OR xPressureRelayFault
	OR xSafetyRelayFault;
FOR uiIndex := UINT#1 TO UINT#4 DO
	Status.xActive := Status.xActive
		OR axEmergencyStopStation[uiIndex]
		OR axDoorUnlocked[uiIndex];
END_FOR;
FOR uiIndex := UINT#1 TO UINT#2 DO
	Status.xActive := Status.xActive OR axEmergencyStopCabinet[uiIndex];
END_FOR;
