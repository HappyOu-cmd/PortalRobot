METHOD UpdateErrorView : ST_MOTION_MANAGER_ERROR
VAR_INPUT
	dwError : DWORD; // Битовая маска для расшифровки
END_VAR
VAR
	stError : ST_MOTION_MANAGER_ERROR; // Представление ошибок отдельными флагами
END_VAR

// --- BEGIN IMPLEMENTATION ---

stError.POINT_INVALID := (dwError AND ERR_POINT_INVALID) <> DWORD#0;
stError.GROUP_ERROR := (dwError AND ERR_GROUP) <> DWORD#0;
stError.GLOBAL_STOP := (dwError AND ERR_GLOBAL_STOP) <> DWORD#0;

UpdateErrorView := stError;
