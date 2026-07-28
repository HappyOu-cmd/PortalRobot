TYPE ST_ROBOT_STATUS :
STRUCT
	xBusy  		  		: BOOL;
    xDone  		  		: BOOL;
    xError 		  		: BOOL;
	eCurrentPoint   	: E_POINT_NAME;
	dwError             : DWORD;
	xBlankAvailable 	: BOOL;
	xDetailAvailable    : BOOL;
	xGripper1Open    	: BOOL;
    xGripper1Closed  	: BOOL;
    xGripper2Open    	: BOOL;
    xGripper2Closed  	: BOOL;
    xRotatedToBlank  	: BOOL;
    xRotatedToDetail 	: BOOL;
END_STRUCT
END_TYPE
