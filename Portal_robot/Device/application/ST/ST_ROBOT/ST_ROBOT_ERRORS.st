TYPE ST_ROBOT_ERRORS :
STRUCT
	dwErrorActive : DWORD; // Битовая маска активных ошибок
	dwErrorLast   : DWORD; // Битовая маска последних ошибок
	dwAlarmActive : DWORD; // Собственные аварии робота для общего журнала
	stErrorActive : ST_ROBOT_ERROR; // Расшифровка активных ошибок
	stErrorLast   : ST_ROBOT_ERROR; // Расшифровка последних ошибок
END_STRUCT
END_TYPE
