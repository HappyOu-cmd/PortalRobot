TYPE ST_ROBOT_ERROR :
STRUCT
	WRONG_ACTION : BOOL; // Получена неизвестная команда робота
	MOTION_ERROR : BOOL; // Ошибка менеджера движения
	GRIPPER_ERROR: BOOL; // Ошибка механизма захвата
	MODBUS_ERROR : BOOL; // Ошибка обмена с внешним роботом
	STOP_ERROR   : BOOL; // Движение остановлено командой или глобальной ошибкой
END_STRUCT
END_TYPE
