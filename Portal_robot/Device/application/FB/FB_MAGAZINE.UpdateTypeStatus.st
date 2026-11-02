METHOD PRIVATE UpdateTypeStatus
VAR_IN_OUT
    stMagazineInventory : ST_MAGAZINE_INVENTORY;
END_VAR
VAR
    uiType : UINT;
    uiSlot : UINT;
    iSlot : SINT;
    uiFreeCount : UINT;
    xValidTypeCount : BOOL;
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Один проход даёт выбор слотов и сводку. Пустое место универсально для типов.
iInventoryFirstBlank := SINT#0;
iInventoryFirstFree := SINT#0;
uiFreeCount := UINT#0;
xValidTypeCount := (uiTypeCount >= UINT#1) AND (uiTypeCount <= UINT#3);
FOR uiType := UINT#1 TO UINT#3 DO
    Status.stTypeStatus.aiBlankSlot[uiType] := SINT#0;
    Status.stTypeStatus.aiFreeSlot[uiType] := SINT#0;
    Status.stTypeStatus.auiBlankCount[uiType] := UINT#0;
    Status.stTypeStatus.auiDetailCount[uiType] := UINT#0;
    Status.stTypeStatus.auiFreeCount[uiType] := UINT#0;
END_FOR;
IF iActiveSlotCount > SINT#0 THEN
    FOR uiSlot := UINT#1 TO SINT_TO_UINT(iActiveSlotCount) DO
        iSlot := UINT_TO_SINT(uiSlot);
        IF NOT stMagazineInventory.aSlots[iSlot].xInPosition THEN
            uiFreeCount := uiFreeCount + UINT#1;
            IF iInventoryFirstFree = SINT#0 THEN iInventoryFirstFree := iSlot; END_IF;
        ELSE
            IF (iInventoryFirstBlank = SINT#0)
            AND (stMagazineInventory.aSlots[iSlot].eDetailType = E_DETAIL_TYPE.BLANK) THEN
                iInventoryFirstBlank := iSlot;
            END_IF;
            uiType := stMagazineInventory.aSlots[iSlot].uiProductType;
            IF xValidTypeCount AND (uiType >= UINT#1) AND (uiType <= uiTypeCount) THEN
                IF stMagazineInventory.aSlots[iSlot].eDetailType = E_DETAIL_TYPE.BLANK THEN
                    Status.stTypeStatus.auiBlankCount[uiType] := Status.stTypeStatus.auiBlankCount[uiType] + UINT#1;
                    IF Status.stTypeStatus.aiBlankSlot[uiType] = SINT#0 THEN Status.stTypeStatus.aiBlankSlot[uiType] := iSlot; END_IF;
                ELSIF stMagazineInventory.aSlots[iSlot].eDetailType = E_DETAIL_TYPE.DETAIL THEN
                    Status.stTypeStatus.auiDetailCount[uiType] := Status.stTypeStatus.auiDetailCount[uiType] + UINT#1;
                END_IF;
            END_IF;
        END_IF;
    END_FOR;
END_IF;
IF xValidTypeCount THEN
    FOR uiType := UINT#1 TO uiTypeCount DO
        Status.stTypeStatus.auiFreeCount[uiType] := uiFreeCount;
        Status.stTypeStatus.aiFreeSlot[uiType] := iInventoryFirstFree;
    END_FOR;
END_IF;
iInventorySummarySlotCount := iActiveSlotCount;
uiInventorySummaryTypeCount := uiTypeCount;
xInventorySummaryInitialized := TRUE;
xInventorySummaryDirty := FALSE;
