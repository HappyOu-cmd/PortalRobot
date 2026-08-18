TYPE ST_ROBOT_ERROR :
STRUCT
	WRONG_ACTION : BOOL; // Получена неизвестная команда робота
	MOTION_ERROR : BOOL; // Ошибка менеджера движения
	GRIPPER_ERROR: BOOL; // Ошибка механизма захвата
	MODBUS_ERROR : BOOL; // Совместимость: любая ошибка внешнего интерфейса
	MODBUS_COMMUNICATION_ERROR : BOOL; // Ошибка TCP/FC03/FC16/heartbeat
	EXTERNAL_ROBOT_ALARM : BOOL; // Контроллер робота сообщил технологическую аварию
	STOP_ERROR   : BOOL; // Движение остановлено командой или глобальной ошибкой
END_STRUCT
END_TYPE
