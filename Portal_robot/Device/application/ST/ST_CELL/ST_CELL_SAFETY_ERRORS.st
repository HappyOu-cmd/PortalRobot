TYPE ST_CELL_SAFETY_ERRORS :
STRUCT
	dwErrorActive : DWORD; // Текущие отдельные Safety-причины
	dwErrorLast   : DWORD; // Последняя ненулевая маска для диагностики
	dwAlarmActive : DWORD; // Собственные аварии источника для общего журнала
END_STRUCT
END_TYPE
