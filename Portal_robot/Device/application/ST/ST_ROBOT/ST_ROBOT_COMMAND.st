TYPE ST_ROBOT_COMMAND :
STRUCT
	xExecute 			: BOOL;
	xStop               : BOOL;
    xReset   			: BOOL;
    eAction  			: E_ROBOT_ACTION;
	eSetPoint  	        : E_POINT_NAME;
END_STRUCT
END_TYPE
