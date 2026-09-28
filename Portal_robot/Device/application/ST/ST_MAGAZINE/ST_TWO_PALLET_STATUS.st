TYPE ST_TWO_PALLET_STATUS :
STRUCT
	uiStep : UINT;
	uiFaultStep : UINT; // Шаг, на котором появился последний новый аварийный бит
	uiCandidate : UINT; // Расстановка, совместимая с датчиками; не измерение палет
	uiRobotPallet : UINT := 1; // Учётный номер, меняется только после подтверждения/завершения обмена
	uiSelected : UINT;
	udiRevision : UDINT;
	xEnabled : BOOL;
	xConfirmed : BOOL;
	xReady : BOOL;
	xBusy : BOOL;
	xError : BOOL;
	xHomeRequired : BOOL;
	xConfigValid : BOOL;
	xConfirmAllowed : BOOL;
	xStartAllowed : BOOL;
	xEnableAllowed : BOOL;
	xSwapAllowed : BOOL;
	xPowerAllowed : BOOL;
	xDriveResetAllowed : BOOL;
	xHomeAllowed : BOOL;
	xLowerAllowed : BOOL;
	xRaiseAllowed : BOOL;
	xSelectAllowed : BOOL;
	xLockAllowed : BOOL;
	xStopAllowed : BOOL;
	xMoveAllowed : BOOL;
	xJogAllowed : BOOL;
	xTeachOperatorAllowed : BOOL;
	xTeachWorkAllowed : BOOL;
	xResetAllowed : BOOL;
	xEditAllowed : BOOL;
	xEdit1Allowed : BOOL;
	xEdit2Allowed : BOOL;
	xConfigAllowed : BOOL;
	xCompleted : BOOL;
	xCommandAccepted : BOOL;
	uiReason : UINT;
	dwError : DWORD;
	stWarning : ST_WARNING_EVENT;
	Input : ST_TWO_PALLET_INPUT;
	rP1 : REAL; // Оценка нормализованного положения для 3D, не датчик палеты
	rP2 : REAL;
	rLift : REAL;
	xAutoSwapEnabled : BOOL; // Настройка автоматической смены палет
END_STRUCT
END_TYPE
