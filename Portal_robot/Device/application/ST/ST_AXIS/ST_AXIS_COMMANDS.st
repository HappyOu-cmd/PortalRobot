TYPE ST_AXIS_COMMANDS :
STRUCT
    xEnable            : BOOL; // Импульс запроса включения оси
    xDisable           : BOOL; // Импульс запроса отключения оси
	xGlobalError       : BOOL; // Глобальная ошибка ячейки
	xPowerPermit       : BOOL; // Разрешение подачи питания на привод
    xResetAllError     : BOOL; // Общий сброс ошибок оси
    xResetAxisError    : BOOL; // Сброс ошибок привода и SoftMotion
    xResetLogicalError : BOOL; // Сброс логических ошибок блока
    xStop              : BOOL; // Команда контролируемой остановки
    xHome              : BOOL; // Команда поиска домашней позиции
    xMoveAbsolute      : BOOL; // Команда абсолютного перемещения
    xMoveRelative      : BOOL; // Команда относительного перемещения
    xJogPositive       : BOOL; // Толчковое движение в положительном направлении
    xJogNegative       : BOOL; // Толчковое движение в отрицательном направлении
END_STRUCT
END_TYPE
