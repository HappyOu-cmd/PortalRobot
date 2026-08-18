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
stError.MODBUS_COMMUNICATION_ERROR := (dwError AND ERR_ROBOT_MODBUS_COMM) <> DWORD#0;
stError.EXTERNAL_ROBOT_ALARM := (dwError AND ERR_EXTERNAL_ROBOT) <> DWORD#0;
stError.MODBUS_ERROR := stError.MODBUS_COMMUNICATION_ERROR OR stError.EXTERNAL_ROBOT_ALARM;
stError.STOP_ERROR := (dwError AND ERR_ROBOT_STOP) <> DWORD#0;

UpdateErrorView := stError;
