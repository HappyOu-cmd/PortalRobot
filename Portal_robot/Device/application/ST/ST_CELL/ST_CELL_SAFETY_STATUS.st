TYPE ST_CELL_SAFETY_STATUS :
STRUCT
	xReady                   : BOOL; // Все текущие условия безопасности выполнены
	xGlobalError             : BOOL; // Хотя бы одна текущая Safety-причина активна
	xPhaseRelayOk            : BOOL; // Реле контроля фаз в норме
	xPressureRelayOk         : BOOL; // Реле контроля давления в норме
	xSafetyRelayOk           : BOOL; // Реле безопасности взведено
	xSafetyRelayResetAllowed : BOOL; // Разрешён отдельный импульс сброса реле
	xSafetyRelayResetActive  : BOOL; // Полный секундный импульс сброса реле сейчас активен
	axEmergencyStopReleased  : ARRAY [1..7] OF BOOL; // 4 поста, 2 шкафа, MPG
	axDoorReady              : ARRAY [1..4] OF BOOL; // Замок закрыт либо связанный магазин выключен
END_STRUCT
END_TYPE
