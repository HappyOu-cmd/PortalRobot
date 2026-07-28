TYPE ST_GRIPPER_STATUS  :
STRUCT
	xBusy            : BOOL; // Выполняется действие захвата
	xDone            : BOOL; // Действие завершено
	xError           : BOOL; // Захват находится в ошибке
	xGripper1Open    : BOOL; // Первый захват открыт
	xGripper1Closed  : BOOL; // Первый захват закрыт
	xGripper2Open    : BOOL; // Второй захват открыт
	xGripper2Closed  : BOOL; // Второй захват закрыт
	xRotatedToBlank  : BOOL; // Захват повёрнут к заготовке
	xRotatedToDetail : BOOL; // Захват повёрнут к детали
END_STRUCT
END_TYPE
