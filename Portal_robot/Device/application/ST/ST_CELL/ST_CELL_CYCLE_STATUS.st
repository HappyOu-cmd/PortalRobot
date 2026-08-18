TYPE ST_CELL_CYCLE_STATUS :
STRUCT
	eState              : E_CELL_MANAGER_STATE; // Состояние универсального автомата ячейки
	uiSelectedMachine   : UINT; // Зафиксированный целевой станок
	uiSelectedType      : UINT; // Тип заготовки текущего маршрута
	uiBlankPayloadType  : UINT; // Тип заготовки в первом захвате
	uiDetailPayloadType : UINT; // Тип готовой детали во втором захвате
	iTakeSlot           : SINT; // Зарезервированный слот взятия
	iPutSlot            : SINT; // Зарезервированный слот укладки
	xReturningBlank     : BOOL; // Выполняется возврат заготовки
	axMachineStartPending: ARRAY [1..3] OF BOOL; // Запуск нового цикла ещё подтверждается станком
	auiBlankCount       : ARRAY [1..3] OF UINT; // Заготовки по типам
	auiDetailCount      : ARRAY [1..3] OF UINT; // Готовые детали по типам
	auiFreeCount        : ARRAY [1..3] OF UINT; // Свободные слоты по типам
END_STRUCT
END_TYPE
