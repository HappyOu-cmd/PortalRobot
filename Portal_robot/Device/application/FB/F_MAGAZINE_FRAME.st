FUNCTION F_MAGAZINE_FRAME : ST_MAGAZINE_FRAME
VAR_INPUT
	stOrigin : ST_POINT;
	stCalibration : ST_MAGAZINE_CALIBRATION;
	uiRows : UINT;
	uiColumns : UINT;
	lrPitchX : LREAL;
	lrPitchY : LREAL;
END_VAR
VAR
	stFrame : ST_MAGAZINE_FRAME;
	stVectorAB : ST_MAGAZINE_VECTOR;
	stVectorAC : ST_MAGAZINE_VECTOR;
	stPlaneNormal : ST_MAGAZINE_VECTOR;
	lrVectorABLength : LREAL;
	lrPlaneNormalLength : LREAL;
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Одноточечный режим сохраняет прежние направления мировых X/Y.
stFrame.stAxisX.X := 1.0; stFrame.stAxisX.Y := 0.0; stFrame.stAxisX.Z := 0.0;
stFrame.stAxisY.X := 0.0; stFrame.stAxisY.Y := 1.0; stFrame.stAxisY.Z := 0.0;
stFrame.stAxisZ.X := 0.0; stFrame.stAxisZ.Y := 0.0; stFrame.stAxisZ.Z := 1.0;
stFrame.xReady := FALSE;
stFrame.uiReason := UINT#0;
IF NOT stOrigin.xConfigured
OR (stOrigin.MagazineSafeZ = 0.0) OR (stOrigin.MagazineChangeZ = 0.0) THEN
	stFrame.uiReason := UINT#1;
ELSIF ((stCalibration.uiMethod <> UINT#1) AND (stCalibration.uiMethod <> UINT#3))
OR (uiRows = UINT#0) OR (uiColumns = UINT#0)
OR NOT ((lrPitchX >= 1.0) AND (lrPitchX <= 5000.0)
	AND (lrPitchY >= 1.0) AND (lrPitchY <= 5000.0)) THEN
	stFrame.uiReason := UINT#2;
ELSIF stCalibration.uiMethod = UINT#1 THEN
	stFrame.xReady := TRUE;
ELSIF (uiRows < UINT#2) OR (uiColumns < UINT#2) THEN
	stFrame.uiReason := UINT#2;
ELSIF NOT stCalibration.astReference[1].xConfigured
OR NOT stCalibration.astReference[2].xConfigured THEN
	stFrame.uiReason := UINT#3;
ELSE
	stVectorAB.X := stCalibration.astReference[1].X - stOrigin.X;
	stVectorAB.Y := stCalibration.astReference[1].Y - stOrigin.Y;
	stVectorAB.Z := stCalibration.astReference[1].Z - stOrigin.Z;
	stVectorAC.X := stCalibration.astReference[2].X - stOrigin.X;
	stVectorAC.Y := stCalibration.astReference[2].Y - stOrigin.Y;
	stVectorAC.Z := stCalibration.astReference[2].Z - stOrigin.Z;
	stPlaneNormal.X := stVectorAB.Y * stVectorAC.Z - stVectorAB.Z * stVectorAC.Y;
	stPlaneNormal.Y := stVectorAB.Z * stVectorAC.X - stVectorAB.X * stVectorAC.Z;
	stPlaneNormal.Z := stVectorAB.X * stVectorAC.Y - stVectorAB.Y * stVectorAC.X;
	lrVectorABLength := SQRT(stVectorAB.X * stVectorAB.X + stVectorAB.Y * stVectorAB.Y + stVectorAB.Z * stVectorAB.Z);
	lrPlaneNormalLength := SQRT(stPlaneNormal.X * stPlaneNormal.X + stPlaneNormal.Y * stPlaneNormal.Y + stPlaneNormal.Z * stPlaneNormal.Z);
	// Только математическая определённость: допуски размеров/углов не применяются.
	IF (lrVectorABLength > 0.0) AND (lrPlaneNormalLength > 0.0) THEN
		stFrame.stAxisX.X := stVectorAB.X / lrVectorABLength;
		stFrame.stAxisX.Y := stVectorAB.Y / lrVectorABLength;
		stFrame.stAxisX.Z := stVectorAB.Z / lrVectorABLength;
		stFrame.stAxisZ.X := stPlaneNormal.X / lrPlaneNormalLength;
		stFrame.stAxisZ.Y := stPlaneNormal.Y / lrPlaneNormalLength;
		stFrame.stAxisZ.Z := stPlaneNormal.Z / lrPlaneNormalLength;
		stFrame.stAxisY.X := stFrame.stAxisZ.Y * stFrame.stAxisX.Z - stFrame.stAxisZ.Z * stFrame.stAxisX.Y;
		stFrame.stAxisY.Y := stFrame.stAxisZ.Z * stFrame.stAxisX.X - stFrame.stAxisZ.X * stFrame.stAxisX.Z;
		stFrame.stAxisY.Z := stFrame.stAxisZ.X * stFrame.stAxisX.Y - stFrame.stAxisZ.Y * stFrame.stAxisX.X;
		// Сравнения также не принимают NaN/Inf после нечисловых входных данных.
		stFrame.xReady := (ABS(stFrame.stAxisX.X) <= 2.0) AND (ABS(stFrame.stAxisX.Y) <= 2.0)
			AND (ABS(stFrame.stAxisX.Z) <= 2.0) AND (ABS(stFrame.stAxisY.X) <= 2.0)
			AND (ABS(stFrame.stAxisY.Y) <= 2.0) AND (ABS(stFrame.stAxisY.Z) <= 2.0)
			AND (ABS(stFrame.stAxisZ.X) <= 2.0) AND (ABS(stFrame.stAxisZ.Y) <= 2.0)
			AND (ABS(stFrame.stAxisZ.Z) <= 2.0)
			AND ((stFrame.stAxisX.X * stFrame.stAxisX.X + stFrame.stAxisX.Y * stFrame.stAxisX.Y + stFrame.stAxisX.Z * stFrame.stAxisX.Z) > 0.0)
			AND ((stFrame.stAxisZ.X * stFrame.stAxisZ.X + stFrame.stAxisZ.Y * stFrame.stAxisZ.Y + stFrame.stAxisZ.Z * stFrame.stAxisZ.Z) > 0.0);
	END_IF;
	IF NOT stFrame.xReady THEN stFrame.uiReason := UINT#4; END_IF;
END_IF;
F_MAGAZINE_FRAME := stFrame;
