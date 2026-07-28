TYPE ST_MACHINE_RECIPE :
STRUCT
	eRobotAction	 : E_ROBOT_ACTION;
	eCommand	     : E_MACHINE_STATE;
	stPoint          : E_MACHINE_POINTS;
	xRetreatStarted  : BOOL;
	xRobotDone       : BOOL;
END_STRUCT
END_TYPE
