METHOD PRIVATE SelectMachineBeforeTake : UINT
VAR
	uiMachine           : UINT; // Проверяемый станок
	uiType              : UINT; // Тип станка
	xTimedFound         : BOOL; // Найден кандидат с оценкой времени
	tMinimumRemaining   : TIME; // Минимальное найденное оставшееся время
	tCandidateRemaining : TIME; // Оценка кандидата, который подтверждает запуск цикла
END_VAR

// --- BEGIN IMPLEMENTATION ---

SelectMachineBeforeTake := UINT#0;
xTimedFound := FALSE;
tMinimumRemaining := T#0S;

// Сначала выбирается станок, который можно обслужить без ожидания.
// xPartReady отдельно не используется: после завершения обслуживания он может
// сохраняться до перехода FB_MACHINE из DONE в IDLE и повторно выбрать тот же станок.
FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
	uiType := Config.auiMachineType[uiMachine];
	IF IsMachineEligible(uiMachine := uiMachine) THEN
		IF (SelectMachineBeforeTake = UINT#0)
		AND (stMagazineStatus.stTypeStatus.aiBlankSlot[uiType] > SINT#0)
		AND astMachineStatus[uiMachine].xCanAcceptService
		AND ((astMachineStatus[uiMachine].ePartState = E_PART_STATE.EMPTY)
			OR astMachineStatus[uiMachine].xServiceRequired) THEN
			SelectMachineBeforeTake := uiMachine;
		END_IF;
	END_IF;
END_FOR;

// Затем сравниваются фактически обрабатывающие станки по оставшемуся времени.
IF SelectMachineBeforeTake = UINT#0 THEN
	FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
		uiType := Config.auiMachineType[uiMachine];
		IF IsMachineEligible(uiMachine := uiMachine) THEN
			IF (stMagazineStatus.stTypeStatus.aiBlankSlot[uiType] > SINT#0)
			AND astMachineStatus[uiMachine].xProcessing
			AND astMachineStatus[uiMachine].xCycleTimeValid THEN
				IF NOT xTimedFound
				OR (astMachineStatus[uiMachine].tRemaining < tMinimumRemaining) THEN
					SelectMachineBeforeTake := uiMachine;
					tMinimumRemaining := astMachineStatus[uiMachine].tRemaining;
					xTimedFound := TRUE;
				END_IF;
			END_IF;
		END_IF;
	END_FOR;
END_IF;

// Только что обслуженный станок может появиться в xProcessing на несколько циклов PLC позже.
// До подтверждения запуска он участвует в том же сравнении по полному tCycleExpected.
IF (SelectMachineBeforeTake = UINT#0) OR xTimedFound THEN
	FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
		uiType := Config.auiMachineType[uiMachine];
		IF axMachineStartPending[uiMachine]
		AND IsMachineEligible(uiMachine := uiMachine)
		AND (stMagazineStatus.stTypeStatus.aiBlankSlot[uiType] > SINT#0)
		AND astMachineStatus[uiMachine].xCycleTimeValid THEN
			tCandidateRemaining := START_PENDING_ESTIMATE
				+ astMachineStatus[uiMachine].tCycleExpected;
			IF NOT xTimedFound
			OR (tCandidateRemaining < tMinimumRemaining) THEN
				SelectMachineBeforeTake := uiMachine;
				tMinimumRemaining := tCandidateRemaining;
				xTimedFound := TRUE;
			END_IF;
		END_IF;
	END_FOR;
END_IF;

// Неизвестное время не делает включённый исправный станок недоступным.
IF (SelectMachineBeforeTake = UINT#0) AND NOT xTimedFound THEN
	FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
		uiType := Config.auiMachineType[uiMachine];
		IF IsMachineEligible(uiMachine := uiMachine) THEN
			IF (SelectMachineBeforeTake = UINT#0)
			AND (stMagazineStatus.stTypeStatus.aiBlankSlot[uiType] > SINT#0)
			AND (astMachineStatus[uiMachine].xProcessing
				OR axMachineStartPending[uiMachine]) THEN
				SelectMachineBeforeTake := uiMachine;
			END_IF;
		END_IF;
	END_FOR;
END_IF;
