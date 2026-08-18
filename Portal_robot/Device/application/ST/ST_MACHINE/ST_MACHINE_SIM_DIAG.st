TYPE ST_MACHINE_SIM_DIAG :
STRUCT
	xDoorOpening   : BOOL; // Выполняется открытие двери
	xDoorClosing   : BOOL; // Выполняется закрытие двери
	xChuckClamping : BOOL; // Выполняется зажим патрона
	xChuckOpening  : BOOL; // Выполняется разжим патрона
	xCycleStarting : BOOL; // Выполняется запуск цикла
	xResetAllowed  : BOOL; // Источник имитации снят и авария симулятора может быть сброшена
END_STRUCT
END_TYPE
