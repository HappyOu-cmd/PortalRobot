METHOD PRIVATE InvalidateMagazineCalibration
VAR_INPUT
	uiMagazine : UINT;
END_VAR
VAR
	eOrigin : E_POINT_NAME;
	ePointB : E_POINT_NAME;
	ePointC : E_POINT_NAME;
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Все три признака снимаются одной PLC-транзакцией; координаты остаются черновиком.
IF (uiMagazine >= UINT#1) AND (uiMagazine <= UINT#2) THEN
	IF uiMagazine = UINT#1 THEN
		eOrigin := E_POINT_NAME.MAGAZINE_1_DETAIL;
		ePointB := E_POINT_NAME.MAGAZINE_1_AXIS_X;
		ePointC := E_POINT_NAME.MAGAZINE_1_AXIS_Y;
	ELSE
		eOrigin := E_POINT_NAME.MAGAZINE_2_DETAIL;
		ePointB := E_POINT_NAME.MAGAZINE_2_AXIS_X;
		ePointC := E_POINT_NAME.MAGAZINE_2_AXIS_Y;
	END_IF;
	Persistent_Value.astRetainPoints[UINT#13 + uiMagazine].xConfigured := FALSE;
	Persistent_Value.astMagazineCalibration[uiMagazine].astReference[1].xConfigured := FALSE;
	Persistent_Value.astMagazineCalibration[uiMagazine].astReference[2].xConfigured := FALSE;
	GVL_POINT.Points[eOrigin].xConfigured := FALSE;
	GVL_POINT.Points[ePointB].xConfigured := FALSE;
	GVL_POINT.Points[ePointC].xConfigured := FALSE;
	axMagazinePointsReady[uiMagazine] := FALSE;
	astMagazineFrame[uiMagazine].xReady := FALSE;
	GVL_HMI.astMagazineCalibrationStatus[uiMagazine].xReady := FALSE;
	xPointTableReady := FALSE;
END_IF;
