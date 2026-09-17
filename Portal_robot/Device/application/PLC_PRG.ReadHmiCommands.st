METHOD PRIVATE ReadHmiCommands

// --- BEGIN IMPLEMENTATION ---

// Request counters belong to gateway; pulses and acknowledgements belong to PLC.
udiHmiCommandNowMs := TIME_TO_UDINT(TIME());
GVL_HMI.udiHmiCommandClockMs := udiHmiCommandNowMs;
FOR uiHmiCommandIndex := UINT#1 TO UINT#121 DO
	axHmiCommandConsumed[uiHmiCommandIndex] := FALSE;
	axHmiCommandPulse[uiHmiCommandIndex] := FALSE;
	// Mandatory low scan rearms every existing R_TRIG, including scenario events.
	IF NOT axHmiCommandWasHigh[uiHmiCommandIndex] THEN
		IF axHmiInternalPulse[uiHmiCommandIndex] THEN
			axHmiCommandPulse[uiHmiCommandIndex] := TRUE;
			axHmiInternalPulse[uiHmiCommandIndex] := FALSE;
		ELSE
			audiHmiCommandSnapshot[uiHmiCommandIndex] := GVL_HMI.audiHmiCommandSeq[uiHmiCommandIndex];
			IF (audiHmiCommandSnapshot[uiHmiCommandIndex] <> UDINT#0)
			AND (audiHmiCommandSnapshot[uiHmiCommandIndex] <> GVL_HMI.audiHmiCommandAckSeq[uiHmiCommandIndex]) THEN
				axHmiCommandConsumed[uiHmiCommandIndex] := TRUE;
				IF IsHmiCommandFresh(udiIssuedAtMs := GVL_HMI.audiHmiCommandIssuedAtMs[uiHmiCommandIndex]) THEN
					axHmiCommandPulse[uiHmiCommandIndex] := TRUE;
					GVL_HMI.auiHmiCommandResult[uiHmiCommandIndex] := UINT#1;
				ELSE
					GVL_HMI.auiHmiCommandResult[uiHmiCommandIndex] := UINT#2;
				END_IF;
			END_IF;
		END_IF;
	END_IF;
	axHmiCommandWasHigh[uiHmiCommandIndex] := axHmiCommandPulse[uiHmiCommandIndex];
END_FOR;

// Stable wire IDs; command-contract.mjs and static tests enforce this mapping.
GVL_HMI.xCellEnable := axHmiCommandPulse[1];
GVL_HMI.xCellDisable := axHmiCommandPulse[2];
GVL_HMI.xCellStart := axHmiCommandPulse[3];
GVL_HMI.xCellStop := axHmiCommandPulse[4];
GVL_HMI.xCellReset := axHmiCommandPulse[5];
GVL_HMI.xSafetyRelayReset := axHmiCommandPulse[6];
GVL_HMI.xCellOperatorCancel := axHmiCommandPulse[7];
GVL_HMI.xAlarmResetWarnings := axHmiCommandPulse[8];
GVL_HMI.xModbusSettingsApply := axHmiCommandPulse[9];
GVL_HMI.stMultiType.Command.xAutoDistribute := axHmiCommandPulse[10];
GVL_HMI.xSimAxisGroupError := axHmiCommandPulse[11];
GVL_HMI.xSimRobotWrongAction := axHmiCommandPulse[12];
GVL_HMI.xSimCellBothGrippers := axHmiCommandPulse[13];
GVL_HMI.xSimPointXOutOfLimit := axHmiCommandPulse[14];
GVL_HMI.xSimPointYOutOfLimit := axHmiCommandPulse[15];
GVL_HMI.xSimPointZOutOfLimit := axHmiCommandPulse[16];
GVL_HMI.xSimPointInvalidVelocity := axHmiCommandPulse[17];
GVL_HMI.xSimMagazineWrongOperation := axHmiCommandPulse[18];
GVL_HMI.xSimMagazineNoBlank := axHmiCommandPulse[19];
GVL_HMI.xSimMagazineNoFreeSlot := axHmiCommandPulse[20];
GVL_HMI.xSimMagazineInvalidSlot := axHmiCommandPulse[21];
GVL_HMI.xSimMagazineSlotContent := axHmiCommandPulse[22];
GVL_HMI.xSimMagazineGeometry := axHmiCommandPulse[23];
GVL_HMI.xRobotDrivesEnable := axHmiCommandPulse[24];
GVL_HMI.xRobotDrivesDisable := axHmiCommandPulse[25];
GVL_HMI.xRobotStop := axHmiCommandPulse[26];
GVL_HMI.xRobotReset := axHmiCommandPulse[27];
GVL_HMI.xTestEnvironmentApply := axHmiCommandPulse[28];
GVL_HMI.xTestSpeedProfileApply := axHmiCommandPulse[29];
GVL_HMI.xTestScenarioApply := axHmiCommandPulse[30];
GVL_HMI.xPointCheckStop := axHmiCommandPulse[31];
GVL_HMI.xRobotManualExecute := axHmiCommandPulse[32];
GVL_HMI.stMultiType.Command.xSetTypeCount := axHmiCommandPulse[33];
GVL_HMI.xCellOperatorChoice := axHmiCommandPulse[34];
GVL_HMI.stMultiType.Command.xSetMachineType := axHmiCommandPulse[35];
GVL_HMI.xRobotControlModeApply := axHmiCommandPulse[36];
GVL_HMI.stMultiType.Command.xSetSlotType := axHmiCommandPulse[37];
GVL_HMI.astAxisHmiCommand[1].xHome := axHmiCommandPulse[38];
GVL_HMI.astAxisHmiCommand[1].xMoveAbsolute := axHmiCommandPulse[39];
GVL_HMI.astAxisHmiCommand[1].xMoveRelative := axHmiCommandPulse[40];
GVL_HMI.axSimAxisJogConflict[1] := axHmiCommandPulse[41];
GVL_HMI.axMachineSimReset[1] := axHmiCommandPulse[42];
GVL_HMI.axMachineEnable[1] := axHmiCommandPulse[43];
GVL_HMI.axMachineDisable[1] := axHmiCommandPulse[44];
GVL_HMI.axMachineReset[1] := axHmiCommandPulse[45];
GVL_HMI.axMachineSetBlank[1] := axHmiCommandPulse[46];
GVL_HMI.axMachineSetDetail[1] := axHmiCommandPulse[47];
GVL_HMI.axMachineAcceptDoor[1] := axHmiCommandPulse[48];
GVL_HMI.axMachineRejectDoor[1] := axHmiCommandPulse[49];
GVL_HMI.axMachineAcceptRun[1] := axHmiCommandPulse[50];
GVL_HMI.axMachineRejectRun[1] := axHmiCommandPulse[51];
GVL_HMI.axMachineManualSafetyDoorOpen[1] := axHmiCommandPulse[52];
GVL_HMI.axMachineManualSafetyDoorClose[1] := axHmiCommandPulse[53];
GVL_HMI.axMachineManualHatchOpen[1] := axHmiCommandPulse[54];
GVL_HMI.axMachineManualHatchClose[1] := axHmiCommandPulse[55];
GVL_HMI.axMachineManualHatchUnlock[1] := axHmiCommandPulse[56];
GVL_HMI.axMachineManualHatchLock[1] := axHmiCommandPulse[57];
GVL_HMI.axMachineManualChuckOpen[1] := axHmiCommandPulse[58];
GVL_HMI.axMachineManualChuckClose[1] := axHmiCommandPulse[59];
GVL_HMI.astAxisHmiCommand[2].xHome := axHmiCommandPulse[60];
GVL_HMI.astAxisHmiCommand[2].xMoveAbsolute := axHmiCommandPulse[61];
GVL_HMI.astAxisHmiCommand[2].xMoveRelative := axHmiCommandPulse[62];
GVL_HMI.axSimAxisJogConflict[2] := axHmiCommandPulse[63];
GVL_HMI.axMachineSimReset[2] := axHmiCommandPulse[64];
GVL_HMI.axMachineEnable[2] := axHmiCommandPulse[65];
GVL_HMI.axMachineDisable[2] := axHmiCommandPulse[66];
GVL_HMI.axMachineReset[2] := axHmiCommandPulse[67];
GVL_HMI.axMachineSetBlank[2] := axHmiCommandPulse[68];
GVL_HMI.axMachineSetDetail[2] := axHmiCommandPulse[69];
GVL_HMI.axMachineAcceptDoor[2] := axHmiCommandPulse[70];
GVL_HMI.axMachineRejectDoor[2] := axHmiCommandPulse[71];
GVL_HMI.axMachineAcceptRun[2] := axHmiCommandPulse[72];
GVL_HMI.axMachineRejectRun[2] := axHmiCommandPulse[73];
GVL_HMI.axMachineManualSafetyDoorOpen[2] := axHmiCommandPulse[74];
GVL_HMI.axMachineManualSafetyDoorClose[2] := axHmiCommandPulse[75];
GVL_HMI.axMachineManualHatchOpen[2] := axHmiCommandPulse[76];
GVL_HMI.axMachineManualHatchClose[2] := axHmiCommandPulse[77];
GVL_HMI.axMachineManualHatchUnlock[2] := axHmiCommandPulse[78];
GVL_HMI.axMachineManualHatchLock[2] := axHmiCommandPulse[79];
GVL_HMI.axMachineManualChuckOpen[2] := axHmiCommandPulse[80];
GVL_HMI.axMachineManualChuckClose[2] := axHmiCommandPulse[81];
GVL_HMI.astAxisHmiCommand[3].xHome := axHmiCommandPulse[82];
GVL_HMI.astAxisHmiCommand[3].xMoveAbsolute := axHmiCommandPulse[83];
GVL_HMI.astAxisHmiCommand[3].xMoveRelative := axHmiCommandPulse[84];
GVL_HMI.axSimAxisJogConflict[3] := axHmiCommandPulse[85];
GVL_HMI.axMachineSimReset[3] := axHmiCommandPulse[86];
GVL_HMI.axMachineEnable[3] := axHmiCommandPulse[87];
GVL_HMI.axMachineDisable[3] := axHmiCommandPulse[88];
GVL_HMI.axMachineReset[3] := axHmiCommandPulse[89];
GVL_HMI.axMachineSetBlank[3] := axHmiCommandPulse[90];
GVL_HMI.axMachineSetDetail[3] := axHmiCommandPulse[91];
GVL_HMI.axMachineAcceptDoor[3] := axHmiCommandPulse[92];
GVL_HMI.axMachineRejectDoor[3] := axHmiCommandPulse[93];
GVL_HMI.axMachineAcceptRun[3] := axHmiCommandPulse[94];
GVL_HMI.axMachineRejectRun[3] := axHmiCommandPulse[95];
GVL_HMI.axMachineManualSafetyDoorOpen[3] := axHmiCommandPulse[96];
GVL_HMI.axMachineManualSafetyDoorClose[3] := axHmiCommandPulse[97];
GVL_HMI.axMachineManualHatchOpen[3] := axHmiCommandPulse[98];
GVL_HMI.axMachineManualHatchClose[3] := axHmiCommandPulse[99];
GVL_HMI.axMachineManualHatchUnlock[3] := axHmiCommandPulse[100];
GVL_HMI.axMachineManualHatchLock[3] := axHmiCommandPulse[101];
GVL_HMI.axMachineManualChuckOpen[3] := axHmiCommandPulse[102];
GVL_HMI.axMachineManualChuckClose[3] := axHmiCommandPulse[103];
GVL_HMI.astMagazineCommand[1].xEnable := axHmiCommandPulse[104];
GVL_HMI.astMagazineCommand[1].xDisable := axHmiCommandPulse[105];
GVL_HMI.astMagazineCommand[1].xStop := axHmiCommandPulse[106];
GVL_HMI.astMagazineCommand[1].xReset := axHmiCommandPulse[107];
GVL_HMI.astMagazineCommand[1].xFill := axHmiCommandPulse[108];
GVL_HMI.astMagazineCommand[1].xClear := axHmiCommandPulse[109];
GVL_HMI.astMagazineCommand[1].xApplySlot := axHmiCommandPulse[110];
GVL_HMI.astMagazineCommand[1].xApplyPitchX := axHmiCommandPulse[111];
GVL_HMI.astMagazineCommand[1].xApplyPitchY := axHmiCommandPulse[112];
GVL_HMI.astMagazineCommand[2].xEnable := axHmiCommandPulse[113];
GVL_HMI.astMagazineCommand[2].xDisable := axHmiCommandPulse[114];
GVL_HMI.astMagazineCommand[2].xStop := axHmiCommandPulse[115];
GVL_HMI.astMagazineCommand[2].xReset := axHmiCommandPulse[116];
GVL_HMI.astMagazineCommand[2].xFill := axHmiCommandPulse[117];
GVL_HMI.astMagazineCommand[2].xClear := axHmiCommandPulse[118];
GVL_HMI.astMagazineCommand[2].xApplySlot := axHmiCommandPulse[119];
GVL_HMI.astMagazineCommand[2].xApplyPitchX := axHmiCommandPulse[120];
GVL_HMI.astMagazineCommand[2].xApplyPitchY := axHmiCommandPulse[121];
