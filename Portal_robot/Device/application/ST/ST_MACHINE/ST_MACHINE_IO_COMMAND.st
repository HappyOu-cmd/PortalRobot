TYPE ST_MACHINE_IO_COMMAND :
STRUCT
	xOpenDoor       : BOOL; // Открыть роботный люк; имя сохранено для совместимости
	xCloseDoor      : BOOL; // Закрыть роботный люк; имя сохранено для совместимости
	xHatchUnLock    : BOOL; // Открыть замок роботного люка; FALSE удерживает замок закрытым
	xOpenSafetyDoor : BOOL; // Открыть операторскую дверь
	xCloseSafetyDoor: BOOL; // Закрыть операторскую дверь
	xClampChuck   : BOOL; // Зажать патрон
	xUnclampChuck : BOOL; // Разжать патрон
	xStartCycle   : BOOL; // Запустить обработку
	xReset        : BOOL; // Сбросить аварию станка
END_STRUCT
END_TYPE
