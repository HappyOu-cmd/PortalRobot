TYPE ST_GRIPPER_FAULT_REQUEST :
STRUCT
	xEnabled        : BOOL; // Глобальное разрешение диагностической инъекции
	xGripper1Fault  : BOOL; // Неисправность первого захвата
	xGripper2Fault  : BOOL; // Неисправность второго захвата
	xRotationFault  : BOOL; // Неисправность механизма поворота
	xGlobalFault    : BOOL; // Общая неисправность захвата
END_STRUCT
END_TYPE
