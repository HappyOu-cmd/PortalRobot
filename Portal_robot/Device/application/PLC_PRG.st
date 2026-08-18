PROGRAM PLC_PRG
VAR
	AXIS_X         : FB_AXIS; // Управление осью X
	AXIS_Y         : FB_AXIS; // Управление осью Y
	AXIS_Z         : FB_AXIS; // Управление осью Z
	GROUP_XYZ      : FB_AXIS_GROUP; // Управление группой осей XYZ
	MOTION_MANAGER : FB_MOTION_MANAGER; // Менеджер движения по именованным точкам
	MACHINE_1      : FB_MACHINE; // Логика первого станка
	MACHINE_2      : FB_MACHINE; // Логика второго станка
	MACHINE_3      : FB_MACHINE; // Логика третьего станка
	MACHINE_1_SIM  : FB_MACHINE_SIMULATION; // Симуляция первого станка
	MACHINE_2_SIM  : FB_MACHINE_SIMULATION; // Симуляция второго станка
	MACHINE_3_SIM  : FB_MACHINE_SIMULATION; // Симуляция третьего станка
	MACHINE_1_FAULT: FB_MACHINE_FAULT_INJECTOR; // Инъекция обратной связи первого станка
	MACHINE_2_FAULT: FB_MACHINE_FAULT_INJECTOR; // Инъекция обратной связи второго станка
	MACHINE_3_FAULT: FB_MACHINE_FAULT_INJECTOR; // Инъекция обратной связи третьего станка
	fbMagazine1    : FB_MAGAZINE; // Первый индексный магазин; имя не конфликтует с SoftMotion-осью Magazine_1
	fbMagazine2    : FB_MAGAZINE; // Второй индексный магазин; имя не конфликтует с SoftMotion-осью Magazine_2
	MAGAZINE_AXIS_1 : FB_AXIS; // Сервопривод первого магазина
	MAGAZINE_AXIS_2 : FB_AXIS; // Сервопривод второго магазина
	ROBOT          : FB_ROBOT; // Координация движений и захвата робота
	ROBOT_MODBUS   : FB_ROBOT_MODBUS; // Modbus TCP транспорт внешнего контроллера
	TYPE_CONFIG    : FB_MULTI_TYPE_CONFIG_MANAGER; // Конфигурация типов продукции
	CELL_MANAGER   : FB_CELL_MANAGER; // Универсальный автоматический цикл для одного-трёх типов
	ALARM_MANAGER  : FB_ALARM_MANAGER; // Журнал аварий и предупреждений
	uiMachine      : UINT; // Индекс станка при обработке команд HMI
	iDetail        : SINT; // Индекс слота при передаче состояния магазина в HMI
	xRobotHmiPermit: BOOL; // Разрешение ручных команд робота с HMI
	xDrivesReady   : BOOL; // Все оси и группа готовы к движению
	xDrivesPowered : BOOL; // На все три оси фактически подано питание
	xAnyDrivePowered : BOOL; // Хотя бы на одну ось фактически подано питание
	xDrivesOff     : BOOL; // Все силовые части отключены, группа в GroupDisabled
	xPowerTransitionActive : BOOL; // Выполняется последовательность включения или отключения
	xPowerDisableRequest : BOOL; // Единый запрос штатного отключения через группу
	xDriveError    : BOOL; // Активна ошибка хотя бы одной оси или группы
	xAxisDriveError : BOOL; // Активна ошибка одиночной оси; не включает административную ошибку группы
	xGroupError    : BOOL; // Активна ошибка координатной группы
	xMotionBusy    : BOOL; // Хотя бы одна ось ещё выполняет команду
	xGroupMotionBusy : BOOL; // Координатная группа выполняет движение или остановку
	xRobotAutoPowerOff : BOOL; // Автоматическое снятие питания приводов при аварии робота
	xHmiConnectionAlive : BOOL; // Watchdog связи HMI -> PLC
	xManualRecoveryActive : BOOL; // Ограниченное ручное восстановление при общей ошибке
	xHmiRobotActionBaseAllowed : BOOL; // Условия ручного перемещения робота к точке
	xHmiGripperActionBaseAllowed : BOOL; // Условия ручного действия захвата независимо от Motion-слоя
	xHmiRobotActionAllowed : BOOL;
	xHmiRobotActionAttempt : BOOL;
	rtHmiRobotAction : R_TRIG;
	udiLastHmiHeartbeat : UDINT; // Последний принятый heartbeat HMI
	tonHmiWatchdog : TON; // Таймаут HMI heartbeat
	uiManualAxisOwner : UINT; // Единственная ось-владелец текущей команды HMI
	uiManualAxisRequest : UINT; // Ось, запросившая новую ручную команду в текущем цикле
	axManualAxisBaseAllowed : ARRAY [1..3] OF BOOL;
	axManualAxisCommandRejected : ARRAY [1..3] OF BOOL;
	artManualAxisReject : ARRAY [1..3] OF R_TRIG;
	artHmiAxisHome : ARRAY [1..3] OF R_TRIG; // Фронты импульсных Home-команд HMI
	artHmiAxisMoveAbsolute : ARRAY [1..3] OF R_TRIG; // Фронты абсолютных команд HMI
	artHmiAxisMoveRelative : ARRAY [1..3] OF R_TRIG; // Фронты шаговых команд HMI
	axHmiAxisHomePulse : ARRAY [1..3] OF BOOL;
	axHmiAxisMoveAbsolutePulse : ARRAY [1..3] OF BOOL;
	axHmiAxisMoveRelativePulse : ARRAY [1..3] OF BOOL;
	alrRobotManualRatedVelocity : ARRAY [1..3] OF LREAL; // Фактические 100% из AXIS_REF_SM3
	alrRobotRatedAcceleration : ARRAY [1..3] OF LREAL; // Максимальное ускорение из AXIS_REF_SM3
	alrRobotRatedDeceleration : ARRAY [1..3] OF LREAL; // Максимальное замедление из AXIS_REF_SM3
	alrRobotRatedJerk : ARRAY [1..3] OF LREAL; // Максимальный jerk из AXIS_REF_SM3
	axRobotSoftwareLimitsEnabled : ARRAY [1..3] OF BOOL; // Фактическое включение software limits в AXIS_REF_SM3
	alrRobotSoftwareMinPosition : ARRAY [1..3] OF LREAL; // Отрицательный software limit SoftMotion
	alrRobotSoftwareMaxPosition : ARRAY [1..3] OF LREAL; // Положительный software limit SoftMotion
	alrRobotJogVelocity : ARRAY [1..3] OF LREAL; // Скорость одиночной оси с учётом общего коэффициента
	xHmiDrivesEnableAccepted : BOOL; // Авторитетное решение RunMotion по команде включения
	xHmiDrivesDisableAccepted : BOOL; // Авторитетное решение RunMotion по команде отключения
	xHmiResetAccepted : BOOL; // Авторитетное решение RunMotion по команде сброса
	xHmiStopAccepted : BOOL; // Авторитетное решение RunMotion по команде остановки
	xRobotProgramStopRequest : BOOL; // Штатная остановка группового движения по запросу автоматики
	xMotionResetRequest : BOOL; // Общий запрос последовательного сброса группы и осей
	xGroupResetPulse : BOOL; // Импульс MC_GroupReset; он также сбрасывает оси группы
	xAxisResetPulse : BOOL; // Последующая очистка локальных защёлок FB_AXIS
	xMotionResetBusy : BOOL; // Последовательность сброса Motion-слоя активна
	rtMotionReset : R_TRIG; // Фронт единого запроса сброса Motion-слоя
	eMotionResetState : E_MOTION_RESET_STATE := E_MOTION_RESET_STATE.IDLE;
	xAlarmResetRequired : BOOL; // Хотя бы один владелец общей команды находится в аварии
	xAlarmResetAllowed : BOOL; // Все активные владельцы аварий готовы принять общий сброс
	stRobotHmiCommand : ST_ROBOT_COMMAND; // Команда робота с учётом оперативной остановки HMI
	stSelectedMagazineCommand : ST_ROBOT_COMMAND; // Единственная команда двух магазинов роботу
	stMagazinePointCommand : ST_ROBOT_COMMAND; // Команда, по которой рассчитывается временная точка
	eMagazineBasePoint : E_POINT_NAME; // База выбранного магазина
	uiMagazine : UINT; // Индекс магазина 1..2
	auiMagazineEditSlot : ARRAY [1..2] OF UINT; // Новый контракт с fallback на legacy-команду первого магазина
	astMagazineAxisFaultRequest : ARRAY [1..2] OF ST_AXIS_FAULT_REQUEST;
	udiLastTypeConfigWarningSequence : UDINT; // Последнее переданное предупреждение конфигуратора
	astMachineFaultRequest : ARRAY [1..3] OF ST_MACHINE_FAULT_REQUEST; // Запросы ошибок станков
	astAxisFaultRequest    : ARRAY [1..3] OF ST_AXIS_FAULT_REQUEST; // Запросы ошибок осей
	stAxisGroupFaultRequest: ST_AXIS_GROUP_FAULT_REQUEST; // Запрос ошибки группы XYZ
	stRobotFaultRequest    : ST_ROBOT_FAULT_REQUEST; // Запросы ошибок робота и точки
	astMagazineFaultRequest : ARRAY [1..2] OF ST_MAGAZINE_FAULT_REQUEST; // Диагностика двух магазинов
	stCellFaultRequest     : ST_CELL_FAULT_REQUEST; // Запрос локальной ошибки менеджера ячейки
	astAlarmSource : ARRAY [1..16] OF ST_ALARM_SOURCE_DATA; // Два магазина и две отдельные оси
	xSafetyHomeDefaultsInitialized : BOOL; // Стартовые значения HOME_SAFETY записаны один раз
	xMagazinePointDefaultsInitialized : BOOL; // Базы двух магазинов не перетираются каждый цикл
	xRobotInterfaceReady : BOOL; // Готовность применённого интерфейса робота
	lrRobotActualX : LREAL; // Координаты выбранного источника управления
	lrRobotActualY : LREAL;
	lrRobotActualZ : LREAL;
	xModeCommonSafe : BOOL; // Общие условия изменения источника управления
	xAllMachinesIdle : BOOL;
	rtRobotModeApply : R_TRIG;
	rtModbusSettingsApply : R_TRIG;
	xModbusHmiInitialized : BOOL;
	uiRobotInterfaceWarningCode : UINT;
	uiRobotManualMagazineIndex : UINT;
	uiRobotManualMagazineRow : UINT;
	uiRobotManualMagazineColumn : UINT;
	rtTestEnvironmentApply : R_TRIG;
	rtTestSpeedProfileApply : R_TRIG;
	rtTestScenarioApply : R_TRIG;
	xTestInitializePulse : BOOL;
	xTestStable : BOOL;
	xTestScenarioValid : BOOL;
	xSc500BenchKeyLost : BOOL;
	uiTestIndex : UINT;
	uiTestFaultOwnerCount : UINT;
