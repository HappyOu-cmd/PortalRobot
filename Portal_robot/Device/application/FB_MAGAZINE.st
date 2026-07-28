FUNCTION_BLOCK FB_MAGAZINE
VAR_INPUT
	stRobotStatus     : ST_ROBOT_STATUS; // Текущие статусы робота
	stMagazineCommand : ST_MAGAZINE_COMMAND; // Команда магазина от автоматической логики
	stHmiCommand      : ST_ROBOT_COMMAND; // Ручная команда магазина с HMI
	xManual           : BOOL; // Разрешение ручного управления
	xReset            : BOOL; // Сброс ошибок магазина
	xGlobalError      : BOOL; // Глобальная ошибка ячейки
	xMode             : BOOL; // Режим робота: TRUE — Modbus, FALSE — SoftMotion
	xHmiEnable        : BOOL; // Импульс включения магазина с HMI
	xHmiDisable       : BOOL; // Импульс отключения магазина с HMI
	uiRows            : UINT; // Число строк матрицы магазина
	uiColumns         : UINT; // Число столбцов матрицы магазина
	lrPitchX          : LREAL; // Шаг между слотами по оси X
	lrPitchY          : LREAL; // Шаг между слотами по оси Y
	lrSafeZ           : LREAL; // Безопасная координата по оси Z
END_VAR
VAR_OUTPUT
	Command : ST_ROBOT_COMMAND; // Текущая пошаговая команда роботу
	Status  : ST_MAGAZINE_STATUS; // Рабочие статусы магазина
	Diag    : ST_MAGAZINE_DIAG; // Состояние автомата магазина
	Error   : ST_MAGAZINE_ERRORS; // Активные и последние ошибки
END_VAR
VAR_IN_OUT
	stDetail : ARRAY [1..GVL_CELL_SETTINGS.NumberDetail] OF ST_DETAIL; // Содержимое слотов магазина
	stPoint  : ARRAY [0..GVL_POINT.iPointNumber] OF ST_POINT; // Глобальная таблица точек робота
END_VAR
VAR
	eGrantedOperation : E_MAGAZINE_OPERATION; // Доступная операция магазина
	eActualOperation  : E_MAGAZINE_OPERATION; // Выполняемая операция магазина

	rtExecute          : R_TRIG; // Фронт команды запуска
	rtEnable           : R_TRIG; // Фронт команды включения
	rtDisable          : R_TRIG; // Фронт команды отключения

	xExecuteRequest    : BOOL; // Активный запрос выполнения операции
	xResetRequest      : BOOL; // Активный запрос сброса
	xStopRequest       : BOOL; // Активный запрос остановки
	xManualCommand     : BOOL; // Команда получена из ручного интерфейса

	iActiveSlotCount   : SINT; // Число активных слотов выбранной матрицы
	iTakeSlot          : SINT; // Слот выбранной заготовки
	iPutSlot           : SINT; // Выбранный свободный слот
	uiStep             : UINT; // Шаг последовательности робота
	uiIndex            : UINT; // Индекс слота для расчёта координат
	uiRow              : UINT; // Строка выбранного слота
	uiColumn           : UINT; // Столбец выбранного слота

	stTakePoint          : ST_POINT; // Рассчитанная рабочая точка взятия
	stPutPoint           : ST_POINT; // Рассчитанная рабочая точка укладки
	stActiveRobotCommand : ST_ROBOT_COMMAND; // Команда роботу текущего шага
END_VAR
VAR CONSTANT
	ERR_WRONG_OPERATION : DWORD := DWORD#16#0000_0001; // Недопустимая операция магазина
	ERR_NO_BLANK        : DWORD := DWORD#16#0000_0002; // В магазине нет заготовки
	ERR_NO_FREE_SLOT    : DWORD := DWORD#16#0000_0004; // В магазине нет свободного слота
	ERR_INVALID_SLOT    : DWORD := DWORD#16#0000_0008; // Недопустимый номер слота
	ERR_SLOT_CONTENT    : DWORD := DWORD#16#0000_0010; // Содержимое слота не соответствует операции
	ERR_ROBOT           : DWORD := DWORD#16#0000_0020; // Ошибка робота при операции магазина
	ERR_GLOBAL_STOP     : DWORD := DWORD#16#0000_0040; // Остановка по глобальной ошибке
	ERR_GEOMETRY        : DWORD := DWORD#16#0000_0080; // Ошибка параметров матрицы магазина
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Активный размер матрицы может быть меньше полного массива деталей.
IF (uiRows > 0)
AND (uiColumns > 0)
AND ((uiRows * uiColumns) <= SINT_TO_UINT(GVL_CELL_SETTINGS.NumberDetail)) THEN
	iActiveSlotCount := UINT_TO_SINT(uiRows * uiColumns);
