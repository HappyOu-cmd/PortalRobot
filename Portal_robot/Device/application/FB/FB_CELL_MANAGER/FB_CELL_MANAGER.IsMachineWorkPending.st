METHOD PRIVATE IsMachineWorkPending : BOOL
VAR_INPUT
	uiMachine : UINT; // Проверяемый станок
END_VAR

// --- BEGIN IMPLEMENTATION ---

IsMachineWorkPending := FALSE;
IF IsMachineEligible(uiMachine := uiMachine) THEN
	// LOADED сам по себе не обещает автоматического продолжения: оператор
	// может ещё не разрешить цикл. Сохраняем обработку, подтверждение запуска
	// и короткий автоматический переход после обработки/обслуживания.
	IsMachineWorkPending := astMachineStatus[uiMachine].xProcessing
		OR axMachineStartPending[uiMachine]
		OR ((astMachineStatus[uiMachine].ePartState = E_PART_STATE.LOADED)
			AND ((astMachineStatus[uiMachine].ePartType = E_PART_TYPE.PART)
				OR (astMachineStatus[uiMachine].ePartType = E_PART_TYPE.DETAIL))
			AND (astMachineStatus[uiMachine].xBusy
				OR astMachineStatus[uiMachine].xDone));
END_IF;
