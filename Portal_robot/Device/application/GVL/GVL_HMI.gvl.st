{attribute 'qualified_only'}
VAR_GLOBAL
	// Команды и настройки, получаемые от HMI.
	lrOffsetX          : LREAL; // Ручное смещение по оси X
	lrOffsetY          : LREAL; // Ручное смещение по оси Y
	lrOffsetZ          : LREAL; // Ручное смещение по оси Z
	xModbusMode        : BOOL; // TRUE: внешний робот по Modbus
	xMagazineEnable    : BOOL; // Импульс включения магазина
	xMagazineDisable   : BOOL; // Импульс отключения магазина
	xMagazineFillBlanks: BOOL; // Заполнить магазин с резервом обменного слота
	xMagazineClear     : BOOL; // Полностью очистить магазин
	axMachineUsed      : ARRAY [1..3] OF BOOL := [TRUE, FALSE, FALSE]; // Станки в автоматической работе
	xUseHmiCycleTime   : ARRAY [1..3] OF BOOL := [TRUE, TRUE, TRUE]; // Использовать заданное время цикла
	tMachineCycleTime  : ARRAY [1..3] OF TIME := [T#60S, T#60S, T#60S]; // Время цикла станков
	MagazineRows       : UINT := 10; // Число строк магазина
	MagazineColumns    : UINT := 7; // Число столбцов магазина
	MagazinePitchX     : LREAL := 60.0; // Шаг слотов по оси X
	MagazinePitchY     : LREAL := 60.0; // Шаг слотов по оси Y
	MagazineSafeZ      : LREAL := 300.0; // Безопасная координата магазина по оси Z
	stRobotCommand     : ST_ROBOT_COMMAND; // Ручная команда роботу или магазину

	// Данные, передаваемые в HMI.
	lrActualX : LREAL; // Текущая координата X
	lrActualY : LREAL; // Текущая координата Y
	lrActualZ : LREAL; // Текущая координата Z

	// Совместимость с существующей визуализацией до штатного обновления XML.
	HMI : ST_HMI; // Старый путь GVL_HMI.HMI.ActualX/Y/Z
END_VAR
