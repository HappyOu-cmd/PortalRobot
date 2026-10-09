FUNCTION_BLOCK FB_GEOMETRY_CONTROL_SIMULATION
VAR_INPUT
	xInitialize : BOOL;
	xRun : BOOL;
	xReset : BOOL;
	xDeposited : BOOL;
	udiPartId : UDINT;
	xRemove : BOOL;
	xAlarm : BOOL;
	uiTimeFactor : UINT := UINT#1;
	tTravel : TIME := T#6S;
END_VAR
VAR_OUTPUT
	xDriveRunning : BOOL;
	xDriveAlarm : BOOL;
	xPartAtEnd : BOOL;
	rTravel : REAL;
END_VAR
VAR
	xPart : BOOL;
	udiSeenDeposit : UDINT;
	udiPreviousClock : UDINT;
	udiDeltaMs : UDINT;
	rElapsedMs : REAL;
END_VAR

// --- BEGIN IMPLEMENTATION ---

IF xInitialize THEN
	xPart := FALSE; xPartAtEnd := FALSE; rTravel := REAL#0.0; udiSeenDeposit := UDINT#0;
	rElapsedMs := REAL#0.0; udiPreviousClock := GVL_HMI.udiHmiCommandClockMs;
END_IF;

// Накопленный путь сохраняется при останове и аварии. TON с IN=FALSE его теряет.
udiDeltaMs := MIN(UDINT#1000, GVL_HMI.udiHmiCommandClockMs - udiPreviousClock);
udiPreviousClock := GVL_HMI.udiHmiCommandClockMs;
IF xDeposited AND (udiPartId <> UDINT#0) AND (udiPartId <> udiSeenDeposit) THEN
	xPart := TRUE; xPartAtEnd := FALSE; rTravel := REAL#0.0; rElapsedMs := REAL#0.0; udiSeenDeposit := udiPartId;
END_IF;
IF xRemove THEN xPart := FALSE; xPartAtEnd := FALSE; rTravel := REAL#0.0; rElapsedMs := REAL#0.0; END_IF;
xDriveAlarm := xAlarm; // Сброс выхода не снимает удерживаемую физическую причину.
xDriveRunning := xRun AND NOT xDriveAlarm;
IF xPart AND NOT xPartAtEnd AND xDriveRunning THEN
	rElapsedMs := rElapsedMs + UDINT_TO_REAL(udiDeltaMs) * UINT_TO_REAL(MAX(UINT#1, uiTimeFactor));
	rTravel := MIN(REAL#1.0, rElapsedMs / MAX(REAL#1.0, TIME_TO_REAL(tTravel)));
	IF rTravel >= REAL#1.0 THEN xPartAtEnd := TRUE; END_IF;
END_IF;
