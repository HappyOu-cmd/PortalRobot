TYPE ST_MAGAZINE_DIAG :
STRUCT
	eState : E_MAGAZINE_STATE := E_MAGAZINE_STATE.DISABLED; // Текущее состояние автомата магазина
	stWarning : ST_WARNING_EVENT; // Последнее предупреждение магазина
END_STRUCT
END_TYPE
