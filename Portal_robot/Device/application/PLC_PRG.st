PROGRAM PLC_PRG
VAR
	GEOMETRY : ARRAY [1..2] OF FB_GEOMETRY_CONTROL;
	GEOMETRY_SIM : ARRAY [1..2] OF FB_GEOMETRY_CONTROL_SIMULATION;
	xGeometryInitialized : BOOL;
	xGeometryEnvironmentChanged : BOOL;
	eGeometryPreviousEnvironment : E_CELL_TEST_ENVIRONMENT;
	uiGeometry : UINT;
	uiGeometryMachine : UINT;
	uiGeometryDi : UINT;
	udiGeometryRequest : UDINT;
	stGeometryRequest : ST_GEOMETRY_REQUEST;
	stGeometryConfig : ST_GEOMETRY_CONFIG;
	stGeometryCall : ST_GEOMETRY_CALL;
	stGeometryEmptyCall : ST_GEOMETRY_CALL;
	xGeometryConfigValid : BOOL;
	xGeometryDriveAlarm : BOOL;
	xGeometryDriveRunning : BOOL;
	xGeometryPartAtEnd : BOOL;
	stGeometrySignals : ST_GEOMETRY_SIGNALS;
	xGeometryRequestFresh : BOOL;
	xGeometryStopAttempt : BOOL;
	eGeometryPlace : E_POINT_NAME;
	eGeometrySafe : E_POINT_NAME;
	eGeometryChange : E_POINT_NAME;
    // Диагностика физического I/O: один владелец подмен и FIFO на 100 событий.
    axIoRawDi : ARRAY [1..84] OF BOOL;
    axIoUsedDi : ARRAY [1..84] OF BOOL;
    axIoForced : ARRAY [1..84] OF BOOL;
    axIoForceValue : ARRAY [1..84] OF BOOL;
    axIoDoForced : ARRAY [1..50] OF BOOL;
    xIoSnapshotPublishing : BOOL;
    axIoDoForceValue : ARRAY [1..50] OF BOOL;
    axIoDoInhibited : ARRAY [1..50] OF BOOL;
    axIoDoAllowed : ARRAY [1..50] OF BOOL;
    axIoDoOnAllowed : ARRAY [1..50] OF BOOL;
    axIoGripperBase : ARRAY [1..3] OF BOOL;
    axIoAutoDo : ARRAY [1..50] OF BOOL;
    axIoMagazineInvalidated : ARRAY [1..2] OF BOOL;
    xIoRawSafetyOk : BOOL;
    xIoManualActive : BOOL;
    xIoManualEndedByOperator : BOOL;
    xIoDoRejected : BOOL;
    xIoEmergencyResetRejected : BOOL;
    xIoEmergencyResetRequested : BOOL;
    udiIoEmergencyRequestSeq : UDINT;
    axIoOutput : ARRAY [1..50] OF BOOL;
    axIoPreviousRaw : ARRAY [1..84] OF BOOL;
    axIoPreviousUsed : ARRAY [1..84] OF BOOL;
    axIoPreviousOutput : ARRAY [1..50] OF BOOL;
    astIoEvent : ARRAY [1..100] OF ST_PHYSICAL_IO_EVENT;
    xIoInitialized : BOOL;
    xIoOverrideRejected : BOOL;
    xIoBusy : BOOL;
    uiIoIndex : UINT;
    uiIoWord : UINT;
    uiIoBit : UINT;
    dwIoBit : DWORD;
    udiIoNowMs : UDINT;
    udiIoLastTickMs : UDINT;
    uliIoClockMs : ULINT;
    udiIoHeartbeatSeen : UDINT;
    uliIoLeaseAgeMs : ULINT;
    tonIoOverrideWatchdog : TON;
    udiIoRequestSeq : UDINT;
    uiIoRequestAction : UINT;
    uiIoRequestIndex : UINT;
    xIoRequestValue : BOOL;
	xPhysicalNormal : BOOL;
	xPhysicalWasNormal : BOOL;
	xPhysicalInputEnable : BOOL;
	xPhysicalOutputEnable : BOOL;
	xPhysicalOutputWasEnabled : BOOL;
	uiPhysicalInput : UINT;
	tPhysicalRise : TIME;
	tPhysicalFall : TIME;
	axPhysicalRaw : ARRAY [1..84] OF BOOL;
	axPhysicalFiltered : ARRAY [1..80] OF BOOL;
	axPhysicalButtonArmed : ARRAY [1..80] OF BOOL;
	afbPhysicalInputFilter : ARRAY [1..80] OF FB_DI_FILTER;
	astMachineStatusRaw : ARRAY [1..3] OF ST_MACHINE_IO_STATUS;
	AXIS_X         : FB_AXIS; // Управление осью X
	AXIS_Y         : FB_AXIS; // Управление осью Y
	AXIS_Z         : FB_AXIS; // Управление осью Z
	GROUP_XYZ      : FB_AXIS_GROUP; // Управление группой осей XYZ
	SIMULATION_DYNAMICS : FB_SIMULATION_DYNAMIC_LIMITS; // Транзакционное масштабирование лимитов XYZ между тестами
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
	TWIN_AXIS_1 : FB_AXIS;
	TWIN_AXIS_2 : FB_AXIS;
	TWIN : ARRAY [1..2] OF FB_TWO_PALLET;
	axTwinMagazineExchangeInProgress : ARRAY [1..2] OF BOOL; // Защёлка фактической смены палет для адресной блокировки магазина
	TWIN_SIM : ARRAY [1..2] OF FB_TWO_PALLET_SIMULATION;
	astTwinCommand : ARRAY [1..2] OF ST_TWO_PALLET_COMMAND;
	axTwinConfigurationChanged : ARRAY [1..2] OF BOOL;
	axTwinExternalCommandRejected : ARRAY [1..2] OF BOOL;
	audiTwinWarningSeen : ARRAY [1..2] OF UDINT;
	audiPartWarningSeen : ARRAY [1..2] OF UDINT;
	astMagazineWarningMerged : ARRAY [1..2] OF ST_WARNING_EVENT;
	uiTwin : UINT;
	uiTwinPallet : UINT;
	uiTwinRobotPalletBefore : UINT; // Смена роли после ручного восстановления снимает прежнюю готовность загрузки
	uiTwinSlot : UINT;
	udiTwinSnapshot : UDINT;
	xTwinStartup : BOOL;
	xTwinSimulationInitialized : BOOL;
	axTwinSimIoOwned : ARRAY [1..2] OF BOOL;
	axTwinSafetyBusy : ARRAY [1..2] OF BOOL;
	axButtonStationInput : ARRAY [1..4] OF BOOL; // Физическая кнопка или виртуальный вход SIMULATION
	axButtonStationEmergencyStopInput : ARRAY [1..4] OF BOOL; // Физический грибок или виртуальный вход SIMULATION
	axTwinRobotStopLatched : ARRAY [1..2] OF BOOL;
	xTwinRobotSwapWindow : BOOL;
	xTwinRobotOperation : BOOL; // Текущая, ожидающая отключения или уже выданная операция магазина
	xTwinOtherLoaded : BOOL;
	xTwinRobotHasBlank : BOOL; // Любая заготовка рабочего банка запрещает автоматический обмен
	xTwinOtherHasBlank : BOOL; // Подтверждённая операторская палета должна содержать заготовку
	xTwinInventoryEditPending : BOOL; // Правка текущего скана отменяет запуск по старому подтверждению
	xTwinAutoSwapEnabled : BOOL;
	axTwinAutoSwapPending : ARRAY [1..2] OF BOOL; // Ожидание смены Finished либо отменяемый ранний запрос
	axMagazineInventoryChanged : ARRAY [1..2] OF BOOL; // Смена/правка только рабочего банка снимает его Finished
	xTwinInventoryCommand : BOOL;
	uiTwinRequestResult : UINT;
	stTwinRequest : ST_TWO_PALLET_REQUEST;
	fbMagazine1    : FB_MAGAZINE; // Первый статичный магазин
	fbMagazine2    : FB_MAGAZINE; // Второй статичный магазин
	ROBOT          : FB_ROBOT; // Координация движений и захвата робота
	stRobotResetDependencies : ST_ROBOT_RESET_DEPENDENCIES; // Внутренний снимок владельцев зависимого Stop
	ROBOT_MODBUS   : FB_ROBOT_MODBUS; // Modbus TCP транспорт внешнего контроллера
	TYPE_CONFIG    : FB_MULTI_TYPE_CONFIG_MANAGER; // Конфигурация типов продукции
	CELL_SAFETY    : FB_CELL_SAFETY; // Дискретный контур безопасности, двери и внешние кнопки
	CELL_MANAGER   : FB_CELL_MANAGER; // Универсальный автоматический цикл для одного-трёх типов
	ALARM_MANAGER  : FB_ALARM_MANAGER; // Журнал аварий и предупреждений
    CONTROLLER_DIAGNOSTICS : FB_CONTROLLER_DIAGNOSTICS;
	fbAlarmHorn : FB_ALARM_HORN; // Импульс на каждую новую аварийную маску
	tonSignalTowerBlink : TON; // Полупериод мигания колонны — 500 мс
	usiSignalTowerMode : USINT; // 1 работа; 2 готова; 3 предупреждение; 4 авария; 5 не готова
	usiSignalTowerPreviousMode : USINT;
	xSignalTowerBlinkOn : BOOL := TRUE;
	uiHmiCommandIndex : UINT;
	udiHmiCommandNowMs : UDINT;
	axHmiCommandConsumed : ARRAY [1..121] OF BOOL;
	axHmiCommandWasHigh : ARRAY [1..121] OF BOOL;
	axHmiInternalPulse : ARRAY [1..121] OF BOOL; // Internal scenario events, consumed next scan
	axHmiCommandPulse : ARRAY [1..121] OF BOOL;
	audiHmiCommandSnapshot : ARRAY [1..121] OF UDINT;
	udiCellSettingSnapshot : UDINT;
	xCellSettingRejected : BOOL;
	uiMachine      : UINT; // Индекс станка при обработке команд HMI
	iDetail        : SINT; // Индекс слота при передаче состояния магазина в HMI
	xRobotHmiPermit: BOOL; // Разрешение ручных команд робота с HMI
	udiCellModeCommandSnapshot : UDINT; // Снимок маркера транзакции текущего скана
	uiCellModeRejectReason : UINT; // Одноцикловая причина отказа для журнала ячейки
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
	xHmiRobotPointTargetAllowed : BOOL; // Люк соответствующего станка открыт для входной точки
	xHmiRobotPointAllowed : BOOL; // Полное разрешение выбранной ручной точки
	eHmiRobotStatusAction : E_ROBOT_ACTION; // Действие для отображения xAllowed/reason
	eHmiRobotStatusPoint : E_POINT_NAME; // Точка для отображения xAllowed/reason
	xHmiRobotStatusPointTargetAllowed : BOOL; // Безопасность выбранной HMI-точки
	xHmiRobotStatusPointAllowed : BOOL; // Полное разрешение выбранной HMI-точки
	xHmiGripperActionBaseAllowed : BOOL; // Условия ручного действия захвата независимо от Motion-слоя
	xHmiRobotActionAllowed : BOOL;
	xHmiRobotActionAttempt : BOOL;
	rtHmiRobotAction : R_TRIG;
	udiLastHmiHeartbeat : UDINT; // Последний принятый heartbeat HMI
	tonHmiWatchdog : TON; // Таймаут HMI heartbeat
	udiLastMobileMotionHeartbeat : UDINT; // Последний heartbeat мобильной аренды
	tonMobileMotionWatchdog : TON; // Таймаут gateway/телефон -> PLC для мобильного движения
	rtMobileMotionStart : R_TRIG; // Фронт новой мобильной аренды
	xMobileMotionLeaseActive : BOOL; // PLC защёлкнул мобильного владельца до полного останова
	xMobileMotionConnectionAlive : BOOL; // Мобильный heartbeat обновляется
	xMobileMotionStopRequest : BOOL; // Независимый запрос контролируемой остановки оси
	rMobileMotionSpeedLimitPercent : REAL := 0.1; // Защёлкнутый глобальный лимит телефона
	rRobotManualEffectiveSpeedPercent : REAL := 0.1; // Итоговый override после PLC-ограничения
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
	xRobotMotionCommandActive : BOOL; // Принятая команда, включая проверку точки и освобождение
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
	astMachineFaultRequest : ARRAY [1..3] OF ST_MACHINE_FAULT_REQUEST; // Запросы ошибок станков
	astAxisFaultRequest    : ARRAY [1..3] OF ST_AXIS_FAULT_REQUEST; // Запросы ошибок осей
	stAxisGroupFaultRequest: ST_AXIS_GROUP_FAULT_REQUEST; // Запрос ошибки группы XYZ
	stRobotFaultRequest    : ST_ROBOT_FAULT_REQUEST; // Запросы ошибок робота и точки
	astMagazineFaultRequest : ARRAY [1..2] OF ST_MAGAZINE_FAULT_REQUEST; // Диагностика двух магазинов
	stCellFaultRequest     : ST_CELL_FAULT_REQUEST; // Запрос локальной ошибки менеджера ячейки
	stSafetyFaultRequest   : ST_CELL_SAFETY_FAULT_REQUEST; // Независимые инъекции дискретной безопасности
	astAlarmSource : ARRAY [1..22] OF ST_ALARM_SOURCE_DATA; // Старые коды сохранены; диагностика MC522 добавлена в конец.
	astAdditionalCellWarning : ARRAY [1..2] OF ST_WARNING_EVENT; // 1: конфигуратор, 2: общие предупреждения ГК
	uiPointEditorIndex : UINT; // Компактный индекс фиксированной точки редактора 1..14
	uiPointEditorGeometryStation : UINT; // 0 прежняя точка, 1/2 база ГК
	uiPointStorageIndex : UINT; // Индекс в совместимом Persistent-массиве 1..15
	ePointEditorName : E_POINT_NAME; // Фактический enum выбранной инженерной точки
	xPointTableReady : BOOL; // Все 12 базовых точек подтверждены редактором
	axMachinePointsReady : ARRAY [1..3] OF BOOL; // Три рабочие точки каждого станка
	axMagazinePointsReady : ARRAY [1..2] OF BOOL; // База и оба Z-смещения каждого магазина
	xCellPointsReady : BOOL; // HOME_SAFETY и точки только включённого оборудования
	xPointEditorBaseAllowed : BOOL; // Общие безопасные условия Capture/Save
	xPointEditorAllHomed : BOOL; // Все оси XYZ прошли Home
	xPointEditorRequestValid : BOOL; // Индекс и код новой транзакции распознаны
	xPointEditorDraftValid : BOOL; // XYZ и скорость черновика прошли проверку
	xPointEditorMagazinePoint : BOOL; // Выбрана базовая точка магазина 1 или 2
	xPointEditorGeometrySave : BOOL; // SAVE базы ГК не зависит от технологических блокировок
	udiLastPointEditorCommandSeq : UDINT; // Последняя обработанная транзакция редактора
	xPointCheckRequest : BOOL;
	xPointCheckActive : BOOL;
	xPointCheckStopping : BOOL;
	xPointCheckSeenBusy : BOOL;
	xPointCheckSeenDone : BOOL; // Терминальный ответ Motion хранится до фактического останова
	xPointCheckStopRequest : BOOL;
	xPointCheckConnectionAlive : BOOL;
	udiLastPointCheckHeartbeat : UDINT;
	tonPointCheckWatchdog : TON;
	tonPointCheckStart : TON;
	ePointCheckName : E_POINT_NAME;
	uiPointCheckLoop : UINT;
	uiPointCheckMachine : UINT;
	uiPointCheckReason : UINT;
	stPointCheckCandidate : ST_POINT;
	rPointCheckLatchedSpeed : REAL;
	lrGroupVelocityOverride : LREAL;
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
	xTestAbortActive : BOOL; // Тестовая отмена действует только в виртуальной среде
	xTestStable : BOOL;
	xTestScenarioValid : BOOL;
	uiTestIndex : UINT;
	uiTestMagazine : UINT;
	uiTestFaultOwnerCount : UINT;
	uiTestSlotCount : UINT;
	uiTestPallet : UINT;
	uiTestOtherPallet : UINT;
	uiTestType : UINT;
	xTestTypeHasMachine : BOOL;
	xTestTypeHasSlot : BOOL;
	udiTestGeometryProduced : UDINT;
	xTestGeometrySettingsSaved : BOOL;
	xTestSavedGeometryAuto : BOOL;
	xTestSavedGeometryWait : BOOL;
	stTestEmptyGeometryMemory : ST_GEOMETRY_MEMORY;
	stTestEmptyGeometryCall : ST_GEOMETRY_CALL;
	adwTestMagazineFaultMask : ARRAY [1..2] OF DWORD;
	xApplicationStartupInitialized : BOOL; // Однократная инициализация безопасных настроек после старта/Online Change