ELSE
	iActiveSlotCount := 0;
END_IF;

IF iActiveSlotCount > 0 THEN
	Status.iCurrentBlank := FIND_BLANK(
		stDetail := stDetail,
		iSlotCount := iActiveSlotCount
	);
	Status.iCurrentFreeSlot := FIND_FREE_SLOT(
		stDetail := stDetail,
		iSlotCount := iActiveSlotCount
	);
ELSE
	Status.iCurrentBlank := 0;
	Status.iCurrentFreeSlot := 0;
END_IF;

Status.xOutBlank := Status.iCurrentBlank = 0;
Status.xOutFreeSlot := Status.iCurrentFreeSlot = 0;

// Автоматический выбор доступной операции.
eGrantedOperation := E_MAGAZINE_OPERATION.NONE;

IF NOT Status.xOutBlank
AND NOT stRobotStatus.xBlankAvailable
AND NOT stRobotStatus.xDetailAvailable THEN
	eGrantedOperation := E_MAGAZINE_OPERATION.TAKE;

ELSIF NOT Status.xOutFreeSlot
AND Status.xOutBlank
AND stRobotStatus.xDetailAvailable THEN
	eGrantedOperation := E_MAGAZINE_OPERATION.PUT;

ELSIF NOT Status.xOutFreeSlot
AND NOT Status.xOutBlank
AND stRobotStatus.xDetailAvailable THEN
	eGrantedOperation := E_MAGAZINE_OPERATION.CHANGE;
END_IF;

// Команды магазина с HMI принимаются только в ручном режиме.
xManualCommand := xManual AND (
	(stHmiCommand.eSetPoint = E_POINT_NAME.MAGAZINE_TAKE_DETAIL)
	OR (stHmiCommand.eSetPoint = E_POINT_NAME.MAGAZINE_PUT_DETAIL)
	OR (stHmiCommand.eSetPoint = E_POINT_NAME.MAGAZINE_CHANGE_DETAIL)
);

IF xManual THEN
	IF xManualCommand THEN
		xExecuteRequest := stHmiCommand.xExecute;
		xStopRequest := stHmiCommand.xStop;
	ELSE
		xExecuteRequest := FALSE;
		xStopRequest := FALSE;
	END_IF;
ELSE
	xExecuteRequest := stMagazineCommand.xExecute;
	xStopRequest := stMagazineCommand.xStop;
END_IF;

xResetRequest := xReset;

IF xManual THEN
	rtEnable(CLK := xHmiEnable);
	rtDisable(CLK := xHmiDisable);
ELSE
	rtEnable(CLK := stMagazineCommand.xEnable);
	rtDisable(CLK := stMagazineCommand.xDisable);
END_IF;

rtExecute(CLK := xExecuteRequest);

// Значения команды роботу по умолчанию.
Command.xExecute := FALSE;
Command.xStop := FALSE;
Command.xReset := xResetRequest;
Command.eAction := E_ROBOT_ACTION.NONE;
Command.eSetPoint := E_POINT_NAME.NONE;
Command.iTakeSlot := 0;
Command.iPutSlot := 0;

IF xGlobalError
AND (Diag.eState <> E_MAGAZINE_STATE.DISABLED)
AND (Diag.eState <> E_MAGAZINE_STATE.IDLE)
AND (Diag.eState <> E_MAGAZINE_STATE.ERROR) THEN
	Error.dwErrorActive := Error.dwErrorActive OR ERR_GLOBAL_STOP;
	Diag.eState := E_MAGAZINE_STATE.ERROR;
END_IF;

