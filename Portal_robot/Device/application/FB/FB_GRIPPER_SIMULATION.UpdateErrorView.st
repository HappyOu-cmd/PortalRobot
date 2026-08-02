METHOD UpdateErrorView : ST_GRIPPER_ERROR
VAR_INPUT
	dwError : DWORD; // Битовая маска для расшифровки
END_VAR
VAR
	stError : ST_GRIPPER_ERROR; // Представление ошибок отдельными флагами
END_VAR

// --- BEGIN IMPLEMENTATION ---

stError.GRIPPER_1_ERROR := (dwError AND ERR_GRIPPER_1) <> DWORD#0;
stError.GRIPPER_2_ERROR := (dwError AND ERR_GRIPPER_2) <> DWORD#0;
stError.ROTATION_ERROR := (dwError AND ERR_GRIP_ROTATE) <> DWORD#0;
stError.ACTION_ERROR := (dwError AND ERR_GRIP_ACTION) <> DWORD#0;
stError.GLOBAL_ERROR := (dwError AND ERR_GRIP_GLOBAL) <> DWORD#0;

UpdateErrorView := stError;
