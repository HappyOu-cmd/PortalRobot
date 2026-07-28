TYPE ST_MACHINE_RECIPE :
STRUCT
	eRobotAction    : E_ROBOT_ACTION; // Действие робота на шаге рецепта
	eCommand        : E_MACHINE_STATE; // Команда шага рецепта
	stPoint         : E_MACHINE_POINTS; // Логическая точка станка
	xRetreatStarted : BOOL; // Признак начала отхода робота
	xRobotDone      : BOOL; // Признак освобождения робота после шага
END_STRUCT
END_TYPE
