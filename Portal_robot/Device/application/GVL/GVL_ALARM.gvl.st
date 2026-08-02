{attribute 'qualified_only'}
VAR_GLOBAL
	Command : ST_ALARM_COMMAND; // Команды управления журналом аварий
	Status  : ST_ALARM_STATUS; // Сводный статус аварий и предупреждений
	Events  : ARRAY [1..100] OF ST_ALARM_EVENT; // Кольцевой журнал событий
END_VAR
