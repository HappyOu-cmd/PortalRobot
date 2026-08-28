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
		GVL_HMI.astMagazineCommand[uiMagazine].xHome := FALSE;
		GVL_HMI.astMagazineCommand[uiMagazine].xIndex := FALSE;
		GVL_HMI.astMagazineCommand[uiMagazine].xStop := FALSE;
		GVL_HMI.astMagazineCommand[uiMagazine].xPowerOn := FALSE;
		GVL_HMI.astMagazineCommand[uiMagazine].xPowerOff := FALSE;
		GVL_HMI.astMagazineCommand[uiMagazine].xJogPositive := FALSE;
		GVL_HMI.astMagazineCommand[uiMagazine].xJogNegative := FALSE;
		GVL_HMI.astMagazineCommand[uiMagazine].xStartContentRecovery := FALSE;
		GVL_HMI.astMagazineCommand[uiMagazine].xConfirmRecovery := FALSE;
		GVL_HMI.astMagazineCommand[uiMagazine].xApplyRecoverySlot := FALSE;
		GVL_HMI.astMagazineCommand[uiMagazine].xClearRecoveryZones := FALSE;
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

// Инженерные настройки безопасной точки и технологических TIMEOUT принимаются
// только при полностью остановленной ячейке. Окончательные диапазоны проверяет PLC.
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
	IF (GVL_HMI.lrSafetyHomeX >= GVL_HMI.astAxisHmiStatus[1].lrMinPosition)
	AND (GVL_HMI.lrSafetyHomeX <= GVL_HMI.astAxisHmiStatus[1].lrMaxPosition) THEN
		GVL_POINT.Points[E_POINT_NAME.HOME_SAFETY].X := GVL_HMI.lrSafetyHomeX;
	END_IF;
	IF (GVL_HMI.lrSafetyHomeY >= GVL_HMI.astAxisHmiStatus[2].lrMinPosition)
	AND (GVL_HMI.lrSafetyHomeY <= GVL_HMI.astAxisHmiStatus[2].lrMaxPosition) THEN
		GVL_POINT.Points[E_POINT_NAME.HOME_SAFETY].Y := GVL_HMI.lrSafetyHomeY;
	END_IF;
	IF (GVL_HMI.lrSafetyHomeZ >= GVL_HMI.astAxisHmiStatus[3].lrMinPosition)
	AND (GVL_HMI.lrSafetyHomeZ <= GVL_HMI.astAxisHmiStatus[3].lrMaxPosition) THEN
		GVL_POINT.Points[E_POINT_NAME.HOME_SAFETY].Z := GVL_HMI.lrSafetyHomeZ;
	END_IF;

	IF (GVL_HMI.lrSafetyHomeSpeedFactor > 0.1)
	AND (GVL_HMI.lrSafetyHomeSpeedFactor <= 1.0) THEN
		GVL_POINT.Points[E_POINT_NAME.HOME_SAFETY].SpeedFactor := GVL_HMI.lrSafetyHomeSpeedFactor;
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
