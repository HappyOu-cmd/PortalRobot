TYPE ST_HMI_COMMAND :
STRUCT
	lrOffsetX       : LREAL; // Ручное смещение по оси X
	lrOffsetY       : LREAL; // Ручное смещение по оси Y
	lrOffsetZ       : LREAL; // Ручное смещение по оси Z
	xModbusMode     : BOOL; // TRUE: внешний робот по Modbus
	xMagazineEnable : BOOL; // Импульс включения магазина
	xMagazineDisable: BOOL; // Импульс отключения магазина
	stRobot          : ST_ROBOT_COMMAND; // Ручная команда роботу или магазину
END_STRUCT
END_TYPE
