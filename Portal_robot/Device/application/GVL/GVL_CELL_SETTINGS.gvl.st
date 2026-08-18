{attribute 'qualified_only'}
VAR_GLOBAL CONSTANT
	MagazineCount : INT := 2; // Два независимых индексных магазина
	MagazineZone1Slots : SINT := 120; // 12 рядов загрузки x 10 столбцов
	MagazineZone2Slots : SINT := 120; // 12 рабочих рядов x 10 столбцов
	MagazineZone3Slots : SINT := 60; // 6 выходных рядов x 10 столбцов
	// Рабочий контракт робота использует только Zone 2; SINT#120 остаётся допустимым.
	NumberDetail : SINT := 120;
	lrMagazineIndexDistance : LREAL := 720.0; // 12 рядов по 60 мм
END_VAR

VAR_GLOBAL
	// Не RETAIN: после каждого запуска PLC тестовая среда всегда NORMAL.
	eTestEnvironment : E_CELL_TEST_ENVIRONMENT := E_CELL_TEST_ENVIRONMENT.NORMAL;
	eTestSpeedProfile : E_TEST_SPEED_PROFILE := E_TEST_SPEED_PROFILE.REALTIME;
	xSimulationAccelerationEnable : BOOL := FALSE; // Запрос ускорения симуляции
	uiSimulationTimeFactor : UINT := 1; // 1..100 вручную; x250 только в автоматическом Modbus FAST
	xSimulationAccelerationActive : BOOL := FALSE; // Фактически применённое ускорение
	uiSimulationTimeFactorApplied : UINT := 1; // Фактически применённый коэффициент
	xSimulationAccelerationChangeAllowed : BOOL := FALSE; // Разрешение изменения из HMI
	xSimulationAccelerationError : BOOL := FALSE; // Ошибка применения ускорения виртуальных таймеров
	xErrorSimulationEnabled : BOOL := FALSE; // Разрешение диагностической инъекции ошибок из HMI

	// Безопасный повторный запуск после аварийной остановки.
	// Погрешности задают допустимый диапазон относительно точки HOME_SAFETY.
	lrSafetyHomeToleranceX : LREAL := 5.0;
	lrSafetyHomeToleranceY : LREAL := 5.0;
	lrSafetyHomeToleranceZ : LREAL := 5.0;
	// Допуск контроля неизменности позы после штатной остановки защищает от
	// дрожания обратной связи, но фиксирует последующее ручное перемещение.
	lrStoppedPoseTolerance : LREAL := 1.0;

	// Настройки ячейки редактируются из HMI только в остановленном безопасном состоянии.
	xCellSettingsChangeAllowed : BOOL := FALSE;
	stMachineTimeouts : ST_MACHINE_TIMEOUTS := (
		tRobotMove := T#60S,
		tRobotAction := T#10S,
		tRobotRelease := T#5S,
		tDoorOpen := T#10S,
		tDoorClose := T#10S,
		tChuckOpen := T#10S,
		tChuckClose := T#10S,
		tCycleStart := T#10S
	); // Штатные пределы ожидания технологических подтверждений станков

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
