TYPE ST_CELL_STATUS :
STRUCT
	xRunning           : BOOL; // Автоматический цикл запущен
	xBusy              : BOOL; // Менеджер выполняет автоматический цикл
	xWaitingMachine    : BOOL; // Ожидание доступного станка
	xWaitingMagazine   : BOOL; // Ожидание пополнения или освобождения магазина
	xError             : BOOL; // Менеджер ячейки находится в ошибке
	xReadyToStart      : BOOL; // Выполнены все условия запуска автоматического цикла
	xDrivesReady       : BOOL; // Приводы и группа осей готовы к движению
	xRobotReady        : BOOL; // Робот готов принять команду
	xMagazineReady     : BOOL; // Магазин готов к работе с роботом
	uiReadyMachines    : UINT; // Количество включённых станков в состоянии IDLE
	uiSelectedMachine  : UINT; // Номер выбранного станка
	eMagazineOperation : E_MAGAZINE_OPERATION; // Выбранная операция магазина
END_STRUCT
END_TYPE
