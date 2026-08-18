TYPE ST_MULTI_TYPE_CONFIG_STATUS :
STRUCT
	xMagazineConfigAllowed   : BOOL; // Типы и распределение слотов можно менять
	xTypeCountAllowed        : BOOL; // Количество типов можно менять с применением шаблона
	axMachineTypeAllowed     : ARRAY [1..3] OF BOOL; // Назначение типа конкретному станку разрешено
	xConfigurationValid      : BOOL; // Конфигурация пригодна для автоматического цикла
	uiActiveSlotCount        : UINT; // Число слотов активной матрицы
	stWarning                : ST_WARNING_EVENT; // Последняя отклонённая команда конфигурации
END_STRUCT
END_TYPE
