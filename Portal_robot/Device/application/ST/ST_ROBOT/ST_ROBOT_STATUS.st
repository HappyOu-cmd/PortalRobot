TYPE ST_ROBOT_STATUS :
STRUCT
	xBusy             : BOOL; // Робот выполняет команду
	xDone             : BOOL; // Команда завершена
	xError            : BOOL; // Робот находится в ошибке
	xExternalError    : BOOL; // Робот остановлен ошибкой зависимого блока
	xPowerAllowed     : BOOL; // Кнопка включения или отключения приводов доступна
	xStopAllowed      : BOOL; // Кнопка контролируемой остановки доступна
	xResetAllowed     : BOOL; // Кнопка сброса ошибок робота и приводов доступна
	eCurrentPoint     : E_POINT_NAME; // Последняя достигнутая точка
	uiMagazineContext : UINT; // 0 вне рабочей зоны; 1..2 — магазин, в рабочей зоне которого находится робот
	xBlankAvailable   : BOOL; // В первом захвате находится заготовка
	xDetailAvailable  : BOOL; // Во втором захвате находится готовая деталь
	uiBlankPayloadType  : UINT; // Фактический тип заготовки, 0 — неизвестно
	uiDetailPayloadType : UINT; // Фактический тип детали, 0 — неизвестно
	xGripper1Open     : BOOL; // Первый захват открыт
	xGripper1Closed   : BOOL; // Первый захват закрыт
	xGripper2Open     : BOOL; // Второй захват открыт
	xGripper2Closed   : BOOL; // Второй захват закрыт
	xRotatedToBlank   : BOOL; // Захват повёрнут к заготовке
	xRotatedToDetail  : BOOL; // Захват повёрнут к готовой детали
END_STRUCT
END_TYPE
