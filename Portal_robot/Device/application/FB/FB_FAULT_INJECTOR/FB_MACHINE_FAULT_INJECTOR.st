FUNCTION_BLOCK FB_MACHINE_FAULT_INJECTOR
VAR_INPUT
	Request            : ST_MACHINE_FAULT_REQUEST; // Запросы диагностической инъекции
	MachineStatusRaw    : ST_MACHINE_IO_STATUS; // Неизменённая обратная связь станка
	RobotStatusRaw      : ST_ROBOT_STATUS; // Неизменённая обратная связь робота
	NominalTimeouts     : ST_MACHINE_TIMEOUTS; // Штатные таймауты автомата станка
END_VAR
VAR_OUTPUT
	MachineStatus : ST_MACHINE_IO_STATUS; // Обратная связь, передаваемая FB_MACHINE
	RobotStatus   : ST_ROBOT_STATUS; // Статус робота, передаваемый FB_MACHINE
	Timeouts      : ST_MACHINE_TIMEOUTS; // Действующий профиль таймаутов
	Status        : ST_FAULT_INJECTION_STATUS; // Состояние источника для HMI
END_VAR
VAR CONSTANT
	SIMULATION_TIMEOUT : TIME := T#2S; // Ускоренное время диагностического сценария
END_VAR

// Инжектор не формирует маски ошибок. Он только искажает подтверждения,
// после чего FB_MACHINE обнаруживает штатный TIMEOUT собственными таймерами.

// --- BEGIN IMPLEMENTATION ---

MachineStatus := MachineStatusRaw;
RobotStatus := RobotStatusRaw;
Timeouts := NominalTimeouts;

// Состояние источника аварии не должно оставаться активным после снятия
// соответствующего переключателя. Сам FB_MACHINE при этом сохраняет свою
// защёлкнутую ошибку и сбрасывается отдельной командой из меню станка.
MachineStatus.xAlarm := MachineStatusRaw.xAlarm
	AND Request.xEnabled
	AND (Request.xMachineAlarm OR Request.xDoorFault OR Request.xChuckFault);

Status.xAllowed := Request.xEnabled;
Status.xActive := Request.xEnabled AND (
	Request.xMachineAlarm
	OR Request.xDoorFault
	OR Request.xChuckFault
	OR Request.xTimeoutRobotMove
	OR Request.xTimeoutRobotAction
	OR Request.xTimeoutRobotRelease
	OR Request.xTimeoutDoorOpen
	OR Request.xTimeoutDoorClose
	OR Request.xTimeoutChuckOpen
	OR Request.xTimeoutChuckClose
	OR Request.xTimeoutCycleStart
);
Status.xBusy := FALSE;
Status.xResetAllowed := FALSE;
Status.xRejected := FALSE;

IF Request.xEnabled THEN
	IF Request.xTimeoutRobotMove THEN
		RobotStatus.xDone := FALSE;
		Timeouts.tRobotMove := SIMULATION_TIMEOUT;
	END_IF;

	IF Request.xTimeoutRobotAction THEN
		RobotStatus.xDone := FALSE;
		RobotStatus.xGripper1Open := FALSE;
		RobotStatus.xGripper1Closed := FALSE;
		RobotStatus.xGripper2Open := FALSE;
		RobotStatus.xGripper2Closed := FALSE;
		RobotStatus.xRotatedToBlank := FALSE;
		RobotStatus.xRotatedToDetail := FALSE;
		Timeouts.tRobotAction := SIMULATION_TIMEOUT;
	END_IF;

	IF Request.xTimeoutRobotRelease THEN
		RobotStatus.xBusy := TRUE;
		Timeouts.tRobotRelease := SIMULATION_TIMEOUT;
	END_IF;

	IF Request.xTimeoutDoorOpen THEN
		MachineStatus.xDoorOpen := FALSE;
		Timeouts.tDoorOpen := SIMULATION_TIMEOUT;
	END_IF;

	IF Request.xTimeoutDoorClose THEN
		MachineStatus.xDoorClosed := FALSE;
		Timeouts.tDoorClose := SIMULATION_TIMEOUT;
	END_IF;

	IF Request.xTimeoutChuckOpen THEN
		MachineStatus.xChuckUnclamped := FALSE;
		Timeouts.tChuckOpen := SIMULATION_TIMEOUT;
	END_IF;

	IF Request.xTimeoutChuckClose THEN
		MachineStatus.xChuckClamped := FALSE;
		Timeouts.tChuckClose := SIMULATION_TIMEOUT;
	END_IF;

	IF Request.xTimeoutCycleStart THEN
		MachineStatus.xCycleActive := FALSE;
		Timeouts.tCycleStart := SIMULATION_TIMEOUT;
	END_IF;
END_IF;
