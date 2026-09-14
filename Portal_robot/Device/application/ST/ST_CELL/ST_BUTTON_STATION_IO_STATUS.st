TYPE ST_BUTTON_STATION_IO_STATUS :
STRUCT
	xEmergencyStopPressed : BOOL; // Нормализованный вход: TRUE — грибок нажат
	xButtonPressed        : BOOL; // Нормализованный вход кнопки открытия замка
	xButtonLightOn        : BOOL; // Фактический выход подсветки кнопки
END_STRUCT
END_TYPE
