TYPE ST_AXIS_GROUP_MOTION_PARAMS :
STRUCT
	stTargetPos : SMC_POS_REF;
	lrX         : LREAL := 1000;
	lrY         : LREAL := 1000;
	lrZ         : LREAL := 1000;
	VelFactor   : LREAL := 0.1;
	AccFactor   : LREAL := 0.1;
	JerkFactor  : LREAL := 0.1; 
	HaltDeceleration : LREAL := 1000;
	HaltJerk         : LREAL := 10000; 
END_STRUCT
END_TYPE
