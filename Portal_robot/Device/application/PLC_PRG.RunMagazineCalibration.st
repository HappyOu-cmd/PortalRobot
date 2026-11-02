METHOD PRIVATE RunMagazineCalibration

// --- BEGIN IMPLEMENTATION ---

// Расчёт до автоматов магазинов: SAVE/смена метода текущего скана уже учтены.
FOR uiCalibrationMagazine := UINT#1 TO UINT#2 DO
	IF uiCalibrationMagazine = UINT#1 THEN
		eCalibrationOrigin := E_POINT_NAME.MAGAZINE_1_DETAIL;
		eCalibrationPointB := E_POINT_NAME.MAGAZINE_1_AXIS_X;
		eCalibrationPointC := E_POINT_NAME.MAGAZINE_1_AXIS_Y;
	ELSE
		eCalibrationOrigin := E_POINT_NAME.MAGAZINE_2_DETAIL;
		eCalibrationPointB := E_POINT_NAME.MAGAZINE_2_AXIS_X;
		eCalibrationPointC := E_POINT_NAME.MAGAZINE_2_AXIS_Y;
	END_IF;
	GVL_POINT.Points[eCalibrationPointB] := Persistent_Value.astMagazineCalibration[uiCalibrationMagazine].astReference[1];
	GVL_POINT.Points[eCalibrationPointC] := Persistent_Value.astMagazineCalibration[uiCalibrationMagazine].astReference[2];
	astMagazineFrame[uiCalibrationMagazine] := F_MAGAZINE_FRAME(
		stOrigin := GVL_POINT.Points[eCalibrationOrigin],
		stCalibration := Persistent_Value.astMagazineCalibration[uiCalibrationMagazine],
		uiRows := GVL_CELL_SETTINGS.MagazineRows,
		uiColumns := GVL_CELL_SETTINGS.MagazineColumns,
		lrPitchX := GVL_HMI.MagazinePitchX,
		lrPitchY := GVL_HMI.MagazinePitchY);
	// Контракт Modbus передаёт слот, внешнему контроллеру новый базис не передаётся.
	IF GVL_HMI.xModbusMode AND (Persistent_Value.astMagazineCalibration[uiCalibrationMagazine].uiMethod = UINT#3) THEN
		astMagazineFrame[uiCalibrationMagazine].xReady := FALSE;
		astMagazineFrame[uiCalibrationMagazine].uiReason := UINT#5;
	END_IF;
	axMagazinePointsReady[uiCalibrationMagazine] := astMagazineFrame[uiCalibrationMagazine].xReady;
	GVL_HMI.astMagazineCalibrationStatus[uiCalibrationMagazine].xReady := axMagazinePointsReady[uiCalibrationMagazine];
	GVL_HMI.astMagazineCalibrationStatus[uiCalibrationMagazine].uiReason := astMagazineFrame[uiCalibrationMagazine].uiReason;
	xPointTableReady := xPointTableReady AND axMagazinePointsReady[uiCalibrationMagazine];
END_FOR;
