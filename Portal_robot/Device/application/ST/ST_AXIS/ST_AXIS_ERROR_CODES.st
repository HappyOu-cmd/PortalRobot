TYPE ST_AXIS_ERROR_CODES :
STRUCT
    dwAxisErrorActual    : DWORD;
    dwAxisErrorLatched   : DWORD;
    dwAxisError          : DWORD;
    dwDriveAxisErrorID   : DWORD;
    dwLogicalErrorLatched: DWORD;
    dwLogicalError       : DWORD;
    dwWarningLatched     : DWORD;
    dwWarning            : DWORD;
    dwAllError           : DWORD;   // опционально, можно вычислять
END_STRUCT
END_TYPE