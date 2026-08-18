TYPE ST_AXIS_FAULT_REQUEST :
STRUCT
	xEnabled     : BOOL; // Глобальное разрешение диагностической инъекции
	xJogConflict : BOOL; // Импульс одновременного запроса Jog+ и Jog-
END_STRUCT
END_TYPE
