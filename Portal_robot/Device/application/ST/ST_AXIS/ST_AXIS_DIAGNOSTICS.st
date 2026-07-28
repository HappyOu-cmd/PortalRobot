TYPE ST_AXIS_DIAGNOSTICS :
STRUCT
    iStep                : E_AXIS_STATE;
    iLastErrorStep       : INT;
    sStepName            : STRING[80];
    sWaitReason          : STRING[120];
    sErrorText           : STRING[120];
    sWarningText         : STRING[120];
    tStepElapsed         : TIME;
    tStepPreset          : TIME;
    xStepTimeout         : BOOL;
    udiActualErrorID     : UDINT;
    udiLastErrorID       : UDINT;
END_STRUCT
END_TYPE