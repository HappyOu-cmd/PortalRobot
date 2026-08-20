FUNCTION_BLOCK FB_CALCULATE
VAR_INPUT
	xMode          : BOOL;   // Режим работы ФБ (0 - процент загрузки, 1 - среднее время)
	xMeasure 		: BOOL;  // Флаг для измерения загрузки
	tTotalPLC      : TIME;   // Общее время работы ПЛК
	uiSimulationTimeFactor : UINT := 1; // Коэффициент виртуального времени
	xReset         : BOOL;   // Сброс накопленной статистики при старте новой сессии
END_VAR
VAR_OUTPUT
	rLoadPercent 	: REAL;   // Загрузка в процентах
	tAverageTime    : TIME;   // Среднее время
END_VAR
VAR
	uiCount         : UINT;   // Количетво измерений
	rTrig           : R_TRIG; // Фронт сигнала измерения
	fTrig           : F_TRIG; // Спад сигнала измерения
	tStart 			: TIME;   // Время старта замера
	tElapsed        : TIME;   // Измеренное время
	tLastMesured    : TIME;   // Последнее измеренное время
	tTotalBusy      : TIME;   // Общее время загрузки
	tCurrentBusy    : TIME;   // Накопленное время с учётом текущего незавершённого интервала
	tNow            : TIME;   // Текущее системное время
	uiEffectiveTimeFactor : UINT;
	udiScaledTime          : UDINT;
	udiTotalPlcTime        : UDINT;
END_VAR

// --- BEGIN IMPLEMENTATION ---

uiEffectiveTimeFactor := uiSimulationTimeFactor;
IF uiEffectiveTimeFactor < UINT#1 THEN
	uiEffectiveTimeFactor := UINT#1;
ELSIF uiEffectiveTimeFactor > UINT#250 THEN
	uiEffectiveTimeFactor := UINT#250;
END_IF;

tNow := TIME();
rTrig(CLK := xMeasure);
fTrig(CLK := xMeasure);

IF xReset THEN
	uiCount := 0;
	tStart := tNow;
	tElapsed := T#0MS;
	tLastMesured := T#0MS;
	tTotalBusy := T#0MS;
	tCurrentBusy := T#0MS;
	rLoadPercent := 0.0;
	tAverageTime := T#0MS;
ELSE
	IF rTrig.Q THEN
		tStart := tNow;
	END_IF

	IF fTrig.Q THEN
		udiScaledTime := TIME_TO_UDINT(tNow - tStart) * TO_UDINT(uiEffectiveTimeFactor);
		tElapsed := UDINT_TO_TIME(udiScaledTime);
		tTotalBusy := tTotalBusy + tElapsed;
		tLastMesured := tElapsed;
		IF xMode THEN
			uiCount := uiCount + 1;
			tAverageTime := tTotalBusy / uiCount;
		END_IF
	END_IF
END_IF

IF tTotalPLC > T#0S AND NOT xMode THEN
	tCurrentBusy := tTotalBusy;
	IF xMeasure THEN
		udiScaledTime := TIME_TO_UDINT(tNow - tStart) * TO_UDINT(uiEffectiveTimeFactor);
		tCurrentBusy := tCurrentBusy + UDINT_TO_TIME(udiScaledTime);
	END_IF
	udiTotalPlcTime := TIME_TO_UDINT(tTotalPLC) * TO_UDINT(uiEffectiveTimeFactor);
	IF (udiTotalPlcTime > UDINT#0) THEN
		rLoadPercent := UDINT_TO_REAL(TIME_TO_UDINT(tCurrentBusy)) * 100.0
			/ UDINT_TO_REAL(udiTotalPlcTime);
	ELSE
		rLoadPercent := 0.0;
	END_IF;
	IF rLoadPercent > 100.0 THEN
		rLoadPercent := 100.0;
	ELSIF rLoadPercent < 0.0 THEN
		rLoadPercent := 0.0;
	END_IF
ELSIF NOT xMode THEN
	rLoadPercent := 0.0;
END_IF
