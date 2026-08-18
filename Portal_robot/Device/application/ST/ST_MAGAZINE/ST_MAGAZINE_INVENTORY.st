TYPE ST_MAGAZINE_INVENTORY :
STRUCT
	aZone1 : ARRAY [1..GVL_CELL_SETTINGS.MagazineZone1Slots] OF ST_DETAIL; // Загрузка оператором
	aZone2 : ARRAY [1..GVL_CELL_SETTINGS.MagazineZone2Slots] OF ST_DETAIL; // Рабочая зона робота
	aZone3 : ARRAY [1..GVL_CELL_SETTINGS.MagazineZone3Slots] OF ST_DETAIL; // Выход к ролику
END_STRUCT
END_TYPE
