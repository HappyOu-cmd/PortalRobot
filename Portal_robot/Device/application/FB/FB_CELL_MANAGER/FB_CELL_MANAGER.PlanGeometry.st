METHOD PRIVATE PlanGeometry : BOOL
VAR
	uiFree : UINT;
	uiAvailable : UINT;
END_VAR

// --- BEGIN IMPLEMENTATION ---

PlanGeometry := FALSE;
IF xGeometryHeld AND stRobotStatus.xDetailAvailable AND (uiGeometryMachine >= UINT#1) AND (uiGeometryMachine <= UINT#3) THEN
	uiFree := F_GEOMETRY_SELECT_STATION(xRequireFree := TRUE, uiMachine := uiGeometryMachine);
	uiAvailable := F_GEOMETRY_SELECT_STATION(xRequireFree := FALSE, uiMachine := uiGeometryMachine);
	IF uiFree > UINT#0 THEN
		uiGeometryStation := uiFree; uiGeometryStep := UINT#0;
		GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiStation := uiFree;
		GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiState := UINT#3;
		GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiReason := UINT#0;
		F_GEOMETRY_EVENT(Call := GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine]);
		GVL_GEOMETRY_CONTROL.astSignals[uiFree].Call := GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine];
		GVL_GEOMETRY_CONTROL.astSignals[uiFree].xReserve := TRUE;
		eState := E_CELL_MANAGER_STATE.GEOMETRY_DELIVER; PlanGeometry := TRUE;
	ELSIF (uiAvailable > UINT#0) AND GVL_GEOMETRY_CONTROL.xWaitWhenOccupied THEN
		uiGeometryParkStation := uiAvailable;
		eState := E_CELL_MANAGER_STATE.GEOMETRY_WAIT_FREE; PlanGeometry := TRUE;
	ELSE
		// Окончательный журнал магазина формируем только по фактической укладке.
		IF uiAvailable > UINT#0 THEN uiGeometryBypassReason := UINT#1; ELSE uiGeometryBypassReason := UINT#2; END_IF;
		udiGeometryMagazineCounter := stMagazineStatus.udiProducedPartsTotal;
	END_IF;
END_IF;
