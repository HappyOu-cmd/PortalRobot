FUNCTION_BLOCK FB_CONTROLLER_DIAGNOSTICS
VAR_INPUT
    Request : ST_CONTROLLER_WEB_REQUEST;
    udiNowMs : UDINT;
    xReset : BOOL;
    xResetWarnings : BOOL;
END_VAR
VAR_OUTPUT
    Status : ST_CONTROLLER_WEB_STATUS;
    stWarning : ST_WARNING_EVENT;
END_VAR
VAR
    uliAgeMs : ULINT;
    udiLastFrameAtMs : UDINT;
    xFrameAccepted : BOOL;
    xHaveFreshFrame : BOOL;
    xCpuValid : BOOL;
    xModulesValid : BOOL;
    dwCpuCurrent1 : DWORD;
    dwCpuCurrent2 : DWORD;
    dwModuleCurrent : DWORD;
    xMemoryCurrent : BOOL;
    dwNext1 : DWORD;
    dwNext2 : DWORD;
    dwNextModule : DWORD;
    xNewAlarm : BOOL;
    xNewMemory : BOOL;
    xCausesGone : BOOL;
END_VAR

// --- BEGIN IMPLEMENTATION ---

xFrameAccepted := FALSE;
xNewAlarm := FALSE;
xNewMemory := FALSE;
IF (Request.udiSequence <> UDINT#0) AND (Request.udiSequence <> Status.udiAckSeq) THEN
    // История обнаружений доставляется и после STOP; свежесть текущей нормы
    // проверяется отдельно и не следует из одного факта получения пакета.
    dwNext1 := Status.dwCpuAlarm1 OR Request.dwCpuObserved1 OR Request.dwCpuCurrent1;
    dwNext2 := Status.dwCpuAlarm2 OR Request.dwCpuObserved2 OR Request.dwCpuCurrent2;
    dwNextModule := Status.dwModuleAlarm OR Request.dwModuleObserved OR Request.dwModuleCurrent;
    xNewAlarm := (dwNext1 <> Status.dwCpuAlarm1) OR (dwNext2 <> Status.dwCpuAlarm2)
        OR (dwNextModule <> Status.dwModuleAlarm);
    Status.dwCpuAlarm1 := dwNext1;
    Status.dwCpuAlarm2 := dwNext2;
    Status.dwModuleAlarm := dwNextModule;
    xNewMemory := NOT Status.xMemoryWarning AND (Request.xMemoryObserved OR Request.xMemoryCurrent);
    IF xNewMemory THEN
        Status.xMemoryWarning := TRUE;
        stWarning.uiCode := UINT#1;
        stWarning.udiSequence := stWarning.udiSequence + UDINT#1;
        IF stWarning.udiSequence = UDINT#0 THEN stWarning.udiSequence := UDINT#1; END_IF;
    END_IF;

    IF udiNowMs >= Request.udiIssuedAtMs THEN
        uliAgeMs := UDINT_TO_ULINT(udiNowMs) - UDINT_TO_ULINT(Request.udiIssuedAtMs);
    ELSE
        uliAgeMs := ULINT#4294967296 + UDINT_TO_ULINT(udiNowMs) - UDINT_TO_ULINT(Request.udiIssuedAtMs);
    END_IF;
    xFrameAccepted := uliAgeMs <= ULINT#3000;
    xHaveFreshFrame := xFrameAccepted;
    IF xFrameAccepted THEN udiLastFrameAtMs := Request.udiIssuedAtMs; END_IF;
    xCpuValid := xFrameAccepted AND Request.xCpuValid;
    xModulesValid := xFrameAccepted AND Request.xModulesValid;
    dwCpuCurrent1 := Request.dwCpuCurrent1;
    dwCpuCurrent2 := Request.dwCpuCurrent2;
    dwModuleCurrent := Request.dwModuleCurrent;
    xMemoryCurrent := Request.xMemoryCurrent;
    Status.udiAckSeq := Request.udiSequence;
END_IF;

// Абсолютный возраст проверяется и в первом скане после STOP/паузы задачи.
IF udiNowMs >= udiLastFrameAtMs THEN
    uliAgeMs := UDINT_TO_ULINT(udiNowMs) - UDINT_TO_ULINT(udiLastFrameAtMs);
ELSE
    uliAgeMs := ULINT#4294967296 + UDINT_TO_ULINT(udiNowMs) - UDINT_TO_ULINT(udiLastFrameAtMs);
END_IF;
Status.xCpuFresh := xHaveFreshFrame AND (uliAgeMs <= ULINT#12000) AND xCpuValid;
Status.xModulesFresh := xHaveFreshFrame AND (uliAgeMs <= ULINT#12000) AND xModulesValid;
Status.xAlarmActive := (Status.dwCpuAlarm1 <> DWORD#0) OR (Status.dwCpuAlarm2 <> DWORD#0)
    OR (Status.dwModuleAlarm <> DWORD#0);
xCausesGone := (((Status.dwCpuAlarm1 = DWORD#0) AND (Status.dwCpuAlarm2 = DWORD#0))
        OR (Status.xCpuFresh AND (dwCpuCurrent1 = DWORD#0) AND (dwCpuCurrent2 = DWORD#0)))
    AND ((Status.dwModuleAlarm = DWORD#0) OR (Status.xModulesFresh AND (dwModuleCurrent = DWORD#0)));
Status.xResetAllowed := Status.xAlarmActive AND xCausesGone AND NOT xNewAlarm;
IF xReset AND Status.xResetAllowed THEN
    Status.dwCpuAlarm1 := DWORD#0;
    Status.dwCpuAlarm2 := DWORD#0;
    Status.dwModuleAlarm := DWORD#0;
    Status.xAlarmActive := FALSE;
    Status.xResetAllowed := FALSE;
END_IF;
Status.xWarningResetAllowed := Status.xMemoryWarning AND Status.xCpuFresh
    AND NOT xMemoryCurrent AND NOT xNewMemory;
IF xResetWarnings AND Status.xWarningResetAllowed THEN
    Status.xMemoryWarning := FALSE;
    Status.xWarningResetAllowed := FALSE;
END_IF;

// После подтверждённого исчезновения причин снимается вход зависимого Stop,
// чтобы владельцы разрешили общий Reset. Защёлки и запрет Auto остаются до Reset.
Status.xGlobalStopRequired := Status.xAlarmActive AND (NOT xCausesGone OR xNewAlarm);
