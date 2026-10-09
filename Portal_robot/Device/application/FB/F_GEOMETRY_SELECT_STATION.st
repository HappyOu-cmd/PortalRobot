FUNCTION F_GEOMETRY_SELECT_STATION : UINT
VAR_INPUT
	xRequireFree : BOOL;
END_VAR
VAR
	uiTry : UINT;
	uiStation : UINT;
END_VAR

// --- BEGIN IMPLEMENTATION ---

F_GEOMETRY_SELECT_STATION := UINT#0;
// При равных условиях чередуем станции. Магазины в выборе не участвуют.
FOR uiTry := UINT#1 TO UINT#2 DO
	uiStation := ((GVL_GEOMETRY_CONTROL.uiLastStation + uiTry - UINT#1) MOD UINT#2) + UINT#1;
	IF (F_GEOMETRY_SELECT_STATION = UINT#0) AND GVL_GEOMETRY_CONTROL.xSupported
	AND GVL_GEOMETRY_CONTROL.astStatus[uiStation].xEnabled
	AND GVL_GEOMETRY_CONTROL.astStatus[uiStation].xConfigured
	AND NOT GVL_GEOMETRY_CONTROL.astStatus[uiStation].xError
	AND (GVL_GEOMETRY_CONTROL.astStatus[uiStation].uiState <> UINT#5) THEN
		IF NOT xRequireFree OR GVL_GEOMETRY_CONTROL.astStatus[uiStation].xReady THEN F_GEOMETRY_SELECT_STATION := uiStation; END_IF;
	END_IF;
END_FOR;
