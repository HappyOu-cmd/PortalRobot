METHOD PRIVATE RunGeometryRoute

// --- BEGIN IMPLEMENTATION ---

CASE eState OF
	E_CELL_MANAGER_STATE.GEOMETRY_WAIT_FREE:
		IF uiGeometryParkStation = UINT#1 THEN eGeometrySafePoint := E_POINT_NAME.GEOMETRY_1_SAFE;
		ELSE eGeometrySafePoint := E_POINT_NAME.GEOMETRY_2_SAFE; END_IF;
		IF stRobotStatus.xBusy OR stRobotStatus.xDone OR xMotionBusy THEN
			// Освобождение ГК не отменяет уже выданное парковочное движение.
			Command.stRobot.xExecute := TRUE; Command.stRobot.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
			Command.stRobot.eSetPoint := eGeometrySafePoint;
			IF stRobotStatus.xDone THEN eGeometryReturnState := E_CELL_MANAGER_STATE.GEOMETRY_WAIT_FREE; eState := E_CELL_MANAGER_STATE.GEOMETRY_RELEASE_COMMAND; END_IF;
		ELSIF xStopRequested THEN
			xRunning := FALSE; eState := E_CELL_MANAGER_STATE.IDLE;
		ELSIF F_GEOMETRY_SELECT_STATION(xRequireFree := TRUE, uiMachine := uiGeometryMachine) > UINT#0 THEN
			eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
		ELSIF (F_GEOMETRY_SELECT_STATION(xRequireFree := FALSE, uiMachine := uiGeometryMachine) = UINT#0) OR NOT GVL_GEOMETRY_CONTROL.xWaitWhenOccupied THEN
			eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
		ELSE
			// Ожидаем с деталью в захвате на безопасной высоте; конвейер может работать.
			IF uiGeometryParkStation = UINT#1 THEN eGeometrySafePoint := E_POINT_NAME.GEOMETRY_1_SAFE;
			ELSE eGeometrySafePoint := E_POINT_NAME.GEOMETRY_2_SAFE; END_IF;
			IF stRobotStatus.eCurrentPoint <> eGeometrySafePoint THEN
				Command.stRobot.xExecute := TRUE; Command.stRobot.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
				Command.stRobot.eSetPoint := eGeometrySafePoint;
				IF stRobotStatus.xDone THEN eGeometryReturnState := E_CELL_MANAGER_STATE.GEOMETRY_WAIT_FREE; eState := E_CELL_MANAGER_STATE.GEOMETRY_RELEASE_COMMAND; END_IF;
			END_IF;
		END_IF;
	E_CELL_MANAGER_STATE.GEOMETRY_DELIVER:
		IF (uiGeometryStation < UINT#1) OR (uiGeometryStation > UINT#2) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT; eState := E_CELL_MANAGER_STATE.ERROR;
		ELSIF GVL_GEOMETRY_CONTROL.astStatus[uiGeometryStation].xError
		AND NOT GVL_GEOMETRY_CONTROL.astSignals[uiGeometryStation].xRobotInteraction THEN
			// Оборудование отказало до входа: робот может выбрать другой ГК.
			GVL_GEOMETRY_CONTROL.astSignals[uiGeometryStation].xReserve := FALSE;
			GVL_GEOMETRY_CONTROL.astSignals[uiGeometryStation].xReleased := TRUE;
			GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiStation := UINT#0;
			GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiState := UINT#2;
			GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiReason := UINT#4;
			F_GEOMETRY_EVENT(Call := GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine]);
			uiGeometryStation := UINT#0; eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
		ELSIF NOT GVL_GEOMETRY_CONTROL.astSignals[uiGeometryStation].xRobotInteraction
		AND (NOT GVL_GEOMETRY_CONTROL.astStatus[uiGeometryStation].xEnabled
			OR (GVL_GEOMETRY_CONTROL.astStatus[uiGeometryStation].uiState = UINT#5)
			OR GVL_GEOMETRY_CONTROL.astStatus[uiGeometryStation].xDriveRunning) THEN
			// Выключение в том же скане, что резерв, не разрешает вход робота.
			GVL_GEOMETRY_CONTROL.astSignals[uiGeometryStation].xReserve := FALSE;
			GVL_GEOMETRY_CONTROL.astSignals[uiGeometryStation].xReleased := TRUE;
			GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiStation := UINT#0;
			GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiState := UINT#2;
			GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiReason := UINT#3;
			F_GEOMETRY_EVENT(Call := GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine]);
			uiGeometryStation := UINT#0; eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
		ELSIF GVL_GEOMETRY_CONTROL.astStatus[uiGeometryStation].xError OR stRobotStatus.xError OR xGlobalError THEN
			xSafetyHomeRequired := TRUE; xStoppedPoseValid := FALSE;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT; eState := E_CELL_MANAGER_STATE.ERROR;
		ELSIF GVL_GEOMETRY_CONTROL.astStatus[uiGeometryStation].xReserved THEN
			IF uiGeometryStation = UINT#1 THEN
				eGeometrySafePoint := E_POINT_NAME.GEOMETRY_1_SAFE; eGeometryPlacePoint := E_POINT_NAME.GEOMETRY_1_PLACE;
			ELSE
				eGeometrySafePoint := E_POINT_NAME.GEOMETRY_2_SAFE; eGeometryPlacePoint := E_POINT_NAME.GEOMETRY_2_PLACE;
			END_IF;
			GVL_GEOMETRY_CONTROL.astSignals[uiGeometryStation].xRobotInteraction := TRUE;
			IF uiGeometryStep <= UINT#4 THEN
				Command.stRobot.xExecute := TRUE; Command.stRobot.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
				CASE uiGeometryStep OF
					UINT#0, UINT#4: Command.stRobot.eSetPoint := eGeometrySafePoint;
					// Для укладки на ГК нужна ориентация «к заготовке»; поворот выполняется на SAFE.
					UINT#1: Command.stRobot.eAction := E_ROBOT_ACTION.ROTATE_TO_BLANK;
					UINT#2: Command.stRobot.eSetPoint := eGeometryPlacePoint;
					UINT#3: Command.stRobot.eAction := E_ROBOT_ACTION.UNCLAMP_2;
				END_CASE;
				IF stRobotStatus.xDone THEN
					IF uiGeometryStep = UINT#3 THEN
						IF stRobotStatus.xGripper2Open AND NOT stRobotStatus.xDetailAvailable THEN
							GVL_GEOMETRY_CONTROL.astSignals[uiGeometryStation].xDeposited := TRUE;
							uiDetailPayloadType := UINT#0;
						ELSE Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT; eState := E_CELL_MANAGER_STATE.ERROR; END_IF;
					END_IF;
					IF eState <> E_CELL_MANAGER_STATE.ERROR THEN
						eGeometryReturnState := E_CELL_MANAGER_STATE.GEOMETRY_DELIVER;
						eState := E_CELL_MANAGER_STATE.GEOMETRY_RELEASE_COMMAND;
					END_IF;
				END_IF;
			ELSE
				GVL_GEOMETRY_CONTROL.astSignals[uiGeometryStation].xReserve := FALSE;
				GVL_GEOMETRY_CONTROL.astSignals[uiGeometryStation].xDeposited := FALSE;
				GVL_GEOMETRY_CONTROL.astSignals[uiGeometryStation].xRobotInteraction := FALSE;
				GVL_GEOMETRY_CONTROL.astSignals[uiGeometryStation].xReleased := TRUE;
				GVL_GEOMETRY_CONTROL.uiLastStation := uiGeometryStation;
				xGeometryHeld := FALSE; uiGeometryMachine := UINT#0; uiGeometryStation := UINT#0;
				eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
			END_IF;
		ELSE
			// Потеря резерва в зоне робота требует восстановления, а не нового маршрута.
			IF GVL_GEOMETRY_CONTROL.astSignals[uiGeometryStation].xRobotInteraction THEN
				xSafetyHomeRequired := TRUE; xStoppedPoseValid := FALSE;
				Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT; eState := E_CELL_MANAGER_STATE.ERROR;
			ELSIF NOT GVL_GEOMETRY_CONTROL.astStatus[uiGeometryStation].xReady
			OR (GVL_GEOMETRY_CONTROL.astStatus[uiGeometryStation].uiState = UINT#5) THEN
				GVL_GEOMETRY_CONTROL.astSignals[uiGeometryStation].xReserve := FALSE;
				GVL_GEOMETRY_CONTROL.astSignals[uiGeometryStation].xReleased := TRUE;
				GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiStation := UINT#0;
				GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiState := UINT#2;
				GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine].uiReason := UINT#3;
				F_GEOMETRY_EVENT(Call := GVL_GEOMETRY_CONTROL.astCalls[uiGeometryMachine]);
				uiGeometryStation := UINT#0; eState := E_CELL_MANAGER_STATE.PLAN_TARGET;
			END_IF;
		END_IF;
	E_CELL_MANAGER_STATE.GEOMETRY_RELEASE_COMMAND:
		IF stRobotStatus.xError THEN
			xSafetyHomeRequired := TRUE; xStoppedPoseValid := FALSE;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT; eState := E_CELL_MANAGER_STATE.ERROR;
		ELSIF NOT stRobotStatus.xBusy AND NOT stRobotStatus.xDone THEN
			IF eGeometryReturnState = E_CELL_MANAGER_STATE.GEOMETRY_DELIVER THEN uiGeometryStep := uiGeometryStep + UINT#1; END_IF;
			eState := eGeometryReturnState;
		END_IF;
END_CASE;
