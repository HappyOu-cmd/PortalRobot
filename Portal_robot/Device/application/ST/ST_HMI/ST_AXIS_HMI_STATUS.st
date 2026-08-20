TYPE ST_AXIS_HMI_STATUS :
STRUCT
	xJogPositiveAllowed   : BOOL; // PLC разрешает положительный Jog
	xJogNegativeAllowed   : BOOL; // PLC разрешает отрицательный Jog
	xHomeAllowed          : BOOL; // PLC разрешает поиск домашней позиции
	xMoveAbsoluteAllowed  : BOOL; // PLC разрешает абсолютное движение
	xMoveRelativePositiveAllowed : BOOL; // PLC разрешает положительный короткий шаг
	xMoveRelativeNegativeAllowed : BOOL; // PLC разрешает отрицательный короткий шаг
	xDriveReady           : BOOL; // Ось включена и готова к движению
	xBusy                 : BOOL; // Ось выполняет ручную команду
	xError                : BOOL; // На оси есть ошибка
	xHomed                : BOOL; // Ось прошла поиск домашней позиции
	lrActualPosition      : LREAL; // Фактическая координата
	lrTargetPosition      : LREAL; // Принятая целевая координата
	lrDeviation           : LREAL; // Отклонение фактической координаты от цели
	lrMinPosition         : LREAL; // Нижний программный предел
	lrMaxPosition         : LREAL; // Верхний программный предел
	lrCommandVelocity     : LREAL; // Фактически заданная скорость ручного движения
	lrMaxVelocity         : LREAL; // Скорость, соответствующая 100 процентам
	eRejectReason         : E_HMI_MANUAL_REJECT; // Числовая причина недоступности команды
	eState                : E_AXIS_STATE; // Числовое состояние автомата оси
END_STRUCT
END_TYPE
