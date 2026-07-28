TYPE ST_MACHINE_DIAG :
STRUCT
	eState            : E_MACHINE_STATE; // Текущее состояние автомата станка
	eGrantedOperation : E_MACHINE_OPERATION; // Разрешённая операция
	eActualOperation  : E_MACHINE_OPERATION; // Выполняемая операция
END_STRUCT
END_TYPE
