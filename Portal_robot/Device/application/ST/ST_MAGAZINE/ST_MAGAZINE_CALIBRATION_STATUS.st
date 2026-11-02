TYPE ST_MAGAZINE_CALIBRATION_STATUS :
STRUCT
	uiMethod : UINT := UINT#1;
	xChangeAllowed : BOOL;
	xCaptureAllowed : BOOL;
	xSaveAllowed : BOOL;
	xReferenceCaptureAllowed : BOOL;
	xReferenceSaveAllowed : BOOL;
	xMoveAAllowed : BOOL;
	xMoveBAllowed : BOOL;
	xMoveCAllowed : BOOL;
	xReady : BOOL;
	uiReason : UINT;
	astPoints : ARRAY [1..3] OF ST_POINT; // Согласованная публикация A/B/C вместе с методом для экспорта
END_STRUCT
END_TYPE
