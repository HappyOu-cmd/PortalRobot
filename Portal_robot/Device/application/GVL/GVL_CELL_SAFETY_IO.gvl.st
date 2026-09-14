{attribute 'qualified_only'}
VAR_GLOBAL
	// Логические точки для назначения в Device I/O Mapping. Полярность НЗ-контактов
	// нормализуется при привязке: здесь TRUE всегда означает указанное состояние.
	// Начальное состояние стенда: двери закрыты, грибки отжаты, реле в норме.
	axDoorLockClosedInput : ARRAY [1..4] OF BOOL := [TRUE, TRUE, TRUE, TRUE];
	axDoorUnlockButtonInput : ARRAY [1..4] OF BOOL := [FALSE, FALSE, FALSE, FALSE];
	axEmergencyStopButtonStationInput : ARRAY [1..4] OF BOOL := [FALSE, FALSE, FALSE, FALSE];
	axEmergencyStopCabinetInput : ARRAY [1..2] OF BOOL := [FALSE, FALSE];
	xEmergencyStopMpgInput : BOOL := FALSE;
	xPhaseRelayOkInput    : BOOL := TRUE;
	xPressureRelayOkInput : BOOL := TRUE;
	xSafetyRelayOkInput   : BOOL := TRUE;
	xCellStartButtonInput : BOOL := FALSE;
	xCellStopButtonInput  : BOOL := FALSE;
	xCellResetButtonInput : BOOL := FALSE;
	xMpgAxisXInput : BOOL := FALSE;
	xMpgAxisYInput : BOOL := FALSE;
	xMpgAxisZInput : BOOL := FALSE;
	xMpgMultiplier1Input : BOOL := FALSE;
	xMpgMultiplier10Input : BOOL := FALSE;
	xMpgMultiplier100Input : BOOL := FALSE;

	// Выходы для назначения на физические каналы.
	axDoorUnlockOutput : ARRAY [1..4] OF BOOL;
	axDoorButtonLampOutput : ARRAY [1..4] OF BOOL;
	xSafetyRelayResetOutput : BOOL;
END_VAR
