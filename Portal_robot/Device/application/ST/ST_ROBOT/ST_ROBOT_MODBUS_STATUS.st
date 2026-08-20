TYPE ST_ROBOT_MODBUS_STATUS :
STRUCT
	xConfigValid       : BOOL; // Параметры соединения прошли проверку PLC
	xConnected         : BOOL; // TCP-соединение установлено
	xCommunicationAlive: BOOL; // Получена свежая обратная связь и меняется heartbeat
	xStatusFresh       : BOOL; // После подключения успешно прочитан блок 1101..1117
	xControllerOn      : BOOL;
	xAutomaticMode     : BOOL;
	xRemoteEnabled     : BOOL;
	xDrivesEnabled     : BOOL;
	xHomed             : BOOL;
	xEmergencyStop     : BOOL;
	xRobotAlarm        : BOOL;
	xPositionValid     : BOOL;
	xSimulatorActive   : BOOL; // Бит 1108.9: подключён Python-симулятор, а не реальный SC-500
	xReady             : BOOL; // Итоговая готовность, пересчитанная PLC
	xBusy              : BOOL;
	xDone              : BOOL;
	xError             : BOOL; // Ошибка исполнения, робота или транспорта
	xCommandTimeout    : BOOL; // Робот не завершил принятую команду за лимит
	uiAckSeq           : UINT;
	uiExecutionState   : UINT;
	uiResultCode       : UINT;
	uiActiveCommand    : UINT;
	uiCurrentPoint     : UINT;
	uiGripperStatus    : UINT;
	uiRobotHeartbeat   : UINT;
	uiStatusWord       : UINT;
	uiAlarmCode        : UINT;
	uiOperationPhase   : UINT;
	uiProtocolVersion  : UINT;
	lrActualX          : LREAL;
	lrActualY          : LREAL;
	lrActualZ          : LREAL;
	udiClientError     : UDINT;
	udiReadError       : UDINT;
	udiWriteError      : UDINT;
END_STRUCT
END_TYPE
