TYPE ST_MACHINE_DIAG :
STRUCT
	eState            : E_MACHINE_STATE; // Текущее состояние автомата станка
	eGrantedOperation : E_MACHINE_OPERATION; // Разрешённая операция
	eActualOperation  : E_MACHINE_OPERATION; // Выполняемая операция
	stWarning         : ST_WARNING_EVENT; // Последнее предупреждение станка
END_STRUCT
END_TYPE
