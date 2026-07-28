METHOD UpdateErrorView : ST_MACHINE_SIM_ERROR
VAR_INPUT
	dwError : DWORD; // Битовая маска для расшифровки
END_VAR
VAR
	stError : ST_MACHINE_SIM_ERROR; // Представление ошибок отдельными флагами
END_VAR

// --- BEGIN IMPLEMENTATION ---

stError.MACHINE_ALARM := (dwError AND ERR_MACHINE_ALARM) <> DWORD#0;
stError.DOOR_FAULT := (dwError AND ERR_DOOR_FAULT) <> DWORD#0;
stError.CHUCK_FAULT := (dwError AND ERR_CHUCK_FAULT) <> DWORD#0;

UpdateErrorView := stError;
