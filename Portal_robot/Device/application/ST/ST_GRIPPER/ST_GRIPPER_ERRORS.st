TYPE ST_GRIPPER_ERRORS :
STRUCT
	dwErrorActive : DWORD; // Битовая маска активных ошибок
	dwErrorLast   : DWORD; // Битовая маска последних ошибок
	stErrorActive : ST_GRIPPER_ERROR; // Расшифровка активных ошибок
	stErrorLast   : ST_GRIPPER_ERROR; // Расшифровка последних ошибок
END_STRUCT
END_TYPE
