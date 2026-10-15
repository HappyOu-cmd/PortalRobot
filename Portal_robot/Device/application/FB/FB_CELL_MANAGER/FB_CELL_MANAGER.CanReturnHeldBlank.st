METHOD PRIVATE CanReturnHeldBlank : BOOL
VAR
	uiMagazine : UINT; // Магазин следующей операции, независимо от магазина возврата
	uiMachine  : UINT;
	uiType     : UINT;
	uiReservedFreeSlots : UINT; // Возврат занимает один универсальный слот своего магазина
END_VAR

// --- BEGIN IMPLEMENTATION ---

CanReturnHeldBlank := FALSE;

// Для одного типа возврат не открывает нового маршрута. Два груза сначала
// разбираются штатным LOAD/PUT; занятый исправный станок своей заготовки ждём.
IF (Config.uiTypeCount > UINT#1)
AND (Config.uiTypeCount <= UINT#3)
AND stRobotStatus.xBlankAvailable
AND NOT stRobotStatus.xDetailAvailable
AND NOT stRobotStatus.xBusy
AND NOT xStopRequested
AND xMagazineReady
AND (uiBlankPayloadType >= UINT#1)
AND (uiBlankPayloadType <= Config.uiTypeCount) THEN
	IF (stMagazineStatus.stTypeStatus.aiFreeSlot[uiBlankPayloadType] > SINT#0)
	AND (SelectMachineForHeldBlank(
		uiProductType := uiBlankPayloadType,
		uiCurrentMachine := uiSelectedMachine
	) = UINT#0) THEN
		FOR uiMagazine := UINT#1 TO GVL_CELL_SETTINGS.MagazineCount DO
			IF ((uiMagazine = UINT#1) AND xMagazine1Available)
			OR ((uiMagazine = UINT#2) AND xMagazine2Available) THEN
				uiReservedFreeSlots := UINT#0;
				IF uiMagazine = uiActiveMagazine THEN
					uiReservedFreeSlots := UINT#1;
				END_IF;
				FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
					IF IsMachineEligible(uiMachine := uiMachine) THEN
						uiType := Config.auiMachineType[uiMachine];
						IF uiType <> uiBlankPayloadType THEN
							// TAKE освобождает место даже в полной палете. Работающий
							// станок другого типа допускает обычное ожидание его цикла.
							IF (astMagazineStatus[uiMagazine].stTypeStatus.aiBlankSlot[uiType] > SINT#0)
							AND (astMachineStatus[uiMachine].xProcessing
								OR axMachineStartPending[uiMachine]
								OR (astMachineStatus[uiMachine].xCanAcceptService
									AND ((astMachineStatus[uiMachine].ePartState = E_PART_STATE.EMPTY)
										OR astMachineStatus[uiMachine].xServiceRequired))) THEN
								CanReturnHeldBlank := TRUE;
							END_IF;
							// Отдельная выгрузка полезна только для уже готовой детали.
							// Последний свободный слот нельзя занять возвратом и затем
							// выдать UNLOAD без места для этой детали.
							IF astMachineStatus[uiMachine].xCanAcceptService
							AND astMachineStatus[uiMachine].xServiceRequired
							AND (astMachineStatus[uiMachine].ePartState = E_PART_STATE.LOADED)
							AND (astMachineStatus[uiMachine].ePartType = E_PART_TYPE.DETAIL)
							AND (astMagazineStatus[uiMagazine].stTypeStatus.auiFreeCount[uiType] > uiReservedFreeSlots) THEN
								CanReturnHeldBlank := TRUE;
							END_IF;
						END_IF;
					END_IF;
				END_FOR;
			END_IF;
		END_FOR;
	END_IF;
END_IF;
