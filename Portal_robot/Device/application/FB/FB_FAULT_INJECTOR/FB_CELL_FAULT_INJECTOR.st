FUNCTION_BLOCK FB_CELL_FAULT_INJECTOR
VAR_INPUT
	Request       : ST_CELL_FAULT_REQUEST; // Запрос локальной ошибки менеджера ячейки
	xOwnerAllowed : BOOL; // Безопасные условия, рассчитанные FB_CELL_MANAGER
END_VAR
VAR_OUTPUT
	xBothGrippers : BOOL; // Одноцикловое противоречивое состояние для штатной проверки
	Status        : ST_FAULT_INJECTION_STATUS; // Состояние источника для HMI
END_VAR
VAR
	rtBothGrippers : R_TRIG; // Фронт команды HMI
END_VAR

// --- BEGIN IMPLEMENTATION ---

rtBothGrippers(CLK := Request.xBothGrippers);
xBothGrippers := FALSE;
Status.xRejected := FALSE;
Status.xAllowed := Request.xEnabled AND xOwnerAllowed;
Status.xBusy := FALSE;
Status.xResetAllowed := FALSE;

IF rtBothGrippers.Q THEN
	IF Status.xAllowed THEN
		xBothGrippers := TRUE;
	ELSE
		Status.xRejected := TRUE;
		Status.udiRejectSequence := Status.udiRejectSequence + UDINT#1;
		IF Status.udiRejectSequence = UDINT#0 THEN
			Status.udiRejectSequence := UDINT#1;
		END_IF;
	END_IF;
END_IF;

Status.xActive := xBothGrippers;
