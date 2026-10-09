METHOD PRIVATE ReadIoOverrides

// --- BEGIN IMPLEMENTATION ---

udiIoNowMs := TIME_TO_UDINT(TIME());
IF NOT xIoInitialized THEN
    GVL_HMI.udiIoBootCounter := GVL_HMI.udiIoBootCounter + UDINT#1;
    IF GVL_HMI.udiIoBootCounter = UDINT#0 THEN GVL_HMI.udiIoBootCounter := UDINT#1; END_IF;
    udiIoLastTickMs := udiIoNowMs;
    // Старый запрос после перезапуска не должен исполняться сам собой.
    GVL_HMI.udiIoOverrideAckSeq := GVL_HMI.udiIoOverrideCommandSeq;
    GVL_HMI.udiIoEmergencyAckSeq := GVL_HMI.udiIoEmergencyCommandSeq;
END_IF;
IF udiIoNowMs >= udiIoLastTickMs THEN
    uliIoClockMs := uliIoClockMs + UDINT_TO_ULINT(udiIoNowMs - udiIoLastTickMs);
ELSE
    uliIoClockMs := uliIoClockMs + ULINT#4294967296 - UDINT_TO_ULINT(udiIoLastTickMs) + UDINT_TO_ULINT(udiIoNowMs);
END_IF;
udiIoLastTickMs := udiIoNowMs;
GVL_HMI.sIoClockMs := ULINT_TO_STRING(uliIoClockMs);

