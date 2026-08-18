TYPE ST_FAULT_INJECTION_STATUS :
STRUCT
	xAllowed          : BOOL; // Инъекция разрешена текущим состоянием владельца
	xActive           : BOOL; // Источник тестовой неисправности активен
	xBusy             : BOOL; // Выполняется одноразовый сценарий инъекции
	xResetAllowed     : BOOL; // Причина снята и источник можно сбросить
	xRejected         : BOOL; // Одноцикловый признак отклонённого запроса
	udiRejectSequence : UDINT; // Счётчик отклонённых запросов для надёжного чтения HMI
END_STRUCT
END_TYPE
