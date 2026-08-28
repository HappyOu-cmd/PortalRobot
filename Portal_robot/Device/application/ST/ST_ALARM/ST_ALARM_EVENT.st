TYPE ST_ALARM_EVENT :
STRUCT
	udiSequence : UDINT; // Уникальный порядковый номер события
	eSeverity   : E_ALARM_SEVERITY; // Уровень события
	eEffect     : E_ALARM_EFFECT; // Фактическое воздействие события в момент фиксации
	eSource     : E_ALARM_SOURCE; // Механизм-источник события
	uiCode      : UINT; // Номер бита ошибки или код предупреждения
	xActive     : BOOL; // Событие ещё активно и требует внимания
END_STRUCT
END_TYPE
