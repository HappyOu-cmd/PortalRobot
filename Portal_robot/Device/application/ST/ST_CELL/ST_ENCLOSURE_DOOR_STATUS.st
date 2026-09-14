TYPE ST_ENCLOSURE_DOOR_STATUS :
STRUCT
	xLocked        : BOOL; // Обратная связь замка: TRUE — замок закрыт
	xUnlockAllowed : BOOL; // PLC разрешает открыть замок
	xUnlockOutput  : BOOL; // Фактическая команда открытия замка
END_STRUCT
END_TYPE
