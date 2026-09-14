FUNCTION_BLOCK FB_CELL_SAFETY
VAR_INPUT
	axDoorLockClosedInput : ARRAY [1..4] OF BOOL;
	axDoorUnlockButtonInput : ARRAY [1..4] OF BOOL;
	axEmergencyStopButtonStationInput : ARRAY [1..4] OF BOOL;
	axEmergencyStopCabinetInput : ARRAY [1..2] OF BOOL;
	xEmergencyStopMpgInput : BOOL;
	xPhaseRelayOkInput    : BOOL;
	xPressureRelayOkInput : BOOL;
	xSafetyRelayOkInput   : BOOL;
	xCellStartButtonInput : BOOL;
	xCellStopButtonInput  : BOOL;
	xCellResetButtonInput : BOOL;
	xMpgAxisXInput : BOOL;
	xMpgAxisYInput : BOOL;
	xMpgAxisZInput : BOOL;
	xMpgMultiplier1Input : BOOL;
	xMpgMultiplier10Input : BOOL;
	xMpgMultiplier100Input : BOOL;
	xSafetyRelayReset : BOOL; // Импульс отдельного сброса реле безопасности
	astMagazineStatus : ARRAY [1..2] OF ST_MAGAZINE_STATUS;
	FaultRequest : ST_CELL_SAFETY_FAULT_REQUEST;
END_VAR
VAR_OUTPUT
	Status : ST_CELL_SAFETY_STATUS;
	Error  : ST_CELL_SAFETY_ERRORS;
	Diag   : ST_CELL_SAFETY_DIAG;
	FaultStatus : ST_FAULT_INJECTION_STATUS;
	astButtonStationIoStatus : ARRAY [1..4] OF ST_BUTTON_STATION_IO_STATUS;
	stFrontControlCabinetIoStatus : ST_CONTROL_CABINET_IO_STATUS;
	stRearControlCabinetIoStatus : ST_CONTROL_CABINET_IO_STATUS;
	stMpgIoStatus : ST_MPG_IO_STATUS;
	astEnclosureDoorStatus : ARRAY [1..4] OF ST_ENCLOSURE_DOOR_STATUS;
	axDoorUnlockOutput : ARRAY [1..4] OF BOOL;
	axDoorButtonLampOutput : ARRAY [1..4] OF BOOL;
	xSafetyRelayResetOutput : BOOL;
	xCellEnablePulse : BOOL;
	xCellDisablePulse : BOOL;
	xCellResetPulse : BOOL;
END_VAR
VAR
	fbFaultInjector : FB_CELL_SAFETY_FAULT_INJECTOR;
	axEmergencyStopStation : ARRAY [1..4] OF BOOL;
	axEmergencyStopCabinet : ARRAY [1..2] OF BOOL;
	axDoorLocked : ARRAY [1..4] OF BOOL;
	axDoorUnlockDemand : ARRAY [1..4] OF BOOL;
	axDoorSeenUnlocked : ARRAY [1..4] OF BOOL;
	artDoorButton : ARRAY [1..4] OF R_TRIG;
	rtSafetyRelayReset : R_TRIG;
	tpSafetyRelayReset : TP;
	rtCellStart : R_TRIG;
	rtCellStop : R_TRIG;
	rtCellReset : R_TRIG;
	xEmergencyStopMpg : BOOL;
	xPhaseRelayOk : BOOL;
	xPressureRelayOk : BOOL;
	xSafetyRelayOk : BOOL;
	dwLiveFaultMask : DWORD;
	uiDoor : UINT;
	uiMagazine : UINT;
END_VAR
VAR CONSTANT
	ERR_ESTOP_STATION_1 : DWORD := DWORD#16#0000_0001;
	ERR_ESTOP_STATION_2 : DWORD := DWORD#16#0000_0002;
	ERR_ESTOP_STATION_3 : DWORD := DWORD#16#0000_0004;
	ERR_ESTOP_STATION_4 : DWORD := DWORD#16#0000_0008;
	ERR_ESTOP_CABINET_FRONT : DWORD := DWORD#16#0000_0010;
	ERR_ESTOP_CABINET_REAR  : DWORD := DWORD#16#0000_0020;
	ERR_ESTOP_MPG      : DWORD := DWORD#16#0000_0040;
	ERR_PHASE_RELAY    : DWORD := DWORD#16#0000_0080;
	ERR_PRESSURE_RELAY : DWORD := DWORD#16#0000_0100;
	ERR_SAFETY_RELAY   : DWORD := DWORD#16#0000_0200;
	ERR_DOOR_1_UNLOCKED : DWORD := DWORD#16#0000_0400;
	ERR_DOOR_2_UNLOCKED : DWORD := DWORD#16#0000_0800;
	ERR_DOOR_3_UNLOCKED : DWORD := DWORD#16#0000_1000;
	ERR_DOOR_4_UNLOCKED : DWORD := DWORD#16#0000_2000;
	WRN_SAFETY_RESET_REJECTED : UINT := UINT#1;
	WRN_DOOR_1_UNLOCK_REJECTED : UINT := UINT#2;
