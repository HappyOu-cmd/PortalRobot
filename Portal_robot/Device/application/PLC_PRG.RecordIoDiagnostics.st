METHOD PRIVATE RecordIoDiagnostics

// --- BEGIN IMPLEMENTATION ---

// Seqlock закрывает весь снимок, включая упаковку масок после добавления событий.
GVL_HMI.udiIoJournalRevision := GVL_HMI.udiIoJournalRevision + UDINT#1;
xIoSnapshotPublishing := TRUE;

axIoOutput[1] := GVL_PHYSICAL_IO.xDoMachine1HatchClosed;
axIoOutput[2] := GVL_PHYSICAL_IO.xDoMachine1HatchUnLock;
axIoOutput[3] := GVL_PHYSICAL_IO.xDoMachine1ClampChuck;
axIoOutput[4] := GVL_PHYSICAL_IO.xDoMachine1UnclampChuck;
axIoOutput[5] := GVL_PHYSICAL_IO.xDoMachine1StartCycle;
axIoOutput[6] := GVL_PHYSICAL_IO.xDoMachine2HatchClosed;
axIoOutput[7] := GVL_PHYSICAL_IO.xDoMachine2HatchUnLock;
axIoOutput[8] := GVL_PHYSICAL_IO.xDoMachine2ClampChuck;
axIoOutput[9] := GVL_PHYSICAL_IO.xDoMachine2UnclampChuck;
axIoOutput[10] := GVL_PHYSICAL_IO.xDoMachine2StartCycle;
axIoOutput[11] := GVL_PHYSICAL_IO.xDoMachine3HatchClosed;
axIoOutput[12] := GVL_PHYSICAL_IO.xDoMachine3HatchUnLock;
axIoOutput[13] := GVL_PHYSICAL_IO.xDoMachine3ClampChuck;
axIoOutput[14] := GVL_PHYSICAL_IO.xDoMachine3UnclampChuck;
axIoOutput[15] := GVL_PHYSICAL_IO.xDoMachine3StartCycle;
axIoOutput[16] := GVL_PHYSICAL_IO.xDoGripper1Open;
axIoOutput[17] := GVL_PHYSICAL_IO.xDoGripper2Open;
axIoOutput[18] := GVL_PHYSICAL_IO.xDoRotateToDetail;
axIoOutput[19] := GVL_PHYSICAL_IO.xDoDoor1Unlock;
axIoOutput[27] := GVL_PHYSICAL_IO.xDoDoor1ButtonLamp;
axIoOutput[20] := GVL_PHYSICAL_IO.xDoDoor2Unlock;
axIoOutput[28] := GVL_PHYSICAL_IO.xDoDoor2ButtonLamp;
axIoOutput[21] := GVL_PHYSICAL_IO.xDoDoor3Unlock;
axIoOutput[29] := GVL_PHYSICAL_IO.xDoDoor3ButtonLamp;
axIoOutput[22] := GVL_PHYSICAL_IO.xDoDoor4Unlock;
axIoOutput[30] := GVL_PHYSICAL_IO.xDoDoor4ButtonLamp;
axIoOutput[23] := GVL_PHYSICAL_IO.xDoSafetyRelayReset;
axIoOutput[24] := GVL_PHYSICAL_IO.xDoSignalTowerGreenOutput;
axIoOutput[25] := GVL_PHYSICAL_IO.xDoSignalTowerAmberOutput;
axIoOutput[26] := GVL_PHYSICAL_IO.xDoSignalTowerRedOutput;
axIoOutput[31] := GVL_PHYSICAL_IO.xDoMagazine1LockIn;
axIoOutput[32] := GVL_PHYSICAL_IO.xDoMagazine1LockOut;
axIoOutput[33] := GVL_PHYSICAL_IO.xDoMagazine1StopIn;
axIoOutput[34] := GVL_PHYSICAL_IO.xDoMagazine1StopOut;
axIoOutput[35] := GVL_PHYSICAL_IO.xDoMagazine1LiftUp;
axIoOutput[36] := GVL_PHYSICAL_IO.xDoMagazine1LiftDown;
axIoOutput[43] := GVL_PHYSICAL_IO.xDoMagazine2LockIn;
axIoOutput[44] := GVL_PHYSICAL_IO.xDoMagazine2LockOut;
axIoOutput[45] := GVL_PHYSICAL_IO.xDoMagazine2StopIn;
axIoOutput[46] := GVL_PHYSICAL_IO.xDoMagazine2StopOut;
axIoOutput[47] := GVL_PHYSICAL_IO.xDoMagazine2LiftUp;
axIoOutput[48] := GVL_PHYSICAL_IO.xDoMagazine2LiftDown;
axIoOutput[37] := FALSE; // Удалённый сигнал; индекс журнала не переиспользовать.
axIoOutput[38] := FALSE; // Удалённый сигнал; индекс журнала не переиспользовать.
axIoOutput[39] := FALSE; // Удалённый сигнал; индекс журнала не переиспользовать.
axIoOutput[40] := GVL_PHYSICAL_IO.xDoCellAlarmHorn;
axIoOutput[41] := GVL_PHYSICAL_IO.xDoGk1DriveRun;
axIoOutput[42] := GVL_PHYSICAL_IO.xDoGk1DriveReset;
axIoOutput[49] := GVL_PHYSICAL_IO.xDoGk2DriveRun;
axIoOutput[50] := GVL_PHYSICAL_IO.xDoGk2DriveReset;
FOR uiIoIndex := UINT#1 TO UINT#80 DO
    axIoUsedDi[uiIoIndex] := axPhysicalFiltered[uiIoIndex];
