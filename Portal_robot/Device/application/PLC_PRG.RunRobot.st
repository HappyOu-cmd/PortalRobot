METHOD PRIVATE RunRobot

// --- BEGIN IMPLEMENTATION ---

// Старый типизированный канал сохраняется для совместимости. Новый HMI пишет
// числовые коды, которые преобразуются в enum только внутри PLC.
stRobotHmiCommand := GVL_HMI.stRobotCommand;
xHmiRobotActionAttempt := GVL_HMI.xRobotManualExecute OR GVL_HMI.stRobotCommand.xExecute;

// Числовой канал HMI хранит последнюю выбранную точку. Он нужен не только для
// импульса Execute: по нему HMI получает актуальный xAllowed ещё до отправки
// команды. Типизированный legacy-канал при этом остаётся владельцем своей
// команды, если Execute пришёл напрямую через stRobotCommand.
eHmiRobotStatusAction := stRobotHmiCommand.eAction;
eHmiRobotStatusPoint := stRobotHmiCommand.eSetPoint;
IF GVL_HMI.uiRobotManualAction > UINT#0 THEN
	CASE GVL_HMI.uiRobotManualAction OF
		1: eHmiRobotStatusAction := E_ROBOT_ACTION.MOVE_TO_POINT;
		2: eHmiRobotStatusAction := E_ROBOT_ACTION.UNCLAMP_1;
		3: eHmiRobotStatusAction := E_ROBOT_ACTION.CLAMP_1;
		4: eHmiRobotStatusAction := E_ROBOT_ACTION.UNCLAMP_2;
		5: eHmiRobotStatusAction := E_ROBOT_ACTION.CLAMP_2;
		6: eHmiRobotStatusAction := E_ROBOT_ACTION.ROTATE_TO_BLANK;
		7: eHmiRobotStatusAction := E_ROBOT_ACTION.ROTATE_TO_DETAIL;
	ELSE
		eHmiRobotStatusAction := E_ROBOT_ACTION.NONE;
	END_CASE;
	CASE GVL_HMI.uiRobotManualPoint OF
		1: eHmiRobotStatusPoint := E_POINT_NAME.MACHINE_1_ABOVE;
		3: eHmiRobotStatusPoint := E_POINT_NAME.MACHINE_1_CHUCK_APROACH;
		4: eHmiRobotStatusPoint := E_POINT_NAME.MACHINE_1_CHUCK_POSITION;
		5: eHmiRobotStatusPoint := E_POINT_NAME.MACHINE_2_ABOVE;
		7: eHmiRobotStatusPoint := E_POINT_NAME.MACHINE_2_CHUCK_APROACH;
		8: eHmiRobotStatusPoint := E_POINT_NAME.MACHINE_2_CHUCK_POSITION;
		9: eHmiRobotStatusPoint := E_POINT_NAME.MACHINE_3_ABOVE;
		11: eHmiRobotStatusPoint := E_POINT_NAME.MACHINE_3_CHUCK_APROACH;
		12: eHmiRobotStatusPoint := E_POINT_NAME.MACHINE_3_CHUCK_POSITION;
		13: eHmiRobotStatusPoint := E_POINT_NAME.HOME_SAFETY;
		14: eHmiRobotStatusPoint := E_POINT_NAME.MAGAZINE_SAFE;
		15: eHmiRobotStatusPoint := E_POINT_NAME.MAGAZINE_CHANGE;
		16: eHmiRobotStatusPoint := E_POINT_NAME.MAGAZINE_IN_SLOT;
	ELSE
		eHmiRobotStatusPoint := E_POINT_NAME.NONE;
	END_CASE;
END_IF;

IF GVL_HMI.xRobotManualExecute THEN
	stRobotHmiCommand.xExecute := FALSE;
	stRobotHmiCommand.eAction := E_ROBOT_ACTION.NONE;
	stRobotHmiCommand.eSetPoint := E_POINT_NAME.NONE;
	CASE GVL_HMI.uiRobotManualAction OF
		1: stRobotHmiCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
		2: stRobotHmiCommand.eAction := E_ROBOT_ACTION.UNCLAMP_1;
		3: stRobotHmiCommand.eAction := E_ROBOT_ACTION.CLAMP_1;
		4: stRobotHmiCommand.eAction := E_ROBOT_ACTION.UNCLAMP_2;
		5: stRobotHmiCommand.eAction := E_ROBOT_ACTION.CLAMP_2;
		6: stRobotHmiCommand.eAction := E_ROBOT_ACTION.ROTATE_TO_BLANK;
		7: stRobotHmiCommand.eAction := E_ROBOT_ACTION.ROTATE_TO_DETAIL;
	END_CASE;
	CASE GVL_HMI.uiRobotManualPoint OF
		1: stRobotHmiCommand.eSetPoint := E_POINT_NAME.MACHINE_1_ABOVE;
		3: stRobotHmiCommand.eSetPoint := E_POINT_NAME.MACHINE_1_CHUCK_APROACH;
		4: stRobotHmiCommand.eSetPoint := E_POINT_NAME.MACHINE_1_CHUCK_POSITION;
		5: stRobotHmiCommand.eSetPoint := E_POINT_NAME.MACHINE_2_ABOVE;
		7: stRobotHmiCommand.eSetPoint := E_POINT_NAME.MACHINE_2_CHUCK_APROACH;
		8: stRobotHmiCommand.eSetPoint := E_POINT_NAME.MACHINE_2_CHUCK_POSITION;
		9: stRobotHmiCommand.eSetPoint := E_POINT_NAME.MACHINE_3_ABOVE;
		11: stRobotHmiCommand.eSetPoint := E_POINT_NAME.MACHINE_3_CHUCK_APROACH;
		12: stRobotHmiCommand.eSetPoint := E_POINT_NAME.MACHINE_3_CHUCK_POSITION;
		13: stRobotHmiCommand.eSetPoint := E_POINT_NAME.HOME_SAFETY;
		14: stRobotHmiCommand.eSetPoint := E_POINT_NAME.MAGAZINE_SAFE;
		15: stRobotHmiCommand.eSetPoint := E_POINT_NAME.MAGAZINE_CHANGE;
		16: stRobotHmiCommand.eSetPoint := E_POINT_NAME.MAGAZINE_IN_SLOT;
	END_CASE;
	IF GVL_HMI.uiRobotManualSlot <= SINT_TO_UINT(GVL_CELL_SETTINGS.NumberDetail) THEN
		stRobotHmiCommand.iActiveSlot := UINT_TO_SINT(GVL_HMI.uiRobotManualSlot);
	ELSE
		stRobotHmiCommand.iActiveSlot := SINT#0;
	END_IF;
	stRobotHmiCommand.uiMagazineId := GVL_HMI.uiRobotManualMagazine;
