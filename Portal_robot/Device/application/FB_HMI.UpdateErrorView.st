METHOD UpdateErrorView : ST_HMI_ERROR
VAR_INPUT
	dwError : DWORD; // Битовая маска для расшифровки
END_VAR
VAR
	stError : ST_HMI_ERROR; // Представление ошибок отдельными флагами
END_VAR

// --- BEGIN IMPLEMENTATION ---

stError.INTERNAL_ERROR := (dwError AND ERR_INTERNAL) <> DWORD#0;

UpdateErrorView := stError;