CASE Diag.eState OF
	E_MAGAZINE_STATE.DISABLED:
		IF rtEnable.Q AND NOT xGlobalError THEN
			Diag.eState := E_MAGAZINE_STATE.IDLE;
		END_IF;

	E_MAGAZINE_STATE.IDLE:
		uiStep := 0;
		eActualOperation := E_MAGAZINE_OPERATION.NONE;

		IF rtDisable.Q THEN
			Diag.eState := E_MAGAZINE_STATE.DISABLED;
		ELSIF xGlobalError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_GLOBAL_STOP;
			Diag.eState := E_MAGAZINE_STATE.ERROR;
		ELSIF rtExecute.Q THEN
			IF xManualCommand THEN
				CASE stHmiCommand.eSetPoint OF
					E_POINT_NAME.MAGAZINE_TAKE_DETAIL:
						eActualOperation := E_MAGAZINE_OPERATION.TAKE;
					E_POINT_NAME.MAGAZINE_PUT_DETAIL:
						eActualOperation := E_MAGAZINE_OPERATION.PUT;
					E_POINT_NAME.MAGAZINE_CHANGE_DETAIL:
						eActualOperation := E_MAGAZINE_OPERATION.CHANGE;
				ELSE
					eActualOperation := E_MAGAZINE_OPERATION.NONE;
				END_CASE;
				iTakeSlot := stHmiCommand.iTakeSlot;
				iPutSlot := stHmiCommand.iPutSlot;
			ELSE
				eActualOperation := eGrantedOperation;
				iTakeSlot := Status.iCurrentBlank;
				iPutSlot := Status.iCurrentFreeSlot;
			END_IF;

			Diag.eState := E_MAGAZINE_STATE.CHOOSE;
		END_IF;

	E_MAGAZINE_STATE.CHOOSE:
		IF (iActiveSlotCount = 0)
		OR (NOT xMode AND (
			((uiColumns > 1) AND (lrPitchX = 0.0))
			OR ((uiRows > 1) AND (lrPitchY = 0.0))
			OR (lrSafeZ = stPoint[E_POINT_NAME.MAGAZINE_DETAIL].Z)
			OR (stPoint[E_POINT_NAME.MAGAZINE_DETAIL].SpeedFactor <= 0.1)
			OR (stPoint[E_POINT_NAME.MAGAZINE_DETAIL].SpeedFactor > 1.0)
		)) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_GEOMETRY;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF eActualOperation = E_MAGAZINE_OPERATION.NONE THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_WRONG_OPERATION;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF ((eActualOperation = E_MAGAZINE_OPERATION.TAKE)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE))
		AND ((iTakeSlot < 1) OR (iTakeSlot > iActiveSlotCount)) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_NO_BLANK OR ERR_INVALID_SLOT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF ((eActualOperation = E_MAGAZINE_OPERATION.PUT)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE))
		AND ((iPutSlot < 1) OR (iPutSlot > iActiveSlotCount)) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_NO_FREE_SLOT OR ERR_INVALID_SLOT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF ((eActualOperation = E_MAGAZINE_OPERATION.TAKE)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE))
		AND (NOT stDetail[iTakeSlot].xInPosition
			OR (stDetail[iTakeSlot].eDetailType <> E_DETAIL_TYPE.BLANK)) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_SLOT_CONTENT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF ((eActualOperation = E_MAGAZINE_OPERATION.PUT)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE))
		AND stDetail[iPutSlot].xInPosition THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_SLOT_CONTENT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF (eActualOperation = E_MAGAZINE_OPERATION.TAKE)
		AND (stRobotStatus.xBlankAvailable OR stRobotStatus.xDetailAvailable) THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_WRONG_OPERATION;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF ((eActualOperation = E_MAGAZINE_OPERATION.PUT)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE))
		AND NOT stRobotStatus.xDetailAvailable THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_WRONG_OPERATION;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSE
			IF (eActualOperation = E_MAGAZINE_OPERATION.TAKE)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE) THEN
				uiIndex := SINT_TO_UINT(iTakeSlot - 1);
				uiColumn := uiIndex MOD uiColumns;
				uiRow := uiIndex / uiColumns;
				stTakePoint := stPoint[E_POINT_NAME.MAGAZINE_DETAIL];
				stTakePoint.X := stTakePoint.X + UINT_TO_LREAL(uiColumn) * lrPitchX;
				stTakePoint.Y := stTakePoint.Y + UINT_TO_LREAL(uiRow) * lrPitchY;
			END_IF;

			IF (eActualOperation = E_MAGAZINE_OPERATION.PUT)
			OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE) THEN
				uiIndex := SINT_TO_UINT(iPutSlot - 1);
				uiColumn := uiIndex MOD uiColumns;
				uiRow := uiIndex / uiColumns;
				stPutPoint := stPoint[E_POINT_NAME.MAGAZINE_DETAIL];
				stPutPoint.X := stPutPoint.X + UINT_TO_LREAL(uiColumn) * lrPitchX;
				stPutPoint.Y := stPutPoint.Y + UINT_TO_LREAL(uiRow) * lrPitchY;
			END_IF;

			uiStep := 0;
			Diag.eState := E_MAGAZINE_STATE.PREPARE_STEP;
		END_IF;

	E_MAGAZINE_STATE.PREPARE_STEP:
		stActiveRobotCommand.xExecute := FALSE;
		stActiveRobotCommand.xStop := FALSE;
		stActiveRobotCommand.xReset := xResetRequest;
		stActiveRobotCommand.eAction := E_ROBOT_ACTION.NONE;
		stActiveRobotCommand.eSetPoint := E_POINT_NAME.NONE;
		stActiveRobotCommand.iTakeSlot := iTakeSlot;
		stActiveRobotCommand.iPutSlot := iPutSlot;

		IF xMode THEN
			stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
			CASE eActualOperation OF
				E_MAGAZINE_OPERATION.TAKE:
					stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_TAKE_DETAIL;
				E_MAGAZINE_OPERATION.PUT:
					stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
				E_MAGAZINE_OPERATION.CHANGE:
					stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_CHANGE_DETAIL;
			END_CASE;
			Diag.eState := E_MAGAZINE_STATE.ROBOT_COMMAND;

		ELSE
			CASE eActualOperation OF
				E_MAGAZINE_OPERATION.TAKE:
					CASE uiStep OF
						0: stActiveRobotCommand.eAction := E_ROBOT_ACTION.ROTATE_TO_BLANK;
						1:
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL] := stTakePoint;
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL].Z := lrSafeZ;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_TAKE_DETAIL;
						2:
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL] := stTakePoint;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_TAKE_DETAIL;
						3: stActiveRobotCommand.eAction := E_ROBOT_ACTION.CLAMP_1;
						4:
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL] := stTakePoint;
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL].Z := lrSafeZ;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_TAKE_DETAIL;
					ELSE
						Diag.eState := E_MAGAZINE_STATE.DONE;
					END_CASE;

				E_MAGAZINE_OPERATION.PUT:
					CASE uiStep OF
						0: stActiveRobotCommand.eAction := E_ROBOT_ACTION.ROTATE_TO_DETAIL;
						1:
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL] := stPutPoint;
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL].Z := lrSafeZ;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
						2:
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL] := stPutPoint;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
						3: stActiveRobotCommand.eAction := E_ROBOT_ACTION.UNCLAMP_2;
						4:
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL] := stPutPoint;
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL].Z := lrSafeZ;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
					ELSE
						Diag.eState := E_MAGAZINE_STATE.DONE;
					END_CASE;

				E_MAGAZINE_OPERATION.CHANGE:
					CASE uiStep OF
						0: stActiveRobotCommand.eAction := E_ROBOT_ACTION.ROTATE_TO_DETAIL;
						1:
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL] := stPutPoint;
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL].Z := lrSafeZ;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
						2:
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL] := stPutPoint;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
						3: stActiveRobotCommand.eAction := E_ROBOT_ACTION.UNCLAMP_2;
						4:
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL] := stPutPoint;
							stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL].Z := lrSafeZ;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
						5: stActiveRobotCommand.eAction := E_ROBOT_ACTION.ROTATE_TO_BLANK;
						6:
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL] := stTakePoint;
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL].Z := lrSafeZ;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_TAKE_DETAIL;
						7:
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL] := stTakePoint;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_TAKE_DETAIL;
						8: stActiveRobotCommand.eAction := E_ROBOT_ACTION.CLAMP_1;
						9:
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL] := stTakePoint;
							stPoint[E_POINT_NAME.MAGAZINE_TAKE_DETAIL].Z := lrSafeZ;
							stActiveRobotCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
							stActiveRobotCommand.eSetPoint := E_POINT_NAME.MAGAZINE_TAKE_DETAIL;
					ELSE
						Diag.eState := E_MAGAZINE_STATE.DONE;
					END_CASE;
			END_CASE;

			IF Diag.eState = E_MAGAZINE_STATE.PREPARE_STEP THEN
				Diag.eState := E_MAGAZINE_STATE.ROBOT_COMMAND;
			END_IF;
		END_IF;

	E_MAGAZINE_STATE.ROBOT_COMMAND:
		Command := stActiveRobotCommand;
		Command.xExecute := TRUE;

		IF xStopRequest OR xGlobalError THEN
			Command.xStop := TRUE;
			Error.dwErrorActive := Error.dwErrorActive OR ERR_GLOBAL_STOP;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF stRobotStatus.xError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;

		ELSIF stRobotStatus.xDone THEN
			IF xMode THEN
				IF (eActualOperation = E_MAGAZINE_OPERATION.PUT)
				OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE) THEN
					stDetail[iPutSlot].xInPosition := TRUE;
					stDetail[iPutSlot].eDetailType := E_DETAIL_TYPE.DETAIL;
				END_IF;
				IF (eActualOperation = E_MAGAZINE_OPERATION.TAKE)
				OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE) THEN
					stDetail[iTakeSlot].xInPosition := FALSE;
					stDetail[iTakeSlot].eDetailType := E_DETAIL_TYPE.NONE;
				END_IF;
			ELSE
				IF (uiStep = 3)
				AND ((eActualOperation = E_MAGAZINE_OPERATION.PUT)
					OR (eActualOperation = E_MAGAZINE_OPERATION.CHANGE)) THEN
					stDetail[iPutSlot].xInPosition := TRUE;
					stDetail[iPutSlot].eDetailType := E_DETAIL_TYPE.DETAIL;
				END_IF;
				IF ((uiStep = 3) AND (eActualOperation = E_MAGAZINE_OPERATION.TAKE))
				OR ((uiStep = 8) AND (eActualOperation = E_MAGAZINE_OPERATION.CHANGE)) THEN
					stDetail[iTakeSlot].xInPosition := FALSE;
					stDetail[iTakeSlot].eDetailType := E_DETAIL_TYPE.NONE;
				END_IF;
			END_IF;

			Diag.eState := E_MAGAZINE_STATE.RELEASE_ROBOT_COMMAND;
		END_IF;

	E_MAGAZINE_STATE.RELEASE_ROBOT_COMMAND:
		IF stRobotStatus.xError THEN
			Error.dwErrorActive := Error.dwErrorActive OR ERR_ROBOT;
			Diag.eState := E_MAGAZINE_STATE.ERROR;
		ELSIF NOT stRobotStatus.xBusy AND NOT stRobotStatus.xDone THEN
			IF xMode THEN
				Diag.eState := E_MAGAZINE_STATE.DONE;
			ELSE
				Diag.eState := E_MAGAZINE_STATE.NEXT;
			END_IF;
		END_IF;

	E_MAGAZINE_STATE.NEXT:
		uiStep := uiStep + 1;
		Diag.eState := E_MAGAZINE_STATE.PREPARE_STEP;

	E_MAGAZINE_STATE.DONE:
		IF NOT xExecuteRequest THEN
			eActualOperation := E_MAGAZINE_OPERATION.NONE;
			Diag.eState := E_MAGAZINE_STATE.IDLE;
		END_IF;

	E_MAGAZINE_STATE.ERROR:
		IF stRobotStatus.xBusy THEN
			Command := stActiveRobotCommand;
			Command.xExecute := TRUE;
			Command.xStop := TRUE;
		END_IF;

		IF xResetRequest
		AND NOT xExecuteRequest
		AND NOT xGlobalError
		AND NOT stRobotStatus.xError THEN
			Error.dwErrorLast := Error.dwErrorActive;
			Error.dwErrorActive := DWORD#0;
			eActualOperation := E_MAGAZINE_OPERATION.NONE;
			Diag.eState := E_MAGAZINE_STATE.DISABLED;
		END_IF;
