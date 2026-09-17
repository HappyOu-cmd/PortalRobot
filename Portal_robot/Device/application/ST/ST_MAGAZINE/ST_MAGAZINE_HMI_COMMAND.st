TYPE ST_MAGAZINE_HMI_COMMAND :
STRUCT
	{attribute 'symbol' := 'read'}
	xEnable : BOOL; // Импульс включения технологической логики магазина
	{attribute 'symbol' := 'read'}
	xDisable : BOOL; // Импульс отключения технологической логики магазина
	{attribute 'symbol' := 'read'}
	xStop : BOOL; // Остановить выполняемую операцию магазина
	{attribute 'symbol' := 'read'}
	xReset : BOOL; // Сброс ошибок магазина
	{attribute 'symbol' := 'read'}
	xFill : BOOL; // Заполнить кассету заготовками по текущей карте типов
	{attribute 'symbol' := 'read'}
	xClear : BOOL; // Полностью очистить кассету
	xCycleSlot : BOOL; // Переключить содержимое выбранного слота
	{attribute 'symbol' := 'read'}
	xApplySlot : BOOL; // Явно записать состояние и тип выбранного слота
	{attribute 'symbol' := 'read'}
	xApplyPitchX : BOOL; // Применить новый шаг слотов по X
	{attribute 'symbol' := 'read'}
	xApplyPitchY : BOOL; // Применить новый шаг слотов по Y
	uiEditSlot : UINT; // Слот кассеты, 1..120
	uiEditDetailType : UINT; // 0=NONE, 1=BLANK, 2=DETAIL
	uiEditProductType : UINT; // Тип изделия 1..3; для NONE игнорируется
	lrEditPitchX : LREAL; // Запрошенный шаг слотов по X
	lrEditPitchY : LREAL; // Запрошенный шаг слотов по Y
END_STRUCT
END_TYPE