tonIoOverrideWatchdog(IN := GVL_HMI.udiIoOverrideHeartbeat = udiIoHeartbeatSeen, PT := T#3S);
IF GVL_HMI.udiIoOverrideHeartbeat <> udiIoHeartbeatSeen THEN
    udiIoHeartbeatSeen := GVL_HMI.udiIoOverrideHeartbeat;
END_IF;
IF udiIoNowMs >= GVL_HMI.udiIoOverrideHeartbeatAtMs THEN
    uliIoLeaseAgeMs := UDINT_TO_ULINT(udiIoNowMs) - UDINT_TO_ULINT(GVL_HMI.udiIoOverrideHeartbeatAtMs);
ELSE
    uliIoLeaseAgeMs := ULINT#4294967296 + UDINT_TO_ULINT(udiIoNowMs) - UDINT_TO_ULINT(GVL_HMI.udiIoOverrideHeartbeatAtMs);
END_IF;

xIoBusy := GVL_CELL_MANAGER.Status.xRunning OR GVL_CELL_MANAGER.Status.xBusy
    OR GVL_CELL_MANAGER.Status.xStopPending OR GVL_ROBOT.Status.xBusy
    OR xMotionBusy OR xGroupMotionBusy OR xPointCheckActive OR xPointCheckRequest
    OR xPowerTransitionActive OR SIMULATION_DYNAMICS.xBusy
    OR GVL_HMI.xRobotManualExecute OR GVL_HMI.stRobotCommand.xExecute
    OR GVL_CELL_CONTROL.xStart
    OR (GVL_HMI.udiTwinCommandSeq <> GVL_HMI.udiTwinAckSeq);
// Реальный цикл станка нельзя скрыть подменой его DI.
IF xPhysicalNormal AND GVL_PHYSICAL_IO.xMappingVerified THEN
    xIoBusy := xIoBusy OR GVL_PHYSICAL_IO.xDiMachine1CycleActive
        OR GVL_PHYSICAL_IO.xDiMachine2CycleActive OR GVL_PHYSICAL_IO.xDiMachine3CycleActive;
END_IF;
FOR uiIoIndex := UINT#1 TO UINT#3 DO
    xIoBusy := xIoBusy OR GVL_MACHINE.Status[uiIoIndex].xBusy OR GVL_MACHINE.Status[uiIoIndex].xProcessing
        OR GVL_HMI.axMachineManualHatchOpen[uiIoIndex] OR GVL_HMI.axMachineManualHatchClose[uiIoIndex]
        OR GVL_HMI.axMachineManualHatchUnlock[uiIoIndex] OR GVL_HMI.axMachineManualHatchLock[uiIoIndex]
        OR GVL_HMI.axMachineManualChuckOpen[uiIoIndex] OR GVL_HMI.axMachineManualChuckClose[uiIoIndex]
        OR GVL_HMI.astAxisHmiCommand[uiIoIndex].xJogPositive
        OR GVL_HMI.astAxisHmiCommand[uiIoIndex].xJogNegative
        OR GVL_HMI.astAxisHmiCommand[uiIoIndex].xHome
        OR GVL_HMI.astAxisHmiCommand[uiIoIndex].xMoveAbsolute
        OR GVL_HMI.astAxisHmiCommand[uiIoIndex].xMoveRelative;
END_FOR;
FOR uiIoIndex := UINT#1 TO UINT#2 DO
    xIoBusy := xIoBusy OR GVL_MAGAZINE.astStatus[uiIoIndex].xBusy
        OR GVL_TWO_PALLET.astStatus[uiIoIndex].xBusy;
END_FOR;
// Ручной режим сигналов включается одним запросом. Технологических допусков здесь нет.
xIoManualEndedByOperator := FALSE;
IF xIoManualActive AND (NOT GVL_CELL_CONTROL.xManual OR NOT xHmiConnectionAlive
    OR tonIoOverrideWatchdog.Q OR (uliIoLeaseAgeMs > ULINT#3000)
    OR ((GVL_HMI.udiCellModeCommandSeq <> GVL_HMI.udiCellModeAckSeq) AND NOT GVL_HMI.xCellManualRequest)) THEN
    xIoManualActive := FALSE;
END_IF;
GVL_HMI.xIoManualStartAllowed := GVL_CELL_CONTROL.xManual AND NOT xIoBusy AND NOT xIoManualActive
    AND NOT ((GVL_HMI.udiCellModeCommandSeq <> GVL_HMI.udiCellModeAckSeq) AND NOT GVL_HMI.xCellManualRequest);
xIoOverrideRejected := FALSE;
udiIoRequestSeq := GVL_HMI.udiIoOverrideCommandSeq;
uiIoRequestAction := GVL_HMI.uiIoOverrideAction;
uiIoRequestIndex := GVL_HMI.uiIoOverrideIndex;
xIoRequestValue := GVL_HMI.xIoOverrideValue;
IF udiIoRequestSeq <> GVL_HMI.udiIoOverrideAckSeq THEN
    IF (uiIoRequestAction = UINT#8) OR (uiIoRequestAction = UINT#9) OR (uiIoRequestAction = UINT#7) THEN
        GVL_HMI.uiIoOverrideResult := UINT#4;
        IF IsHmiCommandFresh(udiIssuedAtMs := GVL_HMI.udiIoOverrideIssuedAtMs) THEN
            GVL_HMI.uiIoOverrideResult := UINT#1;
            IF uiIoRequestAction = UINT#8 THEN
                IF NOT xHmiConnectionAlive OR tonIoOverrideWatchdog.Q OR (uliIoLeaseAgeMs > ULINT#3000) THEN
                    GVL_HMI.uiIoOverrideResult := UINT#4;
                ELSIF xIoManualActive THEN
                    // Повтор входа не перезаписывает уже выбранные ручные уровни.
                    GVL_HMI.uiIoOverrideResult := UINT#1;
                ELSIF GVL_HMI.xIoManualStartAllowed THEN
                    FOR uiIoIndex := UINT#1 TO UINT#50 DO
                        axIoDoForceValue[uiIoIndex] := axIoOutput[uiIoIndex];
                        axIoDoForced[uiIoIndex] := FALSE;
                    END_FOR;
                    xIoManualActive := TRUE;
                ELSE
                    GVL_HMI.uiIoOverrideResult := UINT#2;
                END_IF;
            ELSE
                xIoManualActive := FALSE;
                xIoManualEndedByOperator := TRUE;
            END_IF;
        END_IF;
        // Для входа/выхода из режима Ack выдаёт ApplyIoOutputOverrides после назначения DO.
    END_IF;
END_IF;

GVL_HMI.xIoManualControlActive := xIoManualActive;
GVL_HMI.xIoManualStartAllowed := GVL_HMI.xIoManualStartAllowed AND NOT xIoManualActive;
GVL_HMI.xIoOverrideAllowed := xIoManualActive AND GVL_CELL_CONTROL.xManual;
IF GVL_HMI.xIoOverrideAllowed THEN GVL_HMI.uiIoOverrideBlockReason := UINT#0;
ELSIF NOT GVL_CELL_CONTROL.xManual THEN GVL_HMI.uiIoOverrideBlockReason := UINT#2;
ELSIF xIoBusy THEN GVL_HMI.uiIoOverrideBlockReason := UINT#3;
ELSE GVL_HMI.uiIoOverrideBlockReason := UINT#7;
END_IF;

IF NOT GVL_HMI.xIoOverrideAllowed THEN
    FOR uiIoIndex := UINT#1 TO UINT#84 DO
        IF axIoForced[uiIoIndex] THEN
            IF xIoManualEndedByOperator THEN
                AppendIoEvent(usiDirection := USINT#1, uiIndex := uiIoIndex, usiKind := USINT#5,
                    xOld := axIoForceValue[uiIoIndex], xNew := axIoRawDi[uiIoIndex]);
            ELSE
                AppendIoEvent(usiDirection := USINT#1, uiIndex := uiIoIndex, usiKind := USINT#6,
                    xOld := axIoForceValue[uiIoIndex], xNew := axIoRawDi[uiIoIndex]);
            END_IF;
            axIoForced[uiIoIndex] := FALSE;
        END_IF;
    END_FOR;
END_IF;

IF (udiIoRequestSeq <> GVL_HMI.udiIoOverrideAckSeq)
AND NOT ((uiIoRequestAction >= UINT#4) AND (uiIoRequestAction <= UINT#9)) THEN
    GVL_HMI.uiIoOverrideResult := UINT#3;
    IF NOT IsHmiCommandFresh(udiIssuedAtMs := GVL_HMI.udiIoOverrideIssuedAtMs) THEN
        GVL_HMI.uiIoOverrideResult := UINT#4;
    ELSIF uiIoRequestAction = UINT#3 THEN
        FOR uiIoIndex := UINT#1 TO UINT#84 DO
            IF axIoForced[uiIoIndex] THEN
                AppendIoEvent(usiDirection := USINT#1, uiIndex := uiIoIndex, usiKind := USINT#5,
                    xOld := axIoForceValue[uiIoIndex], xNew := axIoRawDi[uiIoIndex]);
                axIoForced[uiIoIndex] := FALSE;
            END_IF;
        END_FOR;
        GVL_HMI.uiIoOverrideResult := UINT#1;
    ELSIF (uiIoRequestIndex >= UINT#1) AND (uiIoRequestIndex <= UINT#84) THEN
        IF uiIoRequestAction = UINT#2 THEN
            IF axIoForced[uiIoRequestIndex] THEN
                AppendIoEvent(usiDirection := USINT#1, uiIndex := uiIoRequestIndex, usiKind := USINT#5,
                    xOld := axIoForceValue[uiIoRequestIndex], xNew := axIoRawDi[uiIoRequestIndex]);
                axIoForced[uiIoRequestIndex] := FALSE;
            END_IF;
            GVL_HMI.uiIoOverrideResult := UINT#1;
        ELSIF uiIoRequestAction = UINT#1 THEN
            IF GVL_HMI.xIoOverrideAllowed THEN
                IF NOT axIoForced[uiIoRequestIndex] OR (axIoForceValue[uiIoRequestIndex] <> xIoRequestValue) THEN
                    AppendIoEvent(usiDirection := USINT#1, uiIndex := uiIoRequestIndex, usiKind := USINT#4,
                        xOld := axPhysicalRaw[uiIoRequestIndex], xNew := xIoRequestValue);
                END_IF;
                axIoForced[uiIoRequestIndex] := TRUE;
                axIoForceValue[uiIoRequestIndex] := xIoRequestValue;
                GVL_HMI.uiIoOverrideResult := UINT#1;
            ELSE
                GVL_HMI.uiIoOverrideResult := UINT#2;
            END_IF;
        END_IF;
    END_IF;
    xIoOverrideRejected := GVL_HMI.uiIoOverrideResult <> UINT#1;
    GVL_HMI.udiIoOverrideAckSeq := udiIoRequestSeq;
END_IF;
FOR uiIoIndex := UINT#1 TO UINT#84 DO
    IF axIoForced[uiIoIndex] THEN axPhysicalRaw[uiIoIndex] := axIoForceValue[uiIoIndex]; END_IF;
END_FOR;
