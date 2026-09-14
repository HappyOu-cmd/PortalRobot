TYPE ST_CONTROL_CABINET_IO_STATUS :
STRUCT
	xEmergencyStopPressed : BOOL; // Нормализованный вход: TRUE — грибок нажат
	xStartPressed         : BOOL; // Физическая кнопка «Включить ячейку»
	xStopPressed          : BOOL; // Физическая кнопка «Выключить ячейку»
	xResetPressed         : BOOL; // Физическая кнопка общего сброса ошибок
END_STRUCT
END_TYPE