END_IF;

// Два FB_MAGAZINE не имеют права одновременно владеть роботом.
stSelectedMagazineCommand.xExecute := FALSE;
stSelectedMagazineCommand.xStop := FALSE;
stSelectedMagazineCommand.xReset := FALSE;
stSelectedMagazineCommand.eAction := E_ROBOT_ACTION.NONE;
stSelectedMagazineCommand.eSetPoint := E_POINT_NAME.NONE;
stSelectedMagazineCommand.iActiveSlot := SINT#0;
stSelectedMagazineCommand.uiMagazineId := UINT#0;
IF GVL_MAGAZINE.astCommand[1].xExecute OR GVL_MAGAZINE.astCommand[1].xStop THEN
	stSelectedMagazineCommand := GVL_MAGAZINE.astCommand[1];
ELSIF GVL_MAGAZINE.astCommand[2].xExecute OR GVL_MAGAZINE.astCommand[2].xStop THEN
	stSelectedMagazineCommand := GVL_MAGAZINE.astCommand[2];
END_IF;

xHmiRobotActionBaseAllowed := xRobotHmiPermit
	AND NOT xPointCheckActive
	AND xHmiConnectionAlive
	AND NOT GVL_CELL_CONTROL.xGlobalError
	AND NOT GVL_ROBOT.Status.xBusy
	AND NOT GVL_ROBOT.Status.xError
	AND (
		(GVL_HMI.xModbusMode AND GVL_ROBOT_MODBUS.Status.xReady)
		OR (NOT GVL_HMI.xModbusMode
			AND xDrivesReady
			AND NOT xMotionBusy
			AND NOT xDriveError
			AND GVL_POINT_MANAGER.PointManager.Diag.xXLimitValid
			AND GVL_POINT_MANAGER.PointManager.Diag.xYLimitValid
			AND GVL_POINT_MANAGER.PointManager.Diag.xZLimitValid)
	);

// Входные точки станков разрешены только при подтверждённом открытом люке.
// Проверка находится в PLC и действует одинаково для числового и legacy-канала.
xHmiRobotPointTargetAllowed := TRUE;
CASE stRobotHmiCommand.eSetPoint OF
	E_POINT_NAME.MACHINE_1_INSIDE,
	E_POINT_NAME.MACHINE_1_CHUCK_APROACH,
	E_POINT_NAME.MACHINE_1_CHUCK_POSITION:
		xHmiRobotPointTargetAllowed := GVL_MACHINE.Status[1].stIo.xDoorOpen
			AND NOT GVL_MACHINE.Status[1].stIo.xDoorClosed;
	E_POINT_NAME.MACHINE_2_INSIDE,
	E_POINT_NAME.MACHINE_2_CHUCK_APROACH,
	E_POINT_NAME.MACHINE_2_CHUCK_POSITION:
		xHmiRobotPointTargetAllowed := GVL_MACHINE.Status[2].stIo.xDoorOpen
			AND NOT GVL_MACHINE.Status[2].stIo.xDoorClosed;
	E_POINT_NAME.MACHINE_3_INSIDE,
	E_POINT_NAME.MACHINE_3_CHUCK_APROACH,
	E_POINT_NAME.MACHINE_3_CHUCK_POSITION:
		xHmiRobotPointTargetAllowed := GVL_MACHINE.Status[3].stIo.xDoorOpen
			AND NOT GVL_MACHINE.Status[3].stIo.xDoorClosed;
END_CASE;

