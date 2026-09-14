TYPE ST_MPG_IO_STATUS :
STRUCT
	xEmergencyStopPressed : BOOL; // Нормализованный вход: TRUE — грибок MPG нажат
	xAxisX                : BOOL; // Положение селектора оси X
	xAxisY                : BOOL; // Положение селектора оси Y
	xAxisZ                : BOOL; // Положение селектора оси Z
	xMultiplier1          : BOOL; // Положение множителя x1
	xMultiplier10         : BOOL; // Положение множителя x10
	xMultiplier100        : BOOL; // Положение множителя x100
END_STRUCT
END_TYPE
