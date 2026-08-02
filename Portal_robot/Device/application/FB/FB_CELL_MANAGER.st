FUNCTION_BLOCK FB_CELL_MANAGER
VAR_INPUT
	xStart            : BOOL; // Импульс запуска автоматического цикла
	xStop             : BOOL; // Импульс остановки автоматического цикла
	xReset            : BOOL; // Сброс ошибок менеджера ячейки
	xManual           : BOOL; // Ручной режим ячейки
	xGlobalError      : BOOL; // Глобальная ошибка ячейки
	xDrivesReady      : BOOL; // Приводы и группа осей готовы к движению
	stRobotStatus     : ST_ROBOT_STATUS; // Состояние робота
	stMagazineStatus  : ST_MAGAZINE_STATUS; // Состояние магазина
	astMachineStatus  : ARRAY [1..3] OF ST_MACHINE_PUBLIC; // Состояния станков
	astMachineDiag    : ARRAY [1..3] OF ST_MACHINE_DIAG; // Состояния автоматов станков
END_VAR
VAR_OUTPUT
	Command : ST_CELL_COMMAND; // Команды оборудованию ячейки
	Status  : ST_CELL_STATUS; // Рабочие статусы ячейки
	Diag    : ST_CELL_DIAG; // Состояние автомата ячейки
	Error   : ST_CELL_ERRORS; // Активные и последние ошибки
END_VAR
VAR
	rtStart            : R_TRIG; // Фронт запуска автоматического цикла
	rtStop             : R_TRIG; // Фронт остановки автоматического цикла
	rtReset            : R_TRIG; // Фронт общего сброса ошибок ячейки
	xRunning           : BOOL; // Защёлка запущенного автоматического цикла
	xStopRequested     : BOOL; // Запрос остановки после безопасного шага
	xCandidateFound    : BOOL; // Найден подходящий станок
	xTimedCandidate    : BOOL; // Найден станок с оценкой оставшегося времени
	uiSelectedMachine  : UINT; // Номер выбранного станка
	uiLoop             : UINT; // Индекс поиска станка
	uiReadyMachines    : UINT; // Количество станков, готовых к работе ячейки
	tMinimumRemaining  : TIME; // Минимальное оставшееся время
	eMagazineOperation : E_MAGAZINE_OPERATION; // Операция магазина текущего шага
	xRobotReady        : BOOL; // Робот готов принять команду
	xMagazineReady     : BOOL; // Магазин готов принять команду
	xReadyToStart      : BOOL; // Выполнены все условия запуска автоматического цикла
END_VAR
VAR CONSTANT
	ERR_BOTH_GRIPPERS : DWORD := DWORD#16#0000_0001; // Одновременно заняты оба захвата
	ERR_ROBOT         : DWORD := DWORD#16#0000_0002; // Ошибка робота
	ERR_MAGAZINE      : DWORD := DWORD#16#0000_0004; // Ошибка магазина
	ERR_MACHINE       : DWORD := DWORD#16#0000_0008; // Ошибка станка во время обслуживания
	ERR_GLOBAL_STOP   : DWORD := DWORD#16#0000_0010; // Глобальная ошибка ячейки
	WRN_RESET_GLOBAL_ERROR  : UINT := 1; // Сброс отклонён из-за глобальной ошибки
	WRN_RESET_ROBOT_ERROR   : UINT := 2; // Сброс отклонён из-за ошибки робота
	WRN_RESET_MAGAZINE_ERROR: UINT := 3; // Сброс отклонён из-за ошибки магазина
END_VAR

// --- BEGIN IMPLEMENTATION ---

rtStart(CLK := xStart);
rtStop(CLK := xStop);
rtReset(CLK := xReset);

// Менеджер ячейки предупреждает только о причинах отказа общего сброса.
IF rtReset.Q
AND (Diag.eState = E_CELL_STATE.ERROR) THEN
	IF xGlobalError THEN
		Diag.stWarning.uiCode := WRN_RESET_GLOBAL_ERROR;
	ELSIF stRobotStatus.xError THEN
		Diag.stWarning.uiCode := WRN_RESET_ROBOT_ERROR;
	ELSIF stMagazineStatus.xError THEN
		Diag.stWarning.uiCode := WRN_RESET_MAGAZINE_ERROR;
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

