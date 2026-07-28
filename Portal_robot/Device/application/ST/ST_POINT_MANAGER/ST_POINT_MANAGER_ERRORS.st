TYPE ST_POINT_MANAGER_ERRORS :
STRUCT
	dwErrorActive : DWORD; // Битовая маска активных ошибок
	dwErrorLast   : DWORD; // Битовая маска последних ошибок
	stErrorActive : ST_POINT_MANAGER_ERROR; // Расшифровка активных ошибок
	stErrorLast   : ST_POINT_MANAGER_ERROR; // Расшифровка последних ошибок
END_STRUCT
END_TYPE
