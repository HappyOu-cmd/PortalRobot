TYPE ST_TWO_PALLET_REQUEST :
STRUCT
	uiMagazine : UINT; // 0: конфигурация линии; 1..2: отдельный магазин
	uiCommand : UINT;
	uiValue : UINT;
	uiSlot : UINT;
	uiContent : UINT;
	uiProductType : UINT;
	udiRevision : UDINT;
	Config : ST_TWO_PALLET_CONFIG;
END_STRUCT
END_TYPE
