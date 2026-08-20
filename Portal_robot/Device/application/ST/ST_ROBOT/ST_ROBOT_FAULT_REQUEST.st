TYPE ST_ROBOT_FAULT_REQUEST :
STRUCT
	xEnabled     : BOOL; // Глобальное разрешение диагностической инъекции
	xWrongAction : BOOL; // Импульс недопустимого действия робота
	stGripper : ST_GRIPPER_FAULT_REQUEST; // Неисправности виртуального захвата
	stPoint   : ST_POINT_FAULT_REQUEST; // Ошибки проверки точки движения
END_STRUCT
END_TYPE
