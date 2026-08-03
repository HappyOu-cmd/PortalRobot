FUNCTION_BLOCK FB_MACHINE
VAR_INPUT
    xExecute          : BOOL; // Запуск разрешённой операции обслуживания
    xReset            : BOOL; // Сброс ошибки конкретного станка
    xResetGlobal      : BOOL; // Общий сброс ошибок ячейки
    xGlobalError      : BOOL; // Глобальная ошибка ячейки
    xHmiSetBlank	  : BOOL; // Ручное подтверждение загруженной заготовки
    xHmiSetDetail     : BOOL; // Ручное подтверждение загруженной детали
    xHmiEnable        : BOOL; // Импульс включения станка в работу
    xHmiDisable       : BOOL; // Импульс отключения станка от работы
    xHmiAcceptRunCNC  : BOOL; // Импульс подтверждения запуска цикла обработки на станке
    xHmiRejectRunCNC  : BOOL; // Импульс отклонения запуска цикла обработки на станке
    xHmiAcceptDoor    : BOOL; // Импульс подтверждения оператора закрытии двери
    xHmiRejectDoor    : BOOL; // Импульс отклонения оператора закрытии двери
    xUseHmiCycleTime  : BOOL; // TRUE: использовать время цикла, заданное с HMI
    tHmiCycleTime     : TIME; // Начальная или постоянная оценка времени цикла
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
    tofErrorDoor            : TOF; // Контроль закрытия двери при нахождении робота внутри
    rtExectue               : R_TRIG; // Фронт команды запуска
    rtEnabledMachine        : R_TRIG; // Фронт команды включения
    rtDisabledMachine       : R_TRIG; // Фронт команды отключения
	rtResetMachine          : R_TRIG; // Фронт локального или общего сброса ошибки станка
    rtCycleDone             : R_TRIG; // Фронт завершения цикла станка
    rtCycleStarted          : R_TRIG; // Фронт фактического запуска обработки
    ftCycleStopped          : F_TRIG; // Спад фактического цикла обработки
    rtSetBlankLoaded        : R_TRIG; // Фронт ручного подтверждения заготовки
    rtSetDetailLoaded       : R_TRIG; // Фронт ручного подтверждения детали
    ftChuckClamped          : F_TRIG; // Спад закрытия кулачков
    tonCycleMeasure         : TON; // Измерение длительности автоматического цикла
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
    xRobotDone              : BOOL; // Робот освобождён алгоритмом станка
    xServiceDoorCloseDemand : BOOL; // Внутренний запрос закрытия двери
    xServiceDoorOpenDemand  : BOOL; // Внутренний запрос открытия двери
    xAutoDoorOpenLatched    : BOOL; // Защёлка автоматического открытия двери
    xRobotActionDone        : BOOL; // Запрошенное действие захвата уже выполнено
    xDisableRequest         : BOOL; // Сохранённый запрос отключения после операции или обработки
    eGrantedOperation       : E_MACHINE_OPERATION; // Разрешённая операция обслуживания
    eActualOperation        : E_MACHINE_OPERATION; // Выполняемая операция обслуживания
    stRecipe                : ARRAY [0..40] OF ST_MACHINE_RECIPE; // Активный рецепт операции
END_VAR

