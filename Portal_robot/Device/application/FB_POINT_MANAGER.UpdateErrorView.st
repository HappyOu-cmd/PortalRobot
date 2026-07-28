METHOD UpdateErrorView : ST_POINT_MANAGER_ERROR
VAR_INPUT
	dwError : DWORD;
END_VAR
VAR
	stError: ST_POINT_MANAGER_ERROR;
END_VAR
// --- BEGIN IMPLEMENTATION ---

stError.X_OUT_OF_LIMIT    := (dwError AND X_OUT_OF_LIMIT ) <> 0;
stError.Y_OUT_OF_LIMIT := (dwError AND Y_OUT_OF_LIMIT ) <> 0;
stError.Z_OUT_OF_LIMIT := (dwError AND Z_OUT_OF_LIMIT ) <> 0;
stError.INVALID_VEL    := (dwError AND INVALID_VEL ) <> 0;

UpdateErrorView := stError;