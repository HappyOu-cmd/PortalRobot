FUNCTION_BLOCK FB_AXIS_GROUP_FAULT_INJECTOR
VAR_INPUT
	Request       : ST_AXIS_GROUP_FAULT_REQUEST; // Команда диагностической ошибки SM3
	xOwnerAllowed : BOOL; // Безопасные условия, рассчитанные FB_AXIS_GROUP
	xReset        : BOOL; // Штатный сброс группы
	Position      : SMC_POS_REF; // Текущая позиция для команды без перемещения
END_VAR
VAR_OUTPUT
	xError    : BOOL; // Защёлкнутая ошибка тестового Motion FB
	udiErrorID: UDINT; // ErrorID тестового Motion FB
	Status    : ST_FAULT_INJECTION_STATUS; // Состояние источника для HMI
END_VAR
VAR_IN_OUT
	AxisGroup : AXIS_GROUP_REF_SM3; // Ссылка на группу осей SoftMotion
END_VAR
VAR
	fbInvalidMove : MC_MoveDirectAbsolute; // Motion FB с недопустимым параметром
	rtExecute     : R_TRIG; // Фронт запроса HMI
	xExecute      : BOOL; // Execute удерживается до Error или Done
	xErrorLatched : BOOL; // Ошибка хранится до штатного сброса группы
END_VAR

// --- BEGIN IMPLEMENTATION ---

rtExecute(CLK := Request.xExecute);

Status.xRejected := FALSE;
Status.xAllowed := Request.xEnabled AND xOwnerAllowed;

IF xReset THEN
	xExecute := FALSE;
	xErrorLatched := FALSE;
	udiErrorID := UDINT#0;
END_IF;

IF rtExecute.Q THEN
	IF Status.xAllowed THEN
		xExecute := TRUE;
	ELSE
		Status.xRejected := TRUE;
		Status.udiRejectSequence := Status.udiRejectSequence + UDINT#1;
		IF Status.udiRejectSequence = UDINT#0 THEN
			Status.udiRejectSequence := UDINT#1;
		END_IF;
	END_IF;
END_IF;

// По контракту SM3_Robotics VelFactor должен находиться в диапазоне ]0, 1].
// Отрицательное значение формирует Error/ErrorID без принятого перемещения.
fbInvalidMove(
	AxisGroup   := AxisGroup,
	Execute     := xExecute,
	Position    := Position,
	CoordSystem := SMC_COORD_SYSTEM.MCS,
	BufferMode  := MC_BUFFER_MODE.Aborting,
	VelFactor   := -1.0,
	AccFactor   := 1.0,
	JerkFactor  := 1.0
);

IF fbInvalidMove.Error THEN
	xErrorLatched := TRUE;
	udiErrorID := TO_UDINT(fbInvalidMove.ErrorID);
END_IF;

IF fbInvalidMove.Error OR fbInvalidMove.Done THEN
	xExecute := FALSE;
END_IF;

xError := xErrorLatched;
Status.xActive := xErrorLatched;
Status.xBusy := xExecute OR fbInvalidMove.Busy;
Status.xResetAllowed := xErrorLatched AND NOT Status.xBusy;
