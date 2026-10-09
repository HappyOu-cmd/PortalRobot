{attribute 'qualified_only'}
VAR_GLOBAL
	Points : ARRAY [0..iPointNumber] OF ST_POINT; // Глобальная таблица именованных точек
END_VAR

VAR_GLOBAL PERSISTENT RETAIN
	// Постоянное хранилище базовых точек в энергонезависимой памяти контроллера.
	// Размер 15 сохранён ради совместимости со старой раскладкой: позиции 2, 6 и 10
	// (legacy MACHINE_x_INSIDE) больше не публикуются и не участвуют в готовности.
	astRetainPoints : ARRAY [1..iPersistentPointCapacity] OF ST_POINT;
	udiPointStorageVersion : UDINT;
END_VAR

VAR_GLOBAL CONSTANT 
	iPointNumber : INT := 100; // Максимальный индекс таблицы точек
	iEditablePointCount : INT := 14; // 12 прежних точек и 2 базы ГК
	iRequiredPointCount : INT := 12; // ГК проверяет свою настройку при включении станции
	iPersistentPointCapacity : INT := 15;
	udiExpectedPointStorageVersion : UDINT := UDINT#1;
END_VAR
