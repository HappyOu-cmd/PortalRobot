TYPE ST_MACHINE_SIM_ERRORS :
STRUCT
	dwErrorActive : DWORD; // Битовая маска активных ошибок
	dwErrorLast   : DWORD; // Битовая маска последних ошибок
	stErrorActive : ST_MACHINE_SIM_ERROR; // Расшифровка активных ошибок
	stErrorLast   : ST_MACHINE_SIM_ERROR; // Расшифровка последних ошибок
END_STRUCT
END_TYPE
