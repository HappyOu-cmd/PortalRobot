METHOD PRIVATE ReadIoEmergencyStop

// --- BEGIN IMPLEMENTATION ---

// Отдельный канал: останов не ждёт текущую транзакцию подмены I/O.
xIoEmergencyResetRequested := FALSE;
xIoEmergencyResetRejected := FALSE;
udiIoEmergencyRequestSeq := GVL_HMI.udiIoEmergencyCommandSeq;
IF xIoInitialized AND (udiIoEmergencyRequestSeq <> GVL_HMI.udiIoEmergencyAckSeq) THEN
    IF GVL_HMI.uiIoEmergencyAction = UINT#1 THEN
        xIoManualActive := FALSE;
        GVL_HMI.xIoEmergencyStopActive := TRUE;
        GVL_HMI.uiIoEmergencyResult := UINT#1;
        GVL_HMI.udiIoEmergencyAckSeq := udiIoEmergencyRequestSeq;
    ELSE
        xIoEmergencyResetRequested := TRUE;
    END_IF;
END_IF;
IF GVL_HMI.xIoEmergencyStopActive THEN
    GVL_CELL_CONTROL.xStop := TRUE;
    GVL_CELL_CONTROL.xStart := FALSE;
    GVL_CELL_CONTROL.xEnable := FALSE;
    GVL_CELL_CONTROL.xManual := TRUE;
    GVL_ROBOT.Command.xExecute := FALSE;
    GVL_ROBOT.Command.xStop := TRUE;
    GVL_ROBOT.ModbusCommand.xExecute := FALSE;
    GVL_ROBOT.ModbusCommand.xStop := TRUE;
    GVL_HMI.xRobotManualExecute := FALSE;
    GVL_HMI.stRobotCommand.xExecute := FALSE;
    xPointCheckStopRequest := xPointCheckActive;
    FOR uiIoIndex := UINT#1 TO UINT#3 DO
        GVL_HMI.astAxisHmiCommand[uiIoIndex].xJogPositive := FALSE;
        GVL_HMI.astAxisHmiCommand[uiIoIndex].xJogNegative := FALSE;
        GVL_HMI.astAxisHmiCommand[uiIoIndex].xHome := FALSE;
        GVL_HMI.astAxisHmiCommand[uiIoIndex].xMoveAbsolute := FALSE;
        GVL_HMI.astAxisHmiCommand[uiIoIndex].xMoveRelative := FALSE;
        GVL_HMI.axMachineManualHatchOpen[uiIoIndex] := FALSE;
        GVL_HMI.axMachineManualHatchClose[uiIoIndex] := FALSE;
        GVL_HMI.axMachineManualHatchUnlock[uiIoIndex] := FALSE;
        GVL_HMI.axMachineManualHatchLock[uiIoIndex] := FALSE;
        GVL_HMI.axMachineManualChuckOpen[uiIoIndex] := FALSE;
        GVL_HMI.axMachineManualChuckClose[uiIoIndex] := FALSE;
    END_FOR;
END_IF;
