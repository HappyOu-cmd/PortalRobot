{attribute 'qualified_only'}
VAR_GLOBAL
	stModbusCommand       : ST_ROBOT_COMMAND; // Команда внешнему роботу
	xModbusBusy           : BOOL; // Внешний робот выполняет команду
	xModbusDone           : BOOL; // Внешний робот завершил команду
	xModbusError          : BOOL; // Ошибка внешнего робота или обмена
END_VAR
