FUNCTION_BLOCK FB_GEOMETRY_CONTROL
VAR_INPUT
	xInitialize : BOOL;
	uiAction : UINT;
	xSupported : BOOL;
	xSimulation : BOOL;
	xGlobalError : BOOL;
	xManual : BOOL;
	xCellRunning : BOOL;
	xRobotBusy : BOOL;
	xMotionBusy : BOOL;
	xHmiAlive : BOOL;
	xIoManual : BOOL;
	xReset : BOOL;
	xDriveAlarm : BOOL;
	xDriveRunning : BOOL;
	xPartAtEnd : BOOL;
	rSimulationTravel : REAL;
	Signals : ST_GEOMETRY_SIGNALS;
	Config : ST_GEOMETRY_CONFIG;
	tTransport : TIME;
	tFeedback : TIME;
	tResetPulse : TIME;
	uiTimeFactor : UINT := UINT#1;
END_VAR
VAR_IN_OUT
	Memory : ST_GEOMETRY_MEMORY;
END_VAR
VAR_OUTPUT
	Status : ST_GEOMETRY_STATUS;
	Warning : ST_WARNING_EVENT;
	xRunOutput : BOOL;
	xResetOutput : BOOL;
	xCommandAccepted : BOOL;
	xSimulationEmptyConfirmed : BOOL; // Одноцикловое принятое изъятие/подтверждение пустоты виртуальной ленты
END_VAR
VAR
	xInitialized : BOOL;
	xEnabled : BOOL;
	xReserved : BOOL;
	xTransport : BOOL;
	xManualRun : BOOL;
	xDisablePending : BOOL;
	xEnableWanted : BOOL;
	xResetBusy : BOOL;
	xResetSeen : BOOL;
	xConfigurationValid : BOOL;
	xManualBase : BOOL;
	xCommandRejected : BOOL;
	tTransportScaled : TIME;
	tFeedbackScaled : TIME;
	tonTransport : TON;
	tonFeedback : TON;
	tonRemoved : TON;
	tonReset : TON;
	stRemoved : ST_GEOMETRY_CALL;
END_VAR

// --- BEGIN IMPLEMENTATION ---

IF xInitialize THEN xInitialized := FALSE; END_IF;
IF NOT xInitialized THEN
	// После рестарта конечный датчик не доказывает пустоту всей ленты.
	xEnabled := FALSE; xReserved := FALSE; xTransport := FALSE; xManualRun := FALSE;
	xDisablePending := FALSE; xEnableWanted := FALSE; xResetBusy := FALSE; xResetSeen := FALSE;
	Memory.xRecoveryRequired := TRUE; xInitialized := TRUE;
END_IF;
xCommandAccepted := FALSE;
xSimulationEmptyConfirmed := FALSE;
xCommandRejected := FALSE;
xConfigurationValid := Config.xConfigured AND (Config.lrSpeedFactor >= 0.1)
	AND (Config.lrSpeedFactor <= 1.0) AND (Config.lrSafeZ < 0.0) AND (Config.lrSafeZ >= -10000.0);
