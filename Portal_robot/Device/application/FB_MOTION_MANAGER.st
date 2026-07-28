FUNCTION_BLOCK FB_MOTION_MANAGER
VAR_INPUT
	stPoint   : ARRAY [0..GVL_POINT.iPointNumber] OF ST_POINT;
	xReset    : BOOL;
END_VAR
VAR_OUTPUT
END_VAR
VAR
	curPoint : ST_POINT;
	curPointName : E_POINT_NAME;
	fbPointManager : FB_POINT_MANAGER;
END_VAR
VAR_IN_OUT
	stMotionManager : ST_MOTION_MANAGER;
	GroupData       : ST_AXIS_GROUP;
	stPointManager  : ST_POINT_MANAGER;
END_VAR

// --- BEGIN IMPLEMENTATION ---

stPointManager.lrX_MinLimit := -1000;
stPointManager.lrX_MaxLimit := 17000;
stPointManager.lrY_MinLimit := -1000;
stPointManager.lrY_MaxLimit := 17000;
stPointManager.lrZ_MinLimit := -1000;
stPointManager.lrZ_MaxLimit := 17000;
fbPointManager(
			stPointManager := stPointManager,
			stPoint := curPoint
		);
		
stMotionManager.Status.xBusy := FALSE;
stMotionManager.Status.xDone := FALSE;
stMotionManager.Status.xError := FALSE;
stMotionManager.Status.xReady:= FALSE;
stMotionManager.Command.xReset := xReset;


CASE stMotionManager.Diag.eState OF 
	// --------------------------------------------------
	E_MOTION_MANAGER_STATE.IDLE:
	// --------------------------------------------------
		stMotionManager.Status.xReady:= TRUE;
		IF stMotionManager.Command.xExecute AND NOT stMotionManager.Command.xGlobalError THEN
			stMotionManager.Status.xBusy := TRUE;
			stMotionManager.Diag.eState := E_MOTION_MANAGER_STATE.VALIDATE;
		ELSIF stMotionManager.Command.xGlobalError THEN
			stMotionManager.Diag.eState := E_MOTION_MANAGER_STATE.ERROR;
		END_IF
	
	// --------------------------------------------------
	E_MOTION_MANAGER_STATE.VALIDATE:
	// --------------------------------------------------
		stMotionManager.Status.xBusy := TRUE;
		curPoint := stPoint[stMotionManager.Command.eTargetPoint];
		curPointName := stMotionManager.Command.eTargetPoint;
		
		stPointManager.xExecute := TRUE;
		
		IF stPointManager.xDone AND NOT stPointManager.xInvalid THEN
			stPointManager.xExecute := FALSE;
			IF stMotionManager.Command.xMode THEN
				stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.MOTION_MODBUS;
			ELSE
				stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.MOTION_SIM;
			END_IF
		ELSIF stPointManager.xDone AND stPointManager.xInvalid THEN
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
		IF GroupData.Diag.iStep = E_AXIS_GROUP_STATE.READY AND NOT GroupData.Cmd.xMoveDirect AND NOT stMotionManager.Command.xGlobalError THEN
			GroupData.Cmd.xMoveDirect := TRUE;
		END_IF;
		
		IF GroupData.Status.xMoveDirectDone AND GroupData.Cmd.xMoveDirect THEN
			GroupData.Cmd.xMoveDirect := FALSE;
			stMotionManager.Status.eCurrentPoint := curPointName;
			stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.DONE;
		ELSIF GroupData.Diag.iStep = E_AXIS_GROUP_STATE.ERROR OR stMotionManager.Command.xGlobalError  THEN
			stMotionManager.Diag.eState := 	E_MOTION_MANAGER_STATE.ERROR;
		END_IF
	
	// --------------------------------------------------
	E_MOTION_MANAGER_STATE.ERROR:
	// --------------------------------------------------
		stMotionManager.Status.xError := TRUE;
		IF NOT stMotionManager.Command.xGlobalError AND stMotionManager.Command.xReset THEN
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
 