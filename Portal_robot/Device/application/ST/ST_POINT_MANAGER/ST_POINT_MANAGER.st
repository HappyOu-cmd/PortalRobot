TYPE ST_POINT_MANAGER :
STRUCT
	Command : ST_POINT_MANAGER_COMMAND; // Команды менеджера точки
	Status  : ST_POINT_MANAGER_STATUS; // Рабочие статусы менеджера точки
	Diag    : ST_POINT_MANAGER_DIAG; // Состояние автомата и допустимые пределы
	Error   : ST_POINT_MANAGER_ERRORS; // Активные и последние ошибки
END_STRUCT
END_TYPE
