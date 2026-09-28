TYPE ST_TWO_PALLET_STORE :
STRUCT
	astPallet : ARRAY [1..2] OF ST_MAGAZINE_INVENTORY;
	axLoaded : ARRAY [1..2] OF BOOL; // Снимается после обмена и каждого редактирования
END_STRUCT
END_TYPE
