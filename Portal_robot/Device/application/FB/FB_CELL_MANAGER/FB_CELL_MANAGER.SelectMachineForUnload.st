METHOD PRIVATE SelectMachineForUnload : UINT
VAR_INPUT
	uiCurrentMachine : UINT; // Текущая цель для устойчивого повторного выбора
END_VAR
VAR
	uiMachine           : UINT; // Проверяемый станок
	uiType              : UINT; // Тип детали станка
	xTimedFound         : BOOL; // Найден станок с оценкой времени
	xCurrentTimed       : BOOL; // Текущая цель имеет сопоставимую оценку
	tMinimumRemaining   : TIME; // Минимальное найденное оставшееся время
	tCandidateRemaining : TIME; // Оценка проверяемого станка
	tCurrentRemaining   : TIME; // Оценка текущей цели
END_VAR

// --- BEGIN IMPLEMENTATION ---

SelectMachineForUnload := UINT#0;
xTimedFound := FALSE;
xCurrentTimed := FALSE;
tMinimumRemaining := T#0S;
tCandidateRemaining := T#0S;
tCurrentRemaining := T#0S;

// Если робот уже ждёт над готовым станком, лишнее перемещение не требуется.
IF (uiCurrentMachine >= FIRST_MACHINE)
AND (uiCurrentMachine <= LAST_MACHINE) THEN
	IF IsMachineEligible(uiMachine := uiCurrentMachine) THEN
		uiType := Config.auiMachineType[uiCurrentMachine];
		IF (stMagazineStatus.stTypeStatus.aiFreeSlot[uiType] > SINT#0)
		AND astMachineStatus[uiCurrentMachine].xCanAcceptService
		AND astMachineStatus[uiCurrentMachine].xServiceRequired
		AND (astMachineStatus[uiCurrentMachine].ePartState = E_PART_STATE.LOADED)
		AND (astMachineStatus[uiCurrentMachine].ePartType = E_PART_TYPE.DETAIL) THEN
			SelectMachineForUnload := uiCurrentMachine;
		END_IF;
	END_IF;
END_IF;

// Готовая деталь имеет приоритет над ожиданием обработки.
FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
	uiType := Config.auiMachineType[uiMachine];
	IF IsMachineEligible(uiMachine := uiMachine) THEN
		IF (SelectMachineForUnload = UINT#0)
		AND astMachineStatus[uiMachine].xCanAcceptService
		AND astMachineStatus[uiMachine].xServiceRequired
		AND (astMachineStatus[uiMachine].ePartState = E_PART_STATE.LOADED)
		AND (astMachineStatus[uiMachine].ePartType = E_PART_TYPE.DETAIL)
		AND (stMagazineStatus.stTypeStatus.aiFreeSlot[uiType] > SINT#0) THEN
			SelectMachineForUnload := uiMachine;
		END_IF;
	END_IF;
END_FOR;

// Если готовых деталей пока нет, робот заранее направляется к станку с
// минимальным оставшимся временем обработки.
IF SelectMachineForUnload = UINT#0 THEN
	FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
		uiType := Config.auiMachineType[uiMachine];
		IF IsMachineEligible(uiMachine := uiMachine) THEN
			IF (stMagazineStatus.stTypeStatus.aiFreeSlot[uiType] > SINT#0)
			AND astMachineStatus[uiMachine].xCycleTimeValid THEN
				IF astMachineStatus[uiMachine].xProcessing THEN
					tCandidateRemaining := astMachineStatus[uiMachine].tRemaining;
				ELSIF axMachineStartPending[uiMachine] THEN
					tCandidateRemaining := START_PENDING_ESTIMATE
						+ astMachineStatus[uiMachine].tCycleExpected;
				ELSE
					tCandidateRemaining := T#0S;
				END_IF;

				IF astMachineStatus[uiMachine].xProcessing
				OR axMachineStartPending[uiMachine] THEN
					IF NOT xTimedFound
					OR (tCandidateRemaining < tMinimumRemaining) THEN
						SelectMachineForUnload := uiMachine;
						tMinimumRemaining := tCandidateRemaining;
						xTimedFound := TRUE;
					END_IF;
				END_IF;
			END_IF;
		END_IF;
	END_FOR;

	// При почти одинаковом времени сохраняется уже выбранная цель.
	IF xTimedFound
	AND (uiCurrentMachine >= FIRST_MACHINE)
	AND (uiCurrentMachine <= LAST_MACHINE) THEN
		IF (SelectMachineForUnload <> uiCurrentMachine)
		AND IsMachineEligible(uiMachine := uiCurrentMachine) THEN
			uiType := Config.auiMachineType[uiCurrentMachine];
			IF (stMagazineStatus.stTypeStatus.aiFreeSlot[uiType] > SINT#0)
			AND astMachineStatus[uiCurrentMachine].xCycleTimeValid THEN
				xCurrentTimed := astMachineStatus[uiCurrentMachine].xProcessing
					OR axMachineStartPending[uiCurrentMachine];
				IF astMachineStatus[uiCurrentMachine].xProcessing THEN
					tCurrentRemaining := astMachineStatus[uiCurrentMachine].tRemaining;
				ELSIF axMachineStartPending[uiCurrentMachine] THEN
					tCurrentRemaining := START_PENDING_ESTIMATE
						+ astMachineStatus[uiCurrentMachine].tCycleExpected;
				END_IF;
				IF xCurrentTimed
				AND (tCurrentRemaining >= tMinimumRemaining)
				AND ((tCurrentRemaining - tMinimumRemaining) <= MACHINE_SWITCH_DEADBAND) THEN
					SelectMachineForUnload := uiCurrentMachine;
				END_IF;
			END_IF;
		END_IF;
	END_IF;
END_IF;

// При неизвестном времени сохраняется текущая цель либо выбирается первый
// обрабатывающийся/только что запущенный станок с доступным слотом.
IF SelectMachineForUnload = UINT#0 THEN
	IF (uiCurrentMachine >= FIRST_MACHINE)
	AND (uiCurrentMachine <= LAST_MACHINE) THEN
		IF IsMachineEligible(uiMachine := uiCurrentMachine) THEN
			uiType := Config.auiMachineType[uiCurrentMachine];
			IF (stMagazineStatus.stTypeStatus.aiFreeSlot[uiType] > SINT#0)
			AND (astMachineStatus[uiCurrentMachine].xProcessing
				OR axMachineStartPending[uiCurrentMachine]) THEN
				SelectMachineForUnload := uiCurrentMachine;
			END_IF;
		END_IF;
	END_IF;

	FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
		uiType := Config.auiMachineType[uiMachine];
		IF IsMachineEligible(uiMachine := uiMachine) THEN
			IF (SelectMachineForUnload = UINT#0)
			AND (stMagazineStatus.stTypeStatus.aiFreeSlot[uiType] > SINT#0)
			AND (astMachineStatus[uiMachine].xProcessing
				OR axMachineStartPending[uiMachine]) THEN
				SelectMachineForUnload := uiMachine;
			END_IF;
		END_IF;
	END_FOR;
END_IF;

// Переход от окончания цикла к готовности двери может занять несколько сканов.
// В это время сохраняется станок с физически загруженной деталью/заготовкой.
IF SelectMachineForUnload = UINT#0 THEN
	IF (uiCurrentMachine >= FIRST_MACHINE)
	AND (uiCurrentMachine <= LAST_MACHINE) THEN
		IF IsMachineEligible(uiMachine := uiCurrentMachine) THEN
			uiType := Config.auiMachineType[uiCurrentMachine];
			IF (stMagazineStatus.stTypeStatus.aiFreeSlot[uiType] > SINT#0)
			AND (astMachineStatus[uiCurrentMachine].ePartState = E_PART_STATE.LOADED)
			AND ((astMachineStatus[uiCurrentMachine].ePartType = E_PART_TYPE.PART)
				OR (astMachineStatus[uiCurrentMachine].ePartType = E_PART_TYPE.DETAIL)) THEN
				SelectMachineForUnload := uiCurrentMachine;
			END_IF;
		END_IF;
	END_IF;

	FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
		uiType := Config.auiMachineType[uiMachine];
		IF IsMachineEligible(uiMachine := uiMachine) THEN
			IF (SelectMachineForUnload = UINT#0)
			AND (stMagazineStatus.stTypeStatus.aiFreeSlot[uiType] > SINT#0)
			AND (astMachineStatus[uiMachine].ePartState = E_PART_STATE.LOADED)
			AND ((astMachineStatus[uiMachine].ePartType = E_PART_TYPE.PART)
				OR (astMachineStatus[uiMachine].ePartType = E_PART_TYPE.DETAIL)) THEN
				SelectMachineForUnload := uiMachine;
			END_IF;
		END_IF;
	END_FOR;
END_IF;
