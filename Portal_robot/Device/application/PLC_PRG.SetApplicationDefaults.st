METHOD PRIVATE SetApplicationDefaults

// --- BEGIN IMPLEMENTATION ---

// При первом запуске этой схемы намеренно отбрасываем прежние инженерные
// координаты. Нулевая скорость и xConfigured=FALSE не позволяют принять
// нулевую точку за пригодную для движения.
IF GVL_POINT.udiPointStorageVersion <> GVL_POINT.udiExpectedPointStorageVersion THEN
	FOR uiPointEditorIndex := UINT#1 TO INT_TO_UINT(GVL_POINT.iEditablePointCount) DO
		GVL_POINT.astRetainPoints[uiPointEditorIndex].Name := '';
		GVL_POINT.astRetainPoints[uiPointEditorIndex].X := 0.0;
		GVL_POINT.astRetainPoints[uiPointEditorIndex].Y := 0.0;
		GVL_POINT.astRetainPoints[uiPointEditorIndex].Z := 0.0;
		GVL_POINT.astRetainPoints[uiPointEditorIndex].SpeedFactor := 0.0;
		GVL_POINT.astRetainPoints[uiPointEditorIndex].xConfigured := FALSE;
	END_FOR;
	GVL_POINT.udiPointStorageVersion := GVL_POINT.udiExpectedPointStorageVersion;
END_IF;

// Единственное соответствие редакторского индекса и стабильного E_POINT_NAME.
// Из RETAIN восстанавливаются только 15 базовых точек; временные магазинные
// точки рассчитываются владельцем команды непосредственно перед движением.
xPointTableReady := TRUE;
FOR uiPointEditorIndex := UINT#1 TO INT_TO_UINT(GVL_POINT.iEditablePointCount) DO
	CASE uiPointEditorIndex OF
		UINT#1: ePointEditorName := E_POINT_NAME.MACHINE_1_ABOVE;
		UINT#2: ePointEditorName := E_POINT_NAME.MACHINE_1_INSIDE;
		UINT#3: ePointEditorName := E_POINT_NAME.MACHINE_1_CHUCK_APROACH;
		UINT#4: ePointEditorName := E_POINT_NAME.MACHINE_1_CHUCK_POSITION;
		UINT#5: ePointEditorName := E_POINT_NAME.MACHINE_2_ABOVE;
		UINT#6: ePointEditorName := E_POINT_NAME.MACHINE_2_INSIDE;
		UINT#7: ePointEditorName := E_POINT_NAME.MACHINE_2_CHUCK_APROACH;
		UINT#8: ePointEditorName := E_POINT_NAME.MACHINE_2_CHUCK_POSITION;
		UINT#9: ePointEditorName := E_POINT_NAME.MACHINE_3_ABOVE;
		UINT#10: ePointEditorName := E_POINT_NAME.MACHINE_3_INSIDE;
		UINT#11: ePointEditorName := E_POINT_NAME.MACHINE_3_CHUCK_APROACH;
		UINT#12: ePointEditorName := E_POINT_NAME.MACHINE_3_CHUCK_POSITION;
		UINT#13: ePointEditorName := E_POINT_NAME.HOME_SAFETY;
		UINT#14: ePointEditorName := E_POINT_NAME.MAGAZINE_1_DETAIL;
		UINT#15: ePointEditorName := E_POINT_NAME.MAGAZINE_2_DETAIL;
	ELSE
		ePointEditorName := E_POINT_NAME.NONE;
	END_CASE;

	IF ePointEditorName <> E_POINT_NAME.NONE THEN
		GVL_POINT.Points[ePointEditorName] := GVL_POINT.astRetainPoints[uiPointEditorIndex];
		IF NOT GVL_POINT.astRetainPoints[uiPointEditorIndex].xConfigured THEN
			xPointTableReady := FALSE;
		END_IF;
	ELSE
		xPointTableReady := FALSE;
	END_IF;
END_FOR;
