FUNCTION_BLOCK FB_ALARM_MANAGER
VAR_INPUT
	xResetWarnings : BOOL; // Сброс накопленных предупреждений
	astAdditionalCellWarning : ARRAY [1..2] OF ST_WARNING_EVENT; // Конфигуратор и ГК: независимые события источника CELL
END_VAR
VAR_IN_OUT
	Sources : ARRAY [1..19] OF ST_ALARM_SOURCE_DATA; // Старые источники и два ГК
END_VAR
VAR_OUTPUT
	Status : ST_ALARM_STATUS; // Сводный статус журнала
	Events : ARRAY [1..100] OF ST_ALARM_EVENT; // Журнал активных и зафиксированных событий
END_VAR
VAR
	uiWriteIndex : UINT := 1; // Следующая ячейка кольцевого журнала
	udiSequence  : UDINT; // Общий порядковый номер события
	adwPreviousAlarm : ARRAY [1..19] OF DWORD;
	audiPreviousWarning : ARRAY [1..19] OF UDINT;
	audiPreviousAdditionalCellWarning : ARRAY [1..2] OF UDINT;
	uiIndex : UINT; // Индекс источника или события
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Предупреждения подтверждаются только отдельной командой HMI.
// Общий сброс ошибок ячейки не изменяет журнал предупреждений.
IF xResetWarnings THEN
	FOR uiIndex := 1 TO 100 DO
		IF Events[uiIndex].xActive
		AND (Events[uiIndex].eSeverity = E_ALARM_SEVERITY.WARNING) THEN
			Events[uiIndex].xActive := FALSE;
		END_IF;
	END_FOR;
END_IF;

// Менеджер не определяет причины: он регистрирует подготовленные данные владельцев блоков.
FOR uiIndex := 1 TO 19 DO
	UpdateSource(
		eSource := Sources[uiIndex].eSource,
		dwCurrent := Sources[uiIndex].dwAlarmActive,
		xRobotStopRequired := Sources[uiIndex].xRobotStopRequired,
		xGlobalError := Sources[uiIndex].xGlobalError,
		dwPrevious := adwPreviousAlarm[uiIndex]
	);

	IF Sources[uiIndex].stWarning.udiSequence <> audiPreviousWarning[uiIndex] THEN
		IF (Sources[uiIndex].stWarning.udiSequence <> UDINT#0)
		AND (Sources[uiIndex].stWarning.uiCode <> UINT#0) THEN
		AddEvent(
			eSource := Sources[uiIndex].eSource,
			eSeverity := E_ALARM_SEVERITY.WARNING,
			eEffect := E_ALARM_EFFECT.WARNING,
			uiCode := Sources[uiIndex].stWarning.uiCode
		);
		END_IF;
		audiPreviousWarning[uiIndex] := Sources[uiIndex].stWarning.udiSequence;
	END_IF;
END_FOR;

// Общие предупреждения ГК и конфигуратора не изменяют последний код/счётчик
// FB_CELL_MANAGER. Иначе возврат его старого снимка становился новым событием.
// Обрабатываем все каналы в одном вызове: события одного скана не теряются,
// а xResetWarnings не очищает предупреждение, выданное после сброса в этом скане.
FOR uiIndex := UINT#1 TO UINT#2 DO
	IF astAdditionalCellWarning[uiIndex].udiSequence <> audiPreviousAdditionalCellWarning[uiIndex] THEN
		IF (astAdditionalCellWarning[uiIndex].udiSequence <> UDINT#0)
		AND (astAdditionalCellWarning[uiIndex].uiCode <> UINT#0) THEN
			AddEvent(
				eSource := E_ALARM_SOURCE.CELL,
				eSeverity := E_ALARM_SEVERITY.WARNING,
				eEffect := E_ALARM_EFFECT.WARNING,
				uiCode := astAdditionalCellWarning[uiIndex].uiCode
			);
		END_IF;
		audiPreviousAdditionalCellWarning[uiIndex] := astAdditionalCellWarning[uiIndex].udiSequence;
	END_IF;
END_FOR;

Status.uiActiveAlarmCount := 0;
Status.uiActiveWarningCount := 0;
Status.uiHistoryCount := 0;

FOR uiIndex := 1 TO 100 DO
	IF Events[uiIndex].udiSequence <> UDINT#0 THEN
		Status.uiHistoryCount := Status.uiHistoryCount + 1;
	END_IF;
	IF Events[uiIndex].xActive THEN
		IF Events[uiIndex].eSeverity = E_ALARM_SEVERITY.ALARM THEN
			Status.uiActiveAlarmCount := Status.uiActiveAlarmCount + 1;
		ELSE
			Status.uiActiveWarningCount := Status.uiActiveWarningCount + 1;
		END_IF;
	END_IF;
END_FOR;

Status.uiActiveEventCount := Status.uiActiveAlarmCount + Status.uiActiveWarningCount;
Status.xAlarmActive := Status.uiActiveAlarmCount > 0;
Status.xWarningActive := Status.uiActiveWarningCount > 0;
