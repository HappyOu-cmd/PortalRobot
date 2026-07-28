TYPE ST_HMI :
STRUCT
	Command : ST_HMI_COMMAND; // Команды от HMI
	Status  : ST_HMI_STATUS; // Данные для отображения
	Diag    : ST_HMI_DIAG; // Состояние обмена HMI
	Error   : ST_HMI_ERRORS; // Зарезервированная диагностика ошибок HMI
	ActualX : LREAL; // Текущая координата X для совместимости с существующей визуализацией
	ActualY : LREAL; // Текущая координата Y для совместимости с существующей визуализацией
	ActualZ : LREAL; // Текущая координата Z для совместимости с существующей визуализацией
END_STRUCT
END_TYPE