END_CASE;

Status.xEnabled := Diag.eState <> E_MAGAZINE_STATE.DISABLED;
Status.xReady := Diag.eState = E_MAGAZINE_STATE.IDLE;
Status.xBusy := (Diag.eState <> E_MAGAZINE_STATE.DISABLED)
	AND (Diag.eState <> E_MAGAZINE_STATE.IDLE)
	AND (Diag.eState <> E_MAGAZINE_STATE.DONE)
	AND (Diag.eState <> E_MAGAZINE_STATE.ERROR);
Status.xDone := Diag.eState = E_MAGAZINE_STATE.DONE;
Status.xError := Diag.eState = E_MAGAZINE_STATE.ERROR;
Status.eGrantedOperation := eGrantedOperation;
Status.eActualOperation := eActualOperation;
Status.iSelectedBlank := iTakeSlot;
Status.iSelectedFreeSlot := iPutSlot;
Status.xFinished := Status.xOutBlank
	AND Status.xOutFreeSlot
	AND NOT stRobotStatus.xBlankAvailable
	AND NOT stRobotStatus.xDetailAvailable
	AND NOT Status.xBusy;

IF Error.dwErrorActive <> DWORD#0 THEN
	Error.dwErrorLast := Error.dwErrorActive;
END_IF;

Error.stErrorActive := UpdateErrorView(dwError := Error.dwErrorActive);
Error.stErrorLast := UpdateErrorView(dwError := Error.dwErrorLast);
