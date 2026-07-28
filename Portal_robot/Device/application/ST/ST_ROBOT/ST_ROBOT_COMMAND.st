TYPE ST_ROBOT_COMMAND :
STRUCT
	xExecute : BOOL; // Команда запуска
	xStop    : BOOL; // Команда остановки
	xReset   : BOOL; // Команда сброса внешнего робота
	eAction  : E_ROBOT_ACTION; // Элементарное действие робота
	eSetPoint: E_POINT_NAME; // Имя точки или высокоуровневой команды
	iTakeSlot: SINT; // Номер слота с заготовкой
	iPutSlot : SINT; // Номер слота для готовой детали
END_STRUCT
END_TYPE
