TYPE ST_POINT_MANAGER_STATUS :
STRUCT
	xBusy    : BOOL; // Выполняется проверка точки
	xDone    : BOOL; // Проверка точки завершена
	xInvalid : BOOL; // Точка содержит недопустимые параметры
END_STRUCT
END_TYPE
