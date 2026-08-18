TYPE ST_CELL_COMMAND :
STRUCT
	stRobot          : ST_ROBOT_COMMAND; // Команда роботу от менеджера ячейки
	uiBlankPayloadType  : UINT; // Тип заготовки в первом захвате
	uiDetailPayloadType : UINT; // Тип готовой детали во втором захвате
	stMagazine       : ST_MAGAZINE_COMMAND; // Команда магазину
	axMachineExecute : ARRAY [1..3] OF BOOL; // Запуск обслуживания выбранного станка
END_STRUCT
END_TYPE
