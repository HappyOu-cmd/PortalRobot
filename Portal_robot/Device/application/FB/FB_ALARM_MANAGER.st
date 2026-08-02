FUNCTION_BLOCK FB_ALARM_MANAGER
VAR_INPUT
	xResetAll      : BOOL; // Общий сброс ошибок ячейки
	xResetWarnings : BOOL; // Сброс накопленных предупреждений
END_VAR
VAR_IN_OUT
	Sources : ARRAY [1..13] OF ST_ALARM_SOURCE_DATA; // Унифицированные данные функциональных блоков
END_VAR
VAR_OUTPUT
	Status : ST_ALARM_STATUS; // Сводный статус журнала
	Events : ARRAY [1..100] OF ST_ALARM_EVENT; // Журнал активных и зафиксированных событий
END_VAR
VAR
	uiWriteIndex : UINT := 1; // Следующая ячейка кольцевого журнала
	udiSequence  : UDINT; // Общий порядковый номер события
	adwPreviousAlarm : ARRAY [1..13] OF DWORD; // Опубликованные аварии прошлого цикла
	audiPreviousWarning : ARRAY [1..13] OF UDINT; // Номера предупреждений прошлого цикла
	uiIndex : UINT; // Индекс источника или события
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Предупреждения подтверждаются отдельно или вместе с общим сбросом.
IF xResetWarnings OR xResetAll THEN
	FOR uiIndex := 1 TO 100 DO
		IF Events[uiIndex].xActive
		AND (Events[uiIndex].eSeverity = E_ALARM_SEVERITY.WARNING) THEN
			Events[uiIndex].xActive := FALSE;
		END_IF;
	END_FOR;
END_IF;

// Менеджер не определяет причины: он регистрирует подготовленные данные владельцев блоков.
FOR uiIndex := 1 TO 13 DO
	UpdateSource(
		eSource := Sources[uiIndex].eSource,
		dwCurrent := Sources[uiIndex].dwAlarmActive,
		dwPrevious := adwPreviousAlarm[uiIndex]
	);

	IF Sources[uiIndex].stWarning.udiSequence <> audiPreviousWarning[uiIndex] THEN
		IF (Sources[uiIndex].stWarning.udiSequence <> UDINT#0)
		AND (Sources[uiIndex].stWarning.uiCode <> UINT#0) THEN
			AddEvent(
				eSource := Sources[uiIndex].eSource,
				eSeverity := E_ALARM_SEVERITY.WARNING,
				uiCode := Sources[uiIndex].stWarning.uiCode
			);
		END_IF;
		audiPreviousWarning[uiIndex] := Sources[uiIndex].stWarning.udiSequence;
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