END_FOR;
FOR uiIoIndex := UINT#81 TO UINT#84 DO
    axIoUsedDi[uiIoIndex] := xPhysicalNormal AND (GVL_PHYSICAL_IO.xMappingVerified OR axIoForced[uiIoIndex]) AND axPhysicalRaw[uiIoIndex];
END_FOR;
FOR uiIoIndex := UINT#1 TO UINT#84 DO
    IF xIoInitialized AND (axIoRawDi[uiIoIndex] <> axIoPreviousRaw[uiIoIndex]) THEN
        AppendIoEvent(usiDirection := USINT#1, uiIndex := uiIoIndex, usiKind := USINT#1,
            xOld := axIoPreviousRaw[uiIoIndex], xNew := axIoRawDi[uiIoIndex]);
    END_IF;
    IF xIoInitialized AND (axIoUsedDi[uiIoIndex] <> axIoPreviousUsed[uiIoIndex]) THEN
        AppendIoEvent(usiDirection := USINT#1, uiIndex := uiIoIndex, usiKind := USINT#2,
            xOld := axIoPreviousUsed[uiIoIndex], xNew := axIoUsedDi[uiIoIndex]);
    END_IF;
    axIoPreviousRaw[uiIoIndex] := axIoRawDi[uiIoIndex];
    axIoPreviousUsed[uiIoIndex] := axIoUsedDi[uiIoIndex];
END_FOR;
FOR uiIoIndex := UINT#1 TO UINT#50 DO
    IF xIoInitialized AND ((uiIoIndex < UINT#37) OR (uiIoIndex > UINT#39)) AND (axIoOutput[uiIoIndex] <> axIoPreviousOutput[uiIoIndex]) THEN
        AppendIoEvent(usiDirection := USINT#2, uiIndex := uiIoIndex, usiKind := USINT#3,
            xOld := axIoPreviousOutput[uiIoIndex], xNew := axIoOutput[uiIoIndex]);
    END_IF;
    axIoPreviousOutput[uiIoIndex] := axIoOutput[uiIoIndex];
END_FOR;
xIoInitialized := TRUE; // Первый снимок — начальный уровень, а не 131 выдуманное переключение.

FOR uiIoWord := UINT#1 TO UINT#3 DO
    GVL_HMI.adwIoRawDi[uiIoWord] := DWORD#0;
    GVL_HMI.adwIoUsedDi[uiIoWord] := DWORD#0;
    GVL_HMI.adwIoForcedDi[uiIoWord] := DWORD#0;
END_FOR;
FOR uiIoWord := UINT#1 TO UINT#2 DO
    GVL_HMI.adwIoDo[uiIoWord] := DWORD#0;
    GVL_HMI.adwIoDoAllowed[uiIoWord] := DWORD#0;
    GVL_HMI.adwIoDoOnAllowed[uiIoWord] := DWORD#0;
    GVL_HMI.adwIoForcedDo[uiIoWord] := DWORD#0;
    GVL_HMI.adwIoInhibitedDo[uiIoWord] := DWORD#0;
END_FOR;
GVL_HMI.uiIoForcedCount := UINT#0;
FOR uiIoIndex := UINT#1 TO UINT#84 DO
    uiIoWord := ((uiIoIndex - UINT#1) / UINT#32) + UINT#1;
    uiIoBit := (uiIoIndex - UINT#1) MOD UINT#32;
    dwIoBit := SHL(DWORD#1, uiIoBit);
    IF axIoRawDi[uiIoIndex] THEN GVL_HMI.adwIoRawDi[uiIoWord] := GVL_HMI.adwIoRawDi[uiIoWord] OR dwIoBit; END_IF;
    IF axIoUsedDi[uiIoIndex] THEN GVL_HMI.adwIoUsedDi[uiIoWord] := GVL_HMI.adwIoUsedDi[uiIoWord] OR dwIoBit; END_IF;
    IF axIoForced[uiIoIndex] THEN
        GVL_HMI.adwIoForcedDi[uiIoWord] := GVL_HMI.adwIoForcedDi[uiIoWord] OR dwIoBit;
        GVL_HMI.uiIoForcedCount := GVL_HMI.uiIoForcedCount + UINT#1;
    END_IF;
END_FOR;
FOR uiIoIndex := UINT#1 TO UINT#50 DO
    uiIoWord := ((uiIoIndex - UINT#1) / UINT#32) + UINT#1;
    uiIoBit := (uiIoIndex - UINT#1) MOD UINT#32;
    dwIoBit := SHL(DWORD#1, uiIoBit);
    IF axIoDoAllowed[uiIoIndex] THEN GVL_HMI.adwIoDoAllowed[uiIoWord] := GVL_HMI.adwIoDoAllowed[uiIoWord] OR dwIoBit; END_IF;
    IF axIoDoOnAllowed[uiIoIndex] THEN GVL_HMI.adwIoDoOnAllowed[uiIoWord] := GVL_HMI.adwIoDoOnAllowed[uiIoWord] OR dwIoBit; END_IF;
    IF axIoDoForced[uiIoIndex] THEN GVL_HMI.adwIoForcedDo[uiIoWord] := GVL_HMI.adwIoForcedDo[uiIoWord] OR dwIoBit; END_IF;
    IF axIoDoInhibited[uiIoIndex] THEN GVL_HMI.adwIoInhibitedDo[uiIoWord] := GVL_HMI.adwIoInhibitedDo[uiIoWord] OR dwIoBit; END_IF;
    IF axIoOutput[uiIoIndex] THEN GVL_HMI.adwIoDo[uiIoWord] := GVL_HMI.adwIoDo[uiIoWord] OR SHL(DWORD#1, uiIoBit); END_IF;
END_FOR;
xIoSnapshotPublishing := FALSE;
GVL_HMI.udiIoJournalRevision := GVL_HMI.udiIoJournalRevision + UDINT#1;
