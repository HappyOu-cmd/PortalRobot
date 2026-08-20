METHOD PRIVATE RunMotion

// --- BEGIN IMPLEMENTATION ---

xManualRecoveryActive := GVL_CELL_CONTROL.xGlobalError
	AND GVL_CELL_CONTROL.xManual
	AND NOT GVL_CELL_MANAGER.Status.xRunning
	AND NOT GVL_HMI.xModbusMode
	AND xHmiConnectionAlive;

// В recovery общая ошибка остаётся на уровне ячейки, но не создаёт каскадную
// ошибку исправных осей. Ниже для этого состояния разрешён только Jog.
GVL_AXIS.arrAxis[1].Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError AND NOT xManualRecoveryActive;
GVL_AXIS.arrAxis[2].Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError AND NOT xManualRecoveryActive;
GVL_AXIS.arrAxis[3].Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError AND NOT xManualRecoveryActive;
GVL_AXIS_GROUP.AxisGroup.Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError AND NOT xManualRecoveryActive;

GVL_AXIS.arrAxis[1].Command.xPowerPermit := NOT GVL_AXIS.arrAxis[1].Command.xGlobalError;
GVL_AXIS.arrAxis[2].Command.xPowerPermit := NOT GVL_AXIS.arrAxis[2].Command.xGlobalError;
GVL_AXIS.arrAxis[3].Command.xPowerPermit := NOT GVL_AXIS.arrAxis[3].Command.xGlobalError;
GVL_AXIS_GROUP.AxisGroup.Command.xPowerPermit := NOT GVL_AXIS_GROUP.AxisGroup.Command.xGlobalError;

// Текущие состояния нужны для единого расчёта разрешений силовых команд.
xDrivesPowered := GVL_AXIS.arrAxis[1].Status.xPowered
	AND GVL_AXIS.arrAxis[2].Status.xPowered
	AND GVL_AXIS.arrAxis[3].Status.xPowered;
xAnyDrivePowered := GVL_AXIS.arrAxis[1].Status.xPowerStageOn
	OR GVL_AXIS.arrAxis[1].Status.xDriveStartOn
	OR GVL_AXIS.arrAxis[2].Status.xPowerStageOn
	OR GVL_AXIS.arrAxis[2].Status.xDriveStartOn
	OR GVL_AXIS.arrAxis[3].Status.xPowerStageOn
	OR GVL_AXIS.arrAxis[3].Status.xDriveStartOn;
xDrivesOff := NOT xAnyDrivePowered
	AND (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.DISABLED);
xPowerTransitionActive :=
	(GVL_AXIS.arrAxis[1].Diag.iStep = E_AXIS_STATE.POWERING)
	OR (GVL_AXIS.arrAxis[1].Diag.iStep = E_AXIS_STATE.POWERING_DOWN)
	OR (GVL_AXIS.arrAxis[2].Diag.iStep = E_AXIS_STATE.POWERING)
	OR (GVL_AXIS.arrAxis[2].Diag.iStep = E_AXIS_STATE.POWERING_DOWN)
	OR (GVL_AXIS.arrAxis[3].Diag.iStep = E_AXIS_STATE.POWERING)
	OR (GVL_AXIS.arrAxis[3].Diag.iStep = E_AXIS_STATE.POWERING_DOWN)
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.ENABLING_POWER)
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.ENABLING_GROUP)
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.DISABLING_GROUP)
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.DISABLING_POWER);
xMotionResetBusy := eMotionResetState <> E_MOTION_RESET_STATE.IDLE;
xAxisDriveError := GVL_AXIS.arrAxis[1].Status.xAxisError
	OR GVL_AXIS.arrAxis[1].Status.xLogicalError
	OR GVL_AXIS.arrAxis[2].Status.xAxisError
	OR GVL_AXIS.arrAxis[2].Status.xLogicalError
	OR GVL_AXIS.arrAxis[3].Status.xAxisError
	OR GVL_AXIS.arrAxis[3].Status.xLogicalError;
xGroupError := GVL_AXIS_GROUP.AxisGroup.Status.xLocalError
	OR GVL_AXIS_GROUP.AxisGroup.Status.xLogicalError
	OR GVL_AXIS_GROUP.AxisGroup.Status.xGroupError;
xDriveError := xAxisDriveError OR xGroupError;
xGroupMotionBusy := GVL_AXIS_GROUP.AxisGroup.Command.xMoveDirect
	OR GVL_AXIS_GROUP.AxisGroup.Command.xMoveLinear
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.MOVING_DIRECT)
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.MOVING_LINEAR)
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.EMG_STOP)
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.HALT_STOP)
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.WAIT_STOP);
xMotionBusy := GVL_AXIS.arrAxis[1].Status.xMotionBusy
	OR GVL_AXIS.arrAxis[2].Status.xMotionBusy
	OR GVL_AXIS.arrAxis[3].Status.xMotionBusy
	OR xGroupMotionBusy;

