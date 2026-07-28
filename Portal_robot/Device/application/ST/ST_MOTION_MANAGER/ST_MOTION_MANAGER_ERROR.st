TYPE ST_MOTION_MANAGER_ERROR :
STRUCT
	POINT_INVALID : BOOL; // Целевая точка не прошла проверку
	GROUP_ERROR   : BOOL; // Группа осей завершила движение с ошибкой
	GLOBAL_STOP   : BOOL; // Получена глобальная ошибка ячейки
END_STRUCT
END_TYPE
