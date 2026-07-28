TYPE ST_AXIS_GROUP_ERRORS :
STRUCT
	dwMotionErrorLatched  : DWORD; // Защёлкнутые ошибки SoftMotion
	dwLogicalErrorLatched : DWORD; // Защёлкнутые логические ошибки
	dwLogicalErrorNew     : DWORD; // Новые логические ошибки текущего цикла
	dwMotionErrorNew      : DWORD; // Новые ошибки SoftMotion текущего цикла
	dwMotionErrorActive   : DWORD; // Активные ошибки блоков SoftMotion
	dwMotionErrorPrevious : DWORD; // Ошибки SoftMotion предыдущего цикла
	dwMotionErrorLast     : DWORD; // Последняя ненулевая маска SoftMotion
	dwLogicalErrorLast    : DWORD; // Последняя ненулеевая логическая маска
	stErrorActive         : ST_AXIS_GROUP_ERROR; // Расшифровка активных ошибок
	stErrorLast           : ST_AXIS_GROUP_ERROR; // Расшифровка последних ошибок
END_STRUCT
END_TYPE
