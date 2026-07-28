TYPE ST_MOTION_MANAGER_COMMAND :
STRUCT 
	eTargetPoint           :E_POINT_NAME;
	xGlobalError     : BOOL;
	xExecute         :BOOL;
	xReset           :BOOL;
	xMode            :BOOL;
END_STRUCT
END_TYPE
