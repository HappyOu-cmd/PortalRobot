METHOD PRIVATE SetApplicationDefaults

// --- BEGIN IMPLEMENTATION ---

// Начальное состояние FB_MACHINE — DISABLED, поэтому и выбор станков для
// автоматической обработки обязан начинаться с FALSE. Отдельный флаг нужен,
// чтобы исправление сработало и при Online Change, когда новый initializer GVL
// может не перезаписать уже существующее значение. Инициализация выполняется до
// RunCellControl, чтобы менеджер ячейки не увидел ложный выбор даже на один цикл.
IF NOT xMachineUseInitialized THEN
	FOR uiMachine := 1 TO 3 DO
		GVL_HMI.axMachineUsed[uiMachine] := FALSE;
	END_FOR;
	xMachineUseInitialized := TRUE;
END_IF;

// При первом запуске этой схемы намеренно отбрасываем прежние инженерные
// координаты. Нулевая скорость и xConfigured=FALSE не позволяют принять
// нулевую точку за пригодную для движения.
IF GVL_POINT.udiPointStorageVersion <> GVL_POINT.udiExpectedPointStorageVersion THEN
	FOR uiPointEditorIndex := UINT#1 TO INT_TO_UINT(GVL_POINT.iPersistentPointCapacity) DO
		GVL_POINT.astRetainPoints[uiPointEditorIndex].Name := '';
		GVL_POINT.astRetainPoints[uiPointEditorIndex].X := 0.0;
		GVL_POINT.astRetainPoints[uiPointEditorIndex].Y := 0.0;
		GVL_POINT.astRetainPoints[uiPointEditorIndex].Z := 0.0;
		GVL_POINT.astRetainPoints[uiPointEditorIndex].SpeedFactor := 0.0;
		GVL_POINT.astRetainPoints[uiPointEditorIndex].xConfigured := FALSE;
	END_FOR;
	GVL_POINT.udiPointStorageVersion := GVL_POINT.udiExpectedPointStorageVersion;
END_IF;

// Единственное соответствие компактного редакторского индекса, стабильного
// E_POINT_NAME и прежнего индекса Persistent-массива. Три legacy-точки INSIDE
// пропущены; рецепты станков их не используют.
xPointTableReady := TRUE;
FOR uiPointEditorIndex := UINT#1 TO INT_TO_UINT(GVL_POINT.iEditablePointCount) DO
	uiPointStorageIndex := UINT#0;
	CASE uiPointEditorIndex OF
		UINT#1: ePointEditorName := E_POINT_NAME.MACHINE_1_ABOVE; uiPointStorageIndex := UINT#1;
		UINT#2: ePointEditorName := E_POINT_NAME.MACHINE_1_CHUCK_APROACH; uiPointStorageIndex := UINT#3;
		UINT#3: ePointEditorName := E_POINT_NAME.MACHINE_1_CHUCK_POSITION; uiPointStorageIndex := UINT#4;
		UINT#4: ePointEditorName := E_POINT_NAME.MACHINE_2_ABOVE; uiPointStorageIndex := UINT#5;
		UINT#5: ePointEditorName := E_POINT_NAME.MACHINE_2_CHUCK_APROACH; uiPointStorageIndex := UINT#7;
		UINT#6: ePointEditorName := E_POINT_NAME.MACHINE_2_CHUCK_POSITION; uiPointStorageIndex := UINT#8;
		UINT#7: ePointEditorName := E_POINT_NAME.MACHINE_3_ABOVE; uiPointStorageIndex := UINT#9;
		UINT#8: ePointEditorName := E_POINT_NAME.MACHINE_3_CHUCK_APROACH; uiPointStorageIndex := UINT#11;
		UINT#9: ePointEditorName := E_POINT_NAME.MACHINE_3_CHUCK_POSITION; uiPointStorageIndex := UINT#12;
		UINT#10: ePointEditorName := E_POINT_NAME.HOME_SAFETY; uiPointStorageIndex := UINT#13;
		UINT#11: ePointEditorName := E_POINT_NAME.MAGAZINE_1_DETAIL; uiPointStorageIndex := UINT#14;
		UINT#12: ePointEditorName := E_POINT_NAME.MAGAZINE_2_DETAIL; uiPointStorageIndex := UINT#15;
	ELSE
		ePointEditorName := E_POINT_NAME.NONE;
	END_CASE;

	IF (ePointEditorName <> E_POINT_NAME.NONE) AND (uiPointStorageIndex <> UINT#0) THEN
		GVL_POINT.Points[ePointEditorName] := GVL_POINT.astRetainPoints[uiPointStorageIndex];
		IF NOT GVL_POINT.astRetainPoints[uiPointStorageIndex].xConfigured THEN
			xPointTableReady := FALSE;
		END_IF;
	ELSE
		xPointTableReady := FALSE;
	END_IF;
END_FOR;
