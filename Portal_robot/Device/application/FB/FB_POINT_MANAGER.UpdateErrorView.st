METHOD UpdateErrorView : ST_POINT_MANAGER_ERROR
VAR_INPUT
	dwError : DWORD; // Битовая маска для расшифровки
END_VAR
VAR
	stError : ST_POINT_MANAGER_ERROR; // Представление ошибок отдельными флагами
END_VAR

// --- BEGIN IMPLEMENTATION ---

stError.X_OUT_OF_LIMIT := (dwError AND X_OUT_OF_LIMIT) <> DWORD#0;
stError.Y_OUT_OF_LIMIT := (dwError AND Y_OUT_OF_LIMIT) <> DWORD#0;
stError.Z_OUT_OF_LIMIT := (dwError AND Z_OUT_OF_LIMIT) <> DWORD#0;
stError.INVALID_VEL := (dwError AND INVALID_VEL) <> DWORD#0;
stError.X_LIMIT_CONFIG_INVALID := (dwError AND X_LIMIT_CONFIG_INVALID) <> DWORD#0;
stError.Y_LIMIT_CONFIG_INVALID := (dwError AND Y_LIMIT_CONFIG_INVALID) <> DWORD#0;
stError.Z_LIMIT_CONFIG_INVALID := (dwError AND Z_LIMIT_CONFIG_INVALID) <> DWORD#0;

UpdateErrorView := stError;