IF rtStop.Q OR xManual THEN
	xStopRequested := TRUE;
END_IF;

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

FOR uiLoop := 1 TO 3 DO
	Command.axMachineExecute[uiLoop] := FALSE;
END_FOR;

// Готовность запуска формируется в одном месте и передаётся в HMI.
uiReadyMachines := 0;

FOR uiLoop := 1 TO 3 DO
	IF astMachineStatus[uiLoop].xEnabled
	AND NOT astMachineStatus[uiLoop].xError
	AND (astMachineDiag[uiLoop].eState = E_MACHINE_STATE.IDLE) THEN
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
		uiSelectedMachine := 0;
		eMagazineOperation := E_MAGAZINE_OPERATION.NONE;

		IF rtStart.Q
		AND xReadyToStart THEN
			xRunning := TRUE;
			Diag.eState := E_CELL_STATE.ROUTE_PAYLOAD;
		END_IF;

	E_CELL_STATE.ROUTE_PAYLOAD:
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
		xCandidateFound := FALSE;
		xTimedCandidate := FALSE;
		uiSelectedMachine := 0;

		// Готовые станки выбираются по минимальному номеру.
		FOR uiLoop := 1 TO 3 DO
			IF NOT xCandidateFound
			AND astMachineStatus[uiLoop].xEnabled
			AND astMachineStatus[uiLoop].xCanAcceptService
			AND astMachineStatus[uiLoop].xServiceRequired
			AND NOT astMachineStatus[uiLoop].xError THEN
				uiSelectedMachine := uiLoop;
				xCandidateFound := TRUE;
			END_IF;
		END_FOR;

		IF xCandidateFound THEN
			Diag.eState := E_CELL_STATE.MOVE_TO_MACHINE;
		ELSE
			// Среди обрабатывающих станков выбирается минимальное оставшееся время.
			FOR uiLoop := 1 TO 3 DO
				IF astMachineStatus[uiLoop].xEnabled
				AND astMachineStatus[uiLoop].xProcessing
				AND astMachineStatus[uiLoop].xCycleTimeValid
				AND NOT astMachineStatus[uiLoop].xError THEN
					IF NOT xTimedCandidate
					OR (astMachineStatus[uiLoop].tRemaining < tMinimumRemaining) THEN
						uiSelectedMachine := uiLoop;
						tMinimumRemaining := astMachineStatus[uiLoop].tRemaining;
						xTimedCandidate := TRUE;
					END_IF;
				END_IF;
			END_FOR;

			// Без оценки времени ожидаем первый обрабатывающий станок.
			IF NOT xTimedCandidate THEN
				FOR uiLoop := 1 TO 3 DO
					IF (uiSelectedMachine = 0)
					AND astMachineStatus[uiLoop].xEnabled
					AND astMachineStatus[uiLoop].xProcessing
					AND NOT astMachineStatus[uiLoop].xError THEN
						uiSelectedMachine := uiLoop;
					END_IF;
				END_FOR;
			END_IF;

			IF uiSelectedMachine > 0 THEN
				Diag.eState := E_CELL_STATE.MOVE_TO_MACHINE;
			END_IF;
		END_IF;

	E_CELL_STATE.MOVE_TO_MACHINE:
		IF xStopRequested
		AND NOT stRobotStatus.xBusy THEN
			xRunning := FALSE;
			Diag.eState := E_CELL_STATE.IDLE;
		ELSIF (uiSelectedMachine < 1)
		OR (uiSelectedMachine > 3) THEN
			Diag.eState := E_CELL_STATE.SELECT_MACHINE;
		ELSIF NOT astMachineStatus[uiSelectedMachine].xEnabled
		OR astMachineStatus[uiSelectedMachine].xError THEN
			Diag.eState := E_CELL_STATE.SELECT_MACHINE;

		ELSIF stRobotStatus.eCurrentPoint = astMachineStatus[uiSelectedMachine].eAbovePoint THEN
			IF astMachineStatus[uiSelectedMachine].xCanAcceptService THEN
				Diag.eState := E_CELL_STATE.SERVICE_MACHINE;
			ELSE
				Diag.eState := E_CELL_STATE.WAIT_MACHINE;
			END_IF;

		ELSE
			Command.stRobot.xExecute := TRUE;
			Command.stRobot.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
			Command.stRobot.eSetPoint := astMachineStatus[uiSelectedMachine].eAbovePoint;

			IF stRobotStatus.xError THEN
				Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
				Diag.eState := E_CELL_STATE.ERROR;
			ELSIF stRobotStatus.xDone THEN
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
			ELSIF astMachineStatus[uiSelectedMachine].xCanAcceptService THEN
				Diag.eState := E_CELL_STATE.SERVICE_MACHINE;
			ELSE
				Diag.eState := E_CELL_STATE.WAIT_MACHINE;
			END_IF;
		END_IF;

	E_CELL_STATE.WAIT_MACHINE:
		IF NOT astMachineStatus[uiSelectedMachine].xEnabled
		OR astMachineStatus[uiSelectedMachine].xError THEN
			Diag.eState := E_CELL_STATE.SELECT_MACHINE;
		ELSIF astMachineStatus[uiSelectedMachine].xCanAcceptService THEN
			IF stRobotStatus.eCurrentPoint = astMachineStatus[uiSelectedMachine].eAbovePoint THEN
				Diag.eState := E_CELL_STATE.SERVICE_MACHINE;
			ELSE
				Diag.eState := E_CELL_STATE.MOVE_TO_MACHINE;
			END_IF;
		END_IF;

	E_CELL_STATE.SERVICE_MACHINE:
		IF xStopRequested
		AND NOT astMachineStatus[uiSelectedMachine].xBusy THEN
			xRunning := FALSE;
			Diag.eState := E_CELL_STATE.IDLE;
		ELSE
			Command.axMachineExecute[uiSelectedMachine] := TRUE;
		END_IF;

		IF Diag.eState = E_CELL_STATE.SERVICE_MACHINE THEN
			IF astMachineStatus[uiSelectedMachine].xError THEN
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
		IF stRobotStatus.xBusy THEN
			Command.stRobot.xStop := TRUE;
		END_IF;
		IF stMagazineStatus.xBusy THEN
			Command.stMagazine.xStop := TRUE;
		END_IF;

		IF xReset
		AND NOT xGlobalError
		AND NOT stRobotStatus.xError
		AND NOT stMagazineStatus.xError THEN
			Error.dwErrorLast := Error.dwErrorActive;
			Error.dwErrorActive := DWORD#0;
			uiSelectedMachine := 0;
			eMagazineOperation := E_MAGAZINE_OPERATION.NONE;
			Diag.eState := E_CELL_STATE.IDLE;
		END_IF;
