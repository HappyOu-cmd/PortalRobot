TYPE ST_TWO_PALLET_CONFIG :
STRUCT
	xConfigured : BOOL; // Не выставляется автоматически; параметры проверены на механизме
	xP1LockOut : BOOL; // Legacy: используется только при переносе старой RETAIN-конфигурации
	lrExchange : LREAL;
	lrWorkP1 : LREAL;
	lrWorkP2 : LREAL;
	lrHome : LREAL;
	lrTolerance : LREAL;
	lrVelocity : LREAL;
	lrAcceleration : LREAL;
	lrDeceleration : LREAL;
	lrJerk : LREAL;
	tCylinder : TIME;
	tMove : TIME;
	tHome : TIME;
	tPulse : TIME;
	xSignalPatternsConfigured : BOOL;
	uiP1Signals : UINT; // Биты 0..5: LiftDown, LiftUp, LockIn, LockOut, StopIn, StopOut
	uiP2Signals : UINT; // Полные ожидаемые состояния шести герконов для П2 у робота
END_STRUCT
END_TYPE
