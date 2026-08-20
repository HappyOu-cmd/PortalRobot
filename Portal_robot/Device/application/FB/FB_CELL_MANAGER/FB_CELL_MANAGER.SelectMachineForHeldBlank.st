METHOD PRIVATE SelectMachineForHeldBlank : UINT
VAR_INPUT
	uiProductType    : UINT; // Тип уже взятой заготовки
	uiCurrentMachine : UINT; // Текущая цель для устойчивого повторного выбора
END_VAR
VAR
	uiMachine           : UINT; // Проверяемый станок
	xTimedFound         : BOOL; // Найден станок с оценкой времени
	xCurrentTimed       : BOOL; // Текущая цель имеет сопоставимую оценку
	tMinimumRemaining   : TIME; // Минимальное оставшееся время
	tCandidateRemaining : TIME; // Оценка проверяемого станка
	tCurrentRemaining   : TIME; // Оценка текущей цели
END_VAR

// --- BEGIN IMPLEMENTATION ---

SelectMachineForHeldBlank := UINT#0;
xTimedFound := FALSE;
xCurrentTimed := FALSE;
tMinimumRemaining := T#0S;
tCandidateRemaining := T#0S;
tCurrentRemaining := T#0S;

// UINT#0 означает, что после остановки/аварии текущая цель ещё не выбрана.
// Проверка диапазона вынесена отдельно: обычный AND в CODESYS вычисляет все
// операнды и не защищает ARRAY [1..3] от обращения по индексу 0.
IF (uiCurrentMachine >= FIRST_MACHINE)
AND (uiCurrentMachine <= LAST_MACHINE) THEN
	// Если робот уже находится у готовой совместимой цели, лишнее перемещение не требуется.
	IF IsMachineCompatible(
		uiMachine := uiCurrentMachine,
		uiProductType := uiProductType
	)
	AND astMachineStatus[uiCurrentMachine].xCanAcceptService
	AND ((astMachineStatus[uiCurrentMachine].ePartState = E_PART_STATE.EMPTY)
		OR astMachineStatus[uiCurrentMachine].xServiceRequired) THEN
		SelectMachineForHeldBlank := uiCurrentMachine;
	END_IF;
END_IF;

// Готовая совместимая цель имеет приоритет. Переходный xPartReady без
// xCanAcceptService не считается разрешением на повторное обслуживание.
FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
	IF (SelectMachineForHeldBlank = UINT#0)
	AND IsMachineEligible(uiMachine := uiMachine)
	AND (Config.auiMachineType[uiMachine] = uiProductType)
	AND astMachineStatus[uiMachine].xCanAcceptService
	AND ((astMachineStatus[uiMachine].ePartState = E_PART_STATE.EMPTY)
		OR astMachineStatus[uiMachine].xServiceRequired) THEN
		SelectMachineForHeldBlank := uiMachine;
	END_IF;
END_FOR;

// Обрабатывающие и только что запущенные совместимые станки сравниваются
// по одному прогнозу: tRemaining либо полный tCycleExpected для start-pending.
IF SelectMachineForHeldBlank = UINT#0 THEN
	FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
		IF IsMachineEligible(uiMachine := uiMachine)
		AND (Config.auiMachineType[uiMachine] = uiProductType)
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
					SelectMachineForHeldBlank := uiMachine;
					tMinimumRemaining := tCandidateRemaining;
					xTimedFound := TRUE;
				END_IF;
			END_IF;
		END_IF;
	END_FOR;

	// При почти одинаковом времени сохраняется текущая цель.
	IF xTimedFound
	AND (uiCurrentMachine >= FIRST_MACHINE)
	AND (uiCurrentMachine <= LAST_MACHINE) THEN
		IF (SelectMachineForHeldBlank <> uiCurrentMachine)
		AND IsMachineCompatible(
			uiMachine := uiCurrentMachine,
			uiProductType := uiProductType
		)
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
				SelectMachineForHeldBlank := uiCurrentMachine;
			END_IF;
		END_IF;
	END_IF;
END_IF;

// Без точной оценки сохраняется текущий обрабатывающий маршрут либо выбирается
// первый совместимый обрабатывающий/start-pending станок.
IF SelectMachineForHeldBlank = UINT#0 THEN
	IF (uiCurrentMachine >= FIRST_MACHINE)
	AND (uiCurrentMachine <= LAST_MACHINE) THEN
		IF IsMachineCompatible(
			uiMachine := uiCurrentMachine,
			uiProductType := uiProductType
		)
		AND (astMachineStatus[uiCurrentMachine].xProcessing
			OR axMachineStartPending[uiCurrentMachine]) THEN
			SelectMachineForHeldBlank := uiCurrentMachine;
		END_IF;
	END_IF;

	FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
		IF (SelectMachineForHeldBlank = UINT#0)
		AND IsMachineEligible(uiMachine := uiMachine)
		AND (Config.auiMachineType[uiMachine] = uiProductType)
		AND (astMachineStatus[uiMachine].xProcessing
			OR axMachineStartPending[uiMachine]) THEN
			SelectMachineForHeldBlank := uiMachine;
		END_IF;
	END_FOR;
END_IF;

// Возврат заготовки выполняется только при полном отсутствии совместимых
// включённых и исправных целей, а не просто потому, что станок ещё не готов.
IF SelectMachineForHeldBlank = UINT#0 THEN
	IF (uiCurrentMachine >= FIRST_MACHINE)
	AND (uiCurrentMachine <= LAST_MACHINE) THEN
		IF IsMachineCompatible(
			uiMachine := uiCurrentMachine,
			uiProductType := uiProductType
		) THEN
			SelectMachineForHeldBlank := uiCurrentMachine;
		END_IF;
	END_IF;

	FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
		IF (SelectMachineForHeldBlank = UINT#0)
		AND IsMachineEligible(uiMachine := uiMachine)
		AND (Config.auiMachineType[uiMachine] = uiProductType) THEN
			SelectMachineForHeldBlank := uiMachine;
		END_IF;
	END_FOR;
END_IF;
