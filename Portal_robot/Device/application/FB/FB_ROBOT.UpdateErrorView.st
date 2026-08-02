METHOD UpdateErrorView : ST_ROBOT_ERROR
VAR_INPUT
	dwError : DWORD; // Битовая маска для расшифровки
END_VAR
VAR
	stError : ST_ROBOT_ERROR; // Представление ошибок отдельными флагами
END_VAR

// --- BEGIN IMPLEMENTATION ---

stError.WRONG_ACTION := (dwError AND ERR_ROBOT_WRONG_ACTION) <> DWORD#0;
stError.MOTION_ERROR := (dwError AND ERR_ROBOT_MOTION) <> DWORD#0;
stError.GRIPPER_ERROR := (dwError AND ERR_ROBOT_GRIPPER) <> DWORD#0;
stError.MODBUS_ERROR := (dwError AND ERR_ROBOT_MODBUS_STUB) <> DWORD#0;
stError.STOP_ERROR := (dwError AND ERR_ROBOT_STOP) <> DWORD#0;

UpdateErrorView := stError;
