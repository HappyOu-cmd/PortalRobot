FUNCTION F_GEOMETRY_FIRST_CALL : UINT
VAR
	uiMachine : UINT;
	udiCallAge : UDINT;
	udiOldestAge : UDINT;
END_VAR

// --- BEGIN IMPLEMENTATION ---

F_GEOMETRY_FIRST_CALL := UINT#0;
udiOldestAge := UDINT#0;
// Только ожидающие вызовы. Готовность станка не меняет его место в FIFO.
FOR uiMachine := UINT#1 TO UINT#3 DO
	IF (GVL_GEOMETRY_CONTROL.astCalls[uiMachine].uiState = UINT#1)
	AND (GVL_GEOMETRY_CONTROL.astCalls[uiMachine].udiId <> UDINT#0) THEN
		// ID монотонный с переходом UDINT_MAX -> 1; нулевой ID пропускается.
		IF GVL_GEOMETRY_CONTROL.udiNextCallId >= GVL_GEOMETRY_CONTROL.astCalls[uiMachine].udiId THEN
			udiCallAge := GVL_GEOMETRY_CONTROL.udiNextCallId - GVL_GEOMETRY_CONTROL.astCalls[uiMachine].udiId;
		ELSE
			udiCallAge := (UDINT#4294967295 - GVL_GEOMETRY_CONTROL.astCalls[uiMachine].udiId)
				+ GVL_GEOMETRY_CONTROL.udiNextCallId;
		END_IF;
		IF (F_GEOMETRY_FIRST_CALL = UINT#0) OR (udiCallAge > udiOldestAge) THEN
			F_GEOMETRY_FIRST_CALL := uiMachine;
			udiOldestAge := udiCallAge;
		END_IF;
	END_IF;
END_FOR;
