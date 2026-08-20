TYPE ST_CELL_STATUS :
STRUCT
	xRunning           : BOOL; // Автоматический цикл запущен
	xStopPending       : BOOL; // Запрошена остановка после безопасного шага
	xBusy              : BOOL; // Менеджер выполняет автоматический цикл
	xWaitingMachine    : BOOL; // Ожидание доступного станка
	xWaitingMagazine   : BOOL; // Ожидание пополнения или освобождения магазина
	xError             : BOOL; // Менеджер ячейки находится в ошибке
	xReadyToStart      : BOOL; // Выполнены все условия запуска автоматического цикла
	xStartAllowed      : BOOL; // Кнопка запуска или отмены ожидающей остановки доступна
	xStopAllowed       : BOOL; // Кнопка остановки автоматического цикла доступна
	xResetAllowed      : BOOL; // Кнопка общего сброса доступна
	xManualAllowed     : BOOL; // Кнопка перехода в ручной режим доступна
	xAutomaticAllowed  : BOOL; // Кнопка перехода в автоматический режим доступна
	xDrivesReady       : BOOL; // Приводы и группа осей готовы к движению
	xRobotReady        : BOOL; // Робот готов принять команду
	xMagazineReady     : BOOL; // Магазин готов к работе с роботом
	xSafetyHomeRequired: BOOL; // Повторный запуск разрешён только из HOME_SAFETY
	xRobotAtSafetyHome : BOOL; // Фактические координаты находятся в диапазоне HOME_SAFETY
	xStartCheckCellIdle          : BOOL; // Менеджер ячейки готов принять новый запуск
	xStartCheckAutomaticMode     : BOOL; // Выбран автоматический режим
	xStartCheckNoBlockingError   : BOOL; // Нет блокирующей запуск ошибки
	xStartCheckRobotInterfaceReady: BOOL; // Выбранный интерфейс робота готов
	xStartCheckConfigurationValid: BOOL; // Конфигурация типов корректна
	xStartCheckDrivesReady       : BOOL; // Приводы и группа готовы
	xStartCheckRobotReady        : BOOL; // Робот готов принять маршрут
	xStartCheckMagazineReady     : BOOL; // Магазин готов к операции
	xStartCheckTaskAvailable     : BOOL; // Есть допустимая работа или известный груз
	xStartCheckSafetyHome        : BOOL; // Условие HOME_SAFETY выполнено
	uiStartConditionsMet        : UINT; // Количество выполненных условий запуска
	uiStartConditionsTotal      : UINT; // Общее количество условий запуска
	uiReadyMachines    : UINT; // Количество включённых станков в состоянии IDLE
	uiSelectedMachine  : UINT; // Номер выбранного станка
	uiActiveMagazine   : UINT; // Магазин, закреплённый за текущим автоматическим циклом
	eMagazineOperation : E_MAGAZINE_OPERATION; // Выбранная операция магазина
	xOperatorPromptActive : BOOL; // PLC ожидает ответ оператора перед запуском цикла
	xOperatorChoiceAllowed: BOOL; // PLC разрешает отправить вариант активного опроса
	xOperatorCancelAllowed: BOOL; // PLC разрешает отменить активный предпусковой опрос
	uiOperatorPrompt      : UINT; // 0 нет; 1/3 содержимое захвата; 2/4 тип; 5 станок
	uiOperatorTypeMask    : UINT; // Биты 0..2 — доступные типы продукции
	uiOperatorMachineMask : UINT; // Биты 0..2 — допустимые станки для стартового LOAD
END_STRUCT
END_TYPE
