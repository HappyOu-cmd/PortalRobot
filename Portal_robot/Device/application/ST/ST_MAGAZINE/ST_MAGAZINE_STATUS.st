TYPE ST_MAGAZINE_STATUS :
STRUCT
	xEnabled         : BOOL; // Магазин включен в работу
	xDisablePending  : BOOL; // Отключение выполнится после выхода робота и завершения операции
	xPowerAllowed    : BOOL; // Команда включения/отключения может быть принята
	xEnableSequenceAllowed : BOOL; // PLC разрешает ввести подготовленный магазин в автомат
	xEnableCheckRobotReady : BOOL; // Интерфейс робота и обязательные точки готовы
	xEnableCheckRobotReleased : BOOL; // Робот находится вне этого магазина
	xEnableCheckNoError : BOOL; // Нет ошибок магазина, робота и ячейки
	xEnableCheckContent : BOOL; // Содержимое кассеты допускает полезную операцию
	xEnableCheckGeometry : BOOL; // Матрица содержит от 1 до 120 активных слотов
	xFillAllowed     : BOOL; // Кнопка заполнения магазина заготовками доступна
	xClearAllowed    : BOOL; // Кнопка очистки магазина доступна
	xEditAllowed     : BOOL; // Содержимое разрешено менять только у выключенного магазина
	xPitchEditAllowed : BOOL; // Общий шаг X/Y можно менять только при выключенных обоих магазинах
	xReady 			 : BOOL; // Магазин готов принять команду
	xBusy  			 : BOOL; // Выполняется операция магазина
	xDone  			 : BOOL; // Операция магазина завершена
	xError          : BOOL; // Магазин находится в ошибке
	xRobotStopRequired : BOOL; // Ошибка магазина требует зависимой аварии робота
	xOutBlank        : BOOL; // В магазине не осталось свободных заготовок
	xOutFreeSlot     : BOOL; // В магазине не осталось свободных слотов
	xCanTake         : BOOL; // Операция TAKE доступна по содержимому магазина
	xCanPut          : BOOL; // Операция PUT доступна по содержимому магазина
	xCanChange       : BOOL; // Операция CHANGE доступна по содержимому магазина
	xCanEnable       : BOOL; // Содержимое магазина позволяет повторное включение
	xFinished        : BOOL; // Магазин требует обслуживания оператором
	udiProducedPartsTotal : UDINT; // Подтверждённые укладки готовой детали с момента запуска PLC
	uiMagazineId    : UINT; // 1 или 2
	iCurrentBlank    : SINT; // Минимальный номер заготовки в матрице
	iCurrentFreeSlot : SINT; // Минимальный номер свободного слота в матрице
	iSelectedBlank   : SINT; // Номер заготовки, выбранной для текущей операции
	iSelectedFreeSlot: SINT; // Номер свободного слота, выбранного для текущей операции
	eGrantedOperation: E_MAGAZINE_OPERATION; // Доступная операция по текущему состоянию магазина
	eActualOperation : E_MAGAZINE_OPERATION; // Выполняемая операция магазина
	stTypeStatus     : ST_MAGAZINE_TYPE_STATUS; // Содержимое кассеты по типам
END_STRUCT
END_TYPE
