TYPE ST_MOTION_MANAGER_STATUS :
STRUCT
	xReady        : BOOL; // Менеджер готов принять команду
	xBusy         : BOOL; // Выполняется движение
	xDone         : BOOL; // Движение завершено
	xError        : BOOL; // Менеджер находится в ошибке
	eCurrentPoint : E_POINT_NAME; // Последняя достигнутая точка
END_STRUCT
END_TYPE
