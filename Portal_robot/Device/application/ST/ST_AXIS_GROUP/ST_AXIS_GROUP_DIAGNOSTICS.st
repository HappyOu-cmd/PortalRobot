TYPE ST_AXIS_GROUP_DIAGNOSTICS :
STRUCT
	iStep                : E_AXIS_GROUP_STATE;
	iOldStep             : E_AXIS_GROUP_STATE;
	iNewStep             : E_AXIS_GROUP_STATE;
	iPowerMode           : E_AXIS_GROUP_POWER_MODE;
    iLastErrorStep       : INT;
    sStepName            : STRING[80];
    sWaitReason          : STRING[120];
    sErrorText           : STRING[120];
    sWarningText         : STRING[120];
    tStepPreset          : TIME;
    xStepTimeout         : BOOL;
	xStepChanged         : BOOL;
    udiActualErrorID     : UDINT;
    udiLastErrorID       : UDINT;
	dwError              : ST_AXIS_GROUP_ERRORS;
	
	
END_STRUCT
END_TYPE
