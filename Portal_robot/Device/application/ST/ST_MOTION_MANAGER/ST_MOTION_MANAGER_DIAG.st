TYPE ST_MOTION_MANAGER_DIAG :
STRUCT
	eState : E_MOTION_MANAGER_STATE; // Текущее состояние автомата движения
	stWarning : ST_WARNING_EVENT; // Последнее предупреждение менеджера движения
END_STRUCT
END_TYPE
