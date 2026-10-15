FUNCTION F_GEOMETRY_SELECT_STATION : UINT
VAR_INPUT
	xRequireFree : BOOL;
	uiMachine : UINT := UINT#0; // Станок-источник; 0 — общая проверка доступности
END_VAR
VAR
	uiTry : UINT;
	uiStation : UINT;
END_VAR

// --- BEGIN IMPLEMENTATION ---

F_GEOMETRY_SELECT_STATION := UINT#0;
// С1/С2 предпочитают ГК1, С3 — ГК2. История доставок и магазины не участвуют.
uiStation := UINT#1;
IF uiMachine = UINT#3 THEN uiStation := UINT#2; END_IF;
FOR uiTry := UINT#1 TO UINT#2 DO
	// Вторым проверяем другой ГК, если предпочтительный не прошёл допуск.
	IF uiTry = UINT#2 THEN uiStation := UINT#3 - uiStation; END_IF;
	IF (F_GEOMETRY_SELECT_STATION = UINT#0) AND GVL_GEOMETRY_CONTROL.xSupported
	AND GVL_GEOMETRY_CONTROL.astStatus[uiStation].xEnabled
	AND GVL_GEOMETRY_CONTROL.astStatus[uiStation].xConfigured
	AND NOT GVL_GEOMETRY_CONTROL.astStatus[uiStation].xError
	AND (GVL_GEOMETRY_CONTROL.astStatus[uiStation].uiState <> UINT#5) THEN
		IF NOT xRequireFree OR GVL_GEOMETRY_CONTROL.astStatus[uiStation].xReady THEN F_GEOMETRY_SELECT_STATION := uiStation; END_IF;
	END_IF;
END_FOR;
