TYPE ST_MACHINE_SIM_ERROR :
STRUCT
	MACHINE_ALARM : BOOL; // Активна имитация аварии станка
	DOOR_FAULT    : BOOL; // Ошибка механизма двери
	CHUCK_FAULT   : BOOL; // Ошибка механизма патрона
END_STRUCT
END_TYPE
