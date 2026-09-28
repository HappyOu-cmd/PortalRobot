TYPE ST_TWO_PALLET_COMMAND :
STRUCT
	xEnable : BOOL;
	xConfirm : BOOL;
	xStart : BOOL; // Атомарно подтвердить актуальную расстановку и включить магазин
	xRejectStart : BOOL; // Оператор ответил «Нет» в предпусковом окне
	xDisable : BOOL;
	xSwap : BOOL;
	xPowerOn : BOOL;
	xPowerOff : BOOL;
	xDriveReset : BOOL;
	xHome : BOOL;
	xLower : BOOL;
	xRaise : BOOL;
	xSelectPallet : BOOL;
	xLockIn : BOOL;
	xLockOut : BOOL;
	xStopIn : BOOL;
	xStopOut : BOOL;
	xMoveToExchange : BOOL;
	xMoveToWork : BOOL;
	xStop : BOOL;
	xReset : BOOL;
	xJogPositive : BOOL;
	xJogNegative : BOOL;
	xJogRelease : BOOL;
	xTeachOperator : BOOL; // Запомнить текущую координату переключения/операторской зоны
	xTeachWork : BOOL; // Запомнить текущую рабочую координату выбранной палеты у робота
	uiPallet : UINT; // Номер подтверждаемой/выбираемой палеты, 1..2
	udiRevision : UDINT; // Ревизия расстановки для команды подтверждения
END_STRUCT
END_TYPE