// Владелец продолжающейся одиночной команды определяется по автомату FB_AXIS,
// а не по кратковременному импульсу HMI.
uiManualAxisOwner := UINT#0;
FOR uiMachine := 1 TO 3 DO
	IF (uiManualAxisOwner = UINT#0)
	AND (GVL_AXIS.arrAxis[uiMachine].Status.xMotionBusy
		OR (GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.JOGGING)
		OR (GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.JOG_DECELERATING)
		OR (GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.HOMING)
		OR (GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.MOVE_ABSOLUTE)
		OR (GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.MOVE_RELATIVE)
		OR (GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.STOPPING)
		OR (GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.STOP_RELEASE)) THEN
		uiManualAxisOwner := uiMachine;
	END_IF;
END_FOR;
xMotionBusy := xMotionBusy OR (uiManualAxisOwner > UINT#0);

GVL_HMI.stRobotHmiStatus.xDrivesPowered := xDrivesPowered;
GVL_HMI.stRobotHmiStatus.xDrivesOff := xDrivesOff;
GVL_HMI.stRobotHmiStatus.xPowerTransitionActive := xPowerTransitionActive;
GVL_HMI.stRobotHmiStatus.xDrivesEnableAllowed := xRobotHmiPermit
	AND xHmiConnectionAlive
	AND NOT GVL_HMI.xModbusMode
	AND (NOT GVL_CELL_CONTROL.xGlobalError OR xManualRecoveryActive)
	AND xDrivesOff
	AND NOT xAxisDriveError
	AND NOT xMotionBusy
	AND NOT xMotionResetBusy;
GVL_HMI.stRobotHmiStatus.xDrivesDisableAllowed := xRobotHmiPermit
	AND xHmiConnectionAlive
	AND NOT GVL_HMI.xModbusMode
	AND (xAnyDrivePowered
		OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.READY))
	AND NOT xPowerTransitionActive
	AND NOT xMotionBusy
	AND NOT xMotionResetBusy;
GVL_HMI.stRobotHmiStatus.xResetAllowed := xRobotHmiPermit
	AND xHmiConnectionAlive
	AND NOT GVL_HMI.xModbusMode
	AND (NOT GVL_CELL_CONTROL.xGlobalError OR xManualRecoveryActive)
	AND NOT xMotionBusy
	AND NOT xMotionResetBusy;
GVL_HMI.stRobotHmiStatus.xStopAllowed := xRobotHmiPermit
	AND xHmiConnectionAlive
	AND NOT GVL_HMI.xModbusMode
	AND xMotionBusy;

// Решение о приёме фиксируется до вызова Motion FB. Позднее фактический статус
// может измениться в том же цикле и не должен превращать принятую команду в отказ.
xHmiDrivesEnableAccepted := GVL_HMI.xRobotDrivesEnable
	AND GVL_HMI.stRobotHmiStatus.xDrivesEnableAllowed;
xHmiDrivesDisableAccepted := GVL_HMI.xRobotDrivesDisable
	AND GVL_HMI.stRobotHmiStatus.xDrivesDisableAllowed;
xHmiResetAccepted := GVL_HMI.xRobotReset
	AND GVL_HMI.stRobotHmiStatus.xResetAllowed;
xHmiStopAccepted := GVL_HMI.xRobotStop
	AND GVL_HMI.stRobotHmiStatus.xStopAllowed;

xMotionResetRequest := NOT GVL_HMI.xModbusMode
	AND (GVL_CELL_CONTROL.xReset OR xHmiResetAccepted);
rtMotionReset(CLK := xMotionResetRequest);
xGroupResetPulse := FALSE;
xAxisResetPulse := FALSE;

// MC_GroupReset самостоятельно сбрасывает все оси группы. Локальные FB_AXIS
// получают отдельный последующий импульс только для очистки своих защёлок.
CASE eMotionResetState OF
	E_MOTION_RESET_STATE.IDLE:
		IF rtMotionReset.Q THEN
			eMotionResetState := E_MOTION_RESET_STATE.RESET_GROUP;
		END_IF;

	E_MOTION_RESET_STATE.RESET_GROUP:
		xGroupResetPulse := TRUE;
		eMotionResetState := E_MOTION_RESET_STATE.WAIT_GROUP;

	E_MOTION_RESET_STATE.WAIT_GROUP:
		IF (GVL_AXIS_GROUP.AxisGroup.Diag.iStep <> E_AXIS_GROUP_STATE.ERROR)
		AND (GVL_AXIS_GROUP.AxisGroup.Diag.iStep <> E_AXIS_GROUP_STATE.RESETTING)
		AND (GVL_AXIS_GROUP.AxisGroup.Diag.iStep <> E_AXIS_GROUP_STATE.RESET_VERIFY)
		AND NOT GVL_AXIS_GROUP.AxisGroup.Status.xLocalError THEN
			eMotionResetState := E_MOTION_RESET_STATE.RESET_AXES;
		ELSIF (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.ERROR) THEN
			// Один запрос оператора формирует только один импульс. Если активная причина
			// ещё не снялась, следующий reset должен быть отдельной осознанной командой.
			eMotionResetState := E_MOTION_RESET_STATE.IDLE;
		END_IF;

	E_MOTION_RESET_STATE.RESET_AXES:
		xAxisResetPulse := TRUE;
		eMotionResetState := E_MOTION_RESET_STATE.WAIT_AXES;

	E_MOTION_RESET_STATE.WAIT_AXES:
		IF (GVL_AXIS.arrAxis[1].Diag.iStep <> E_AXIS_STATE.RESET_AXIS_ERROR)
		AND (GVL_AXIS.arrAxis[1].Diag.iStep <> E_AXIS_STATE.RESET_RELEASE)
		AND (GVL_AXIS.arrAxis[1].Diag.iStep <> E_AXIS_STATE.RESET_FINISH)
		AND (GVL_AXIS.arrAxis[2].Diag.iStep <> E_AXIS_STATE.RESET_AXIS_ERROR)
		AND (GVL_AXIS.arrAxis[2].Diag.iStep <> E_AXIS_STATE.RESET_RELEASE)
		AND (GVL_AXIS.arrAxis[2].Diag.iStep <> E_AXIS_STATE.RESET_FINISH)
		AND (GVL_AXIS.arrAxis[3].Diag.iStep <> E_AXIS_STATE.RESET_AXIS_ERROR)
		AND (GVL_AXIS.arrAxis[3].Diag.iStep <> E_AXIS_STATE.RESET_RELEASE)
		AND (GVL_AXIS.arrAxis[3].Diag.iStep <> E_AXIS_STATE.RESET_FINISH) THEN
			eMotionResetState := E_MOTION_RESET_STATE.IDLE;
		END_IF;
END_CASE;
xMotionResetBusy := eMotionResetState <> E_MOTION_RESET_STATE.IDLE;

GVL_AXIS.arrAxis[1].Command.xResetAllError := xAxisResetPulse;
GVL_AXIS.arrAxis[2].Command.xResetAllError := xAxisResetPulse;
GVL_AXIS.arrAxis[3].Command.xResetAllError := xAxisResetPulse;
GVL_AXIS_GROUP.AxisGroup.Command.xReset := xGroupResetPulse;

GVL_AXIS.arrAxis[1].Command.xEnable := (GVL_CELL_CONTROL.xEnable
	AND NOT GVL_HMI.xModbusMode
	AND NOT GVL_HMI.xRobotControlModeApply)
	OR xHmiDrivesEnableAccepted;
GVL_AXIS.arrAxis[2].Command.xEnable := (GVL_CELL_CONTROL.xEnable
	AND NOT GVL_HMI.xModbusMode
	AND NOT GVL_HMI.xRobotControlModeApply)
	OR xHmiDrivesEnableAccepted;
GVL_AXIS.arrAxis[3].Command.xEnable := (GVL_CELL_CONTROL.xEnable
	AND NOT GVL_HMI.xModbusMode
	AND NOT GVL_HMI.xRobotControlModeApply)
	OR xHmiDrivesEnableAccepted;
GVL_AXIS_GROUP.AxisGroup.Command.xPowerEnable := (GVL_CELL_CONTROL.xEnable
	AND NOT GVL_HMI.xModbusMode
	AND NOT GVL_HMI.xRobotControlModeApply)
	OR xHmiDrivesEnableAccepted;

xPowerDisableRequest := GVL_CELL_CONTROL.xDisable OR xRobotAutoPowerOff
	OR xHmiDrivesDisableAccepted;
GVL_AXIS_GROUP.AxisGroup.Command.xDisable := xPowerDisableRequest;
// Сначала группа обязана перейти в GroupDisabled. Только её OFF_REQUEST
// разрешает FB_AXIS снять DriveStart и RegulatorOn.
GVL_AXIS.arrAxis[1].Command.xDisable :=
	(GVL_AXIS_GROUP.AxisGroup.Diag.iPowerMode = E_AXIS_GROUP_POWER_MODE.OFF_REQUEST)
	OR (xPowerDisableRequest
		AND (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.DISABLED));
GVL_AXIS.arrAxis[2].Command.xDisable := GVL_AXIS.arrAxis[1].Command.xDisable;
GVL_AXIS.arrAxis[3].Command.xDisable := GVL_AXIS.arrAxis[1].Command.xDisable;

// Stop получает только текущий владелец движения: одна ось либо координатная группа.
GVL_AXIS.arrAxis[1].Command.xStop := xHmiStopAccepted
	AND NOT GVL_HMI.xModbusMode
	AND NOT xGroupMotionBusy AND (uiManualAxisOwner = UINT#1);
GVL_AXIS.arrAxis[2].Command.xStop := xHmiStopAccepted
	AND NOT GVL_HMI.xModbusMode
	AND NOT xGroupMotionBusy AND (uiManualAxisOwner = UINT#2);
GVL_AXIS.arrAxis[3].Command.xStop := xHmiStopAccepted
	AND NOT GVL_HMI.xModbusMode
	AND NOT xGroupMotionBusy AND (uiManualAxisOwner = UINT#3);
GVL_AXIS_GROUP.AxisGroup.Command.xStopCmd :=
	NOT GVL_HMI.xModbusMode
	AND (xHmiStopAccepted OR xRobotProgramStopRequest) AND xGroupMotionBusy;

// Из новых запросов также выбирается только одна ось. Если движение уже идёт,
// запрос другой оси будет отклонён ниже без передачи в FB_AXIS.
uiManualAxisRequest := UINT#0;
FOR uiMachine := 1 TO 3 DO
	artHmiAxisHome[uiMachine](CLK := GVL_HMI.astAxisHmiCommand[uiMachine].xHome);
	artHmiAxisMoveAbsolute[uiMachine](CLK := GVL_HMI.astAxisHmiCommand[uiMachine].xMoveAbsolute);
	artHmiAxisMoveRelative[uiMachine](CLK := GVL_HMI.astAxisHmiCommand[uiMachine].xMoveRelative);
	axHmiAxisHomePulse[uiMachine] := artHmiAxisHome[uiMachine].Q;
	axHmiAxisMoveAbsolutePulse[uiMachine] := artHmiAxisMoveAbsolute[uiMachine].Q;
	axHmiAxisMoveRelativePulse[uiMachine] := artHmiAxisMoveRelative[uiMachine].Q;

	IF (GVL_HMI.astAxisHmiCommand[uiMachine].xJogPositive
		OR GVL_HMI.astAxisHmiCommand[uiMachine].xJogNegative
		OR axHmiAxisHomePulse[uiMachine]
		OR axHmiAxisMoveAbsolutePulse[uiMachine]
		OR axHmiAxisMoveRelativePulse[uiMachine])
	AND (uiManualAxisRequest = UINT#0) THEN
		uiManualAxisRequest := uiMachine;
	END_IF;
END_FOR;
IF uiManualAxisOwner = UINT#0 THEN
	uiManualAxisOwner := uiManualAxisRequest;
END_IF;

FOR uiMachine := 1 TO 3 DO
	CASE uiMachine OF
		1:
			axRobotSoftwareLimitsEnabled[uiMachine] := X.bSWLimitEnable;
			alrRobotSoftwareMinPosition[uiMachine] := X.fSWLimitNegative;
			alrRobotSoftwareMaxPosition[uiMachine] := X.fSWLimitPositive;
			alrRobotManualRatedVelocity[uiMachine] := X.fSWMaxVelocity;
			IF alrRobotManualRatedVelocity[uiMachine] <= 0.0 THEN
				alrRobotManualRatedVelocity[uiMachine] := X.fMaxVelocity;
			END_IF;
			alrRobotRatedAcceleration[uiMachine] := X.fSWMaxAcceleration;
			IF alrRobotRatedAcceleration[uiMachine] <= 0.0 THEN
				alrRobotRatedAcceleration[uiMachine] := X.fMaxAcceleration;
			END_IF;
			alrRobotRatedDeceleration[uiMachine] := X.fSWMaxDeceleration;
			IF alrRobotRatedDeceleration[uiMachine] <= 0.0 THEN
				alrRobotRatedDeceleration[uiMachine] := X.fMaxDeceleration;
			END_IF;
			alrRobotRatedJerk[uiMachine] := X.fSWMaxJerk;
			IF alrRobotRatedJerk[uiMachine] <= 0.0 THEN
				alrRobotRatedJerk[uiMachine] := X.fMaxJerk;
			END_IF;
		2:
			axRobotSoftwareLimitsEnabled[uiMachine] := Y.bSWLimitEnable;
			alrRobotSoftwareMinPosition[uiMachine] := Y.fSWLimitNegative;
			alrRobotSoftwareMaxPosition[uiMachine] := Y.fSWLimitPositive;
			alrRobotManualRatedVelocity[uiMachine] := Y.fSWMaxVelocity;
			IF alrRobotManualRatedVelocity[uiMachine] <= 0.0 THEN
				alrRobotManualRatedVelocity[uiMachine] := Y.fMaxVelocity;
			END_IF;
			alrRobotRatedAcceleration[uiMachine] := Y.fSWMaxAcceleration;
			IF alrRobotRatedAcceleration[uiMachine] <= 0.0 THEN
				alrRobotRatedAcceleration[uiMachine] := Y.fMaxAcceleration;
			END_IF;
			alrRobotRatedDeceleration[uiMachine] := Y.fSWMaxDeceleration;
			IF alrRobotRatedDeceleration[uiMachine] <= 0.0 THEN
				alrRobotRatedDeceleration[uiMachine] := Y.fMaxDeceleration;
			END_IF;
			alrRobotRatedJerk[uiMachine] := Y.fSWMaxJerk;
			IF alrRobotRatedJerk[uiMachine] <= 0.0 THEN
				alrRobotRatedJerk[uiMachine] := Y.fMaxJerk;
			END_IF;
		3:
			axRobotSoftwareLimitsEnabled[uiMachine] := Z.bSWLimitEnable;
			alrRobotSoftwareMinPosition[uiMachine] := Z.fSWLimitNegative;
			alrRobotSoftwareMaxPosition[uiMachine] := Z.fSWLimitPositive;
			alrRobotManualRatedVelocity[uiMachine] := Z.fSWMaxVelocity;
			IF alrRobotManualRatedVelocity[uiMachine] <= 0.0 THEN
				alrRobotManualRatedVelocity[uiMachine] := Z.fMaxVelocity;
			END_IF;
			alrRobotRatedAcceleration[uiMachine] := Z.fSWMaxAcceleration;
			IF alrRobotRatedAcceleration[uiMachine] <= 0.0 THEN
				alrRobotRatedAcceleration[uiMachine] := Z.fMaxAcceleration;
			END_IF;
			alrRobotRatedDeceleration[uiMachine] := Z.fSWMaxDeceleration;
			IF alrRobotRatedDeceleration[uiMachine] <= 0.0 THEN
				alrRobotRatedDeceleration[uiMachine] := Z.fMaxDeceleration;
			END_IF;
			alrRobotRatedJerk[uiMachine] := Z.fSWMaxJerk;
			IF alrRobotRatedJerk[uiMachine] <= 0.0 THEN
				alrRobotRatedJerk[uiMachine] := Z.fMaxJerk;
			END_IF;
	END_CASE;
	IF alrRobotManualRatedVelocity[uiMachine] <= 0.0 THEN
		alrRobotManualRatedVelocity[uiMachine] := alrRobotManualFallbackVelocity[uiMachine];
	END_IF;
	IF alrRobotRatedAcceleration[uiMachine] <= 0.0 THEN
		alrRobotRatedAcceleration[uiMachine] := alrRobotManualAcceleration[uiMachine];
	END_IF;
	IF alrRobotRatedDeceleration[uiMachine] <= 0.0 THEN
		alrRobotRatedDeceleration[uiMachine] := alrRobotManualDeceleration[uiMachine];
	END_IF;
	IF alrRobotRatedJerk[uiMachine] <= 0.0 THEN
		alrRobotRatedJerk[uiMachine] := alrRobotManualJerk[uiMachine];
	END_IF;
	axRobotSoftwareLimitsEnabled[uiMachine] := axRobotSoftwareLimitsEnabled[uiMachine]
		AND (alrRobotSoftwareMaxPosition[uiMachine] > alrRobotSoftwareMinPosition[uiMachine]);
	GVL_HMI.astAxisHmiStatus[uiMachine].lrMinPosition := alrRobotSoftwareMinPosition[uiMachine];
	GVL_HMI.astAxisHmiStatus[uiMachine].lrMaxPosition := alrRobotSoftwareMaxPosition[uiMachine];
	// Для JOG и одиночных перемещений коэффициент применяется непосредственно
	// к входу Velocity соответствующего Motion FB.
	alrRobotJogVelocity[uiMachine] := alrRobotManualRatedVelocity[uiMachine]
		* REAL_TO_LREAL(GVL_HMI.rRobotManualSpeedPercent) / 100.0;

	GVL_AXIS.arrAxis[uiMachine].Command.xJogPositive := FALSE;
	GVL_AXIS.arrAxis[uiMachine].Command.xJogNegative := FALSE;
	GVL_AXIS.arrAxis[uiMachine].Command.xHome := FALSE;
	GVL_AXIS.arrAxis[uiMachine].Command.xMoveAbsolute := FALSE;
	GVL_AXIS.arrAxis[uiMachine].Command.xMoveRelative := FALSE;
	axManualAxisCommandRejected[uiMachine] := FALSE;

	GVL_AXIS.arrAxis[uiMachine].MotionParam.lrVelocity := alrRobotJogVelocity[uiMachine];
	GVL_AXIS.arrAxis[uiMachine].MotionParam.lrAcceleration := alrRobotRatedAcceleration[uiMachine];
	GVL_AXIS.arrAxis[uiMachine].MotionParam.lrDeceleration := alrRobotRatedDeceleration[uiMachine];
	GVL_AXIS.arrAxis[uiMachine].MotionParam.lrJerk := alrRobotRatedJerk[uiMachine];

	axManualAxisBaseAllowed[uiMachine] := xRobotHmiPermit
		AND xHmiConnectionAlive
		AND NOT GVL_HMI.xModbusMode
		AND (NOT GVL_CELL_CONTROL.xGlobalError OR xManualRecoveryActive)
		AND NOT xDriveError
		AND NOT GVL_ROBOT.Status.xBusy
		AND (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.READY)
		AND (NOT xMotionBusy OR (uiManualAxisOwner = uiMachine))
		AND GVL_AXIS.arrAxis[uiMachine].Status.xPowered
		AND NOT GVL_AXIS.arrAxis[uiMachine].Status.xAxisError
		AND NOT GVL_AXIS.arrAxis[uiMachine].Status.xLogicalError
		AND (
			((GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.READY)
				AND GVL_AXIS.arrAxis[uiMachine].Status.xCanStartMotion)
			OR ((uiManualAxisOwner = uiMachine)
				AND ((GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.JOGGING)
					OR (GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.JOG_DECELERATING)))
		);
END_FOR;

// Единственный источник допустимого диапазона координат — активные Software Limits
// соответствующих AXIS_REF_SM3. RunMotion выполняется раньше RunRobot, поэтому
// FB_POINT_MANAGER получает актуальный снимок границ до проверки новой точки.
GVL_POINT_MANAGER.PointManager.Diag.lrX_MinLimit := alrRobotSoftwareMinPosition[1];
GVL_POINT_MANAGER.PointManager.Diag.lrX_MaxLimit := alrRobotSoftwareMaxPosition[1];
GVL_POINT_MANAGER.PointManager.Diag.lrY_MinLimit := alrRobotSoftwareMinPosition[2];
GVL_POINT_MANAGER.PointManager.Diag.lrY_MaxLimit := alrRobotSoftwareMaxPosition[2];
GVL_POINT_MANAGER.PointManager.Diag.lrZ_MinLimit := alrRobotSoftwareMinPosition[3];
GVL_POINT_MANAGER.PointManager.Diag.lrZ_MaxLimit := alrRobotSoftwareMaxPosition[3];
GVL_POINT_MANAGER.PointManager.Diag.xXLimitValid := axRobotSoftwareLimitsEnabled[1];
GVL_POINT_MANAGER.PointManager.Diag.xYLimitValid := axRobotSoftwareLimitsEnabled[2];
GVL_POINT_MANAGER.PointManager.Diag.xZLimitValid := axRobotSoftwareLimitsEnabled[3];

IF uiManualAxisRequest > UINT#0 THEN
	FOR uiMachine := 1 TO 3 DO
		IF uiMachine <> uiManualAxisRequest
		AND (GVL_HMI.astAxisHmiCommand[uiMachine].xJogPositive
			OR GVL_HMI.astAxisHmiCommand[uiMachine].xJogNegative
			OR axHmiAxisHomePulse[uiMachine]
			OR axHmiAxisMoveAbsolutePulse[uiMachine]
			OR axHmiAxisMoveRelativePulse[uiMachine]) THEN
			axManualAxisCommandRejected[uiMachine] := TRUE;
		END_IF;
	END_FOR;

	IF uiManualAxisOwner <> uiManualAxisRequest THEN
		axManualAxisCommandRejected[uiManualAxisRequest] := TRUE;
	ELSIF NOT axManualAxisBaseAllowed[uiManualAxisRequest] THEN
		axManualAxisCommandRejected[uiManualAxisRequest] := TRUE;
	ELSIF axHmiAxisHomePulse[uiManualAxisRequest] THEN
		IF NOT GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].xJogPositive
		AND NOT GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].xJogNegative
		AND NOT GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].xMoveAbsolute
		AND NOT GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].xMoveRelative
		AND NOT GVL_CELL_CONTROL.xGlobalError
		AND GVL_AXIS.arrAxis[uiManualAxisRequest].Status.xCanStartMotion THEN
			GVL_AXIS.arrAxis[uiManualAxisRequest].Command.xHome := TRUE;
		ELSE
			axManualAxisCommandRejected[uiManualAxisRequest] := TRUE;
		END_IF;
	ELSIF axHmiAxisMoveAbsolutePulse[uiManualAxisRequest] THEN
		IF NOT GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].xMoveRelative
		AND NOT GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].xJogPositive
		AND NOT GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].xJogNegative
		AND NOT GVL_CELL_CONTROL.xGlobalError
		AND GVL_AXIS.arrAxis[uiManualAxisRequest].Status.xCanStartMotion
		AND (GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].lrTargetPosition
			>= GVL_HMI.astAxisHmiStatus[uiManualAxisRequest].lrMinPosition)
		AND (GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].lrTargetPosition
			<= GVL_HMI.astAxisHmiStatus[uiManualAxisRequest].lrMaxPosition)
		AND (NOT axRobotSoftwareLimitsEnabled[uiManualAxisRequest]
			OR (GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].lrTargetPosition
				>= alrRobotSoftwareMinPosition[uiManualAxisRequest]))
		AND (NOT axRobotSoftwareLimitsEnabled[uiManualAxisRequest]
			OR (GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].lrTargetPosition
				<= alrRobotSoftwareMaxPosition[uiManualAxisRequest])) THEN
			GVL_AXIS.arrAxis[uiManualAxisRequest].MotionParam.lrTargetPosition :=
				GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].lrTargetPosition;
			GVL_AXIS.arrAxis[uiManualAxisRequest].Command.xMoveAbsolute := TRUE;
		ELSE
			axManualAxisCommandRejected[uiManualAxisRequest] := TRUE;
		END_IF;
	ELSIF GVL_HMI.xRobotContinuousMode THEN
		IF (GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].xJogPositive
			XOR GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].xJogNegative)
		AND NOT GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].xMoveAbsolute
		AND NOT GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].xMoveRelative THEN
			IF GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].xJogPositive THEN
				// Направление не снимается упреждающе: software limit контролирует SoftMotion.
				GVL_AXIS.arrAxis[uiManualAxisRequest].Command.xJogPositive := TRUE;
			ELSE
				GVL_AXIS.arrAxis[uiManualAxisRequest].Command.xJogNegative := TRUE;
			END_IF;
		ELSE
			axManualAxisCommandRejected[uiManualAxisRequest] := TRUE;
		END_IF;
	ELSE
		IF axHmiAxisMoveRelativePulse[uiManualAxisRequest]
		AND NOT GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].xMoveAbsolute
		AND NOT GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].xJogPositive
		AND NOT GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].xJogNegative
		AND NOT GVL_CELL_CONTROL.xGlobalError
		AND GVL_AXIS.arrAxis[uiManualAxisRequest].Status.xHomed
		AND GVL_AXIS.arrAxis[uiManualAxisRequest].Status.xCanStartMotion
		AND (ABS(ABS(GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].lrRelativeDistance)
			- GVL_HMI.lrRobotManualStep) < 0.0001)
		AND (GVL_AXIS.arrAxis[uiManualAxisRequest].Status.lrActualPosition
			+ GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].lrRelativeDistance
			>= GVL_HMI.astAxisHmiStatus[uiManualAxisRequest].lrMinPosition)
		AND (GVL_AXIS.arrAxis[uiManualAxisRequest].Status.lrActualPosition
			+ GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].lrRelativeDistance
			<= GVL_HMI.astAxisHmiStatus[uiManualAxisRequest].lrMaxPosition)
		AND (NOT axRobotSoftwareLimitsEnabled[uiManualAxisRequest]
			OR (GVL_AXIS.arrAxis[uiManualAxisRequest].Status.lrActualPosition
				+ GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].lrRelativeDistance
				>= alrRobotSoftwareMinPosition[uiManualAxisRequest]))
		AND (NOT axRobotSoftwareLimitsEnabled[uiManualAxisRequest]
			OR (GVL_AXIS.arrAxis[uiManualAxisRequest].Status.lrActualPosition
				+ GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].lrRelativeDistance
				<= alrRobotSoftwareMaxPosition[uiManualAxisRequest])) THEN
			GVL_AXIS.arrAxis[uiManualAxisRequest].MotionParam.lrDistance :=
				GVL_HMI.astAxisHmiCommand[uiManualAxisRequest].lrRelativeDistance;
			GVL_AXIS.arrAxis[uiManualAxisRequest].Command.xMoveRelative := TRUE;
		ELSE
			axManualAxisCommandRejected[uiManualAxisRequest] := TRUE;
		END_IF;
	END_IF;
