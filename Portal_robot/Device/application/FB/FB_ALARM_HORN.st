FUNCTION_BLOCK FB_ALARM_HORN
VAR_INPUT
    astSource : ARRAY [1..22] OF ST_ALARM_SOURCE_DATA;
    tDuration : TIME := T#2S;
END_VAR
VAR_OUTPUT
    xSound : BOOL;
END_VAR
VAR
    adwPrevious : ARRAY [1..22] OF DWORD;
    uiSource : UINT;
    xNewAlarm : BOOL;
    xActive : BOOL;
    tLatchedDuration : TIME;
    tonSound : TON;
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Предупреждения не входят в dwAlarmActive. Новая авария другого источника/бита
// тоже запускает звук, даже когда общая xAlarmActive уже была TRUE.
xNewAlarm := FALSE;
FOR uiSource := 1 TO 22 DO
    IF (astSource[uiSource].dwAlarmActive AND NOT adwPrevious[uiSource]) <> DWORD#0 THEN
        xNewAlarm := TRUE;
    END_IF;
    adwPrevious[uiSource] := astSource[uiSource].dwAlarmActive;
END_FOR;
IF tDuration <= T#0MS THEN
    xActive := FALSE;
ELSIF xNewAlarm THEN
    xActive := TRUE;
    tLatchedDuration := tDuration;
    // Сброс и запуск TON в этом же скане: новая авария начинает полный интервал.
    tonSound(IN := FALSE, PT := tLatchedDuration);
END_IF;
tonSound(IN := xActive, PT := tLatchedDuration);
IF tonSound.Q THEN
    xActive := FALSE;
END_IF;
xSound := xActive;
