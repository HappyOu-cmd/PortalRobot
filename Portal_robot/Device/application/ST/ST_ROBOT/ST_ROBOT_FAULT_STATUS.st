TYPE ST_ROBOT_FAULT_STATUS :
STRUCT
	stRobot   : ST_FAULT_INJECTION_STATUS; // Локальная ошибка автомата робота
	stGripper : ST_FAULT_INJECTION_STATUS; // Неисправности виртуального захвата
	stPoint   : ST_FAULT_INJECTION_STATUS; // Ошибки проверки точки движения
END_STRUCT
END_TYPE
