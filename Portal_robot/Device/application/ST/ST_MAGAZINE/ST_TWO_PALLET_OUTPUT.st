TYPE ST_TWO_PALLET_OUTPUT :
STRUCT
	xLiftUp : BOOL;
	xLiftDown : BOOL;
	xLockOut : BOOL;
	xLockIn : BOOL;
	xStopOut : BOOL;
	xStopIn : BOOL;
	xPowerOn : BOOL;
	xPowerOff : BOOL;
	xDriveReset : BOOL;
	xHome : BOOL;
	xMove : BOOL;
	xStop : BOOL;
	xJogPositive : BOOL;
	xJogNegative : BOOL;
	xTeachOperator : BOOL;
	xTeachWork : BOOL;
	lrTarget : LREAL;
END_STRUCT
END_TYPE
