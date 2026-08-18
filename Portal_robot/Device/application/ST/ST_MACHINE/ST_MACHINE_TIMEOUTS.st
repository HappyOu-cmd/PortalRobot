TYPE ST_MACHINE_TIMEOUTS :
STRUCT
	tRobotMove    : TIME := T#60S; // Допустимое время движения робота
	tRobotAction  : TIME := T#10S; // Допустимое время действия захвата
	tRobotRelease : TIME := T#5S; // Допустимое время освобождения интерфейса робота
	tDoorOpen     : TIME := T#10S; // Допустимое время открытия двери
	tDoorClose    : TIME := T#10S; // Допустимое время закрытия двери
	tChuckOpen    : TIME := T#10S; // Допустимое время разжима патрона
	tChuckClose   : TIME := T#10S; // Допустимое время зажима патрона
	tCycleStart   : TIME := T#10S; // Допустимое время подтверждения запуска цикла
END_STRUCT
END_TYPE
