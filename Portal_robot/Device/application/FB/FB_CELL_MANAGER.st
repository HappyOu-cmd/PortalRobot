FUNCTION_BLOCK FB_CELL_MANAGER
VAR_INPUT
	xStart            : BOOL; // Импульс запуска цикла или отмены ожидающей остановки
	xStop             : BOOL; // Импульс остановки автоматического цикла
	xResetRequest     : BOOL; // Необработанный запрос общего сброса от HMI
	xReset            : BOOL; // Необработанный общий сброс всех функциональных блоков
	xManual           : BOOL; // Ручной режим ячейки
	xGlobalError      : BOOL; // Глобальная ошибка ячейки
	xDrivesReady      : BOOL; // Приводы и группа осей готовы к движению
	xMotionBusy       : BOOL; // Оси или группа ещё выполняют команду
	stRobotStatus     : ST_ROBOT_STATUS; // Состояние робота
	stMagazineStatus  : ST_MAGAZINE_STATUS; // Состояние магазина
	astMachineStatus  : ARRAY [1..3] OF ST_MACHINE_PUBLIC; // Состояния станков
	astMachineDiag    : ARRAY [1..3] OF ST_MACHINE_DIAG; // Состояния автоматов станков
	FaultRequest      : ST_CELL_FAULT_REQUEST; // Единый контракт диагностической инъекции
END_VAR
VAR_OUTPUT
	Command : ST_CELL_COMMAND; // Команды оборудованию ячейки
	Status  : ST_CELL_STATUS; // Рабочие статусы ячейки
	Diag    : ST_CELL_DIAG; // Состояние автомата ячейки
	Error   : ST_CELL_ERRORS; // Активные и последние ошибки
	FaultStatus : ST_FAULT_INJECTION_STATUS; // Состояние инжектора для HMI
END_VAR
VAR
	xAnyMachineBusy   : BOOL; // Хотя бы один станок выполняет обслуживание
	xResetRequired    : BOOL; // Есть собственная активная ошибка менеджера ячейки
	xCellStopped      : BOOL; // Все механизмы ячейки остановлены для общего сброса
	rtStart            : R_TRIG; // Фронт запуска автоматического цикла
	rtStop             : R_TRIG; // Фронт остановки автоматического цикла
	rtReset            : R_TRIG; // Фронт общего сброса ошибок ячейки
	xRunning           : BOOL; // Защёлка запущенного автоматического цикла
	xStopRequested     : BOOL; // Запрос остановки после безопасного шага
	uiSelectedMachine  : UINT; // Номер выбранного станка
	uiCandidateMachine : UINT; // Лучший станок по текущему приоритету выбора
	uiMachine          : UINT; // Индекс станка в циклах
	uiReadyMachines    : UINT; // Количество станков, готовых к работе ячейки
	eMagazineOperation : E_MAGAZINE_OPERATION; // Операция магазина текущего шага
	xRobotReady        : BOOL; // Робот готов принять команду
	xMagazineReady     : BOOL; // Магазин готов принять команду
	xReadyToStart      : BOOL; // Выполнены все условия запуска автоматического цикла
	xStartAllowed      : BOOL; // Текущая команда кнопки запуска разрешена
	xStopAllowed       : BOOL; // Команда остановки разрешена
	xResetAllowed      : BOOL; // Общий сброс применим к активной ошибке
	xRobotResetDependencyReady : BOOL; // Каскадная ошибка робота может быть сброшена тем же импульсом
	xReselectAfterRobotRelease : BOOL; // После завершения старого движения требуется заново выбрать станок
	xMachineServiceStarted : BOOL; // Выбранный станок уже принял команду обслуживания
	fbFaultInjector : FB_CELL_FAULT_INJECTOR; // Безопасная проверка логической согласованности
	xFaultAllowed   : BOOL; // Ячейка полностью остановлена для теста
