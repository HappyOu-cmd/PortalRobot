METHOD PRIVATE RaisePayloadRouteWarning
VAR_INPUT
	uiPayloadType     : UINT;
	uiDestinationType : UINT;
END_VAR

// --- BEGIN IMPLEMENTATION ---

IF (uiPayloadType >= UINT#1)
AND (uiDestinationType >= UINT#1)
AND (uiPayloadType <> uiDestinationType) THEN
	IF NOT xPayloadRouteWarningActive THEN
		Diag.stWarning.uiCode := WRN_PAYLOAD_ROUTE_MISMATCH;
		Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
		IF Diag.stWarning.udiSequence = UDINT#0 THEN
			Diag.stWarning.udiSequence := UDINT#1;
		END_IF;
		xPayloadRouteWarningActive := TRUE;
	END_IF;
ELSE
	xPayloadRouteWarningActive := FALSE;
END_IF;
