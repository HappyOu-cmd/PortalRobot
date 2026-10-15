FUNCTION F_GEOMETRY_TAKE_DETAIL : BOOL
VAR_INPUT
	uiMachine : UINT;
	uiProductType : UINT;
END_VAR
VAR
	Call : ST_GEOMETRY_CALL;
	EmptyCall : ST_GEOMETRY_CALL;
END_VAR

// --- BEGIN IMPLEMENTATION ---

F_GEOMETRY_TAKE_DETAIL := FALSE;
IF (uiMachine >= UINT#1) AND (uiMachine <= UINT#3) THEN
	// Считаем подтверждённую выгрузку ровно один раз, а не уровень Ready каждый скан.
	// Ожидающая выборка сохраняет счётчик до фактического взятия по FIFO.
	IF (GVL_GEOMETRY_CONTROL.astCalls[uiMachine].uiState <> UINT#1)
	AND GVL_GEOMETRY_CONTROL.xSupported AND GVL_GEOMETRY_CONTROL.xAutoEnabled
	AND (GVL_GEOMETRY_CONTROL.astStatus[1].xEnabled OR GVL_GEOMETRY_CONTROL.astStatus[2].xEnabled) THEN
		GVL_GEOMETRY_CONTROL.auiActiveCount[uiMachine] := MIN(UINT#10000, GVL_GEOMETRY_CONTROL.auiActiveCount[uiMachine] + UINT#1);
		IF GVL_GEOMETRY_CONTROL.auiActiveCount[uiMachine] >= GVL_GEOMETRY_CONTROL.auiPeriod[uiMachine] THEN
			IF (GVL_GEOMETRY_CONTROL.astCalls[uiMachine].uiState <> UINT#2)
			AND (GVL_GEOMETRY_CONTROL.astCalls[uiMachine].uiState <> UINT#3) THEN
				GVL_GEOMETRY_CONTROL.udiNextCallId := GVL_GEOMETRY_CONTROL.udiNextCallId + UDINT#1;
				IF GVL_GEOMETRY_CONTROL.udiNextCallId = UDINT#0 THEN GVL_GEOMETRY_CONTROL.udiNextCallId := UDINT#1; END_IF;
				Call := EmptyCall; Call.udiId := GVL_GEOMETRY_CONTROL.udiNextCallId;
				Call.uiMachine := uiMachine; Call.uiProductType := uiProductType; Call.uiState := UINT#1;
				GVL_GEOMETRY_CONTROL.astCalls[uiMachine] := Call; F_GEOMETRY_EVENT(Call := Call);
			ELSE
				GVL_GEOMETRY_CONTROL.auiActiveCount[uiMachine] := UINT#0;
			END_IF;
		END_IF;
	END_IF;
	// Вызов мог прийти уже после запуска рецепта. Завершаем рецепт, но более
	// поздний вызов оставляем ожидающим следующую деталь, не обгоняя голову FIFO.
	IF (GVL_GEOMETRY_CONTROL.astCalls[uiMachine].uiState = UINT#1)
	AND (F_GEOMETRY_FIRST_CALL() = uiMachine) THEN
		GVL_GEOMETRY_CONTROL.auiActiveCount[uiMachine] := UINT#0;
		GVL_GEOMETRY_CONTROL.astCalls[uiMachine].uiProductType := uiProductType;
		GVL_GEOMETRY_CONTROL.astCalls[uiMachine].uiState := UINT#2;
		F_GEOMETRY_EVENT(Call := GVL_GEOMETRY_CONTROL.astCalls[uiMachine]);
		F_GEOMETRY_TAKE_DETAIL := TRUE;
	END_IF;
END_IF;
