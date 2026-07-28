TYPE ST_AXIS_GROUP :
STRUCT
	Command     : ST_AXIS_GROUP_COMMANDS; // Команды группы осей
	Status      : ST_AXIS_GROUP_STATUS; // Рабочие статусы группы
	Diag        : ST_AXIS_GROUP_DIAGNOSTICS; // Состояние автомата и диагностика
	Error       : ST_AXIS_GROUP_ERRORS; // Активные и последние ошибки
	MotionParam : ST_AXIS_GROUP_MOTION_PARAMS; // Параметры движения
	Timeouts    : ST_AXIS_GROUP_TIMEOUTS; // Допустимое время выполнения шагов
END_STRUCT
END_TYPE
