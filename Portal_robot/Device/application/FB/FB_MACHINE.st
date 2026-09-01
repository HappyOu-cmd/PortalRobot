FUNCTION_BLOCK FB_MACHINE
VAR_INPUT
	xTestInitialize : BOOL;
	uiTestInitialState : UINT;
	uiTestProductType : UINT;
	xExecute          : BOOL; // Запуск разрешённой операции обслуживания
    xReset            : BOOL; // Сброс ошибки конкретного станка
	xResetGlobal      : BOOL; // Общий сброс ошибок ячейки
	xGlobalError      : BOOL; // Глобальная ошибка ячейки
	xManualMode       : BOOL; // Ручной режим: открытая операторская дверь не формирует аварию обслуживания
	xAutomaticUseEnabled : BOOL; // Станок выбран для автоматической обработки
	xHmiOpenSafetyDoor  : BOOL; // Импульс ручного открытия операторской двери
	xHmiCloseSafetyDoor : BOOL; // Импульс ручного закрытия операторской двери
	xHmiOpenHatch       : BOOL; // Импульс ручного открытия роботного люка
	xHmiCloseHatch      : BOOL; // Импульс ручного закрытия роботного люка
	xHmiOpenChuck       : BOOL; // Импульс ручного разжима патрона
	xHmiCloseChuck      : BOOL; // Импульс ручного зажима патрона
	xHmiSetBlank	  : BOOL; // Ручное подтверждение загруженной заготовки
    xHmiSetDetail     : BOOL; // Ручное подтверждение загруженной детали
	xHmiEnable        : BOOL; // Импульс включения станка или отмены ожидающего отключения
	xHmiDisable       : BOOL; // Импульс отключения станка от работы
	xHmiAcceptRunCNC  : BOOL; // Импульс подтверждения запуска цикла обработки на станке 
	xHmiRejectRunCNC  : BOOL; // Импульс отклонения запуска цикла обработки на станке
	xHmiAcceptDoor    : BOOL; // Импульс подтверждения оператора закрытии двери
	xHmiRejectDoor    : BOOL; // Импульс отклонения оператора закрытии двери
	xUseHmiCycleTime  : BOOL; // TRUE: использовать время цикла, заданное с HMI
	tHmiCycleTime     : TIME; // Начальная или постоянная оценка времени цикла
	stTimeouts        : ST_MACHINE_TIMEOUTS; // Настраиваемые таймауты технологического автомата
	stChangeRecipe    : ARRAY [0..40] OF ST_MACHINE_RECIPE; // Рецепт смены детали
	stLoadRecipe      : ARRAY [0..40] OF ST_MACHINE_RECIPE; // Рецепт загрузки заготовки
	stUnloadRecipe    : ARRAY [0..40] OF ST_MACHINE_RECIPE; // Рецепт выгрузки детали
	stPoints          : ST_MACHINE_POINTS; // Имена рабочих точек станка
	stRobotStatus     : ST_ROBOT_STATUS; // Статусы робота
	stMachineStatus   : ST_MACHINE_IO_STATUS; // Состояние исполнительных механизмов станка
END_VAR
VAR_OUTPUT
	Command : ST_MACHINE_COMMAND; // Команды станку и роботу
	Status  : ST_MACHINE_PUBLIC; // Публичные статусы станка
	Diag    : ST_MACHINE_DIAG; // Состояние автомата и выбранная операция
	Error   : ST_MACHINE_ERRORS; // Активные и последние ошибки
END_VAR
VAR
	eState                  : E_MACHINE_STATE := E_MACHINE_STATE.DISABLED; // Текущее состояние автомата
	ePartState              : E_PART_STATE := E_PART_STATE.UNKNOWN; // Состояние детали в патроне
	ePartType               : E_PART_TYPE := E_PART_TYPE.UNKNOWN; // Тип детали в патроне 
	uiIndex                 : UINT; // Индекс команды рецепта
	tofErrorDoor            : TOF; // Контроль закрытия люка при нахождении робота внутри
	rtExectue               : R_TRIG; // Фронт команды запуска
	rtEnabledMachine        : R_TRIG; // Фронт команды включения
	rtDisabledMachine       : R_TRIG; // Фронт команды отключения
	rtResetMachine          : R_TRIG; // Фронт локального или общего сброса ошибки станка
	rtCycleDone             : R_TRIG; // Фронт завершения цикла станка
	rtCycleStarted          : R_TRIG; // Фронт фактического запуска обработки
	ftCycleStopped          : F_TRIG; // Спад фактического цикла обработки
	rtSetBlankLoaded        : R_TRIG; // Фронт ручного подтверждения заготовки
    rtSetDetailLoaded       : R_TRIG; // Фронт ручного подтверждения детали
	rtHmiOpenSafetyDoor      : R_TRIG; // Фронт ручного открытия операторской двери
	rtHmiCloseSafetyDoor     : R_TRIG; // Фронт ручного закрытия операторской двери
	rtHmiOpenHatch           : R_TRIG; // Фронт ручного открытия люка
	rtHmiCloseHatch          : R_TRIG; // Фронт ручного закрытия люка
	rtHmiOpenChuck           : R_TRIG; // Фронт ручного разжима патрона
	rtHmiCloseChuck          : R_TRIG; // Фронт ручного зажима патрона
	ftChuckClamped          : F_TRIG; // Спад закрытия кулачков
	tonCycleMeasure         : TON; // Измерение длительности автоматического цикла
	tonRobotMoveTimeout     : TON; // Ограничение времени перемещения робота
	tonRobotActionTimeout   : TON; // Ограничение времени действия захвата
	tonRobotReleaseTimeout  : TON; // Ограничение времени освобождения интерфейса робота
	tonDoorOpenTimeout      : TON; // Ограничение времени открытия двери
	tonDoorCloseTimeout     : TON; // Ограничение времени закрытия двери
	tonChuckOpenTimeout     : TON; // Ограничение времени разжима патрона
	tonChuckCloseTimeout    : TON; // Ограничение времени зажима патрона
	tonCycleStartTimeout    : TON; // Ограничение времени подтверждения запуска цикла
	xOperatorRunningCNC     : BOOL; // Оператор запустил цикл обработки с панели оператора
	xOperatorClosingDoor    : BOOL; // Оператор запустил закрытие дверей
	xAutoCycleCommanded     : BOOL; // Цикл был запущен этим блоком
	xCycleMeasureActive     : BOOL; // Измеряется текущий автоматический цикл
	xCycleMeasureValid      : BOOL; // Текущее измерение можно сохранить
	xMeasuredTimeValid      : BOOL; // Получено корректное измеренное время
	tMeasuredCycle          : TIME; // Последнее корректное измеренное время
	tExpectedCycle          : TIME; // Ожидаемое время текущего цикла
	xRetreatStarted         : BOOL; // Начат отход робота от станка
	xRobotInsideMachine     : BOOL; // Робот находится внутри рабочей зоны
	xFaultContextCaptured   : BOOL; // Контекст робота зафиксирован при входе в ERROR
	xRobotInsideAtFault     : BOOL; // Робот был в зоне станка при возникновении ошибки
	xRobotStopRequired      : BOOL; // Итоговая реакция ROBOT_STOP, сформированная станком
	xRobotResetDependencyReady : BOOL; // Каскадная ошибка робота может быть сброшена тем же импульсом
	xSafetyDoorSafe        : BOOL; // Оба сигнала операторской двери непротиворечиво подтверждают закрытие
	xManualControlAllowed  : BOOL; // Общие условия ручного управления механизмами
	xManualSafetyDoorOpenAllowed  : BOOL;
	xManualSafetyDoorCloseAllowed : BOOL;
	xManualHatchOpenAllowed       : BOOL;
	xManualHatchCloseAllowed      : BOOL;
	xManualChuckOpenAllowed       : BOOL;
	xManualChuckCloseAllowed      : BOOL;
	xRobotDone              : BOOL; // Робот освобождён алгоритмом станка
	xServiceDoorCloseDemand : BOOL; // Внутренний запрос закрытия двери
	xServiceDoorOpenDemand  : BOOL; // Внутренний запрос открытия двери
	xAutoDoorOpenLatched    : BOOL; // Защёлка автоматического открытия двери
	xRobotActionDone        : BOOL; // Запрошенное действие захвата уже выполнено
	xRobotCommandStarted    : BOOL; // Текущий шаг рецепта действительно принят FB_ROBOT
	xDisableRequest         : BOOL; // Сохранённый запрос отключения после операции или обработки
	eGrantedOperation       : E_MACHINE_OPERATION; // Разрешённая операция обслуживания
	eActualOperation        : E_MACHINE_OPERATION; // Выполняемая операция обслуживания
	stRecipe                : ARRAY [0..40] OF ST_MACHINE_RECIPE; // Активный рецепт операции
