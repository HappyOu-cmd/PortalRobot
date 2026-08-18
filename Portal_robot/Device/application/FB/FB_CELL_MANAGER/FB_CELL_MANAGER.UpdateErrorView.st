METHOD PRIVATE UpdateErrorView : ST_CELL_ERROR
VAR_INPUT
	dwError : DWORD; // Битовая маска ошибок нового менеджера
END_VAR
VAR
	stError : ST_CELL_ERROR; // Совместимое представление ошибок
END_VAR

// --- BEGIN IMPLEMENTATION ---

stError.BOTH_GRIPPERS_OCCUPIED := (dwError AND ERR_BOTH_GRIPPERS) <> DWORD#0;
stError.ROBOT_ERROR := (dwError AND ERR_ROBOT) <> DWORD#0;
stError.MAGAZINE_ERROR := (dwError AND ERR_MAGAZINE) <> DWORD#0;
stError.MACHINE_ERROR := (dwError AND ERR_MACHINE) <> DWORD#0;
stError.GLOBAL_STOP := (dwError AND ERR_GLOBAL_STOP) <> DWORD#0;
UpdateErrorView := stError;
