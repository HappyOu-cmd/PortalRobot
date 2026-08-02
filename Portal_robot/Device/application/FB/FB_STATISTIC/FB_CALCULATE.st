FUNCTION_BLOCK FB_CALCULATE
VAR_INPUT
	xMode          : BOOL;   // Режим работы фб (0 - измерение коэфф. загрузки, 1 - измерение среднего времени0
	xMeasure 		: BOOL;  // Флаг для измерения загрузки
	tTotalPLC      : TIME;   // Общее время работы ПЛК
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
END_VAR

// --- BEGIN IMPLEMENTATION ---

rTrig (CLK := xMeasure);
fTrig (CLK := xMeasure);

IF rTrig.Q THEN
	tStart := TIME();
END_IF

IF fTrig.Q THEN
	tElapsed := TIME() - tStart;
	tTotalBusy := tTotalBusy + tElapsed;
	tLastMesured := tElapsed;
	IF xMode THEN
		uiCount := uiCount + 1;
		tAverageTime := tTotalBusy / uiCount;
	END_IF
END_IF

IF tTotalPLC > T#0S AND NOT xMode THEN
	rLoadPercent := (UDINT_TO_REAL(TIME_TO_UDINT(tTotalBusy))) * 100 /(UDINT_TO_REAL(TIME_TO_UDINT(tTotalPLC))) ;
END_IF;
