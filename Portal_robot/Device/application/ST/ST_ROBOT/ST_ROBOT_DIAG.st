TYPE ST_ROBOT_DIAG :
STRUCT
	eState        : E_ROBOT_STATE; // Текущее состояние автомата робота
	eActiveAction : E_ROBOT_ACTION; // Выполняемое действие робота
	eActivePoint  : E_POINT_NAME; // Целевая точка текущего движения
END_STRUCT
END_TYPE
