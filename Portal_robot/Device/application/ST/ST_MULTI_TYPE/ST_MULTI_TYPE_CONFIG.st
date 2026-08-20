TYPE ST_MULTI_TYPE_CONFIG :
STRUCT
	uiTypeCount    : UINT; // Количество типов обрабатываемых деталей, 1..3
	auiMachineType : ARRAY [1..3] OF UINT; // Тип, закреплённый за каждым станком
	auiSlotType    : ARRAY [1..GVL_CELL_SETTINGS.NumberDetail] OF UINT; // Тип заготовки каждого слота
END_STRUCT
END_TYPE
