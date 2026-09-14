FUNCTION_BLOCK FB_SIMULATION_DYNAMIC_LIMITS
VAR_INPUT
	xSimulationMode : BOOL; // Активна тестовая среда SIMULATION
	xSoftMotionMode : BOOL; // Роботом управляют локальные оси SoftMotion
	xAccelerationEnabled : BOOL; // Для следующего теста выбран ускоренный профиль
	xPrepareTest : BOOL; // Фронт подготовки следующего сценария
	uiRequestedFactor : UINT; // Запрошенное масштабирование времени 1..100
	xCellRunning : BOOL;
	xRobotBusy : BOOL;
	xMotionBusy : BOOL;
	xDrivesPowered : BOOL;
	xDrivesOff : BOOL;
	eGroupState : E_AXIS_GROUP_STATE;
END_VAR
VAR_OUTPUT
	xCellStopRequest : BOOL; // Сначала остановить технологический цикл
	xMotionStopRequest : BOOL; // Затем остановить движение группы
	xGroupDisableRequest : BOOL; // Перед изменением лимитов получить GroupDisabled
	xDrivesEnableRequest : BOOL; // После изменения вернуть штатную готовность
	xBusy : BOOL;
	xPending : BOOL; // Ползунок изменён; значение ждёт границы следующего теста
	xReadyForTest : BOOL; // Новый тест можно запускать
	xAccelerationActive : BOOL;
	uiAppliedFactor : UINT := UINT#1;
	xDone : BOOL;
	xError : BOOL;
	udiErrorId : UDINT;
END_VAR
VAR_IN_OUT
	AxisX : AXIS_REF_SM3;
	AxisY : AXIS_REF_SM3;
	AxisZ : AXIS_REF_SM3;
END_VAR
VAR CONSTANT
	STATE_IDLE : UINT := UINT#0;
	STATE_WAIT_STANDSTILL : UINT := UINT#10;
	STATE_WAIT_GROUP_DISABLED : UINT := UINT#20;
	STATE_CHANGE_X : UINT := UINT#30;
	STATE_CHANGE_Y : UINT := UINT#40;
	STATE_CHANGE_Z : UINT := UINT#50;
	STATE_PREPARE_ROLLBACK : UINT := UINT#55;
	STATE_WAIT_REENABLE : UINT := UINT#60;
	STATE_LOCKED_ERROR : UINT := UINT#90;
	ERR_INVALID_ORIGINAL_LIMITS : UDINT := UDINT#16#80010001;
	ERR_TRANSACTION_TIMEOUT : UDINT := UDINT#16#80010002;
	ERR_INVALID_STATE : UDINT := UDINT#16#80010003;
