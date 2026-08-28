TYPE ST_MAGAZINE_HMI_COMMAND :
STRUCT
	xEnable : BOOL; // Импульс включения технологической логики магазина
	xDisable : BOOL; // Импульс отключения технологической логики магазина
	xPowerOn : BOOL; // Импульс подачи питания на сервопривод
	xPowerOff : BOOL; // Импульс снятия питания с сервопривода
	xHome : BOOL; // Импульс поиска домашней позиции
	xIndex : BOOL; // Импульс индексного перемещения на 720 мм
	xStop : BOOL; // Контролируемая остановка привода и операции магазина
	xReset : BOOL; // Сброс ошибок магазина и привода
	xJogPositive : BOOL; // Удерживаемый ручной ход конвейера вперёд
	xJogNegative : BOOL; // Удерживаемый ручной ход конвейера назад
	xFillZone1 : BOOL; // Заполнить Zone 1 заготовками по текущей карте типов
	xClearZone1 : BOOL; // Очистить только Zone 1
	xCycleZone1Slot : BOOL; // Переключить содержимое выбранного слота Zone 1
	xApplyZone1Slot : BOOL; // Явно записать состояние и тип выбранного слота Zone 1
	uiEditZone : UINT; // Редактируемая зона 1 или 2
	xConfirmRecovery : BOOL; // Подтвердить физическую сверку/коррекцию после повторного Home
	xStartContentRecovery : BOOL; // Войти в режим сверки содержимого без движения оси
	uiEditSlot : UINT; // Слот Zone 1, 1..120
	uiEditDetailType : UINT; // 0=NONE, 1=BLANK, 2=DETAIL
	uiEditProductType : UINT; // Тип изделия 1..3; для NONE игнорируется
	xApplyRecoverySlot : BOOL; // Применить исправление одного слота после аварийного Home
	xClearRecoveryZones : BOOL; // Явно очистить все три зоны при восстановлении
	uiRecoveryZone : UINT; // Корректируемая зона 1..3
	uiRecoverySlot : UINT; // Слот внутри выбранной зоны
	eRecoveryDetailType : E_DETAIL_TYPE; // NONE/BLANK/DETAIL для корректируемого слота
	uiRecoveryProductType : UINT; // Тип изделия 1..3; для NONE должен быть 0
END_STRUCT
END_TYPE