END_IF;

// Предупреждение формируется только на фронт действительно отклонённой попытки.
FOR uiMachine := 1 TO 3 DO
	artManualAxisReject[uiMachine](CLK := axManualAxisCommandRejected[uiMachine]);
END_FOR;

AXIS_X(
	FaultRequest := astAxisFaultRequest[1],
	xResetPermit := xRobotHmiPermit,
	Axis := X,
	AxisData := GVL_AXIS.arrAxis[1]
);
AXIS_Y(
	FaultRequest := astAxisFaultRequest[2],
	xResetPermit := xRobotHmiPermit,
	Axis := Y,
	AxisData := GVL_AXIS.arrAxis[2]
);
AXIS_Z(
	FaultRequest := astAxisFaultRequest[3],
	xResetPermit := xRobotHmiPermit,
	Axis := Z,
	AxisData := GVL_AXIS.arrAxis[3]
);

FOR uiMachine := 1 TO 3 DO
	IF artManualAxisReject[uiMachine].Q THEN
		GVL_AXIS.arrAxis[uiMachine].Diag.stWarning.uiCode := WRN_HMI_MANUAL_REJECTED;
		GVL_AXIS.arrAxis[uiMachine].Diag.stWarning.udiSequence :=
			GVL_AXIS.arrAxis[uiMachine].Diag.stWarning.udiSequence + UDINT#1;
		IF GVL_AXIS.arrAxis[uiMachine].Diag.stWarning.udiSequence = UDINT#0 THEN
			GVL_AXIS.arrAxis[uiMachine].Diag.stWarning.udiSequence := UDINT#1;
		END_IF;
	END_IF;