END_VAR

VAR CONSTANT
	ERR_WRONG_OPERATION     : DWORD := 1;       // Выбрана неподдерживаемая операция
	ERR_WRONG_COMMAND       : DWORD := 2;       // В рецепте встретился неподдерживаемый шаг
	ERR_ROBOT_MOTION        : DWORD := 4;       // Робот перешёл в ошибку при движении
	ERR_ROBOT_ACTION        : DWORD := 8;       // Робот перешёл в ошибку при действии захвата
	ERR_DOOR_OPEN           : DWORD := 16;      // Авария станка при открытии люка
	ERR_DOOR_CLOSE          : DWORD := 32;      // Авария станка при закрытии люка
	ERR_CHUCK_OPEN          : DWORD := 64;      // Авария станка при разжиме патрона
	ERR_CHUCK_CLOSE         : DWORD := 128;     // Авария станка при зажиме патрона
	ERR_CYCLE_START         : DWORD := 256;     // Авария станка при запуске цикла
	ERR_SAFETY_STOP         : DWORD := 512;     // Глобальная ошибка ячейки
	ERR_UNKNOWN_DETAIL      : DWORD := 1024;    // Неизвестно содержимое патрона
	ERR_MACHINE_ALARM       : DWORD := 2048;    // Физическая авария станка
	ERR_INDEX               : DWORD := 4096;    // Индекс рецепта вышел за диапазон
	ERR_DOOR_ROBOT          : DWORD := 8192;    // Люк закрывается при роботе в зоне
	ERR_MACHINE_IDLE        : DWORD := 16384;   // Физическая авария станка в IDLE
	ERR_TIMEOUT_ROBOT_MOVE    : DWORD := DWORD#16#00008000; // Таймаут перемещения робота
	ERR_TIMEOUT_ROBOT_ACTION  : DWORD := DWORD#16#00010000; // Таймаут действия захвата
	ERR_TIMEOUT_ROBOT_RELEASE : DWORD := DWORD#16#00020000; // Таймаут освобождения интерфейса робота
	ERR_TIMEOUT_DOOR_OPEN     : DWORD := DWORD#16#00040000; // Таймаут открытия двери
	ERR_TIMEOUT_DOOR_CLOSE    : DWORD := DWORD#16#00080000; // Таймаут закрытия двери
	ERR_TIMEOUT_CHUCK_OPEN    : DWORD := DWORD#16#00100000; // Таймаут разжима патрона
	ERR_TIMEOUT_CHUCK_CLOSE   : DWORD := DWORD#16#00200000; // Таймаут зажима патрона
	ERR_TIMEOUT_CYCLE_START   : DWORD := DWORD#16#00400000; // Таймаут подтверждения запуска цикла
	ERR_SAFETY_DOOR_OPEN     : DWORD := DWORD#16#00800000; // Дверь открылась во время обслуживания

	// Эти ошибки уже относятся к действию робота и всегда имеют эффект ROBOT_STOP.
	MASK_ALWAYS_ROBOT_STOP : DWORD :=
								ERR_ROBOT_MOTION OR
								ERR_ROBOT_ACTION OR
								ERR_DOOR_ROBOT OR
								ERR_SAFETY_DOOR_OPEN OR
								ERR_TIMEOUT_ROBOT_MOVE OR
								ERR_TIMEOUT_ROBOT_ACTION OR
								ERR_TIMEOUT_ROBOT_RELEASE;

	// Первичные ошибки станка: EQUIPMENT_STOP без робота и ROBOT_STOP с роботом.
	MASK_EQUIPMENT_ERROR : DWORD :=
								ERR_WRONG_OPERATION OR
								ERR_WRONG_COMMAND OR
								ERR_DOOR_OPEN OR
								ERR_DOOR_CLOSE OR
								ERR_CHUCK_OPEN OR
								ERR_CHUCK_CLOSE OR
								ERR_CYCLE_START OR
								ERR_UNKNOWN_DETAIL OR
								ERR_MACHINE_ALARM OR
								ERR_INDEX OR
								ERR_MACHINE_IDLE OR
								ERR_TIMEOUT_DOOR_OPEN OR
								ERR_TIMEOUT_DOOR_CLOSE OR
								ERR_TIMEOUT_CHUCK_OPEN OR
								ERR_TIMEOUT_CHUCK_CLOSE OR
								ERR_TIMEOUT_CYCLE_START;
								
	// Ошибки, полученные от других блоков или общей логики ячейки.
	MASK_EXTERNAL_ERROR  	: DWORD :=
								ERR_SAFETY_STOP OR
								ERR_ROBOT_ACTION OR
								ERR_ROBOT_MOTION;

	WRN_RESET_ALARM_ACTIVE : UINT := 1; // Сброс отклонён из-за физической аварии станка
	WRN_RESET_GLOBAL_ERROR : UINT := 2; // Сброс отклонён из-за глобальной ошибки
	WRN_RESET_EXECUTE      : UINT := 3; // Сброс отклонён во время операции обслуживания
	WRN_ENABLE_ALARM_ACTIVE: UINT := 4; // Включение отклонено из-за физической аварии станка
	WRN_ENABLE_PROCESSING  : UINT := 5; // Включение отклонено во время обработки
	WRN_ENABLE_PART_UNKNOWN: UINT := 7; // Состояние изделия в патроне не определено
	WRN_RESET_ROBOT_ERROR  : UINT := 8; // Каскадная ошибка робота ещё не готова к сбросу
	WRN_ENABLE_SAFETY_DOOR_OPEN : UINT := 9; // Включение отклонено: операторская дверь не закрыта
	WRN_MANUAL_CONTROL_REJECTED : UINT := 10; // Ручная команда механизма отклонена PLC
							
	
END_VAR

// --- BEGIN IMPLEMENTATION ---

