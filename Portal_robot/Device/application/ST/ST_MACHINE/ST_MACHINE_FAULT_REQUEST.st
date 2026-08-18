TYPE ST_MACHINE_FAULT_REQUEST :
STRUCT
	xEnabled             : BOOL; // Глобальное разрешение диагностической инъекции
	xReset               : BOOL; // Отдельный сброс источника неисправности станка
	xMachineAlarm        : BOOL; // Общая авария виртуального станка
	xDoorFault           : BOOL; // Неисправность механизма двери
	xChuckFault          : BOOL; // Неисправность механизма патрона
	xTimeoutRobotMove    : BOOL; // Не подтверждать завершение движения робота
	xTimeoutRobotAction  : BOOL; // Не подтверждать действие захвата
	xTimeoutRobotRelease : BOOL; // Не подтверждать освобождение интерфейса робота
	xTimeoutDoorOpen     : BOOL; // Не подтверждать открытие двери
	xTimeoutDoorClose    : BOOL; // Не подтверждать закрытие двери
	xTimeoutChuckOpen    : BOOL; // Не подтверждать разжим патрона
	xTimeoutChuckClose   : BOOL; // Не подтверждать зажим патрона
	xTimeoutCycleStart   : BOOL; // Не подтверждать запуск цикла обработки
END_STRUCT
END_TYPE
