{attribute 'qualified_only'}
VAR_GLOBAL
	Points : ARRAY [0..iPointNumber] OF ST_POINT; // Глобальная таблица именованных точек
END_VAR

VAR_GLOBAL CONSTANT 
	iPointNumber : INT := 100; // Максимальный индекс таблицы точек
	iEditablePointCount : INT := 14; // 12 прежних точек и 2 базы ГК
	iRequiredPointCount : INT := 12; // ГК проверяет свою настройку при включении станции
	iPersistentPointCapacity : INT := 15;
	udiExpectedPointStorageVersion : UDINT := UDINT#1;
END_VAR
