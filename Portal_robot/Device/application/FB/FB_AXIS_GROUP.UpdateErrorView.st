METHOD UpdateErrorView : ST_AXIS_GROUP_ERROR
VAR_INPUT
	dwMotionError : DWORD; // Маска ошибок блоков SoftMotion
	dwLogicalError: DWORD; // Маска логических ошибок группы
END_VAR
VAR
	stError : ST_AXIS_GROUP_ERROR; // Представление ошибок отдельными флагами
END_VAR

// --- BEGIN IMPLEMENTATION ---

stError.ENABLE_ERROR := (dwMotionError AND MOTION_ERR_ENABLE) <> DWORD#0;
stError.POWER_ERROR := (dwMotionError AND MOTION_ERR_POWER) <> DWORD#0;
stError.DISABLE_ERROR := (dwMotionError AND MOTION_ERR_DISABLE) <> DWORD#0;
stError.RESET_ERROR := (dwMotionError AND MOTION_ERR_RESET) <> DWORD#0;
stError.MOVE_DIRECT_ERROR := (dwMotionError AND MOTION_ERR_MOVE_DIRECT) <> DWORD#0;
stError.MOVE_LINEAR_ERROR := (dwMotionError AND MOTION_ERR_MOVE_LINEAR) <> DWORD#0;
stError.HALT_ERROR := (dwMotionError AND MOTION_ERR_HALT) <> DWORD#0;
stError.STOP_ERROR := (dwMotionError AND MOTION_ERR_STOP) <> DWORD#0;
stError.READ_POSITION_ERROR := (dwMotionError AND MOTION_ERR_READ_POSITION) <> DWORD#0;
stError.READ_STATUS_ERROR := (dwMotionError AND MOTION_ERR_READ_STATUS) <> DWORD#0;
stError.READ_GROUP_ERROR := (dwMotionError AND MOTION_ERR_READ_GROUP_ERROR) <> DWORD#0;
stError.GROUP_ERROR_STOP := (dwMotionError AND MOTION_ERR_GROUP_ERROR_STOP) <> DWORD#0;

stError.STEP_TIMEOUT := (dwLogicalError AND LOG_STEP_TIMEOUT) <> DWORD#0;
stError.INVALID_STATE := (dwLogicalError AND LOG_INVALID_STATE) <> DWORD#0;
stError.POWER_PERMIT_READY := (dwLogicalError AND LOG_POWER_PERMIT_READY) <> DWORD#0;
stError.POWER_PERMIT_LOST := (dwLogicalError AND LOG_POWER_PERMIT_LOST_DIRECT) <> DWORD#0;

UpdateErrorView := stError;
