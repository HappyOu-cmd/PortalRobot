TYPE ST_AXIS :
STRUCT
	Command     : ST_AXIS_COMMANDS; // Команды оси
	Status      : ST_AXIS_STATUS; // Рабочие статусы оси
	Diag        : ST_AXIS_DIAGNOSTICS; // Состояние автомата и текстовая диагностика
	Error       : ST_AXIS_ERROR_CODES; // Активные и последние ошибки
	MotionParam : ST_AXIS_MOTION_PARAMS; // Параметры движения
	Timeouts    : ST_AXIS_TIMEOUTS; // Допустимое время выполнения шагов

END_STRUCT
END_TYPE
