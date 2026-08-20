FUNCTION_BLOCK FB_POINT_FAULT_INJECTOR
VAR_INPUT
	Request       : ST_POINT_FAULT_REQUEST; // Запросы конкретных ошибок точки
	xOwnerAllowed : BOOL; // Безопасные условия, рассчитанные менеджером движения
	xComplete     : BOOL; // Штатная ошибка уже сформирована владельцем
	PointRaw      : ST_POINT; // Исходная корректная точка
END_VAR
VAR_OUTPUT
	Point    : ST_POINT; // Точка, передаваемая штатной проверке
	xExecute : BOOL; // Синтетический запрос проверки без запуска движения
	Status   : ST_FAULT_INJECTION_STATUS; // Состояние источника для HMI
END_VAR
VAR
	rtXOutOfLimit     : R_TRIG;
	rtYOutOfLimit     : R_TRIG;
	rtZOutOfLimit     : R_TRIG;
	rtInvalidVelocity : R_TRIG;
	xRequestPulse     : BOOL;
	xInjectX          : BOOL;
	xInjectY          : BOOL;
	xInjectZ          : BOOL;
	xInjectVelocity   : BOOL;
END_VAR
VAR CONSTANT
	INVALID_COORDINATE : LREAL := 1.0E+09; // Заведомо вне рабочей зоны проверки
END_VAR

// --- BEGIN IMPLEMENTATION ---

rtXOutOfLimit(CLK := Request.xXOutOfLimit);
rtYOutOfLimit(CLK := Request.xYOutOfLimit);
rtZOutOfLimit(CLK := Request.xZOutOfLimit);
rtInvalidVelocity(CLK := Request.xInvalidVelocity);

xRequestPulse := rtXOutOfLimit.Q
	OR rtYOutOfLimit.Q
	OR rtZOutOfLimit.Q
	OR rtInvalidVelocity.Q;

Status.xRejected := FALSE;
Status.xAllowed := Request.xEnabled AND xOwnerAllowed;

IF xComplete THEN
	xInjectX := FALSE;
	xInjectY := FALSE;
	xInjectZ := FALSE;
	xInjectVelocity := FALSE;
END_IF;

IF xRequestPulse THEN
	IF Status.xAllowed THEN
		xInjectX := rtXOutOfLimit.Q;
		xInjectY := rtYOutOfLimit.Q;
		xInjectZ := rtZOutOfLimit.Q;
		xInjectVelocity := rtInvalidVelocity.Q;
	ELSE
		Status.xRejected := TRUE;
		Status.udiRejectSequence := Status.udiRejectSequence + UDINT#1;
		IF Status.udiRejectSequence = UDINT#0 THEN
			Status.udiRejectSequence := UDINT#1;
		END_IF;
	END_IF;
END_IF;

Point := PointRaw;
IF xInjectX THEN
	Point.X := INVALID_COORDINATE;
END_IF;
IF xInjectY THEN
	Point.Y := INVALID_COORDINATE;
END_IF;
IF xInjectZ THEN
	Point.Z := INVALID_COORDINATE;
END_IF;
IF xInjectVelocity THEN
	Point.SpeedFactor := 0.0;
END_IF;

xExecute := xInjectX OR xInjectY OR xInjectZ OR xInjectVelocity;
Status.xActive := xExecute;
Status.xBusy := xExecute;
Status.xResetAllowed := FALSE;
