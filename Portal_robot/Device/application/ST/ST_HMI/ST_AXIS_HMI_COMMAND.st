TYPE ST_AXIS_HMI_COMMAND :
STRUCT
	xJogPositive      : BOOL; // Удерживаемый Jog в положительном направлении
	xJogNegative      : BOOL; // Удерживаемый Jog в отрицательном направлении
	{attribute 'symbol' := 'read'}
	xHome             : BOOL; // Импульс поиска домашней позиции выбранной оси
	{attribute 'symbol' := 'read'}
	xMoveAbsolute     : BOOL; // Импульс абсолютного перемещения к lrTargetPosition
	{attribute 'symbol' := 'read'}
	xMoveRelative     : BOOL; // Импульс относительного перемещения на lrRelativeDistance
	lrTargetPosition  : LREAL; // Целевая абсолютная координата оси
	lrRelativeDistance : LREAL; // Подготовленная дистанция относительного движения
END_STRUCT
END_TYPE
