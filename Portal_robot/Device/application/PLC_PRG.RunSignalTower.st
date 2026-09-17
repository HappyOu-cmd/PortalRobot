METHOD PRIVATE RunSignalTower
VAR
	xBlink : BOOL;
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Приоритет: авария > предупреждение > работа > готовность > остановлена/не готова.
// Вызывать после RunAlarms: используются актуальные сводные состояния этого скана.
IF GVL_ALARM.Status.xAlarmActive THEN
	usiSignalTowerMode := USINT#4;
ELSIF GVL_ALARM.Status.xWarningActive THEN
	usiSignalTowerMode := USINT#3;
ELSIF GVL_CELL_MANAGER.Status.xRunning THEN
	usiSignalTowerMode := USINT#1;
ELSIF GVL_CELL_MANAGER.Status.xReadyToStart THEN
	usiSignalTowerMode := USINT#2;
ELSE
	usiSignalTowerMode := USINT#5;
END_IF;

xBlink := (usiSignalTowerMode = USINT#2) OR (usiSignalTowerMode = USINT#4);
tonSignalTowerBlink(
	IN := xBlink AND (usiSignalTowerMode = usiSignalTowerPreviousMode) AND NOT tonSignalTowerBlink.Q,
	PT := T#500MS
);
// Каждый новый режим начинается со включённой секции, без ожидания таймера.
IF (usiSignalTowerMode <> usiSignalTowerPreviousMode) OR NOT xBlink THEN
	xSignalTowerBlinkOn := TRUE;
ELSIF tonSignalTowerBlink.Q THEN
	xSignalTowerBlinkOn := NOT xSignalTowerBlinkOn;
END_IF;
usiSignalTowerPreviousMode := usiSignalTowerMode;

GVL_CELL_SAFETY_IO.xSignalTowerRedOutput := (usiSignalTowerMode = USINT#5)
	OR ((usiSignalTowerMode = USINT#4) AND xSignalTowerBlinkOn);
GVL_CELL_SAFETY_IO.xSignalTowerAmberOutput := usiSignalTowerMode = USINT#3;
GVL_CELL_SAFETY_IO.xSignalTowerGreenOutput := (usiSignalTowerMode = USINT#1)
	OR ((usiSignalTowerMode = USINT#2) AND xSignalTowerBlinkOn);
