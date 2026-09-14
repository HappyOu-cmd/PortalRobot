TYPE ST_MAGAZINE_HMI_COMMAND :
STRUCT
	xEnable : BOOL; // Импульс включения технологической логики магазина
	xDisable : BOOL; // Импульс отключения технологической логики магазина
	xStop : BOOL; // Остановить выполняемую операцию магазина
	xReset : BOOL; // Сброс ошибок магазина
	xFill : BOOL; // Заполнить кассету заготовками по текущей карте типов
	xClear : BOOL; // Полностью очистить кассету
	xCycleSlot : BOOL; // Переключить содержимое выбранного слота
	xApplySlot : BOOL; // Явно записать состояние и тип выбранного слота
	xApplyPitchX : BOOL; // Применить новый шаг слотов по X
	xApplyPitchY : BOOL; // Применить новый шаг слотов по Y
	uiEditSlot : UINT; // Слот кассеты, 1..120
	uiEditDetailType : UINT; // 0=NONE, 1=BLANK, 2=DETAIL
	uiEditProductType : UINT; // Тип изделия 1..3; для NONE игнорируется
	lrEditPitchX : LREAL; // Запрошенный шаг слотов по X
	lrEditPitchY : LREAL; // Запрошенный шаг слотов по Y
END_STRUCT
END_TYPE
