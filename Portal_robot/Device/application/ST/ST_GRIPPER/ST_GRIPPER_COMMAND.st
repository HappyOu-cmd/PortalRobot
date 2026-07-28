TYPE ST_GRIPPER_COMMAND :
STRUCT
	xExecute : BOOL; // Команда запуска действия
	xReset   : BOOL; // Команда сброса ошибки
	eAction  : E_ROBOT_ACTION; // Требуемое действие захвата
END_STRUCT
END_TYPE
