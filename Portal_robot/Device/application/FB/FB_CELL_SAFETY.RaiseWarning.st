METHOD PRIVATE RaiseWarning
VAR_INPUT
	uiCode : UINT;
END_VAR

// --- BEGIN IMPLEMENTATION ---

Diag.stWarning.uiCode := uiCode;
Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
IF Diag.stWarning.udiSequence = UDINT#0 THEN
	Diag.stWarning.udiSequence := UDINT#1;
END_IF;
