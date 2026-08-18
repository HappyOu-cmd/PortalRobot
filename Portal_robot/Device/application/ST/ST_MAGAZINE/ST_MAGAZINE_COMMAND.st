TYPE ST_MAGAZINE_COMMAND :
STRUCT
	xEnable  : BOOL; // Импульс включения магазина
	xDisable : BOOL; // Импульс отключения магазина
	xExecute : BOOL; // Запуск выбранной операции
	xStop    : BOOL; // Остановка текущей операции
	eOperation : E_MAGAZINE_OPERATION; // Операция автоматического цикла
	iTakeSlot  : SINT; // Слот заготовки для TAKE/CHANGE
	iPutSlot   : SINT; // Слот укладки для PUT/CHANGE/RETURN_BLANK
END_STRUCT
END_TYPE
