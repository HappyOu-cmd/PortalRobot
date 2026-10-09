METHOD PRIVATE ApplyIoOutputOverrides

// --- BEGIN IMPLEMENTATION ---

// Прямой ручной режим владеет всеми DO. Штатные уровни остаются отдельно для возврата программе.
axIoAutoDo[1] := GVL_PHYSICAL_IO.xDoMachine1HatchClosed;
axIoAutoDo[2] := GVL_PHYSICAL_IO.xDoMachine1HatchUnLock;
axIoAutoDo[3] := GVL_PHYSICAL_IO.xDoMachine1ClampChuck;
axIoAutoDo[4] := GVL_PHYSICAL_IO.xDoMachine1UnclampChuck;
axIoAutoDo[5] := GVL_PHYSICAL_IO.xDoMachine1StartCycle;
axIoAutoDo[6] := GVL_PHYSICAL_IO.xDoMachine2HatchClosed;
axIoAutoDo[7] := GVL_PHYSICAL_IO.xDoMachine2HatchUnLock;
axIoAutoDo[8] := GVL_PHYSICAL_IO.xDoMachine2ClampChuck;
axIoAutoDo[9] := GVL_PHYSICAL_IO.xDoMachine2UnclampChuck;
axIoAutoDo[10] := GVL_PHYSICAL_IO.xDoMachine2StartCycle;
axIoAutoDo[11] := GVL_PHYSICAL_IO.xDoMachine3HatchClosed;
axIoAutoDo[12] := GVL_PHYSICAL_IO.xDoMachine3HatchUnLock;
axIoAutoDo[13] := GVL_PHYSICAL_IO.xDoMachine3ClampChuck;
axIoAutoDo[14] := GVL_PHYSICAL_IO.xDoMachine3UnclampChuck;
axIoAutoDo[15] := GVL_PHYSICAL_IO.xDoMachine3StartCycle;
axIoAutoDo[16] := GVL_PHYSICAL_IO.xDoGripper1Open;
axIoAutoDo[17] := GVL_PHYSICAL_IO.xDoGripper2Open;
axIoAutoDo[18] := GVL_PHYSICAL_IO.xDoRotateToDetail;
axIoAutoDo[19] := GVL_PHYSICAL_IO.xDoDoor1Unlock;
axIoAutoDo[20] := GVL_PHYSICAL_IO.xDoDoor2Unlock;
axIoAutoDo[21] := GVL_PHYSICAL_IO.xDoDoor3Unlock;
axIoAutoDo[22] := GVL_PHYSICAL_IO.xDoDoor4Unlock;
axIoAutoDo[23] := GVL_PHYSICAL_IO.xDoSafetyRelayReset;
axIoAutoDo[24] := GVL_PHYSICAL_IO.xDoSignalTowerGreenOutput;
axIoAutoDo[25] := GVL_PHYSICAL_IO.xDoSignalTowerAmberOutput;
axIoAutoDo[26] := GVL_PHYSICAL_IO.xDoSignalTowerRedOutput;
axIoAutoDo[27] := GVL_PHYSICAL_IO.xDoDoor1ButtonLamp;
axIoAutoDo[28] := GVL_PHYSICAL_IO.xDoDoor2ButtonLamp;
axIoAutoDo[29] := GVL_PHYSICAL_IO.xDoDoor3ButtonLamp;
axIoAutoDo[30] := GVL_PHYSICAL_IO.xDoDoor4ButtonLamp;
axIoAutoDo[31] := GVL_PHYSICAL_IO.xDoMagazine1LockIn;
axIoAutoDo[32] := GVL_PHYSICAL_IO.xDoMagazine1LockOut;
axIoAutoDo[33] := GVL_PHYSICAL_IO.xDoMagazine1StopIn;
axIoAutoDo[34] := GVL_PHYSICAL_IO.xDoMagazine1StopOut;
axIoAutoDo[35] := GVL_PHYSICAL_IO.xDoMagazine1LiftUp;
axIoAutoDo[36] := GVL_PHYSICAL_IO.xDoMagazine1LiftDown;
axIoAutoDo[37] := FALSE; // Удалённый сигнал; индекс журнала не переиспользовать.
axIoAutoDo[38] := FALSE; // Удалённый сигнал; индекс журнала не переиспользовать.
axIoAutoDo[39] := FALSE; // Удалённый сигнал; индекс журнала не переиспользовать.
axIoAutoDo[40] := GVL_PHYSICAL_IO.xDoCellAlarmHorn;
axIoAutoDo[41] := GVL_PHYSICAL_IO.xDoGk1DriveRun;
axIoAutoDo[42] := GVL_PHYSICAL_IO.xDoGk1DriveReset;
axIoAutoDo[43] := GVL_PHYSICAL_IO.xDoMagazine2LockIn;
axIoAutoDo[44] := GVL_PHYSICAL_IO.xDoMagazine2LockOut;
axIoAutoDo[45] := GVL_PHYSICAL_IO.xDoMagazine2StopIn;
axIoAutoDo[46] := GVL_PHYSICAL_IO.xDoMagazine2StopOut;
axIoAutoDo[47] := GVL_PHYSICAL_IO.xDoMagazine2LiftUp;
axIoAutoDo[48] := GVL_PHYSICAL_IO.xDoMagazine2LiftDown;
axIoAutoDo[49] := GVL_PHYSICAL_IO.xDoGk2DriveRun;
axIoAutoDo[50] := GVL_PHYSICAL_IO.xDoGk2DriveReset;
IF xIoManualActive AND NOT GVL_CELL_CONTROL.xManual THEN xIoManualActive := FALSE; END_IF;
GVL_HMI.xIoManualControlActive := xIoManualActive;
GVL_HMI.xIoDoOverrideAllowed := xIoManualActive AND GVL_CELL_CONTROL.xManual;
GVL_HMI.uiIoDoBlockReason := GVL_HMI.uiIoOverrideBlockReason;
IF GVL_HMI.xIoDoOverrideAllowed THEN GVL_HMI.uiIoDoBlockReason := UINT#0; END_IF;

