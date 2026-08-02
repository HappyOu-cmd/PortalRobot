TYPE ST_AXIS_GROUP_ERROR :
STRUCT
	ENABLE_ERROR          : BOOL; // Ошибка MC_GroupEnable
	POWER_ERROR           : BOOL; // Ошибка SMC_GroupPower
	DISABLE_ERROR         : BOOL; // Ошибка MC_GroupDisable
	RESET_ERROR           : BOOL; // Ошибка MC_GroupReset
	MOVE_DIRECT_ERROR     : BOOL; // Ошибка MC_MoveDirectAbsolute
	MOVE_LINEAR_ERROR     : BOOL; // Ошибка MC_MoveLinearAbsolute
	HALT_ERROR            : BOOL; // Ошибка MC_GroupHalt
	STOP_ERROR            : BOOL; // Ошибка MC_GroupStop
	READ_POSITION_ERROR   : BOOL; // Ошибка чтения позиции группы
	READ_STATUS_ERROR     : BOOL; // Ошибка чтения статуса группы
	READ_GROUP_ERROR      : BOOL; // Ошибка чтения кода ошибки группы
	GROUP_ERROR_STOP      : BOOL; // Группа SoftMotion находится в ErrorStop
	STEP_TIMEOUT          : BOOL; // Превышено время выполнения шага
	INVALID_STATE         : BOOL; // Неизвестное состояние автомата
	POWER_PERMIT_READY    : BOOL; // Нет разрешения питания в готовности
	POWER_PERMIT_LOST     : BOOL; // Потеря разрешения питания в движении
END_STRUCT
END_TYPE
