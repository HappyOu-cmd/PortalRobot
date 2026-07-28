TYPE ST_AXIS_GROUP_TIMEOUTS :
STRUCT
    tPowerTimeout        : TIME := T#5S;
	tGroupTimeout       : TIME := T#5S;
    tStopTimeout         : TIME := T#5S;
	tHaltTimeout         : TIME := T#5S;
    tHomeTimeout         : TIME := T#30S;
    tMoveTimeout         : TIME := T#30S;
END_STRUCT
END_TYPE