END_FOR;

// Коэффициент симуляции применяется только к виртуальным таймерам.
IF GVL_CELL_SETTINGS.uiSimulationTimeFactor < UINT#1 THEN
	GVL_CELL_SETTINGS.uiSimulationTimeFactor := UINT#1;
ELSIF GVL_ROBOT_MODBUS.xModeActive
AND (GVL_CELL_SETTINGS.uiSimulationTimeFactor > UINT#250) THEN
	GVL_CELL_SETTINGS.uiSimulationTimeFactor := UINT#250;
ELSIF NOT GVL_ROBOT_MODBUS.xModeActive
AND (GVL_CELL_SETTINGS.uiSimulationTimeFactor > UINT#100) THEN
	GVL_CELL_SETTINGS.uiSimulationTimeFactor := UINT#100;
END_IF;
GVL_CELL_SETTINGS.xSimulationAccelerationActive := GVL_CELL_SETTINGS.xSimulationAccelerationEnable;
IF GVL_CELL_SETTINGS.xSimulationAccelerationActive THEN
	GVL_CELL_SETTINGS.uiSimulationTimeFactorApplied := GVL_CELL_SETTINGS.uiSimulationTimeFactor;
ELSE
	GVL_CELL_SETTINGS.uiSimulationTimeFactorApplied := UINT#1;
END_IF;
GVL_CELL_SETTINGS.xSimulationAccelerationError := FALSE;

// FB_AXIS являются единственными владельцами MC_Power. Группа получает только
// подтверждение готовности физических осей и управляет состоянием GroupStandby.
xDrivesPowered := GVL_AXIS.arrAxis[1].Status.xPowered
	AND GVL_AXIS.arrAxis[2].Status.xPowered
	AND GVL_AXIS.arrAxis[3].Status.xPowered;
GROUP_XYZ(
	FaultRequest := stAxisGroupFaultRequest,
	xResetPermit := xRobotHmiPermit,
	xAxesPowered := xDrivesPowered,
	lrVelocityOverride := REAL_TO_LREAL(GVL_HMI.rRobotManualSpeedPercent) / 100.0,
	AxisGroup := AXIS_GROUP_XYZ,
	GroupData := GVL_AXIS_GROUP.AxisGroup
);

// Повторная выборка после вызова FB публикует фактическое состояние текущего цикла.
xDrivesPowered := GVL_AXIS.arrAxis[1].Status.xPowered
	AND GVL_AXIS.arrAxis[2].Status.xPowered
	AND GVL_AXIS.arrAxis[3].Status.xPowered;
xAnyDrivePowered := GVL_AXIS.arrAxis[1].Status.xPowerStageOn
	OR GVL_AXIS.arrAxis[1].Status.xDriveStartOn
	OR GVL_AXIS.arrAxis[2].Status.xPowerStageOn
	OR GVL_AXIS.arrAxis[2].Status.xDriveStartOn
	OR GVL_AXIS.arrAxis[3].Status.xPowerStageOn
	OR GVL_AXIS.arrAxis[3].Status.xDriveStartOn;
xDrivesOff := NOT xAnyDrivePowered
	AND (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.DISABLED);
xPowerTransitionActive :=
	(GVL_AXIS.arrAxis[1].Diag.iStep = E_AXIS_STATE.POWERING)
	OR (GVL_AXIS.arrAxis[1].Diag.iStep = E_AXIS_STATE.POWERING_DOWN)
	OR (GVL_AXIS.arrAxis[2].Diag.iStep = E_AXIS_STATE.POWERING)
	OR (GVL_AXIS.arrAxis[2].Diag.iStep = E_AXIS_STATE.POWERING_DOWN)
	OR (GVL_AXIS.arrAxis[3].Diag.iStep = E_AXIS_STATE.POWERING)
	OR (GVL_AXIS.arrAxis[3].Diag.iStep = E_AXIS_STATE.POWERING_DOWN)
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.ENABLING_POWER)
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.ENABLING_GROUP)
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.DISABLING_GROUP)
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.DISABLING_POWER);
xDrivesReady := GVL_AXIS.arrAxis[1].Status.xPowered
	AND GVL_AXIS.arrAxis[1].Status.xCanStartMotion
	AND NOT GVL_AXIS.arrAxis[1].Status.xError
	AND GVL_AXIS.arrAxis[2].Status.xPowered
	AND GVL_AXIS.arrAxis[2].Status.xCanStartMotion
	AND NOT GVL_AXIS.arrAxis[2].Status.xError
	AND GVL_AXIS.arrAxis[3].Status.xPowered
	AND GVL_AXIS.arrAxis[3].Status.xCanStartMotion
	AND NOT GVL_AXIS.arrAxis[3].Status.xError
	AND (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.READY)
	AND NOT GVL_AXIS_GROUP.AxisGroup.Status.xLocalError
	AND NOT GVL_AXIS_GROUP.AxisGroup.Status.xLogicalError
	AND NOT GVL_AXIS_GROUP.AxisGroup.Status.xGroupError;
