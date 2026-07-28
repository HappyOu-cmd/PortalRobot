METHOD FIND_BLANK : SINT
VAR_INPUT
	iSlotCount : SINT; // Число слотов, участвующих в поиске
END_VAR
VAR_IN_OUT
	stDetail : ARRAY [1..GVL_CELL_SETTINGS.NumberDetail] OF ST_DETAIL; // Содержимое слотов магазина
END_VAR
VAR
	i : SINT; // Индекс проверяемого слота
END_VAR

// --- BEGIN IMPLEMENTATION ---

FIND_BLANK := 0;

FOR i:= 1 TO iSlotCount DO
	IF stDetail[i].xInPosition = TRUE AND stDetail[i].eDetailType =  E_DETAIL_TYPE.BLANK THEN
		FIND_BLANK := i;
		EXIT;	
	END_IF
END_FOR
