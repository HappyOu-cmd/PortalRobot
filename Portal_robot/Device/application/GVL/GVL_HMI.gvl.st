{attribute 'qualified_only'}
VAR_GLOBAL
	// Команды и настройки, получаемые от HMI.
	xCellEnable       : BOOL; // Импульс включения оборудования ячейки
	xCellDisable      : BOOL; // Импульс отключения оборудования ячейки
	xCellStart        : BOOL; // Импульс запуска автоматического цикла
	xCellStop         : BOOL; // Импульс остановки автоматического цикла
	xCellReset        : BOOL; // Общий сброс ошибок ячейки
	xCellManual       : BOOL; // Ручной режим управления ячейкой
	lrOffsetX          : LREAL; // Ручное смещение по оси X
	lrOffsetY          : LREAL; // Ручное смещение по оси Y
	lrOffsetZ          : LREAL; // Ручное смещение по оси Z
	xModbusMode        : BOOL; // TRUE: внешний робот по Modbus
	xMagazineEnable    : BOOL; // Импульс включения магазина
	xMagazineDisable   : BOOL; // Импульс отключения магазина
	xMagazineFillBlanks: BOOL; // Заполнить магазин с резервом обменного слота
	xMagazineClear     : BOOL; // Полностью очистить магазин
	axMachineEnable    : ARRAY [1..3] OF BOOL; // Импульсы включения отдельных станков
	axMachineDisable   : ARRAY [1..3] OF BOOL; // Импульсы отключения отдельных станков
	axMachineReset     : ARRAY [1..3] OF BOOL; // Команды сброса ошибок отдельных станков
	axMachineUsed      : ARRAY [1..3] OF BOOL := [TRUE, TRUE, TRUE]; // Станки в автоматической работе
	xUseHmiCycleTime   : ARRAY [1..3] OF BOOL := [TRUE, TRUE, TRUE]; // Использовать заданное время цикла
	tMachineCycleTime  : ARRAY [1..3] OF TIME := [T#60S, T#60S, T#60S]; // Время цикла станков
	MagazineRows       : UINT := 7; // Число строк магазина
	MagazineColumns    : UINT := 10; // Число столбцов магазина
	MagazinePitchX     : LREAL := 80.0; // Шаг слотов по оси X
	MagazinePitchY     : LREAL := 190.0; // Шаг слотов по оси Y
	MagazineSafeZ      : LREAL := 0.0; // Безопасная координата магазина по оси Z
	stRobotCommand     : ST_ROBOT_COMMAND; // Ручная команда роботу или магазину

	// Данные, передаваемые в HMI.
	udiPlcHeartbeat : UDINT; // Счётчик циклов PLC для контроля связи
	xGlobalError    : BOOL; // Активна общая ошибка ячейки
	lrActualX       : LREAL; // Текущая координата X
	lrActualY       : LREAL; // Текущая координата Y
	lrActualZ       : LREAL; // Текущая координата Z

	stCellStatus : ST_CELL_STATUS; // Рабочее состояние автоматического цикла
	stCellDiag   : ST_CELL_DIAG; // Текущий шаг менеджера ячейки
	stCellError  : ST_CELL_ERRORS; // Активные и последние ошибки менеджера ячейки

	stRobotStatus : ST_ROBOT_STATUS; // Состояние робота и двух захватов
	stRobotDiag   : ST_ROBOT_DIAG; // Текущее действие и целевая точка робота
	stRobotError  : ST_ROBOT_ERRORS; // Активные и последние ошибки робота

	astMachineStatus   : ARRAY [1..3] OF ST_MACHINE_PUBLIC; // Рабочие состояния станков
	astMachineIoStatus : ARRAY [1..3] OF ST_MACHINE_IO_STATUS; // Двери, патроны и циклы станков
	astMachineDiag     : ARRAY [1..3] OF ST_MACHINE_DIAG; // Текущие шаги и операции станков
	astMachineError    : ARRAY [1..3] OF ST_MACHINE_ERRORS; // Активные и последние ошибки станков

	stMagazineStatus : ST_MAGAZINE_STATUS; // Готовность и текущая операция магазина
	stMagazineDiag   : ST_MAGAZINE_DIAG; // Текущий шаг магазина
	stMagazineError  : ST_MAGAZINE_ERRORS; // Активные и последние ошибки магазина
	astMagazineSlot  : ARRAY [1..GVL_CELL_SETTINGS.NumberDetail] OF ST_DETAIL; // Содержимое слотов магазина

	// Совместимость с существующей визуализацией до штатного обновления XML.
	HMI : ST_HMI; // Старый путь GVL_HMI.HMI.ActualX/Y/Z
END_VAR
