{attribute 'qualified_only'}
VAR_GLOBAL
	astPhysicalInput : ARRAY [1..3] OF ST_MACHINE_IO_STATUS; // Только ReadPhysicalInputs пишет физическую обратную связь
	Command    : ARRAY [1..3] OF ST_MACHINE_COMMAND; // Команды станков и робота
	Status     : ARRAY [1..3] OF ST_MACHINE_PUBLIC; // Рабочие статусы станков
	Diag       : ARRAY [1..3] OF ST_MACHINE_DIAG; // Состояния автоматов станков
	Error      : ARRAY [1..3] OF ST_MACHINE_ERRORS; // Ошибки станков
END_VAR
