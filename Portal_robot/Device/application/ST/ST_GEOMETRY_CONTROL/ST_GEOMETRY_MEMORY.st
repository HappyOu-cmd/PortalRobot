TYPE ST_GEOMETRY_MEMORY :
STRUCT
	xOccupied : BOOL;
	xRecoveryRequired : BOOL;
	xAtEndSeen : BOOL; // Потерю датчика считаем изъятием только после прихода на него
	dwAlarm : DWORD;
	xRobotStopLatched : BOOL;
	udiLastDepositId : UDINT;
	udiProducedPartsTotal : UDINT;
	Part : ST_GEOMETRY_CALL;
END_STRUCT
END_TYPE
