TYPE ST_AXIS_TIMEOUTS :
STRUCT
	xDisableOnError      : BOOL := TRUE; //Отключение привода при логической ошибке
    tPowerTimeout        : TIME := T#5S;
    tResetTimeout        : TIME := T#5S;
    tStopTimeout         : TIME := T#5S;
    tHomeTimeout         : TIME := T#30S;
    tMoveTimeout         : TIME := T#15S;
END_STRUCT
END_TYPE