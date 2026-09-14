TYPE ST_POINT :
STRUCT
	Name        : STRING[80]; // Имя точки
	X           : LREAL; // Координата X
	Y           : LREAL; // Координата Y
	Z           : LREAL; // Координата Z
	MagazineSafeZ : LREAL; // Signed-смещение Safe Z; используется только базовой точкой магазина
	MagazineChangeZ : LREAL; // Signed-смещение Change Z; используется только базовой точкой магазина
	SpeedFactor : LREAL; // Коэффициент скорости движения
	xConfigured : BOOL; // Для базы магазина TRUE только при ненулевых MagazineSafeZ и MagazineChangeZ
END_STRUCT
END_TYPE
