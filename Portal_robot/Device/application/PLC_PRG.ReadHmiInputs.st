METHOD PRIVATE ReadHmiInputs

// --- BEGIN IMPLEMENTATION ---

// HMI обязана поддерживать heartbeat. При потере связи PLC снимает только
// расширенные ручные команды; технологические проверки ниже остаются в PLC.
tonHmiWatchdog(
	IN := GVL_HMI.udiHmiHeartbeat = udiLastHmiHeartbeat,
	PT := T#2S
);
IF GVL_HMI.udiHmiHeartbeat <> udiLastHmiHeartbeat THEN
	udiLastHmiHeartbeat := GVL_HMI.udiHmiHeartbeat;
END_IF;
xHmiConnectionAlive := NOT tonHmiWatchdog.Q;

// Мобильная аренда отделена от общего HMI heartbeat. Gateway может быть жив,
// но движение обязано остановиться, если телефон перестал подтверждать аренду.
rtMobileMotionStart(CLK := GVL_HMI.xMobileMotionActive);
tonMobileMotionWatchdog(
	IN := GVL_HMI.xMobileMotionActive
		AND (GVL_HMI.udiMobileMotionHeartbeat = udiLastMobileMotionHeartbeat),
	PT := T#2S
);
IF GVL_HMI.udiMobileMotionHeartbeat <> udiLastMobileMotionHeartbeat THEN
	udiLastMobileMotionHeartbeat := GVL_HMI.udiMobileMotionHeartbeat;
END_IF;
IF rtMobileMotionStart.Q THEN
	xMobileMotionLeaseActive := TRUE;
	rMobileMotionSpeedLimitPercent := LIMIT(
		REAL#0.1,
		GVL_CELL_SETTINGS.rPointCheckSpeedPercent,
		REAL#100.0
	);
