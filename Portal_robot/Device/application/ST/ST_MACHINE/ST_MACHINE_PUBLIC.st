TYPE ST_MACHINE_PUBLIC :
STRUCT
	xProcessing       		: BOOL;
    xPartReady        		: BOOL;
    xServiceRequired  		: BOOL;
    xCanAcceptService 		: BOOL;
    xRobotReleased    		: BOOL;
	xDone                   : BOOL;
    xBusy             		: BOOL;
    xError            		: BOOL;
	xCriticalError          : BOOL;
	xAlarmError             : BOOL;
	xExternalError          : BOOL;
    xDoorOpen         		: BOOL;
    xAlarm            		: BOOL;
    eRecommendedOperation   : E_MACHINE_OPERATION;
    ePartState              : E_PART_STATE;
    eAbovePoint       		: E_POINT_NAME;
    lrAboveX          		: LREAL;
    tRemaining        		: TIME;
END_STRUCT
END_TYPE
