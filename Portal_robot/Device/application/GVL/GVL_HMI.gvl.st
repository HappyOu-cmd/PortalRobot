{attribute 'qualified_only'}
VAR_GLOBAL
	{attribute 'symbol' := 'readwrite'}
	uiTestEnvironmentRequest : UINT := UINT#0;
	{attribute 'symbol' := 'readwrite'}
	xTestEnvironmentApply : BOOL;
	{attribute 'symbol' := 'readwrite'}
	uiTestSpeedProfileRequest : UINT := UINT#0;
	{attribute 'symbol' := 'readwrite'}
	xTestSpeedProfileApply : BOOL;
	{attribute 'symbol' := 'readwrite'}
	xTestSessionActive : BOOL;
	{attribute 'symbol' := 'readwrite'}
	stTestScenario : ST_TEST_SCENARIO_BUFFER;
	{attribute 'symbol' := 'readwrite'}
	xTestScenarioApply : BOOL;
	uiTestEnvironmentApplied : UINT;
	uiTestSpeedProfileApplied : UINT;
	xTestEnvironmentChangeAllowed : BOOL;
	xTestScenarioApplyAllowed : BOOL;
	xSc500BenchKeyActive : BOOL;
	xSc500BenchKeyLost : BOOL;
	uiTestRejectReason : UINT;
	udiTestScenarioAckSeq : UDINT;
	uiTestScenarioResult : UINT;
	stTestObservability : ST_TEST_OBSERVABILITY;
	{attribute 'symbol' := 'readwrite'}
	xSimulationAccelerationEnable : BOOL := FALSE; // Разрешить ускорение только для симуляции
	{attribute 'symbol' := 'readwrite'}
	uiSimulationTimeFactor : UINT := 1; // Коэффициент виртуального времени симуляции 1..100
	xSimulationAccelerationActive : BOOL; // Фактически применённое ускорение
	xSimulationAccelerationChangeAllowed : BOOL; // PLC разрешает менять настройки ускорения
	uiSimulationTimeFactorApplied : UINT := 1; // Фактически применённый коэффициент
	xSimulationAccelerationError : BOOL; // Ошибка применения ускорения виртуальных таймеров
	{attribute 'symbol' := 'readwrite'}
	lrSafetyHomeX : LREAL := 0.0; // Координата X точки HOME_SAFETY
	{attribute 'symbol' := 'readwrite'}
	lrSafetyHomeY : LREAL := 0.0; // Координата Y точки HOME_SAFETY
	{attribute 'symbol' := 'readwrite'}
	lrSafetyHomeZ : LREAL := 0.0; // Координата Z точки HOME_SAFETY
	{attribute 'symbol' := 'readwrite'}
	lrSafetyHomeSpeedFactor : LREAL := 0.2; // Локальный коэффициент скорости точки 0.1..1.0
	{attribute 'symbol' := 'readwrite'}
	lrSafetyHomeToleranceX : LREAL := 5.0; // Допуск безопасной зоны по X, мм
	{attribute 'symbol' := 'readwrite'}
	lrSafetyHomeToleranceY : LREAL := 5.0; // Допуск безопасной зоны по Y, мм
	{attribute 'symbol' := 'readwrite'}
	lrSafetyHomeToleranceZ : LREAL := 5.0; // Допуск безопасной зоны по Z, мм
	{attribute 'symbol' := 'readwrite'}
	stCellMachineTimeouts : ST_MACHINE_TIMEOUTS; // Настраиваемые TIMEOUT технологических ожиданий
	xCellSettingsChangeAllowed : BOOL; // PLC разрешает изменение настроек ячейки
	// Команды и настройки, получаемые от HMI.
	xCellEnable       : BOOL; // Импульс включения оборудования ячейки
	xCellDisable      : BOOL; // Импульс отключения оборудования ячейки
	xCellStart        : BOOL; // Импульс запуска цикла или отмены ожидающей остановки
	xCellStop         : BOOL; // Импульс остановки автоматического цикла
	xCellReset        : BOOL; // Общий сброс ошибок ячейки
	{attribute 'symbol' := 'readwrite'}
	uiCellOperatorChoice : UINT; // Ответ активному предпусковому опросу PLC
	{attribute 'symbol' := 'readwrite'}
	xCellOperatorChoice : BOOL; // Импульс подтверждения ответа предпускового опроса
	{attribute 'symbol' := 'readwrite'}
	xCellOperatorCancel : BOOL; // Импульс отмены предпускового опроса
	xAlarmResetWarnings : BOOL; // Импульс сброса накопленных предупреждений
	xCellManual       : BOOL; // Ручной режим управления ячейкой
	lrOffsetX          : LREAL; // Ручное смещение по оси X
	lrOffsetY          : LREAL; // Ручное смещение по оси Y
	lrOffsetZ          : LREAL; // Ручное смещение по оси Z
	xModbusMode        : BOOL; // Read-only: TRUE, когда PLC применил MODBUS_TCP
	{attribute 'symbol' := 'readwrite'}
	uiRobotControlModeRequest : UINT; // 0 SoftMotion, 1 Modbus TCP
	{attribute 'symbol' := 'readwrite'}
	xRobotControlModeApply : BOOL; // Импульс применения выбранного режима
	{attribute 'symbol' := 'readwrite'}
	uiModbusIpOctet1 : UINT; // Подготавливаемые настройки соединения
	{attribute 'symbol' := 'readwrite'}
	uiModbusIpOctet2 : UINT;
	{attribute 'symbol' := 'readwrite'}
	uiModbusIpOctet3 : UINT;
	{attribute 'symbol' := 'readwrite'}
	uiModbusIpOctet4 : UINT;
	{attribute 'symbol' := 'readwrite'}
	uiModbusPort : UINT := UINT#502;
	{attribute 'symbol' := 'readwrite'}
	uiModbusUnitId : UINT := UINT#1;
	{attribute 'symbol' := 'readwrite'}
	udiModbusResponseTimeoutMs : UDINT := UDINT#500;
	{attribute 'symbol' := 'readwrite'}
	udiModbusPollIntervalMs : UDINT := UDINT#50;
	{attribute 'symbol' := 'readwrite'}
	udiModbusHeartbeatTimeoutMs : UDINT := UDINT#2000;
	{attribute 'symbol' := 'readwrite'}
	xModbusSettingsApply : BOOL; // Импульс атомарного применения настроек
	xRobotModeChangeAllowed : BOOL;
	xModbusSettingsChangeAllowed : BOOL;
	uiRobotModeRejectReason : UINT; // 0 нет запрета, 1 состояние ячейки, 2 приводы, 3 внешний робот, 4 настройки
	uiModbusSettingsRejectReason : UINT;
	stRobotModbusStatus : ST_ROBOT_MODBUS_STATUS;
	auiRobotModbusWriteRegisters : ARRAY [1..9] OF UINT; // Диагностическая копия 1001..1009, read-only для HMI
	auiRobotModbusReadRegisters : ARRAY [1..17] OF UINT; // Диагностическая копия 1101..1117, read-only для HMI
	xRobotDrivesEnable : BOOL; // Импульс включения приводов робота
	xRobotDrivesDisable: BOOL; // Импульс отключения приводов робота
	xRobotStop         : BOOL; // Импульс контролируемой остановки робота
	xRobotReset        : BOOL; // Импульс сброса ошибок робота и приводов
	{attribute 'symbol' := 'readwrite'}
	udiHmiHeartbeat    : UDINT; // Счётчик связи HMI -> PLC, контролируется PLC watchdog
	{attribute 'symbol' := 'readwrite'}
	xRobotContinuousMode : BOOL := FALSE; // Режим ручного движения: FALSE шаг, TRUE непрерывный Jog
	{attribute 'symbol' := 'readwrite'}
	rRobotManualSpeedPercent : REAL := 0.1; // Общий override скорости JOG, MoveAbsolute и движения к точкам, 0.1..100 %; имя сохранено для OPC UA
	{attribute 'symbol' := 'readwrite'}
	lrRobotManualStep : LREAL := 1.0; // Шаг короткого относительного перемещения, мм
	{attribute 'symbol' := 'readwrite'}
	astAxisHmiCommand : ARRAY [1..3] OF ST_AXIS_HMI_COMMAND; // Команды выбранной оси от HMI
	{attribute 'symbol' := 'readwrite'}
	uiRobotManualAction : UINT; // Код E_ROBOT_ACTION без записи типизированного enum через OPC UA
	{attribute 'symbol' := 'readwrite'}
	uiRobotManualPoint : UINT; // Код E_POINT_NAME без записи типизированного enum через OPC UA
	{attribute 'symbol' := 'readwrite'}
	uiRobotManualSlot : UINT := UINT#1; // Активный слот для трёх магазинных точек
	{attribute 'symbol' := 'readwrite'}
	xRobotManualExecute : BOOL; // Импульс ручного действия робота/перехода к точке
	xErrorSimulationEnable : BOOL; // Переключатель диагностического режима эмуляции ошибок
	axSimAxisJogConflict : ARRAY [1..3] OF BOOL; // Импульсы безопасного конфликта Jog осей X/Y/Z
	xSimAxisGroupError : BOOL; // Импульс формирования тестовой ошибки SM3 группы XYZ
	xSimRobotWrongAction : BOOL; // Импульс недопустимого действия робота
	xSimCellBothGrippers : BOOL; // Импульс противоречивого заполнения двух захватов
	xSimGripper1Fault  : BOOL; // Имитация неисправности первого захвата
	xSimGripper2Fault  : BOOL; // Имитация неисправности второго захвата
	xSimGripperRotationFault : BOOL; // Имитация неисправности поворота захвата
	xSimGripperGlobalFault   : BOOL; // Имитация общей неисправности захвата
	xSimPointXOutOfLimit     : BOOL; // Импульс точки с координатой X вне границ
	xSimPointYOutOfLimit     : BOOL; // Импульс точки с координатой Y вне границ
	xSimPointZOutOfLimit     : BOOL; // Импульс точки с координатой Z вне границ
	xSimPointInvalidVelocity : BOOL; // Импульс точки с недопустимой скоростью
	xSimMagazineWrongOperation : BOOL; // Импульс недопустимой операции магазина
	xSimMagazineNoBlank        : BOOL; // Импульс ошибки отсутствия заготовки
	xSimMagazineNoFreeSlot     : BOOL; // Импульс ошибки отсутствия свободного слота
	xSimMagazineInvalidSlot    : BOOL; // Импульс недопустимого номера слота
	xSimMagazineSlotContent    : BOOL; // Импульс несоответствия содержимого слота
	xSimMagazineGeometry       : BOOL; // Импульс недопустимой геометрии магазина
	xMagazineEnable    : BOOL; // Импульс включения магазина
	xMagazineDisable   : BOOL; // Импульс отключения магазина
	xMagazineFillBlanks: BOOL; // Заполнить активные слоты магазина заготовками
	xMagazineClear     : BOOL; // Полностью очистить магазин
	{attribute 'symbol' := 'readwrite'}
	xMagazineCycleSlot : BOOL; // Переключить содержимое выбранного слота
	{attribute 'symbol' := 'readwrite'}
	uiMagazineEditSlot : UINT; // Номер слота, изменяемого оператором
	{attribute 'symbol' := 'readwrite'}
	astMagazineCommand : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF ST_MAGAZINE_HMI_COMMAND;
	{attribute 'symbol' := 'readwrite'}
	uiRobotManualMagazine : UINT := UINT#1; // Магазин ручной роботной команды
	axMachineEnable    : ARRAY [1..3] OF BOOL; // Включить станок или отменить ожидающее отключение
	axMachineDisable   : ARRAY [1..3] OF BOOL; // Импульсы отключения отдельных станков
	axMachineReset     : ARRAY [1..3] OF BOOL; // Команды сброса ошибок отдельных станков
	axMachineSimReset  : ARRAY [1..3] OF BOOL; // Отдельный сброс аварий FB_MACHINE_SIMULATION
	axMachineSimAlarm  : ARRAY [1..3] OF BOOL; // Имитация общей аварии станков
	axMachineSimDoorFault  : ARRAY [1..3] OF BOOL; // Имитация неисправности дверей станков
	axMachineSimChuckFault : ARRAY [1..3] OF BOOL; // Имитация неисправности патронов станков
	axMachineTimeoutRobotMove    : ARRAY [1..3] OF BOOL; // Игнорировать завершение движения робота до TIMEOUT
	axMachineTimeoutRobotAction  : ARRAY [1..3] OF BOOL; // Игнорировать завершение действия захвата до TIMEOUT
	axMachineTimeoutRobotRelease : ARRAY [1..3] OF BOOL; // Игнорировать освобождение интерфейса робота до TIMEOUT
	axMachineTimeoutDoorOpen     : ARRAY [1..3] OF BOOL; // Игнорировать подтверждение открытия двери до TIMEOUT
	axMachineTimeoutDoorClose    : ARRAY [1..3] OF BOOL; // Игнорировать подтверждение закрытия двери до TIMEOUT
	axMachineTimeoutChuckOpen    : ARRAY [1..3] OF BOOL; // Игнорировать подтверждение разжима патрона до TIMEOUT
	axMachineTimeoutChuckClose   : ARRAY [1..3] OF BOOL; // Игнорировать подтверждение зажима патрона до TIMEOUT
	axMachineTimeoutCycleStart   : ARRAY [1..3] OF BOOL; // Игнорировать подтверждение запуска цикла до TIMEOUT
	{attribute 'symbol' := 'readwrite'}
	axMachineSetBlank  : ARRAY [1..3] OF BOOL; // Подтвердить заготовку в патроне
	{attribute 'symbol' := 'readwrite'}
	axMachineSetDetail : ARRAY [1..3] OF BOOL; // Подтвердить готовую деталь в патроне
	{attribute 'symbol' := 'readwrite'}
	axMachineAcceptDoor: ARRAY [1..3] OF BOOL; // Подтвердить закрытие двери
	{attribute 'symbol' := 'readwrite'}
	axMachineRejectDoor: ARRAY [1..3] OF BOOL; // Отказаться от закрытия двери
	{attribute 'symbol' := 'readwrite'}
	axMachineAcceptRun : ARRAY [1..3] OF BOOL; // Подтвердить запуск обработки
	{attribute 'symbol' := 'readwrite'}
	axMachineRejectRun : ARRAY [1..3] OF BOOL; // Отказаться от запуска обработки
	axMachineUsed      : ARRAY [1..3] OF BOOL := [TRUE, TRUE, TRUE]; // Станки в автоматической работе
	xUseHmiCycleTime   : ARRAY [1..3] OF BOOL := [TRUE, TRUE, TRUE]; // Использовать заданное время цикла
	tMachineCycleTime  : ARRAY [1..3] OF TIME := [T#60S, T#60S, T#60S]; // Время цикла станков
	tMachineDoorOpenTime   : TIME := T#1S; // Время открытия двери в симуляторе станка
	tMachineDoorCloseTime  : TIME := T#1S; // Время закрытия двери в симуляторе станка
	tMachineChuckOpenTime  : TIME := T#1S; // Время разжима патрона в симуляторе станка
	tMachineChuckCloseTime : TIME := T#1S; // Время зажима патрона в симуляторе станка
	tGripper1OpenTime   : TIME := T#500MS; // Время открытия первого захвата
	tGripper1CloseTime  : TIME := T#500MS; // Время закрытия первого захвата
	tGripper2OpenTime   : TIME := T#500MS; // Время открытия второго захвата
	tGripper2CloseTime  : TIME := T#500MS; // Время закрытия второго захвата
	tGripperChangeTime  : TIME := T#700MS; // Время смены рабочего захвата
	{attribute 'symbol' := 'readwrite'}
	MagazineRows       : UINT := 12; // Рабочая Zone 2: 12 рядов
	{attribute 'symbol' := 'readwrite'}
	MagazineColumns    : UINT := 10; // Число столбцов магазина
	{attribute 'symbol' := 'readwrite'}
	MagazinePitchX     : LREAL := 60.0; // Шаг слотов по оси X
	{attribute 'symbol' := 'readwrite'}
	MagazinePitchY     : LREAL := 60.0; // Шаг слотов по оси Y
	{attribute 'symbol' := 'readwrite'}
	MagazineSafeZ_1    : LREAL := 0.0; // Безопасная высота над магазином
	{attribute 'symbol' := 'readwrite'}
	MagazineSafeZ_2    : LREAL := 1400.0; // Безопасная высота внутри магазина при смене
	{attribute 'symbol' := 'readwrite'}
	alrMagazineSafeZ_1 : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF LREAL := [0.0, 0.0];
	{attribute 'symbol' := 'readwrite'}
	alrMagazineSafeZ_2 : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF LREAL := [1400.0, 1400.0];
	{attribute 'symbol' := 'readwrite'}
	alrMagazineHomePosition : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF LREAL := [0.0, 0.0];
	{attribute 'symbol' := 'readwrite'}
	alrMagazineIndexTolerance : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF LREAL := [1.0, 1.0];
	stRobotCommand     : ST_ROBOT_COMMAND; // Ручная команда роботу или магазину
	{attribute 'symbol' := 'readwrite'}
	stMultiType        : ST_MULTI_TYPE_HMI; // Конфигурация типов и диагностика универсального цикла

	// Данные, передаваемые в HMI.
	udiPlcHeartbeat : UDINT; // Счётчик циклов PLC для контроля связи
	xHmiConnectionAlive : BOOL; // PLC видит актуальный heartbeat HMI
	xManualRecoveryActive : BOOL; // Разрешён ограниченный Jog в режиме восстановления
	astAxisHmiStatus : ARRAY [1..3] OF ST_AXIS_HMI_STATUS; // xAllowed и диагностика ручного управления по осям
	stRobotHmiStatus : ST_ROBOT_HMI_STATUS; // xAllowed и диагностика ручных действий робота
	xGlobalError    : BOOL; // Активна общая ошибка ячейки
	xErrorSimulationEnabled : BOOL; // Фактическое состояние диагностического режима
	xSimAxisGroupErrorAllowed : BOOL; // Разрешена безопасная инъекция ошибки SM3
	astAxisFaultStatus : ARRAY [1..3] OF ST_FAULT_INJECTION_STATUS; // Доступность инъекции осей X/Y/Z
	stAxisGroupFaultStatus : ST_FAULT_INJECTION_STATUS; // Состояние инжектора SM3 группы
	stGripperFaultStatus   : ST_FAULT_INJECTION_STATUS; // Состояние инжектора захвата
	stRobotFaultStatus     : ST_FAULT_INJECTION_STATUS; // Состояние локального инжектора робота
	stCellFaultStatus      : ST_FAULT_INJECTION_STATUS; // Состояние инжектора менеджера ячейки
	stPointFaultStatus     : ST_FAULT_INJECTION_STATUS; // Состояние инжектора проверки точки
	stMagazineFaultStatus  : ST_FAULT_INJECTION_STATUS; // Legacy: первый магазин
	astMagazineFaultStatus : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF ST_FAULT_INJECTION_STATUS;
	astMachineFaultStatus  : ARRAY [1..3] OF ST_FAULT_INJECTION_STATUS; // Источники аварий станков
	astMachineTimeouts     : ARRAY [1..3] OF ST_MACHINE_TIMEOUTS; // Действующие таймауты станков
	lrActualX       : LREAL; // Текущая координата X
	lrActualY       : LREAL; // Текущая координата Y
	lrActualZ       : LREAL; // Текущая координата Z
	{attribute 'symbol' := 'read'}
	rLoadCNC_1      : REAL; // Процент загрузки станка 1
	{attribute 'symbol' := 'read'}
	rLoadCNC_2      : REAL; // Процент загрузки станка 2
	{attribute 'symbol' := 'read'}
	rLoadCNC_3      : REAL; // Процент загрузки станка 3
	{attribute 'symbol' := 'read'}
	rRobot          : REAL; // Процент загрузки робота

	stCellStatus : ST_CELL_STATUS; // Рабочее состояние автоматического цикла
	stCellDiag   : ST_CELL_DIAG; // Текущий шаг менеджера ячейки
	stCellError  : ST_CELL_ERRORS; // Активные и последние ошибки менеджера ячейки

	stRobotStatus : ST_ROBOT_STATUS; // Состояние робота и двух захватов
	stRobotDiag   : ST_ROBOT_DIAG; // Текущее действие и целевая точка робота
	stRobotError  : ST_ROBOT_ERRORS; // Активные и последние ошибки робота
	stGripperDiag : ST_GRIPPER_DIAG; // Диагностика внутреннего симулятора захвата
	stGripperError: ST_GRIPPER_ERRORS; // Активные и последние ошибки симулятора захвата
	stAxisGroupStatus : ST_AXIS_GROUP_STATUS; // Статусы группы XYZ, включая разрешение тестовой ошибки
	stAxisGroupDiag   : ST_AXIS_GROUP_DIAGNOSTICS; // Диагностика и ErrorID группы XYZ
	stAxisGroupError  : ST_AXIS_GROUP_ERRORS; // Активные и последние ошибки группы XYZ
	astAxisStatus : ARRAY [1..3] OF ST_AXIS_STATUS; // Статусы осей X/Y/Z
	astAxisDiag   : ARRAY [1..3] OF ST_AXIS_DIAGNOSTICS; // Диагностика осей X/Y/Z
	astAxisError  : ARRAY [1..3] OF ST_AXIS_ERROR_CODES; // Ошибки осей X/Y/Z
	stMotionManagerStatus : ST_MOTION_MANAGER_STATUS; // Состояние менеджера движения
	stMotionManagerDiag   : ST_MOTION_MANAGER_DIAG; // Диагностика менеджера движения
	stMotionManagerError  : ST_MOTION_MANAGER_ERRORS; // Ошибки менеджера движения
	stPointManagerStatus  : ST_POINT_MANAGER_STATUS; // Состояние проверки точки
	stPointManagerDiag    : ST_POINT_MANAGER_DIAG; // Диагностика проверки точки
	stPointManagerError   : ST_POINT_MANAGER_ERRORS; // Ошибки проверки точки

	{attribute 'symbol' := 'read'}
	astMachineStatus   : ARRAY [1..3] OF ST_MACHINE_PUBLIC; // Рабочие состояния станков
	astMachineIoStatus : ARRAY [1..3] OF ST_MACHINE_IO_STATUS; // Двери, патроны и циклы станков
	astMachineRawIoStatus : ARRAY [1..3] OF ST_MACHINE_IO_STATUS; // Обратная связь до инжектора
	astMachineDiag     : ARRAY [1..3] OF ST_MACHINE_DIAG; // Текущие шаги и операции станков
	astMachineError    : ARRAY [1..3] OF ST_MACHINE_ERRORS; // Активные и последние ошибки станков
	astMachineSimDiag  : ARRAY [1..3] OF ST_MACHINE_SIM_DIAG; // Диагностика симуляторов станков
	astMachineSimError : ARRAY [1..3] OF ST_MACHINE_SIM_ERRORS; // Ошибки симуляторов станков

	{attribute 'symbol' := 'read'}
	stMagazineStatus : ST_MAGAZINE_STATUS; // Legacy: Zone 2 первого магазина
	stMagazineDiag   : ST_MAGAZINE_DIAG;
	stMagazineError  : ST_MAGAZINE_ERRORS;
	astMagazineSlot  : ARRAY [1..GVL_CELL_SETTINGS.NumberDetail] OF ST_DETAIL;
	astMagazineStatus : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF ST_MAGAZINE_STATUS;
	astMagazineDiag : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF ST_MAGAZINE_DIAG;
	astMagazineError : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF ST_MAGAZINE_ERRORS;
	astMagazineInventory : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF ST_MAGAZINE_INVENTORY;
	astMagazineAxisStatus : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF ST_AXIS_STATUS;
	astMagazineAxisDiag : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF ST_AXIS_DIAGNOSTICS;
	astMagazineAxisError : ARRAY [1..GVL_CELL_SETTINGS.MagazineCount] OF ST_AXIS_ERROR_CODES;
	stAlarmStatus : ST_ALARM_STATUS; // Сводный статус аварий и предупреждений
	astAlarmEvent : ARRAY [1..100] OF ST_ALARM_EVENT; // Журнал активных и зафиксированных событий

	// Совместимость с существующей визуализацией до штатного обновления XML.
	HMI : ST_HMI; // Старый путь GVL_HMI.HMI.ActualX/Y/Z
END_VAR
