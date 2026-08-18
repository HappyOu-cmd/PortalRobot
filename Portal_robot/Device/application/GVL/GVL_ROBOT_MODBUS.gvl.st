{attribute 'qualified_only'}
VAR_GLOBAL
	xModeActive             : BOOL; // TRUE, когда применён MODBUS_TCP
	xRobotModeChangeAllowed : BOOL; // Авторитетное разрешение PLC
	xSettingsChangeAllowed  : BOOL; // Авторитетное разрешение PLC
	xReconnectRequest       : BOOL; // Одноцикловый запрос переподключения клиента
	Config                  : ST_ROBOT_MODBUS_CONFIG;
	Status                  : ST_ROBOT_MODBUS_STATUS;
	Command                 : ST_ROBOT_COMMAND;
	auiWriteRegisters       : ARRAY [0..8] OF UINT; // 1001..1009
	auiReadRegisters        : ARRAY [0..16] OF UINT; // 1101..1117
END_VAR
