TYPE ST_AXIS_COMMANDS :
STRUCT
    xEnable              : BOOL;
    xDisable             : BOOL;
	xGlobalError         : BOOL;
	xPowerPermit         : BOOL;
    xResetAllError       : BOOL;
    xResetAxisError      : BOOL;
    xResetLogicalError   : BOOL;
    xStop                : BOOL;
    xHome                : BOOL;
    xMoveAbsolute        : BOOL;
    xMoveRelative        : BOOL;
    xJogPositive         : BOOL;
    xJogNegative         : BOOL;
END_STRUCT
END_TYPE