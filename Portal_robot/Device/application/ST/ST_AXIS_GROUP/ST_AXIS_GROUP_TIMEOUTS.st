TYPE ST_AXIS_GROUP_TIMEOUTS :
STRUCT
    tPowerTimeout : TIME := T#5S; // Время ожидания включения или отключения питания
	tGroupTimeout : TIME := T#5S; // Время ожидания включения или отключения группы
    tStopTimeout  : TIME := T#5S; // Время ожидания остановки
	tHaltTimeout  : TIME := T#5S; // Время ожидания плавной остановки
    tHomeTimeout  : TIME := T#30S; // Время ожидания поиска домашней позиции
    tMoveTimeout  : TIME := T#30S; // Время ожидания завершения перемещения
END_STRUCT
END_TYPE
