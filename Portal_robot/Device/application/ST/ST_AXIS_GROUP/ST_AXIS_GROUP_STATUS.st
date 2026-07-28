TYPE ST_AXIS_GROUP_STATUS :
STRUCT
	xLocalError          : BOOL;
	xLogicalError        : BOOL;
	xGroupError          : BOOL;
	xMoveDirectDone      : BOOL;
	ActualX              : LREAL;
	ActualY              : LREAL;
	ActualZ              : LREAL;
	
END_STRUCT
END_TYPE
