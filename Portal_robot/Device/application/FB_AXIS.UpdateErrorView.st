METHOD UpdateErrorView : ST_AXIS_ERROR
VAR_INPUT
	dwAxisError   : DWORD; // Маска ошибок SoftMotion и привода
	dwLogicalError: DWORD; // Маска логических ошибок оси
END_VAR
VAR
	stError : ST_AXIS_ERROR; // Представление ошибок отдельными флагами
END_VAR

// --- BEGIN IMPLEMENTATION ---

stError.MC_POWER_ERROR := (dwAxisError AND AXE_MC_POWER_ERROR) <> DWORD#0;
stError.MC_RESET_ERROR := (dwAxisError AND AXE_MC_RESET_ERROR) <> DWORD#0;
stError.MC_STOP_ERROR := (dwAxisError AND AXE_MC_STOP_ERROR) <> DWORD#0;
stError.MC_JOG_ERROR := (dwAxisError AND AXE_MC_JOG_ERROR) <> DWORD#0;
stError.MC_HOME_ERROR := (dwAxisError AND AXE_MC_HOME_ERROR) <> DWORD#0;
stError.MC_MOVE_ABS_ERROR := (dwAxisError AND AXE_MC_MOVE_ABS_ERROR) <> DWORD#0;
stError.MC_MOVE_REL_ERROR := (dwAxisError AND AXE_MC_MOVE_REL_ERROR) <> DWORD#0;
stError.READ_POSITION_ERROR := (dwAxisError AND AXE_READ_POS_ERROR) <> DWORD#0;
stError.READ_STATUS_ERROR := (dwAxisError AND AXE_READ_STATUS_ERROR) <> DWORD#0;
stError.AXIS_ERRORSTOP := (dwAxisError AND AXE_ERRORSTOP) <> DWORD#0;
stError.FB_ERROR_OCCURRED := (dwAxisError AND AXE_FB_ERROR_OCCURRED) <> DWORD#0;
stError.COMMAND_ABORTED := (dwAxisError AND AXE_COMMAND_ABORTED) <> DWORD#0;
stError.UNKNOWN_AXIS_ERROR := (dwAxisError AND AXE_UNKNOWN_ACTUAL_ERROR) <> DWORD#0;
stError.DRIVE_AXIS_ERROR := (dwAxisError AND AXE_DRIVE_AXIS_ERROR) <> DWORD#0;

stError.POWER_PERMIT_LOST := (dwLogicalError AND LOG_POWER_PERMIT_LOST) <> DWORD#0;
stError.GLOBAL_DURING_POWER := (dwLogicalError AND LOG_GLOBAL_DURING_POWER) <> DWORD#0;
stError.GLOBAL_DURING_READY := (dwLogicalError AND LOG_GLOBAL_DURING_READY) <> DWORD#0;
stError.GLOBAL_DURING_MOTION := (dwLogicalError AND LOG_GLOBAL_DURING_MOTION) <> DWORD#0;
stError.JOG_CONFLICT := (dwLogicalError AND LOG_JOG_CONFLICT) <> DWORD#0;
stError.MOVE_ABS_NOT_HOMED := (dwLogicalError AND LOG_MOVE_ABS_NOT_HOMED) <> DWORD#0;
stError.MOVE_REL_NOT_HOMED := (dwLogicalError AND LOG_MOVE_REL_NOT_HOMED) <> DWORD#0;
stError.STEP_TIMEOUT := (dwLogicalError AND LOG_STEP_TIMEOUT) <> DWORD#0;
stError.UNKNOWN_STEP := (dwLogicalError AND LOG_UNKNOWN_STEP) <> DWORD#0;

UpdateErrorView := stError;
