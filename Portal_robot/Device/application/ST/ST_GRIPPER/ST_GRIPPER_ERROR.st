TYPE ST_GRIPPER_ERROR :
STRUCT
	GRIPPER_1_ERROR : BOOL; // Ошибка первого захвата
	GRIPPER_2_ERROR : BOOL; // Ошибка второго захвата
	ROTATION_ERROR  : BOOL; // Ошибка механизма поворота
	ACTION_ERROR    : BOOL; // Получено недопустимое действие
	GLOBAL_ERROR    : BOOL; // Глобальная ошибка симуляции захвата
END_STRUCT
END_TYPE
