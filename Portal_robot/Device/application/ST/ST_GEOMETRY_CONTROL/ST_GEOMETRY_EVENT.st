TYPE ST_GEOMETRY_EVENT :
STRUCT
	udiSequence : UDINT;
	udiTimeMs : UDINT; // Монотонные часы PLC, не настенные часы
	uiEnvironment : UINT; // NORMAL=0, SIMULATION=1, SC500_BENCH=2
	Call : ST_GEOMETRY_CALL;
END_STRUCT
END_TYPE
