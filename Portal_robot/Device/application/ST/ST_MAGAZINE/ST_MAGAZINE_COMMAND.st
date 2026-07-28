TYPE ST_MAGAZINE_COMMAND :
STRUCT
	xEnable  : BOOL; // Импульс включения магазина
	xDisable : BOOL; // Импульс отключения магазина
	xExecute : BOOL; // Запуск выбранной операции
	xStop    : BOOL; // Остановка текущей операции
END_STRUCT
END_TYPE
