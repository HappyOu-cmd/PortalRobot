TYPE ST_GRIPPER_DIAG :
STRUCT
	eState        : E_GRIPPER_STATE; // Текущее состояние автомата
	eActiveAction : E_ROBOT_ACTION; // Выполняемое действие захвата
END_STRUCT
END_TYPE
