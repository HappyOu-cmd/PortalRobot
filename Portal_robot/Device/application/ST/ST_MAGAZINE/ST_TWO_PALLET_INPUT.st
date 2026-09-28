TYPE ST_TWO_PALLET_INPUT :
STRUCT
	xIoMapped : BOOL; // Подтверждается наладчиком после привязки и проверки физических I/O
	xLiftDown : BOOL;
	xLiftUp : BOOL;
	xLockIn : BOOL;
	xLockOut : BOOL;
	xStopIn : BOOL;
	xStopOut : BOOL;
	xLimitNegative : BOOL;
	xLimitPositive : BOOL;
	xHomeSensor : BOOL; // Только датчик каретки, не палет
	xAxisBound : BOOL;
	xPowered : BOOL;
	xHomed : BOOL;
	xStandstill : BOOL;
	xDriveError : BOOL;
	xMotionDone : BOOL;
	lrPosition : LREAL;
END_STRUCT
END_TYPE
