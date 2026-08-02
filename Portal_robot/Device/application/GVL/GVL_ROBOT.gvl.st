{attribute 'qualified_only'}
VAR_GLOBAL
	Command       : ST_ROBOT_COMMAND; // Выбранная команда робота
	ModbusCommand : ST_ROBOT_COMMAND; // Команда внешнему роботу
	Status        : ST_ROBOT_STATUS; // Рабочие статусы робота
	Diag          : ST_ROBOT_DIAG; // Состояние автомата робота
	Error         : ST_ROBOT_ERRORS; // Активные и последние ошибки робота
	GripperDiag   : ST_GRIPPER_DIAG; // Диагностика внутреннего блока захвата
	GripperError  : ST_GRIPPER_ERRORS; // Активные и последние ошибки захвата

	xModbusBusy  : BOOL; // Внешний робот выполняет команду
	xModbusDone  : BOOL; // Внешний робот завершил команду
	xModbusError : BOOL; // Ошибка внешнего робота или обмена
END_VAR
