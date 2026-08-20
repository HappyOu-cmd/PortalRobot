TYPE ST_MAGAZINE_TYPE_STATUS :
STRUCT
	aiBlankSlot    : ARRAY [1..3] OF SINT; // Первая заготовка каждого типа
	aiFreeSlot     : ARRAY [1..3] OF SINT; // Первый свободный слот каждого типа
	auiBlankCount  : ARRAY [1..3] OF UINT; // Количество заготовок каждого типа
	auiDetailCount : ARRAY [1..3] OF UINT; // Количество готовых деталей каждого типа
	auiFreeCount   : ARRAY [1..3] OF UINT; // Количество свободных слотов каждого типа
END_STRUCT
END_TYPE
