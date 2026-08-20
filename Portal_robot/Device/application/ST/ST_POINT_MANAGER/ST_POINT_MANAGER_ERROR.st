TYPE ST_POINT_MANAGER_ERROR :
STRUCT
	X_OUT_OF_LIMIT : BOOL; // Координата X находится вне допустимой зоны
	Y_OUT_OF_LIMIT : BOOL; // Координата Y находится вне допустимой зоны
	Z_OUT_OF_LIMIT : BOOL; // Координата Z находится вне допустимой зоны
	INVALID_VEL    : BOOL; // Коэффициент скорости задан неверно
	X_LIMIT_CONFIG_INVALID : BOOL; // Software limits оси X отключены или заданы некорректно
	Y_LIMIT_CONFIG_INVALID : BOOL; // Software limits оси Y отключены или заданы некорректно
	Z_LIMIT_CONFIG_INVALID : BOOL; // Software limits оси Z отключены или заданы некорректно
END_STRUCT
END_TYPE
