TYPE ST_MACHINE_COMMAND :
STRUCT
	stIo    : ST_MACHINE_IO_COMMAND; // Команды исполнительным механизмам станка
	stRobot : ST_ROBOT_COMMAND; // Команда роботу от алгоритма станка
END_STRUCT
END_TYPE
