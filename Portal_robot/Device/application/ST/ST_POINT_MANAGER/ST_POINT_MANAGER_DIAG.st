TYPE ST_POINT_MANAGER_DIAG :
STRUCT
	eState       : E_POINT_MANAGER_STATE; // Текущее состояние автомата
	lrX_MinLimit : LREAL; // Минимально допустимая координата X
	lrY_MinLimit : LREAL; // Минимально допустимая координата Y
	lrZ_MinLimit : LREAL; // Минимально допустимая координата Z
	lrX_MaxLimit : LREAL; // Максимально допустимая координата X
	lrY_MaxLimit : LREAL; // Максимально допустимая координата Y
	lrZ_MaxLimit : LREAL; // Максимально допустимая координата Z
	stWarning    : ST_WARNING_EVENT; // Последнее предупреждение менеджера точек
END_STRUCT
END_TYPE
