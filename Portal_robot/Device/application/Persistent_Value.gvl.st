{attribute 'qualified_only'}
VAR_GLOBAL PERSISTENT RETAIN
	// Постоянное хранилище базовых точек в энергонезависимой памяти контроллера.
	// Размер 15 сохранён ради совместимости со старой раскладкой: позиции 2, 6 и 10
	// (legacy MACHINE_x_INSIDE) больше не публикуются и не участвуют в готовности.
	astRetainPoints : ARRAY [1..GVL_POINT.iPersistentPointCapacity] OF ST_POINT;
	udiPointStorageVersion : UDINT;

	// Геометрический контроль: настройки, память станций и вызовы.
	astConfig : ARRAY [1..2] OF ST_GEOMETRY_CONFIG;
	astMemory : ARRAY [1..2] OF ST_GEOMETRY_MEMORY;
	astRetainCalls : ARRAY [1..3] OF ST_GEOMETRY_CALL;
	udiNextCallId : UDINT;
	udiEventSequence : UDINT;
	xAutoEnabled : BOOL := FALSE;
	auiPeriod : ARRAY [1..3] OF UINT := [20, 20, 20];
	auiCount : ARRAY [1..3] OF UINT;
	xWaitWhenOccupied : BOOL := TRUE;
	tTransportTimeout : TIME := T#10S;
	tDriveFeedbackTimeout : TIME := T#3S;
	tResetPulse : TIME := T#1S;
	tWaitWarningTimeout : TIME := T#180S; // Ожидание готовой вызванной детали в станке до WARNING

	// Постоянный шаг сетки для расчёта координат робота, отдельно по типам магазинов.
	lrStaticPitchX : LREAL := 60.0;
	lrStaticPitchY : LREAL := 60.0;
	lrTwinPitchX : LREAL := 70.0;
	lrTwinPitchY : LREAL := 70.0;

	// Базы ГК для SIMULATION сохраняются отдельно от реальных координат.
	astSimulationConfig : ARRAY [1..2] OF ST_GEOMETRY_CONFIG;
END_VAR