tTransportScaled := UDINT_TO_TIME(MAX(UDINT#1, TIME_TO_UDINT(tTransport) / UINT_TO_UDINT(MAX(UINT#1, uiTimeFactor))));
tFeedbackScaled := UDINT_TO_TIME(MAX(UDINT#1, TIME_TO_UDINT(tFeedback) / UINT_TO_UDINT(MAX(UINT#1, uiTimeFactor))));

IF xDriveAlarm THEN Memory.dwAlarm := Memory.dwAlarm OR DWORD#1; END_IF;
IF Memory.dwAlarm <> DWORD#0 THEN
	Memory.xRecoveryRequired := TRUE;
	IF Signals.xRobotInteraction THEN Memory.xRobotStopLatched := TRUE; END_IF;
	xEnabled := FALSE; xEnableWanted := FALSE; xTransport := FALSE; xManualRun := FALSE;
END_IF;
IF xGlobalError OR NOT xSupported OR xIoManual THEN
	IF Memory.xOccupied OR xReserved OR xTransport OR xManualRun THEN Memory.xRecoveryRequired := TRUE; END_IF;
	xEnabled := FALSE; xEnableWanted := FALSE; xTransport := FALSE; xManualRun := FALSE;
	xResetBusy := FALSE;
END_IF;
IF NOT xHmiAlive OR NOT xManual OR xCellRunning THEN xManualRun := FALSE; END_IF;

IF Signals.xReserve AND xEnabled AND xConfigurationValid AND NOT Memory.xOccupied
	AND NOT Memory.xRecoveryRequired AND NOT xPartAtEnd AND NOT xDriveRunning
	AND NOT xManualRun AND NOT xResetBusy AND NOT xGlobalError AND xSupported AND NOT xIoManual
	AND (Memory.dwAlarm = DWORD#0) THEN
	xReserved := TRUE; Memory.Part := Signals.Call;
END_IF;
IF Signals.xDeposited AND xReserved AND (Signals.Call.udiId <> UDINT#0)
	AND (Memory.udiLastDepositId <> Signals.Call.udiId) THEN
	Memory.xOccupied := TRUE; Memory.xAtEndSeen := FALSE;
	Memory.udiLastDepositId := Signals.Call.udiId;
	Memory.udiProducedPartsTotal := Memory.udiProducedPartsTotal + UDINT#1;
	Memory.Part := Signals.Call; Memory.Part.uiState := UINT#4;
	IF (Memory.Part.uiMachine >= UINT#1) AND (Memory.Part.uiMachine <= UINT#3) THEN
		GVL_GEOMETRY_CONTROL.astCalls[Memory.Part.uiMachine] := Memory.Part;
	END_IF;
	F_GEOMETRY_EVENT(Call := Memory.Part);
END_IF;
IF Signals.xReleased THEN
	xReserved := FALSE;
	IF Memory.xOccupied AND xEnabled AND NOT xDisablePending AND NOT Memory.xRecoveryRequired
		AND (Memory.dwAlarm = DWORD#0) AND NOT xGlobalError THEN xTransport := TRUE; END_IF;
END_IF;

xManualBase := xSupported AND xManual AND NOT xCellRunning AND NOT xRobotBusy
	AND NOT xMotionBusy AND NOT Signals.xRobotInteraction AND NOT xReserved
	AND xHmiAlive AND NOT xGlobalError AND NOT xIoManual AND NOT xResetBusy;
Status.xConfigAllowed := xManualBase AND NOT xEnabled AND NOT xDriveRunning AND NOT Memory.xOccupied;
// Допуск записи данных публикует RunGeometryControl независимо от состояния ГК.
// xConfigAllowed остаётся строгим допуском проверки с движением к базе.
Status.xEnableAllowed := xSupported AND xHmiAlive AND NOT xGlobalError AND NOT xIoManual
	AND NOT xEnabled AND NOT Signals.xRobotInteraction AND NOT xRobotBusy
	AND NOT xMotionBusy AND NOT xResetBusy AND NOT xDriveRunning AND NOT xManualRun
	AND NOT xReserved AND NOT xDisablePending AND xConfigurationValid
	AND (Memory.dwAlarm = DWORD#0);
Status.xDisableAllowed := xSupported AND (xEnabled OR xEnableWanted OR xDisablePending);
Status.xConfirmAllowed := (xEnableWanted OR Memory.xRecoveryRequired) AND NOT xPartAtEnd AND NOT xDriveRunning
	AND NOT xRobotBusy AND NOT xMotionBusy AND NOT Signals.xRobotInteraction
	AND NOT xReserved AND NOT xTransport AND NOT xManualRun AND NOT xResetBusy AND NOT xDisablePending
	AND xSupported AND xHmiAlive AND NOT xGlobalError AND NOT xIoManual
	AND (NOT xEnableWanted OR xConfigurationValid) AND (Memory.dwAlarm = DWORD#0);
Status.xManualStartAllowed := xManualBase AND NOT xDriveAlarm AND (Memory.dwAlarm = DWORD#0) AND NOT xManualRun;
Status.xResetAllowed := (Memory.dwAlarm <> DWORD#0) AND NOT xResetBusy AND xSupported
	AND NOT xGlobalError AND NOT xIoManual
	AND NOT xRobotBusy AND NOT xMotionBusy AND NOT xManualRun AND NOT xTransport;
Status.xSimulationRemoveAllowed := xSimulation AND xSupported AND xHmiAlive
	AND NOT xGlobalError AND NOT xIoManual AND NOT xResetBusy
	AND Memory.xOccupied AND NOT Signals.xRobotInteraction AND NOT xReserved AND NOT xDriveRunning;

CASE uiAction OF
	UINT#1:
		IF Status.xEnableAllowed THEN
			IF Memory.xRecoveryRequired OR Memory.xOccupied OR xPartAtEnd THEN
				xEnableWanted := TRUE; Warning.uiCode := UINT#1; Warning.udiSequence := Warning.udiSequence + UDINT#1;
			ELSE xEnabled := TRUE; END_IF;
			xCommandAccepted := TRUE;
		END_IF;
	UINT#2:
		IF Status.xDisableAllowed THEN
			xEnableWanted := FALSE; xManualRun := FALSE;
			IF Signals.xRobotInteraction THEN xDisablePending := TRUE;
			ELSE
				xEnabled := FALSE; xTransport := FALSE;
				IF Memory.xOccupied OR xReserved THEN Memory.xRecoveryRequired := TRUE; END_IF;
			END_IF;
			xCommandAccepted := TRUE;
		END_IF;
	UINT#3:
		IF Status.xConfirmAllowed THEN
			IF Memory.xOccupied AND (Memory.Part.udiId <> UDINT#0) THEN
				stRemoved := Memory.Part; stRemoved.uiState := UINT#8; F_GEOMETRY_EVENT(Call := stRemoved);
				IF (stRemoved.uiMachine >= UINT#1) AND (stRemoved.uiMachine <= UINT#3) THEN
					IF GVL_GEOMETRY_CONTROL.astCalls[stRemoved.uiMachine].udiId = stRemoved.udiId THEN
						GVL_GEOMETRY_CONTROL.astCalls[stRemoved.uiMachine] := stRemoved;
					END_IF;
				END_IF;
			END_IF;
			Memory.xOccupied := FALSE; Memory.xAtEndSeen := FALSE; Memory.xRecoveryRequired := FALSE;
			Memory.Part.udiId := UDINT#0; Memory.Part.uiMachine := UINT#0; Memory.Part.uiProductType := UINT#0;
			// Самостоятельное подтверждение состояния не включает станцию.
			xEnabled := xEnableWanted;
			xReserved := FALSE; xEnableWanted := FALSE; xCommandAccepted := TRUE;
			xSimulationEmptyConfirmed := xSimulation;
		END_IF;
	UINT#4:
		IF xEnableWanted OR Memory.xRecoveryRequired THEN
			xEnableWanted := FALSE; xEnabled := FALSE; xCommandAccepted := TRUE;
			Warning.uiCode := UINT#2; Warning.udiSequence := Warning.udiSequence + UDINT#1;
		END_IF;
	UINT#5:
		IF Status.xManualStartAllowed THEN
			xManualRun := TRUE; xCommandAccepted := TRUE;
			IF Memory.xOccupied THEN Memory.xRecoveryRequired := TRUE; xEnabled := FALSE; END_IF;
		END_IF;
	UINT#6:
		xManualRun := FALSE; xTransport := FALSE; xCommandAccepted := TRUE;
		IF Signals.xRobotInteraction THEN xDisablePending := TRUE;
		ELSIF Memory.xOccupied THEN Memory.xRecoveryRequired := TRUE; xEnabled := FALSE; END_IF;
	UINT#7:
		IF Status.xSimulationRemoveAllowed THEN
			xCommandAccepted := TRUE; xSimulationEmptyConfirmed := TRUE;
			xTransport := FALSE; xManualRun := FALSE;
		END_IF;
END_CASE;
IF (uiAction >= UINT#1) AND (uiAction <= UINT#7) AND NOT xCommandAccepted THEN xCommandRejected := TRUE; END_IF;
IF xDisablePending AND NOT Signals.xRobotInteraction THEN
	xEnabled := FALSE; xTransport := FALSE; xDisablePending := FALSE;
	IF Memory.xOccupied OR xReserved THEN Memory.xRecoveryRequired := TRUE; END_IF;
END_IF;

// Сброс привода — настоящий импульс. Внутренняя авария снимается после импульса,
// только при исчезновении входа. Занятость и требование восстановления сохраняются.
IF xReset AND NOT xResetSeen AND Status.xResetAllowed THEN xResetBusy := TRUE; END_IF;
xResetSeen := xReset;
tonReset(IN := xResetBusy, PT := tResetPulse);
xResetOutput := xResetBusy AND NOT tonReset.Q AND xSupported AND NOT xIoManual AND NOT xGlobalError;
IF xResetBusy AND tonReset.Q THEN
	xResetBusy := FALSE;
	IF NOT xDriveAlarm AND NOT xDriveRunning THEN Memory.dwAlarm := DWORD#0; Memory.xRobotStopLatched := FALSE; END_IF;
END_IF;

IF xTransport AND xPartAtEnd THEN
	Memory.xAtEndSeen := TRUE; xTransport := FALSE;
END_IF;
// В ручном режиме датчик никогда не останавливает привод.
xRunOutput := (xTransport OR xManualRun) AND NOT Signals.xRobotInteraction
	AND NOT xGlobalError AND xSupported AND NOT xIoManual AND NOT xDriveAlarm
	AND (Memory.dwAlarm = DWORD#0) AND NOT xResetBusy;
tonTransport(IN := xTransport AND xRunOutput, PT := tTransportScaled);
tonFeedback(IN := (xRunOutput <> xDriveRunning) AND NOT xResetBusy AND xSupported AND NOT xIoManual AND NOT xGlobalError, PT := tFeedbackScaled);
IF tonTransport.Q THEN Memory.dwAlarm := Memory.dwAlarm OR DWORD#2; END_IF;
IF tonFeedback.Q THEN Memory.dwAlarm := Memory.dwAlarm OR DWORD#4; END_IF;
IF Memory.dwAlarm <> DWORD#0 THEN
	xEnabled := FALSE; xEnableWanted := FALSE; xRunOutput := FALSE;
	xTransport := FALSE; xManualRun := FALSE; Memory.xRecoveryRequired := TRUE;
	IF Signals.xRobotInteraction THEN Memory.xRobotStopLatched := TRUE; END_IF;
END_IF;
tonRemoved(IN := Memory.xOccupied AND Memory.xAtEndSeen AND NOT xPartAtEnd
	AND xEnabled AND NOT Memory.xRecoveryRequired AND NOT xTransport AND NOT xManualRun
	AND NOT xDriveRunning AND NOT xReserved AND NOT Signals.xRobotInteraction
	AND (Memory.dwAlarm = DWORD#0) AND NOT xGlobalError, PT := T#3S);
// Явное изъятие в SIMULATION подтверждает пустоту всей ленты сразу.
// В NORMAL освобождение по датчику по-прежнему требует непрерывные 3 секунды.
IF tonRemoved.Q OR (xSimulationEmptyConfirmed AND Memory.xOccupied) THEN
	stRemoved := Memory.Part; stRemoved.uiState := UINT#8; F_GEOMETRY_EVENT(Call := stRemoved);
	IF (stRemoved.uiMachine >= UINT#1) AND (stRemoved.uiMachine <= UINT#3) THEN
		IF GVL_GEOMETRY_CONTROL.astCalls[stRemoved.uiMachine].udiId = stRemoved.udiId THEN
			GVL_GEOMETRY_CONTROL.astCalls[stRemoved.uiMachine] := stRemoved;
		END_IF;
	END_IF;
	Memory.xOccupied := FALSE; Memory.xAtEndSeen := FALSE;
	Memory.Part.udiId := UDINT#0; Memory.Part.uiMachine := UINT#0; Memory.Part.uiProductType := UINT#0;
END_IF;
IF xPartAtEnd AND NOT xSimulationEmptyConfirmed AND NOT Memory.xOccupied AND NOT xReserved THEN
	Memory.xRecoveryRequired := TRUE; xEnabled := FALSE;
END_IF;
IF xCommandRejected THEN Warning.uiCode := UINT#3; Warning.udiSequence := Warning.udiSequence + UDINT#1; END_IF;
Status.xEnabled := xEnabled;
Status.xReserved := xReserved;
// Виртуальный датчик снимается моделью на следующем скане после принятой команды.
Status.xPartAtEnd := xPartAtEnd AND NOT xSimulationEmptyConfirmed;
Status.xOccupied := Memory.xOccupied OR xReserved OR Memory.xRecoveryRequired OR Status.xPartAtEnd;
Status.xPartStored := Memory.xOccupied;
Status.xReady := xEnabled AND xConfigurationValid AND NOT Status.xOccupied AND NOT xDriveRunning
	AND (Memory.dwAlarm = DWORD#0) AND NOT xGlobalError AND xSupported AND NOT xIoManual AND NOT xResetBusy;
Status.xDriveRunning := xDriveRunning;
Status.xDriveAlarm := xDriveAlarm;
Status.xError := Memory.dwAlarm <> DWORD#0;
Status.xRobotStopRequired := Memory.xRobotStopLatched AND Status.xError;
Status.xResetBusy := xResetBusy;
Status.xConfirmationActive := xEnableWanted;
Status.xRecoveryRequired := Memory.xRecoveryRequired;
Status.xConfigured := xConfigurationValid;
Status.udiProducedPartsTotal := Memory.udiProducedPartsTotal;
Status.udiPartId := Memory.Part.udiId;
Status.uiMachine := Memory.Part.uiMachine;
Status.uiProductType := Memory.Part.uiProductType;
IF xSimulationEmptyConfirmed THEN Status.rTravel := REAL#0.0;
ELSIF xSimulation THEN Status.rTravel := rSimulationTravel;
ELSIF Memory.xAtEndSeen THEN Status.rTravel := REAL#1.0;
ELSIF xTransport THEN Status.rTravel := MIN(REAL#0.95, TIME_TO_REAL(tonTransport.ET) / TIME_TO_REAL(tTransportScaled));
ELSIF NOT Memory.xOccupied THEN Status.rTravel := REAL#0.0; END_IF;
IF Status.xError THEN Status.uiState := UINT#6;
ELSIF Memory.xRecoveryRequired THEN Status.uiState := UINT#5;
ELSIF xManualRun THEN Status.uiState := UINT#7;
ELSIF NOT xEnabled THEN Status.uiState := UINT#0;
ELSIF xReserved THEN Status.uiState := UINT#2;
ELSIF xTransport THEN Status.uiState := UINT#3;
ELSIF Memory.xOccupied THEN Status.uiState := UINT#4;
ELSE Status.uiState := UINT#1; END_IF;
