TYPE ST_ROBOT_STATUS :
STRUCT
	xBusy             : BOOL; // Робот выполняет команду
	xDone             : BOOL; // Команда завершена
	xError            : BOOL; // Робот находится в ошибке
	eCurrentPoint     : E_POINT_NAME; // Последняя достигнутая точка
	xBlankAvailable   : BOOL; // В первом захвате находится заготовка
	xDetailAvailable  : BOOL; // Во втором захвате находится готовая деталь
	xGripper1Open     : BOOL; // Первый захват открыт
	xGripper1Closed   : BOOL; // Первый захват закрыт
	xGripper2Open     : BOOL; // Второй захват открыт
	xGripper2Closed   : BOOL; // Второй захват закрыт
	xRotatedToBlank   : BOOL; // Захват повёрнут к заготовке
	xRotatedToDetail  : BOOL; // Захват повёрнут к готовой детали
END_STRUCT
END_TYPE
