TYPE ST_MACHINE_SIM_DIAG :
STRUCT
	xDoorOpening   : BOOL; // Выполняется открытие двери
	xDoorClosing   : BOOL; // Выполняется закрытие двери
	xChuckClamping : BOOL; // Выполняется зажим патрона
	xChuckOpening  : BOOL; // Выполняется разжим патрона
	xCycleStarting : BOOL; // Выполняется запуск цикла
END_STRUCT
END_TYPE