rtEnabledMachine (CLK :=xHmiEnable);
rtDisabledMachine (CLK :=xHmiDisable);
rtResetMachine(CLK := xReset OR xResetGlobal);
rtCycleDone(CLK := stMachineStatus.xCycleDone);
rtCycleStarted(CLK := stMachineStatus.xCycleActive);
ftCycleStopped(CLK := stMachineStatus.xCycleActive);
rtSetBlankLoaded(CLK := xHmiSetBlank);
rtSetDetailLoaded(CLK := xHmiSetDetail);
rtHmiOpenSafetyDoor(CLK := xHmiOpenSafetyDoor);
rtHmiCloseSafetyDoor(CLK := xHmiCloseSafetyDoor);
rtHmiOpenHatch(CLK := xHmiOpenHatch);
rtHmiCloseHatch(CLK := xHmiCloseHatch);
rtHmiOpenChuck(CLK := xHmiOpenChuck);
rtHmiCloseChuck(CLK := xHmiCloseChuck);
ftChuckClamped(CLK := stMachineStatus.xChuckClamped);

xSafetyDoorSafe := stMachineStatus.xSafetyDoorClosed
	AND NOT stMachineStatus.xSafetyDoorOpen;

xRobotInsideMachine := (eState = E_MACHINE_STATE.ROBOT_ACTION)
	OR ((eState = E_MACHINE_STATE.ROBOT_MOVE)
		AND (stRecipe[uiIndex].stPoint <> E_MACHINE_POINTS.ABOVE))
	OR (stRobotStatus.eCurrentPoint = stPoints.eInside)
	OR (stRobotStatus.eCurrentPoint = stPoints.eChuck)
	OR (stRobotStatus.eCurrentPoint = stPoints.eChuckApproach);

// Ручное управление разрешено только при выбранном ручном режиме и полностью
// исключённом из автоматики станке. Конкретные xAllowed дополнительно не дают
// отправлять бессмысленную команду уже достигнутого положения.
xManualControlAllowed := xManualMode
	AND NOT xAutomaticUseEnabled
	AND (eState = E_MACHINE_STATE.DISABLED)
	AND NOT xGlobalError
	AND NOT stMachineStatus.xAlarm
	AND NOT stMachineStatus.xCycleActive;
xManualSafetyDoorOpenAllowed := xManualControlAllowed
	AND stMachineStatus.xSafetyDoorClosed
	AND NOT stMachineStatus.xSafetyDoorOpen;
xManualSafetyDoorCloseAllowed := xManualControlAllowed
	AND stMachineStatus.xSafetyDoorOpen
	AND NOT stMachineStatus.xSafetyDoorClosed;
xManualHatchOpenAllowed := xManualControlAllowed
	AND stMachineStatus.xDoorClosed
	AND NOT stMachineStatus.xDoorOpen;
xManualHatchCloseAllowed := xManualControlAllowed
	AND stMachineStatus.xDoorOpen
	AND NOT stMachineStatus.xDoorClosed
	AND NOT xRobotInsideMachine;
xManualChuckOpenAllowed := xManualControlAllowed
	AND stMachineStatus.xChuckClamped
	AND NOT stMachineStatus.xChuckUnclamped;
xManualChuckCloseAllowed := xManualControlAllowed
	AND stMachineStatus.xChuckUnclamped
	AND NOT stMachineStatus.xChuckClamped;

