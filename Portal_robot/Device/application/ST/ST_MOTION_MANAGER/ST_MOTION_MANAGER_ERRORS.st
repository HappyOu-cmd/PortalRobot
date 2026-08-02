TYPE ST_MOTION_MANAGER_ERRORS :
STRUCT
	dwErrorActive : DWORD; // Битовая маска активных ошибок
	dwErrorLast   : DWORD; // Битовая маска последних ошибок
	dwAlarmActive : DWORD; // Собственные аварии менеджера движения для общего журнала
	stErrorActive : ST_MOTION_MANAGER_ERROR; // Расшифровка активных ошибок
	stErrorLast   : ST_MOTION_MANAGER_ERROR; // Расшифровка последних ошибок
END_STRUCT
END_TYPE