END_VAR
VAR
	rtPrepareTest : R_TRIG;
	tonTransaction : TON;
	uiState : UINT := UINT#0;
	uiAxis : UINT;
	uiDesiredFactor : UINT := UINT#1;
	uiTargetFactor : UINT := UINT#1;
	xOriginalLimitsSaved : BOOL;
	xOriginalLimitsValid : BOOL;
	xRestoreOnExit : BOOL;
	xRollback : BOOL;
	xReenableAfterChange : BOOL;

	alrOriginalVelocity : ARRAY [1..3] OF LREAL;
	alrOriginalAcceleration : ARRAY [1..3] OF LREAL;
	alrOriginalDeceleration : ARRAY [1..3] OF LREAL;
	alrOriginalJerk : ARRAY [1..3] OF LREAL;
	alrTargetVelocity : ARRAY [1..3] OF LREAL;
	alrTargetAcceleration : ARRAY [1..3] OF LREAL;
	alrTargetDeceleration : ARRAY [1..3] OF LREAL;
	alrTargetJerk : ARRAY [1..3] OF LREAL;
	lrFactor : LREAL;
	lrFactorSquared : LREAL;
	lrFactorCubed : LREAL;

	fbChangeX : SMC_ChangeDynamicLimits;
	fbChangeY : SMC_ChangeDynamicLimits;
	fbChangeZ : SMC_ChangeDynamicLimits;
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Запрошенное значение разрешено менять когда угодно. Оно только создаёт
// pending-запрос; уже выполняемая траектория никогда не перепланируется.
uiDesiredFactor := MAX(UINT#1, MIN(UINT#100, uiRequestedFactor));
IF NOT (xSimulationMode AND xSoftMotionMode AND xAccelerationEnabled) THEN
	uiDesiredFactor := UINT#1;
END_IF;
rtPrepareTest(CLK := xPrepareTest);

xCellStopRequest := FALSE;
xMotionStopRequest := FALSE;
xGroupDisableRequest := FALSE;
xDrivesEnableRequest := FALSE;
xDone := FALSE;

// Штатные лимиты снимаются ровно при входе в SoftMotion-симуляцию, до первого
// масштабирования. Прямое редактирование AXIS_REF здесь не выполняется.
IF xSimulationMode AND xSoftMotionMode AND NOT xOriginalLimitsSaved THEN
	// Dynamic limits из конфигуратора оси находятся в fSWMax*. fMax* — это
	// remote limits самого привода и у виртуальной оси законно остаются нулями.
	alrOriginalVelocity[1] := AxisX.fSWMaxVelocity;
	alrOriginalAcceleration[1] := AxisX.fSWMaxAcceleration;
	alrOriginalDeceleration[1] := AxisX.fSWMaxDeceleration;
	alrOriginalJerk[1] := AxisX.fSWMaxJerk;
	alrOriginalVelocity[2] := AxisY.fSWMaxVelocity;
	alrOriginalAcceleration[2] := AxisY.fSWMaxAcceleration;
	alrOriginalDeceleration[2] := AxisY.fSWMaxDeceleration;
	alrOriginalJerk[2] := AxisY.fSWMaxJerk;
	alrOriginalVelocity[3] := AxisZ.fSWMaxVelocity;
	alrOriginalAcceleration[3] := AxisZ.fSWMaxAcceleration;
	alrOriginalDeceleration[3] := AxisZ.fSWMaxDeceleration;
	alrOriginalJerk[3] := AxisZ.fSWMaxJerk;

	IF alrOriginalVelocity[1] <= LREAL#0.0 THEN alrOriginalVelocity[1] := AxisX.fMaxVelocity; END_IF;
	IF alrOriginalAcceleration[1] <= LREAL#0.0 THEN alrOriginalAcceleration[1] := AxisX.fMaxAcceleration; END_IF;
	IF alrOriginalDeceleration[1] <= LREAL#0.0 THEN alrOriginalDeceleration[1] := AxisX.fMaxDeceleration; END_IF;
	IF alrOriginalJerk[1] <= LREAL#0.0 THEN alrOriginalJerk[1] := AxisX.fMaxJerk; END_IF;
	IF alrOriginalVelocity[2] <= LREAL#0.0 THEN alrOriginalVelocity[2] := AxisY.fMaxVelocity; END_IF;
	IF alrOriginalAcceleration[2] <= LREAL#0.0 THEN alrOriginalAcceleration[2] := AxisY.fMaxAcceleration; END_IF;
	IF alrOriginalDeceleration[2] <= LREAL#0.0 THEN alrOriginalDeceleration[2] := AxisY.fMaxDeceleration; END_IF;
	IF alrOriginalJerk[2] <= LREAL#0.0 THEN alrOriginalJerk[2] := AxisY.fMaxJerk; END_IF;
	IF alrOriginalVelocity[3] <= LREAL#0.0 THEN alrOriginalVelocity[3] := AxisZ.fMaxVelocity; END_IF;
	IF alrOriginalAcceleration[3] <= LREAL#0.0 THEN alrOriginalAcceleration[3] := AxisZ.fMaxAcceleration; END_IF;
	IF alrOriginalDeceleration[3] <= LREAL#0.0 THEN alrOriginalDeceleration[3] := AxisZ.fMaxDeceleration; END_IF;
	IF alrOriginalJerk[3] <= LREAL#0.0 THEN alrOriginalJerk[3] := AxisZ.fMaxJerk; END_IF;

	xOriginalLimitsValid := TRUE;
	FOR uiAxis := UINT#1 TO UINT#3 DO
		xOriginalLimitsValid := xOriginalLimitsValid
			AND (alrOriginalVelocity[uiAxis] > LREAL#0.0)
			AND (alrOriginalAcceleration[uiAxis] > LREAL#0.0)
			AND (alrOriginalDeceleration[uiAxis] > LREAL#0.0)
			AND (alrOriginalJerk[uiAxis] > LREAL#0.0);
	END_FOR;
	IF xOriginalLimitsValid THEN
		xOriginalLimitsSaved := TRUE;
		uiAppliedFactor := UINT#1;
		xError := FALSE;
		udiErrorId := UDINT#0;
	ELSIF rtPrepareTest.Q THEN
		// До подготовки теста просто ждём инициализацию осей; не защёлкиваем
		// ложную ошибку на первом цикле после переключения среды.
		xError := TRUE;
		udiErrorId := ERR_INVALID_ORIGINAL_LIMITS;
	END_IF;
END_IF;

// Ошибка чтения исходных лимитов не должна блокировать обычную ячейку после
// выхода из тестовой среды и не должна переживать Online Change этого исправления.
IF NOT xSimulationMode
AND NOT xOriginalLimitsSaved
AND (uiState = STATE_IDLE)
AND (udiErrorId = ERR_INVALID_ORIGINAL_LIMITS) THEN
	xError := FALSE;
	udiErrorId := UDINT#0;
END_IF;

xRestoreOnExit := xOriginalLimitsSaved
	AND (NOT xSimulationMode OR NOT xSoftMotionMode)
	AND (uiAppliedFactor <> UINT#1);
xPending := xOriginalLimitsSaved AND (uiDesiredFactor <> uiAppliedFactor);

// Один общий таймаут защищает всю транзакцию Stop -> Disable -> Change -> Enable.
tonTransaction(IN := uiState <> STATE_IDLE, PT := T#60S);
IF tonTransaction.Q
AND (uiState <> STATE_IDLE)
AND (uiState <> STATE_LOCKED_ERROR) THEN
	xError := TRUE;
	udiErrorId := ERR_TRANSACTION_TIMEOUT;
	uiState := STATE_LOCKED_ERROR;
END_IF;

CASE uiState OF
	STATE_IDLE:
		xBusy := FALSE;
		// Возврат штатных лимитов при выходе из SIMULATION выполняется сразу.
		// Обычная ячейка не получит Start, пока транзакция не закончена.
		IF xRestoreOnExit THEN
			xError := FALSE;
			udiErrorId := UDINT#0;
			uiTargetFactor := UINT#1;
			xRollback := FALSE;
			xReenableAfterChange := xSoftMotionMode AND NOT xDrivesOff;
			xBusy := TRUE;
			uiState := STATE_WAIT_STANDSTILL;
		ELSIF rtPrepareTest.Q
		AND xSimulationMode
		AND xSoftMotionMode
		AND xPending
		AND NOT xCellRunning THEN
			xError := FALSE;
			udiErrorId := UDINT#0;
			uiTargetFactor := uiDesiredFactor;
			xRollback := FALSE;
			xReenableAfterChange := NOT xDrivesOff;
			xBusy := TRUE;
			uiState := STATE_WAIT_STANDSTILL;
		ELSIF NOT xSimulationMode
		AND xOriginalLimitsSaved
		AND (uiAppliedFactor = UINT#1) THEN
			// Лимиты не менялись либо уже успешно восстановлены.
			xOriginalLimitsSaved := FALSE;
		END_IF;

	STATE_WAIT_STANDSTILL:
		xBusy := TRUE;
		xCellStopRequest := xCellRunning;
		xMotionStopRequest := xMotionBusy OR xRobotBusy;
		IF NOT xCellRunning AND NOT xMotionBusy AND NOT xRobotBusy THEN
			uiState := STATE_WAIT_GROUP_DISABLED;
		END_IF;

	STATE_WAIT_GROUP_DISABLED:
		xBusy := TRUE;
		xGroupDisableRequest := NOT xDrivesOff;
		IF xDrivesOff AND (eGroupState = E_AXIS_GROUP_STATE.DISABLED) THEN
			IF xRollback THEN
				FOR uiAxis := UINT#1 TO UINT#3 DO
					alrTargetVelocity[uiAxis] := alrOriginalVelocity[uiAxis];
					alrTargetAcceleration[uiAxis] := alrOriginalAcceleration[uiAxis];
					alrTargetDeceleration[uiAxis] := alrOriginalDeceleration[uiAxis];
					alrTargetJerk[uiAxis] := alrOriginalJerk[uiAxis];
				END_FOR;
			ELSE
				lrFactor := UINT_TO_LREAL(uiTargetFactor);
				lrFactorSquared := lrFactor * lrFactor;
				lrFactorCubed := lrFactorSquared * lrFactor;
				alrTargetVelocity[1] := alrOriginalVelocity[1] * lrFactor;
				alrTargetAcceleration[1] := alrOriginalAcceleration[1] * lrFactorSquared;
				alrTargetDeceleration[1] := alrOriginalDeceleration[1] * lrFactorSquared;
				alrTargetJerk[1] := alrOriginalJerk[1] * lrFactorCubed;
				alrTargetVelocity[2] := alrOriginalVelocity[2] * lrFactor;
				alrTargetAcceleration[2] := alrOriginalAcceleration[2] * lrFactorSquared;
				alrTargetDeceleration[2] := alrOriginalDeceleration[2] * lrFactorSquared;
				alrTargetJerk[2] := alrOriginalJerk[2] * lrFactorCubed;
				alrTargetVelocity[3] := alrOriginalVelocity[3] * lrFactor;
				alrTargetAcceleration[3] := alrOriginalAcceleration[3] * lrFactorSquared;
				alrTargetDeceleration[3] := alrOriginalDeceleration[3] * lrFactorSquared;
				alrTargetJerk[3] := alrOriginalJerk[3] * lrFactorCubed;
			END_IF;
			uiState := STATE_CHANGE_X;
		END_IF;

	STATE_CHANGE_X:
		xBusy := TRUE;
		IF fbChangeX.bError THEN
			xError := TRUE;
			udiErrorId := TO_UDINT(fbChangeX.ErrorID);
			IF xRollback THEN uiState := STATE_LOCKED_ERROR;
			ELSE uiState := STATE_PREPARE_ROLLBACK; END_IF;
		ELSIF fbChangeX.bDone THEN
			uiState := STATE_CHANGE_Y;
		END_IF;

	STATE_CHANGE_Y:
		xBusy := TRUE;
		IF fbChangeY.bError THEN
			xError := TRUE;
			udiErrorId := TO_UDINT(fbChangeY.ErrorID);
			IF xRollback THEN uiState := STATE_LOCKED_ERROR;
			ELSE uiState := STATE_PREPARE_ROLLBACK; END_IF;
		ELSIF fbChangeY.bDone THEN
			uiState := STATE_CHANGE_Z;
		END_IF;

	STATE_CHANGE_Z:
		xBusy := TRUE;
		IF fbChangeZ.bError THEN
			xError := TRUE;
			udiErrorId := TO_UDINT(fbChangeZ.ErrorID);
			IF xRollback THEN uiState := STATE_LOCKED_ERROR;
			ELSE uiState := STATE_PREPARE_ROLLBACK; END_IF;
		ELSIF fbChangeZ.bDone THEN
			IF xReenableAfterChange THEN
				uiState := STATE_WAIT_REENABLE;
			ELSE
				IF xRollback THEN uiAppliedFactor := UINT#1;
				ELSE uiAppliedFactor := uiTargetFactor; END_IF;
				xDone := NOT xRollback;
				xBusy := FALSE;
				uiState := STATE_IDLE;
			END_IF;
		END_IF;

	STATE_PREPARE_ROLLBACK:
		// Один цикл с Execute=FALSE создаёт корректный новый фронт для X.
		xBusy := TRUE;
		xRollback := TRUE;
		uiState := STATE_WAIT_GROUP_DISABLED;

	STATE_WAIT_REENABLE:
		xBusy := TRUE;
		xDrivesEnableRequest := TRUE;
		IF xDrivesPowered AND (eGroupState = E_AXIS_GROUP_STATE.READY) THEN
			IF xRollback THEN uiAppliedFactor := UINT#1;
			ELSE uiAppliedFactor := uiTargetFactor; END_IF;
			xDone := NOT xRollback;
			xBusy := FALSE;
			uiState := STATE_IDLE;
		END_IF;

	STATE_LOCKED_ERROR:
		// При неизвестном/неустранимом результате оставляем группу отключённой.
		// Следующий Start заблокирован, пока инженер не устранит причину.
		xBusy := FALSE;
		xGroupDisableRequest := NOT xDrivesOff;

ELSE
	xError := TRUE;
	udiErrorId := ERR_INVALID_STATE;
	uiState := STATE_LOCKED_ERROR;
END_CASE;

fbChangeX(
	Axis := AxisX,
	bExecute := uiState = STATE_CHANGE_X,
	fMaxVelocity := alrTargetVelocity[1],
	fMaxAcceleration := alrTargetAcceleration[1],
	fMaxDeceleration := alrTargetDeceleration[1],
	fMaxJerk := alrTargetJerk[1]
);
fbChangeY(
	Axis := AxisY,
	bExecute := uiState = STATE_CHANGE_Y,
	fMaxVelocity := alrTargetVelocity[2],
	fMaxAcceleration := alrTargetAcceleration[2],
	fMaxDeceleration := alrTargetDeceleration[2],
	fMaxJerk := alrTargetJerk[2]
);
fbChangeZ(
	Axis := AxisZ,
	bExecute := uiState = STATE_CHANGE_Z,
	fMaxVelocity := alrTargetVelocity[3],
	fMaxAcceleration := alrTargetAcceleration[3],
	fMaxDeceleration := alrTargetDeceleration[3],
	fMaxJerk := alrTargetJerk[3]
);

xPending := xOriginalLimitsSaved AND (uiDesiredFactor <> uiAppliedFactor);
xAccelerationActive := xSimulationMode AND xSoftMotionMode
	AND (uiAppliedFactor > UINT#1) AND NOT xError;
xReadyForTest := NOT xBusy AND NOT xError
	AND (NOT (xSimulationMode AND xSoftMotionMode AND xAccelerationEnabled) OR NOT xPending);
