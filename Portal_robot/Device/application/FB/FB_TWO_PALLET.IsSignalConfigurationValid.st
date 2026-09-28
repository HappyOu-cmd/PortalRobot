METHOD IsSignalConfigurationValid : BOOL
VAR_INPUT
	uiP1Signals : UINT;
	uiP2Signals : UINT;
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Рабочее положение каждого цилиндра подтверждает ровно один геркон.
// Зацепление должно различать палеты и при опущенной П2 во время обмена.
IsSignalConfigurationValid := (uiP1Signals <= UINT#63)
	AND (uiP2Signals <= UINT#63)
	AND (((uiP1Signals AND UINT#3) = UINT#1) OR ((uiP1Signals AND UINT#3) = UINT#2))
	AND (((uiP2Signals AND UINT#3) = UINT#1) OR ((uiP2Signals AND UINT#3) = UINT#2))
	AND (((uiP1Signals AND UINT#12) = UINT#4) OR ((uiP1Signals AND UINT#12) = UINT#8))
	AND (((uiP2Signals AND UINT#12) = UINT#4) OR ((uiP2Signals AND UINT#12) = UINT#8))
	AND (((uiP1Signals AND UINT#48) = UINT#16) OR ((uiP1Signals AND UINT#48) = UINT#32))
	AND (((uiP2Signals AND UINT#48) = UINT#16) OR ((uiP2Signals AND UINT#48) = UINT#32))
	AND ((uiP1Signals AND UINT#60) <> (uiP2Signals AND UINT#60));
