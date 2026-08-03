FUNCTION_BLOCK FB_MOTION_MANAGER
VAR_INPUT
	stPoint : ARRAY [0..GVL_POINT.iPointNumber] OF ST_POINT; // Глобальная таблица точек
	xReset  : BOOL; // Сброс ошибок менеджера движения
END_VAR
VAR_OUTPUT
END_VAR
VAR
	curPoint      : ST_POINT; // Координаты выбранной точки
	curPointName  : E_POINT_NAME; // Имя выбранной точки
	fbPointManager: FB_POINT_MANAGER; // Проверка координат и скорости точки
	rtReset       : R_TRIG; // Фронт команды сброса менеджера движения
END_VAR
VAR CONSTANT
	ERR_POINT_INVALID : DWORD := DWORD#16#0000_0001; // Недопустимая точка
	ERR_GROUP         : DWORD := DWORD#16#0000_0002; // Ошибка группы осей
	ERR_GLOBAL_STOP   : DWORD := DWORD#16#0000_0004; // Глобальная ошибка ячейки
	WRN_RESET_GLOBAL_ERROR : UINT := 1; // Глобальная ошибка ещё активна
END_VAR
VAR_IN_OUT
	stMotionManager : ST_MOTION_MANAGER; // Команды, статусы и диагностика менеджера движения
	GroupData       : ST_AXIS_GROUP; // Команды, статусы и диагностика группы XYZ
	stPointManager  : ST_POINT_MANAGER; // Команды, статусы и диагностика проверки точки
END_VAR

// --- BEGIN IMPLEMENTATION ---

stPointManager.Diag.lrX_MinLimit := -1000;
stPointManager.Diag.lrX_MaxLimit := 17000;
stPointManager.Diag.lrY_MinLimit := -1000;
stPointManager.Diag.lrY_MaxLimit := 17000;
stPointManager.Diag.lrZ_MinLimit := -1000;
stPointManager.Diag.lrZ_MaxLimit := 17000;
fbPointManager(
			stPointManager := stPointManager,
			stPoint := curPoint
		);
		
stMotionManager.Status.xBusy := FALSE;
stMotionManager.Status.xDone := FALSE;
stMotionManager.Status.xError := FALSE;
stMotionManager.Status.xReady:= FALSE;
stMotionManager.Command.xReset := xReset;
rtReset(CLK := xReset);

IF rtReset.Q
AND (stMotionManager.Diag.eState = E_MOTION_MANAGER_STATE.ERROR)
AND stMotionManager.Command.xGlobalError THEN
	stMotionManager.Diag.stWarning.uiCode := WRN_RESET_GLOBAL_ERROR;
	stMotionManager.Diag.stWarning.udiSequence := stMotionManager.Diag.stWarning.udiSequence + UDINT#1;
	IF stMotionManager.Diag.stWarning.udiSequence = UDINT#0 THEN
		stMotionManager.Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;