xAxisDriveError := GVL_AXIS.arrAxis[1].Status.xAxisError
	OR GVL_AXIS.arrAxis[1].Status.xLogicalError
	OR GVL_AXIS.arrAxis[2].Status.xAxisError
	OR GVL_AXIS.arrAxis[2].Status.xLogicalError
	OR GVL_AXIS.arrAxis[3].Status.xAxisError
	OR GVL_AXIS.arrAxis[3].Status.xLogicalError;
xGroupError := GVL_AXIS_GROUP.AxisGroup.Status.xLocalError
	OR GVL_AXIS_GROUP.AxisGroup.Status.xLogicalError
	OR GVL_AXIS_GROUP.AxisGroup.Status.xGroupError;
xDriveError := xAxisDriveError OR xGroupError;
xGroupMotionBusy := GVL_AXIS_GROUP.AxisGroup.Command.xMoveDirect
	OR GVL_AXIS_GROUP.AxisGroup.Command.xMoveLinear
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.MOVING_DIRECT)
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.MOVING_LINEAR)
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.EMG_STOP)
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.HALT_STOP)
	OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.WAIT_STOP);
xMotionBusy := GVL_AXIS.arrAxis[1].Status.xMotionBusy
	OR GVL_AXIS.arrAxis[2].Status.xMotionBusy
	OR GVL_AXIS.arrAxis[3].Status.xMotionBusy
	OR xGroupMotionBusy;

