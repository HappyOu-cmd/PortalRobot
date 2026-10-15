METHOD PRIVATE UpdateGeometryWait
VAR
	uiMachine : UINT;
	uiFreeStation : UINT;
	uiFirstCallMachine : UINT;
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
	AND GVL_GEOMETRY_CONTROL.xSupported AND GVL_GEOMETRY_CONTROL.xAutoEnabled
	AND (GVL_GEOMETRY_CONTROL.astStatus[1].xEnabled OR GVL_GEOMETRY_CONTROL.astStatus[2].xEnabled)
	AND (GVL_GEOMETRY_CONTROL.auiActiveCount[uiMachine] >= (MAX(UINT#1, GVL_GEOMETRY_CONTROL.auiPeriod[uiMachine]) - UINT#1)) THEN
		xCalled := TRUE;
	END_IF;
	xReadyDetail := astMachineStatus[uiMachine].xEnabled
		AND NOT astMachineStatus[uiMachine].xError AND NOT astMachineStatus[uiMachine].xDisablePending
		AND NOT astMachineStatus[uiMachine].xBusy AND NOT astMachineStatus[uiMachine].xProcessing
		AND astMachineStatus[uiMachine].xCanAcceptService AND astMachineStatus[uiMachine].xServiceRequired
		AND (astMachineStatus[uiMachine].ePartState = E_PART_STATE.LOADED)
		AND (astMachineStatus[uiMachine].ePartType = E_PART_TYPE.DETAIL);
	IF xRunning AND NOT xManual AND xCalled AND xReadyDetail AND (uiCallState <> UINT#1) THEN
		GVL_GEOMETRY_CONTROL.udiNextCallId := GVL_GEOMETRY_CONTROL.udiNextCallId + UDINT#1;
		IF GVL_GEOMETRY_CONTROL.udiNextCallId = UDINT#0 THEN GVL_GEOMETRY_CONTROL.udiNextCallId := UDINT#1; END_IF;
		Call := EmptyCall; Call.udiId := GVL_GEOMETRY_CONTROL.udiNextCallId;
		Call.uiMachine := uiMachine; Call.uiProductType := Config.auiMachineType[uiMachine]; Call.uiState := UINT#1;
		GVL_GEOMETRY_CONTROL.astCalls[uiMachine] := Call;
		F_GEOMETRY_EVENT(Call := Call);
	END_IF;
	// Пустой станок можно загрузить. Уже начатый рецепт не прерываем.
	axGeometryUnloadBlocked[uiMachine] := xCalled AND (uiFreeStation = UINT#0)
		AND (astMachineStatus[uiMachine].ePartState = E_PART_STATE.LOADED)
		AND NOT astMachineStatus[uiMachine].xBusy;
END_FOR;

// Выбираем голову после создания всех автовызовов этого скана.
uiFirstCallMachine := F_GEOMETRY_FIRST_CALL();
FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
	IF (GVL_GEOMETRY_CONTROL.astCalls[uiMachine].uiState = UINT#1)
	AND (uiMachine <> uiFirstCallMachine)
	AND (astMachineStatus[uiMachine].ePartState = E_PART_STATE.LOADED)
	AND NOT astMachineStatus[uiMachine].xBusy THEN
		// Более поздний вызов не обгоняет первый, даже если его деталь уже готова.
		axGeometryUnloadBlocked[uiMachine] := TRUE;
	END_IF;
	xReadyDetail := astMachineStatus[uiMachine].xEnabled
		AND NOT astMachineStatus[uiMachine].xError AND NOT astMachineStatus[uiMachine].xDisablePending
		AND NOT astMachineStatus[uiMachine].xBusy AND NOT astMachineStatus[uiMachine].xProcessing
		AND astMachineStatus[uiMachine].xCanAcceptService AND astMachineStatus[uiMachine].xServiceRequired
		AND (astMachineStatus[uiMachine].ePartState = E_PART_STATE.LOADED)
		AND (astMachineStatus[uiMachine].ePartType = E_PART_TYPE.DETAIL);
	// Ожидание своей очереди при свободном ГК не является причиной W52.
	xWaiting := xRunning AND NOT xManual AND NOT xGlobalError
		AND xReadyDetail AND axGeometryUnloadBlocked[uiMachine] AND (uiFreeStation = UINT#0);
	// Отдельный TON для каждого вызова; реальное время, без ускорения симуляции.
	atonGeometryWait[uiMachine](IN := xWaiting AND NOT GVL_ALARM.Command.xResetWarnings
		AND (audiGeometryWaitCallId[uiMachine] = GVL_GEOMETRY_CONTROL.astCalls[uiMachine].udiId),
		PT := GVL_GEOMETRY_CONTROL.tWaitWarningTimeout);
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