END_VAR

// --- BEGIN IMPLEMENTATION ---

fbFaultInjector(Request := FaultRequest);
FaultStatus := fbFaultInjector.Status;

FOR uiDoor := UINT#1 TO UINT#4 DO
	axEmergencyStopStation[uiDoor] := axEmergencyStopButtonStationInput[uiDoor]
		OR fbFaultInjector.axEmergencyStopStation[uiDoor];
	axDoorLocked[uiDoor] := axDoorLockClosedInput[uiDoor]
		AND NOT fbFaultInjector.axDoorUnlocked[uiDoor];
	artDoorButton[uiDoor](CLK := axDoorUnlockButtonInput[uiDoor]);

	IF uiDoor <= UINT#2 THEN
		uiMagazine := UINT#1;
	ELSE
		uiMagazine := UINT#2;
	END_IF;
	astEnclosureDoorStatus[uiDoor].xUnlockAllowed := NOT astMagazineStatus[uiMagazine].xEnabled;
	axDoorButtonLampOutput[uiDoor] := astEnclosureDoorStatus[uiDoor].xUnlockAllowed;

	IF artDoorButton[uiDoor].Q THEN
		IF astEnclosureDoorStatus[uiDoor].xUnlockAllowed THEN
			axDoorUnlockDemand[uiDoor] := TRUE;
			axDoorSeenUnlocked[uiDoor] := FALSE;
		ELSE
			RaiseWarning(uiCode := WRN_DOOR_1_UNLOCK_REJECTED + uiDoor - UINT#1);
		END_IF;
	END_IF;

	// Команда держится до фактического цикла «замок открылся -> снова закрылся».
	// Если магазин включили поверх открытого доступа, выход снимается немедленно.
	IF NOT astEnclosureDoorStatus[uiDoor].xUnlockAllowed THEN
		axDoorUnlockDemand[uiDoor] := FALSE;
		axDoorSeenUnlocked[uiDoor] := FALSE;
	ELSIF axDoorUnlockDemand[uiDoor] THEN
		IF NOT axDoorLocked[uiDoor] THEN
			axDoorSeenUnlocked[uiDoor] := TRUE;
		ELSIF axDoorSeenUnlocked[uiDoor] THEN
			axDoorUnlockDemand[uiDoor] := FALSE;
			axDoorSeenUnlocked[uiDoor] := FALSE;
		END_IF;
	END_IF;

	axDoorUnlockOutput[uiDoor] := axDoorUnlockDemand[uiDoor];
	astEnclosureDoorStatus[uiDoor].xLocked := axDoorLocked[uiDoor];
	astEnclosureDoorStatus[uiDoor].xUnlockOutput := axDoorUnlockOutput[uiDoor];
	astButtonStationIoStatus[uiDoor].xEmergencyStopPressed := axEmergencyStopStation[uiDoor];
	astButtonStationIoStatus[uiDoor].xButtonPressed := axDoorUnlockButtonInput[uiDoor];
	astButtonStationIoStatus[uiDoor].xButtonLightOn := axDoorButtonLampOutput[uiDoor];
	Status.axEmergencyStopReleased[uiDoor] := NOT axEmergencyStopStation[uiDoor];
	Status.axDoorReady[uiDoor] := astEnclosureDoorStatus[uiDoor].xUnlockAllowed OR axDoorLocked[uiDoor];
END_FOR;

FOR uiDoor := UINT#1 TO UINT#2 DO
	axEmergencyStopCabinet[uiDoor] := axEmergencyStopCabinetInput[uiDoor]
		OR fbFaultInjector.axEmergencyStopCabinet[uiDoor];
	Status.axEmergencyStopReleased[uiDoor + UINT#4] := NOT axEmergencyStopCabinet[uiDoor];
END_FOR;
xEmergencyStopMpg := xEmergencyStopMpgInput OR fbFaultInjector.xEmergencyStopMpg;
Status.axEmergencyStopReleased[7] := NOT xEmergencyStopMpg;

xPhaseRelayOk := xPhaseRelayOkInput AND NOT fbFaultInjector.xPhaseRelayFault;
xPressureRelayOk := xPressureRelayOkInput AND NOT fbFaultInjector.xPressureRelayFault;
xSafetyRelayOk := xSafetyRelayOkInput AND NOT fbFaultInjector.xSafetyRelayFault;

rtSafetyRelayReset(CLK := xSafetyRelayReset);
Status.xSafetyRelayResetAllowed := NOT xSafetyRelayOk AND NOT tpSafetyRelayReset.Q;
IF rtSafetyRelayReset.Q AND NOT Status.xSafetyRelayResetAllowed THEN
	RaiseWarning(uiCode := WRN_SAFETY_RESET_REJECTED);
END_IF;
tpSafetyRelayReset(
	IN := rtSafetyRelayReset.Q AND Status.xSafetyRelayResetAllowed,
	PT := T#1S
);
// Разрешение проверяется на фронте команды; после запуска выдаём полный импульс 1 с.
xSafetyRelayResetOutput := tpSafetyRelayReset.Q;
Status.xSafetyRelayResetActive := xSafetyRelayResetOutput;

rtCellStart(CLK := xCellStartButtonInput);
rtCellStop(CLK := xCellStopButtonInput);
rtCellReset(CLK := xCellResetButtonInput);
xCellEnablePulse := rtCellStart.Q;
xCellDisablePulse := rtCellStop.Q;
xCellResetPulse := rtCellReset.Q;

stFrontControlCabinetIoStatus.xEmergencyStopPressed := axEmergencyStopCabinet[1];
stFrontControlCabinetIoStatus.xStartPressed := xCellStartButtonInput;
stFrontControlCabinetIoStatus.xStopPressed := xCellStopButtonInput;
stFrontControlCabinetIoStatus.xResetPressed := xCellResetButtonInput;
stRearControlCabinetIoStatus.xEmergencyStopPressed := axEmergencyStopCabinet[2];
stRearControlCabinetIoStatus.xStartPressed := FALSE;
stRearControlCabinetIoStatus.xStopPressed := FALSE;
stRearControlCabinetIoStatus.xResetPressed := FALSE;
stMpgIoStatus.xEmergencyStopPressed := xEmergencyStopMpg;
stMpgIoStatus.xAxisX := xMpgAxisXInput;
stMpgIoStatus.xAxisY := xMpgAxisYInput;
stMpgIoStatus.xAxisZ := xMpgAxisZInput;
stMpgIoStatus.xMultiplier1 := xMpgMultiplier1Input;
stMpgIoStatus.xMultiplier10 := xMpgMultiplier10Input;
stMpgIoStatus.xMultiplier100 := xMpgMultiplier100Input;

dwLiveFaultMask := DWORD#0;
IF axEmergencyStopStation[1] THEN dwLiveFaultMask := dwLiveFaultMask OR ERR_ESTOP_STATION_1; END_IF;
IF axEmergencyStopStation[2] THEN dwLiveFaultMask := dwLiveFaultMask OR ERR_ESTOP_STATION_2; END_IF;
IF axEmergencyStopStation[3] THEN dwLiveFaultMask := dwLiveFaultMask OR ERR_ESTOP_STATION_3; END_IF;
IF axEmergencyStopStation[4] THEN dwLiveFaultMask := dwLiveFaultMask OR ERR_ESTOP_STATION_4; END_IF;
IF axEmergencyStopCabinet[1] THEN dwLiveFaultMask := dwLiveFaultMask OR ERR_ESTOP_CABINET_FRONT; END_IF;
IF axEmergencyStopCabinet[2] THEN dwLiveFaultMask := dwLiveFaultMask OR ERR_ESTOP_CABINET_REAR; END_IF;
IF xEmergencyStopMpg THEN dwLiveFaultMask := dwLiveFaultMask OR ERR_ESTOP_MPG; END_IF;
IF NOT xPhaseRelayOk THEN dwLiveFaultMask := dwLiveFaultMask OR ERR_PHASE_RELAY; END_IF;
IF NOT xPressureRelayOk THEN dwLiveFaultMask := dwLiveFaultMask OR ERR_PRESSURE_RELAY; END_IF;
IF NOT xSafetyRelayOk THEN dwLiveFaultMask := dwLiveFaultMask OR ERR_SAFETY_RELAY; END_IF;
IF astMagazineStatus[1].xEnabled AND NOT axDoorLocked[1] THEN dwLiveFaultMask := dwLiveFaultMask OR ERR_DOOR_1_UNLOCKED; END_IF;
IF astMagazineStatus[1].xEnabled AND NOT axDoorLocked[2] THEN dwLiveFaultMask := dwLiveFaultMask OR ERR_DOOR_2_UNLOCKED; END_IF;
IF astMagazineStatus[2].xEnabled AND NOT axDoorLocked[3] THEN dwLiveFaultMask := dwLiveFaultMask OR ERR_DOOR_3_UNLOCKED; END_IF;
IF astMagazineStatus[2].xEnabled AND NOT axDoorLocked[4] THEN dwLiveFaultMask := dwLiveFaultMask OR ERR_DOOR_4_UNLOCKED; END_IF;

Error.dwErrorActive := dwLiveFaultMask;
Error.dwAlarmActive := dwLiveFaultMask;
IF dwLiveFaultMask <> DWORD#0 THEN
	Error.dwErrorLast := dwLiveFaultMask;
END_IF;
Status.xPhaseRelayOk := xPhaseRelayOk;
Status.xPressureRelayOk := xPressureRelayOk;
Status.xSafetyRelayOk := xSafetyRelayOk;
Status.xGlobalError := dwLiveFaultMask <> DWORD#0;
Status.xReady := NOT Status.xGlobalError;
