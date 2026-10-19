FUNCTION F_GEOMETRY_EVENT : BOOL
VAR_INPUT
	Call : ST_GEOMETRY_CALL;
END_VAR
VAR
	uiIndex : UINT;
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Один PLC-скан, единый владелец номера. Поля записываются раньше Seq.
Persistent_Value.udiEventSequence := Persistent_Value.udiEventSequence + UDINT#1;
IF Persistent_Value.udiEventSequence = UDINT#0 THEN Persistent_Value.udiEventSequence := UDINT#1; END_IF;
uiIndex := UDINT_TO_UINT((Persistent_Value.udiEventSequence - UDINT#1) MOD UDINT#100) + UINT#1;
GVL_GEOMETRY_CONTROL.astEvents[uiIndex].udiSequence := UDINT#0;
GVL_GEOMETRY_CONTROL.astEvents[uiIndex].Call := Call;
GVL_GEOMETRY_CONTROL.astEvents[uiIndex].udiTimeMs := GVL_HMI.udiHmiCommandClockMs;
GVL_GEOMETRY_CONTROL.astEvents[uiIndex].uiEnvironment := GVL_GEOMETRY_CONTROL.uiEnvironment;
GVL_GEOMETRY_CONTROL.astEvents[uiIndex].udiSequence := Persistent_Value.udiEventSequence;
F_GEOMETRY_EVENT := TRUE;