END_VAR

VAR CONSTANT
	WRN_HMI_MANUAL_REJECTED : UINT := 12; // PLC отклонил команду расширенного ручного управления
	WRN_ROBOT_MODE_REJECTED : UINT := 13; // PLC отклонил переключение источника управления
	WRN_MODBUS_SETTINGS_REJECTED : UINT := 14; // PLC отклонил применение параметров соединения
	WRN_POINT_EDIT_REJECTED : UINT := 15; // PLC отклонил Capture/Save инженерной точки
	WRN_POINT_CHECK_REJECTED : UINT := 16; // Проверка точки отклонена
	WRN_POINT_CHECK_INTERRUPTED : UINT := 17; // Проверка остановлена потерей связи/разрешений
	aePointCheckNames : ARRAY [1..14] OF E_POINT_NAME := [
		E_POINT_NAME.MACHINE_1_ABOVE, E_POINT_NAME.MACHINE_1_CHUCK_APROACH, E_POINT_NAME.MACHINE_1_CHUCK_POSITION,
		E_POINT_NAME.MACHINE_2_ABOVE, E_POINT_NAME.MACHINE_2_CHUCK_APROACH, E_POINT_NAME.MACHINE_2_CHUCK_POSITION,
		E_POINT_NAME.MACHINE_3_ABOVE, E_POINT_NAME.MACHINE_3_CHUCK_APROACH, E_POINT_NAME.MACHINE_3_CHUCK_POSITION,
		E_POINT_NAME.HOME_SAFETY, E_POINT_NAME.MAGAZINE_1_DETAIL, E_POINT_NAME.MAGAZINE_2_DETAIL,
		E_POINT_NAME.GEOMETRY_1_PLACE, E_POINT_NAME.GEOMETRY_2_PLACE];
	alrRobotManualFallbackVelocity : ARRAY [1..3] OF LREAL := [1000.0, 1000.0, 1000.0]; // Резерв, если привод не публикует динамический предел
	alrRobotManualAcceleration : ARRAY [1..3] OF LREAL := [1000.0, 1000.0, 1000.0]; // Резерв ускорения, если привод не публикует предел
	alrRobotManualDeceleration : ARRAY [1..3] OF LREAL := [1000.0, 1000.0, 1000.0]; // Резерв замедления, если привод не публикует предел
	alrRobotManualJerk : ARRAY [1..3] OF LREAL := [10000.0, 10000.0, 10000.0]; // Резерв jerk, если привод не публикует предел
END_VAR

// --- BEGIN IMPLEMENTATION ---

SetApplicationDefaults();
ReadHmiCommands();
ReadHmiInputs();
ReadIoEmergencyStop();
ReadPhysicalInputs();
RunSafety();
ResetIoEmergencyStop();
RunMotion();
RunRobotModbus();
RunTestControl();
RunTwoPallet();
RunGeometryControl();
RunCellControl();
RunMachines();
RunMagazine();
RunTwoPalletAxis();
RunRobot();
RunAlarms();
RunSignalTower();
WritePhysicalOutputs();
RecordIoDiagnostics();
PublishGeometryControl();
PublishHmi();
