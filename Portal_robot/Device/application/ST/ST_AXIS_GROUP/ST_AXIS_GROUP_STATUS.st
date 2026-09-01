TYPE ST_AXIS_GROUP_STATUS :
STRUCT
	xLocalError     : BOOL; // Активна любая внутренняя ошибка блока
	xLogicalError   : BOOL; // Активна логическая ошибка группы
	xGroupError     : BOOL; // Активна ошибка SoftMotion группы
	xMoveDirectDone : BOOL; // Прямое перемещение завершено
	xSimErrorAllowed: BOOL; // Разрешена безопасная тестовая инъекция ошибки SM3
	xPositionValid  : BOOL; // Координаты группы подтверждены MC_GroupReadActualPosition
	ActualX         : LREAL; // Текущая координата X
	ActualY         : LREAL; // Текущая координата Y
	ActualZ         : LREAL; // Текущая координата Z
	
END_STRUCT
END_TYPE
