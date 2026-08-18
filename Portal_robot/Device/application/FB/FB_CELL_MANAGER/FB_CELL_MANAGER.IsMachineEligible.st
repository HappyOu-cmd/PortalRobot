METHOD PRIVATE IsMachineEligible : BOOL
VAR_INPUT
	uiMachine : UINT; // Проверяемый станок
END_VAR

// --- BEGIN IMPLEMENTATION ---

IsMachineEligible := (uiMachine >= FIRST_MACHINE)
	AND (uiMachine <= LAST_MACHINE);

IF IsMachineEligible THEN
	IsMachineEligible := astMachineStatus[uiMachine].xEnabled
		AND NOT astMachineStatus[uiMachine].xError
		AND NOT astMachineStatus[uiMachine].xDisablePending
		AND (Config.auiMachineType[uiMachine] >= UINT#1)
		AND (Config.auiMachineType[uiMachine] <= Config.uiTypeCount);
END_IF;
