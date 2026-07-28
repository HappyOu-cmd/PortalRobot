TYPE ST_POINT_MANAGER_ERROR :
STRUCT
	X_OUT_OF_LIMIT : BOOL; // Координата X находится вне допустимой зоны
	Y_OUT_OF_LIMIT : BOOL; // Координата Y находится вне допустимой зоны
	Z_OUT_OF_LIMIT : BOOL; // Координата Z находится вне допустимой зоны
	INVALID_VEL    : BOOL; // Коэффициент скорости задан неверно
END_STRUCT
END_TYPE