FOR uiIoIndex := UINT#1 TO UINT#50 DO
    // 37..39 удалены из каталога; остальные индексы сохраняют смысл старых событий.
    IF (uiIoIndex >= UINT#37) AND (uiIoIndex <= UINT#39) THEN
        axIoDoForced[uiIoIndex] := FALSE;
        axIoDoForceValue[uiIoIndex] := FALSE;
    END_IF;
    axIoDoAllowed[uiIoIndex] := GVL_HMI.xIoDoOverrideAllowed AND ((uiIoIndex < UINT#37) OR (uiIoIndex > UINT#39));
    axIoDoOnAllowed[uiIoIndex] := axIoDoAllowed[uiIoIndex]; // Совместимость транспорта: включение и отключение равноправны.
    axIoDoInhibited[uiIoIndex] := FALSE; // Старый механизм блокировки снят.
    IF NOT xIoManualActive AND axIoDoForced[uiIoIndex] THEN
        IF xIoManualEndedByOperator THEN
            AppendIoEvent(usiDirection := USINT#2, uiIndex := uiIoIndex, usiKind := USINT#8,
                xOld := axIoDoForceValue[uiIoIndex], xNew := axIoAutoDo[uiIoIndex]);
        ELSE
            AppendIoEvent(usiDirection := USINT#2, uiIndex := uiIoIndex, usiKind := USINT#9,
                xOld := axIoDoForceValue[uiIoIndex], xNew := axIoAutoDo[uiIoIndex]);
        END_IF;
        axIoDoForced[uiIoIndex] := FALSE;
    END_IF;
END_FOR;

xIoDoRejected := FALSE;
udiIoRequestSeq := GVL_HMI.udiIoOverrideCommandSeq;
uiIoRequestAction := GVL_HMI.uiIoOverrideAction;
uiIoRequestIndex := GVL_HMI.uiIoOverrideIndex;
xIoRequestValue := GVL_HMI.xIoOverrideValue;
IF (udiIoRequestSeq <> GVL_HMI.udiIoOverrideAckSeq) AND (uiIoRequestAction >= UINT#4) AND (uiIoRequestAction <= UINT#9) THEN
    IF uiIoRequestAction <= UINT#6 THEN
        GVL_HMI.uiIoOverrideResult := UINT#3;
        IF NOT IsHmiCommandFresh(udiIssuedAtMs := GVL_HMI.udiIoOverrideIssuedAtMs) THEN
            GVL_HMI.uiIoOverrideResult := UINT#4;
        ELSIF uiIoRequestAction = UINT#6 THEN
            FOR uiIoIndex := UINT#1 TO UINT#50 DO
                IF axIoDoForced[uiIoIndex] THEN
                    AppendIoEvent(usiDirection := USINT#2, uiIndex := uiIoIndex, usiKind := USINT#8,
                        xOld := axIoDoForceValue[uiIoIndex], xNew := axIoAutoDo[uiIoIndex]);
                END_IF;
                axIoDoForceValue[uiIoIndex] := axIoAutoDo[uiIoIndex];
                axIoDoForced[uiIoIndex] := FALSE;
            END_FOR;
            GVL_HMI.uiIoOverrideResult := UINT#1;
        ELSIF (uiIoRequestIndex >= UINT#1) AND (uiIoRequestIndex <= UINT#50) AND ((uiIoRequestIndex < UINT#37) OR (uiIoRequestIndex > UINT#39)) THEN
            IF uiIoRequestAction = UINT#5 THEN
                IF axIoDoForced[uiIoRequestIndex] THEN
                    AppendIoEvent(usiDirection := USINT#2, uiIndex := uiIoRequestIndex, usiKind := USINT#8,
                        xOld := axIoDoForceValue[uiIoRequestIndex], xNew := axIoAutoDo[uiIoRequestIndex]);
                END_IF;
                axIoDoForceValue[uiIoRequestIndex] := axIoAutoDo[uiIoRequestIndex];
                axIoDoForced[uiIoRequestIndex] := FALSE;
                GVL_HMI.uiIoOverrideResult := UINT#1;
            ELSIF GVL_HMI.xIoDoOverrideAllowed THEN
                IF NOT axIoDoForced[uiIoRequestIndex] OR (axIoDoForceValue[uiIoRequestIndex] <> xIoRequestValue) THEN
                    AppendIoEvent(usiDirection := USINT#2, uiIndex := uiIoRequestIndex, usiKind := USINT#7,
                        xOld := axIoOutput[uiIoRequestIndex], xNew := xIoRequestValue);
                END_IF;
                axIoDoForced[uiIoRequestIndex] := TRUE;
                axIoDoForceValue[uiIoRequestIndex] := xIoRequestValue;
                IF (uiIoRequestIndex >= UINT#31) AND (uiIoRequestIndex <= UINT#36) THEN axIoMagazineInvalidated[1] := TRUE;
                ELSIF (uiIoRequestIndex >= UINT#43) AND (uiIoRequestIndex <= UINT#48) THEN axIoMagazineInvalidated[2] := TRUE;
                END_IF;
                GVL_HMI.uiIoOverrideResult := UINT#1;
            ELSE
                GVL_HMI.uiIoOverrideResult := UINT#2;
            END_IF;
        END_IF;
    END_IF;
    xIoDoRejected := GVL_HMI.uiIoOverrideResult <> UINT#1;
    GVL_HMI.udiIoOverrideAckSeq := udiIoRequestSeq;
END_IF;

// Намеренно без Safety, пар катушек, режима Modbus, импульсных ограничений и технологических FB.
IF xIoManualActive THEN
    GVL_PHYSICAL_IO.xDoMachine1HatchClosed := axIoDoForceValue[1];
    GVL_PHYSICAL_IO.xDoMachine1HatchUnLock := axIoDoForceValue[2];
    GVL_PHYSICAL_IO.xDoMachine1ClampChuck := axIoDoForceValue[3];
    GVL_PHYSICAL_IO.xDoMachine1UnclampChuck := axIoDoForceValue[4];
    GVL_PHYSICAL_IO.xDoMachine1StartCycle := axIoDoForceValue[5];
    GVL_PHYSICAL_IO.xDoMachine2HatchClosed := axIoDoForceValue[6];
    GVL_PHYSICAL_IO.xDoMachine2HatchUnLock := axIoDoForceValue[7];
    GVL_PHYSICAL_IO.xDoMachine2ClampChuck := axIoDoForceValue[8];
    GVL_PHYSICAL_IO.xDoMachine2UnclampChuck := axIoDoForceValue[9];
    GVL_PHYSICAL_IO.xDoMachine2StartCycle := axIoDoForceValue[10];
    GVL_PHYSICAL_IO.xDoMachine3HatchClosed := axIoDoForceValue[11];
    GVL_PHYSICAL_IO.xDoMachine3HatchUnLock := axIoDoForceValue[12];
    GVL_PHYSICAL_IO.xDoMachine3ClampChuck := axIoDoForceValue[13];
    GVL_PHYSICAL_IO.xDoMachine3UnclampChuck := axIoDoForceValue[14];
    GVL_PHYSICAL_IO.xDoMachine3StartCycle := axIoDoForceValue[15];
    GVL_PHYSICAL_IO.xDoGripper1Open := axIoDoForceValue[16];
    GVL_PHYSICAL_IO.xDoGripper2Open := axIoDoForceValue[17];
    GVL_PHYSICAL_IO.xDoRotateToDetail := axIoDoForceValue[18];
    GVL_PHYSICAL_IO.xDoDoor1Unlock := axIoDoForceValue[19];
    GVL_PHYSICAL_IO.xDoDoor2Unlock := axIoDoForceValue[20];
    GVL_PHYSICAL_IO.xDoDoor3Unlock := axIoDoForceValue[21];
    GVL_PHYSICAL_IO.xDoDoor4Unlock := axIoDoForceValue[22];
    GVL_PHYSICAL_IO.xDoSafetyRelayReset := axIoDoForceValue[23];
    GVL_PHYSICAL_IO.xDoSignalTowerGreenOutput := axIoDoForceValue[24];
    GVL_PHYSICAL_IO.xDoSignalTowerAmberOutput := axIoDoForceValue[25];
    GVL_PHYSICAL_IO.xDoSignalTowerRedOutput := axIoDoForceValue[26];
    GVL_PHYSICAL_IO.xDoDoor1ButtonLamp := axIoDoForceValue[27];
    GVL_PHYSICAL_IO.xDoDoor2ButtonLamp := axIoDoForceValue[28];
    GVL_PHYSICAL_IO.xDoDoor3ButtonLamp := axIoDoForceValue[29];
    GVL_PHYSICAL_IO.xDoDoor4ButtonLamp := axIoDoForceValue[30];
    GVL_PHYSICAL_IO.xDoMagazine1LockIn := axIoDoForceValue[31];
    GVL_PHYSICAL_IO.xDoMagazine1LockOut := axIoDoForceValue[32];
    GVL_PHYSICAL_IO.xDoMagazine1StopIn := axIoDoForceValue[33];
    GVL_PHYSICAL_IO.xDoMagazine1StopOut := axIoDoForceValue[34];
    GVL_PHYSICAL_IO.xDoMagazine1LiftUp := axIoDoForceValue[35];
    GVL_PHYSICAL_IO.xDoMagazine1LiftDown := axIoDoForceValue[36];
    GVL_PHYSICAL_IO.xDoCellAlarmHorn := axIoDoForceValue[40];
    GVL_PHYSICAL_IO.xDoGk1DriveRun := axIoDoForceValue[41];
    GVL_PHYSICAL_IO.xDoGk1DriveReset := axIoDoForceValue[42];
    GVL_PHYSICAL_IO.xDoMagazine2LockIn := axIoDoForceValue[43];
    GVL_PHYSICAL_IO.xDoMagazine2LockOut := axIoDoForceValue[44];
    GVL_PHYSICAL_IO.xDoMagazine2StopIn := axIoDoForceValue[45];
    GVL_PHYSICAL_IO.xDoMagazine2StopOut := axIoDoForceValue[46];
    GVL_PHYSICAL_IO.xDoMagazine2LiftUp := axIoDoForceValue[47];
    GVL_PHYSICAL_IO.xDoMagazine2LiftDown := axIoDoForceValue[48];
    GVL_PHYSICAL_IO.xDoGk2DriveRun := axIoDoForceValue[49];
    GVL_PHYSICAL_IO.xDoGk2DriveReset := axIoDoForceValue[50];
END_IF;
