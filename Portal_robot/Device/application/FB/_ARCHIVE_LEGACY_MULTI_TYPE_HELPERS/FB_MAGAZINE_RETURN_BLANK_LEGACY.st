FUNCTION_BLOCK FB_MAGAZINE_RETURN_BLANK_LEGACY
VAR_INPUT
	xExecute         : BOOL; // Выполнить возврат заготовки
	xReset           : BOOL; // Сбросить локальную ошибку
	xGlobalError     : BOOL; // Глобальная ошибка ячейки
	stRobotStatus    : ST_ROBOT_STATUS; // Состояние робота
	iSlot            : SINT; // Слот возврата
	uiRows           : UINT; // Строки магазина
	uiColumns        : UINT; // Столбцы магазина
	lrPitchX         : LREAL; // Шаг слотов по X
	lrPitchY         : LREAL; // Шаг слотов по Y
	lrSafeZ          : LREAL; // Безопасная высота над магазином
END_VAR
VAR_OUTPUT
	Command        : ST_ROBOT_COMMAND; // Пошаговая команда существующему FB_ROBOT
	xBusy          : BOOL; // Возврат выполняется
	xDone          : BOOL; // Возврат завершён
	xError         : BOOL; // Возврат завершён ошибкой
	xCommandActive : BOOL; // Команда должна владеть входом магазина FB_ROBOT
END_VAR
VAR_IN_OUT
	stDetail : ARRAY [1..GVL_CELL_SETTINGS.NumberDetail] OF ST_DETAIL; // Фактическое содержимое магазина
	stPoint  : ARRAY [0..GVL_POINT.iPointNumber] OF ST_POINT; // Таблица точек робота
END_VAR
VAR
	uiState       : UINT; // Внутреннее состояние последовательности
	uiStep        : UINT; // Номер технологического шага
	uiIndex       : UINT; // Индекс слота от нуля
	uiRow         : UINT; // Строка слота
	uiColumn      : UINT; // Столбец слота
	uiActiveSlots : UINT; // Число активных слотов
	stPutPoint    : ST_POINT; // Рассчитанная точка возврата
	stActiveCommand : ST_ROBOT_COMMAND; // Зафиксированная команда текущего шага
END_VAR
VAR CONSTANT
	STATE_IDLE    : UINT := UINT#0;
	STATE_PREPARE : UINT := UINT#10;
	STATE_COMMAND : UINT := UINT#20;
	STATE_RELEASE : UINT := UINT#30;
	STATE_NEXT    : UINT := UINT#40;
	STATE_DONE    : UINT := UINT#50;
	STATE_ERROR   : UINT := UINT#99;
END_VAR

// --- BEGIN IMPLEMENTATION ---

Command.xExecute := FALSE;
Command.xStop := FALSE;
Command.xReset := xReset;
Command.eAction := E_ROBOT_ACTION.NONE;
Command.eSetPoint := E_POINT_NAME.NONE;
Command.iActiveSlot := iSlot;

