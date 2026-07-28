METHOD UpdateErrorView : ST_MACHINE_ERROR
VAR_INPUT
	dwError : DWORD; // Битовая маска для расшифровки
END_VAR
VAR
	stError : ST_MACHINE_ERROR; // Представление ошибок отдельными флагами
END_VAR

// --- BEGIN IMPLEMENTATION ---

stError.WRONG_OPERATION := (dwError AND ERR_WRONG_OPERATION) <> DWORD#0;
stError.WRONG_COMMAND := (dwError AND ERR_WRONG_COMMAND) <> DWORD#0;
stError.ROBOT_MOTION := (dwError AND ERR_ROBOT_MOTION) <> DWORD#0;
stError.ROBOT_ACTION := (dwError AND ERR_ROBOT_ACTION) <> DWORD#0;
stError.DOOR_OPEN := (dwError AND ERR_DOOR_OPEN) <> DWORD#0;
stError.DOOR_CLOSE := (dwError AND ERR_DOOR_CLOSE) <> DWORD#0;
stError.CHUCK_OPEN := (dwError AND ERR_CHUCK_OPEN) <> DWORD#0;
stError.CHUCK_CLOSE := (dwError AND ERR_CHUCK_CLOSE) <> DWORD#0;
stError.CYCLE_START := (dwError AND ERR_CYCLE_START) <> DWORD#0;
stError.SAFETY_STOP := (dwError AND ERR_SAFETY_STOP) <> DWORD#0;
stError.UNKNOWN_DETAIL := (dwError AND ERR_UNKNOWN_DETAIL) <> DWORD#0;
stError.MACHINE_ALARM := (dwError AND ERR_MACHINE_ALARM) <> DWORD#0;
stError.INDEX_ERROR := (dwError AND ERR_INDEX) <> DWORD#0;
stError.DOOR_ROBOT := (dwError AND ERR_DOOR_ROBOT) <> DWORD#0;
stError.MACHINE_IDLE := (dwError AND ERR_MACHINE_IDLE) <> DWORD#0;

UpdateErrorView := stError;
