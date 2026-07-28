TYPE ST_AXIS_GROUP_MOTION_PARAMS :
STRUCT
	stTargetPos      : SMC_POS_REF; // Целевая позиция в формате SoftMotion
	lrX              : LREAL := 1000; // Целевая координата X
	lrY              : LREAL := 1000; // Целевая координата Y
	lrZ              : LREAL := 1000; // Целевая координата Z
	VelFactor        : LREAL := 0.1; // Коэффициент скорости
	AccFactor        : LREAL := 0.1; // Коэффициент ускорения
	JerkFactor       : LREAL := 0.1; // Коэффициент рывка
	HaltDeceleration : LREAL := 1000; // Замедление при плавной остановке
	HaltJerk         : LREAL := 10000; // Рывок при плавной остановке
END_STRUCT
END_TYPE
