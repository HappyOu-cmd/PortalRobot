METHOD PRIVATE DeactivateEvent
VAR_INPUT
	eSource : E_ALARM_SOURCE; // Источник аварии
	uiCode  : UINT; // Номер очищенного бита
END_VAR
VAR
	uiIndex : UINT; // Индекс поиска в журнале
END_VAR

// --- BEGIN IMPLEMENTATION ---

FOR uiIndex := 1 TO 100 DO
	IF Events[uiIndex].xActive
	AND (Events[uiIndex].eSeverity = E_ALARM_SEVERITY.ALARM)
	AND (Events[uiIndex].eSource = eSource)
	AND (Events[uiIndex].uiCode = uiCode) THEN
		Events[uiIndex].xActive := FALSE;
	END_IF;
END_FOR;
