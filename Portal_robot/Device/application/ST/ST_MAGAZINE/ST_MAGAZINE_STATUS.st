TYPE ST_MAGAZINE_STATUS :
STRUCT
	xEnabled         : BOOL; // Магазин включен в работу
	xReady 			 : BOOL; // Магазин готов принять команду
	xBusy  			 : BOOL; // Выполняется операция магазина
	xDone  			 : BOOL; // Операция магазина завершена
	xError          : BOOL; // Магазин находится в ошибке
	xOutBlank        : BOOL; // В магазине не осталось свободных заготовок
	xOutFreeSlot     : BOOL; // В магазине не осталось свободных слотов
	xFinished        : BOOL; // Магазин готов к отгрузке
	iCurrentBlank    : SINT; // Минимальный номер заготовки в матрице
	iCurrentFreeSlot : SINT; // Минимальный номер свободного слота в матрице
	iSelectedBlank   : SINT; // Номер заготовки, выбранной для текущей операции
	iSelectedFreeSlot: SINT; // Номер свободного слота, выбранного для текущей операции
	eGrantedOperation: E_MAGAZINE_OPERATION; // Доступная операция по текущему состоянию магазина
	eActualOperation : E_MAGAZINE_OPERATION; // Выполняемая операция магазина
	
END_STRUCT
END_TYPE
