TYPE ST_HMI_COMMAND :
STRUCT
	lrOffsetX       : LREAL; // Ручное смещение по оси X
	lrOffsetY       : LREAL; // Ручное смещение по оси Y
	lrOffsetZ       : LREAL; // Ручное смещение по оси Z
	xModbusMode     : BOOL; // TRUE: внешний робот по Modbus
	xMagazineEnable : BOOL; // Импульс включения магазина
	xMagazineDisable: BOOL; // Импульс отключения магазина
	xMagazineFillBlanks : BOOL; // Заполнить магазин заготовками с резервом обменного слота
	xMagazineClear      : BOOL; // Полностью очистить магазин
	axMachineUsed       : ARRAY [1..3] OF BOOL := [TRUE, FALSE, FALSE]; // Станки, введённые в автоматическую работу
	axMachineSetPartLoaded : ARRAY [1..3] OF BOOL; // Подтвердить наличие детали в патроне станка
	axMachineSetPartEmpty  : ARRAY [1..3] OF BOOL; // Подтвердить пустой патрон станка
	xUseHmiCycleTime    : ARRAY [1..3] OF BOOL := [TRUE, TRUE, TRUE]; // Использовать заданное время цикла
	tMachineCycleTime   : ARRAY [1..3] OF TIME := [T#60S, T#60S, T#60S]; // Начальное время цикла станков
	MagazineRows        : UINT := 10; // Число строк магазина
	MagazineColumns     : UINT := 7; // Число столбцов магазина
	MagazinePitchX      : LREAL := 60.0; // Шаг слотов магазина по оси X
	MagazinePitchY      : LREAL := 60.0; // Шаг слотов магазина по оси Y
	MagazineSafeZ       : LREAL := 300.0; // Безопасная координата магазина по оси Z
	stRobot          : ST_ROBOT_COMMAND; // Ручная команда роботу или магазину
END_STRUCT
END_TYPE
