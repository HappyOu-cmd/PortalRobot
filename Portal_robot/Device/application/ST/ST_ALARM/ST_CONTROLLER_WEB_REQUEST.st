TYPE ST_CONTROLLER_WEB_REQUEST :
STRUCT
    udiSequence : UDINT; // Gateway записывает последним; payload неизменен до Ack.
    udiIssuedAtMs : UDINT; // Часы PLC, прочитанные перед передачей.
    xCpuValid : BOOL;
    xModulesValid : BOOL;
    dwCpuCurrent1 : DWORD;
    dwCpuCurrent2 : DWORD;
    dwModuleCurrent : DWORD;
    xMemoryCurrent : BOOL;
    dwCpuObserved1 : DWORD; // Причины, обнаруженные с прошлого подтверждения PLC.
    dwCpuObserved2 : DWORD;
    dwModuleObserved : DWORD;
    xMemoryObserved : BOOL;
END_STRUCT
END_TYPE
