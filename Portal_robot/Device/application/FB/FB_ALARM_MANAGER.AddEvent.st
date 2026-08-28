METHOD PRIVATE AddEvent
VAR_INPUT
	eSource   : E_ALARM_SOURCE; // Источник события
	eSeverity : E_ALARM_SEVERITY; // Уровень события
	eEffect   : E_ALARM_EFFECT; // Воздействие события на ячейку
	uiCode    : UINT; // Код события внутри источника
END_VAR

// --- BEGIN IMPLEMENTATION ---

udiSequence := udiSequence + 1;
IF udiSequence = UDINT#0 THEN
	udiSequence := UDINT#1;
END_IF;

Events[uiWriteIndex].udiSequence := udiSequence;
Events[uiWriteIndex].eSeverity := eSeverity;
Events[uiWriteIndex].eEffect := eEffect;
Events[uiWriteIndex].eSource := eSource;
Events[uiWriteIndex].uiCode := uiCode;
Events[uiWriteIndex].xActive := TRUE;

IF uiWriteIndex >= 100 THEN
	uiWriteIndex := 1;
ELSE
	uiWriteIndex := uiWriteIndex + 1;
END_IF;
