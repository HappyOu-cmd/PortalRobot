FUNCTION_BLOCK FB_MOTION_MANAGER
VAR_INPUT
	stPoint : ARRAY [0..GVL_POINT.iPointNumber] OF ST_POINT; // Глобальная таблица точек
	xReset  : BOOL; // Сброс ошибок менеджера движения
	FaultRequest : ST_POINT_FAULT_REQUEST; // Диагностические ошибки проверки точки
END_VAR
VAR_OUTPUT
	FaultStatus : ST_FAULT_INJECTION_STATUS; // Состояние инжектора проверки точки
END_VAR
VAR
	curPoint      : ST_POINT; // Координаты выбранной точки
	curPointName  : E_POINT_NAME; // Имя выбранной точки
	fbPointManager: FB_POINT_MANAGER; // Проверка координат и скорости точки
	fbPointFaultInjector : FB_POINT_FAULT_INJECTOR; // Безопасная подмена проверяемой точки
	rtReset       : R_TRIG; // Фронт команды сброса менеджера движения
	xFaultAllowed : BOOL; // Менеджер готов к синтетической проверке без движения
END_VAR
VAR CONSTANT
	ERR_POINT_INVALID : DWORD := DWORD#16#0000_0001; // Недопустимая точка
	ERR_GROUP         : DWORD := DWORD#16#0000_0002; // Ошибка группы осей
	ERR_GLOBAL_STOP   : DWORD := DWORD#16#0000_0004; // Глобальная ошибка ячейки
	WRN_RESET_GLOBAL_ERROR : UINT := 1; // Глобальная ошибка ещё активна
	WRN_SIM_ERROR_NOT_ALLOWED : UINT := 2; // Тестовая проверка запрещена текущим состоянием
END_VAR
VAR_IN_OUT
	stMotionManager : ST_MOTION_MANAGER; // Команды, статусы и диагностика менеджера движения
	GroupData       : ST_AXIS_GROUP; // Команды, статусы и диагностика группы XYZ
	stPointManager  : ST_POINT_MANAGER; // Команды, статусы и диагностика проверки точки
END_VAR

// --- BEGIN IMPLEMENTATION ---