// Повторно определяем владельца после вызова FB: на этом этапе уже виден
// переход READY -> HOMING/MOVE/JOG, даже если Motion FB станет Busy позже.
uiManualAxisOwner := UINT#0;
FOR uiMachine := 1 TO 3 DO
	IF (uiManualAxisOwner = UINT#0)
	AND (GVL_AXIS.arrAxis[uiMachine].Status.xMotionBusy
		OR (GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.JOGGING)
		OR (GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.JOG_DECELERATING)
		OR (GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.HOMING)
		OR (GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.MOVE_ABSOLUTE)
		OR (GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.MOVE_RELATIVE)
		OR (GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.STOPPING)
		OR (GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.STOP_RELEASE)) THEN
		uiManualAxisOwner := uiMachine;
	END_IF;
END_FOR;
xMotionBusy := xMotionBusy OR (uiManualAxisOwner > UINT#0);

GVL_HMI.stRobotHmiStatus.xDrivesPowered := xDrivesPowered;
GVL_HMI.stRobotHmiStatus.xDrivesOff := xDrivesOff;
GVL_HMI.stRobotHmiStatus.xPowerTransitionActive := xPowerTransitionActive;
GVL_HMI.stRobotHmiStatus.xDrivesEnableAllowed := xRobotHmiPermit
	AND xHmiConnectionAlive
	AND NOT GVL_HMI.xModbusMode
	AND (NOT GVL_CELL_CONTROL.xGlobalError OR xManualRecoveryActive)
	AND xDrivesOff
	AND NOT xAxisDriveError
	AND NOT xMotionBusy
	AND NOT xMotionResetBusy;
GVL_HMI.stRobotHmiStatus.xDrivesDisableAllowed := xRobotHmiPermit
	AND xHmiConnectionAlive
	AND NOT GVL_HMI.xModbusMode
	AND (xAnyDrivePowered
		OR (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.READY))
	AND NOT xPowerTransitionActive
	AND NOT xMotionBusy
	AND NOT xMotionResetBusy;
GVL_HMI.stRobotHmiStatus.xResetAllowed := xRobotHmiPermit
	AND xHmiConnectionAlive
	AND NOT GVL_HMI.xModbusMode
	AND (NOT GVL_CELL_CONTROL.xGlobalError OR xManualRecoveryActive)
	AND NOT xMotionBusy
	AND NOT xMotionResetBusy;
GVL_HMI.stRobotHmiStatus.xStopAllowed := xRobotHmiPermit
	AND xHmiConnectionAlive
	AND NOT GVL_HMI.xModbusMode
	AND xMotionBusy;

// Финальная публикация разрешений выполняется после всех Motion FB. HMI получает
// актуальные статусы текущего цикла и не дублирует технологические условия.
FOR uiMachine := 1 TO 3 DO
	GVL_HMI.astAxisHmiStatus[uiMachine].lrActualPosition := GVL_AXIS.arrAxis[uiMachine].Status.lrActualPosition;
	GVL_HMI.astAxisHmiStatus[uiMachine].lrTargetPosition := GVL_HMI.astAxisHmiCommand[uiMachine].lrTargetPosition;
	GVL_HMI.astAxisHmiStatus[uiMachine].lrDeviation :=
		GVL_HMI.astAxisHmiStatus[uiMachine].lrActualPosition
		- GVL_HMI.astAxisHmiStatus[uiMachine].lrTargetPosition;
	GVL_HMI.astAxisHmiStatus[uiMachine].xDriveReady := GVL_AXIS.arrAxis[uiMachine].Status.xPowered
		AND NOT GVL_AXIS.arrAxis[uiMachine].Status.xAxisError
		AND NOT GVL_AXIS.arrAxis[uiMachine].Status.xLogicalError;
	GVL_HMI.astAxisHmiStatus[uiMachine].xBusy := GVL_AXIS.arrAxis[uiMachine].Status.xMotionBusy
		OR (uiManualAxisOwner = uiMachine);
	GVL_HMI.astAxisHmiStatus[uiMachine].xError := GVL_AXIS.arrAxis[uiMachine].Status.xAxisError
		OR GVL_AXIS.arrAxis[uiMachine].Status.xLogicalError;
	GVL_HMI.astAxisHmiStatus[uiMachine].xHomed := GVL_AXIS.arrAxis[uiMachine].Status.xHomed;
	GVL_HMI.astAxisHmiStatus[uiMachine].lrCommandVelocity := alrRobotManualRatedVelocity[uiMachine]
		* REAL_TO_LREAL(GVL_HMI.rRobotManualSpeedPercent) / 100.0;
	GVL_HMI.astAxisHmiStatus[uiMachine].lrMaxVelocity := alrRobotManualRatedVelocity[uiMachine];
	GVL_HMI.astAxisHmiStatus[uiMachine].eState := GVL_AXIS.arrAxis[uiMachine].Diag.iStep;

	axManualAxisBaseAllowed[uiMachine] := xRobotHmiPermit
		AND xHmiConnectionAlive
		AND NOT GVL_HMI.xModbusMode
		AND (NOT GVL_CELL_CONTROL.xGlobalError OR xManualRecoveryActive)
		AND NOT xDriveError
		AND NOT GVL_ROBOT.Status.xBusy
		AND (GVL_AXIS_GROUP.AxisGroup.Diag.iStep = E_AXIS_GROUP_STATE.READY)
		AND (NOT xMotionBusy OR (uiManualAxisOwner = uiMachine))
		AND GVL_AXIS.arrAxis[uiMachine].Status.xPowered
		AND NOT GVL_AXIS.arrAxis[uiMachine].Status.xAxisError
		AND NOT GVL_AXIS.arrAxis[uiMachine].Status.xLogicalError
		AND (
			((GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.READY)
				AND GVL_AXIS.arrAxis[uiMachine].Status.xCanStartMotion)
			OR ((uiManualAxisOwner = uiMachine)
				AND ((GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.JOGGING)
					OR (GVL_AXIS.arrAxis[uiMachine].Diag.iStep = E_AXIS_STATE.JOG_DECELERATING)))
		);

	GVL_HMI.astAxisHmiStatus[uiMachine].xJogPositiveAllowed := axManualAxisBaseAllowed[uiMachine]
		AND GVL_HMI.xRobotContinuousMode;
	GVL_HMI.astAxisHmiStatus[uiMachine].xJogNegativeAllowed := axManualAxisBaseAllowed[uiMachine]
		AND GVL_HMI.xRobotContinuousMode;
	GVL_HMI.astAxisHmiStatus[uiMachine].xHomeAllowed := axManualAxisBaseAllowed[uiMachine]
		AND NOT GVL_CELL_CONTROL.xGlobalError
		AND NOT xMotionBusy
		AND GVL_AXIS.arrAxis[uiMachine].Status.xCanStartMotion;
	GVL_HMI.astAxisHmiStatus[uiMachine].xMoveAbsoluteAllowed := axManualAxisBaseAllowed[uiMachine]
		AND NOT GVL_CELL_CONTROL.xGlobalError
		AND GVL_AXIS.arrAxis[uiMachine].Status.xHomed
		AND GVL_AXIS.arrAxis[uiMachine].Status.xCanStartMotion
		AND (GVL_HMI.astAxisHmiCommand[uiMachine].lrTargetPosition
			>= GVL_HMI.astAxisHmiStatus[uiMachine].lrMinPosition)
		AND (GVL_HMI.astAxisHmiCommand[uiMachine].lrTargetPosition
			<= GVL_HMI.astAxisHmiStatus[uiMachine].lrMaxPosition)
		AND (NOT axRobotSoftwareLimitsEnabled[uiMachine]
			OR (GVL_HMI.astAxisHmiCommand[uiMachine].lrTargetPosition
				>= alrRobotSoftwareMinPosition[uiMachine]))
		AND (NOT axRobotSoftwareLimitsEnabled[uiMachine]
			OR (GVL_HMI.astAxisHmiCommand[uiMachine].lrTargetPosition
				<= alrRobotSoftwareMaxPosition[uiMachine]));
	GVL_HMI.astAxisHmiStatus[uiMachine].xMoveRelativePositiveAllowed := axManualAxisBaseAllowed[uiMachine]
		AND NOT GVL_HMI.xRobotContinuousMode
		AND NOT GVL_CELL_CONTROL.xGlobalError
		AND GVL_AXIS.arrAxis[uiMachine].Status.xHomed
		AND GVL_AXIS.arrAxis[uiMachine].Status.xCanStartMotion
		AND (GVL_HMI.astAxisHmiStatus[uiMachine].lrActualPosition + GVL_HMI.lrRobotManualStep
			<= GVL_HMI.astAxisHmiStatus[uiMachine].lrMaxPosition)
		AND (NOT axRobotSoftwareLimitsEnabled[uiMachine]
			OR (GVL_HMI.astAxisHmiStatus[uiMachine].lrActualPosition + GVL_HMI.lrRobotManualStep
				<= alrRobotSoftwareMaxPosition[uiMachine]));
	GVL_HMI.astAxisHmiStatus[uiMachine].xMoveRelativeNegativeAllowed := axManualAxisBaseAllowed[uiMachine]
		AND NOT GVL_HMI.xRobotContinuousMode
		AND NOT GVL_CELL_CONTROL.xGlobalError
		AND GVL_AXIS.arrAxis[uiMachine].Status.xHomed
		AND GVL_AXIS.arrAxis[uiMachine].Status.xCanStartMotion
		AND (GVL_HMI.astAxisHmiStatus[uiMachine].lrActualPosition - GVL_HMI.lrRobotManualStep
			>= GVL_HMI.astAxisHmiStatus[uiMachine].lrMinPosition)
		AND (NOT axRobotSoftwareLimitsEnabled[uiMachine]
			OR (GVL_HMI.astAxisHmiStatus[uiMachine].lrActualPosition - GVL_HMI.lrRobotManualStep
				>= alrRobotSoftwareMinPosition[uiMachine]));

	IF NOT xHmiConnectionAlive THEN
		GVL_HMI.astAxisHmiStatus[uiMachine].eRejectReason := E_HMI_MANUAL_REJECT.HMI_OFFLINE;
	ELSIF NOT xRobotHmiPermit THEN
		GVL_HMI.astAxisHmiStatus[uiMachine].eRejectReason := E_HMI_MANUAL_REJECT.MANUAL_MODE_REQUIRED;
	ELSIF GVL_HMI.xModbusMode THEN
		GVL_HMI.astAxisHmiStatus[uiMachine].eRejectReason := E_HMI_MANUAL_REJECT.MODBUS_ACTIVE;
	ELSIF xDriveError THEN
		GVL_HMI.astAxisHmiStatus[uiMachine].eRejectReason := E_HMI_MANUAL_REJECT.DRIVE_ERROR;
	ELSIF NOT GVL_HMI.astAxisHmiStatus[uiMachine].xDriveReady THEN
		GVL_HMI.astAxisHmiStatus[uiMachine].eRejectReason := E_HMI_MANUAL_REJECT.DRIVES_DISABLED;
	ELSIF GVL_CELL_CONTROL.xGlobalError THEN
		GVL_HMI.astAxisHmiStatus[uiMachine].eRejectReason := E_HMI_MANUAL_REJECT.GLOBAL_ERROR_JOG_ONLY;
	ELSIF GVL_ROBOT.Status.xBusy THEN
		GVL_HMI.astAxisHmiStatus[uiMachine].eRejectReason := E_HMI_MANUAL_REJECT.ROBOT_BUSY;
	ELSIF xMotionBusy AND (uiManualAxisOwner <> uiMachine) THEN
		GVL_HMI.astAxisHmiStatus[uiMachine].eRejectReason := E_HMI_MANUAL_REJECT.AXIS_BUSY;
	ELSIF NOT GVL_HMI.xRobotContinuousMode
	AND NOT GVL_HMI.astAxisHmiStatus[uiMachine].xHomed THEN
		GVL_HMI.astAxisHmiStatus[uiMachine].eRejectReason := E_HMI_MANUAL_REJECT.AXIS_NOT_HOMED;
	ELSIF axManualAxisCommandRejected[uiMachine] THEN
		GVL_HMI.astAxisHmiStatus[uiMachine].eRejectReason := E_HMI_MANUAL_REJECT.COMMAND_CONFLICT;
	ELSE
		GVL_HMI.astAxisHmiStatus[uiMachine].eRejectReason := E_HMI_MANUAL_REJECT.NONE;
	END_IF;
END_FOR;

GVL_CELL_SETTINGS.xSimulationAccelerationChangeAllowed :=
	NOT GVL_CELL_MANAGER.Status.xRunning
	AND NOT GVL_HMI.xModbusMode
	AND NOT GVL_CELL_CONTROL.xGlobalError
	AND NOT xMotionBusy
	AND NOT GVL_ROBOT.Status.xBusy;

IF NOT GVL_HMI.xModbusMode THEN
	GVL_HMI.lrActualX := GVL_AXIS_GROUP.AxisGroup.Status.ActualX;
	GVL_HMI.lrActualY := GVL_AXIS_GROUP.AxisGroup.Status.ActualY;
	GVL_HMI.lrActualZ := GVL_AXIS_GROUP.AxisGroup.Status.ActualZ;
	GVL_HMI.HMI.ActualX := GVL_HMI.lrActualX;
	GVL_HMI.HMI.ActualY := GVL_HMI.lrActualY;
	GVL_HMI.HMI.ActualZ := GVL_HMI.lrActualZ;
END_IF;
