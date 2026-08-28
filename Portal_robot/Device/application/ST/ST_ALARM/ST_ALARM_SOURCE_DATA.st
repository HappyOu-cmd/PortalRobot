TYPE ST_ALARM_SOURCE_DATA :
STRUCT
	eSource       : E_ALARM_SOURCE; // Функциональный блок, которому принадлежит событие
	dwAlarmActive : DWORD; // Только собственные активные аварии блока
	xRobotStopRequired : BOOL; // Владелец зафиксировал зависимый останов робота для этого контекста
	xGlobalError  : BOOL; // Глобальная ошибка была активна в момент публикации источника
	stWarning     : ST_WARNING_EVENT; // Последнее предупреждение блока
END_STRUCT
END_TYPE
