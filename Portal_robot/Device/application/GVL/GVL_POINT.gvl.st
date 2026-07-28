{attribute 'qualified_only'}
VAR_GLOBAL
	Points : ARRAY [0..iPointNumber] OF ST_POINT; // Глобальная таблица именованных точек
END_VAR

VAR_GLOBAL CONSTANT 
	iPointNumber : INT := 100; // Максимальный индекс таблицы точек
END_VAR
