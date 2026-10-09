FUNCTION_BLOCK FB_DI_FILTER
VAR_INPUT
	xEnable : BOOL;
	xInput : BOOL;
	tRise : TIME := T#20MS; // Стабильный 0 -> 1
	tFall : TIME := T#20MS; // Стабильный 1 -> 0
END_VAR
VAR_OUTPUT
	xFiltered : BOOL;
END_VAR
VAR
	tonRise : TON;
	tonFall : TON;
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Каждая смена направления сбрасывает противоположный таймер. Короткие
// выбросы не накапливаются. При нулевом времени уровень меняется в этом скане.
IF NOT xEnable THEN
	xFiltered := FALSE;
END_IF;
tonRise(IN := xEnable AND xInput AND NOT xFiltered, PT := tRise);
tonFall(IN := xEnable AND NOT xInput AND xFiltered, PT := tFall);
IF xEnable THEN
	IF xInput AND ((tRise = T#0MS) OR tonRise.Q) THEN
		xFiltered := TRUE;
	ELSIF NOT xInput AND ((tFall = T#0MS) OR tonFall.Q) THEN
		xFiltered := FALSE;
	END_IF;
END_IF;
