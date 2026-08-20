FUNCTION_BLOCK FB_ROBOT_FAULT_INJECTOR
VAR_INPUT
	Request       : ST_ROBOT_FAULT_REQUEST; // Запросы локальных ошибок робота
	xOwnerAllowed : BOOL; // Безопасные условия, рассчитанные FB_ROBOT
END_VAR
VAR_OUTPUT
	xWrongAction : BOOL; // Одноцикловая недопустимая команда для штатной проверки
	Status       : ST_FAULT_INJECTION_STATUS; // Состояние источника для HMI
END_VAR
VAR
	rtWrongAction : R_TRIG; // Фронт команды HMI
END_VAR

// --- BEGIN IMPLEMENTATION ---

rtWrongAction(CLK := Request.xWrongAction);
xWrongAction := FALSE;
Status.xRejected := FALSE;
Status.xAllowed := Request.xEnabled AND xOwnerAllowed;
Status.xBusy := FALSE;
Status.xResetAllowed := FALSE;

IF rtWrongAction.Q THEN
	IF Status.xAllowed THEN
		xWrongAction := TRUE;
	ELSE
		Status.xRejected := TRUE;
		Status.udiRejectSequence := Status.udiRejectSequence + UDINT#1;
		IF Status.udiRejectSequence = UDINT#0 THEN
			Status.udiRejectSequence := UDINT#1;
		END_IF;
	END_IF;
END_IF;

Status.xActive := xWrongAction;
