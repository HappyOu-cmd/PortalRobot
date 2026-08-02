TYPE ST_ALARM_STATUS :
STRUCT
	uiActiveAlarmCount   : UINT; // Число активных аварий
	uiActiveWarningCount : UINT; // Число активных предупреждений
	uiActiveEventCount   : UINT; // Общее число активных событий
	uiHistoryCount       : UINT; // Число записей в журнале
	xAlarmActive         : BOOL; // Есть хотя бы одна активная авария
	xWarningActive       : BOOL; // Есть хотя бы одно активное предупреждение
END_STRUCT
END_TYPE
