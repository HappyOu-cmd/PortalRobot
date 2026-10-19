METHOD PRIVATE UpdateGeometryWait
VAR
	uiMachine : UINT;
	uiFreeStation : UINT;
	uiCallState : UINT;
	xCalled : BOOL;
	xReadyDetail : BOOL;
	xWaiting : BOOL;
	xRaiseWarning : BOOL;
	Call : ST_GEOMETRY_CALL;
	EmptyCall : ST_GEOMETRY_CALL;
END_VAR

// --- BEGIN IMPLEMENTATION ---

uiFreeStation := F_GEOMETRY_SELECT_STATION(xRequireFree := TRUE, uiMachine := UINT#0);
xRaiseWarning := FALSE;
FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
	uiCallState := GVL_GEOMETRY_CONTROL.astCalls[uiMachine].uiState;
	xCalled := uiCallState = UINT#1;
	// Автовызов известен до выгрузки; счётчик меняется только при фактическом взятии.
	IF ((uiCallState = UINT#0) OR (uiCallState > UINT#3))
	AND GVL_GEOMETRY_CONTROL.xSupported AND Persistent_Value.xAutoEnabled
	AND (GVL_GEOMETRY_CONTROL.astStatus[1].xEnabled OR GVL_GEOMETRY_CONTROL.astStatus[2].xEnabled)
	AND (GVL_GEOMETRY_CONTROL.auiActiveCount[uiMachine] >= (MAX(UINT#1, Persistent_Value.auiPeriod[uiMachine]) - UINT#1)) THEN
		xCalled := TRUE;
	END_IF;
	xReadyDetail := astMachineStatus[uiMachine].xEnabled
		AND NOT astMachineStatus[uiMachine].xError AND NOT astMachineStatus[uiMachine].xDisablePending
		AND NOT astMachineStatus[uiMachine].xBusy AND NOT astMachineStatus[uiMachine].xProcessing
		AND astMachineStatus[uiMachine].xCanAcceptService AND astMachineStatus[uiMachine].xServiceRequired
		AND (astMachineStatus[uiMachine].ePartState = E_PART_STATE.LOADED)
		AND (astMachineStatus[uiMachine].ePartType = E_PART_TYPE.DETAIL);
	IF xRunning AND NOT xManual AND xCalled AND xReadyDetail AND (uiCallState <> UINT#1) THEN
		Persistent_Value.udiNextCallId := Persistent_Value.udiNextCallId + UDINT#1;
		IF Persistent_Value.udiNextCallId = UDINT#0 THEN Persistent_Value.udiNextCallId := UDINT#1; END_IF;
		Call := EmptyCall; Call.udiId := Persistent_Value.udiNextCallId;
		Call.uiMachine := uiMachine; Call.uiProductType := Config.auiMachineType[uiMachine]; Call.uiState := UINT#1;
		GVL_GEOMETRY_CONTROL.astCalls[uiMachine] := Call;
		F_GEOMETRY_EVENT(Call := Call);
	END_IF;
	// Пустой станок можно загрузить. Уже начатый рецепт не прерываем.
	axGeometryUnloadBlocked[uiMachine] := xCalled AND (uiFreeStation = UINT#0)
		AND (astMachineStatus[uiMachine].ePartState = E_PART_STATE.LOADED)
		AND NOT astMachineStatus[uiMachine].xBusy;
END_FOR;

// Возраст вызова не ограничивает обслуживание; ждём только свободного ГК.
FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
	xReadyDetail := astMachineStatus[uiMachine].xEnabled
		AND NOT astMachineStatus[uiMachine].xError AND NOT astMachineStatus[uiMachine].xDisablePending
		AND NOT astMachineStatus[uiMachine].xBusy AND NOT astMachineStatus[uiMachine].xProcessing
		AND astMachineStatus[uiMachine].xCanAcceptService AND astMachineStatus[uiMachine].xServiceRequired
		AND (astMachineStatus[uiMachine].ePartState = E_PART_STATE.LOADED)
		AND (astMachineStatus[uiMachine].ePartType = E_PART_TYPE.DETAIL);
	// W52 относится только к готовой детали без доступного свободного ГК.
	xWaiting := xRunning AND NOT xManual AND NOT xGlobalError
		AND xReadyDetail AND axGeometryUnloadBlocked[uiMachine] AND (uiFreeStation = UINT#0);
	// Отдельный TON для каждого вызова; реальное время, без ускорения симуляции.
	atonGeometryWait[uiMachine](IN := xWaiting AND NOT GVL_ALARM.Command.xResetWarnings
		AND (audiGeometryWaitCallId[uiMachine] = GVL_GEOMETRY_CONTROL.astCalls[uiMachine].udiId),
		PT := Persistent_Value.tWaitWarningTimeout);
	IF NOT xWaiting OR GVL_ALARM.Command.xResetWarnings
	OR (audiGeometryWaitCallId[uiMachine] <> GVL_GEOMETRY_CONTROL.astCalls[uiMachine].udiId) THEN
		axGeometryWaitWarned[uiMachine] := FALSE;
	END_IF;
	audiGeometryWaitCallId[uiMachine] := GVL_GEOMETRY_CONTROL.astCalls[uiMachine].udiId;
	IF atonGeometryWait[uiMachine].Q AND NOT axGeometryWaitWarned[uiMachine] THEN
		axGeometryWaitWarned[uiMachine] := TRUE; xRaiseWarning := TRUE;
	END_IF;
END_FOR;
IF xRaiseWarning THEN
	GVL_GEOMETRY_CONTROL.stCellWarning.uiCode := WRN_GEOMETRY_WAIT_TIMEOUT; // WARNING: остальные станки продолжают работу
	GVL_GEOMETRY_CONTROL.stCellWarning.udiSequence := GVL_GEOMETRY_CONTROL.stCellWarning.udiSequence + UDINT#1;
	IF GVL_GEOMETRY_CONTROL.stCellWarning.udiSequence = UDINT#0 THEN GVL_GEOMETRY_CONTROL.stCellWarning.udiSequence := UDINT#1; END_IF;
END_IF;
