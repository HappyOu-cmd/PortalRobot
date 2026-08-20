TYPE ST_ROBOT_MODBUS_CONFIG :
STRUCT
	aIpAddress        : ARRAY [0..3] OF BYTE; // IPv4 контроллера робота
	uiPort            : UINT := UINT#502; // TCP-порт Modbus
	uiUnitId          : UINT := UINT#1; // Unit ID в Modbus TCP
	tResponseTimeout  : TIME := T#500MS; // Ожидание ответа FC03/FC16
	tPollInterval     : TIME := T#50MS; // Период чтения обратной связи
	tHeartbeatTimeout : TIME := T#2S; // Максимальная пауза heartbeat робота
	tCommandTimeout   : TIME := T#600S; // Предельная длительность одной команды
END_STRUCT
END_TYPE
