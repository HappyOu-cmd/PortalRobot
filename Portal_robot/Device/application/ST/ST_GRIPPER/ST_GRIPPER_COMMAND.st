TYPE ST_GRIPPER_COMMAND :
STRUCT
	xExecute : BOOL; // Команда запуска действия
	xReset   : BOOL; // Команда сброса ошибки
	eAction  : E_ROBOT_ACTION; // Требуемое действие захвата
	// Дискретный контракт исполнительных механизмов. Каждый BOOL задаёт
	// состояние своего механизма: 0 — закрыть/к заготовке, 1 — открыть/к детали.
	xGripper1Open   : BOOL; // Захват 1: 0 закрыть, 1 открыть
	xGripper2Open   : BOOL; // Захват 2: 0 закрыть, 1 открыть
	xRotateToDetail : BOOL; // Поворот: 0 к заготовке, 1 к детали
END_STRUCT
END_TYPE
