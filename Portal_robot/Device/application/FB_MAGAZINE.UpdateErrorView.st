METHOD UpdateErrorView : ST_MAGAZINE_ERROR
VAR_INPUT
	dwError : DWORD; // Битовая маска для расшифровки
END_VAR
VAR
	stError : ST_MAGAZINE_ERROR; // Представление ошибок отдельными флагами
END_VAR

// --- BEGIN IMPLEMENTATION ---

stError.WRONG_OPERATION := (dwError AND ERR_WRONG_OPERATION) <> DWORD#0;
stError.NO_BLANK := (dwError AND ERR_NO_BLANK) <> DWORD#0;
stError.NO_FREE_SLOT := (dwError AND ERR_NO_FREE_SLOT) <> DWORD#0;
stError.INVALID_SLOT := (dwError AND ERR_INVALID_SLOT) <> DWORD#0;
stError.SLOT_CONTENT := (dwError AND ERR_SLOT_CONTENT) <> DWORD#0;
stError.ROBOT_ERROR := (dwError AND ERR_ROBOT) <> DWORD#0;
stError.GLOBAL_STOP := (dwError AND ERR_GLOBAL_STOP) <> DWORD#0;
stError.GEOMETRY_ERROR := (dwError AND ERR_GEOMETRY) <> DWORD#0;

UpdateErrorView := stError;