xRobotResetDependencyReady := (((Error.dwErrorActive
		AND MASK_ALWAYS_ROBOT_STOP) = DWORD#0)
		AND (((Error.dwErrorActive AND MASK_EQUIPMENT_ERROR) = DWORD#0)
			OR NOT xRobotInsideAtFault))
	OR NOT stRobotStatus.xError
	OR stRobotStatus.xResetAllowed;

// Любой сброс формирует одно предупреждение с конкретной причиной отказа.
IF rtResetMachine.Q
AND (eState = E_MACHINE_STATE.ERROR) THEN
	IF stMachineStatus.xAlarm THEN
		Diag.stWarning.uiCode := WRN_RESET_ALARM_ACTIVE;
	ELSIF xGlobalError THEN
		Diag.stWarning.uiCode := WRN_RESET_GLOBAL_ERROR;
	ELSIF xExecute THEN
		Diag.stWarning.uiCode := WRN_RESET_EXECUTE;
	ELSIF NOT xRobotResetDependencyReady THEN
		Diag.stWarning.uiCode := WRN_RESET_ROBOT_ERROR;
	ELSE
		Diag.stWarning.uiCode := UINT#0;
	END_IF;

	IF Diag.stWarning.uiCode <> UINT#0 THEN
		Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
		IF Diag.stWarning.udiSequence = UDINT#0 THEN
			Diag.stWarning.udiSequence := UDINT#1;
		END_IF;
	END_IF;
END_IF;

// Отклонённая попытка включения регистрируется в журнале предупреждений.
IF rtEnabledMachine.Q
AND (eState = E_MACHINE_STATE.DISABLED)
AND (stMachineStatus.xAlarm
	OR stMachineStatus.xCycleActive
	OR NOT xSafetyDoorSafe
	OR (ePartState = E_PART_STATE.UNKNOWN)) THEN
	IF stMachineStatus.xAlarm THEN
		Diag.stWarning.uiCode := WRN_ENABLE_ALARM_ACTIVE;
	ELSIF stMachineStatus.xCycleActive THEN
		Diag.stWarning.uiCode := WRN_ENABLE_PROCESSING;
	ELSIF NOT xSafetyDoorSafe THEN
		Diag.stWarning.uiCode := WRN_ENABLE_SAFETY_DOOR_OPEN;
	ELSE
		Diag.stWarning.uiCode := WRN_ENABLE_PART_UNKNOWN;
	END_IF;

	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

// HMI показывает xAllowed только визуально. Любая фактически отклонённая
// команда всё равно фиксируется PLC-предупреждением и попадает в журнал.
IF (rtHmiOpenSafetyDoor.Q AND NOT xManualSafetyDoorOpenAllowed)
OR (rtHmiCloseSafetyDoor.Q AND NOT xManualSafetyDoorCloseAllowed)
OR (rtHmiOpenHatch.Q AND NOT xManualHatchOpenAllowed)
OR (rtHmiCloseHatch.Q AND NOT xManualHatchCloseAllowed)
OR (rtHmiOpenChuck.Q AND NOT xManualChuckOpenAllowed)
OR (rtHmiCloseChuck.Q AND NOT xManualChuckCloseAllowed) THEN
	Diag.stWarning.uiCode := WRN_MANUAL_CONTROL_REJECTED;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

// Повторное включение отменяет ещё не выполненный запрос отключения.
// Одновременным командам отдаётся безопасный приоритет отключения.
IF rtDisabledMachine.Q THEN
	xDisableRequest := TRUE;
ELSIF rtEnabledMachine.Q AND xDisableRequest THEN
	xDisableRequest := FALSE;
END_IF;

// Измеряются только циклы, запущенные автоматикой этого блока.
IF rtCycleStarted.Q THEN
	xCycleMeasureActive := xAutoCycleCommanded;
	xCycleMeasureValid := xAutoCycleCommanded;
END_IF;

IF xCycleMeasureActive
AND (stMachineStatus.xAlarm
	OR xGlobalError
	OR (eState = E_MACHINE_STATE.ERROR)
	OR (eState = E_MACHINE_STATE.DISABLED)) THEN
	xCycleMeasureValid := FALSE;
END_IF;

IF ftCycleStopped.Q THEN
	IF xCycleMeasureActive
	AND xCycleMeasureValid
	AND (tonCycleMeasure.ET > T#0S) THEN
		tMeasuredCycle := tonCycleMeasure.ET;
		xMeasuredTimeValid := TRUE;
	END_IF;
	xCycleMeasureActive := FALSE;
	xCycleMeasureValid := FALSE;
	xAutoCycleCommanded := FALSE;
END_IF;

tonCycleMeasure(
	IN := stMachineStatus.xCycleActive,
	PT := T#24H
);

// Таймеры работают только в исполнительных шагах. При переходе в другой шаг
// соответствующий экземпляр TON сбрасывается автоматически.
tonRobotMoveTimeout(
	IN := eState = E_MACHINE_STATE.ROBOT_MOVE,
	PT := stTimeouts.tRobotMove
);
tonRobotActionTimeout(
	IN := eState = E_MACHINE_STATE.ROBOT_ACTION,
	PT := stTimeouts.tRobotAction
);
tonRobotReleaseTimeout(
	IN := eState = E_MACHINE_STATE.RELEASE_ROBOT_ACTION,
	PT := stTimeouts.tRobotRelease
);
tonDoorOpenTimeout(
	IN := eState = E_MACHINE_STATE.DOOR_OPEN,
	PT := stTimeouts.tDoorOpen
);
tonDoorCloseTimeout(
	IN := eState = E_MACHINE_STATE.DOOR_CLOSE,
	PT := stTimeouts.tDoorClose
);
tonChuckOpenTimeout(
	IN := eState = E_MACHINE_STATE.CHUCK_OPEN,
	PT := stTimeouts.tChuckOpen
);
tonChuckCloseTimeout(
	IN := eState = E_MACHINE_STATE.CHUCK_CLOSE,
	PT := stTimeouts.tChuckClose
);
tonCycleStartTimeout(
	IN := eState = E_MACHINE_STATE.CYCLE_START,
	PT := stTimeouts.tCycleStart
);

// В автоматическом режиме до первого измерения используется время с HMI.
IF xUseHmiCycleTime THEN
	tExpectedCycle := tHmiCycleTime;
ELSIF xMeasuredTimeValid THEN
	tExpectedCycle := tMeasuredCycle;
ELSE
	tExpectedCycle := tHmiCycleTime;
END_IF;

// Команды по умолчанию
Command.stIo.xOpenDoor := FALSE;
Command.stIo.xCloseDoor := FALSE;
Command.stIo.xOpenSafetyDoor := FALSE;
Command.stIo.xCloseSafetyDoor := FALSE;
Command.stIo.xClampChuck := FALSE;
Command.stIo.xUnclampChuck := FALSE;
Command.stIo.xStartCycle := FALSE;
Command.stIo.xReset := xReset OR xResetGlobal;

Command.stRobot.xExecute := FALSE;
Command.stRobot.xStop := FALSE;

// Импульсы ручного управления проходят только через рассчитанные PLC-разрешения.
// Автоматический алгоритм станка в DISABLED не формирует параллельных команд.
IF xHmiOpenSafetyDoor AND xManualSafetyDoorOpenAllowed THEN
	Command.stIo.xOpenSafetyDoor := TRUE;
END_IF;
IF xHmiCloseSafetyDoor AND xManualSafetyDoorCloseAllowed THEN
	Command.stIo.xCloseSafetyDoor := TRUE;
END_IF;
IF xHmiOpenHatch AND xManualHatchOpenAllowed THEN
	Command.stIo.xOpenDoor := TRUE;
END_IF;
IF xHmiCloseHatch AND xManualHatchCloseAllowed THEN
	Command.stIo.xCloseDoor := TRUE;
END_IF;
IF xHmiOpenChuck AND xManualChuckOpenAllowed THEN
	Command.stIo.xUnclampChuck := TRUE;
END_IF;
IF xHmiCloseChuck AND xManualChuckCloseAllowed THEN
	Command.stIo.xClampChuck := TRUE;
END_IF;
Command.stRobot.eAction := E_ROBOT_ACTION.NONE;
xServiceDoorOpenDemand := FALSE;
xServiceDoorCloseDemand := FALSE;

IF xTestInitialize THEN
	Error.dwErrorActive := DWORD#0;
	Error.dwAlarmActive := DWORD#0;
	uiIndex := UINT#0;
	xDisableRequest := FALSE;
	xOperatorRunningCNC := FALSE;
	xOperatorClosingDoor := FALSE;
	xAutoCycleCommanded := FALSE;
	xCycleMeasureActive := FALSE;
	xCycleMeasureValid := FALSE;
	xRetreatStarted := FALSE;
	xRobotInsideMachine := FALSE;
	xFaultContextCaptured := FALSE;
	xRobotInsideAtFault := FALSE;
	xRobotStopRequired := FALSE;
	xRobotDone := FALSE;
	xServiceDoorCloseDemand := FALSE;
	xServiceDoorOpenDemand := FALSE;
	xAutoDoorOpenLatched := FALSE;
	xRobotActionDone := FALSE;
	xRobotCommandStarted := FALSE;
	eGrantedOperation := E_MACHINE_OPERATION.NONE;
	eActualOperation := E_MACHINE_OPERATION.NONE;
	IF uiTestInitialState = UINT#0 THEN
		eState := E_MACHINE_STATE.DISABLED;
		ePartType := E_PART_TYPE.UNKNOWN;
	ELSE
		eState := E_MACHINE_STATE.IDLE;
		IF uiTestInitialState = UINT#3 THEN
			ePartType := E_PART_TYPE.DETAIL;
		ELSIF uiTestInitialState = UINT#2 THEN
			ePartType := E_PART_TYPE.PART;
		ELSE
			ePartType := E_PART_TYPE.UNKNOWN;
		END_IF;
	END_IF;
END_IF;

IF stMachineStatus.xChuckClamped AND NOT stMachineStatus.xAlarm THEN
	ePartState := E_PART_STATE.LOADED;
ELSIF stMachineStatus.xChuckUnclamped AND NOT stMachineStatus.xAlarm THEN
	ePartState := E_PART_STATE.EMPTY;
ELSE
	ePartState := E_PART_STATE.UNKNOWN;
END_IF


// // Ручное подтверждение состояния детали
// IF (eState = E_MACHINE_STATE.IDLE)
// AND NOT stMachineStatus.xCycleActive THEN
//     IF rtSetPartLoaded.Q THEN
//         ePartState := E_PART_STATE.LOADED;
//     END_IF;
// 
//     IF rtSetPartEmpty.Q THEN
//         ePartState := E_PART_STATE.EMPTY;
//     END_IF;
// END_IF;

// Автоматическое открытие после окончания обработки
IF rtCycleDone.Q 
	AND NOT stMachineStatus.xAlarm 
	AND NOT stMachineStatus.xCycleActive 
	AND (eState = E_MACHINE_STATE.IDLE) 
	AND NOT xGlobalError THEN
	ePartType := E_PART_TYPE.DETAIL;
    xAutoDoorOpenLatched := TRUE;
END_IF;

IF stMachineStatus.xDoorOpen THEN
    xAutoDoorOpenLatched := FALSE;
END_IF;

eGrantedOperation := E_MACHINE_OPERATION.NONE;

IF (ePartState = E_PART_STATE.EMPTY)
AND (ePartType = E_PART_TYPE.UNKNOWN)
AND stRobotStatus.xBlankAvailable  THEN
    eGrantedOperation := E_MACHINE_OPERATION.LOAD;

ELSIF (ePartState = E_PART_STATE.LOADED)
AND (ePartType = E_PART_TYPE.DETAIL) THEN
    IF stRobotStatus.xBlankAvailable THEN
        eGrantedOperation := E_MACHINE_OPERATION.CHANGE;
    ELSE
        eGrantedOperation := E_MACHINE_OPERATION.UNLOAD;
    END_IF;
ELSIF (ePartState = E_PART_STATE.UNKNOWN) THEN
	eGrantedOperation := E_MACHINE_OPERATION.NONE;
END_IF;

// Включение и отключение блока
IF xDisableRequest
AND ((eState = E_MACHINE_STATE.IDLE)
	OR (eState = E_MACHINE_STATE.OPERATOR_CHOICE_PART)
	OR (eState = E_MACHINE_STATE.OPERATOR_CHOICE_DOOR)
	OR (eState = E_MACHINE_STATE.OPERATOR_CHOICE_RUN)) THEN
    eState := E_MACHINE_STATE.DISABLED;
ELSIF rtEnabledMachine.Q
AND (eState = E_MACHINE_STATE.DISABLED) THEN
	IF NOT stMachineStatus.xAlarm
	AND NOT stMachineStatus.xCycleActive
	AND xSafetyDoorSafe THEN
		IF ePartState = E_PART_STATE.EMPTY THEN
			eState := E_MACHINE_STATE.IDLE;
		ELSIF ePartState = E_PART_STATE.LOADED THEN
			eState := E_MACHINE_STATE.OPERATOR_CHOICE_PART;
		END_IF;
	END_IF;
END_IF;

IF xGlobalError
AND (eState <> E_MACHINE_STATE.DISABLED) THEN
    Error.dwErrorActive := Error.dwErrorActive OR ERR_SAFETY_STOP;
    eState := E_MACHINE_STATE.ERROR;
END_IF;

IF stMachineStatus.xAlarm AND (eState = E_MACHINE_STATE.IDLE) THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE_IDLE;
    eState := E_MACHINE_STATE.ERROR;
END_IF

IF ((eState = E_MACHINE_STATE.OPERATOR_CHOICE_PART) OR (eState = E_MACHINE_STATE.OPERATOR_CHOICE_DOOR) OR (eState = E_MACHINE_STATE.OPERATOR_CHOICE_RUN))
AND ftChuckClamped.Q THEN
	eState := E_MACHINE_STATE.DISABLED;
END_IF; 

IF (eState = E_MACHINE_STATE.DISABLED) OR (eState = E_MACHINE_STATE.ERROR) THEN
	xOperatorRunningCNC := FALSE;
	xOperatorClosingDoor := FALSE;
	ePartType :=   E_PART_TYPE.UNKNOWN;
END_IF
// Останавливаем робота, если люк закрылся при нахождении робота в станке.
tofErrorDoor(
			PT:= T#100MS,
			IN:=stMachineStatus.xDoorOpen
);

// Ошибка робота в рабочей зоне принадлежит одновременно роботу и станку.
// Для действия захвата сохраняется отдельная диагностическая причина.
IF xRobotInsideMachine
AND stRobotStatus.xError
AND (eState <> E_MACHINE_STATE.ERROR) THEN
	IF eState = E_MACHINE_STATE.ROBOT_ACTION THEN
		Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_ACTION;
	ELSE
		Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_MOTION;
	END_IF;
	eState := E_MACHINE_STATE.ERROR;
END_IF;
						
IF xRobotInsideMachine AND NOT tofErrorDoor.Q THEN
	Command.stRobot.xStop := stRobotStatus.xBusy;
	Error.dwErrorActive := Error.dwErrorActive OR ERR_DOOR_ROBOT;
    eState := E_MACHINE_STATE.ERROR;
END_IF

// Открытие операторской двери в любой момент роботного обслуживания
// — первичная авария станка с каскадным ROBOT_STOP.
IF (eActualOperation <> E_MACHINE_OPERATION.NONE)
AND NOT xManualMode
AND NOT xSafetyDoorSafe
AND (eState <> E_MACHINE_STATE.ERROR) THEN
	Command.stRobot.xStop := stRobotStatus.xBusy;
	Error.dwErrorActive := Error.dwErrorActive OR ERR_SAFETY_DOOR_OPEN;
	eState := E_MACHINE_STATE.ERROR;
END_IF;

CASE eState OF
	E_MACHINE_STATE.DISABLED:
		xDisableRequest := FALSE;
		IF NOT stMachineStatus.xCycleActive THEN
			xAutoCycleCommanded := FALSE;
		END_IF;
		
	E_MACHINE_STATE.OPERATOR_CHOICE_PART:
		IF rtSetDetailLoaded.Q AND NOT stMachineStatus.xAlarm THEN
			eState := E_MACHINE_STATE.IDLE;
			ePartType := E_PART_TYPE.DETAIL;
		ELSIF rtSetBlankLoaded.Q AND NOT stMachineStatus.xAlarm THEN
			ePartType := E_PART_TYPE.PART;
			IF stMachineStatus.xDoorClosed THEN
				eState := E_MACHINE_STATE.OPERATOR_CHOICE_RUN;
			ELSE
				eState := E_MACHINE_STATE.OPERATOR_CHOICE_DOOR;
			END_IF;
		ELSIF stMachineStatus.xAlarm THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE_ALARM;
    		eState := E_MACHINE_STATE.ERROR;
		END_IF;
		
	E_MACHINE_STATE.OPERATOR_CHOICE_DOOR:
		// При уже закрытой двери шаг подтверждения закрытия не нужен:
		// автомат сразу переходит к вопросу о запуске обработки.
		IF stMachineStatus.xAlarm THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE_ALARM;
    		eState := E_MACHINE_STATE.ERROR;
		ELSIF xHmiRejectDoor THEN
			eState := E_MACHINE_STATE.DISABLED;
		ELSIF stMachineStatus.xDoorClosed THEN
			eState := E_MACHINE_STATE.OPERATOR_CHOICE_RUN;
		ELSIF xHmiAcceptDoor THEN
			xOperatorClosingDoor := TRUE;
			eState := E_MACHINE_STATE.DOOR_CLOSE;
		END_IF;
		
	E_MACHINE_STATE.OPERATOR_CHOICE_RUN:
		IF xHmiAcceptRunCNC AND NOT stMachineStatus.xAlarm THEN
			xOperatorRunningCNC := TRUE; 
			eState := E_MACHINE_STATE.CYCLE_START;
		ELSIF xHmiRejectRunCNC AND NOT stMachineStatus.xAlarm THEN
			eState := E_MACHINE_STATE.DISABLED;
		ELSIF stMachineStatus.xAlarm THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE_ALARM;
    		eState := E_MACHINE_STATE.ERROR;
		END_IF; 	
		
	E_MACHINE_STATE.IDLE:
		uiIndex := 0;
		xRobotDone := FALSE;
		IF xExecute THEN
			IF (stRobotStatus.eCurrentPoint = stPoints.eAbove)
			AND ePartState <> E_PART_STATE.UNKNOWN
			AND NOT stMachineStatus.xAlarm
			AND NOT stMachineStatus.xCycleActive
			AND xSafetyDoorSafe
    		AND NOT stRobotStatus.xBusy 
			AND NOT stRobotStatus.xError
			AND NOT xGlobalError THEN
				eActualOperation := eGrantedOperation;
				eState := E_MACHINE_STATE.CHOSE;
			ELSIF ePartState = E_PART_STATE.UNKNOWN THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_UNKNOWN_DETAIL;
				eState := E_MACHINE_STATE.ERROR ;
			END_IF
		END_IF
		
	E_MACHINE_STATE.CHOSE:
		CASE eActualOperation OF 
			E_MACHINE_OPERATION.CHANGE:
				stRecipe := stChangeRecipe;
				eState := E_MACHINE_STATE.READ;
			E_MACHINE_OPERATION.LOAD:
				stRecipe := stLoadRecipe;
				eState := E_MACHINE_STATE.READ;
			E_MACHINE_OPERATION.UNLOAD:
				stRecipe := stUnloadRecipe;
				eState := E_MACHINE_STATE.READ;
		ELSE
			Error.dwErrorActive := Error.dwErrorActive OR ERR_WRONG_OPERATION ;
			eState := E_MACHINE_STATE.ERROR;
		END_CASE
		
	E_MACHINE_STATE.READ:
		CASE stRecipe[uiIndex].eCommand OF
			E_MACHINE_STATE.ROBOT_MOVE:
				xRobotCommandStarted := FALSE;
				eState := E_MACHINE_STATE.ROBOT_MOVE;
				
			E_MACHINE_STATE.ROBOT_ACTION:
				xRobotCommandStarted := FALSE;
				eState := E_MACHINE_STATE.ROBOT_ACTION;
				
			E_MACHINE_STATE.DOOR_OPEN:
				eState := E_MACHINE_STATE.DOOR_OPEN;
				
			E_MACHINE_STATE.DOOR_CLOSE:
				eState := E_MACHINE_STATE.DOOR_CLOSE;
				
			E_MACHINE_STATE.CHUCK_OPEN:
				eState := E_MACHINE_STATE.CHUCK_OPEN;
				
			E_MACHINE_STATE.CHUCK_CLOSE:
				eState := E_MACHINE_STATE.CHUCK_CLOSE;
				
			E_MACHINE_STATE.CYCLE_START:
				eState := E_MACHINE_STATE.CYCLE_START;
				
			E_MACHINE_STATE.DONE:
				eState := E_MACHINE_STATE.DONE;
				
		ELSE
			Error.dwErrorActive := Error.dwErrorActive OR ERR_WRONG_COMMAND;
			eState := E_MACHINE_STATE.ERROR;
		END_CASE
	
	E_MACHINE_STATE.NEXT:
			uiIndex := uiIndex + 1;
			IF uiIndex > 40 THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_INDEX;
				eState := E_MACHINE_STATE.ERROR;
			ELSE
				eState := E_MACHINE_STATE.READ;
			END_IF;
	
	E_MACHINE_STATE.ROBOT_MOVE:
		Command.stRobot.xExecute  := TRUE;
		Command.stRobot.eAction   := E_ROBOT_ACTION.MOVE_TO_POINT;
		xRetreatStarted          := stRecipe[uiIndex].xRetreatStarted;
		IF stRecipe[uiIndex].stPoint = E_MACHINE_POINTS.ABOVE  THEN
			Command.stRobot.eSetPoint := stPoints.eAbove;
		ELSIF stRecipe[uiIndex].stPoint = E_MACHINE_POINTS.CHUCK THEN
			Command.stRobot.eSetPoint := stPoints.eChuck;
		ELSIF stRecipe[uiIndex].stPoint = E_MACHINE_POINTS.CHUCK_APPROACH THEN
			Command.stRobot.eSetPoint := stPoints.eChuckApproach;
		ELSIF stRecipe[uiIndex].stPoint = E_MACHINE_POINTS.INSIDE THEN
			Command.stRobot.eSetPoint := stPoints.eInside;
		END_IF
		IF stRobotStatus.xBusy THEN
			xRobotCommandStarted := TRUE;
		END_IF;

		IF stRobotStatus.xError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_MOTION;
			eState := E_MACHINE_STATE.ERROR ;
			
		ELSIF stMachineStatus.xAlarm THEN
			Command.stRobot.xStop := stRobotStatus.xBusy;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE_ALARM;
			eState := E_MACHINE_STATE.ERROR ;
			
		ELSIF xRobotCommandStarted AND stRobotStatus.xDone THEN
        	eState := E_MACHINE_STATE.RELEASE_ROBOT_ACTION;

		ELSIF tonRobotMoveTimeout.Q THEN
			Command.stRobot.xStop := stRobotStatus.xBusy;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_TIMEOUT_ROBOT_MOVE;
			eState := E_MACHINE_STATE.ERROR;
			
    	END_IF;
	
	E_MACHINE_STATE.ROBOT_ACTION:
		xRobotActionDone := FALSE;

		CASE stRecipe[uiIndex].eRobotAction OF
			E_ROBOT_ACTION.UNCLAMP_1:
				xRobotActionDone := stRobotStatus.xGripper1Open;
			E_ROBOT_ACTION.CLAMP_1:
				xRobotActionDone := stRobotStatus.xGripper1Closed;
			E_ROBOT_ACTION.UNCLAMP_2:
				xRobotActionDone := stRobotStatus.xGripper2Open;
			E_ROBOT_ACTION.CLAMP_2:
				xRobotActionDone := stRobotStatus.xGripper2Closed;
			E_ROBOT_ACTION.ROTATE_TO_BLANK:
				xRobotActionDone := stRobotStatus.xRotatedToBlank;
			E_ROBOT_ACTION.ROTATE_TO_DETAIL:
				xRobotActionDone := stRobotStatus.xRotatedToDetail;
		END_CASE;
		IF xRobotActionDone THEN
			eState := E_MACHINE_STATE.NEXT;
		ELSE
			Command.stRobot.xExecute := TRUE;
			Command.stRobot.eAction := stRecipe[uiIndex].eRobotAction;
		END_IF;
		IF stRobotStatus.xBusy THEN
			xRobotCommandStarted := TRUE;
		END_IF;
		
		IF (eState = E_MACHINE_STATE.ROBOT_ACTION)
		AND stMachineStatus.xAlarm THEN
			Command.stRobot.xStop := stRobotStatus.xBusy;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE_ALARM;
			eState := E_MACHINE_STATE.ERROR ;
	
		ELSIF (eState = E_MACHINE_STATE.ROBOT_ACTION)
		AND stRobotStatus.xError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_ACTION;
			eState := E_MACHINE_STATE.ERROR ;

		ELSIF (eState = E_MACHINE_STATE.ROBOT_ACTION)
		AND tonRobotActionTimeout.Q THEN
			Command.stRobot.xStop := stRobotStatus.xBusy;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_TIMEOUT_ROBOT_ACTION;
			eState := E_MACHINE_STATE.ERROR;
			
		ELSIF (eState = E_MACHINE_STATE.ROBOT_ACTION)
		AND xRobotCommandStarted
		AND stRobotStatus.xDone THEN
        	eState := E_MACHINE_STATE.RELEASE_ROBOT_ACTION;
    	END_IF;
		
	E_MACHINE_STATE.RELEASE_ROBOT_ACTION:
		IF NOT stRobotStatus.xBusy
    	AND NOT stRobotStatus.xDone
		AND NOT stRobotStatus.xError THEN
			xRobotDone := stRecipe[uiIndex].xRobotDone;
        	eState := E_MACHINE_STATE.NEXT;
			
		ELSIF stRobotStatus.xError AND  stRecipe[uiIndex].eRobotAction = E_ROBOT_ACTION.MOVE_TO_POINT THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_MOTION;
			eState := E_MACHINE_STATE.ERROR;
			
		ELSIF stRobotStatus.xError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_ACTION;
			eState := E_MACHINE_STATE.ERROR;

		ELSIF tonRobotReleaseTimeout.Q THEN
			Command.stRobot.xStop := stRobotStatus.xBusy;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_TIMEOUT_ROBOT_RELEASE;
			eState := E_MACHINE_STATE.ERROR;
    	END_IF;
		
	E_MACHINE_STATE.DOOR_OPEN:
		xServiceDoorOpenDemand := TRUE;

    	IF stMachineStatus.xDoorOpen
		AND NOT stMachineStatus.xAlarm THEN
			xServiceDoorOpenDemand := FALSE;
        	eState := E_MACHINE_STATE.NEXT;
		ELSIF stMachineStatus.xAlarm THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_DOOR_OPEN;
			eState := E_MACHINE_STATE.ERROR;
		ELSIF tonDoorOpenTimeout.Q THEN
			xServiceDoorOpenDemand := FALSE;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_TIMEOUT_DOOR_OPEN;
			eState := E_MACHINE_STATE.ERROR;
    	END_IF;
	
	E_MACHINE_STATE.DOOR_CLOSE: 
		// После сервисной операции безопасность подтверждает защёлка xRobotDone:
		// рецепт уже довёл робот до ABOVE и освободил его для следующего маршрута.
		// Общий xBusy больше не блокирует дверь: робот может двигаться к другому узлу.
		IF xRobotInsideMachine
		OR (NOT xOperatorClosingDoor AND NOT xRobotDone) THEN
			Command.stRobot.xStop := xRobotInsideMachine AND stRobotStatus.xBusy;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_DOOR_ROBOT;
			eState := E_MACHINE_STATE.ERROR;
		ELSE
			xServiceDoorCloseDemand := TRUE;
		END_IF;

    	IF stMachineStatus.xDoorClosed
		AND NOT stMachineStatus.xAlarm THEN
			xServiceDoorCloseDemand := FALSE;
			IF NOT xOperatorClosingDoor THEN
        		eState := E_MACHINE_STATE.NEXT;
			ELSIF xOperatorClosingDoor THEN
				eState := E_MACHINE_STATE.OPERATOR_CHOICE_RUN;
				xOperatorClosingDoor := FALSE;
			END_IF;
		ELSIF stMachineStatus.xAlarm THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_DOOR_CLOSE;
			eState := E_MACHINE_STATE.ERROR;
		ELSIF (eState = E_MACHINE_STATE.DOOR_CLOSE)
		AND tonDoorCloseTimeout.Q THEN
			xServiceDoorCloseDemand := FALSE;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_TIMEOUT_DOOR_CLOSE;
			eState := E_MACHINE_STATE.ERROR;
    	END_IF;
		
	E_MACHINE_STATE.CHUCK_OPEN: 
		Command.stIo.xUnclampChuck := TRUE;

    	IF stMachineStatus.xChuckUnclamped 
		AND NOT stMachineStatus.xAlarm THEN
			Command.stIo.xUnclampChuck := FALSE;
			ePartType := E_PART_TYPE.UNKNOWN;
       		eState := E_MACHINE_STATE.NEXT;
		ELSIF stMachineStatus.xAlarm THEN
			Command.stIo.xUnclampChuck := FALSE;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_CHUCK_OPEN;
			eState := E_MACHINE_STATE.ERROR;
		ELSIF tonChuckOpenTimeout.Q THEN
			Command.stIo.xUnclampChuck := FALSE;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_TIMEOUT_CHUCK_OPEN;
			eState := E_MACHINE_STATE.ERROR;
    	END_IF;
		
	
	E_MACHINE_STATE.CHUCK_CLOSE: 
		Command.stIo.xClampChuck := TRUE;

    	IF stMachineStatus.xChuckClamped 
		AND NOT stMachineStatus.xAlarm THEN
			Command.stIo.xClampChuck := FALSE;
			ePartType := E_PART_TYPE.PART;
       		eState := E_MACHINE_STATE.NEXT;
		ELSIF stMachineStatus.xAlarm THEN
			Command.stIo.xClampChuck := FALSE;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_CHUCK_CLOSE;
			eState := E_MACHINE_STATE.ERROR;
		ELSIF tonChuckCloseTimeout.Q THEN
			Command.stIo.xClampChuck := FALSE;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_TIMEOUT_CHUCK_CLOSE;
			eState := E_MACHINE_STATE.ERROR;
    	END_IF;
		
	E_MACHINE_STATE.CYCLE_START:
		IF stMachineStatus.xChuckClamped
    	AND stMachineStatus.xDoorClosed THEN
			Command.stIo.xStartCycle := TRUE;
			xAutoCycleCommanded := TRUE;
		END_IF;
		
        IF stMachineStatus.xCycleActive
		AND NOT stMachineStatus.xAlarm THEN
			Command.stIo.xStartCycle := FALSE;
			IF NOT xOperatorRunningCNC THEN
            	eState := E_MACHINE_STATE.NEXT;
			ELSIF xOperatorRunningCNC THEN
				xOperatorRunningCNC := FALSE;
				eState := E_MACHINE_STATE.IDLE;
			END_IF;
		ELSIF stMachineStatus.xAlarm THEN
			Command.stIo.xStartCycle := FALSE;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_CYCLE_START;
			eState := E_MACHINE_STATE.ERROR;
		ELSIF tonCycleStartTimeout.Q THEN
			Command.stIo.xStartCycle := FALSE;
			xAutoCycleCommanded := FALSE;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_TIMEOUT_CYCLE_START;
			eState := E_MACHINE_STATE.ERROR;
        END_IF;
	
	E_MACHINE_STATE.DONE:
		CASE eActualOperation OF 
			E_MACHINE_OPERATION.CHANGE, E_MACHINE_OPERATION.LOAD:
				eActualOperation := E_MACHINE_OPERATION.NONE;
				ePartState := E_PART_STATE.LOADED;						
			E_MACHINE_OPERATION.UNLOAD:
				eActualOperation := E_MACHINE_OPERATION.NONE;
				ePartState := E_PART_STATE.EMPTY;
		END_CASE
		
		IF NOT xExecute THEN
			xRobotDone := FALSE;	
			eState := E_MACHINE_STATE.IDLE;
		END_IF
		
    E_MACHINE_STATE.ERROR:
		uiIndex := 0;
		eActualOperation := E_MACHINE_OPERATION.NONE;
		eGrantedOperation := E_MACHINE_OPERATION.NONE;
		IF NOT stMachineStatus.xCycleActive THEN
			xAutoCycleCommanded := FALSE;
		END_IF;

		IF (xReset OR xResetGlobal)
		AND NOT xGlobalError
		AND NOT xExecute
		AND NOT stMachineStatus.xAlarm
		AND xSafetyDoorSafe
		AND xRobotResetDependencyReady THEN
			Error.dwErrorLast := Error.dwErrorActive;
			Error.dwErrorActive := DWORD#0;
        	eState := E_MACHINE_STATE.DISABLED;
    	END_IF;
END_CASE;

// Причина остаётся в своём CASE, а единая реакция рассчитывается один раз.
// Контекст защёлкивается до сброса, поэтому смена состояния робота его не теряет.
IF (eState = E_MACHINE_STATE.ERROR) AND NOT xFaultContextCaptured THEN
	xRobotInsideAtFault := xRobotInsideMachine;
	xFaultContextCaptured := TRUE;
ELSIF eState <> E_MACHINE_STATE.ERROR THEN
	xRobotInsideAtFault := FALSE;
	xFaultContextCaptured := FALSE;
END_IF;

xRobotStopRequired := NOT xGlobalError
	AND (((Error.dwErrorActive AND MASK_ALWAYS_ROBOT_STOP) <> DWORD#0)
	OR (((Error.dwErrorActive AND MASK_EQUIPMENT_ERROR) <> DWORD#0)
		AND xRobotInsideAtFault));

// Stop нужен только выполняемому действию. Стоящий в станке робот получает
// зависимую ошибку через FB_ROBOT, но бессмысленная команда Stop не выдаётся.
IF (eState = E_MACHINE_STATE.ERROR)
AND xRobotStopRequired
AND stRobotStatus.xBusy THEN
	Command.stRobot.xStop := TRUE;
END_IF;

IF (eState <> E_MACHINE_STATE.ERROR)
AND NOT xGlobalError THEN
    IF xServiceDoorCloseDemand 
	AND NOT (xAutoDoorOpenLatched OR xServiceDoorOpenDemand)
	AND NOT xRobotInsideMachine
	AND (xOperatorClosingDoor OR xRobotDone)
	AND NOT stMachineStatus.xAlarm THEN
        Command.stIo.xCloseDoor := TRUE;

    ELSIF (xAutoDoorOpenLatched OR xServiceDoorOpenDemand)
	AND NOT xServiceDoorCloseDemand
    AND NOT stMachineStatus.xCycleActive
    AND NOT stMachineStatus.xAlarm THEN
        Command.stIo.xOpenDoor := TRUE;
    END_IF;
END_IF;

Status.xCanAcceptService := (eState = E_MACHINE_STATE.IDLE)
			AND ePartState <> E_PART_STATE.UNKNOWN
			AND NOT stMachineStatus.xAlarm
			AND NOT stMachineStatus.xCycleActive
			AND xSafetyDoorSafe
			AND NOT xGlobalError;

// В состоянии ERROR станок уже остановлен и не считается включённым.
// Это позволяет HMI показать команду «Включить станок», но оставить её
// недоступной до устранения причины и сброса ошибки.
Status.xEnabled := (eState <> E_MACHINE_STATE.DISABLED)
	AND (eState <> E_MACHINE_STATE.ERROR);
Status.xDisablePending := xDisableRequest AND Status.xEnabled;
Status.xPowerAllowed := (eState <> E_MACHINE_STATE.ERROR)
	AND (xDisableRequest
		OR (eState <> E_MACHINE_STATE.DISABLED)
		OR ((eState = E_MACHINE_STATE.DISABLED)
			AND NOT stMachineStatus.xAlarm
			AND NOT stMachineStatus.xCycleActive
			AND xSafetyDoorSafe
			AND (ePartState <> E_PART_STATE.UNKNOWN)));
Status.xResetAllowed := (eState = E_MACHINE_STATE.ERROR)
	AND (Error.dwErrorActive <> DWORD#0)
	AND NOT stMachineStatus.xAlarm
	AND xSafetyDoorSafe
	AND NOT xGlobalError
	AND NOT xExecute
	AND xRobotResetDependencyReady;
Status.xManualControlAllowed := xManualControlAllowed;
Status.xManualSafetyDoorOpenAllowed := xManualSafetyDoorOpenAllowed;
Status.xManualSafetyDoorCloseAllowed := xManualSafetyDoorCloseAllowed;
Status.xManualHatchOpenAllowed := xManualHatchOpenAllowed;
Status.xManualHatchCloseAllowed := xManualHatchCloseAllowed;
Status.xManualChuckOpenAllowed := xManualChuckOpenAllowed;
Status.xManualChuckCloseAllowed := xManualChuckCloseAllowed;
Status.xProcessing := stMachineStatus.xCycleActive;
Status.xPartReady := stMachineStatus.xCycleDone;
Status.xServiceRequired := (eGrantedOperation <> E_MACHINE_OPERATION.NONE)
	AND (eState = E_MACHINE_STATE.IDLE);
Status.xRobotReleased := xRobotDone;
Status.xDone := (eState = E_MACHINE_STATE.DONE);
Status.xBusy :=  (eState <> E_MACHINE_STATE.IDLE)
				AND (eState <> E_MACHINE_STATE.DISABLED)
				AND (eState <> E_MACHINE_STATE.ERROR)
				AND (eState <> E_MACHINE_STATE.DONE)
				AND (eState <> E_MACHINE_STATE.OPERATOR_CHOICE_PART)
				AND (eState <> E_MACHINE_STATE.OPERATOR_CHOICE_RUN)
				AND (eState <> E_MACHINE_STATE.OPERATOR_CHOICE_DOOR)
				AND NOT ((eState = E_MACHINE_STATE.CYCLE_START) AND xOperatorRunningCNC)
				AND NOT ((eState = E_MACHINE_STATE.DOOR_CLOSE) AND xOperatorClosingDoor);
Status.xError := (eState = E_MACHINE_STATE.ERROR);
Status.xCriticalError := xRobotStopRequired;
Status.xAlarmError    := (Error.dwErrorActive AND MASK_EQUIPMENT_ERROR) <> DWORD#0;
Status.xExternalError := (Error.dwErrorActive AND MASK_EXTERNAL_ERROR) <> DWORD#0;
Status.xServiceRejected := (Error.dwErrorActive
	AND (ERR_DOOR_OPEN OR ERR_TIMEOUT_DOOR_OPEN)) <> DWORD#0
	AND ((Error.dwErrorActive
		AND NOT (ERR_DOOR_OPEN OR ERR_TIMEOUT_DOOR_OPEN)) = DWORD#0);
Error.dwAlarmActive := Error.dwErrorActive;
Status.xDoorOpen := stMachineStatus.xDoorOpen;
Status.xAlarm := stMachineStatus.xAlarm;
Status.eRecommendedOperation := eGrantedOperation;
Status.ePartState := ePartState;
Status.ePartType := ePartType;
Status.eAbovePoint := stPoints.eAbove;
Status.tCycleExpected := tExpectedCycle;
Status.tCycleElapsed := tonCycleMeasure.ET;
Status.tMeasuredCycle := tMeasuredCycle;
Status.xCycleTimeValid := tExpectedCycle > T#0S;
Status.xMeasuredTimeValid := xMeasuredTimeValid;
Status.xCycleOvertime := FALSE;
Status.tRemaining := T#0S;

IF stMachineStatus.xCycleActive
AND Status.xCycleTimeValid THEN
	IF Status.tCycleElapsed < Status.tCycleExpected THEN
		Status.tRemaining := Status.tCycleExpected - Status.tCycleElapsed;
	ELSE
		Status.xCycleOvertime := TRUE;
	END_IF;
END_IF;

Diag.eState := eState;
Diag.eGrantedOperation := eGrantedOperation;
Diag.eActualOperation := eActualOperation;

IF Error.dwErrorActive <> DWORD#0 THEN
	Error.dwErrorLast := Error.dwErrorActive;
END_IF;

Error.stErrorActive := UpdateErrorView(dwError := Error.dwErrorActive);
Error.stErrorLast := UpdateErrorView(dwError := Error.dwErrorLast);