VAR CONSTANT
    ERR_WRONG_OPERATION     : DWORD := 1;   	// Приводит к глоабльной ошибке
    ERR_WRONG_COMMAND       : DWORD := 2;   	// Приводит к глобальной ошибке
    ERR_ROBOT_MOTION        : DWORD := 4;   	// Приводит к глобальной ошибке (Другой блок не создаём новую ошибку)
    ERR_ROBOT_ACTION        : DWORD := 8;   	// Приводит к глобальной ошибке (Другой блок не создаём новую ошибку)
    ERR_DOOR_OPEN  			: DWORD := 16;  	// Не приводит к глобальной ошибке, уезжаем в другой станок
    ERR_DOOR_CLOSE 			: DWORD := 32;  	// Не приводит к глобальной ошибке, уезжаем в другой станок
    ERR_CHUCK_OPEN 			: DWORD := 64;  	// Приводит к глобальной ошибке
    ERR_CHUCK_CLOSE 		: DWORD := 128; 	// Приводит к глобальной ошибке
    ERR_CYCLE_START			: DWORD := 256;     // Не приводит к глобальной ошибке
    ERR_SAFETY_STOP         : DWORD := 512;		// Глобальная ошибка из вне (Другой блок не создаём новую ошибку)
    ERR_UNKNOWN_DETAIL      : DWORD := 1024;    // Приводит к глобальной ошибке
    ERR_MACHINE_ALARM       : DWORD := 2048;    // Приводит к глобальной ошибке
    ERR_INDEX               : DWORD := 4096;    // Приводит к глобальной ошибке
    ERR_DOOR_ROBOT          : DWORD := 8192;    // Приводит к глобальной ошибке
    ERR_MACHINE_IDLE        : DWORD := 16384;   // Не приводит к глобальной ошибке

    // Ошибки, требующие формирования глобальной аварии ячейки.
    MASK_CRITICAL_ERROR		: DWORD :=
                                ERR_WRONG_OPERATION OR
                                ERR_WRONG_COMMAND OR
                                ERR_CHUCK_OPEN OR
                                ERR_CHUCK_CLOSE OR
                                ERR_UNKNOWN_DETAIL OR
                                ERR_MACHINE_ALARM OR
                                ERR_INDEX OR
                                ERR_DOOR_ROBOT;

    // Некритические ошибки конкретного станка.
    MASK_ALARM_ERROR		: DWORD :=
                                ERR_DOOR_OPEN OR
                                ERR_DOOR_CLOSE OR
                                ERR_CYCLE_START OR
                                ERR_MACHINE_IDLE;

    // Ошибки, полученные от других блоков или общей логики ячейки.
    MASK_EXTERNAL_ERROR  	: DWORD :=
                                ERR_SAFETY_STOP OR
                                ERR_ROBOT_ACTION OR
                                ERR_ROBOT_MOTION;

    WRN_RESET_ALARM_ACTIVE : UINT := 1; // Сброс отклонён из-за физической аварии станка
    WRN_RESET_GLOBAL_ERROR : UINT := 2; // Сброс отклонён из-за глобальной ошибки
    WRN_RESET_EXECUTE      : UINT := 3; // Сброс отклонён во время операции обслуживания


END_VAR

// --- BEGIN IMPLEMENTATION ---

(*
    1. Добавить таймауты (использовать уже существующие ошибки)
*)

rtEnabledMachine (CLK :=xHmiEnable);
rtDisabledMachine (CLK :=xHmiDisable);
rtResetMachine(CLK := xReset OR xResetGlobal);
rtCycleDone(CLK := stMachineStatus.xCycleDone);
rtCycleStarted(CLK := stMachineStatus.xCycleActive);
ftCycleStopped(CLK := stMachineStatus.xCycleActive);
rtSetBlankLoaded(CLK := xHmiSetBlank);
rtSetDetailLoaded(CLK := xHmiSetDetail);
ftChuckClamped(CLK := stMachineStatus.xChuckClamped);

// Любой сброс формирует одно предупреждение с конкретной причиной отказа.
IF rtResetMachine.Q
AND (eState = E_MACHINE_STATE.ERROR) THEN
    IF stMachineStatus.xAlarm THEN
        Diag.stWarning.uiCode := WRN_RESET_ALARM_ACTIVE;
    ELSIF xGlobalError THEN
        Diag.stWarning.uiCode := WRN_RESET_GLOBAL_ERROR;
    ELSIF xExecute THEN
        Diag.stWarning.uiCode := WRN_RESET_EXECUTE;
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

