TYPE ST_AXIS_ERROR :
STRUCT
	MC_POWER_ERROR       : BOOL; // Ошибка MC_Power
	MC_RESET_ERROR       : BOOL; // Ошибка MC_Reset
	MC_STOP_ERROR        : BOOL; // Ошибка MC_Stop
	MC_JOG_ERROR         : BOOL; // Ошибка MC_Jog
	MC_HOME_ERROR        : BOOL; // Ошибка MC_Home
	MC_MOVE_ABS_ERROR    : BOOL; // Ошибка MC_MoveAbsolute
	MC_MOVE_REL_ERROR    : BOOL; // Ошибка MC_MoveRelative
	READ_POSITION_ERROR  : BOOL; // Ошибка чтения позиции
	READ_STATUS_ERROR    : BOOL; // Ошибка чтения статуса оси
	AXIS_ERRORSTOP       : BOOL; // Ось находится в ErrorStop
	FB_ERROR_OCCURRED    : BOOL; // SoftMotion сообщил внутреннюю ошибку
	COMMAND_ABORTED      : BOOL; // Команда движения была прервана
	UNKNOWN_AXIS_ERROR   : BOOL; // Неизвестная ошибка оси
	DRIVE_AXIS_ERROR     : BOOL; // Ошибка привода оси
	POWER_FEEDBACK_LOST  : BOOL; // Потеря силовой готовности при активной команде питания
	POWER_PERMIT_LOST    : BOOL; // Потеря разрешения питания
	GLOBAL_DURING_POWER  : BOOL; // Глобальная ошибка при включении
	GLOBAL_DURING_READY  : BOOL; // Глобальная ошибка в готовности
	GLOBAL_DURING_MOTION : BOOL; // Глобальная ошибка во время движения
	JOG_CONFLICT         : BOOL; // Одновременно поданы Jog+ и Jog-
	MOVE_ABS_NOT_HOMED   : BOOL; // Абсолютное движение без Home
	MOVE_REL_NOT_HOMED   : BOOL; // Относительное движение без Home
	STEP_TIMEOUT         : BOOL; // Превышено время выполнения шага
	UNKNOWN_STEP         : BOOL; // Неизвестное состояние автомата
END_STRUCT
END_TYPE
