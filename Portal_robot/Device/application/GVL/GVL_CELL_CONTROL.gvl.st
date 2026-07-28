{attribute 'qualified_only'}
VAR_GLOBAL
	xGlobalError : BOOL; // Глобальная ошибка ячейки
	xReset       : BOOL; // Общий сброс ошибок ячейки
	xManual      : BOOL; // Ручной режим управления ячейкой
	xEnable      : BOOL; // Импульс включения оборудования ячейки
	xDisable     : BOOL; // Импульс отключения оборудования ячейки
	xStart       : BOOL; // Импульс запуска автоматического цикла
	xStop        : BOOL; // Импульс остановки автоматического цикла
END_VAR
