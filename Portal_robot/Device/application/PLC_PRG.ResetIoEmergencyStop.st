METHOD PRIVATE ResetIoEmergencyStop

// --- BEGIN IMPLEMENTATION ---

// Сырые аппаратные сигналы используются для снятия программного останова.
// Прямое ручное I/O этим условием не блокируется.
xIoRawSafetyOk := GVL_PHYSICAL_IO.xMappingVerified
    AND GVL_PHYSICAL_IO.xDiEmergencyStopStation1Ok
    AND GVL_PHYSICAL_IO.xDiEmergencyStopStation2Ok
    AND GVL_PHYSICAL_IO.xDiEmergencyStopStation3Ok
    AND GVL_PHYSICAL_IO.xDiEmergencyStopStation4Ok
    AND GVL_PHYSICAL_IO.xDiEmergencyStopCabinet1Ok
    AND GVL_PHYSICAL_IO.xDiEmergencyStopCabinet2Ok
    AND GVL_PHYSICAL_IO.xDiEmergencyStopMpgOk
    AND GVL_PHYSICAL_IO.xDiSafetyRelayOkInput
    AND GVL_PHYSICAL_IO.xDiPhaseRelayOkInput
    AND GVL_PHYSICAL_IO.xDiPressureRelayOkInput;
// Снять программный останов можно только после останова. Снятие не запускает механизм.
GVL_HMI.xIoEmergencyResetAllowed := GVL_HMI.xIoEmergencyStopActive
    AND GVL_CELL_CONTROL.xManual AND NOT xIoBusy AND xHmiConnectionAlive
    AND CELL_SAFETY.Status.xReady
    AND ((GVL_CELL_SETTINGS.eTestEnvironment <> E_CELL_TEST_ENVIRONMENT.NORMAL) OR xIoRawSafetyOk);
IF GVL_HMI.xIoEmergencyStopActive THEN
    GVL_CELL_CONTROL.xStart := FALSE;
    GVL_CELL_CONTROL.xEnable := FALSE;
    GVL_CELL_CONTROL.xManual := TRUE;
    xRobotHmiPermit := FALSE;
END_IF;
IF xIoEmergencyResetRequested THEN
    GVL_HMI.uiIoEmergencyResult := UINT#3;
    IF NOT IsHmiCommandFresh(udiIssuedAtMs := GVL_HMI.udiIoEmergencyIssuedAtMs) THEN
        GVL_HMI.uiIoEmergencyResult := UINT#4;
    ELSIF GVL_HMI.uiIoEmergencyAction = UINT#2 THEN
        IF GVL_HMI.xIoEmergencyResetAllowed THEN
            GVL_HMI.xIoEmergencyStopActive := FALSE;
            GVL_HMI.uiIoEmergencyResult := UINT#1;
        ELSE GVL_HMI.uiIoEmergencyResult := UINT#2;
        END_IF;
    END_IF;
    xIoEmergencyResetRejected := GVL_HMI.uiIoEmergencyResult <> UINT#1;
    GVL_HMI.udiIoEmergencyAckSeq := udiIoEmergencyRequestSeq;
END_IF;
