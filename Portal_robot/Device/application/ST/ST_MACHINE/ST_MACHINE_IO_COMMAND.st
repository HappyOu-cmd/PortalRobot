TYPE ST_MACHINE_IO_COMMAND :
STRUCT
	xOpenDoor     : BOOL; // Открыть дверь
	xCloseDoor    : BOOL; // Закрыть дверь
	xClampChuck   : BOOL; // Зажать патрон
	xUnclampChuck : BOOL; // Разжать патрон
	xStartCycle   : BOOL; // Запустить обработку
	xReset        : BOOL; // Сбросить аварию станка
END_STRUCT
END_TYPE
