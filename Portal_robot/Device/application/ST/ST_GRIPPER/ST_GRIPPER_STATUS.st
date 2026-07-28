TYPE ST_GRIPPER_STATUS  :
STRUCT
	xBusy            : BOOL;
    xDone            : BOOL;
    xError           : BOOL;
    dwError          : DWORD;

    xGripper1Open    : BOOL;
    xGripper1Closed  : BOOL;
    xGripper2Open    : BOOL;
    xGripper2Closed  : BOOL;

    xRotatedToBlank  : BOOL;
    xRotatedToDetail : BOOL;
END_STRUCT
END_TYPE
