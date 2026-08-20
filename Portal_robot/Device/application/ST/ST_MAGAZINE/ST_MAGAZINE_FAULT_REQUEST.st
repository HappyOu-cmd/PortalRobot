TYPE ST_MAGAZINE_FAULT_REQUEST :
STRUCT
	xEnabled        : BOOL; // Глобальное разрешение диагностической инъекции
	xWrongOperation : BOOL; // Импульс недопустимой операции
	xNoBlank        : BOOL; // Импульс отсутствия заготовки
	xNoFreeSlot     : BOOL; // Импульс отсутствия свободного слота
	xInvalidSlot    : BOOL; // Импульс недопустимого номера слота
	xSlotContent    : BOOL; // Импульс несоответствия содержимого слота
	xGeometry       : BOOL; // Импульс недопустимой геометрии магазина
END_STRUCT
END_TYPE
