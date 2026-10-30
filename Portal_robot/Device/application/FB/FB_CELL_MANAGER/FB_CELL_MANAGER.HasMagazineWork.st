METHOD PRIVATE HasMagazineWork : BOOL
VAR_INPUT
	uiMagazine : UINT; // Оцениваемый магазин; активный владелец не меняется
	xSupplyBlankOnly : BOOL; // TRUE: нужна именно допустимая подача заготовки
END_VAR
VAR
	uiMachine : UINT;
	uiType : UINT;
	xPending : BOOL;
END_VAR

// --- BEGIN IMPLEMENTATION ---

HasMagazineWork := FALSE;
IF (uiMagazine >= UINT#1) AND (uiMagazine <= UINT#2) THEN
	FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
		IF IsMachineEligible(uiMachine := uiMachine) THEN
			uiType := Config.auiMachineType[uiMachine];
			IF (uiType >= UINT#1) AND (uiType <= UINT#3) THEN
				xPending := IsMachineWorkPending(uiMachine := uiMachine);
				// Те же критерии, что у SelectMachineBeforeTake: готовый
				// LOAD/CHANGE либо ожидаемое автоматическое обслуживание.
				IF (astMagazineStatus[uiMagazine].stTypeStatus.aiBlankSlot[uiType] > SINT#0)
				AND (xPending OR (astMachineStatus[uiMachine].xCanAcceptService
					AND ((astMachineStatus[uiMachine].ePartState = E_PART_STATE.EMPTY)
						OR astMachineStatus[uiMachine].xServiceRequired))) THEN
					HasMagazineWork := TRUE;
				END_IF;
				// Без заготовки остаётся отдельный UNLOAD в свободный слот.
				IF NOT xSupplyBlankOnly
				AND (astMagazineStatus[uiMagazine].stTypeStatus.aiFreeSlot[uiType] > SINT#0)
				AND (xPending OR (astMachineStatus[uiMachine].xCanAcceptService
					AND astMachineStatus[uiMachine].xServiceRequired
					AND (astMachineStatus[uiMachine].ePartState = E_PART_STATE.LOADED)
					AND (astMachineStatus[uiMachine].ePartType = E_PART_TYPE.DETAIL))) THEN
					HasMagazineWork := TRUE;
				END_IF;
			END_IF;
		END_IF;
	END_FOR;
END_IF;
