METHOD PRIVATE RaiseWarning
VAR_INPUT
	uiCode : UINT; // Код отклонённой команды конфигурации
END_VAR

// --- BEGIN IMPLEMENTATION ---

Status.stWarning.uiCode := uiCode;
Status.stWarning.udiSequence := Status.stWarning.udiSequence + UDINT#1;
IF Status.stWarning.udiSequence = UDINT#0 THEN
	Status.stWarning.udiSequence := UDINT#1;
END_IF;
