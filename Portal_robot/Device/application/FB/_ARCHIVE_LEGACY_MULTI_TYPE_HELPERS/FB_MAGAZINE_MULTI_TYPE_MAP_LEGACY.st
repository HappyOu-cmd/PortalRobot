FUNCTION_BLOCK FB_MAGAZINE_MULTI_TYPE_MAP_LEGACY
VAR_INPUT
	Config          : ST_MULTI_TYPE_CONFIG; // Назначение типов слотам
	uiActiveSlotCount : UINT; // Число активных слотов
END_VAR
VAR_OUTPUT
	aiBlankSlot  : ARRAY [1..3] OF SINT; // Первый слот с заготовкой каждого типа
	aiFreeSlot   : ARRAY [1..3] OF SINT; // Первый свободный слот каждого типа
	auiBlankCount  : ARRAY [1..3] OF UINT; // Количество заготовок
	auiDetailCount : ARRAY [1..3] OF UINT; // Количество готовых деталей
	auiFreeCount   : ARRAY [1..3] OF UINT; // Количество свободных слотов
END_VAR
VAR_IN_OUT
	stDetail : ARRAY [1..GVL_CELL_SETTINGS.NumberDetail] OF ST_DETAIL; // Фактическое содержимое магазина
END_VAR
VAR
	uiType : UINT; // Индекс типа
	uiSlot : UINT; // Индекс слота
END_VAR

// --- BEGIN IMPLEMENTATION ---

FOR uiType := UINT#1 TO UINT#3 DO
	aiBlankSlot[uiType] := SINT#0;
	aiFreeSlot[uiType] := SINT#0;
	auiBlankCount[uiType] := UINT#0;
	auiDetailCount[uiType] := UINT#0;
	auiFreeCount[uiType] := UINT#0;
END_FOR;

IF uiActiveSlotCount <= SINT_TO_UINT(GVL_CELL_SETTINGS.NumberDetail) THEN
	FOR uiSlot := UINT#1 TO uiActiveSlotCount DO
		uiType := Config.auiSlotType[uiSlot];
		IF (uiType >= UINT#1) AND (uiType <= UINT#3) THEN
			IF NOT stDetail[UINT_TO_SINT(uiSlot)].xInPosition THEN
				auiFreeCount[uiType] := auiFreeCount[uiType] + UINT#1;
				IF aiFreeSlot[uiType] = SINT#0 THEN
					aiFreeSlot[uiType] := UINT_TO_SINT(uiSlot);
				END_IF;
			ELSIF stDetail[UINT_TO_SINT(uiSlot)].eDetailType = E_DETAIL_TYPE.BLANK THEN
				auiBlankCount[uiType] := auiBlankCount[uiType] + UINT#1;
				IF aiBlankSlot[uiType] = SINT#0 THEN
					aiBlankSlot[uiType] := UINT_TO_SINT(uiSlot);
				END_IF;
			ELSIF stDetail[UINT_TO_SINT(uiSlot)].eDetailType = E_DETAIL_TYPE.DETAIL THEN
				auiDetailCount[uiType] := auiDetailCount[uiType] + UINT#1;
			END_IF;
		END_IF;
	END_FOR;
END_IF;
