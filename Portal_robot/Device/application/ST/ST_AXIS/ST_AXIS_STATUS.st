TYPE ST_AXIS_STATUS :
STRUCT
    xPowered             : BOOL;
    xBusy                : BOOL;
    xDone                : BOOL;
    xError               : BOOL;
    xHomed               : BOOL;
    xLocalError          : BOOL;
    xMotionBusy          : BOOL;
    xCanStartMotion      : BOOL;
    xAxisError           : BOOL;
    xLogicalError        : BOOL;
    xWarning             : BOOL;
    xAxisResetNeeded     : BOOL;
    xLogicalResetNeeded  : BOOL;
	lrActualPosition     : REAL;
END_STRUCT
END_TYPE