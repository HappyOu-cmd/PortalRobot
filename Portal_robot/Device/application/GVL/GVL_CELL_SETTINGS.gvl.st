{attribute 'qualified_only'}
VAR_GLOBAL CONSTANT
	// Максимальное число слотов магазина, используемое в статических границах массивов.
	NumberDetail : SINT := 70; // Максимальное число слотов магазина
END_VAR

VAR_GLOBAL
	//Количество станков
	MachineCount : UINT := 3; // Число станков в ячейке

	// Геометрия магазина. MAGAZINE_DETAIL является рабочей точкой первого слота.
	MagazineRows    : UINT := 10; // Число строк магазина
	MagazineColumns : UINT := 7; // Число столбцов магазина
	MagazinePitchX  : LREAL := 60.0; // Шаг слотов по оси X
	MagazinePitchY  : LREAL := 60.0; // Шаг слотов по оси Y
	MagazineSafeZ   : LREAL := 300.0; // Безопасная координата по оси Z
	
	//Порядок команд для смены, загрузки и выгрузки станков
	CHANGE_MACHINE : ARRAY [0..40] OF ST_MACHINE_RECIPE // Рецепт смены детали в станке
	:=[
	   (eCommand := E_MACHINE_STATE.DOOR_OPEN),
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.INSIDE),
	   (eCommand := E_MACHINE_STATE.ROBOT_ACTION, eRobotAction := E_ROBOT_ACTION.ROTATE_TO_DETAIL),
	   (eCommand := E_MACHINE_STATE.ROBOT_ACTION, eRobotAction := E_ROBOT_ACTION.UNCLAMP_2),
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.CHUCK_APPROACH),
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.CHUCK),
	   (eCommand := E_MACHINE_STATE.ROBOT_ACTION, eRobotAction := E_ROBOT_ACTION.CLAMP_2),
	   (eCommand := E_MACHINE_STATE.CHUCK_OPEN),
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.CHUCK_APPROACH),
	   (eCommand := E_MACHINE_STATE.ROBOT_ACTION, eRobotAction := E_ROBOT_ACTION.ROTATE_TO_BLANK),
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.CHUCK),
	   (eCommand := E_MACHINE_STATE.CHUCK_CLOSE),
	   (eCommand := E_MACHINE_STATE.ROBOT_ACTION, eRobotAction := E_ROBOT_ACTION.UNCLAMP_1),
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.CHUCK_APPROACH),
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.INSIDE),
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.ABOVE, xRobotDone := TRUE),
	   (eCommand := E_MACHINE_STATE.DOOR_CLOSE),
	   (eCommand := E_MACHINE_STATE.CYCLE_START),
	   (eCommand := E_MACHINE_STATE.DONE)
	   
	   
	   
	   
];
	LOAD_MACHINE   : ARRAY [0..40] OF ST_MACHINE_RECIPE; // Рецепт загрузки станка
	UNLOAD_MACHINE : ARRAY [0..40] OF ST_MACHINE_RECIPE; // Рецепт выгрузки станка
END_VAR
