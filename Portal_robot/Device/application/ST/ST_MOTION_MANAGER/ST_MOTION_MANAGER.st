TYPE ST_MOTION_MANAGER :
STRUCT
	Command : ST_MOTION_MANAGER_COMMAND; // Команды менеджеру движения
	Status  : ST_MOTION_MANAGER_STATUS; // Рабочие статусы менеджера движения
	Diag    : ST_MOTION_MANAGER_DIAG; // Состояние автомата менеджера движения
	Error   : ST_MOTION_MANAGER_ERRORS; // Активные и последние ошибки
END_STRUCT
END_TYPE
