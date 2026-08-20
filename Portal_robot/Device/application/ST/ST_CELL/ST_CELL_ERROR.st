TYPE ST_CELL_ERROR :
STRUCT
	BOTH_GRIPPERS_OCCUPIED : BOOL; // Совместимый бит: диагностическая ошибка согласованности захватов
	ROBOT_ERROR            : BOOL; // Ошибка робота во время автоматического цикла
	MAGAZINE_ERROR         : BOOL; // Ошибка магазина во время операции
	MACHINE_ERROR          : BOOL; // Ошибка станка во время обслуживания
	GLOBAL_STOP            : BOOL; // Получена глобальная ошибка ячейки
END_STRUCT
END_TYPE
