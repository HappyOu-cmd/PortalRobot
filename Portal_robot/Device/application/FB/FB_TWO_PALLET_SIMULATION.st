FUNCTION_BLOCK FB_TWO_PALLET_SIMULATION
VAR_INPUT
	xEnable : BOOL; // Только тестовая среда SIMULATION
	uiP1Signals : UINT;
	Command : ST_TWO_PALLET_OUTPUT;
END_VAR
VAR_OUTPUT
	xLiftDown : BOOL;
	xLiftUp : BOOL;
	xLockIn : BOOL;
	xLockOut : BOOL;
	xStopIn : BOOL;
	xStopOut : BOOL;
END_VAR
VAR
	xInitialized : BOOL;
	xLiftTargetUp : BOOL;
	xLockTargetOut : BOOL;
	xStopTargetOut : BOOL;
	tonLift : TON;
	tonLock : TON;
	tonStop : TON;
END_VAR

// --- BEGIN IMPLEMENTATION ---

IF NOT xEnable THEN
	xInitialized := FALSE;
	xLiftDown := FALSE;
	xLiftUp := FALSE;
	xLockIn := FALSE;
	xLockOut := FALSE;
	xStopIn := FALSE;
	xStopOut := FALSE;
	tonLift(IN := FALSE, PT := T#300MS);
	tonLock(IN := FALSE, PT := T#300MS);
	tonStop(IN := FALSE, PT := T#300MS);
ELSE
	IF NOT xInitialized THEN
		// Виртуальная начальная поза: П2 внизу, замок держит П1,
		// фиксатор держит противоположную палету.
		xLiftTargetUp := FALSE;
		xLockTargetOut := (uiP1Signals AND UINT#8) <> UINT#0;
		xStopTargetOut := (uiP1Signals AND UINT#32) <> UINT#0;
		xLiftDown := TRUE;
		xLiftUp := FALSE;
		xLockOut := xLockTargetOut;
		xLockIn := NOT xLockTargetOut;
		xStopOut := xStopTargetOut;
		xStopIn := NOT xStopTargetOut;
		xInitialized := TRUE;
	END_IF;

	// Бистабильный 5/2 сохраняет положение после снятия обеих катушек.
	IF Command.xLiftUp AND NOT Command.xLiftDown THEN
		xLiftTargetUp := TRUE;
	ELSIF Command.xLiftDown AND NOT Command.xLiftUp THEN
		xLiftTargetUp := FALSE;
	END_IF;
	IF Command.xLockOut AND NOT Command.xLockIn THEN
		xLockTargetOut := TRUE;
	ELSIF Command.xLockIn AND NOT Command.xLockOut THEN
		xLockTargetOut := FALSE;
	END_IF;
	IF Command.xStopOut AND NOT Command.xStopIn THEN
		xStopTargetOut := TRUE;
	ELSIF Command.xStopIn AND NOT Command.xStopOut THEN
		xStopTargetOut := FALSE;
	END_IF;

	tonLift(IN := xLiftTargetUp <> xLiftUp, PT := T#300MS);
	tonLock(IN := xLockTargetOut <> xLockOut, PT := T#300MS);
	tonStop(IN := xStopTargetOut <> xStopOut, PT := T#300MS);
	IF tonLift.Q THEN
		xLiftUp := xLiftTargetUp;
		xLiftDown := NOT xLiftTargetUp;
	END_IF;
	IF tonLock.Q THEN
		xLockOut := xLockTargetOut;
		xLockIn := NOT xLockTargetOut;
	END_IF;
	IF tonStop.Q THEN
		xStopOut := xStopTargetOut;
		xStopIn := NOT xStopTargetOut;
	END_IF;
END_IF;
