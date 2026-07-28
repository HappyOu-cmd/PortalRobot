TYPE ST_AXIS_TIMEOUTS :
STRUCT
	xDisableOnError : BOOL := TRUE; // Отключать привод при логической ошибке
    tPowerTimeout   : TIME := T#5S; // Время ожидания включения или отключения питания
    tResetTimeout   : TIME := T#5S; // Время ожидания сброса ошибки
    tStopTimeout    : TIME := T#5S; // Время ожидания остановки
    tHomeTimeout    : TIME := T#30S; // Время ожидания поиска домашней позиции
    tMoveTimeout    : TIME := T#15S; // Время ожидания завершения перемещения
END_STRUCT
END_TYPE
