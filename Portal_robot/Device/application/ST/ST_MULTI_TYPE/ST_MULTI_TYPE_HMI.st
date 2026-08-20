TYPE ST_MULTI_TYPE_HMI :
STRUCT
	Command      : ST_MULTI_TYPE_COMMAND; // Команды конфигурации от HMI
	Config       : ST_MULTI_TYPE_CONFIG; // Фактически принятая конфигурация
	ConfigStatus : ST_MULTI_TYPE_CONFIG_STATUS; // Разрешения и диагностика конфигурации
	CycleStatus  : ST_CELL_CYCLE_STATUS; // Диагностика универсального цикла
END_STRUCT
END_TYPE
