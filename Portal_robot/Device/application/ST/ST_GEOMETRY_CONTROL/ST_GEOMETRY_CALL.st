TYPE ST_GEOMETRY_CALL :
STRUCT
	udiId : UDINT; // Не меняется от вызова до результата контроля
	uiMachine : UINT;
	uiProductType : UINT;
	uiStation : UINT; // 0 до автоматического выбора свободного ГК
	xForced : BOOL;
	uiState : UINT; // 1 вызван, 2 в захвате/ожидание, 3 доставка, 4 на ГК, 5 в магазине, 6 отменён, 7 прерван, 8 изъят
	uiReason : UINT; // 1 заняты оба ГК, 2 нет доступного ГК, 3 отключён, 4 авария, 5 перезапуск/неопределённость
	uiMagazine : UINT;
	uiPallet : UINT;
	uiSlot : UINT;
END_STRUCT
END_TYPE
