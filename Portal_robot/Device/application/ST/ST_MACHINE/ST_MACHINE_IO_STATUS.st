TYPE ST_MACHINE_IO_STATUS :
STRUCT
	xReady          : BOOL; // Станок готов принимать команды
	xAlarm          : BOOL; // Активна авария станка
	xDoorOpen       : BOOL; // Роботный люк открыт; имя сохранено для совместимости
	xDoorClosed     : BOOL; // Роботный люк закрыт; имя сохранено для совместимости
	xSafetyDoorOpen   : BOOL; // Операторская дверь открыта
	xSafetyDoorClosed : BOOL; // Операторская дверь закрыта
	xChuckClamped   : BOOL; // Патрон зажат
	xChuckUnclamped : BOOL; // Патрон разжат
	xCycleActive    : BOOL; // Выполняется цикл обработки
	xCycleDone      : BOOL; // Цикл обработки завершён
	tRemaining      : TIME; // Оставшееся время обработки
END_STRUCT
END_TYPE
