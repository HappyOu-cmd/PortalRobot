FUNCTION_BLOCK FB_POINT_MANAGER
VAR_INPUT
	stPoint : ST_POINT;
END_VAR
VAR_OUTPUT
END_VAR
VAR
END_VAR
VAR_IN_OUT
	stPointManager: ST_POINT_MANAGER;
END_VAR
VAR CONSTANT
	X_OUT_OF_LIMIT : DWORD := 1;
	Y_OUT_OF_LIMIT : DWORD := 2;
	Z_OUT_OF_LIMIT : DWORD := 4;
	INVALID_VEL    : DWORD := 8;
END_VAR



// --- BEGIN IMPLEMENTATION ---

stPointManager.xBusy := FALSE;
stPointManager.xDone := FALSE;
stPointManager.xInvalid := FALSE;




CASE stPointManager.eState OF
	// --------------------------------------------------
	E_POINT_MANAGER_STATE.IDLE:
	// --------------------------------------------------	
		stPointManager.dwErrorActive := 0; 
		IF stPointManager.xExecute THEN
			stPointManager.xBusy := TRUE;
			stPointManager.eState := E_POINT_MANAGER_STATE.CHECK_ZONE;	 
		END_IF
			
	// --------------------------------------------------
	E_POINT_MANAGER_STATE.CHECK_ZONE:
	// --------------------------------------------------
		stPointManager.xBusy := TRUE;
		
		IF  NOT ((stPointManager.lrX_MinLimit <= stPoint.X) AND (stPoint.X<= stPointManager.lrX_MaxLimit)) THEN
			stPointManager.dwErrorActive := stPointManager.dwErrorActive OR X_OUT_OF_LIMIT;
		END_IF
		
		IF  NOT ((stPointManager.lrY_MinLimit <= stPoint.Y) AND (stPoint.Y<= stPointManager.lrY_MaxLimit))THEN
			stPointManager.dwErrorActive := stPointManager.dwErrorActive OR Y_OUT_OF_LIMIT;
		END_IF
		
		IF  NOT ((stPointManager.lrZ_MinLimit <= stPoint.Z) AND (stPoint.Z<= stPointManager.lrZ_MaxLimit)) THEN
			stPointManager.dwErrorActive := stPointManager.dwErrorActive OR Z_OUT_OF_LIMIT;
		END_IF
		
		stPointManager.eState := E_POINT_MANAGER_STATE.CHECK_VEL_FACTOR;
		
	// --------------------------------------------------
	E_POINT_MANAGER_STATE.CHECK_VEL_FACTOR:
	// --------------------------------------------------
		stPointManager.xBusy := TRUE;
		
		IF  NOT ((0.1 < stPoint.SpeedFactor) AND(stPoint.SpeedFactor <= 1.0))  THEN
			stPointManager.dwErrorActive := stPointManager.dwErrorActive OR INVALID_VEL;	
		END_IF
		
		stPointManager.eState := E_POINT_MANAGER_STATE.CHECK_ALL;
		
	// --------------------------------------------------
	E_POINT_MANAGER_STATE.CHECK_ALL:
	// --------------------------------------------------
		stPointManager.xDone := TRUE;
		stPointManager.xBusy := FALSE;
		IF stPointManager.dwErrorActive <> 0 THEN
			stPointManager.xInvalid := TRUE;
			stPointManager.dwErrorLast := stPointManager.dwErrorActive;
		ELSE
			stPointManager.xInvalid := FALSE;
		END_IF
		
		IF NOT stPointManager.xExecute THEN
			stPointManager.eState := E_POINT_MANAGER_STATE.IDLE;	
		END_IF
		
END_CASE

stPointManager.stErrorActive := UpdateErrorView(
	dwError := stPointManager.dwErrorActive,
);
stPointManager.stErrorLast :=UpdateErrorView(
	dwError:= stPointManager.dwErrorLast,
);
	