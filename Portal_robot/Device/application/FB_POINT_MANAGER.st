FUNCTION_BLOCK FB_POINT_MANAGER
VAR_INPUT
	stPoint : ST_POINT; // Проверяемая точка
END_VAR
VAR_OUTPUT
END_VAR
VAR
END_VAR
VAR_IN_OUT
	stPointManager : ST_POINT_MANAGER; // Команды, статусы и диагностика проверки точки
END_VAR
VAR CONSTANT
	X_OUT_OF_LIMIT : DWORD := 1; // Координата X вне допустимых границ
	Y_OUT_OF_LIMIT : DWORD := 2; // Координата Y вне допустимых границ
	Z_OUT_OF_LIMIT : DWORD := 4; // Координата Z вне допустимых границ
	INVALID_VEL    : DWORD := 8; // Недопустимый коэффициент скорости
END_VAR

// --- BEGIN IMPLEMENTATION ---

stPointManager.Status.xBusy := FALSE;
stPointManager.Status.xDone := FALSE;
stPointManager.Status.xInvalid := FALSE;




CASE stPointManager.Diag.eState OF
	// --------------------------------------------------
	E_POINT_MANAGER_STATE.IDLE:
	// --------------------------------------------------	
		stPointManager.Error.dwErrorActive := DWORD#0;
		IF stPointManager.Command.xExecute THEN
			stPointManager.Status.xBusy := TRUE;
			stPointManager.Diag.eState := E_POINT_MANAGER_STATE.CHECK_ZONE;
		END_IF
			
	// --------------------------------------------------
	E_POINT_MANAGER_STATE.CHECK_ZONE:
	// --------------------------------------------------
		stPointManager.Status.xBusy := TRUE;
		
		IF NOT ((stPointManager.Diag.lrX_MinLimit <= stPoint.X) AND (stPoint.X <= stPointManager.Diag.lrX_MaxLimit)) THEN
			stPointManager.Error.dwErrorActive := stPointManager.Error.dwErrorActive OR X_OUT_OF_LIMIT;
		END_IF
		
		IF NOT ((stPointManager.Diag.lrY_MinLimit <= stPoint.Y) AND (stPoint.Y <= stPointManager.Diag.lrY_MaxLimit)) THEN
			stPointManager.Error.dwErrorActive := stPointManager.Error.dwErrorActive OR Y_OUT_OF_LIMIT;
		END_IF
		
		IF NOT ((stPointManager.Diag.lrZ_MinLimit <= stPoint.Z) AND (stPoint.Z <= stPointManager.Diag.lrZ_MaxLimit)) THEN
			stPointManager.Error.dwErrorActive := stPointManager.Error.dwErrorActive OR Z_OUT_OF_LIMIT;
		END_IF
		
		stPointManager.Diag.eState := E_POINT_MANAGER_STATE.CHECK_VEL_FACTOR;
		
	// --------------------------------------------------
	E_POINT_MANAGER_STATE.CHECK_VEL_FACTOR:
	// --------------------------------------------------
		stPointManager.Status.xBusy := TRUE;
		
		IF  NOT ((0.1 < stPoint.SpeedFactor) AND(stPoint.SpeedFactor <= 1.0))  THEN
			stPointManager.Error.dwErrorActive := stPointManager.Error.dwErrorActive OR INVALID_VEL;
		END_IF
		
		stPointManager.Diag.eState := E_POINT_MANAGER_STATE.CHECK_ALL;
		
	// --------------------------------------------------
	E_POINT_MANAGER_STATE.CHECK_ALL:
	// --------------------------------------------------
		stPointManager.Status.xDone := TRUE;
		stPointManager.Status.xBusy := FALSE;
		IF stPointManager.Error.dwErrorActive <> DWORD#0 THEN
			stPointManager.Status.xInvalid := TRUE;
			stPointManager.Error.dwErrorLast := stPointManager.Error.dwErrorActive;
		ELSE
			stPointManager.Status.xInvalid := FALSE;
		END_IF
		
		IF NOT stPointManager.Command.xExecute THEN
			stPointManager.Diag.eState := E_POINT_MANAGER_STATE.IDLE;
		END_IF
		
END_CASE

stPointManager.Error.stErrorActive := UpdateErrorView(
	dwError := stPointManager.Error.dwErrorActive
);
stPointManager.Error.stErrorLast := UpdateErrorView(
	dwError := stPointManager.Error.dwErrorLast
);
