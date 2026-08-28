TYPE ST_MAGAZINE_STATUS :
STRUCT
	xEnabled         : BOOL; // Магазин включен в работу
	xDisablePending  : BOOL; // Запрошено отключение после завершения текущей операции
	xPowerAllowed    : BOOL; // Кнопка включения или отключения магазина доступна
	xEnableSequenceAllowed : BOOL; // PLC разрешает ввести подготовленный магазин в автомат
	xEnableCheckPowered : BOOL; // Привод включён
	xEnableCheckHomed : BOOL; // Home выполнен после последнего Power/Jog/аварии
	xEnableCheckPositionValid : BOOL; // Положение конвейера согласовано с картой
	xEnableCheckStationary : BOOL; // Ось и технологический автомат неподвижны
	xEnableCheckNoError : BOOL; // Нет ошибок магазина, оси и глобальной ошибки
	xEnableCheckRobotReleased : BOOL; // Робот не владеет магазином
	xEnableCheckContent : BOOL; // Zone 2 допускает полезную операцию
	xEnableCheckInventoryVerified : BOOL; // После аварии содержимое подтверждено
	xFillAllowed     : BOOL; // Кнопка заполнения магазина заготовками доступна
	xClearAllowed    : BOOL; // Кнопка очистки магазина доступна
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
	xHomed           : BOOL; // Сервопривод прошёл Home
	xPositionValid   : BOOL; // Логическая карта зон согласована с механической позицией
	xRecoveryRequired: BOOL; // После прерванного индекса нужна сверка оператором
	xIndexAllowed    : BOOL; // PLC разрешает операторскую команду индекса
	xZone1EditAllowed: BOOL; // Разрешено редактирование загрузочной зоны
	xZone2EditAllowed: BOOL; // Разрешено редактирование рабочей зоны при выключенном магазине
	xJogPositiveAllowed: BOOL; // PLC разрешает удерживаемый ход вперёд
	xJogNegativeAllowed: BOOL; // PLC разрешает удерживаемый ход назад
	xContentRecoveryAllowed: BOOL; // Можно войти в сверку содержимого
	xContentRecoveryActive: BOOL; // Активно восстановительное редактирование зон
	xInventoryVerificationRequired: BOOL; // Требуется подтверждение после ошибки робота в магазине
	xIndexing        : BOOL; // Выполняется индексное движение
	xIndexDone       : BOOL; // Импульс подтверждённой перестановки зон
	xAxisError       : BOOL; // Ошибка собственного сервопривода
	udiProducedPartsTotal : UDINT; // Подтверждённые укладки готовой детали в Zone 2 с момента запуска PLC
	uiMagazineId    : UINT; // 1 или 2
	iCurrentBlank    : SINT; // Минимальный номер заготовки в матрице
	iCurrentFreeSlot : SINT; // Минимальный номер свободного слота в матрице
	iSelectedBlank   : SINT; // Номер заготовки, выбранной для текущей операции
	iSelectedFreeSlot: SINT; // Номер свободного слота, выбранного для текущей операции
	eGrantedOperation: E_MAGAZINE_OPERATION; // Доступная операция по текущему состоянию магазина
	eActualOperation : E_MAGAZINE_OPERATION; // Выполняемая операция магазина
	stTypeStatus     : ST_MAGAZINE_TYPE_STATUS; // Содержимое секций магазина по типам
END_STRUCT
END_TYPE
