TYPE ST_MULTI_TYPE_COMMAND :
STRUCT
	{attribute 'symbol' := 'read'}
	xSetTypeCount         : BOOL; // Импульс изменения количества типов
	uiRequestedTypeCount : UINT; // Требуемое количество типов, 1..3
	{attribute 'symbol' := 'read'}
	xSetMachineType       : BOOL; // Импульс назначения типа станку
	uiRequestedMachine   : UINT; // Номер редактируемого станка, 1..3
	uiRequestedMachineType : UINT; // Тип, назначаемый станку
	{attribute 'symbol' := 'read'}
	xSetSlotType          : BOOL; // Импульс назначения типа слоту
	uiRequestedSlot      : UINT; // Номер редактируемого слота
	uiRequestedSlotType  : UINT; // Тип, назначаемый слоту
	{attribute 'symbol' := 'read'}
	xAutoDistribute      : BOOL; // Импульс распределения слотов пропорционально станкам
END_STRUCT
END_TYPE
