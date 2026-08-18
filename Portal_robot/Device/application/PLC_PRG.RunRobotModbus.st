METHOD PRIVATE RunRobotModbus

// --- BEGIN IMPLEMENTATION ---

// Эффективная конфигурация всегда принадлежит RETAIN-GVL. HMI меняет только
// подготовленные значения и затем выдаёт отдельный импульс Apply.
GVL_ROBOT_MODBUS.Config.aIpAddress := GVL_ROBOT_MODBUS_RETAIN.aIpAddress;
GVL_ROBOT_MODBUS.Config.uiPort := GVL_ROBOT_MODBUS_RETAIN.uiPort;
GVL_ROBOT_MODBUS.Config.uiUnitId := GVL_ROBOT_MODBUS_RETAIN.uiUnitId;
GVL_ROBOT_MODBUS.Config.tResponseTimeout := GVL_ROBOT_MODBUS_RETAIN.tResponseTimeout;
GVL_ROBOT_MODBUS.Config.tPollInterval := GVL_ROBOT_MODBUS_RETAIN.tPollInterval;
GVL_ROBOT_MODBUS.Config.tHeartbeatTimeout := GVL_ROBOT_MODBUS_RETAIN.tHeartbeatTimeout;
GVL_ROBOT_MODBUS.Config.tCommandTimeout := T#600S;
GVL_ROBOT_MODBUS.xModeActive :=
	GVL_ROBOT_MODBUS_RETAIN.eControlMode = E_ROBOT_CONTROL_MODE.MODBUS_TCP;
GVL_HMI.xModbusMode := GVL_ROBOT_MODBUS.xModeActive;

IF NOT xModbusHmiInitialized THEN
	GVL_HMI.uiRobotControlModeRequest := TO_UINT(GVL_ROBOT_MODBUS_RETAIN.eControlMode);
	GVL_HMI.uiModbusIpOctet1 := BYTE_TO_UINT(GVL_ROBOT_MODBUS_RETAIN.aIpAddress[0]);
	GVL_HMI.uiModbusIpOctet2 := BYTE_TO_UINT(GVL_ROBOT_MODBUS_RETAIN.aIpAddress[1]);
	GVL_HMI.uiModbusIpOctet3 := BYTE_TO_UINT(GVL_ROBOT_MODBUS_RETAIN.aIpAddress[2]);
	GVL_HMI.uiModbusIpOctet4 := BYTE_TO_UINT(GVL_ROBOT_MODBUS_RETAIN.aIpAddress[3]);
	GVL_HMI.uiModbusPort := GVL_ROBOT_MODBUS_RETAIN.uiPort;
	GVL_HMI.uiModbusUnitId := GVL_ROBOT_MODBUS_RETAIN.uiUnitId;
	GVL_HMI.udiModbusResponseTimeoutMs := TIME_TO_UDINT(GVL_ROBOT_MODBUS_RETAIN.tResponseTimeout);
	GVL_HMI.udiModbusPollIntervalMs := TIME_TO_UDINT(GVL_ROBOT_MODBUS_RETAIN.tPollInterval);
	GVL_HMI.udiModbusHeartbeatTimeoutMs := TIME_TO_UDINT(GVL_ROBOT_MODBUS_RETAIN.tHeartbeatTimeout);
	xModbusHmiInitialized := TRUE;
END_IF;

xAllMachinesIdle := NOT GVL_MACHINE.Status[1].xBusy
	AND NOT GVL_MACHINE.Status[2].xBusy
	AND NOT GVL_MACHINE.Status[3].xBusy;
xModeCommonSafe := xHmiConnectionAlive
	AND NOT GVL_CELL_MANAGER.Status.xRunning
	AND NOT GVL_MAGAZINE.astStatus[1].xBusy
	AND NOT GVL_MAGAZINE.astStatus[2].xBusy
	AND xAllMachinesIdle
	AND NOT GVL_ROBOT.Status.xBusy
	AND NOT GVL_HMI.xRobotManualExecute;

IF GVL_ROBOT_MODBUS.xModeActive THEN
	GVL_ROBOT_MODBUS.xRobotModeChangeAllowed := xModeCommonSafe
		AND GVL_ROBOT_MODBUS.Status.xCommunicationAlive
		AND (GVL_ROBOT_MODBUS.Status.uiExecutionState =
			TO_UINT(E_ROBOT_MODBUS_EXECUTION_STATE.IDLE))
		AND NOT GVL_ROBOT_MODBUS.Status.xDrivesEnabled;
ELSE
	GVL_ROBOT_MODBUS.xRobotModeChangeAllowed := xModeCommonSafe
		AND xDrivesOff
		AND NOT xMotionBusy
		AND GVL_ROBOT_MODBUS.Status.xConfigValid;
END_IF;

