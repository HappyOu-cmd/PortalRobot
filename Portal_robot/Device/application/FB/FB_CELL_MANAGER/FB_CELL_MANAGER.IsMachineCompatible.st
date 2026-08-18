METHOD PRIVATE IsMachineCompatible : BOOL
VAR_INPUT
	uiMachine     : UINT; // Проверяемый станок
	uiProductType : UINT; // Тип заготовки в захвате
END_VAR

// --- BEGIN IMPLEMENTATION ---

IsMachineCompatible := IsMachineEligible(uiMachine := uiMachine);
IF IsMachineCompatible THEN
	IsMachineCompatible := (uiProductType >= UINT#1)
		AND (uiProductType <= Config.uiTypeCount)
		AND (Config.auiMachineType[uiMachine] = uiProductType);
END_IF;
