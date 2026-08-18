TYPE ST_ROBOT_COMMAND :
STRUCT
	xExecute : BOOL; // Команда запуска
	xStop    : BOOL; // Команда остановки
	xReset   : BOOL; // Команда сброса внешнего робота
	eAction  : E_ROBOT_ACTION; // Элементарное действие робота
	eSetPoint: E_POINT_NAME; // Имя элементарной точки движения
	iActiveSlot : SINT; // Единственный слот, относительно которого выполняется команда
	uiMagazineId : UINT; // 0 вне магазина; 1 или 2 для точки соответствующего магазина
END_STRUCT
END_TYPE