xHmiRobotPointAllowed := xHmiRobotActionBaseAllowed
	AND (stRobotHmiCommand.eSetPoint <> E_POINT_NAME.NONE)
	AND xHmiRobotPointTargetAllowed
	AND (
		((stRobotHmiCommand.eSetPoint <> E_POINT_NAME.MAGAZINE_SAFE)
		AND (stRobotHmiCommand.eSetPoint <> E_POINT_NAME.MAGAZINE_CHANGE)
		AND (stRobotHmiCommand.eSetPoint <> E_POINT_NAME.MAGAZINE_IN_SLOT))
		OR (
			(stRobotHmiCommand.iActiveSlot >= SINT#1)
			AND (SINT_TO_UINT(stRobotHmiCommand.iActiveSlot)
				<= (GVL_CELL_SETTINGS.MagazineRows * GVL_CELL_SETTINGS.MagazineColumns))
			AND (stRobotHmiCommand.uiMagazineId >= UINT#1)
			AND (stRobotHmiCommand.uiMagazineId <= UINT#2)
		)
	);

// Захваты не зависят от питания и состояния Motion-слоя. В ручном режиме ими
// можно пользоваться при любой внешней аварии, пока исправен сам блок захвата
// и он не выполняет предыдущее действие.
xHmiGripperActionBaseAllowed := xRobotHmiPermit
	AND NOT xPointCheckActive
	AND xHmiConnectionAlive
	AND NOT GVL_ROBOT.Status.xBusy
	AND (
		(GVL_HMI.xModbusMode AND GVL_ROBOT_MODBUS.Status.xReady)
		OR (NOT GVL_HMI.xModbusMode
			AND (GVL_ROBOT.GripperError.dwAlarmActive = DWORD#0)
			AND (GVL_ROBOT.GripperDiag.eState = E_GRIPPER_STATE.IDLE))
	);

xHmiRobotActionAllowed := FALSE;
CASE stRobotHmiCommand.eAction OF
	E_ROBOT_ACTION.MOVE_TO_POINT:
		xHmiRobotActionAllowed := xHmiRobotPointAllowed;
	E_ROBOT_ACTION.UNCLAMP_1:
		xHmiRobotActionAllowed := xHmiGripperActionBaseAllowed
			AND NOT GVL_ROBOT.Status.xGripper1Open;
	E_ROBOT_ACTION.CLAMP_1:
		xHmiRobotActionAllowed := xHmiGripperActionBaseAllowed
			AND NOT GVL_ROBOT.Status.xGripper1Closed;
	E_ROBOT_ACTION.UNCLAMP_2:
		xHmiRobotActionAllowed := xHmiGripperActionBaseAllowed
			AND NOT GVL_ROBOT.Status.xGripper2Open;
	E_ROBOT_ACTION.CLAMP_2:
		xHmiRobotActionAllowed := xHmiGripperActionBaseAllowed
			AND NOT GVL_ROBOT.Status.xGripper2Closed;
	E_ROBOT_ACTION.ROTATE_TO_BLANK:
		xHmiRobotActionAllowed := xHmiGripperActionBaseAllowed
			AND NOT GVL_ROBOT.Status.xRotatedToBlank;
	E_ROBOT_ACTION.ROTATE_TO_DETAIL:
		xHmiRobotActionAllowed := xHmiGripperActionBaseAllowed
			AND NOT GVL_ROBOT.Status.xRotatedToDetail;
END_CASE;

IF GVL_HMI.xRobotManualExecute THEN
	stRobotHmiCommand.xExecute := xHmiRobotActionAllowed;
ELSIF stRobotHmiCommand.xExecute AND NOT xHmiRobotActionAllowed THEN
	stRobotHmiCommand.xExecute := FALSE;
END_IF;

// Общая ошибка запрещает координатное движение, но не ручное управление
// независимым пневматическим захватом.
IF GVL_CELL_CONTROL.xGlobalError
AND (stRobotHmiCommand.eAction = E_ROBOT_ACTION.MOVE_TO_POINT) THEN
	stRobotHmiCommand.xExecute := FALSE;
	stRobotHmiCommand.eAction := E_ROBOT_ACTION.NONE;
	stRobotHmiCommand.eSetPoint := E_POINT_NAME.NONE;
END_IF;
// Stop является импульсом текущего цикла и не должен защёлкиваться в локальной команде.
stRobotHmiCommand.xStop := xHmiStopAccepted;
rtHmiRobotAction(CLK := xHmiRobotActionAttempt);

// Единственный владелец временных точек разрешает координаты и для ручной,
// и для автоматической команды. FB_MAGAZINE больше не пишет общую таблицу.
stMagazinePointCommand := stSelectedMagazineCommand;
IF (stRobotHmiCommand.eSetPoint = E_POINT_NAME.MAGAZINE_SAFE)
OR (stRobotHmiCommand.eSetPoint = E_POINT_NAME.MAGAZINE_CHANGE)
OR (stRobotHmiCommand.eSetPoint = E_POINT_NAME.MAGAZINE_IN_SLOT) THEN
	stMagazinePointCommand := stRobotHmiCommand;
END_IF;
eMagazineBasePoint := E_POINT_NAME.NONE;
CASE stMagazinePointCommand.uiMagazineId OF
	UINT#1: eMagazineBasePoint := E_POINT_NAME.MAGAZINE_1_DETAIL;
	UINT#2: eMagazineBasePoint := E_POINT_NAME.MAGAZINE_2_DETAIL;
END_CASE;

IF NOT GVL_HMI.xModbusMode
AND (GVL_CELL_SETTINGS.MagazineRows > UINT#0)
AND (GVL_CELL_SETTINGS.MagazineColumns > UINT#0)
AND (eMagazineBasePoint <> E_POINT_NAME.NONE)
AND (stMagazinePointCommand.iActiveSlot >= SINT#1)
AND (SINT_TO_UINT(stMagazinePointCommand.iActiveSlot)
	<= (GVL_CELL_SETTINGS.MagazineRows * GVL_CELL_SETTINGS.MagazineColumns))
AND ((stMagazinePointCommand.eSetPoint = E_POINT_NAME.MAGAZINE_SAFE)
	OR (stMagazinePointCommand.eSetPoint = E_POINT_NAME.MAGAZINE_CHANGE)
	OR (stMagazinePointCommand.eSetPoint = E_POINT_NAME.MAGAZINE_IN_SLOT)) THEN
	uiRobotManualMagazineIndex := SINT_TO_UINT(stMagazinePointCommand.iActiveSlot - SINT#1);
	uiRobotManualMagazineColumn := uiRobotManualMagazineIndex MOD GVL_CELL_SETTINGS.MagazineColumns;
	uiRobotManualMagazineRow := uiRobotManualMagazineIndex / GVL_CELL_SETTINGS.MagazineColumns;
	GVL_POINT.Points[stMagazinePointCommand.eSetPoint] := GVL_POINT.Points[eMagazineBasePoint];
	GVL_POINT.Points[stMagazinePointCommand.eSetPoint].X :=
		GVL_POINT.Points[stMagazinePointCommand.eSetPoint].X
		+ UINT_TO_LREAL(uiRobotManualMagazineColumn) * GVL_HMI.MagazinePitchX;
	GVL_POINT.Points[stMagazinePointCommand.eSetPoint].Y :=
		GVL_POINT.Points[stMagazinePointCommand.eSetPoint].Y
		+ UINT_TO_LREAL(uiRobotManualMagazineRow) * GVL_HMI.MagazinePitchY;
	IF stMagazinePointCommand.eSetPoint = E_POINT_NAME.MAGAZINE_SAFE THEN
		GVL_POINT.Points[stMagazinePointCommand.eSetPoint].Z :=
			GVL_HMI.alrMagazineSafeZ_1[stMagazinePointCommand.uiMagazineId];
	ELSIF stMagazinePointCommand.eSetPoint = E_POINT_NAME.MAGAZINE_CHANGE THEN
		GVL_POINT.Points[stMagazinePointCommand.eSetPoint].Z :=
			GVL_HMI.alrMagazineSafeZ_2[stMagazinePointCommand.uiMagazineId];
	END_IF;
END_IF;

// Внешний контроллер включается только со своего пульта. Из HMI доступны Stop,
// Reset и семантические команды при подтверждённой связи/готовности.
IF GVL_HMI.xModbusMode THEN
	GVL_HMI.stRobotHmiStatus.xDrivesPowered := GVL_ROBOT_MODBUS.Status.xDrivesEnabled;
	GVL_HMI.stRobotHmiStatus.xDrivesOff := NOT GVL_ROBOT_MODBUS.Status.xDrivesEnabled;
	GVL_HMI.stRobotHmiStatus.xPowerTransitionActive := FALSE;
	GVL_HMI.stRobotHmiStatus.xDrivesEnableAllowed := FALSE;
	GVL_HMI.stRobotHmiStatus.xDrivesDisableAllowed := FALSE;
	GVL_HMI.stRobotHmiStatus.xStopAllowed := xRobotHmiPermit
		AND GVL_ROBOT_MODBUS.Status.xCommunicationAlive
		AND GVL_ROBOT_MODBUS.Status.xBusy;
	GVL_HMI.stRobotHmiStatus.xResetAllowed := xRobotHmiPermit
		AND GVL_ROBOT_MODBUS.Status.xCommunicationAlive
		AND NOT GVL_ROBOT_MODBUS.Status.xBusy
		AND GVL_ROBOT_MODBUS.Status.xError;
	xHmiStopAccepted := GVL_HMI.xRobotStop
		AND GVL_HMI.stRobotHmiStatus.xStopAllowed;
END_IF;

// Отдельный владелец проверки инженерной точки. Все технологические условия
// вычисляются здесь, а мобильный клиент получает только результат xAllowed.
FOR uiPointCheckLoop := UINT#1 TO UINT#12 DO
	stPointCheckCandidate := GVL_POINT.Points[aePointCheckNames[uiPointCheckLoop]];
	uiPointCheckReason := UINT#0;
	uiPointCheckMachine := UINT#0;
	IF (uiPointCheckLoop <= UINT#9) AND ((uiPointCheckLoop MOD UINT#3) <> UINT#1) THEN
		uiPointCheckMachine := (uiPointCheckLoop - UINT#1) / UINT#3 + UINT#1;
	END_IF;
	IF NOT xHmiConnectionAlive THEN
		uiPointCheckReason := UINT#3;
	ELSIF NOT GVL_CELL_CONTROL.xManual THEN
		uiPointCheckReason := UINT#4;
	ELSIF GVL_HMI.xModbusMode THEN
		uiPointCheckReason := UINT#5;
	ELSIF GVL_CELL_MANAGER.Status.xRunning THEN
		uiPointCheckReason := UINT#6;
	ELSIF GVL_CELL_CONTROL.xGlobalError THEN
		uiPointCheckReason := UINT#7;
	ELSIF xPointCheckActive OR GVL_ROBOT.Status.xBusy THEN
		uiPointCheckReason := UINT#8;
	ELSIF xMotionBusy THEN
		uiPointCheckReason := UINT#9;
	ELSIF xDriveError OR GVL_ROBOT.Status.xError OR GVL_MOTION_MANAGER.stMotionManager.Status.xError THEN
		uiPointCheckReason := UINT#10;
	ELSIF NOT xPointEditorAllHomed THEN
		uiPointCheckReason := UINT#11;
	ELSIF NOT GVL_AXIS_GROUP.AxisGroup.Status.xPositionValid THEN
		uiPointCheckReason := UINT#12;
	ELSIF NOT GVL_POINT_MANAGER.PointManager.Diag.xXLimitValid
	OR NOT GVL_POINT_MANAGER.PointManager.Diag.xYLimitValid
	OR NOT GVL_POINT_MANAGER.PointManager.Diag.xZLimitValid THEN
		uiPointCheckReason := UINT#13;
	ELSIF NOT ((stPointCheckCandidate.X >= alrRobotSoftwareMinPosition[1])
		AND (stPointCheckCandidate.X <= alrRobotSoftwareMaxPosition[1])
		AND (stPointCheckCandidate.Y >= alrRobotSoftwareMinPosition[2])
		AND (stPointCheckCandidate.Y <= alrRobotSoftwareMaxPosition[2])
		AND (stPointCheckCandidate.Z >= alrRobotSoftwareMinPosition[3])
		AND (stPointCheckCandidate.Z <= alrRobotSoftwareMaxPosition[3])) THEN
		uiPointCheckReason := UINT#14;
	ELSIF NOT ((stPointCheckCandidate.SpeedFactor > 0.1) AND (stPointCheckCandidate.SpeedFactor <= 1.0)) THEN
		uiPointCheckReason := UINT#15;
	ELSIF NOT stPointCheckCandidate.xConfigured THEN
		uiPointCheckReason := UINT#16;
	ELSIF NOT xDrivesReady THEN
		uiPointCheckReason := UINT#17;
	ELSIF NOT xPointCheckConnectionAlive THEN
		uiPointCheckReason := UINT#19;
	ELSIF xHmiRobotActionAttempt OR GVL_CELL_CONTROL.xStart OR GVL_CELL_CONTROL.xStop
	OR GVL_CELL_CONTROL.xDisable OR GVL_HMI.xRobotStop OR GVL_HMI.xRobotReset
	OR stSelectedMagazineCommand.xExecute OR stSelectedMagazineCommand.xStop
	OR GVL_CELL_MANAGER.Command.stRobot.xExecute OR GVL_CELL_MANAGER.Command.stRobot.xStop
	OR GVL_MACHINE.Command[1].stRobot.xExecute OR GVL_MACHINE.Command[1].stRobot.xStop
	OR GVL_MACHINE.Command[2].stRobot.xExecute OR GVL_MACHINE.Command[2].stRobot.xStop
	OR GVL_MACHINE.Command[3].stRobot.xExecute OR GVL_MACHINE.Command[3].stRobot.xStop THEN
		uiPointCheckReason := UINT#20;
	END_IF;
	IF (uiPointCheckReason = UINT#0) AND (uiPointCheckMachine > UINT#0) THEN
		IF NOT GVL_MACHINE.Status[uiPointCheckMachine].stIo.xDoorOpen
		OR GVL_MACHINE.Status[uiPointCheckMachine].stIo.xDoorClosed THEN
			uiPointCheckReason := UINT#18;
		END_IF;
	END_IF;
	GVL_HMI.auiPointCheckRejectReason[uiPointCheckLoop] := uiPointCheckReason;
	GVL_HMI.axPointCheckAllowed[uiPointCheckLoop] := uiPointCheckReason = UINT#0;
END_FOR;

IF xPointCheckRequest THEN
	IF GVL_HMI.axPointCheckAllowed[GVL_HMI.uiPointEditorIndex] THEN
		xPointCheckActive := TRUE;
		xPointCheckStopping := FALSE;
		xPointCheckSeenBusy := FALSE;
		xPointCheckSeenDone := FALSE;
		ePointCheckName := ePointEditorName;
		rPointCheckLatchedSpeed := GVL_CELL_SETTINGS.rPointCheckSpeedPercent;
		GVL_HMI.uiPointCheckIndex := GVL_HMI.uiPointEditorIndex;
		GVL_HMI.udiPointCheckRunSeq := GVL_HMI.udiPointEditorCommandSeq;
		GVL_HMI.uiPointCheckState := UINT#1;
		stRobotHmiCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
		stRobotHmiCommand.eSetPoint := ePointCheckName;
		stRobotHmiCommand.xExecute := TRUE;
		GVL_HMI.stPointEditorResultPoint := GVL_POINT.Points[ePointCheckName];
		GVL_HMI.uiPointEditorResult := UINT#1;
	ELSE
		GVL_HMI.uiPointEditorRejectReason := GVL_HMI.auiPointCheckRejectReason[GVL_HMI.uiPointEditorIndex];
		uiRobotInterfaceWarningCode := WRN_POINT_CHECK_REJECTED;
	END_IF;
	GVL_HMI.udiPointEditorAckSeq := GVL_HMI.udiPointEditorCommandSeq;
END_IF;

// Потеря разрешений во время проверки требует останова, а не только запрета
// следующего старта. Торможение сохраняет обычные инженерные Deceleration/Jerk.
IF xPointCheckActive THEN
	uiPointCheckMachine := UINT#0;
	IF (GVL_HMI.uiPointCheckIndex <= UINT#9) AND ((GVL_HMI.uiPointCheckIndex MOD UINT#3) <> UINT#1) THEN
		uiPointCheckMachine := (GVL_HMI.uiPointCheckIndex - UINT#1) / UINT#3 + UINT#1;
	END_IF;
	IF NOT xPointCheckConnectionAlive OR NOT xHmiConnectionAlive
	OR NOT GVL_CELL_CONTROL.xManual OR GVL_CELL_CONTROL.xGlobalError
	OR GVL_CELL_MANAGER.Status.xRunning OR GVL_HMI.xModbusMode
	OR stSelectedMagazineCommand.xExecute OR stSelectedMagazineCommand.xStop
	OR GVL_CELL_MANAGER.Command.stRobot.xExecute OR GVL_CELL_MANAGER.Command.stRobot.xStop
	OR GVL_MACHINE.Command[1].stRobot.xExecute OR GVL_MACHINE.Command[1].stRobot.xStop
	OR GVL_MACHINE.Command[2].stRobot.xExecute OR GVL_MACHINE.Command[2].stRobot.xStop
	OR GVL_MACHINE.Command[3].stRobot.xExecute OR GVL_MACHINE.Command[3].stRobot.xStop THEN
		xPointCheckStopRequest := TRUE;
	END_IF;
	IF uiPointCheckMachine > UINT#0 THEN
		IF NOT GVL_MACHINE.Status[uiPointCheckMachine].stIo.xDoorOpen
		OR GVL_MACHINE.Status[uiPointCheckMachine].stIo.xDoorClosed THEN
			xPointCheckStopRequest := TRUE;
		END_IF;
	END_IF;
	IF xPointCheckStopRequest AND NOT xPointCheckStopping THEN
		uiRobotInterfaceWarningCode := WRN_POINT_CHECK_INTERRUPTED;
	END_IF;
	xPointCheckStopping := xPointCheckStopping OR xPointCheckStopRequest
		OR GVL_HMI.xRobotStop OR GVL_CELL_CONTROL.xStop OR GVL_CELL_CONTROL.xDisable;
	IF xPointCheckStopping THEN
		stRobotHmiCommand.xExecute := FALSE;
		stRobotHmiCommand.xStop := TRUE;
		xHmiStopAccepted := TRUE;
	END_IF;
END_IF;

ROBOT(
	xTestInitialize := xTestInitializePulse,
	auiTestGripperContent := GVL_HMI.stTestScenario.auiGripperContent,
	auiTestGripperType := GVL_HMI.stTestScenario.auiGripperType,
	uiTestOrientation := GVL_HMI.stTestScenario.uiOrientation,
	xExternalCommandInhibit :=
		(GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.SC500_BENCH)
		AND xSc500BenchKeyLost,
	stMachine_1_command := GVL_MACHINE.Command[1].stRobot,
	stMachine_2_command := GVL_MACHINE.Command[2].stRobot,
	stMachine_3_command := GVL_MACHINE.Command[3].stRobot,
	stMagazineCommand := stSelectedMagazineCommand,
	stCellCommand := GVL_CELL_MANAGER.Command.stRobot,
	uiBlankPayloadType := GVL_CELL_MANAGER.Command.uiBlankPayloadType,
	uiDetailPayloadType := GVL_CELL_MANAGER.Command.uiDetailPayloadType,
	stHmiCommand := stRobotHmiCommand,
	xReset := GVL_CELL_CONTROL.xReset OR GVL_HMI.xRobotReset,
	xManual := GVL_CELL_CONTROL.xManual AND NOT GVL_CELL_MANAGER.Status.xRunning,
	xMode := GVL_HMI.xModbusMode,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xEquipmentStopRequired := GVL_MACHINE.Status[1].xCriticalError
		OR GVL_MACHINE.Status[2].xCriticalError
		OR GVL_MACHINE.Status[3].xCriticalError
		OR GVL_MAGAZINE.astStatus[1].xRobotStopRequired
		OR GVL_MAGAZINE.astStatus[2].xRobotStopRequired,
	xManualRecoveryAllowed := xManualRecoveryActive,
	xModbusBusy := GVL_ROBOT.xModbusBusy,
	xModbusDone := GVL_ROBOT.xModbusDone,
	xModbusError := GVL_ROBOT.xModbusError,
	stModbusStatus := GVL_ROBOT_MODBUS.Status,
	xHmiDrivesEnable := GVL_HMI.xRobotDrivesEnable,
	xHmiDrivesDisable := GVL_HMI.xRobotDrivesDisable,
	xHmiStop := GVL_HMI.xRobotStop,
	xHmiDrivesEnableAccepted := xHmiDrivesEnableAccepted,
	xHmiDrivesDisableAccepted := xHmiDrivesDisableAccepted,
	xHmiStopAccepted := xHmiStopAccepted,
	xHmiDrivesEnableAllowed := GVL_HMI.stRobotHmiStatus.xDrivesEnableAllowed,
	xHmiDrivesDisableAllowed := GVL_HMI.stRobotHmiStatus.xDrivesDisableAllowed,
	xHmiStopAllowed := GVL_HMI.stRobotHmiStatus.xStopAllowed,
	xHmiPermit := xRobotHmiPermit AND xHmiConnectionAlive,
	xDrivesPowered := xDrivesPowered,
	xDrivesOff := xDrivesOff,
	xDrivesReady := xDrivesReady,
	xDriveError := xDriveError,
	xMotionBusy := xMotionBusy,
	xSingleAxisMotionBusy := uiManualAxisOwner > UINT#0,
	xPointCheckActive := xPointCheckActive,
	rPointCheckSpeedPercent := rPointCheckLatchedSpeed,
	xSimulationAccelerationEnable := GVL_CELL_SETTINGS.xSimulationAccelerationActive,
	uiSimulationTimeFactor := GVL_CELL_SETTINGS.uiSimulationTimeFactorApplied,
	FaultRequest := stRobotFaultRequest,
	tGripper1OpenTime := GVL_HMI.tGripper1OpenTime,
	tGripper1CloseTime := GVL_HMI.tGripper1CloseTime,
	tGripper2OpenTime := GVL_HMI.tGripper2OpenTime,
	tGripper2CloseTime := GVL_HMI.tGripper2CloseTime,
	tGripperChangeTime := GVL_HMI.tGripperChangeTime,
	stPoint := GVL_POINT.Points,
	stMotionManager := GVL_MOTION_MANAGER.stMotionManager,
	GroupData := GVL_AXIS_GROUP.AxisGroup,
	stPointManager := GVL_POINT_MANAGER.PointManager,
	Command => GVL_ROBOT.Command,
	ModbusCommand => GVL_ROBOT.ModbusCommand,
	Status => GVL_ROBOT.Status,
	Diag => GVL_ROBOT.Diag,
	Error => GVL_ROBOT.Error,
	GripperDiag => GVL_ROBOT.GripperDiag,
	GripperError => GVL_ROBOT.GripperError
);

// Проверка держит свою скорость до фактического окончания/останова движения.
tonPointCheckStart(IN := xPointCheckActive AND NOT xPointCheckSeenBusy, PT := T#2S);
IF xPointCheckActive THEN
	xPointCheckSeenBusy := xPointCheckSeenBusy OR GVL_ROBOT.Status.xBusy;
	// HMI передаёт Execute импульсом. FB_ROBOT в DONE при снятом Execute
	// сбрасывает свой xDone в том же вызове. Motion сохраняет терминальный
	// ответ; запоминаем его только для уже начатой проверки нужной точки.
	xPointCheckSeenDone := xPointCheckSeenDone OR (xPointCheckSeenBusy
		AND GVL_MOTION_MANAGER.stMotionManager.Status.xDone
		AND (GVL_MOTION_MANAGER.stMotionManager.Status.eCurrentPoint = ePointCheckName));
	IF GVL_ROBOT.Status.xError OR tonPointCheckStart.Q THEN
		GVL_HMI.uiPointCheckState := UINT#4;
		xPointCheckStopping := TRUE;
	END_IF;
	IF xPointCheckStopping THEN
		IF NOT GVL_ROBOT.Status.xBusy AND NOT xMotionBusy
		AND NOT GVL_MOTION_MANAGER.stMotionManager.Status.xBusy THEN
			xPointCheckActive := FALSE;
			IF GVL_HMI.uiPointCheckState <> UINT#4 THEN
				GVL_HMI.uiPointCheckState := UINT#3;
			END_IF;
		END_IF;
	ELSIF xPointCheckSeenDone AND NOT GVL_ROBOT.Status.xBusy AND NOT xMotionBusy
	AND NOT GVL_MOTION_MANAGER.stMotionManager.Status.xBusy THEN
		GVL_HMI.uiPointCheckState := UINT#2;
		xPointCheckActive := FALSE;
	END_IF;
END_IF;
// xPointCheckStopping belongs only to the active verification transaction.
// Leaving it latched would make RunMotion stop an unrelated later group move.
IF NOT xPointCheckActive THEN
	xPointCheckStopping := FALSE;
END_IF;

// Команда автоматики запоминается до следующего вызова RunMotion, который
// является единственным владельцем MC_GroupStop и FB_AXIS Stop.
xRobotProgramStopRequest := GVL_ROBOT.Command.xStop AND NOT xHmiStopAccepted;

// Для точек xAllowed учитывает выбранную точку, включая безопасность люка.
xHmiRobotStatusPointTargetAllowed := TRUE;
CASE eHmiRobotStatusPoint OF
	E_POINT_NAME.MACHINE_1_INSIDE,
	E_POINT_NAME.MACHINE_1_CHUCK_APROACH,
	E_POINT_NAME.MACHINE_1_CHUCK_POSITION:
		xHmiRobotStatusPointTargetAllowed := GVL_MACHINE.Status[1].stIo.xDoorOpen
			AND NOT GVL_MACHINE.Status[1].stIo.xDoorClosed;
	E_POINT_NAME.MACHINE_2_INSIDE,
	E_POINT_NAME.MACHINE_2_CHUCK_APROACH,
	E_POINT_NAME.MACHINE_2_CHUCK_POSITION:
		xHmiRobotStatusPointTargetAllowed := GVL_MACHINE.Status[2].stIo.xDoorOpen
			AND NOT GVL_MACHINE.Status[2].stIo.xDoorClosed;
	E_POINT_NAME.MACHINE_3_INSIDE,
	E_POINT_NAME.MACHINE_3_CHUCK_APROACH,
	E_POINT_NAME.MACHINE_3_CHUCK_POSITION:
		xHmiRobotStatusPointTargetAllowed := GVL_MACHINE.Status[3].stIo.xDoorOpen
			AND NOT GVL_MACHINE.Status[3].stIo.xDoorClosed;
END_CASE;
xHmiRobotStatusPointAllowed := xHmiRobotActionBaseAllowed
	AND (eHmiRobotStatusAction = E_ROBOT_ACTION.MOVE_TO_POINT)
	AND (eHmiRobotStatusPoint <> E_POINT_NAME.NONE)
	AND xHmiRobotStatusPointTargetAllowed
	AND (
		((eHmiRobotStatusPoint <> E_POINT_NAME.MAGAZINE_SAFE)
		AND (eHmiRobotStatusPoint <> E_POINT_NAME.MAGAZINE_CHANGE)
		AND (eHmiRobotStatusPoint <> E_POINT_NAME.MAGAZINE_IN_SLOT))
		OR (
			(GVL_HMI.uiRobotManualSlot >= UINT#1)
			AND (GVL_HMI.uiRobotManualSlot <= (GVL_CELL_SETTINGS.MagazineRows * GVL_CELL_SETTINGS.MagazineColumns))
			AND (GVL_HMI.uiRobotManualMagazine >= UINT#1)
			AND (GVL_HMI.uiRobotManualMagazine <= UINT#2)
		)
	);
IF eHmiRobotStatusAction = E_ROBOT_ACTION.MOVE_TO_POINT THEN
	GVL_HMI.stRobotHmiStatus.xPointsAllowed := xHmiRobotStatusPointAllowed;
ELSE
	// До первого числового запроса HMI ещё не выбрал действие; не прячем
	// вкладку точек из-за пустого legacy-кода.
	GVL_HMI.stRobotHmiStatus.xPointsAllowed := xHmiRobotActionBaseAllowed;
END_IF;
GVL_HMI.stRobotHmiStatus.xGripperAllowed := xHmiGripperActionBaseAllowed;
GVL_HMI.stRobotHmiStatus.xGripper1OpenAllowed := xHmiGripperActionBaseAllowed
	AND NOT GVL_ROBOT.Status.xGripper1Open;
GVL_HMI.stRobotHmiStatus.xGripper1CloseAllowed := xHmiGripperActionBaseAllowed
	AND NOT GVL_ROBOT.Status.xGripper1Closed;
GVL_HMI.stRobotHmiStatus.xGripper2OpenAllowed := xHmiGripperActionBaseAllowed
	AND NOT GVL_ROBOT.Status.xGripper2Open;
GVL_HMI.stRobotHmiStatus.xGripper2CloseAllowed := xHmiGripperActionBaseAllowed
	AND NOT GVL_ROBOT.Status.xGripper2Closed;
GVL_HMI.stRobotHmiStatus.xRotateToBlankAllowed := xHmiGripperActionBaseAllowed
	AND NOT GVL_ROBOT.Status.xRotatedToBlank;
GVL_HMI.stRobotHmiStatus.xRotateToDetailAllowed := xHmiGripperActionBaseAllowed
	AND NOT GVL_ROBOT.Status.xRotatedToDetail;
GVL_HMI.stRobotHmiStatus.xCommandBusy := GVL_ROBOT.Status.xBusy
	OR (GVL_ROBOT.GripperDiag.eState = E_GRIPPER_STATE.EXECUTE);
GVL_HMI.stRobotHmiStatus.uiActiveAction := TO_UINT(GVL_ROBOT.Diag.eActiveAction);
GVL_HMI.stRobotHmiStatus.uiActivePoint := TO_UINT(GVL_ROBOT.Diag.eActivePoint);

IF NOT xHmiConnectionAlive THEN
	GVL_HMI.stRobotHmiStatus.eRejectReason := E_HMI_MANUAL_REJECT.HMI_OFFLINE;
ELSIF NOT xRobotHmiPermit THEN
	GVL_HMI.stRobotHmiStatus.eRejectReason := E_HMI_MANUAL_REJECT.MANUAL_MODE_REQUIRED;
ELSIF GVL_HMI.xModbusMode AND NOT GVL_ROBOT_MODBUS.Status.xReady THEN
	GVL_HMI.stRobotHmiStatus.eRejectReason := E_HMI_MANUAL_REJECT.EXTERNAL_ROBOT_NOT_READY;
ELSIF NOT GVL_HMI.xModbusMode AND GVL_CELL_CONTROL.xGlobalError THEN
	GVL_HMI.stRobotHmiStatus.eRejectReason := E_HMI_MANUAL_REJECT.GLOBAL_ERROR_JOG_ONLY;
ELSIF NOT GVL_HMI.xModbusMode AND xDriveError THEN
	GVL_HMI.stRobotHmiStatus.eRejectReason := E_HMI_MANUAL_REJECT.DRIVE_ERROR;
ELSIF NOT GVL_HMI.xModbusMode AND NOT xDrivesPowered THEN
	GVL_HMI.stRobotHmiStatus.eRejectReason := E_HMI_MANUAL_REJECT.DRIVES_DISABLED;
ELSIF GVL_ROBOT.Status.xBusy THEN
	GVL_HMI.stRobotHmiStatus.eRejectReason := E_HMI_MANUAL_REJECT.ROBOT_BUSY;
ELSIF (eHmiRobotStatusAction = E_ROBOT_ACTION.MOVE_TO_POINT)
	AND NOT xHmiRobotStatusPointTargetAllowed THEN
	GVL_HMI.stRobotHmiStatus.eRejectReason := E_HMI_MANUAL_REJECT.HATCH_CLOSED;
ELSIF NOT GVL_HMI.xModbusMode AND xMotionBusy THEN
	GVL_HMI.stRobotHmiStatus.eRejectReason := E_HMI_MANUAL_REJECT.AXIS_BUSY;
ELSIF NOT GVL_HMI.xModbusMode AND NOT xHmiRobotActionBaseAllowed THEN
	GVL_HMI.stRobotHmiStatus.eRejectReason := E_HMI_MANUAL_REJECT.MOTION_NOT_READY;
ELSE
	GVL_HMI.stRobotHmiStatus.eRejectReason := E_HMI_MANUAL_REJECT.NONE;
END_IF;

IF rtHmiRobotAction.Q AND NOT xHmiRobotActionAllowed THEN
	GVL_ROBOT.Diag.stWarning.uiCode := WRN_HMI_MANUAL_REJECTED;
	GVL_ROBOT.Diag.stWarning.udiSequence := GVL_ROBOT.Diag.stWarning.udiSequence + UDINT#1;
	IF GVL_ROBOT.Diag.stWarning.udiSequence = UDINT#0 THEN
		GVL_ROBOT.Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

IF uiRobotInterfaceWarningCode <> UINT#0 THEN
	GVL_ROBOT.Diag.stWarning.uiCode := uiRobotInterfaceWarningCode;
	GVL_ROBOT.Diag.stWarning.udiSequence := GVL_ROBOT.Diag.stWarning.udiSequence + UDINT#1;
	IF GVL_ROBOT.Diag.stWarning.udiSequence = UDINT#0 THEN
		GVL_ROBOT.Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
	uiRobotInterfaceWarningCode := UINT#0;
END_IF;
