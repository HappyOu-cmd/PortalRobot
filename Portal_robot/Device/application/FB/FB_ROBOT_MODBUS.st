FUNCTION_BLOCK FB_ROBOT_MODBUS
VAR_INPUT
	xEnable          : BOOL; // Применён режим MODBUS_TCP
	xReconnect       : BOOL; // Настройки изменены, выполнить reconnect
	Config           : ST_ROBOT_MODBUS_CONFIG;
	Command          : ST_ROBOT_COMMAND; // Семантическая команда FB_ROBOT
END_VAR
VAR_OUTPUT
	Status           : ST_ROBOT_MODBUS_STATUS;
END_VAR
VAR_IN_OUT
	auiWriteRegisters : ARRAY [0..8] OF UINT; // Документные адреса 1001..1009
	auiReadRegisters  : ARRAY [0..16] OF UINT; // Документные адреса 1101..1117
END_VAR
VAR
	{attribute 'no_assign'}
	fbClient       : ModbusFB.ClientTCP;
	fbRead         : ModbusFB.ClientRequestReadHoldingRegisters;
	fbWrite        : ModbusFB.ClientRequestWriteMultipleRegisters;
	eState         : E_ROBOT_MODBUS_CLIENT_STATE := E_ROBOT_MODBUS_CLIENT_STATE.DISABLED;
	xConnect       : BOOL;
	xReadExecute   : BOOL;
	xWriteExecute  : BOOL;
	xStatusFresh   : BOOL;
	xCommandArmed  : BOOL;
	xCommandActive : BOOL;
	xWritePending  : BOOL;
	xHeartbeatChanged : BOOL;
	xHeartbeatSeen : BOOL;
	xPlcHeartbeatDue : BOOL;
	xStopPending   : BOOL;
	xResetPending  : BOOL;
	xControlClearPending : BOOL;
	rtStop         : R_TRIG;
	rtReset        : R_TRIG;
	rtReconnect    : R_TRIG;
	tonPoll        : TON;
	tonPlcHeartbeat: TON;
	tonRobotHeartbeat : TON;
	tonCommunicationGrace : TON;
	tonCommandTimeout : TON;
	tonReconnect   : TON;
	uiCommandSeq   : UINT;
	uiActiveSeq    : UINT;
	uiDecodedRobotHeartbeat : UINT; // Heartbeat из последнего завершённого FC03
	uiPositionXHigh : UINT; // Координаты из того же завершённого FC03-снимка
	uiPositionXLow  : UINT;
	uiPositionYHigh : UINT;
	uiPositionYLow  : UINT;
	uiPositionZHigh : UINT;
	uiPositionZLow  : UINT;
	uiPlcHeartbeat : UINT;
	uiLastRobotHeartbeat : UINT;
	uiCommandCode  : UINT;
	uiRegisterIndex : UINT;
	dwPositionRaw  : DWORD;
	diPositionRaw  : DINT;
	udiReplyTimeoutUs : UDINT;
END_VAR
VAR CONSTANT
	COMMAND_START_ITEM : UINT := UINT#1000; // Документный 1001
	STATUS_START_ITEM  : UINT := UINT#1100; // Документный 1101
	COMMAND_QUANTITY   : UINT := UINT#9;
	STATUS_QUANTITY    : UINT := UINT#17;
	PROTOCOL_VERSION   : UINT := UINT#3;
	STATUS_CONTROLLER_ON  : UINT := UINT#16#0001;
	STATUS_AUTOMATIC_MODE : UINT := UINT#16#0002;
	STATUS_REMOTE_ENABLED : UINT := UINT#16#0004;
	STATUS_DRIVES_ENABLED : UINT := UINT#16#0008;
	STATUS_HOMED          : UINT := UINT#16#0010;
	STATUS_EMERGENCY_STOP : UINT := UINT#16#0020;
	STATUS_ROBOT_ALARM    : UINT := UINT#16#0040;
	STATUS_ROBOT_READY    : UINT := UINT#16#0080;
	STATUS_POSITION_VALID : UINT := UINT#16#0100;
	STATUS_SIMULATOR_ACTIVE : UINT := UINT#16#0200;
