TYPE ST_CELL_DIAG :
STRUCT
	eState : E_CELL_STATE; // Текущее состояние автомата ячейки
	stWarning : ST_WARNING_EVENT; // Последнее предупреждение менеджера ячейки
END_STRUCT
END_TYPE
