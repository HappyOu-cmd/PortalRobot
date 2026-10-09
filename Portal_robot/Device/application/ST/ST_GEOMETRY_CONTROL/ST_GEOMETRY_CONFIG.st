TYPE ST_GEOMETRY_CONFIG :
STRUCT
	xConfigured : BOOL;
	lrX : LREAL;
	lrY : LREAL;
	lrZ : LREAL;
	lrSafeZ : LREAL := -300.0; // Signed-смещение безопасного подхода от рабочей Z
	lrChangeZ : LREAL := -150.0; // Legacy-поле OPC UA; маршрут использует SAFE_Z, при записи равно lrSafeZ
	lrSpeedFactor : LREAL := 0.2;
END_STRUCT
END_TYPE
