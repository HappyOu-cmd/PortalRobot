TYPE ST_CELL_SAFETY_FAULT_REQUEST :
STRUCT
	xEnabled : BOOL; // Общее разрешение диагностических инъекций
	axEmergencyStopStation : ARRAY [1..4] OF BOOL;
	axEmergencyStopCabinet : ARRAY [1..2] OF BOOL;
	xEmergencyStopMpg      : BOOL;
	xPhaseRelayFault       : BOOL;
	xPressureRelayFault    : BOOL;
	xSafetyRelayFault      : BOOL;
	axDoorUnlocked         : ARRAY [1..4] OF BOOL;
END_STRUCT
END_TYPE
