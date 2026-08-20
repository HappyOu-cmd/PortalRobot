TYPE ST_ROBOT_HMI_STATUS :
STRUCT
	xDrivesPowered       : BOOL; // Все три привода фактически включены
	xDrivesOff           : BOOL; // Все три привода и группа фактически отключены
	xPowerTransitionActive : BOOL; // Выполняется последовательность включения или отключения
	xDrivesEnableAllowed : BOOL; // PLC разрешает включение приводов
	xDrivesDisableAllowed : BOOL; // PLC разрешает отключение приводов
	xResetAllowed        : BOOL; // PLC разрешает команду сброса ручного управления
	xStopAllowed         : BOOL; // PLC разрешает контролируемую остановку
	xPointsAllowed        : BOOL; // PLC разрешает переход к именованной точке
	xGripperAllowed       : BOOL; // PLC разрешает действие захвата
	xGripper1OpenAllowed  : BOOL;
	xGripper1CloseAllowed : BOOL;
	xGripper2OpenAllowed  : BOOL;
	xGripper2CloseAllowed : BOOL;
	xRotateToBlankAllowed : BOOL;
	xRotateToDetailAllowed : BOOL;
	xCommandBusy          : BOOL;
	uiActiveAction        : UINT;
	uiActivePoint         : UINT;
	eRejectReason         : E_HMI_MANUAL_REJECT; // Числовая причина недоступности команды
END_STRUCT
END_TYPE
