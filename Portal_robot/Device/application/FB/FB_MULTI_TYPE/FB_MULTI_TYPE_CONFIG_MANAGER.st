FUNCTION_BLOCK FB_MULTI_TYPE_CONFIG_MANAGER
VAR_INPUT
	xTestInitialize  : BOOL; // Атомарная загрузка конфигурации из тестового буфера
	stTestScenario   : ST_TEST_SCENARIO_BUFFER;
	Command          : ST_MULTI_TYPE_COMMAND; // Запросы конфигурации от HMI
	xCellRunning     : BOOL; // Автоматический цикл выполняется
	xMotionBusy      : BOOL; // Оси ещё движутся
	stRobotStatus    : ST_ROBOT_STATUS; // Состояние робота
	stMagazineStatus : ST_MAGAZINE_STATUS; // Состояние магазина
	astMachineStatus : ARRAY [1..3] OF ST_MACHINE_PUBLIC; // Состояния станков
	uiRows           : UINT; // Строки активной матрицы
	uiColumns        : UINT; // Столбцы активной матрицы
END_VAR
VAR_OUTPUT
	Config : ST_MULTI_TYPE_CONFIG; // Фактически принятая конфигурация
	Status : ST_MULTI_TYPE_CONFIG_STATUS; // Разрешения и диагностика
END_VAR
VAR
	xInitialized        : BOOL; // Начальные безопасные значения заданы
	xAllMachinesSafe    : BOOL; // Станки не обслуживаются и не обрабатывают
	xAllMachinesDisabled: BOOL; // Все станки выключены
	xAllTypesHaveMachines : BOOL; // Каждый тип назначен хотя бы одному станку
	uiMachine           : UINT; // Индекс станка
	uiSlot              : UINT; // Индекс слота
	uiType              : UINT; // Индекс типа
	auiMachineCount     : ARRAY [1..3] OF UINT; // Количество станков каждого типа
	auiSlotCount        : ARRAY [1..3] OF UINT; // Количество слотов каждого типа
	rtSetTypeCount      : R_TRIG; // Фронт изменения количества типов
	rtSetMachineType    : R_TRIG; // Фронт назначения типа станку
	rtSetSlotType       : R_TRIG; // Фронт назначения типа слоту
	rtAutoDistribute    : R_TRIG; // Фронт автоматического распределения
END_VAR
VAR CONSTANT
	FIRST_MACHINE : UINT := UINT#1;
	LAST_MACHINE  : UINT := UINT#3;
	FIRST_TYPE    : UINT := UINT#1;
	LAST_TYPE     : UINT := UINT#3;
	WRN_TYPE_COUNT_NOT_ALLOWED : UINT := UINT#23;
	WRN_MACHINE_TYPE_REJECTED  : UINT := UINT#24;
	WRN_SLOT_TYPE_REJECTED     : UINT := UINT#25;
	WRN_DISTRIBUTION_REJECTED  : UINT := UINT#26;
END_VAR

// --- BEGIN IMPLEMENTATION ---

