METHOD PRIVATE UpdateSource
VAR_INPUT
	eSource   : E_ALARM_SOURCE; // Источник проверяемой маски ошибок
	dwCurrent : DWORD; // Текущая маска ошибок
	xRobotStopRequired : BOOL; // Контекст владельца требует зависимого останова робота
	xGlobalError : BOOL; // Глобальная ошибка активна
END_VAR
VAR_IN_OUT
	dwPrevious : DWORD; // Маска ошибок прошлого цикла
END_VAR
VAR
	dwChanged : DWORD; // Изменившиеся биты
	dwBit     : DWORD; // Маска проверяемого бита
	uiBit     : UINT; // Номер проверяемого бита
END_VAR

// --- BEGIN IMPLEMENTATION ---

dwChanged := dwCurrent XOR dwPrevious;

IF dwChanged <> DWORD#0 THEN
	FOR uiBit := 0 TO 31 DO
		dwBit := SHL(DWORD#1, uiBit);
		IF (dwChanged AND dwBit) <> DWORD#0 THEN
			IF (dwCurrent AND dwBit) <> DWORD#0 THEN
				AddEvent(
					eSource := eSource,
					eSeverity := E_ALARM_SEVERITY.ALARM,
					eEffect := GetAlarmEffect(
						eSource := eSource,
						uiCode := uiBit,
						xRobotStopRequired := xRobotStopRequired,
						xGlobalError := xGlobalError
					),
					uiCode := uiBit
				);
			ELSE
				DeactivateEvent(eSource := eSource, uiCode := uiBit);
			END_IF;
		END_IF;
	END_FOR;
	dwPrevious := dwCurrent;
END_IF;
