TYPE ST_MAGAZINE_STATUS :
STRUCT
	xEnabled         : BOOL; // Магазин включен в работу
	xReady 			 : BOOL;
	xBusy  			 : BOOL;
	xDone  			 : BOOL;
	xOutBlank        : BOOL; // В магазине не осталось свободных заготовок
	xOutFreeSlot     : BOOL; // В магазине не осталось свободных слотов
	xFinished        : BOOL; // Магазин готов к отгрузке
	iCurrentBlank    : SINT; // Минимальный номер заготовки в матрице
	iCurrentFreeSlot : SINT; // Минимальный номер свободного слота в матрице
	
END_STRUCT
END_TYPE
