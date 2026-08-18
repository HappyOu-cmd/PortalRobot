FUNCTION_BLOCK FB_AXIS_FAULT_INJECTOR
VAR_INPUT
	Request      : ST_AXIS_FAULT_REQUEST; // Запрос тестовой логической ошибки оси
	xOwnerAllowed: BOOL; // Безопасные условия, рассчитанные FB_AXIS
END_VAR
VAR_OUTPUT
	xJogConflict : BOOL; // Одноцикловая пара Jog+ и Jog- для штатной проверки
	Status       : ST_FAULT_INJECTION_STATUS; // Состояние источника для HMI
END_VAR
VAR
	rtJogConflict : R_TRIG; // Фронт команды HMI
END_VAR

// --- BEGIN IMPLEMENTATION ---

rtJogConflict(CLK := Request.xJogConflict);

xJogConflict := FALSE;
Status.xRejected := FALSE;
Status.xAllowed := Request.xEnabled AND xOwnerAllowed;
Status.xBusy := FALSE;
Status.xResetAllowed := FALSE;

IF rtJogConflict.Q THEN
	IF Status.xAllowed THEN
		xJogConflict := TRUE;
	ELSE
		Status.xRejected := TRUE;
		Status.udiRejectSequence := Status.udiRejectSequence + UDINT#1;
		IF Status.udiRejectSequence = UDINT#0 THEN
			Status.udiRejectSequence := UDINT#1;
		END_IF;
	END_IF;
END_IF;

Status.xActive := xJogConflict;
