TYPE ST_CELL_COMMAND :
STRUCT
	stRobot          : ST_ROBOT_COMMAND; // Команда роботу от менеджера ячейки
	stMagazine       : ST_MAGAZINE_COMMAND; // Команда магазину
	axMachineExecute : ARRAY [1..3] OF BOOL; // Запуск обслуживания выбранного станка
END_STRUCT
END_TYPE