CASE stMotionManager.Diag.eState OF 
	// --------------------------------------------------
	E_MOTION_MANAGER_STATE.IDLE:
	// --------------------------------------------------
		stMotionManager.Status.xReady:= TRUE;
		IF stMotionManager.Command.xExecute AND NOT stMotionManager.Command.xGlobalError THEN
			stMotionManager.Status.xBusy := TRUE;
			stMotionManager.Diag.eState := E_MOTION_MANAGER_STATE.VALIDATE;
		ELSIF stMotionManager.Command.xGlobalError THEN
			stMotionManager.Error.dwErrorActive := stMotionManager.Error.dwErrorActive OR ERR_GLOBAL_STOP;
			stMotionManager.Diag.eState := E_MOTION_MANAGER_STATE.ERROR;
		END_IF
	
	// --------------------------------------------------
	E_MOTION_MANAGER_STATE.VALIDATE:
	// --------------------------------------------------
		stMotionManager.Status.xBusy := TRUE;
		curPoint := stPoint[stMotionManager.Command.eTargetPoint];
		curPointName := stMotionManager.Command.eTargetPoint;
		
		stPointManager.Command.xExecute := TRUE;
		
		IF stPointManager.Status.xDone AND NOT stPointManager.Status.xInvalid THEN
			stPointManager.Command.xExecute := FALSE;
			IF stMotionManager.Command.xMode THEN
				stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.MOTION_MODBUS;
			ELSE
				stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.MOTION_SIM;
			END_IF
		ELSIF stPointManager.Status.xDone AND stPointManager.Status.xInvalid THEN
			stMotionManager.Error.dwErrorActive := stMotionManager.Error.dwErrorActive OR ERR_POINT_INVALID;
			stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.ERROR;
		END_IF
	
	// --------------------------------------------------
	E_MOTION_MANAGER_STATE.MOTION_SIM:
	// --------------------------------------------------
	
		stMotionManager.Status.xBusy := TRUE;
		 
		GroupData.MotionParam.lrX := curPoint.X;
		GroupData.MotionParam.lrY := curPoint.Y;
		GroupData.MotionParam.lrZ := curPoint.Z;
		GroupData.MotionParam.VelFactor := curPoint.SpeedFactor;
		GroupData.MotionParam.AccFactor := curPoint.SpeedFactor;
		GroupData.MotionParam.JerkFactor := curPoint.SpeedFactor;
		IF GroupData.Diag.iStep = E_AXIS_GROUP_STATE.READY AND NOT GroupData.Command.xMoveDirect AND NOT stMotionManager.Command.xGlobalError THEN
			GroupData.Command.xMoveDirect := TRUE;
		END_IF;
		
		IF GroupData.Status.xMoveDirectDone AND GroupData.Command.xMoveDirect THEN
			GroupData.Command.xMoveDirect := FALSE;
			stMotionManager.Status.eCurrentPoint := curPointName;
			stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.DONE;
		ELSIF GroupData.Diag.iStep = E_AXIS_GROUP_STATE.ERROR OR stMotionManager.Command.xGlobalError  THEN
			IF GroupData.Diag.iStep = E_AXIS_GROUP_STATE.ERROR THEN
				stMotionManager.Error.dwErrorActive := stMotionManager.Error.dwErrorActive OR ERR_GROUP;
			END_IF;
			IF stMotionManager.Command.xGlobalError THEN
				stMotionManager.Error.dwErrorActive := stMotionManager.Error.dwErrorActive OR ERR_GLOBAL_STOP;
			END_IF;
			stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.ERROR;
		END_IF
	
	// --------------------------------------------------
	E_MOTION_MANAGER_STATE.ERROR:
	// --------------------------------------------------
		stMotionManager.Status.xError := TRUE;
		IF NOT stMotionManager.Command.xGlobalError AND stMotionManager.Command.xReset THEN
			stMotionManager.Error.dwErrorLast := stMotionManager.Error.dwErrorActive;
			stMotionManager.Error.dwErrorActive := DWORD#0;
			stMotionManager.Status.xError := FALSE;
			stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.IDLE;
		END_IF
	
	
	// --------------------------------------------------
	E_MOTION_MANAGER_STATE.DONE:
	// --------------------------------------------------
		stMotionManager.Status.xBusy := FALSE;
		stMotionManager.Status.xDone := TRUE;
		IF NOT stMotionManager.Command.xExecute THEN
			stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.IDLE;
		END_IF
	END_CASE

// Все текущие ошибки менеджера являются следствием точки, группы или внешней остановки.
stMotionManager.Error.dwAlarmActive := DWORD#0;

stMotionManager.Error.stErrorActive := UpdateErrorView(
	dwError := stMotionManager.Error.dwErrorActive
);
stMotionManager.Error.stErrorLast := UpdateErrorView(
	dwError := stMotionManager.Error.dwErrorLast
);
