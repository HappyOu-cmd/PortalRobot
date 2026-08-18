TYPE ST_AXIS_HMI_COMMAND :
STRUCT
	xJogPositive      : BOOL; // Удерживаемый Jog в положительном направлении
	xJogNegative      : BOOL; // Удерживаемый Jog в отрицательном направлении
	xHome             : BOOL; // Импульс поиска домашней позиции выбранной оси
	xMoveAbsolute     : BOOL; // Импульс абсолютного перемещения к lrTargetPosition
	xMoveRelative     : BOOL; // Импульс относительного перемещения на lrRelativeDistance
	lrTargetPosition  : LREAL; // Целевая абсолютная координата оси
	lrRelativeDistance : LREAL; // Подготовленная дистанция относительного движения
END_STRUCT
END_TYPE
