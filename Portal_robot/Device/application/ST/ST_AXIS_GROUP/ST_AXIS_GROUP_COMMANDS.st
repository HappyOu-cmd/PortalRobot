TYPE ST_AXIS_GROUP_COMMANDS :
STRUCT
	xGlobalError : BOOL; // Глобальная ошибка ячейки
	xPowerPermit : BOOL; // Разрешение включения группы при готовых физических осях
	xEnable      : BOOL; // Импульс включения группы
	xPowerEnable : BOOL; // Импульс включения группы после включения осей FB_AXIS
	xDisable     : BOOL; // Импульс отключения группы
	xReset       : BOOL; // Сброс ошибок группы
	xMoveDirect  : BOOL; // Команда прямого перемещения группы
	xMoveLinear  : BOOL; // Команда линейного перемещения группы
	xHaltCmd     : BOOL; // Команда плавной остановки
	xStopCmd     : BOOL; // Команда остановки группы
END_STRUCT
END_TYPE