END_CASE;

Status.xRunning := xRunning;
Status.xBusy := xRunning
	AND (Diag.eState <> E_CELL_STATE.IDLE)
	AND (Diag.eState <> E_CELL_STATE.ERROR);
Status.xWaitingMachine := Diag.eState = E_CELL_STATE.SELECT_MACHINE
	OR Diag.eState = E_CELL_STATE.WAIT_MACHINE;
Status.xWaitingMagazine := Diag.eState = E_CELL_STATE.WAIT_MAGAZINE;
Status.xError := Diag.eState = E_CELL_STATE.ERROR;
Status.xReadyToStart := xReadyToStart;
Status.xDrivesReady := xDrivesReady;
Status.xRobotReady := xRobotReady;
Status.xMagazineReady := xMagazineReady;
Status.uiReadyMachines := uiReadyMachines;
Status.uiSelectedMachine := uiSelectedMachine;
Status.eMagazineOperation := eMagazineOperation;
Error.dwAlarmActive := Error.dwErrorActive AND ERR_BOTH_GRIPPERS;

IF Error.dwErrorActive <> DWORD#0 THEN
	Error.dwErrorLast := Error.dwErrorActive;
END_IF;

Error.stErrorActive := UpdateErrorView(dwError := Error.dwErrorActive);
Error.stErrorLast := UpdateErrorView(dwError := Error.dwErrorLast);