END_VAR
VAR CONSTANT
	FIRST_MACHINE     : UINT := UINT#1; // Первый индекс массива станков
	LAST_MACHINE      : UINT := UINT#3; // Последний индекс массива станков
	MACHINE_SWITCH_DEADBAND : TIME := T#1S; // Минимальный выигрыш времени для смены ожидаемого станка
	ERR_BOTH_GRIPPERS : DWORD := DWORD#16#0000_0001; // Одновременно заняты оба захвата
	ERR_ROBOT         : DWORD := DWORD#16#0000_0002; // Ошибка робота
	ERR_MAGAZINE      : DWORD := DWORD#16#0000_0004; // Ошибка магазина
	ERR_MACHINE       : DWORD := DWORD#16#0000_0008; // Ошибка станка во время обслуживания
	ERR_GLOBAL_STOP   : DWORD := DWORD#16#0000_0010; // Глобальная ошибка ячейки
	WRN_RESET_GLOBAL_ERROR  : UINT := 1; // Сброс отклонён из-за глобальной ошибки
	WRN_START_NOT_READY     : UINT := 4; // Запуск или отмена остановки сейчас недоступны
	WRN_STOP_NOT_RUNNING    : UINT := 5; // Автоматический цикл не выполняется
	WRN_RESET_CELL_ACTIVE   : UINT := 7; // Общий сброс отклонён до полной остановки ячейки
	WRN_SIM_ERROR_NOT_ALLOWED : UINT := 8; // Тестовая ошибка запрещена текущим состоянием
END_VAR

// --- BEGIN IMPLEMENTATION ---

rtStart(CLK := xStart);
rtStop(CLK := xStop);
rtReset(CLK := xResetRequest);

// Команды по умолчанию снимаются после каждого шага.
Command.stRobot.xExecute := FALSE;
Command.stRobot.xStop := FALSE;
Command.stRobot.xReset := xReset;
Command.stRobot.eAction := E_ROBOT_ACTION.NONE;
Command.stRobot.eSetPoint := E_POINT_NAME.NONE;
Command.stRobot.iTakeSlot := 0;
Command.stRobot.iPutSlot := 0;

Command.stMagazine.xEnable := FALSE;
Command.stMagazine.xDisable := FALSE;
Command.stMagazine.xExecute := FALSE;
Command.stMagazine.xStop := FALSE;

FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
	Command.axMachineExecute[uiMachine] := FALSE;
END_FOR;

// Готовность запуска формируется в одном месте и передаётся в HMI.
uiReadyMachines := 0;
xAnyMachineBusy := FALSE;

FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO
	IF astMachineStatus[uiMachine].xBusy THEN
		xAnyMachineBusy := TRUE;
	END_IF;

	IF astMachineStatus[uiMachine].xEnabled
	AND NOT astMachineStatus[uiMachine].xError
	AND (astMachineDiag[uiMachine].eState = E_MACHINE_STATE.IDLE) THEN
		uiReadyMachines := uiReadyMachines + 1;
	END_IF;
END_FOR;

xRobotReady := NOT stRobotStatus.xBusy
	AND NOT stRobotStatus.xError
	AND NOT (stRobotStatus.xBlankAvailable AND stRobotStatus.xDetailAvailable);

xMagazineReady := stMagazineStatus.xEnabled
	AND stMagazineStatus.xReady
	AND stMagazineStatus.xCanEnable
	AND NOT stMagazineStatus.xBusy
	AND NOT stMagazineStatus.xError
	AND NOT stMagazineStatus.xDisablePending
	AND NOT stMagazineStatus.xFinished;

