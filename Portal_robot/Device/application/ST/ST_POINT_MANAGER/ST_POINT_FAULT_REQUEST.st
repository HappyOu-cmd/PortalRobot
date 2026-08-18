TYPE ST_POINT_FAULT_REQUEST :
STRUCT
	xEnabled        : BOOL; // Глобальное разрешение диагностической инъекции
	xXOutOfLimit    : BOOL; // Импульс проверки точки с недопустимой координатой X
	xYOutOfLimit    : BOOL; // Импульс проверки точки с недопустимой координатой Y
	xZOutOfLimit    : BOOL; // Импульс проверки точки с недопустимой координатой Z
	xInvalidVelocity: BOOL; // Импульс проверки точки с недопустимой скоростью
END_STRUCT
END_TYPE
