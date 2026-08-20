FUNCTION_BLOCK FB_MAGAZINE_FAULT_INJECTOR
VAR_INPUT
	Request       : ST_MAGAZINE_FAULT_REQUEST; // Запросы конкретных ошибок магазина
	xOwnerAllowed : BOOL; // Безопасные условия, рассчитанные FB_MAGAZINE
	xComplete     : BOOL; // Штатная ошибка уже сформирована владельцем
END_VAR
VAR_OUTPUT
	xWrongOperation : BOOL;
	xNoBlank        : BOOL;
	xNoFreeSlot     : BOOL;
	xInvalidSlot    : BOOL;
	xSlotContent    : BOOL;
	xGeometry       : BOOL;
	Status          : ST_FAULT_INJECTION_STATUS; // Состояние источника для HMI
END_VAR
VAR
	rtWrongOperation : R_TRIG;
	rtNoBlank        : R_TRIG;
	rtNoFreeSlot     : R_TRIG;
	rtInvalidSlot    : R_TRIG;
	rtSlotContent    : R_TRIG;
	rtGeometry       : R_TRIG;
	xRequestPulse    : BOOL;
END_VAR

// --- BEGIN IMPLEMENTATION ---

rtWrongOperation(CLK := Request.xWrongOperation);
rtNoBlank(CLK := Request.xNoBlank);
rtNoFreeSlot(CLK := Request.xNoFreeSlot);
rtInvalidSlot(CLK := Request.xInvalidSlot);
rtSlotContent(CLK := Request.xSlotContent);
rtGeometry(CLK := Request.xGeometry);

xRequestPulse := rtWrongOperation.Q
	OR rtNoBlank.Q
	OR rtNoFreeSlot.Q
	OR rtInvalidSlot.Q
	OR rtSlotContent.Q
	OR rtGeometry.Q;

Status.xRejected := FALSE;
Status.xAllowed := Request.xEnabled AND xOwnerAllowed;

IF xComplete THEN
	xWrongOperation := FALSE;
	xNoBlank := FALSE;
	xNoFreeSlot := FALSE;
	xInvalidSlot := FALSE;
	xSlotContent := FALSE;
	xGeometry := FALSE;
END_IF;

IF xRequestPulse THEN
	IF Status.xAllowed THEN
		xWrongOperation := rtWrongOperation.Q;
		xNoBlank := rtNoBlank.Q;
		xNoFreeSlot := rtNoFreeSlot.Q;
		xInvalidSlot := rtInvalidSlot.Q;
		xSlotContent := rtSlotContent.Q;
		xGeometry := rtGeometry.Q;
	ELSE
		Status.xRejected := TRUE;
		Status.udiRejectSequence := Status.udiRejectSequence + UDINT#1;
		IF Status.udiRejectSequence = UDINT#0 THEN
			Status.udiRejectSequence := UDINT#1;
		END_IF;
	END_IF;
END_IF;

Status.xActive := xWrongOperation
	OR xNoBlank
	OR xNoFreeSlot
	OR xInvalidSlot
	OR xSlotContent
	OR xGeometry;
Status.xBusy := Status.xActive;
Status.xResetAllowed := FALSE;
