{attribute 'qualified_only'}
VAR_GLOBAL CONSTANT
	MagazineCount : INT := 2; // Два независимых статичных магазина
	MagazineRows : UINT := 12; // Фиксированная матрица статичной кассеты
	MagazineColumns : UINT := 10;
	MagazineSlots : SINT := 120; // Одна кассета 12 x 10 в каждом магазине
	NumberDetail : SINT := 120;
END_VAR

VAR_GLOBAL
	// Не RETAIN: после каждого запуска PLC тестовая среда всегда NORMAL.
	eTestEnvironment : E_CELL_TEST_ENVIRONMENT := E_CELL_TEST_ENVIRONMENT.NORMAL;
	eTestSpeedProfile : E_TEST_SPEED_PROFILE := E_TEST_SPEED_PROFILE.REALTIME;
	xSimulationAccelerationEnable : BOOL := FALSE; // Ускорять таймеры и динамику SoftMotion в тестовом профиле FAST
	uiSimulationTimeFactor : UINT := 1; // Запрошенный коэффициент 1..100; можно менять в любой момент
	xSimulationAccelerationActive : BOOL := FALSE; // Применён ускоренный комплект лимитов и таймеров
	uiSimulationTimeFactorApplied : UINT := 1; // Коэффициент, подтверждённый транзакцией Dynamic Limits
	xSimulationAccelerationChangeAllowed : BOOL := FALSE; // Разрешено запомнить новое требование из HMI
	xSimulationAccelerationPending : BOOL := FALSE; // Новое значение ждёт следующего теста
	xSimulationAccelerationBusy : BOOL := FALSE; // Stop/Disable/Change/Enable выполняется
	xSimulationAccelerationError : BOOL := FALSE;
	udiSimulationAccelerationErrorId : UDINT := UDINT#0;
	xErrorSimulationEnabled : BOOL := FALSE; // Разрешение диагностической инъекции ошибок из HMI

	// Безопасный повторный запуск после аварийной остановки.
	// Погрешности задают допустимый диапазон относительно точки HOME_SAFETY.
	lrSafetyHomeToleranceX : LREAL := 5.0;
	lrSafetyHomeToleranceY : LREAL := 5.0;
	lrSafetyHomeToleranceZ : LREAL := 5.0;
	rPointCheckSpeedPercent : REAL := 10.0; // Скорость проверки точки с телефона
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
		tHatchUnlock := T#5S,
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