END_IF;
IF xMobileMotionLeaseActive THEN
	// Во время аренды лимит разрешено только уменьшать. Повышение настройки
	// применяется уже к следующему мобильному движению.
	rMobileMotionSpeedLimitPercent := MIN(
		rMobileMotionSpeedLimitPercent,
		LIMIT(REAL#0.1, GVL_CELL_SETTINGS.rPointCheckSpeedPercent, REAL#100.0)
	);
END_IF;
xMobileMotionConnectionAlive := GVL_HMI.xMobileMotionActive
	AND NOT tonMobileMotionWatchdog.Q;
xMobileMotionStopRequest := xMobileMotionLeaseActive
	AND (NOT GVL_HMI.xMobileMotionActive
		OR NOT xMobileMotionConnectionAlive
		OR NOT xHmiConnectionAlive);
IF xMobileMotionStopRequest THEN
	// Сбрасываем вход аренды в PLC: восстановление сети не может само возобновить ход.
	GVL_HMI.xMobileMotionActive := FALSE;
	FOR uiMachine := 1 TO 3 DO
		GVL_HMI.astAxisHmiCommand[uiMachine].xJogPositive := FALSE;
		GVL_HMI.astAxisHmiCommand[uiMachine].xJogNegative := FALSE;
	END_FOR;
END_IF;
GVL_HMI.xMobileMotionLeaseAlive := xMobileMotionLeaseActive
	AND xMobileMotionConnectionAlive
	AND NOT xMobileMotionStopRequest;
GVL_HMI.rMobileMotionAppliedSpeedPercent := rMobileMotionSpeedLimitPercent;

xPointCheckRequest := FALSE;
tonPointCheckWatchdog(IN := GVL_HMI.udiPointCheckHeartbeat = udiLastPointCheckHeartbeat, PT := T#2S);
IF GVL_HMI.udiPointCheckHeartbeat <> udiLastPointCheckHeartbeat THEN
	udiLastPointCheckHeartbeat := GVL_HMI.udiPointCheckHeartbeat;
END_IF;
xPointCheckConnectionAlive := (udiLastPointCheckHeartbeat <> UDINT#0) AND NOT tonPointCheckWatchdog.Q;
xPointCheckStopRequest := xPointCheckActive AND (GVL_HMI.xPointCheckStop
	OR NOT xPointCheckConnectionAlive OR NOT xHmiConnectionAlive);
// Stop не влияет на чужое движение и не остаётся от предыдущей проверки.
GVL_HMI.xPointCheckStop := FALSE;

IF GVL_HMI.rRobotManualSpeedPercent < REAL#0.1 THEN
	GVL_HMI.rRobotManualSpeedPercent := REAL#0.1;
ELSIF GVL_HMI.rRobotManualSpeedPercent > REAL#100.0 THEN
	GVL_HMI.rRobotManualSpeedPercent := REAL#100.0;
END_IF;
IF (GVL_HMI.lrRobotManualStep <> 0.1)
AND (GVL_HMI.lrRobotManualStep <> 1.0)
AND (GVL_HMI.lrRobotManualStep <> 10.0)
AND (GVL_HMI.lrRobotManualStep <> 100.0) THEN
	GVL_HMI.lrRobotManualStep := 1.0;
END_IF;

IF NOT xHmiConnectionAlive THEN
	FOR uiMachine := 1 TO 3 DO
		GVL_HMI.astAxisHmiCommand[uiMachine].xJogPositive := FALSE;
		GVL_HMI.astAxisHmiCommand[uiMachine].xJogNegative := FALSE;
		GVL_HMI.astAxisHmiCommand[uiMachine].xHome := FALSE;
		GVL_HMI.astAxisHmiCommand[uiMachine].xMoveAbsolute := FALSE;
		GVL_HMI.astAxisHmiCommand[uiMachine].xMoveRelative := FALSE;
	END_FOR;
	FOR uiMagazine := UINT#1 TO UINT#2 DO
		GVL_HMI.astMagazineCommand[uiMagazine].xStop := FALSE;
	END_FOR;
	GVL_HMI.xRobotManualExecute := FALSE;
END_IF;

// Глобальные команды ячейки поступают через единый интерфейс HMI.
GVL_CELL_CONTROL.xEnable := GVL_HMI.xCellEnable;
GVL_CELL_CONTROL.xDisable := GVL_HMI.xCellDisable;
GVL_CELL_CONTROL.xStart := GVL_HMI.xCellStart;
GVL_CELL_CONTROL.xStop := GVL_HMI.xCellStop;
// Необработанный общий импульс передаётся всем владельцам аварий.
// Каждый функциональный блок самостоятельно проверяет возможность сброса.
GVL_CELL_CONTROL.xReset := GVL_HMI.xCellReset;
// В автоматическом цикле запрос ручного режима не принимается. При общей
// аварии ручной режим включается принудительно для безопасного восстановления.
GVL_CELL_CONTROL.xManual := GVL_CELL_CONTROL.xGlobalError
	OR (GVL_HMI.xCellManual AND NOT GVL_CELL_MANAGER.Status.xRunning);
GVL_ALARM.Command.xResetWarnings := GVL_HMI.xAlarmResetWarnings;

// Режим инъекции ошибок включается отдельным переключателем страницы CELL_SETTINGS.
GVL_CELL_SETTINGS.xErrorSimulationEnabled := GVL_HMI.xErrorSimulationEnable;

// Ускорение относится только к симуляции. Разрешаем менять его, когда ячейка
// остановлена, нет активного движения/ошибки и выбран режим SoftMotion.
GVL_CELL_SETTINGS.xSimulationAccelerationChangeAllowed :=
	NOT GVL_CELL_MANAGER.Status.xRunning
	AND NOT GVL_HMI.xModbusMode
	AND NOT GVL_CELL_CONTROL.xGlobalError
	AND NOT GVL_AXIS.arrAxis[1].Status.xMotionBusy
	AND NOT GVL_AXIS.arrAxis[2].Status.xMotionBusy
	AND NOT GVL_AXIS.arrAxis[3].Status.xMotionBusy
	AND NOT GVL_ROBOT.Status.xBusy;

IF GVL_CELL_SETTINGS.xSimulationAccelerationChangeAllowed THEN
	GVL_CELL_SETTINGS.xSimulationAccelerationEnable := GVL_HMI.xSimulationAccelerationEnable;
	GVL_CELL_SETTINGS.uiSimulationTimeFactor := GVL_HMI.uiSimulationTimeFactor;
	IF GVL_CELL_SETTINGS.uiSimulationTimeFactor < UINT#1 THEN
		GVL_CELL_SETTINGS.uiSimulationTimeFactor := UINT#1;
	ELSIF GVL_CELL_SETTINGS.uiSimulationTimeFactor > UINT#100 THEN
		GVL_CELL_SETTINGS.uiSimulationTimeFactor := UINT#100;
	END_IF;
ELSE
	// Запрещённые изменения не накапливаются: HMI получает фактически применённое состояние.
	GVL_HMI.xSimulationAccelerationEnable := GVL_CELL_SETTINGS.xSimulationAccelerationActive;
	GVL_HMI.uiSimulationTimeFactor := GVL_CELL_SETTINGS.uiSimulationTimeFactorApplied;
END_IF;

// Общие технологические TIMEOUT и допуски HOME принимаются только при полностью
// остановленной ячейке. Координатами HOME_SAFETY владеет редактор точек ниже.
GVL_CELL_SETTINGS.xCellSettingsChangeAllowed :=
	xHmiConnectionAlive
	AND NOT GVL_CELL_MANAGER.Status.xRunning
	AND NOT GVL_HMI.xModbusMode
	AND NOT GVL_CELL_CONTROL.xGlobalError
	AND NOT GVL_AXIS.arrAxis[1].Status.xMotionBusy
	AND NOT GVL_AXIS.arrAxis[2].Status.xMotionBusy
	AND NOT GVL_AXIS.arrAxis[3].Status.xMotionBusy
	AND NOT GVL_AXIS_GROUP.AxisGroup.Command.xMoveDirect
	AND NOT GVL_AXIS_GROUP.AxisGroup.Command.xMoveLinear
	AND NOT GVL_ROBOT.Status.xBusy;

IF GVL_CELL_SETTINGS.xCellSettingsChangeAllowed THEN
	IF NOT xPointCheckActive THEN
		GVL_CELL_SETTINGS.rPointCheckSpeedPercent := LIMIT(REAL#0.1, GVL_HMI.rPointCheckSpeedPercent, REAL#100.0);
	END_IF;
	GVL_CELL_SETTINGS.lrSafetyHomeToleranceX := LIMIT(0.1, GVL_HMI.lrSafetyHomeToleranceX, 1000.0);
	GVL_CELL_SETTINGS.lrSafetyHomeToleranceY := LIMIT(0.1, GVL_HMI.lrSafetyHomeToleranceY, 1000.0);
	GVL_CELL_SETTINGS.lrSafetyHomeToleranceZ := LIMIT(0.1, GVL_HMI.lrSafetyHomeToleranceZ, 1000.0);

	GVL_CELL_SETTINGS.stMachineTimeouts.tRobotMove := LIMIT(T#1S, GVL_HMI.stCellMachineTimeouts.tRobotMove, T#600S);
	GVL_CELL_SETTINGS.stMachineTimeouts.tRobotAction := LIMIT(T#1S, GVL_HMI.stCellMachineTimeouts.tRobotAction, T#600S);
	GVL_CELL_SETTINGS.stMachineTimeouts.tRobotRelease := LIMIT(T#1S, GVL_HMI.stCellMachineTimeouts.tRobotRelease, T#600S);
	GVL_CELL_SETTINGS.stMachineTimeouts.tDoorOpen := LIMIT(T#1S, GVL_HMI.stCellMachineTimeouts.tDoorOpen, T#600S);
	GVL_CELL_SETTINGS.stMachineTimeouts.tDoorClose := LIMIT(T#1S, GVL_HMI.stCellMachineTimeouts.tDoorClose, T#600S);
	GVL_CELL_SETTINGS.stMachineTimeouts.tChuckOpen := LIMIT(T#1S, GVL_HMI.stCellMachineTimeouts.tChuckOpen, T#600S);
	GVL_CELL_SETTINGS.stMachineTimeouts.tChuckClose := LIMIT(T#1S, GVL_HMI.stCellMachineTimeouts.tChuckClose, T#600S);
	GVL_CELL_SETTINGS.stMachineTimeouts.tCycleStart := LIMIT(T#1S, GVL_HMI.stCellMachineTimeouts.tCycleStart, T#600S);
END_IF;

// =============================================================================
// Транзакционный редактор 12 фиксированных инженерных точек
// =============================================================================
xPointEditorAllHomed := GVL_AXIS.arrAxis[1].Status.xHomed
	AND GVL_AXIS.arrAxis[2].Status.xHomed
	AND GVL_AXIS.arrAxis[3].Status.xHomed;
xPointEditorBaseAllowed := xHmiConnectionAlive
	AND NOT xPointCheckActive
	AND GVL_CELL_CONTROL.xManual
	AND NOT GVL_HMI.xModbusMode
	AND NOT GVL_CELL_MANAGER.Status.xRunning
	AND NOT GVL_CELL_CONTROL.xGlobalError
	AND NOT GVL_ROBOT.Status.xBusy
	AND NOT xMotionBusy
	AND NOT xDriveError
	AND NOT GVL_MOTION_MANAGER.stMotionManager.Status.xError
	AND xPointEditorAllHomed
	AND GVL_AXIS_GROUP.AxisGroup.Status.xPositionValid;
GVL_HMI.xPointEditorCaptureAllowed := xPointEditorBaseAllowed;
GVL_HMI.xPointEditorSaveAllowed := xPointEditorBaseAllowed
	AND GVL_POINT_MANAGER.PointManager.Diag.xXLimitValid
	AND GVL_POINT_MANAGER.PointManager.Diag.xYLimitValid
	AND GVL_POINT_MANAGER.PointManager.Diag.xZLimitValid;

IF (GVL_HMI.udiPointEditorCommandSeq <> UDINT#0)
AND (GVL_HMI.udiPointEditorCommandSeq <> udiLastPointEditorCommandSeq) THEN
	udiLastPointEditorCommandSeq := GVL_HMI.udiPointEditorCommandSeq;
	GVL_HMI.uiPointEditorResult := UINT#2;
	GVL_HMI.uiPointEditorRejectReason := UINT#0;
	xPointEditorRequestValid := FALSE;
	ePointEditorName := E_POINT_NAME.NONE;
	uiPointStorageIndex := UINT#0;

	CASE GVL_HMI.uiPointEditorIndex OF
		UINT#1: ePointEditorName := E_POINT_NAME.MACHINE_1_ABOVE; uiPointStorageIndex := UINT#1;
		UINT#2: ePointEditorName := E_POINT_NAME.MACHINE_1_CHUCK_APROACH; uiPointStorageIndex := UINT#3;
		UINT#3: ePointEditorName := E_POINT_NAME.MACHINE_1_CHUCK_POSITION; uiPointStorageIndex := UINT#4;
		UINT#4: ePointEditorName := E_POINT_NAME.MACHINE_2_ABOVE; uiPointStorageIndex := UINT#5;
		UINT#5: ePointEditorName := E_POINT_NAME.MACHINE_2_CHUCK_APROACH; uiPointStorageIndex := UINT#7;
		UINT#6: ePointEditorName := E_POINT_NAME.MACHINE_2_CHUCK_POSITION; uiPointStorageIndex := UINT#8;
		UINT#7: ePointEditorName := E_POINT_NAME.MACHINE_3_ABOVE; uiPointStorageIndex := UINT#9;
		UINT#8: ePointEditorName := E_POINT_NAME.MACHINE_3_CHUCK_APROACH; uiPointStorageIndex := UINT#11;
		UINT#9: ePointEditorName := E_POINT_NAME.MACHINE_3_CHUCK_POSITION; uiPointStorageIndex := UINT#12;
		UINT#10: ePointEditorName := E_POINT_NAME.HOME_SAFETY; uiPointStorageIndex := UINT#13;
		UINT#11: ePointEditorName := E_POINT_NAME.MAGAZINE_1_DETAIL; uiPointStorageIndex := UINT#14;
		UINT#12: ePointEditorName := E_POINT_NAME.MAGAZINE_2_DETAIL; uiPointStorageIndex := UINT#15;
	END_CASE;
	xPointEditorRequestValid := (ePointEditorName <> E_POINT_NAME.NONE)
		AND (uiPointStorageIndex <> UINT#0);

	IF (GVL_HMI.uiPointEditorCommand <> UINT#1)
	AND (GVL_HMI.uiPointEditorCommand <> UINT#2)
	AND (GVL_HMI.uiPointEditorCommand <> UINT#3) THEN
		GVL_HMI.uiPointEditorRejectReason := UINT#1; // Неизвестная команда
	ELSIF NOT xPointEditorRequestValid THEN
		GVL_HMI.uiPointEditorRejectReason := UINT#2; // Неверный индекс точки
	ELSIF NOT xHmiConnectionAlive THEN
		GVL_HMI.uiPointEditorRejectReason := UINT#3; // HMI offline
	ELSIF NOT GVL_CELL_CONTROL.xManual THEN
		GVL_HMI.uiPointEditorRejectReason := UINT#4; // Требуется ручной режим
	ELSIF GVL_HMI.xModbusMode THEN
		GVL_HMI.uiPointEditorRejectReason := UINT#5; // Требуется SoftMotion
	ELSIF GVL_CELL_MANAGER.Status.xRunning THEN
		GVL_HMI.uiPointEditorRejectReason := UINT#6; // Автоматический цикл выполняется
	ELSIF GVL_CELL_CONTROL.xGlobalError THEN
		GVL_HMI.uiPointEditorRejectReason := UINT#7; // Глобальная ошибка
	ELSIF GVL_ROBOT.Status.xBusy OR xPointCheckActive THEN
		GVL_HMI.uiPointEditorRejectReason := UINT#8; // Робот занят
	ELSIF xMotionBusy THEN
		GVL_HMI.uiPointEditorRejectReason := UINT#9; // Motion занят
	ELSIF xDriveError OR GVL_MOTION_MANAGER.stMotionManager.Status.xError THEN
		GVL_HMI.uiPointEditorRejectReason := UINT#10; // Ошибка оси или группы
	ELSIF NOT xPointEditorAllHomed THEN
		GVL_HMI.uiPointEditorRejectReason := UINT#11; // Не выполнен Home
	ELSIF NOT GVL_AXIS_GROUP.AxisGroup.Status.xPositionValid THEN
		GVL_HMI.uiPointEditorRejectReason := UINT#12; // Недостоверные координаты
	ELSIF (GVL_HMI.uiPointEditorCommand = UINT#2)
	AND (NOT GVL_POINT_MANAGER.PointManager.Diag.xXLimitValid
		OR NOT GVL_POINT_MANAGER.PointManager.Diag.xYLimitValid
		OR NOT GVL_POINT_MANAGER.PointManager.Diag.xZLimitValid) THEN
		GVL_HMI.uiPointEditorRejectReason := UINT#13; // Software limits недоступны
	ELSE
		IF GVL_HMI.uiPointEditorCommand = UINT#1 THEN
			// CAPTURE возвращает согласованный снимок одного PLC-цикла и не пишет Persistent.
			GVL_HMI.stPointEditorResultPoint.Name := '';
			GVL_HMI.stPointEditorResultPoint.X := GVL_AXIS_GROUP.AxisGroup.Status.ActualX;
			GVL_HMI.stPointEditorResultPoint.Y := GVL_AXIS_GROUP.AxisGroup.Status.ActualY;
			GVL_HMI.stPointEditorResultPoint.Z := GVL_AXIS_GROUP.AxisGroup.Status.ActualZ;
			GVL_HMI.stPointEditorResultPoint.SpeedFactor :=
				GVL_HMI.lrPointEditorDraftSpeedFactor;
			GVL_HMI.stPointEditorResultPoint.xConfigured := FALSE;
			GVL_HMI.uiPointEditorResult := UINT#1;
		ELSIF GVL_HMI.uiPointEditorCommand = UINT#3 THEN
			// CHECK никогда не сохраняет черновик. Сравнение защищает подтверждение
			// на телефоне от изменения точки другим редактором до запуска.
			IF NOT GVL_POINT.Points[ePointEditorName].xConfigured THEN
				GVL_HMI.uiPointEditorRejectReason := UINT#16;
			ELSIF (GVL_POINT.Points[ePointEditorName].X <> GVL_HMI.alrPointEditorDraftXYZ[1])
			OR (GVL_POINT.Points[ePointEditorName].Y <> GVL_HMI.alrPointEditorDraftXYZ[2])
			OR (GVL_POINT.Points[ePointEditorName].Z <> GVL_HMI.alrPointEditorDraftXYZ[3])
			OR (GVL_POINT.Points[ePointEditorName].SpeedFactor <> GVL_HMI.lrPointEditorDraftSpeedFactor) THEN
				GVL_HMI.uiPointEditorRejectReason := UINT#21;
			ELSE
				xPointCheckRequest := TRUE; // Финальное разрешение после RunMotion/RunCellControl
			END_IF;
		ELSE
			xPointEditorDraftValid :=
				(GVL_HMI.alrPointEditorDraftXYZ[1] >= alrRobotSoftwareMinPosition[1])
				AND (GVL_HMI.alrPointEditorDraftXYZ[1] <= alrRobotSoftwareMaxPosition[1])
				AND (GVL_HMI.alrPointEditorDraftXYZ[2] >= alrRobotSoftwareMinPosition[2])
				AND (GVL_HMI.alrPointEditorDraftXYZ[2] <= alrRobotSoftwareMaxPosition[2])
				AND (GVL_HMI.alrPointEditorDraftXYZ[3] >= alrRobotSoftwareMinPosition[3])
				AND (GVL_HMI.alrPointEditorDraftXYZ[3] <= alrRobotSoftwareMaxPosition[3]);
			IF NOT xPointEditorDraftValid THEN
				GVL_HMI.uiPointEditorRejectReason := UINT#14; // XYZ вне software limits
			ELSIF NOT ((GVL_HMI.lrPointEditorDraftSpeedFactor > 0.1)
			AND (GVL_HMI.lrPointEditorDraftSpeedFactor <= 1.0)) THEN
				GVL_HMI.uiPointEditorRejectReason := UINT#15; // Недопустимая скорость
			ELSE
				GVL_POINT.astRetainPoints[uiPointStorageIndex].Name := '';
				GVL_POINT.astRetainPoints[uiPointStorageIndex].X :=
					GVL_HMI.alrPointEditorDraftXYZ[1];
				GVL_POINT.astRetainPoints[uiPointStorageIndex].Y :=
					GVL_HMI.alrPointEditorDraftXYZ[2];
				GVL_POINT.astRetainPoints[uiPointStorageIndex].Z :=
					GVL_HMI.alrPointEditorDraftXYZ[3];
				GVL_POINT.astRetainPoints[uiPointStorageIndex].SpeedFactor :=
					GVL_HMI.lrPointEditorDraftSpeedFactor;
				GVL_POINT.astRetainPoints[uiPointStorageIndex].xConfigured := TRUE;
				GVL_POINT.Points[ePointEditorName] :=
					GVL_POINT.astRetainPoints[uiPointStorageIndex];
				GVL_HMI.stPointEditorResultPoint := GVL_POINT.Points[ePointEditorName];
				GVL_HMI.uiPointEditorResult := UINT#1;
			END_IF;
		END_IF;
	END_IF;

	IF (GVL_HMI.uiPointEditorResult <> UINT#1) AND NOT xPointCheckRequest THEN
		IF GVL_HMI.uiPointEditorCommand = UINT#3 THEN
			uiRobotInterfaceWarningCode := WRN_POINT_CHECK_REJECTED;
		ELSE
			uiRobotInterfaceWarningCode := WRN_POINT_EDIT_REJECTED;
		END_IF;
	END_IF;
	// Ack подтверждает обработку конкретной транзакции даже при отказе.
	IF NOT xPointCheckRequest THEN
		GVL_HMI.udiPointEditorAckSeq := GVL_HMI.udiPointEditorCommandSeq;
	END_IF;
END_IF;

// Плоский OPC UA-интерфейс HMI преобразуется в типизированные запросы FB.
FOR uiMachine := 1 TO 3 DO
	astMachineFaultRequest[uiMachine].xEnabled := GVL_CELL_SETTINGS.xErrorSimulationEnabled;
	astMachineFaultRequest[uiMachine].xReset := GVL_HMI.axMachineSimReset[uiMachine];
	astMachineFaultRequest[uiMachine].xMachineAlarm := GVL_HMI.axMachineSimAlarm[uiMachine];
	astMachineFaultRequest[uiMachine].xDoorFault := GVL_HMI.axMachineSimDoorFault[uiMachine];
	astMachineFaultRequest[uiMachine].xChuckFault := GVL_HMI.axMachineSimChuckFault[uiMachine];
	astMachineFaultRequest[uiMachine].xTimeoutRobotMove := GVL_HMI.axMachineTimeoutRobotMove[uiMachine];
	astMachineFaultRequest[uiMachine].xTimeoutRobotAction := GVL_HMI.axMachineTimeoutRobotAction[uiMachine];
	astMachineFaultRequest[uiMachine].xTimeoutRobotRelease := GVL_HMI.axMachineTimeoutRobotRelease[uiMachine];
	astMachineFaultRequest[uiMachine].xTimeoutDoorOpen := GVL_HMI.axMachineTimeoutDoorOpen[uiMachine];
	astMachineFaultRequest[uiMachine].xTimeoutDoorClose := GVL_HMI.axMachineTimeoutDoorClose[uiMachine];
	astMachineFaultRequest[uiMachine].xTimeoutChuckOpen := GVL_HMI.axMachineTimeoutChuckOpen[uiMachine];
	astMachineFaultRequest[uiMachine].xTimeoutChuckClose := GVL_HMI.axMachineTimeoutChuckClose[uiMachine];
	astMachineFaultRequest[uiMachine].xTimeoutCycleStart := GVL_HMI.axMachineTimeoutCycleStart[uiMachine];

	astAxisFaultRequest[uiMachine].xEnabled := GVL_CELL_SETTINGS.xErrorSimulationEnabled;
	astAxisFaultRequest[uiMachine].xJogConflict := GVL_HMI.axSimAxisJogConflict[uiMachine];
END_FOR;

stAxisGroupFaultRequest.xEnabled := GVL_CELL_SETTINGS.xErrorSimulationEnabled;
stAxisGroupFaultRequest.xExecute := GVL_HMI.xSimAxisGroupError;

stRobotFaultRequest.xEnabled := GVL_CELL_SETTINGS.xErrorSimulationEnabled;
stRobotFaultRequest.xWrongAction := GVL_HMI.xSimRobotWrongAction;
stRobotFaultRequest.stGripper.xEnabled := GVL_CELL_SETTINGS.xErrorSimulationEnabled;
stRobotFaultRequest.stGripper.xGripper1Fault := GVL_HMI.xSimGripper1Fault;
stRobotFaultRequest.stGripper.xGripper2Fault := GVL_HMI.xSimGripper2Fault;
stRobotFaultRequest.stGripper.xRotationFault := GVL_HMI.xSimGripperRotationFault;
stRobotFaultRequest.stGripper.xGlobalFault := GVL_HMI.xSimGripperGlobalFault;

stRobotFaultRequest.stPoint.xEnabled := GVL_CELL_SETTINGS.xErrorSimulationEnabled;
stRobotFaultRequest.stPoint.xXOutOfLimit := GVL_HMI.xSimPointXOutOfLimit;
stRobotFaultRequest.stPoint.xYOutOfLimit := GVL_HMI.xSimPointYOutOfLimit;
stRobotFaultRequest.stPoint.xZOutOfLimit := GVL_HMI.xSimPointZOutOfLimit;
stRobotFaultRequest.stPoint.xInvalidVelocity := GVL_HMI.xSimPointInvalidVelocity;

astMagazineFaultRequest[1].xEnabled := GVL_CELL_SETTINGS.xErrorSimulationEnabled;
astMagazineFaultRequest[1].xWrongOperation := GVL_HMI.xSimMagazineWrongOperation;
astMagazineFaultRequest[1].xNoBlank := GVL_HMI.xSimMagazineNoBlank;
astMagazineFaultRequest[1].xNoFreeSlot := GVL_HMI.xSimMagazineNoFreeSlot;
astMagazineFaultRequest[1].xInvalidSlot := GVL_HMI.xSimMagazineInvalidSlot;
astMagazineFaultRequest[1].xSlotContent := GVL_HMI.xSimMagazineSlotContent;
astMagazineFaultRequest[1].xGeometry := GVL_HMI.xSimMagazineGeometry;
astMagazineFaultRequest[2].xEnabled := FALSE;

stCellFaultRequest.xEnabled := GVL_CELL_SETTINGS.xErrorSimulationEnabled;
stCellFaultRequest.xBothGrippers := GVL_HMI.xSimCellBothGrippers;


// Ручные команды робота разрешены только вне автоматического цикла.
xRobotHmiPermit := GVL_CELL_CONTROL.xManual AND NOT GVL_CELL_MANAGER.Status.xRunning;

// При аварии робота или Motion-слоя в автоматическом режиме питание приводов
// снимается без дополнительного перехода оператора в ручное управление.
xRobotAutoPowerOff := NOT GVL_CELL_CONTROL.xManual
	AND (GVL_ROBOT.Status.xError
		OR GVL_AXIS.arrAxis[1].Status.xError
		OR GVL_AXIS.arrAxis[2].Status.xError
		OR GVL_AXIS.arrAxis[3].Status.xError
		OR GVL_AXIS_GROUP.AxisGroup.Status.xLocalError
		OR GVL_AXIS_GROUP.AxisGroup.Status.xLogicalError
		OR GVL_AXIS_GROUP.AxisGroup.Status.xGroupError);
