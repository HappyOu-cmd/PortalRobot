TYPE ST_CONTROLLER_WEB_STATUS :
STRUCT
    udiAckSeq : UDINT;
    dwCpuAlarm1 : DWORD;
    dwCpuAlarm2 : DWORD;
    dwModuleAlarm : DWORD;
    xMemoryWarning : BOOL;
    xCpuFresh : BOOL;
    xModulesFresh : BOOL;
    xAlarmActive : BOOL;
    xGlobalStopRequired : BOOL;
    xResetAllowed : BOOL;
    xWarningResetAllowed : BOOL;
END_STRUCT
END_TYPE
