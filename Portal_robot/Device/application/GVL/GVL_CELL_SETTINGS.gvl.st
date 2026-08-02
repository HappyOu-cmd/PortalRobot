{attribute 'qualified_only'}
VAR_GLOBAL CONSTANT
	// Максимальное число слотов магазина, используемое в статических границах массивов.
	NumberDetail : SINT := 70; // Максимальное число слотов магазина
END_VAR

VAR_GLOBAL
	//Порядок команд для смены, загрузки и выгрузки станков
	CHANGE_MACHINE : ARRAY [0..40] OF ST_MACHINE_RECIPE // Рецепт смены детали в станке
	:=[
	   (eCommand := E_MACHINE_STATE.DOOR_OPEN),
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
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.ABOVE, xRobotDone := TRUE),
	   (eCommand := E_MACHINE_STATE.DOOR_CLOSE),
	   (eCommand := E_MACHINE_STATE.CYCLE_START),
	   (eCommand := E_MACHINE_STATE.DONE)
	   
	   
	   
	   
];
	LOAD_MACHINE : ARRAY [0..40] OF ST_MACHINE_RECIPE // Рецепт загрузки станка
	:=[
	   (eCommand := E_MACHINE_STATE.DOOR_OPEN),
	   (eCommand := E_MACHINE_STATE.ROBOT_ACTION, eRobotAction := E_ROBOT_ACTION.ROTATE_TO_BLANK),
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.CHUCK_APPROACH),
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.CHUCK),
	   (eCommand := E_MACHINE_STATE.CHUCK_CLOSE),
	   (eCommand := E_MACHINE_STATE.ROBOT_ACTION, eRobotAction := E_ROBOT_ACTION.UNCLAMP_1),
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.CHUCK_APPROACH),
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.ABOVE, xRobotDone := TRUE),
	   (eCommand := E_MACHINE_STATE.DOOR_CLOSE),
	   (eCommand := E_MACHINE_STATE.CYCLE_START),
	   (eCommand := E_MACHINE_STATE.DONE)
	];

	UNLOAD_MACHINE : ARRAY [0..40] OF ST_MACHINE_RECIPE // Рецепт выгрузки станка
	:=[
	   (eCommand := E_MACHINE_STATE.DOOR_OPEN),
	   (eCommand := E_MACHINE_STATE.ROBOT_ACTION, eRobotAction := E_ROBOT_ACTION.ROTATE_TO_DETAIL),
	   (eCommand := E_MACHINE_STATE.ROBOT_ACTION, eRobotAction := E_ROBOT_ACTION.UNCLAMP_2),
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.CHUCK_APPROACH),
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.CHUCK),
	   (eCommand := E_MACHINE_STATE.ROBOT_ACTION, eRobotAction := E_ROBOT_ACTION.CLAMP_2),
	   (eCommand := E_MACHINE_STATE.CHUCK_OPEN),
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.CHUCK_APPROACH),
	   (eCommand := E_MACHINE_STATE.ROBOT_MOVE, stPoint := E_MACHINE_POINTS.ABOVE, xRobotDone := TRUE),
	   (eCommand := E_MACHINE_STATE.DOOR_CLOSE),
	   (eCommand := E_MACHINE_STATE.DONE)
	];
END_VAR
