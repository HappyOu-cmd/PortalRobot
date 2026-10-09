METHOD PRIVATE AppendIoEvent
VAR_INPUT
    usiDirection : USINT;
    uiIndex : UINT;
    usiKind : USINT;
    xOld : BOOL;
    xNew : BOOL;
END_VAR
VAR
    uiSlot : UINT;
    sEvent : STRING(96);
END_VAR

// --- BEGIN IMPLEMENTATION ---

IF NOT xIoSnapshotPublishing THEN
    GVL_HMI.udiIoJournalRevision := GVL_HMI.udiIoJournalRevision + UDINT#1;
END_IF;
// Переполнение Seq открывает новый FIFO; идентификаторы не повторяются внутри эпохи.
IF GVL_HMI.udiIoJournalSequence = UDINT#4294967295 THEN
    GVL_HMI.udiIoBootCounter := GVL_HMI.udiIoBootCounter + UDINT#1;
    IF GVL_HMI.udiIoBootCounter = UDINT#0 THEN GVL_HMI.udiIoBootCounter := UDINT#1; END_IF;
    GVL_HMI.udiIoJournalSequence := UDINT#0;
    GVL_HMI.uiIoJournalHead := UINT#0;
    GVL_HMI.uiIoJournalCount := UINT#0;
END_IF;
uiSlot := (GVL_HMI.uiIoJournalHead MOD UINT#100) + UINT#1;
GVL_HMI.udiIoJournalSequence := GVL_HMI.udiIoJournalSequence + UDINT#1;
astIoEvent[uiSlot].udiSequence := GVL_HMI.udiIoJournalSequence;
astIoEvent[uiSlot].uliTimeMs := uliIoClockMs;
astIoEvent[uiSlot].usiDirection := usiDirection;
astIoEvent[uiSlot].uiIndex := uiIndex;
astIoEvent[uiSlot].usiKind := usiKind;
astIoEvent[uiSlot].xOld := xOld;
astIoEvent[uiSlot].xNew := xNew;
// Строка кодируется только для изменившегося слота, не для всего FIFO на каждом скане.
sEvent := CONCAT(UDINT_TO_STRING(GVL_HMI.udiIoJournalSequence), ';');
sEvent := CONCAT(sEvent, ULINT_TO_STRING(uliIoClockMs));
sEvent := CONCAT(sEvent, ';'); sEvent := CONCAT(sEvent, USINT_TO_STRING(usiDirection));
sEvent := CONCAT(sEvent, ';'); sEvent := CONCAT(sEvent, UINT_TO_STRING(uiIndex));
sEvent := CONCAT(sEvent, ';'); sEvent := CONCAT(sEvent, USINT_TO_STRING(usiKind));
sEvent := CONCAT(sEvent, ';'); sEvent := CONCAT(sEvent, USINT_TO_STRING(BOOL_TO_USINT(xOld)));
sEvent := CONCAT(sEvent, ';'); sEvent := CONCAT(sEvent, USINT_TO_STRING(BOOL_TO_USINT(xNew)));
GVL_HMI.asIoJournal[uiSlot] := sEvent;
GVL_HMI.uiIoJournalHead := uiSlot;
GVL_HMI.uiIoJournalCount := MIN(UINT#100, GVL_HMI.uiIoJournalCount + UINT#1);
IF NOT xIoSnapshotPublishing THEN
    GVL_HMI.udiIoJournalRevision := GVL_HMI.udiIoJournalRevision + UDINT#1;
END_IF;