IF rtDisabledMachine.Q THEN
    xDisableRequest := TRUE;
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
Command.stIo.xClampChuck := FALSE;
Command.stIo.xUnclampChuck := FALSE;
Command.stIo.xStartCycle := FALSE;
Command.stIo.xReset := xReset OR xResetGlobal;

Command.stRobot.xExecute := FALSE;
Command.stRobot.xStop := FALSE;
Command.stRobot.eAction := E_ROBOT_ACTION.NONE;
xServiceDoorOpenDemand := FALSE;
xServiceDoorCloseDemand := FALSE;

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
AND (((eState = E_MACHINE_STATE.IDLE) AND NOT stMachineStatus.xCycleActive)
    OR (eState = E_MACHINE_STATE.OPERATOR_CHOICE_PART)
    OR (eState = E_MACHINE_STATE.OPERATOR_CHOICE_DOOR)
    OR (eState = E_MACHINE_STATE.OPERATOR_CHOICE_RUN)) THEN
    eState := E_MACHINE_STATE.DISABLED;
ELSIF rtEnabledMachine.Q AND eState = E_MACHINE_STATE.DISABLED AND NOT stMachineStatus.xAlarm THEN
    IF ePartState = E_PART_STATE.EMPTY THEN
        eState := E_MACHINE_STATE.IDLE;
    ELSIF ePartState = E_PART_STATE.LOADED THEN
        eState := E_MACHINE_STATE.OPERATOR_CHOICE_PART;
    END_IF;
ELSIF rtEnabledMachine.Q AND eState = E_MACHINE_STATE.DISABLED AND stMachineStatus.xAlarm THEN
    eState := E_MACHINE_STATE.ERROR;
END_IF;

IF xGlobalError
AND Status.xBusy THEN
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
//Останавливаем робота, если кто-то попытался закрыть дверь в станке в момент его работы
tofErrorDoor(
            PT:= T#100MS,
            IN:=stMachineStatus.xDoorOpen
);

xRobotInsideMachine := (eState = E_MACHINE_STATE.ROBOT_ACTION)
                        OR (eState = E_MACHINE_STATE.ROBOT_MOVE)
                        OR (eState = E_MACHINE_STATE.RELEASE_ROBOT_ACTION);

IF xRobotInsideMachine AND NOT tofErrorDoor.Q THEN
    Command.stRobot.xStop := TRUE;
    Error.dwErrorActive := Error.dwErrorActive OR ERR_DOOR_ROBOT;
    eState := E_MACHINE_STATE.ERROR;