xFaultAllowed := (stMotionManager.Diag.eState = E_MOTION_MANAGER_STATE.IDLE)
	AND NOT stMotionManager.Command.xExecute
	AND NOT stMotionManager.Command.xGlobalError
	AND (stMotionManager.Error.dwErrorActive = DWORD#0)
	AND NOT GroupData.Status.xLocalError
	AND NOT GroupData.Command.xMoveDirect
	AND NOT GroupData.Command.xMoveLinear;

fbPointFaultInjector(
	Request := FaultRequest,
	xOwnerAllowed := xFaultAllowed,
	xComplete := stMotionManager.Diag.eState = E_MOTION_MANAGER_STATE.ERROR,
	PointRaw := stPoint[E_POINT_NAME.MAGAZINE_DETAIL]
);
FaultStatus := fbPointFaultInjector.Status;

IF fbPointFaultInjector.Status.xRejected THEN
	stPointManager.Diag.stWarning.uiCode := WRN_SIM_ERROR_NOT_ALLOWED;
	stPointManager.Diag.stWarning.udiSequence := stPointManager.Diag.stWarning.udiSequence + UDINT#1;
	IF stPointManager.Diag.stWarning.udiSequence = UDINT#0 THEN
		stPointManager.Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

IF fbPointFaultInjector.xExecute THEN
	curPoint := fbPointFaultInjector.Point;
	curPointName := E_POINT_NAME.NONE;
END_IF;

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
		// Менеджер является единственным владельцем команд движения группы.
		// После завершения или сброса не оставляем уровень Execute защёлкнутым.
		GroupData.Command.xMoveDirect := FALSE;
		GroupData.Command.xMoveLinear := FALSE;
		stMotionManager.Status.xReady:= TRUE;
		IF (stMotionManager.Command.xExecute OR fbPointFaultInjector.xExecute)
		AND NOT stMotionManager.Command.xGlobalError THEN
			stMotionManager.Status.xBusy := TRUE;
			stMotionManager.Diag.eState := E_MOTION_MANAGER_STATE.VALIDATE;
		ELSIF stMotionManager.Command.xGlobalError THEN
			stMotionManager.Error.dwErrorActive := stMotionManager.Error.dwErrorActive OR ERR_GLOBAL_STOP;
			stMotionManager.Diag.eState := E_MOTION_MANAGER_STATE.ERROR;
		END_IF;
	
	// --------------------------------------------------
	E_MOTION_MANAGER_STATE.VALIDATE:
	// --------------------------------------------------
		stMotionManager.Status.xBusy := TRUE;
		IF NOT fbPointFaultInjector.xExecute THEN
			curPoint := stPoint[stMotionManager.Command.eTargetPoint];
			curPointName := stMotionManager.Command.eTargetPoint;
		END_IF;
		
		stPointManager.Command.xExecute := TRUE;
		
		IF stPointManager.Status.xDone AND NOT stPointManager.Status.xInvalid THEN
			stPointManager.Command.xExecute := FALSE;
			IF stMotionManager.Command.xMode THEN
				stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.MOTION_MODBUS;
			ELSE
				stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.MOTION_SIM;
			END_IF;
		ELSIF stPointManager.Status.xDone AND stPointManager.Status.xInvalid THEN
			stPointManager.Command.xExecute := FALSE;
			stMotionManager.Error.dwErrorActive := stMotionManager.Error.dwErrorActive OR ERR_POINT_INVALID;
			stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.ERROR;
		END_IF;
	
	// --------------------------------------------------
	E_MOTION_MANAGER_STATE.MOTION_SIM:
	// --------------------------------------------------
	
		stMotionManager.Status.xBusy := TRUE;
		 
		GroupData.MotionParam.lrX := curPoint.X;
		GroupData.MotionParam.lrY := curPoint.Y;
		GroupData.MotionParam.lrZ := curPoint.Z;
		GroupData.MotionParam.VelFactor := curPoint.SpeedFactor;
		// SpeedFactor точки ограничивает только скорость. Ускорение, замедление и
		// jerk остаются инженерными пределами и не ослабляют торможение робота.
		GroupData.MotionParam.AccFactor := 1.0;
		GroupData.MotionParam.JerkFactor := 1.0;
		IF GroupData.Diag.iStep = E_AXIS_GROUP_STATE.READY
		AND NOT GroupData.Command.xMoveDirect
		AND NOT stMotionManager.Command.xGlobalError
		AND NOT stMotionManager.Command.xStop THEN
			GroupData.Command.xMoveDirect := TRUE;
		END_IF;
		
		IF stMotionManager.Command.xStop THEN
			GroupData.Command.xMoveDirect := FALSE;
			GroupData.Command.xMoveLinear := FALSE;
			stMotionManager.Status.xBusy := FALSE;
			stMotionManager.Diag.eState := E_MOTION_MANAGER_STATE.IDLE;
		ELSIF GroupData.Status.xMoveDirectDone AND GroupData.Command.xMoveDirect THEN
			GroupData.Command.xMoveDirect := FALSE;
			stMotionManager.Status.eCurrentPoint := curPointName;
			stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.DONE;
		ELSIF GroupData.Diag.iStep = E_AXIS_GROUP_STATE.ERROR OR stMotionManager.Command.xGlobalError  THEN
			GroupData.Command.xMoveDirect := FALSE;
			GroupData.Command.xMoveLinear := FALSE;
			IF GroupData.Diag.iStep = E_AXIS_GROUP_STATE.ERROR THEN
				stMotionManager.Error.dwErrorActive := stMotionManager.Error.dwErrorActive OR ERR_GROUP;
			END_IF;
			IF stMotionManager.Command.xGlobalError THEN
				stMotionManager.Error.dwErrorActive := stMotionManager.Error.dwErrorActive OR ERR_GLOBAL_STOP;
			END_IF;
			stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.ERROR;
		END_IF;
	
	// --------------------------------------------------
	E_MOTION_MANAGER_STATE.ERROR:
	// --------------------------------------------------
		GroupData.Command.xMoveDirect := FALSE;
		GroupData.Command.xMoveLinear := FALSE;
		stMotionManager.Status.xError := TRUE;
		IF NOT stMotionManager.Command.xGlobalError AND stMotionManager.Command.xReset THEN
			stMotionManager.Error.dwErrorLast := stMotionManager.Error.dwErrorActive;
			stMotionManager.Error.dwErrorActive := DWORD#0;
			stMotionManager.Status.xError := FALSE;
			stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.IDLE;
		END_IF;
	
	
	// --------------------------------------------------
	E_MOTION_MANAGER_STATE.DONE:
	// --------------------------------------------------
		stMotionManager.Status.xBusy := FALSE;
		stMotionManager.Status.xDone := TRUE;
		IF NOT stMotionManager.Command.xExecute THEN
			stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.IDLE;
		END_IF;
	END_CASE;

// Журнал отражает состояние каждого FB, включая каскадные ошибки зависимостей.
stMotionManager.Error.dwAlarmActive := stMotionManager.Error.dwErrorActive;

stMotionManager.Error.stErrorActive := UpdateErrorView(
	dwError := stMotionManager.Error.dwErrorActive
);
stMotionManager.Error.stErrorLast := UpdateErrorView(
	dwError := stMotionManager.Error.dwErrorLast
);
FaultStatus.xResetAllowed := stMotionManager.Status.xError
	AND NOT FaultStatus.xBusy;
