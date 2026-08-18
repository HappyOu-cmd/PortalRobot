// ARCHIVE: метод прежнего однотипного диспетчера.
METHOD PRIVATE SelectMachine : UINT
VAR_INPUT
	uiCurrentMachine : UINT; // Текущий станок ожидания; используется для устойчивого повторного выбора
END_VAR
VAR
	uiMachine             : UINT; // Индекс проверяемого станка
	xTimedCandidateFound : BOOL; // Найден обрабатывающий станок с оценкой времени
	tMinimumRemaining    : TIME; // Минимальное найденное оставшееся время
END_VAR

// --- BEGIN IMPLEMENTATION ---

SelectMachine := UINT#0;
xTimedCandidateFound := FALSE;
tMinimumRemaining := T#0S;

// Если станок, перед которым уже находится робот, готов к обслуживанию,
// дополнительное перемещение не требуется.
IF (uiCurrentMachine >= FIRST_MACHINE)
AND (uiCurrentMachine <= LAST_MACHINE) THEN
	IF astMachineStatus[uiCurrentMachine].xEnabled
	AND NOT astMachineStatus[uiCurrentMachine].xDisablePending
	AND NOT astMachineStatus[uiCurrentMachine].xError
	AND astMachineStatus[uiCurrentMachine].xCanAcceptService
	AND astMachineStatus[uiCurrentMachine].xServiceRequired THEN
		SelectMachine := uiCurrentMachine;
	END_IF;
END_IF;

// Приоритет 1: любой готовый станок. Если текущий не готов, выбирается
// первый доступный станок по минимальному номеру.
IF SelectMachine = UINT#0 THEN
	FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
		IF (SelectMachine = UINT#0)
		AND astMachineStatus[uiMachine].xEnabled
		AND NOT astMachineStatus[uiMachine].xDisablePending
		AND NOT astMachineStatus[uiMachine].xError
		AND astMachineStatus[uiMachine].xCanAcceptService
		AND astMachineStatus[uiMachine].xServiceRequired THEN
			SelectMachine := uiMachine;
		END_IF;
	END_FOR;
END_IF;

// Приоритет 2: обрабатывающий станок с минимальным оставшимся временем.
IF SelectMachine = UINT#0 THEN
	FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
		IF astMachineStatus[uiMachine].xEnabled
		AND NOT astMachineStatus[uiMachine].xDisablePending
		AND NOT astMachineStatus[uiMachine].xError
		AND astMachineStatus[uiMachine].xProcessing
		AND astMachineStatus[uiMachine].xCycleTimeValid THEN
			IF NOT xTimedCandidateFound
			OR (astMachineStatus[uiMachine].tRemaining < tMinimumRemaining) THEN
				SelectMachine := uiMachine;
				tMinimumRemaining := astMachineStatus[uiMachine].tRemaining;
				xTimedCandidateFound := TRUE;
			END_IF;
		END_IF;
	END_FOR;

	// Мёртвая зона применяется только к смене уже выбранного станка.
	// При первичном выборе всегда используется фактический минимум.
	IF xTimedCandidateFound
	AND (uiCurrentMachine >= FIRST_MACHINE)
	AND (uiCurrentMachine <= LAST_MACHINE)
	AND (SelectMachine <> uiCurrentMachine) THEN
		IF astMachineStatus[uiCurrentMachine].xEnabled
		AND NOT astMachineStatus[uiCurrentMachine].xDisablePending
		AND NOT astMachineStatus[uiCurrentMachine].xError
		AND astMachineStatus[uiCurrentMachine].xProcessing
		AND astMachineStatus[uiCurrentMachine].xCycleTimeValid
		AND ((astMachineStatus[uiCurrentMachine].tRemaining - tMinimumRemaining)
			<= MACHINE_SWITCH_DEADBAND) THEN
			SelectMachine := uiCurrentMachine;
		END_IF;
	END_IF;
END_IF;

// Если ни один станок не имеет оценки времени, робот остаётся у текущего
// доступного обрабатывающего станка. При первичном выборе берётся первый.
IF (SelectMachine = UINT#0)
AND NOT xTimedCandidateFound THEN
	IF (uiCurrentMachine >= FIRST_MACHINE)
	AND (uiCurrentMachine <= LAST_MACHINE) THEN
		IF astMachineStatus[uiCurrentMachine].xEnabled
		AND NOT astMachineStatus[uiCurrentMachine].xDisablePending
		AND NOT astMachineStatus[uiCurrentMachine].xError
		AND astMachineStatus[uiCurrentMachine].xProcessing THEN
			SelectMachine := uiCurrentMachine;
		END_IF;
	END_IF;

	IF SelectMachine = UINT#0 THEN
		FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
			IF (SelectMachine = UINT#0)
			AND astMachineStatus[uiMachine].xEnabled
			AND NOT astMachineStatus[uiMachine].xDisablePending
			AND NOT astMachineStatus[uiMachine].xError
			AND astMachineStatus[uiMachine].xProcessing THEN
				SelectMachine := uiMachine;
			END_IF;
		END_FOR;
	END_IF;
END_IF;