xReadyToStart := (Diag.eState = E_CELL_STATE.IDLE)
	AND NOT xRunning
	AND NOT xManual
	AND NOT xGlobalError
	AND (Error.dwErrorActive = DWORD#0)
	AND xDrivesReady
	AND xRobotReady
	AND xMagazineReady
	AND (uiReadyMachines > 0);

// xAllowed используется HMI только для оформления кнопок. Команда всё равно
// поступает в PLC и повторно проверяется автоматом.
xStartAllowed := xReadyToStart
	OR (xRunning AND xStopRequested AND NOT xManual);
xStopAllowed := xRunning AND NOT xStopRequested;
xResetRequired := Error.dwErrorActive <> DWORD#0;

xCellStopped := NOT xRunning
	AND NOT stRobotStatus.xBusy
	AND NOT stMagazineStatus.xBusy
	AND NOT xAnyMachineBusy
	AND NOT xMotionBusy;

xRobotResetDependencyReady := NOT stRobotStatus.xError
	OR stRobotStatus.xResetAllowed;

xResetAllowed := xResetRequired
	AND xCellStopped
	AND NOT xGlobalError
	AND xRobotResetDependencyReady;

xFaultAllowed := (Diag.eState = E_CELL_STATE.IDLE)
	AND xCellStopped
	AND NOT xGlobalError
	AND (Error.dwErrorActive = DWORD#0);

fbFaultInjector(
	Request := FaultRequest,
	xOwnerAllowed := xFaultAllowed
);
FaultStatus := fbFaultInjector.Status;

IF fbFaultInjector.Status.xRejected THEN
	Diag.stWarning.uiCode := WRN_SIM_ERROR_NOT_ALLOWED;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

IF rtStart.Q
AND NOT xStartAllowed THEN
	Diag.stWarning.uiCode := WRN_START_NOT_READY;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

IF rtStop.Q
AND NOT xStopAllowed THEN
	Diag.stWarning.uiCode := WRN_STOP_NOT_RUNNING;
	Diag.stWarning.udiSequence := Diag.stWarning.udiSequence + UDINT#1;
	IF Diag.stWarning.udiSequence = UDINT#0 THEN
		Diag.stWarning.udiSequence := UDINT#1;
	END_IF;
END_IF;

IF rtReset.Q
AND (Diag.eState = E_CELL_STATE.ERROR) THEN
	IF xGlobalError THEN
		Diag.stWarning.uiCode := WRN_RESET_GLOBAL_ERROR;
	ELSIF NOT xCellStopped THEN
		Diag.stWarning.uiCode := WRN_RESET_CELL_ACTIVE;
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

// В запущенном цикле повторная команда запуска отменяет ожидающую остановку.
// Ручной режим и новая команда остановки имеют приоритет над отменой.
IF rtStop.Q OR xManual THEN
	xStopRequested := TRUE;
ELSIF rtStart.Q AND xRunning THEN
	xStopRequested := FALSE;
END_IF;

// В состояниях ожидания автомат можно остановить сразу.
IF xStopRequested
AND ((Diag.eState = E_CELL_STATE.ROUTE_PAYLOAD)
	OR (Diag.eState = E_CELL_STATE.SELECT_MACHINE)
	OR (Diag.eState = E_CELL_STATE.WAIT_MACHINE)
	OR (Diag.eState = E_CELL_STATE.WAIT_MAGAZINE)) THEN
	xRunning := FALSE;
	uiSelectedMachine := 0;
	eMagazineOperation := E_MAGAZINE_OPERATION.NONE;
	Diag.eState := E_CELL_STATE.IDLE;
END_IF;

// Любая авария робота останавливает ячейку и формирует отдельную каскадную
// аварию линии независимо от текущего шага автоматического цикла.
IF stRobotStatus.xError THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
	IF Diag.eState <> E_CELL_STATE.ERROR THEN
		Diag.eState := E_CELL_STATE.ERROR;
	END_IF;
END_IF;

IF xGlobalError
AND (Diag.eState <> E_CELL_STATE.IDLE)
AND (Diag.eState <> E_CELL_STATE.ERROR) THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_GLOBAL_STOP;
	Diag.eState := E_CELL_STATE.ERROR;
END_IF;

CASE Diag.eState OF
	E_CELL_STATE.IDLE:
		xRunning := FALSE;
		xStopRequested := FALSE;
		xReselectAfterRobotRelease := FALSE;
		xMachineServiceStarted := FALSE;
		uiSelectedMachine := 0;
		eMagazineOperation := E_MAGAZINE_OPERATION.NONE;

		IF fbFaultInjector.xBothGrippers THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_BOTH_GRIPPERS;
			Diag.eState := E_CELL_STATE.ERROR;
		ELSIF rtStart.Q
		AND xReadyToStart THEN
			xRunning := TRUE;
			Diag.eState := E_CELL_STATE.ROUTE_PAYLOAD;
		END_IF;

	E_CELL_STATE.ROUTE_PAYLOAD:
		xReselectAfterRobotRelease := FALSE;
		xMachineServiceStarted := FALSE;
		uiSelectedMachine := 0;
		eMagazineOperation := E_MAGAZINE_OPERATION.NONE;

		IF stRobotStatus.xError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
			Diag.eState := E_CELL_STATE.ERROR;

		ELSIF stRobotStatus.xBlankAvailable
		AND stRobotStatus.xDetailAvailable THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_BOTH_GRIPPERS;
			Diag.eState := E_CELL_STATE.ERROR;

		ELSIF stRobotStatus.xBlankAvailable THEN
			Diag.eState := E_CELL_STATE.SELECT_MACHINE;

		ELSIF stRobotStatus.xDetailAvailable THEN
			IF stMagazineStatus.xError THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_MAGAZINE;
				Diag.eState := E_CELL_STATE.ERROR;
			ELSIF NOT stMagazineStatus.xEnabled THEN
				Diag.eState := E_CELL_STATE.WAIT_MAGAZINE;
			ELSIF stMagazineStatus.xCanChange THEN
				eMagazineOperation := E_MAGAZINE_OPERATION.CHANGE;
				Diag.eState := E_CELL_STATE.MAGAZINE;
			ELSIF stMagazineStatus.xCanPut THEN
				eMagazineOperation := E_MAGAZINE_OPERATION.PUT;
				Diag.eState := E_CELL_STATE.MAGAZINE;
			ELSE
				Diag.eState := E_CELL_STATE.WAIT_MAGAZINE;
			END_IF;

		ELSE
			IF stMagazineStatus.xError THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_MAGAZINE;
				Diag.eState := E_CELL_STATE.ERROR;
			ELSIF NOT stMagazineStatus.xEnabled THEN
				Diag.eState := E_CELL_STATE.WAIT_MAGAZINE;
			ELSIF stMagazineStatus.xCanTake THEN
				eMagazineOperation := E_MAGAZINE_OPERATION.TAKE;
				Diag.eState := E_CELL_STATE.MAGAZINE;
			ELSE
				Diag.eState := E_CELL_STATE.WAIT_MAGAZINE;
			END_IF;
		END_IF;

	E_CELL_STATE.SELECT_MACHINE:
		// Один метод задаёт одинаковый приоритет для первичного и повторного выбора.
		uiSelectedMachine := SelectMachine(uiCurrentMachine := UINT#0);

		IF uiSelectedMachine > UINT#0 THEN
			Diag.eState := E_CELL_STATE.MOVE_TO_MACHINE;
		END_IF;

	E_CELL_STATE.MOVE_TO_MACHINE:
		IF xStopRequested
		AND NOT stRobotStatus.xBusy THEN
			xRunning := FALSE;
			Diag.eState := E_CELL_STATE.IDLE;
		ELSIF (uiSelectedMachine < FIRST_MACHINE)
		OR (uiSelectedMachine > LAST_MACHINE) THEN
			// FB_ROBOT фиксирует точку при запуске движения. Сначала снимаем
			// старую команду, и только после её полного освобождения выбираем новую.
			xReselectAfterRobotRelease := TRUE;
			Diag.eState := E_CELL_STATE.RELEASE_ROBOT_COMMAND;
		ELSIF NOT astMachineStatus[uiSelectedMachine].xEnabled
		OR astMachineStatus[uiSelectedMachine].xDisablePending
		OR astMachineStatus[uiSelectedMachine].xError THEN
			xReselectAfterRobotRelease := TRUE;
			Diag.eState := E_CELL_STATE.RELEASE_ROBOT_COMMAND;

		ELSIF stRobotStatus.eCurrentPoint = astMachineStatus[uiSelectedMachine].eAbovePoint THEN
			// После прибытия решение всегда повторно подтверждается в WAIT_MACHINE.
			Diag.eState := E_CELL_STATE.WAIT_MACHINE;

		ELSE
			Command.stRobot.xExecute := TRUE;
			Command.stRobot.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
			Command.stRobot.eSetPoint := astMachineStatus[uiSelectedMachine].eAbovePoint;

			IF stRobotStatus.xError THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
				Diag.eState := E_CELL_STATE.ERROR;
			ELSIF stRobotStatus.xDone THEN
				xReselectAfterRobotRelease := FALSE;
				Diag.eState := E_CELL_STATE.RELEASE_ROBOT_COMMAND;
			END_IF;
		END_IF;

	E_CELL_STATE.RELEASE_ROBOT_COMMAND:
		IF stRobotStatus.xError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
			Diag.eState := E_CELL_STATE.ERROR;
		ELSIF NOT stRobotStatus.xBusy
		AND NOT stRobotStatus.xDone THEN
			IF xStopRequested THEN
				xRunning := FALSE;
				Diag.eState := E_CELL_STATE.IDLE;
			ELSIF xReselectAfterRobotRelease THEN
				xReselectAfterRobotRelease := FALSE;
				uiSelectedMachine := UINT#0;
				Diag.eState := E_CELL_STATE.SELECT_MACHINE;
			ELSIF (uiSelectedMachine < FIRST_MACHINE)
			OR (uiSelectedMachine > LAST_MACHINE) THEN
				uiSelectedMachine := UINT#0;
				Diag.eState := E_CELL_STATE.SELECT_MACHINE;
			ELSIF NOT astMachineStatus[uiSelectedMachine].xEnabled
			OR astMachineStatus[uiSelectedMachine].xDisablePending
			OR astMachineStatus[uiSelectedMachine].xError THEN
				uiSelectedMachine := UINT#0;
				Diag.eState := E_CELL_STATE.SELECT_MACHINE;
			ELSIF stRobotStatus.eCurrentPoint
			<> astMachineStatus[uiSelectedMachine].eAbovePoint THEN
				Diag.eState := E_CELL_STATE.MOVE_TO_MACHINE;
			ELSE
				// Даже после штатного завершения движения сначала повторяем выбор.
				Diag.eState := E_CELL_STATE.WAIT_MACHINE;
			END_IF;
		END_IF;

	E_CELL_STATE.WAIT_MACHINE:
		// В ожидании заново оценивается вся группа: готовый станок имеет приоритет,
		// иначе выбирается минимальное известное оставшееся время.
		uiCandidateMachine := SelectMachine(uiCurrentMachine := uiSelectedMachine);

		IF uiCandidateMachine = UINT#0 THEN
			uiSelectedMachine := UINT#0;
			Diag.eState := E_CELL_STATE.SELECT_MACHINE;
		ELSIF uiCandidateMachine <> uiSelectedMachine THEN
			uiSelectedMachine := uiCandidateMachine;
			Diag.eState := E_CELL_STATE.MOVE_TO_MACHINE;
		ELSIF stRobotStatus.eCurrentPoint
		<> astMachineStatus[uiSelectedMachine].eAbovePoint THEN
			// Номер цели мог измениться, пока FB_ROBOT завершал старое движение.
			// Ожидать разрешено только непосредственно над выбранным станком.
			Diag.eState := E_CELL_STATE.MOVE_TO_MACHINE;
		ELSIF astMachineStatus[uiSelectedMachine].xCanAcceptService
		AND astMachineStatus[uiSelectedMachine].xServiceRequired THEN
			xMachineServiceStarted := FALSE;
			Diag.eState := E_CELL_STATE.SERVICE_MACHINE;
		END_IF;

	E_CELL_STATE.SERVICE_MACHINE:
		IF (uiSelectedMachine < FIRST_MACHINE)
		OR (uiSelectedMachine > LAST_MACHINE) THEN
			xMachineServiceStarted := FALSE;
			xReselectAfterRobotRelease := TRUE;
			Diag.eState := E_CELL_STATE.RELEASE_ROBOT_COMMAND;
		ELSE
			IF astMachineStatus[uiSelectedMachine].xBusy THEN
				xMachineServiceStarted := TRUE;
			END_IF;

			// До фактического начала обслуживания станок можно безопасно исключить.
			IF NOT xMachineServiceStarted
			AND (NOT astMachineStatus[uiSelectedMachine].xEnabled
				OR astMachineStatus[uiSelectedMachine].xDisablePending
				OR astMachineStatus[uiSelectedMachine].xError) THEN
				xReselectAfterRobotRelease := TRUE;
				Diag.eState := E_CELL_STATE.RELEASE_ROBOT_COMMAND;
			ELSIF xMachineServiceStarted
			AND NOT astMachineStatus[uiSelectedMachine].xEnabled THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE;
				Diag.eState := E_CELL_STATE.ERROR;
			ELSIF xStopRequested
			AND NOT astMachineStatus[uiSelectedMachine].xBusy THEN
				xRunning := FALSE;
				Diag.eState := E_CELL_STATE.IDLE;
			ELSE
				Command.axMachineExecute[uiSelectedMachine] := TRUE;
			END_IF;
		END_IF;

		IF Diag.eState = E_CELL_STATE.SERVICE_MACHINE THEN
			IF astMachineStatus[uiSelectedMachine].xServiceRejected THEN
				Command.axMachineExecute[uiSelectedMachine] := FALSE;
				xMachineServiceStarted := FALSE;
				xReselectAfterRobotRelease := FALSE;
				uiSelectedMachine := UINT#0;
				Diag.eState := E_CELL_STATE.SELECT_MACHINE;
			ELSIF astMachineStatus[uiSelectedMachine].xError THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_MACHINE;
				Diag.eState := E_CELL_STATE.ERROR;
			ELSIF stRobotStatus.xError THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
				Diag.eState := E_CELL_STATE.ERROR;
			ELSIF astMachineStatus[uiSelectedMachine].xRobotReleased THEN
				IF xStopRequested THEN
					xRunning := FALSE;
					Diag.eState := E_CELL_STATE.IDLE;
				ELSE
					Diag.eState := E_CELL_STATE.ROUTE_PAYLOAD;
				END_IF;
			END_IF;
		END_IF;

	E_CELL_STATE.MAGAZINE:
		IF xStopRequested
		AND NOT stMagazineStatus.xBusy THEN
			xRunning := FALSE;
			Diag.eState := E_CELL_STATE.IDLE;
		ELSE
			Command.stMagazine.xExecute := TRUE;
		END_IF;

		IF Diag.eState = E_CELL_STATE.MAGAZINE THEN
			IF stMagazineStatus.xError THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_MAGAZINE;
				Diag.eState := E_CELL_STATE.ERROR;
			ELSIF stRobotStatus.xError THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
				Diag.eState := E_CELL_STATE.ERROR;
			ELSIF stMagazineStatus.xDone THEN
				Diag.eState := E_CELL_STATE.RELEASE_MAGAZINE;
			END_IF;
		END_IF;

	E_CELL_STATE.RELEASE_MAGAZINE:
		IF stMagazineStatus.xError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_MAGAZINE;
			Diag.eState := E_CELL_STATE.ERROR;
		ELSIF NOT stMagazineStatus.xBusy
		AND NOT stMagazineStatus.xDone THEN
			eMagazineOperation := E_MAGAZINE_OPERATION.NONE;
			IF xStopRequested THEN
				xRunning := FALSE;
				Diag.eState := E_CELL_STATE.IDLE;
			ELSE
				Diag.eState := E_CELL_STATE.ROUTE_PAYLOAD;
			END_IF;
		END_IF;

	E_CELL_STATE.WAIT_MAGAZINE:
		IF stMagazineStatus.xError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_MAGAZINE;
			Diag.eState := E_CELL_STATE.ERROR;
		ELSIF stMagazineStatus.xEnabled
		AND stRobotStatus.xDetailAvailable
		AND (stMagazineStatus.xCanChange OR stMagazineStatus.xCanPut) THEN
			Diag.eState := E_CELL_STATE.ROUTE_PAYLOAD;
		ELSIF stMagazineStatus.xEnabled
		AND NOT stRobotStatus.xBlankAvailable
		AND NOT stRobotStatus.xDetailAvailable
		AND stMagazineStatus.xCanTake THEN
			Diag.eState := E_CELL_STATE.ROUTE_PAYLOAD;
		END_IF;

	E_CELL_STATE.ERROR:
		xRunning := FALSE;
		xReselectAfterRobotRelease := FALSE;
		xMachineServiceStarted := FALSE;
		IF stRobotStatus.xBusy THEN
			Command.stRobot.xStop := TRUE;
		END_IF;
		IF stMagazineStatus.xBusy THEN
			Command.stMagazine.xStop := TRUE;
		END_IF;

		IF xReset
		AND xResetAllowed THEN
			Error.dwErrorLast := Error.dwErrorActive;
			Error.dwErrorActive := DWORD#0;
			uiSelectedMachine := 0;
			eMagazineOperation := E_MAGAZINE_OPERATION.NONE;
			Diag.eState := E_CELL_STATE.IDLE;
		END_IF;
END_CASE;

Status.xRunning := xRunning;
Status.xStopPending := xStopRequested AND xRunning;
Status.xBusy := xRunning
	AND (Diag.eState <> E_CELL_STATE.IDLE)
	AND (Diag.eState <> E_CELL_STATE.ERROR);
Status.xWaitingMachine := Diag.eState = E_CELL_STATE.SELECT_MACHINE
	OR Diag.eState = E_CELL_STATE.WAIT_MACHINE;
Status.xWaitingMagazine := Diag.eState = E_CELL_STATE.WAIT_MAGAZINE;
Status.xError := Diag.eState = E_CELL_STATE.ERROR;
Status.xReadyToStart := xReadyToStart;
Status.xStartAllowed := xReadyToStart
	OR (xRunning AND xStopRequested AND NOT xManual);
Status.xStopAllowed := xRunning AND NOT xStopRequested;
Status.xResetAllowed := xResetAllowed;
Status.xManualAllowed := TRUE;
Status.xAutomaticAllowed := TRUE;
Status.xDrivesReady := xDrivesReady;
Status.xRobotReady := xRobotReady;
Status.xMagazineReady := xMagazineReady;
Status.uiReadyMachines := uiReadyMachines;
Status.uiSelectedMachine := uiSelectedMachine;
Status.eMagazineOperation := eMagazineOperation;
Error.dwAlarmActive := Error.dwErrorActive;

IF Error.dwErrorActive <> DWORD#0 THEN
	Error.dwErrorLast := Error.dwErrorActive;
END_IF;

Error.stErrorActive := UpdateErrorView(dwError := Error.dwErrorActive);
Error.stErrorLast := UpdateErrorView(dwError := Error.dwErrorLast);
FaultStatus.xResetAllowed := Status.xResetAllowed AND NOT FaultStatus.xBusy;
