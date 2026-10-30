TYPE ST_ROBOT_RESET_RECOVERY :
STRUCT
	udiAttempt : UDINT; // Ненулевой номер принятой попытки; не является HMI-командой
	xActive : BOOL; // Попытка ещё выполняется в FB_ROBOT
	xDependenciesReady : BOOL; // Первичные Motion/захват/Modbus восстановлены; ERROR родителя ещё допустим
END_STRUCT
END_TYPE
