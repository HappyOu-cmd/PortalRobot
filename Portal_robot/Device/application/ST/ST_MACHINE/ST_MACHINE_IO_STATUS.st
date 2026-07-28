TYPE ST_MACHINE_IO_STATUS :
STRUCT
	xReady          : BOOL;
    xAlarm          : BOOL;
    xDoorOpen       : BOOL;
    xDoorClosed     : BOOL;
    xChuckClamped   : BOOL;
    xChuckUnclamped : BOOL;
    xCycleActive    : BOOL;
    xCycleDone      : BOOL;
    tRemaining      : TIME;
END_STRUCT
END_TYPE
