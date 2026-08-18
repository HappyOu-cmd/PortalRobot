TYPE ST_MOTION_MANAGER_COMMAND :
STRUCT 
	eTargetPoint : E_POINT_NAME; // Имя целевой точки
	xGlobalError : BOOL; // Глобальная ошибка ячейки
	xExecute     : BOOL; // Команда запуска движения
	xStop        : BOOL; // Штатная операторская остановка без формирования аварии
	xReset       : BOOL; // Команда сброса ошибки
	xMode        : BOOL; // TRUE: Modbus, FALSE: SoftMotion
END_STRUCT
END_TYPE
