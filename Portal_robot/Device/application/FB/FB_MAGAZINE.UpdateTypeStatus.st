METHOD PRIVATE UpdateTypeStatus
VAR_IN_OUT
	stMagazineInventory : ST_MAGAZINE_INVENTORY;
END_VAR
VAR
	uiType : UINT; // Тип секции, 1..3
	uiSlot : UINT; // Проверяемый слот
	iSlot  : SINT; // Индекс массива содержимого
END_VAR

// --- BEGIN IMPLEMENTATION ---

FOR uiType := UINT#1 TO UINT#3 DO
	Status.stTypeStatus.aiBlankSlot[uiType] := SINT#0;
	Status.stTypeStatus.aiFreeSlot[uiType] := SINT#0;
	Status.stTypeStatus.auiBlankCount[uiType] := UINT#0;
	Status.stTypeStatus.auiDetailCount[uiType] := UINT#0;
	Status.stTypeStatus.auiFreeCount[uiType] := UINT#0;
END_FOR;

IF (iActiveSlotCount > SINT#0)
AND (uiTypeCount >= UINT#1)
AND (uiTypeCount <= UINT#3) THEN
	FOR uiSlot := UINT#1 TO SINT_TO_UINT(iActiveSlotCount) DO
		iSlot := UINT_TO_SINT(uiSlot);
		IF NOT stMagazineInventory.aZone2[iSlot].xInPosition THEN
			// После перехода на подвижный тип пустой слот универсален: тип 0
			// означает отсутствие изделия, а не запрет укладки конкретного типа.
			FOR uiType := UINT#1 TO uiTypeCount DO
				Status.stTypeStatus.auiFreeCount[uiType] :=
					Status.stTypeStatus.auiFreeCount[uiType] + UINT#1;
				IF Status.stTypeStatus.aiFreeSlot[uiType] = SINT#0 THEN
					Status.stTypeStatus.aiFreeSlot[uiType] := iSlot;
				END_IF;
			END_FOR;
		ELSE
			uiType := stMagazineInventory.aZone2[iSlot].uiProductType;
			IF (uiType >= UINT#1) AND (uiType <= uiTypeCount)
			AND (stMagazineInventory.aZone2[iSlot].eDetailType = E_DETAIL_TYPE.BLANK) THEN
				Status.stTypeStatus.auiBlankCount[uiType] :=
					Status.stTypeStatus.auiBlankCount[uiType] + UINT#1;
				IF Status.stTypeStatus.aiBlankSlot[uiType] = SINT#0 THEN
					Status.stTypeStatus.aiBlankSlot[uiType] := iSlot;
				END_IF;
			ELSIF (uiType >= UINT#1) AND (uiType <= uiTypeCount)
			AND (stMagazineInventory.aZone2[iSlot].eDetailType = E_DETAIL_TYPE.DETAIL) THEN
				Status.stTypeStatus.auiDetailCount[uiType] :=
					Status.stTypeStatus.auiDetailCount[uiType] + UINT#1;
			END_IF;
		END_IF;
	END_FOR;
END_IF;