END_IF

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
            eState := E_MACHINE_STATE.OPERATOR_CHOICE_DOOR;
            ePartType := E_PART_TYPE.PART;
        ELSIF stMachineStatus.xAlarm THEN
            Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE_ALARM;
            eState := E_MACHINE_STATE.ERROR;
        END_IF;

    E_MACHINE_STATE.OPERATOR_CHOICE_DOOR:
        IF stMachineStatus.xDoorClosed
        AND NOT stMachineStatus.xAlarm THEN
            eState := E_MACHINE_STATE.OPERATOR_CHOICE_RUN;
        ELSIF NOT stMachineStatus.xDoorClosed
        AND xHmiAcceptDoor
        AND NOT stMachineStatus.xAlarm THEN
            xOperatorClosingDoor := TRUE;
            eState := E_MACHINE_STATE.DOOR_CLOSE;
        ELSIF NOT stMachineStatus.xDoorClosed
        AND xHmiRejectDoor
        AND NOT stMachineStatus.xAlarm THEN
            eState := E_MACHINE_STATE.DISABLED;
        ELSIF stMachineStatus.xAlarm THEN
            Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE_ALARM;
            eState := E_MACHINE_STATE.ERROR;
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
                eState := E_MACHINE_STATE.ROBOT_MOVE;

            E_MACHINE_STATE.ROBOT_ACTION:
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

        IF stRobotStatus.xError THEN
            Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_MOTION;
            eState := E_MACHINE_STATE.ERROR ;

        ELSIF stMachineStatus.xAlarm THEN
            Command.stRobot.xStop := TRUE;
            Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE_ALARM;
            eState := E_MACHINE_STATE.ERROR ;

        ELSIF stRobotStatus.xDone THEN
            eState := E_MACHINE_STATE.RELEASE_ROBOT_ACTION;

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

        IF (eState = E_MACHINE_STATE.ROBOT_ACTION)
        AND stMachineStatus.xAlarm THEN
            Command.stRobot.xStop := TRUE;
            Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE_ALARM;
            eState := E_MACHINE_STATE.ERROR ;

        ELSIF (eState = E_MACHINE_STATE.ROBOT_ACTION)
        AND stRobotStatus.xError THEN
            Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT_ACTION;
            eState := E_MACHINE_STATE.ERROR ;

        ELSIF (eState = E_MACHINE_STATE.ROBOT_ACTION)
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
        END_IF;

    E_MACHINE_STATE.DOOR_CLOSE:
        xServiceDoorCloseDemand := TRUE;

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
        END_IF;

    E_MACHINE_STATE.CHUCK_OPEN:
        Command.stIo.xUnclampChuck := TRUE;

        IF stMachineStatus.xChuckUnclamped
        AND NOT stMachineStatus.xAlarm  THEN
            Command.stIo.xUnclampChuck := FALSE;
            ePartType := E_PART_TYPE.UNKNOWN;
               eState := E_MACHINE_STATE.NEXT;
        ELSIF stMachineStatus.xAlarm THEN
            Command.stIo.xUnclampChuck := FALSE;
            Error.dwErrorActive := Error.dwErrorActive OR ERR_CHUCK_OPEN;
            eState := E_MACHINE_STATE.ERROR;
        END_IF;


    E_MACHINE_STATE.CHUCK_CLOSE:
        Command.stIo.xClampChuck := TRUE;

        IF stMachineStatus.xChuckClamped
        AND NOT stMachineStatus.xAlarm  THEN
            Command.stIo.xClampChuck := FALSE;
            ePartType := E_PART_TYPE.PART;
               eState := E_MACHINE_STATE.NEXT;
        ELSIF stMachineStatus.xAlarm THEN
            Command.stIo.xClampChuck := FALSE;
            Error.dwErrorActive := Error.dwErrorActive OR ERR_CHUCK_CLOSE;
            eState := E_MACHINE_STATE.ERROR;
        END_IF;

    E_MACHINE_STATE.CYCLE_START:
        IF stMachineStatus.xChuckClamped
        AND stMachineStatus.xDoorClosed THEN
            Command.stIo.xStartCycle := TRUE;
            xAutoCycleCommanded := TRUE;
        END_IF;

        IF stMachineStatus.xCycleActive AND NOT stMachineStatus.xAlarm THEN
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
        AND NOT stMachineStatus.xAlarm THEN
            Error.dwErrorLast := Error.dwErrorActive;
            Error.dwErrorActive := DWORD#0;
            eState := E_MACHINE_STATE.DISABLED;
        END_IF;
END_CASE;

IF (eState <> E_MACHINE_STATE.ERROR)
AND NOT xGlobalError THEN
    IF xServiceDoorCloseDemand
    AND NOT (xAutoDoorOpenLatched OR xServiceDoorOpenDemand)
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
            AND NOT xGlobalError;

Status.xEnabled := eState <> E_MACHINE_STATE.DISABLED;
Status.xDisablePending := xDisableRequest AND Status.xEnabled;
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
Status.xCriticalError := (Error.dwErrorActive AND MASK_CRITICAL_ERROR) <> DWORD#0;
Status.xAlarmError    := (Error.dwErrorActive AND MASK_ALARM_ERROR) <> DWORD#0;
Status.xExternalError := (Error.dwErrorActive AND MASK_EXTERNAL_ERROR) <> DWORD#0;
Error.dwAlarmActive := Error.dwErrorActive AND NOT MASK_EXTERNAL_ERROR;
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
