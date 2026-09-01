{attribute 'qualified_only'}
VAR_GLOBAL
	Points : ARRAY [0..iPointNumber] OF ST_POINT; // Глобальная таблица именованных точек
END_VAR

VAR_GLOBAL RETAIN
	// Отдельное хранилище только для 15 редактируемых базовых точек.
	// Временные магазинные точки намеренно не сохраняются между запусками.
	astRetainPoints : ARRAY [1..iEditablePointCount] OF ST_POINT;
	udiPointStorageVersion : UDINT;
END_VAR

VAR_GLOBAL CONSTANT 
	iPointNumber : INT := 100; // Максимальный индекс таблицы точек
	iEditablePointCount : INT := 15;
	udiExpectedPointStorageVersion : UDINT := UDINT#1;
END_VAR