END_VAR

// --- BEGIN IMPLEMENTATION ---

Status.xConfigValid := (Config.aIpAddress[0] > BYTE#0)
	AND (Config.aIpAddress[0] < BYTE#224)
	AND (Config.uiPort > UINT#0)
	AND (Config.uiUnitId <= UINT#255)
	AND (Config.tResponseTimeout >= T#50MS)
	AND (Config.tPollInterval >= T#10MS)
	AND (Config.tHeartbeatTimeout >= T#500MS);

	udiReplyTimeoutUs := TIME_TO_UDINT(Config.tResponseTimeout) * UDINT#1000;
	rtStop(CLK := Command.xStop);
	rtReset(CLK := Command.xReset);
	rtReconnect(CLK := xReconnect);
	IF rtStop.Q THEN
		xStopPending := TRUE;
	END_IF;
	IF rtReset.Q THEN
		xResetPending := TRUE;
	END_IF;
xReadExecute := FALSE;
xWriteExecute := FALSE;
xHeartbeatChanged := FALSE;

fbClient(
	xConnect := xConnect,
	aIPaddr := Config.aIpAddress,
	uiPort := Config.uiPort,
	tConnnectTimeOut := Config.tHeartbeatTimeout
);

IF NOT xEnable OR NOT Status.xConfigValid THEN
	xConnect := FALSE;
	eState := E_ROBOT_MODBUS_CLIENT_STATE.DISABLED;
	xStatusFresh := FALSE;
	xCommandArmed := FALSE;
	xCommandActive := FALSE;
	xWritePending := FALSE;
	xStopPending := FALSE;
	xResetPending := FALSE;
	xControlClearPending := FALSE;
	xHeartbeatSeen := FALSE;
	xPlcHeartbeatDue := FALSE;
	uiActiveSeq := UINT#0;
	Status.xConnected := FALSE;
ELSE
	xConnect := TRUE;
	IF rtReconnect.Q THEN
		xConnect := FALSE;
		eState := E_ROBOT_MODBUS_CLIENT_STATE.RECONNECT_WAIT;
		xStatusFresh := FALSE;
		xCommandArmed := FALSE;
		xCommandActive := FALSE;
		xWritePending := FALSE;
		xControlClearPending := FALSE;
		xHeartbeatSeen := FALSE;
		xPlcHeartbeatDue := FALSE;
	END_IF;
END_IF;

CASE eState OF
	E_ROBOT_MODBUS_CLIENT_STATE.DISABLED:
		IF xEnable AND Status.xConfigValid THEN
			xConnect := TRUE;
			eState := E_ROBOT_MODBUS_CLIENT_STATE.CONNECTING;
		END_IF;

	E_ROBOT_MODBUS_CLIENT_STATE.CONNECTING:
		IF fbClient.xConnected THEN
			eState := E_ROBOT_MODBUS_CLIENT_STATE.INITIAL_READ;
		ELSIF fbClient.xError THEN
			Status.udiClientError := TO_UDINT(fbClient.eErrorID);
			xConnect := FALSE;
			eState := E_ROBOT_MODBUS_CLIENT_STATE.RECONNECT_WAIT;
		END_IF;

	E_ROBOT_MODBUS_CLIENT_STATE.INITIAL_READ:
		xReadExecute := TRUE;
		IF fbRead.xDone THEN
			xStatusFresh := TRUE;
			uiCommandSeq := auiReadRegisters[0];
			uiActiveSeq := UINT#0;
			uiPlcHeartbeat := UINT#0;
			uiLastRobotHeartbeat := auiReadRegisters[6];
			xHeartbeatSeen := FALSE;
			FOR uiRegisterIndex := UINT#0 TO UINT#8 DO
				auiWriteRegisters[uiRegisterIndex] := UINT#0;
			END_FOR;
			auiWriteRegisters[7] := uiCommandSeq;
			eState := E_ROBOT_MODBUS_CLIENT_STATE.INITIAL_READ_RELEASE;
		ELSIF fbRead.xError THEN
			Status.udiReadError := TO_UDINT(fbRead.eErrorID);
			xConnect := FALSE;
			eState := E_ROBOT_MODBUS_CLIENT_STATE.RECONNECT_WAIT;
		END_IF;

	E_ROBOT_MODBUS_CLIENT_STATE.INITIAL_READ_RELEASE:
		IF NOT fbRead.xBusy THEN
			eState := E_ROBOT_MODBUS_CLIENT_STATE.CLEAR_COMMAND;
		END_IF;

	E_ROBOT_MODBUS_CLIENT_STATE.CLEAR_COMMAND:
		xWriteExecute := TRUE;
		IF fbWrite.xDone THEN
			eState := E_ROBOT_MODBUS_CLIENT_STATE.CLEAR_COMMAND_RELEASE;
		ELSIF fbWrite.xError THEN
			Status.udiWriteError := TO_UDINT(fbWrite.eErrorID);
			xConnect := FALSE;
			eState := E_ROBOT_MODBUS_CLIENT_STATE.RECONNECT_WAIT;
		END_IF;

	E_ROBOT_MODBUS_CLIENT_STATE.CLEAR_COMMAND_RELEASE:
		IF NOT fbWrite.xBusy THEN
			xCommandArmed := NOT Command.xExecute;
			xCommandActive := FALSE;
			eState := E_ROBOT_MODBUS_CLIENT_STATE.READY;
		END_IF;

	E_ROBOT_MODBUS_CLIENT_STATE.READY:
		IF NOT fbClient.xConnected OR fbClient.xError THEN
			Status.udiClientError := TO_UDINT(fbClient.eErrorID);
			xConnect := FALSE;
			eState := E_ROBOT_MODBUS_CLIENT_STATE.RECONNECT_WAIT;
		ELSIF xStopPending THEN
			// Stop always preempts Reset and normal commands.
			// Execute снимается сразу: после принятого CommandSeq это не отменяет
			// команду, зато позволяет роботу выйти из DONE/ERROR/STOPPED в IDLE.
			// Без этого уже завершённая дискретная команда навечно удерживала
			// Execute=1, а xControlClearPending ждал недостижимый IDLE.
			auiWriteRegisters[0] := UINT#0;
			auiWriteRegisters[1] := UINT#0;
			auiWriteRegisters[2] := UINT#1;
			auiWriteRegisters[3] := UINT#0;
			auiWriteRegisters[4] := UINT#0;
			auiWriteRegisters[5] := UINT#0;
			auiWriteRegisters[6] := UINT#0;
			xStopPending := FALSE;
			xResetPending := FALSE;
			xControlClearPending := TRUE;
			xWritePending := TRUE;
		ELSIF xResetPending THEN
			// Reset обязан прервать незавершённую очистку Stop. Иначе
			// xControlClearPending имеет приоритет и защёлкнутый Reset никогда
			// не попадает в регистр 1004.
			auiWriteRegisters[0] := UINT#0;
			auiWriteRegisters[1] := UINT#0;
			auiWriteRegisters[2] := UINT#0;
			auiWriteRegisters[3] := UINT#1;
			auiWriteRegisters[4] := UINT#0;
			auiWriteRegisters[5] := UINT#0;
			auiWriteRegisters[6] := UINT#0;
			xCommandActive := FALSE;
			uiActiveSeq := UINT#0;
			xCommandArmed := FALSE;
			xResetPending := FALSE;
			xControlClearPending := TRUE;
			xWritePending := TRUE;
		ELSIF xControlClearPending THEN
			// Stop удерживается до STOPPED/IDLE, Reset — до снятия аварии. Так
			// импульс не потеряется между более медленными циклами программы робота.
			IF ((auiWriteRegisters[2] = UINT#1)
				AND ((Status.uiExecutionState = TO_UINT(E_ROBOT_MODBUS_EXECUTION_STATE.STOPPED))
					OR (Status.uiExecutionState = TO_UINT(E_ROBOT_MODBUS_EXECUTION_STATE.IDLE))))
			OR ((auiWriteRegisters[3] = UINT#1)
				AND NOT Status.xRobotAlarm
				AND (Status.uiExecutionState =
					TO_UINT(E_ROBOT_MODBUS_EXECUTION_STATE.IDLE))) THEN
				auiWriteRegisters[2] := UINT#0;
				auiWriteRegisters[3] := UINT#0;
				xCommandActive := FALSE;
				uiActiveSeq := UINT#0;
				// Верхний FB удерживает Execute до появления Busy. Поэтому после
				// подтверждённой очистки принимаем уже удерживаемую новую команду,
				// а не требуем ещё одного фронта от HMI.
				xCommandArmed := TRUE;
				xControlClearPending := FALSE;
				xWritePending := TRUE;
			END_IF;
		ELSIF Command.xExecute AND xCommandArmed AND NOT xCommandActive THEN
			uiCommandCode := UINT#0;
			CASE Command.eAction OF
				E_ROBOT_ACTION.MOVE_TO_POINT:
					CASE Command.eSetPoint OF
						E_POINT_NAME.MACHINE_1_ABOVE: uiCommandCode := UINT#10;
						E_POINT_NAME.MACHINE_1_INSIDE: uiCommandCode := UINT#11;
						E_POINT_NAME.MACHINE_1_CHUCK_APROACH: uiCommandCode := UINT#12;
						E_POINT_NAME.MACHINE_1_CHUCK_POSITION: uiCommandCode := UINT#13;
						E_POINT_NAME.MACHINE_2_ABOVE: uiCommandCode := UINT#14;
						E_POINT_NAME.MACHINE_2_INSIDE: uiCommandCode := UINT#15;
						E_POINT_NAME.MACHINE_2_CHUCK_APROACH: uiCommandCode := UINT#16;
						E_POINT_NAME.MACHINE_2_CHUCK_POSITION: uiCommandCode := UINT#17;
						E_POINT_NAME.MACHINE_3_ABOVE: uiCommandCode := UINT#18;
						E_POINT_NAME.MACHINE_3_INSIDE: uiCommandCode := UINT#19;
						E_POINT_NAME.MACHINE_3_CHUCK_APROACH: uiCommandCode := UINT#20;
						E_POINT_NAME.MACHINE_3_CHUCK_POSITION: uiCommandCode := UINT#21;
						E_POINT_NAME.HOME_SAFETY: uiCommandCode := UINT#22;
						E_POINT_NAME.MAGAZINE_SAFE: uiCommandCode := UINT#23;
						E_POINT_NAME.MAGAZINE_CHANGE: uiCommandCode := UINT#24;
						E_POINT_NAME.MAGAZINE_IN_SLOT: uiCommandCode := UINT#25;
					END_CASE;
				E_ROBOT_ACTION.UNCLAMP_1: uiCommandCode := UINT#2;
				E_ROBOT_ACTION.CLAMP_1: uiCommandCode := UINT#3;
				E_ROBOT_ACTION.UNCLAMP_2: uiCommandCode := UINT#4;
				E_ROBOT_ACTION.CLAMP_2: uiCommandCode := UINT#5;
				E_ROBOT_ACTION.ROTATE_TO_BLANK: uiCommandCode := UINT#6;
				E_ROBOT_ACTION.ROTATE_TO_DETAIL: uiCommandCode := UINT#7;
			END_CASE;

			IF uiCommandCode > UINT#0 THEN
				uiCommandSeq := uiCommandSeq + UINT#1;
				IF uiCommandSeq = UINT#0 THEN
					uiCommandSeq := UINT#1;
				END_IF;
				uiActiveSeq := uiCommandSeq;
				auiWriteRegisters[0] := uiCommandCode;
				auiWriteRegisters[1] := UINT#1;
				auiWriteRegisters[2] := UINT#0;
				auiWriteRegisters[3] := UINT#0;
				auiWriteRegisters[4] := SINT_TO_UINT(Command.iActiveSlot);
				auiWriteRegisters[5] := Command.uiMagazineId;
				auiWriteRegisters[6] := UINT#0;
				auiWriteRegisters[7] := uiCommandSeq;
				xCommandActive := TRUE;
				xCommandArmed := FALSE;
				xWritePending := TRUE;
			END_IF;
		ELSIF NOT Command.xExecute AND xCommandActive THEN
			auiWriteRegisters[0] := UINT#0;
			auiWriteRegisters[1] := UINT#0;
			auiWriteRegisters[2] := UINT#0;
			auiWriteRegisters[3] := UINT#0;
			auiWriteRegisters[4] := UINT#0;
			auiWriteRegisters[5] := UINT#0;
			auiWriteRegisters[6] := UINT#0;
			xCommandActive := FALSE;
			// CommandSeq в регистре сохраняется как последний использованный номер,
			// но завершённая транзакция больше не имеет права публиковать Done.
			// Повтор после Reset всегда получит новый ненулевой sequence.
			uiActiveSeq := UINT#0;
			xCommandArmed := TRUE;
			xWritePending := TRUE;
		ELSIF NOT Command.xExecute THEN
			xCommandArmed := TRUE;
		END_IF;

		IF xPlcHeartbeatDue THEN
			uiPlcHeartbeat := uiPlcHeartbeat + UINT#1;
			auiWriteRegisters[8] := uiPlcHeartbeat;
			xPlcHeartbeatDue := FALSE;
			xWritePending := TRUE;
		END_IF;

		IF xWritePending THEN
			eState := E_ROBOT_MODBUS_CLIENT_STATE.WRITE_COMMAND;
		ELSIF tonPoll.Q THEN
			eState := E_ROBOT_MODBUS_CLIENT_STATE.READ_STATUS;
		END_IF;

	E_ROBOT_MODBUS_CLIENT_STATE.WRITE_COMMAND:
		xWriteExecute := TRUE;
		IF fbWrite.xDone THEN
			xWritePending := FALSE;
			eState := E_ROBOT_MODBUS_CLIENT_STATE.WRITE_COMMAND_RELEASE;
		ELSIF fbWrite.xError THEN
			Status.udiWriteError := TO_UDINT(fbWrite.eErrorID);
			xConnect := FALSE;
			eState := E_ROBOT_MODBUS_CLIENT_STATE.RECONNECT_WAIT;
		END_IF;

	E_ROBOT_MODBUS_CLIENT_STATE.WRITE_COMMAND_RELEASE:
		IF NOT fbWrite.xBusy THEN
			eState := E_ROBOT_MODBUS_CLIENT_STATE.READ_STATUS;
		END_IF;

	E_ROBOT_MODBUS_CLIENT_STATE.READ_STATUS:
		xReadExecute := TRUE;
		IF fbRead.xDone THEN
			xStatusFresh := TRUE;
			eState := E_ROBOT_MODBUS_CLIENT_STATE.READ_STATUS_RELEASE;
		ELSIF fbRead.xError THEN
			Status.udiReadError := TO_UDINT(fbRead.eErrorID);
			xConnect := FALSE;
			eState := E_ROBOT_MODBUS_CLIENT_STATE.RECONNECT_WAIT;
		END_IF;

	E_ROBOT_MODBUS_CLIENT_STATE.READ_STATUS_RELEASE:
		IF NOT fbRead.xBusy THEN
			eState := E_ROBOT_MODBUS_CLIENT_STATE.READY;
		END_IF;

	E_ROBOT_MODBUS_CLIENT_STATE.RECONNECT_WAIT:
		xConnect := FALSE;
		xStatusFresh := FALSE;
		IF tonReconnect.Q THEN
			xConnect := TRUE;
			eState := E_ROBOT_MODBUS_CLIENT_STATE.CONNECTING;
		END_IF;
END_CASE;

fbRead(
	xExecute := xReadExecute,
	udiTimeOut := udiReplyTimeoutUs,
	rClient := fbClient,
	uiUnitId := Config.uiUnitId,
	udiReplyTimeout := udiReplyTimeoutUs,
	uiMaxRetries := UINT#1,
	uiStartItem := STATUS_START_ITEM,
	uiQuantity := STATUS_QUANTITY,
	pData := ADR(auiReadRegisters)
);
fbWrite(
	xExecute := xWriteExecute,
	udiTimeOut := udiReplyTimeoutUs,
	rClient := fbClient,
	uiUnitId := Config.uiUnitId,
	udiReplyTimeout := udiReplyTimeoutUs,
	uiMaxRetries := UINT#1,
	uiStartItem := COMMAND_START_ITEM,
	uiQuantity := COMMAND_QUANTITY,
	pData := ADR(auiWriteRegisters)
);

// FC03 может завершиться внутри вызова fbRead. Декодирование выполняется после
// вызова, чтобы технологический Status и сырые диагностические регистры всегда
// относились к одному и тому же снимку опроса.
IF fbRead.xDone THEN
	Status.uiAckSeq := auiReadRegisters[0];
	Status.uiExecutionState := auiReadRegisters[1];
	Status.uiResultCode := auiReadRegisters[2];
	Status.uiActiveCommand := auiReadRegisters[3];
	Status.uiCurrentPoint := auiReadRegisters[4];
	Status.uiGripperStatus := auiReadRegisters[5];
	Status.uiRobotHeartbeat := auiReadRegisters[6];
	Status.uiStatusWord := auiReadRegisters[7];
	Status.uiAlarmCode := auiReadRegisters[8];
	Status.uiOperationPhase := auiReadRegisters[15];
	Status.uiProtocolVersion := auiReadRegisters[16];
	uiDecodedRobotHeartbeat := auiReadRegisters[6];
	uiPositionXHigh := auiReadRegisters[9];
	uiPositionXLow := auiReadRegisters[10];
	uiPositionYHigh := auiReadRegisters[11];
	uiPositionYLow := auiReadRegisters[12];
	uiPositionZHigh := auiReadRegisters[13];
	uiPositionZLow := auiReadRegisters[14];
END_IF;

tonPoll(IN := eState = E_ROBOT_MODBUS_CLIENT_STATE.READY, PT := Config.tPollInterval);
// Heartbeat timer is independent of request states. The due latch prevents a pulse
// from being lost while FC03/FC16 is busy.
tonPlcHeartbeat(
	IN := xEnable AND fbClient.xConnected AND NOT tonPlcHeartbeat.Q,
	PT := T#100MS
);
IF tonPlcHeartbeat.Q THEN
	xPlcHeartbeatDue := TRUE;
END_IF;
tonReconnect(IN := eState = E_ROBOT_MODBUS_CLIENT_STATE.RECONNECT_WAIT, PT := T#1S);

Status.xConnected := fbClient.xConnected AND xConnect;
Status.xStatusFresh := xStatusFresh;

IF uiDecodedRobotHeartbeat <> uiLastRobotHeartbeat THEN
	uiLastRobotHeartbeat := uiDecodedRobotHeartbeat;
	xHeartbeatChanged := TRUE;
	xHeartbeatSeen := TRUE;
END_IF;
tonRobotHeartbeat(
	IN := xEnable AND xStatusFresh AND NOT xHeartbeatChanged,
	PT := Config.tHeartbeatTimeout
);
Status.xCommunicationAlive := Status.xConnected
	AND xStatusFresh
	AND xHeartbeatSeen
	AND NOT tonRobotHeartbeat.Q
	AND (Status.uiProtocolVersion = PROTOCOL_VERSION);
tonCommunicationGrace(
	IN := xEnable AND Status.xConfigValid AND NOT Status.xCommunicationAlive,
	PT := Config.tHeartbeatTimeout
);

Status.xControllerOn := (Status.uiStatusWord AND STATUS_CONTROLLER_ON) <> UINT#0;
Status.xAutomaticMode := (Status.uiStatusWord AND STATUS_AUTOMATIC_MODE) <> UINT#0;
Status.xRemoteEnabled := (Status.uiStatusWord AND STATUS_REMOTE_ENABLED) <> UINT#0;
Status.xDrivesEnabled := (Status.uiStatusWord AND STATUS_DRIVES_ENABLED) <> UINT#0;
Status.xHomed := (Status.uiStatusWord AND STATUS_HOMED) <> UINT#0;
Status.xEmergencyStop := (Status.uiStatusWord AND STATUS_EMERGENCY_STOP) <> UINT#0;
Status.xRobotAlarm := ((Status.uiStatusWord AND STATUS_ROBOT_ALARM) <> UINT#0)
	OR (Status.uiAlarmCode <> UINT#0);
Status.xPositionValid := (Status.uiStatusWord AND STATUS_POSITION_VALID) <> UINT#0;
Status.xSimulatorActive := (Status.uiStatusWord AND STATUS_SIMULATOR_ACTIVE) <> UINT#0;
Status.xReady := Status.xCommunicationAlive
	AND Status.xControllerOn
	AND Status.xAutomaticMode
	AND Status.xRemoteEnabled
	AND Status.xDrivesEnabled
	AND Status.xHomed
	AND Status.xPositionValid
	AND NOT Status.xEmergencyStop
	AND NOT Status.xRobotAlarm
	AND ((Status.uiStatusWord AND STATUS_ROBOT_READY) <> UINT#0);

Status.xDone := (uiActiveSeq <> UINT#0)
	AND xCommandActive
	AND (Status.uiAckSeq = uiActiveSeq)
	AND (Status.uiExecutionState = TO_UINT(E_ROBOT_MODBUS_EXECUTION_STATE.DONE))
	AND (Status.uiResultCode = UINT#0);
// Busy означает активную PLC-транзакцию, включая ожидание AckSeq. Благодаря
// этому FB_ROBOT обязательно увидит запуск новой команды до её terminal state.
Status.xBusy := (uiActiveSeq <> UINT#0)
	AND xCommandActive
	AND NOT Status.xDone
	AND NOT ((Status.uiAckSeq = uiActiveSeq)
		AND ((Status.uiExecutionState = TO_UINT(E_ROBOT_MODBUS_EXECUTION_STATE.ERROR))
			OR (Status.uiExecutionState = TO_UINT(E_ROBOT_MODBUS_EXECUTION_STATE.STOPPED))
			OR ((Status.uiExecutionState = TO_UINT(E_ROBOT_MODBUS_EXECUTION_STATE.DONE))
				AND (Status.uiResultCode <> UINT#0))));
tonCommandTimeout(
	IN := xCommandActive AND NOT Status.xDone,
	PT := Config.tCommandTimeout
);
Status.xCommandTimeout := tonCommandTimeout.Q;
Status.xError := tonCommunicationGrace.Q
	OR Status.xRobotAlarm
	OR Status.xCommandTimeout
	OR ((uiActiveSeq <> UINT#0)
		AND (Status.uiAckSeq = uiActiveSeq)
		AND ((Status.uiExecutionState = TO_UINT(E_ROBOT_MODBUS_EXECUTION_STATE.ERROR))
			OR ((Status.uiExecutionState = TO_UINT(E_ROBOT_MODBUS_EXECUTION_STATE.DONE))
				AND (Status.uiResultCode <> UINT#0))));

dwPositionRaw := SHL(UINT_TO_DWORD(uiPositionXHigh), 16)
	OR UINT_TO_DWORD(uiPositionXLow);
diPositionRaw := DWORD_TO_DINT(dwPositionRaw);
Status.lrActualX := DINT_TO_LREAL(diPositionRaw) / LREAL#10.0;
dwPositionRaw := SHL(UINT_TO_DWORD(uiPositionYHigh), 16)
	OR UINT_TO_DWORD(uiPositionYLow);
diPositionRaw := DWORD_TO_DINT(dwPositionRaw);
Status.lrActualY := DINT_TO_LREAL(diPositionRaw) / LREAL#10.0;
dwPositionRaw := SHL(UINT_TO_DWORD(uiPositionZHigh), 16)
	OR UINT_TO_DWORD(uiPositionZLow);
diPositionRaw := DWORD_TO_DINT(dwPositionRaw);
Status.lrActualZ := DINT_TO_LREAL(diPositionRaw) / LREAL#10.0;