GVL_ROBOT_MODBUS.xSettingsChangeAllowed := xHmiConnectionAlive
	AND NOT GVL_CELL_MANAGER.Status.xRunning
	AND NOT GVL_MAGAZINE.astStatus[1].xBusy
	AND NOT GVL_MAGAZINE.astStatus[2].xBusy
	AND xAllMachinesIdle
	AND NOT GVL_ROBOT.Status.xBusy;

rtRobotModeApply(CLK := GVL_HMI.xRobotControlModeApply);
rtModbusSettingsApply(CLK := GVL_HMI.xModbusSettingsApply);
GVL_ROBOT_MODBUS.xReconnectRequest := FALSE;

IF rtModbusSettingsApply.Q THEN
	IF GVL_ROBOT_MODBUS.xSettingsChangeAllowed
	AND (GVL_HMI.uiModbusIpOctet1 >= UINT#1)
	AND (GVL_HMI.uiModbusIpOctet1 <= UINT#223)
	AND (GVL_HMI.uiModbusIpOctet2 <= UINT#255)
	AND (GVL_HMI.uiModbusIpOctet3 <= UINT#255)
	AND (GVL_HMI.uiModbusIpOctet4 <= UINT#255)
	AND (GVL_HMI.uiModbusPort >= UINT#1)
	AND (GVL_HMI.uiModbusUnitId <= UINT#255)
	AND (GVL_HMI.udiModbusResponseTimeoutMs >= UDINT#50)
	AND (GVL_HMI.udiModbusResponseTimeoutMs <= UDINT#10000)
	AND (GVL_HMI.udiModbusPollIntervalMs >= UDINT#10)
	AND (GVL_HMI.udiModbusPollIntervalMs <= UDINT#5000)
	AND (GVL_HMI.udiModbusHeartbeatTimeoutMs >= UDINT#500)
	AND (GVL_HMI.udiModbusHeartbeatTimeoutMs <= UDINT#30000) THEN
		GVL_ROBOT_MODBUS_RETAIN.aIpAddress[0] := UINT_TO_BYTE(GVL_HMI.uiModbusIpOctet1);
		GVL_ROBOT_MODBUS_RETAIN.aIpAddress[1] := UINT_TO_BYTE(GVL_HMI.uiModbusIpOctet2);
		GVL_ROBOT_MODBUS_RETAIN.aIpAddress[2] := UINT_TO_BYTE(GVL_HMI.uiModbusIpOctet3);
		GVL_ROBOT_MODBUS_RETAIN.aIpAddress[3] := UINT_TO_BYTE(GVL_HMI.uiModbusIpOctet4);
		GVL_ROBOT_MODBUS_RETAIN.uiPort := GVL_HMI.uiModbusPort;
		GVL_ROBOT_MODBUS_RETAIN.uiUnitId := GVL_HMI.uiModbusUnitId;
		GVL_ROBOT_MODBUS_RETAIN.tResponseTimeout := UDINT_TO_TIME(GVL_HMI.udiModbusResponseTimeoutMs);
		GVL_ROBOT_MODBUS_RETAIN.tPollInterval := UDINT_TO_TIME(GVL_HMI.udiModbusPollIntervalMs);
		GVL_ROBOT_MODBUS_RETAIN.tHeartbeatTimeout := UDINT_TO_TIME(GVL_HMI.udiModbusHeartbeatTimeoutMs);
		GVL_ROBOT_MODBUS.xReconnectRequest := GVL_ROBOT_MODBUS.xModeActive;
		GVL_HMI.uiModbusSettingsRejectReason := UINT#0;
	ELSE
		GVL_HMI.uiModbusSettingsRejectReason := UINT#1;
		uiRobotInterfaceWarningCode := WRN_MODBUS_SETTINGS_REJECTED;
	END_IF;
END_IF;

IF rtRobotModeApply.Q THEN
	IF (GVL_HMI.uiRobotControlModeRequest <= UINT#1)
	AND GVL_ROBOT_MODBUS.xRobotModeChangeAllowed THEN
	IF GVL_HMI.uiRobotControlModeRequest = UINT#1 THEN
			GVL_ROBOT_MODBUS_RETAIN.eControlMode := E_ROBOT_CONTROL_MODE.MODBUS_TCP;
		ELSE
			GVL_ROBOT_MODBUS_RETAIN.eControlMode := E_ROBOT_CONTROL_MODE.SOFTMOTION;
		END_IF;
		GVL_HMI.uiRobotControlModeRequest := TO_UINT(GVL_ROBOT_MODBUS_RETAIN.eControlMode);
		GVL_HMI.uiRobotModeRejectReason := UINT#0;
	ELSE
		IF NOT xModeCommonSafe THEN
			GVL_HMI.uiRobotModeRejectReason := UINT#1;
		ELSIF NOT GVL_ROBOT_MODBUS.xModeActive AND NOT xDrivesOff THEN
			GVL_HMI.uiRobotModeRejectReason := UINT#2;
		ELSIF GVL_ROBOT_MODBUS.xModeActive THEN
			GVL_HMI.uiRobotModeRejectReason := UINT#3;
		ELSE
			GVL_HMI.uiRobotModeRejectReason := UINT#4;
		END_IF;
		uiRobotInterfaceWarningCode := WRN_ROBOT_MODE_REJECTED;
		GVL_HMI.uiRobotControlModeRequest := TO_UINT(GVL_ROBOT_MODBUS_RETAIN.eControlMode);
	END_IF;
END_IF;

// Повторная выборка после возможного Apply исключает один цикл старого режима.
GVL_ROBOT_MODBUS.xModeActive :=
	GVL_ROBOT_MODBUS_RETAIN.eControlMode = E_ROBOT_CONTROL_MODE.MODBUS_TCP;
GVL_HMI.xModbusMode := GVL_ROBOT_MODBUS.xModeActive;
GVL_ROBOT_MODBUS.Config.aIpAddress := GVL_ROBOT_MODBUS_RETAIN.aIpAddress;
GVL_ROBOT_MODBUS.Config.uiPort := GVL_ROBOT_MODBUS_RETAIN.uiPort;
GVL_ROBOT_MODBUS.Config.uiUnitId := GVL_ROBOT_MODBUS_RETAIN.uiUnitId;
GVL_ROBOT_MODBUS.Config.tResponseTimeout := GVL_ROBOT_MODBUS_RETAIN.tResponseTimeout;
GVL_ROBOT_MODBUS.Config.tPollInterval := GVL_ROBOT_MODBUS_RETAIN.tPollInterval;
GVL_ROBOT_MODBUS.Config.tHeartbeatTimeout := GVL_ROBOT_MODBUS_RETAIN.tHeartbeatTimeout;
GVL_ROBOT_MODBUS.Config.tCommandTimeout := T#600S;

ROBOT_MODBUS(
	xEnable := GVL_ROBOT_MODBUS.xModeActive,
	xReconnect := GVL_ROBOT_MODBUS.xReconnectRequest,
	Config := GVL_ROBOT_MODBUS.Config,
	Command := GVL_ROBOT.ModbusCommand,
	Status => GVL_ROBOT_MODBUS.Status,
	auiWriteRegisters := GVL_ROBOT_MODBUS.auiWriteRegisters,
	auiReadRegisters := GVL_ROBOT_MODBUS.auiReadRegisters
);

GVL_ROBOT.xModbusBusy := GVL_ROBOT_MODBUS.Status.xBusy;
GVL_ROBOT.xModbusDone := GVL_ROBOT_MODBUS.Status.xDone;
GVL_ROBOT.xModbusError := GVL_ROBOT_MODBUS.Status.xError;

IF GVL_ROBOT_MODBUS.xModeActive THEN
	xRobotInterfaceReady := GVL_ROBOT_MODBUS.Status.xReady;
	xDrivesReady := GVL_ROBOT_MODBUS.Status.xReady;
	xDrivesPowered := GVL_ROBOT_MODBUS.Status.xDrivesEnabled;
	xDrivesOff := NOT GVL_ROBOT_MODBUS.Status.xDrivesEnabled;
	xPowerTransitionActive := FALSE;
	xMotionBusy := GVL_ROBOT_MODBUS.Status.xBusy;
	xDriveError := GVL_ROBOT_MODBUS.Status.xError;
	lrRobotActualX := GVL_ROBOT_MODBUS.Status.lrActualX;
	lrRobotActualY := GVL_ROBOT_MODBUS.Status.lrActualY;
	lrRobotActualZ := GVL_ROBOT_MODBUS.Status.lrActualZ;
	GVL_HMI.lrActualX := lrRobotActualX;
	GVL_HMI.lrActualY := lrRobotActualY;
	GVL_HMI.lrActualZ := lrRobotActualZ;
	GVL_HMI.HMI.ActualX := lrRobotActualX;
	GVL_HMI.HMI.ActualY := lrRobotActualY;
	GVL_HMI.HMI.ActualZ := lrRobotActualZ;
ELSE
	xRobotInterfaceReady := TRUE;
	// Не публикуем просроченные Modbus-координаты: в SoftMotion активен только
	// локальный источник обратной связи.
	GVL_ROBOT_MODBUS.Status.lrActualX := LREAL#0.0;
	GVL_ROBOT_MODBUS.Status.lrActualY := LREAL#0.0;
	GVL_ROBOT_MODBUS.Status.lrActualZ := LREAL#0.0;
	lrRobotActualX := GVL_AXIS_GROUP.AxisGroup.Status.ActualX;
	lrRobotActualY := GVL_AXIS_GROUP.AxisGroup.Status.ActualY;
	lrRobotActualZ := GVL_AXIS_GROUP.AxisGroup.Status.ActualZ;
END_IF;