IF (uiRows > UINT#0)
AND (uiColumns > UINT#0)
AND ((uiRows * uiColumns) <= SINT_TO_UINT(GVL_CELL_SETTINGS.NumberDetail)) THEN
	Status.uiActiveSlotCount := uiRows * uiColumns;
ELSE
	Status.uiActiveSlotCount := UINT#0;
END_IF;

IF NOT xInitialized THEN
	Config.uiTypeCount := UINT#1;
	FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
		Config.auiMachineType[uiMachine] := UINT#1;
	END_FOR;
	FOR uiSlot := UINT#1 TO SINT_TO_UINT(GVL_CELL_SETTINGS.NumberDetail) DO
		IF uiSlot <= Status.uiActiveSlotCount THEN
			Config.auiSlotType[uiSlot] := UINT#1;
		ELSE
			Config.auiSlotType[uiSlot] := UINT#0;
		END_IF;
	END_FOR;
	xInitialized := TRUE;
END_IF;

xAllMachinesSafe := TRUE;
xAllMachinesDisabled := TRUE;
FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
	IF astMachineStatus[uiMachine].xBusy
	OR astMachineStatus[uiMachine].xProcessing THEN
		xAllMachinesSafe := FALSE;
	END_IF;
	IF astMachineStatus[uiMachine].xEnabled
	OR astMachineStatus[uiMachine].xDisablePending THEN
		xAllMachinesDisabled := FALSE;
	END_IF;
END_FOR;

Status.xMagazineConfigAllowed := NOT xCellRunning
	AND NOT xMotionBusy
	AND NOT stRobotStatus.xBusy
	AND NOT stRobotStatus.xBlankAvailable
	AND NOT stRobotStatus.xDetailAvailable
	AND NOT stMagazineStatus.xEnabled
	AND NOT stMagazineStatus.xBusy
	AND xAllMachinesSafe;
Status.xTypeCountAllowed := Status.xMagazineConfigAllowed
	AND xAllMachinesDisabled;

FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
	Status.axMachineTypeAllowed[uiMachine] := NOT xCellRunning
		AND NOT xMotionBusy
		AND NOT stRobotStatus.xBusy
		AND NOT stRobotStatus.xBlankAvailable
		AND NOT stRobotStatus.xDetailAvailable
		AND NOT stMagazineStatus.xBusy
		AND NOT astMachineStatus[uiMachine].xEnabled
		AND NOT astMachineStatus[uiMachine].xDisablePending
		AND NOT astMachineStatus[uiMachine].xBusy
		AND NOT astMachineStatus[uiMachine].xProcessing;
END_FOR;

rtSetTypeCount(CLK := Command.xSetTypeCount);
rtSetMachineType(CLK := Command.xSetMachineType);
rtSetSlotType(CLK := Command.xSetSlotType);
rtAutoDistribute(CLK := Command.xAutoDistribute);

IF rtSetTypeCount.Q THEN
	IF NOT Status.xTypeCountAllowed
	OR (Command.uiRequestedTypeCount < FIRST_TYPE)
	OR (Command.uiRequestedTypeCount > LAST_TYPE) THEN
		RaiseWarning(uiCode := WRN_TYPE_COUNT_NOT_ALLOWED);
	ELSE
		Config.uiTypeCount := Command.uiRequestedTypeCount;
		CASE Config.uiTypeCount OF
			UINT#1:
				Config.auiMachineType[1] := UINT#1;
				Config.auiMachineType[2] := UINT#1;
				Config.auiMachineType[3] := UINT#1;
			UINT#2:
				Config.auiMachineType[1] := UINT#1;
				Config.auiMachineType[2] := UINT#1;
				Config.auiMachineType[3] := UINT#2;
			UINT#3:
				Config.auiMachineType[1] := UINT#1;
				Config.auiMachineType[2] := UINT#2;
				Config.auiMachineType[3] := UINT#3;
		END_CASE;
		ApplyDistribution();
	END_IF;
END_IF;

IF rtSetMachineType.Q THEN
	IF (Command.uiRequestedMachine < FIRST_MACHINE)
	OR (Command.uiRequestedMachine > LAST_MACHINE) THEN
		RaiseWarning(uiCode := WRN_MACHINE_TYPE_REJECTED);
	ELSE
		IF (Command.uiRequestedMachineType < FIRST_TYPE)
		OR (Command.uiRequestedMachineType > Config.uiTypeCount)
		OR NOT Status.axMachineTypeAllowed[Command.uiRequestedMachine] THEN
			RaiseWarning(uiCode := WRN_MACHINE_TYPE_REJECTED);
		ELSE
			Config.auiMachineType[Command.uiRequestedMachine] := Command.uiRequestedMachineType;
		END_IF;
	END_IF;
END_IF;

IF rtSetSlotType.Q THEN
	IF NOT Status.xMagazineConfigAllowed
	OR (Command.uiRequestedSlot < UINT#1)
	OR (Command.uiRequestedSlot > Status.uiActiveSlotCount)
	OR (Command.uiRequestedSlotType < FIRST_TYPE)
	OR (Command.uiRequestedSlotType > Config.uiTypeCount) THEN
		RaiseWarning(uiCode := WRN_SLOT_TYPE_REJECTED);
	ELSE
		Config.auiSlotType[Command.uiRequestedSlot] := Command.uiRequestedSlotType;
	END_IF;
END_IF;

IF rtAutoDistribute.Q THEN
	xAllTypesHaveMachines := TRUE;
	FOR uiType := FIRST_TYPE TO LAST_TYPE DO
		auiMachineCount[uiType] := UINT#0;
	END_FOR;
	FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
		IF (Config.auiMachineType[uiMachine] >= FIRST_TYPE)
		AND (Config.auiMachineType[uiMachine] <= Config.uiTypeCount) THEN
			auiMachineCount[Config.auiMachineType[uiMachine]] :=
				auiMachineCount[Config.auiMachineType[uiMachine]] + UINT#1;
		END_IF;
	END_FOR;
	FOR uiType := FIRST_TYPE TO Config.uiTypeCount DO
		IF auiMachineCount[uiType] = UINT#0 THEN
			xAllTypesHaveMachines := FALSE;
		END_IF;
	END_FOR;

	IF NOT Status.xMagazineConfigAllowed
	OR NOT xAllTypesHaveMachines THEN
		RaiseWarning(uiCode := WRN_DISTRIBUTION_REJECTED);
	ELSE
		ApplyDistribution();
	END_IF;
END_IF;

// Тестовый сценарий проходит общую PLC-валидацию до этого вызова. Запись
// выполняет владелец Config, поэтому значения не теряются на выходной привязке FB.
IF xTestInitialize THEN
	Config.uiTypeCount := stTestScenario.uiTypeCount;
	FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
		Config.auiMachineType[uiMachine] := stTestScenario.auiMachineType[uiMachine];
	END_FOR;
	FOR uiSlot := UINT#1 TO SINT_TO_UINT(GVL_CELL_SETTINGS.NumberDetail) DO
		Config.auiSlotType[uiSlot] := stTestScenario.auiSlotType[uiSlot];
	END_FOR;
END_IF;

FOR uiType := FIRST_TYPE TO LAST_TYPE DO
	auiMachineCount[uiType] := UINT#0;
	auiSlotCount[uiType] := UINT#0;
END_FOR;

Status.xConfigurationValid := (Config.uiTypeCount >= FIRST_TYPE)
	AND (Config.uiTypeCount <= LAST_TYPE)
	AND (Status.uiActiveSlotCount > UINT#0);

FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
	IF (Config.auiMachineType[uiMachine] < FIRST_TYPE)
	OR (Config.auiMachineType[uiMachine] > Config.uiTypeCount) THEN
		Status.xConfigurationValid := FALSE;
	ELSE
		auiMachineCount[Config.auiMachineType[uiMachine]] :=
			auiMachineCount[Config.auiMachineType[uiMachine]] + UINT#1;
	END_IF;
END_FOR;

FOR uiSlot := UINT#1 TO Status.uiActiveSlotCount DO
	IF (Config.auiSlotType[uiSlot] < FIRST_TYPE)
	OR (Config.auiSlotType[uiSlot] > Config.uiTypeCount) THEN
		Status.xConfigurationValid := FALSE;
	ELSE
		auiSlotCount[Config.auiSlotType[uiSlot]] :=
			auiSlotCount[Config.auiSlotType[uiSlot]] + UINT#1;
	END_IF;
END_FOR;

FOR uiType := FIRST_TYPE TO Config.uiTypeCount DO
	IF (auiMachineCount[uiType] = UINT#0)
	OR (auiSlotCount[uiType] = UINT#0) THEN
		Status.xConfigurationValid := FALSE;
	END_IF;
END_FOR;