IF (uiRows > UINT#0)
AND (uiColumns > UINT#0)
AND ((uiRows * uiColumns) <= SINT_TO_UINT(GVL_CELL_SETTINGS.NumberDetail)) THEN
	uiActiveSlots := uiRows * uiColumns;
ELSE
	uiActiveSlots := UINT#0;
END_IF;

CASE uiState OF
	STATE_IDLE:
		IF xExecute THEN
			IF (iSlot < SINT#1)
			OR (SINT_TO_UINT(iSlot) > uiActiveSlots)
			OR (uiColumns = UINT#0) THEN
				uiState := STATE_ERROR;
			ELSE
				IF stDetail[iSlot].xInPosition
				OR NOT stRobotStatus.xBlankAvailable
				OR stRobotStatus.xDetailAvailable
				OR xGlobalError THEN
					uiState := STATE_ERROR;
				ELSE
					uiIndex := SINT_TO_UINT(iSlot - SINT#1);
					uiColumn := uiIndex MOD uiColumns;
					uiRow := uiIndex / uiColumns;
					stPutPoint := stPoint[E_POINT_NAME.MAGAZINE_DETAIL];
					stPutPoint.X := stPutPoint.X + UINT_TO_LREAL(uiColumn) * lrPitchX;
					stPutPoint.Y := stPutPoint.Y + UINT_TO_LREAL(uiRow) * lrPitchY;
					uiStep := UINT#0;
					uiState := STATE_PREPARE;
				END_IF;
			END_IF;
		END_IF;

	STATE_PREPARE:
		stActiveCommand.xExecute := FALSE;
		stActiveCommand.xStop := FALSE;
		stActiveCommand.xReset := xReset;
		stActiveCommand.eAction := E_ROBOT_ACTION.NONE;
		stActiveCommand.eSetPoint := E_POINT_NAME.NONE;
		stActiveCommand.iActiveSlot := iSlot;

		CASE uiStep OF
			UINT#0:
				IF stRobotStatus.xRotatedToBlank THEN
					uiState := STATE_NEXT;
				ELSE
					stActiveCommand.eAction := E_ROBOT_ACTION.ROTATE_TO_BLANK;
				END_IF;
			UINT#1:
				stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL] := stPutPoint;
				stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL].Z := lrSafeZ;
				stActiveCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
				stActiveCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
			UINT#2:
				stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL] := stPutPoint;
				stActiveCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
				stActiveCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
			UINT#3:
				stActiveCommand.eAction := E_ROBOT_ACTION.UNCLAMP_1;
			UINT#4:
				stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL] := stPutPoint;
				stPoint[E_POINT_NAME.MAGAZINE_PUT_DETAIL].Z := lrSafeZ;
				stActiveCommand.eAction := E_ROBOT_ACTION.MOVE_TO_POINT;
				stActiveCommand.eSetPoint := E_POINT_NAME.MAGAZINE_PUT_DETAIL;
		ELSE
			uiState := STATE_DONE;
		END_CASE;

		IF uiState = STATE_PREPARE THEN
			uiState := STATE_COMMAND;
		END_IF;

	STATE_COMMAND:
		Command := stActiveCommand;
		Command.xExecute := TRUE;
		IF xGlobalError THEN
			Command.xStop := TRUE;
			uiState := STATE_ERROR;
		ELSIF stRobotStatus.xError THEN
			uiState := STATE_ERROR;
		ELSIF stRobotStatus.xDone THEN
			IF uiStep = UINT#3 THEN
				stDetail[iSlot].xInPosition := TRUE;
				stDetail[iSlot].eDetailType := E_DETAIL_TYPE.BLANK;
			END_IF;
			uiState := STATE_RELEASE;
		END_IF;

	STATE_RELEASE:
		IF stRobotStatus.xError THEN
			uiState := STATE_ERROR;
		ELSIF NOT stRobotStatus.xBusy
		AND NOT stRobotStatus.xDone THEN
			uiState := STATE_NEXT;
		END_IF;

	STATE_NEXT:
		uiStep := uiStep + UINT#1;
		uiState := STATE_PREPARE;

	STATE_DONE:
		IF NOT xExecute THEN
			uiState := STATE_IDLE;
		END_IF;

	STATE_ERROR:
		IF stRobotStatus.xBusy THEN
			Command := stActiveCommand;
			Command.xExecute := TRUE;
			Command.xStop := TRUE;
		END_IF;
		IF xReset
		AND NOT xExecute
		AND NOT xGlobalError
		AND NOT stRobotStatus.xError THEN
			uiState := STATE_IDLE;
		END_IF;
END_CASE;

xBusy := (uiState <> STATE_IDLE)
	AND (uiState <> STATE_DONE)
	AND (uiState <> STATE_ERROR);
xDone := uiState = STATE_DONE;
xError := uiState = STATE_ERROR;
xCommandActive := Command.xExecute OR Command.xStop;
