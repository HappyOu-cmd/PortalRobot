TYPE ST_MACHINE_SIM_DIAG :
STRUCT
	xDoorOpening   : BOOL; // Выполняется открытие роботного люка
	xDoorClosing   : BOOL; // Выполняется закрытие роботного люка
	xSafetyDoorOpening : BOOL; // Выполняется открытие операторской двери
	xSafetyDoorClosing : BOOL; // Выполняется закрытие операторской двери
	xChuckClamping : BOOL; // Выполняется зажим патрона
	xChuckOpening  : BOOL; // Выполняется разжим патрона
	xCycleStarting : BOOL; // Выполняется запуск цикла
	xResetAllowed  : BOOL; // Источник имитации снят и авария симулятора может быть сброшена
END_STRUCT
END_TYPE