END_VAR

VAR CONSTANT
	WRN_HMI_MANUAL_REJECTED : UINT := 12; // PLC отклонил команду расширенного ручного управления
	WRN_ROBOT_MODE_REJECTED : UINT := 13; // PLC отклонил переключение источника управления
	WRN_MODBUS_SETTINGS_REJECTED : UINT := 14; // PLC отклонил применение параметров соединения
	alrRobotManualFallbackVelocity : ARRAY [1..3] OF LREAL := [1000.0, 1000.0, 1000.0]; // Резерв, если привод не публикует динамический предел
	alrRobotManualAcceleration : ARRAY [1..3] OF LREAL := [1000.0, 1000.0, 1000.0]; // Резерв ускорения, если привод не публикует предел
	alrRobotManualDeceleration : ARRAY [1..3] OF LREAL := [1000.0, 1000.0, 1000.0]; // Резерв замедления, если привод не публикует предел
	alrRobotManualJerk : ARRAY [1..3] OF LREAL := [10000.0, 10000.0, 10000.0]; // Резерв jerk, если привод не публикует предел
END_VAR

// --- BEGIN IMPLEMENTATION ---

ReadHmiInputs();
SetApplicationDefaults();
RunMotion();
RunRobotModbus();
RunTestControl();
RunCellControl();
RunMachines();
RunMagazine();
RunRobot();
RunAlarms();
PublishHmi();
