METHOD PRIVATE RunAlarms

// --- BEGIN IMPLEMENTATION ---

// Единая кнопка подсвечивается только тогда, когда существует хотя бы одна авария
// и каждый активный владелец общей команды готов принять тот же импульс сброса.
// Диагностические защёлки симуляторов станков сюда не входят: они обслуживаются
// отдельной командой «Сброс симулятора» на экране инъекций.
xAlarmResetRequired := CONTROLLER_DIAGNOSTICS.Status.xAlarmActive
    OR (GVL_GEOMETRY_CONTROL.xSupported AND (GVL_GEOMETRY_CONTROL.astStatus[1].xError
	OR GVL_GEOMETRY_CONTROL.astStatus[2].xError))
	OR GVL_CELL_MANAGER.Status.xError
	OR (CELL_SAFETY.Error.dwAlarmActive <> DWORD#0)
	OR GVL_ROBOT.Status.xError
	OR GVL_MACHINE.Status[1].xError
	OR GVL_MACHINE.Status[2].xError
	OR GVL_MACHINE.Status[3].xError
	OR GVL_MAGAZINE.astStatus[1].xError
	OR GVL_MAGAZINE.astStatus[2].xError
	OR (NOT GVL_HMI.xModbusMode AND GVL_AXIS.arrAxis[1].Status.xError)
	OR (NOT GVL_HMI.xModbusMode AND GVL_AXIS.arrAxis[2].Status.xError)
	OR (NOT GVL_HMI.xModbusMode AND GVL_AXIS.arrAxis[3].Status.xError)
	OR (NOT GVL_HMI.xModbusMode AND GVL_AXIS_GROUP.AxisGroup.Status.xLocalError)
	OR (NOT GVL_HMI.xModbusMode AND GVL_AXIS_GROUP.AxisGroup.Status.xLogicalError)
	OR (NOT GVL_HMI.xModbusMode AND GVL_AXIS_GROUP.AxisGroup.Status.xGroupError)
	OR (NOT GVL_HMI.xModbusMode AND (GVL_MOTION_MANAGER.stMotionManager.Error.dwAlarmActive <> DWORD#0))
	OR (NOT GVL_HMI.xModbusMode AND (GVL_POINT_MANAGER.PointManager.Error.dwAlarmActive <> DWORD#0))
	OR (NOT GVL_HMI.xModbusMode AND (GVL_ROBOT.GripperError.dwAlarmActive <> DWORD#0));

xAlarmResetAllowed := ((GVL_TWO_PALLET.uiMode = 0) OR ((NOT GVL_TWO_PALLET.astStatus[1].xError OR GVL_TWO_PALLET.astStatus[1].xResetAllowed) AND (NOT GVL_TWO_PALLET.astStatus[2].xError OR GVL_TWO_PALLET.astStatus[2].xResetAllowed))) AND xAlarmResetRequired
	AND (CELL_SAFETY.Error.dwAlarmActive = DWORD#0)
    AND (NOT CONTROLLER_DIAGNOSTICS.Status.xAlarmActive OR CONTROLLER_DIAGNOSTICS.Status.xResetAllowed)
	AND (NOT GVL_GEOMETRY_CONTROL.xSupported OR NOT GVL_GEOMETRY_CONTROL.astStatus[1].xError OR GVL_GEOMETRY_CONTROL.astStatus[1].xResetAllowed)
	AND (NOT GVL_GEOMETRY_CONTROL.xSupported OR NOT GVL_GEOMETRY_CONTROL.astStatus[2].xError OR GVL_GEOMETRY_CONTROL.astStatus[2].xResetAllowed)
	AND (NOT GVL_CELL_MANAGER.Status.xError OR GVL_CELL_MANAGER.Status.xResetAllowed)
	AND (NOT GVL_ROBOT.Status.xError OR GVL_ROBOT.Status.xResetAllowed)
	AND (NOT GVL_MACHINE.Status[1].xError OR GVL_MACHINE.Status[1].xResetAllowed)
	AND (NOT GVL_MACHINE.Status[2].xError OR GVL_MACHINE.Status[2].xResetAllowed)
	AND (NOT GVL_MACHINE.Status[3].xError OR GVL_MACHINE.Status[3].xResetAllowed)
	AND (NOT GVL_MAGAZINE.astPartStatus[1].xError
		OR (GVL_MAGAZINE.astError[1].dwAlarmActive = DWORD#0)
		OR fbMagazine1.FaultStatus.xResetAllowed)
	AND (NOT GVL_MAGAZINE.astPartStatus[2].xError
		OR (GVL_MAGAZINE.astError[2].dwAlarmActive = DWORD#0)
		OR fbMagazine2.FaultStatus.xResetAllowed)
	AND (GVL_HMI.xModbusMode OR NOT GVL_AXIS.arrAxis[1].Status.xError OR AXIS_X.FaultStatus.xResetAllowed)
	AND (GVL_HMI.xModbusMode OR NOT GVL_AXIS.arrAxis[2].Status.xError OR AXIS_Y.FaultStatus.xResetAllowed)
	AND (GVL_HMI.xModbusMode OR NOT GVL_AXIS.arrAxis[3].Status.xError OR AXIS_Z.FaultStatus.xResetAllowed)
	AND (GVL_HMI.xModbusMode OR NOT (GVL_AXIS_GROUP.AxisGroup.Status.xLocalError
		OR GVL_AXIS_GROUP.AxisGroup.Status.xLogicalError
		OR GVL_AXIS_GROUP.AxisGroup.Status.xGroupError)
		OR GROUP_XYZ.FaultStatus.xResetAllowed)
	AND (GVL_HMI.xModbusMode OR (GVL_MOTION_MANAGER.stMotionManager.Error.dwAlarmActive = DWORD#0)
		OR GVL_ROBOT.Status.xResetAllowed)
	AND (GVL_HMI.xModbusMode OR (GVL_POINT_MANAGER.PointManager.Error.dwAlarmActive = DWORD#0)
		OR (GVL_ROBOT.Status.xResetAllowed AND ROBOT.FaultStatus.stPoint.xResetAllowed))
	AND (GVL_HMI.xModbusMode OR (GVL_ROBOT.GripperError.dwAlarmActive = DWORD#0)
		OR (GVL_ROBOT.Status.xResetAllowed AND ROBOT.FaultStatus.stGripper.xResetAllowed));

// Два владельца предупреждений используют один источник журнала и общий счётчик.
FOR uiTwin := 1 TO 2 DO
	IF GVL_MAGAZINE.astDiag[uiTwin].stWarning.udiSequence <> audiPartWarningSeen[uiTwin] THEN
		audiPartWarningSeen[uiTwin] := GVL_MAGAZINE.astDiag[uiTwin].stWarning.udiSequence;
		astMagazineWarningMerged[uiTwin].uiCode := GVL_MAGAZINE.astDiag[uiTwin].stWarning.uiCode;
		astMagazineWarningMerged[uiTwin].udiSequence := astMagazineWarningMerged[uiTwin].udiSequence + 1;
	END_IF;
	IF GVL_TWO_PALLET.astDiag[uiTwin].stWarning.udiSequence <> audiTwinWarningSeen[uiTwin] THEN
		audiTwinWarningSeen[uiTwin] := GVL_TWO_PALLET.astDiag[uiTwin].stWarning.udiSequence;
		astMagazineWarningMerged[uiTwin].uiCode := GVL_TWO_PALLET.astDiag[uiTwin].stWarning.uiCode;
		astMagazineWarningMerged[uiTwin].udiSequence := astMagazineWarningMerged[uiTwin].udiSequence + 1;
	END_IF;
END_FOR;

// В журнал передаются все активные ошибки и предупреждения каждого функционального блока.
astAlarmSource[18].eSource := E_ALARM_SOURCE.GEOMETRY_1;
astAlarmSource[19].eSource := E_ALARM_SOURCE.GEOMETRY_2;
FOR uiGeometry := UINT#1 TO UINT#2 DO
	IF GVL_GEOMETRY_CONTROL.xSupported THEN
		astAlarmSource[17 + uiGeometry].dwAlarmActive := GVL_GEOMETRY_CONTROL.astActiveMemory[uiGeometry].dwAlarm;
	ELSE astAlarmSource[17 + uiGeometry].dwAlarmActive := DWORD#0; END_IF;
	astAlarmSource[17 + uiGeometry].xRobotStopRequired := GVL_GEOMETRY_CONTROL.astStatus[uiGeometry].xRobotStopRequired;
	astAlarmSource[17 + uiGeometry].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
	astAlarmSource[17 + uiGeometry].stWarning := GVL_GEOMETRY_CONTROL.astWarning[uiGeometry];
END_FOR;
astAlarmSource[1].eSource := E_ALARM_SOURCE.CELL;
astAlarmSource[1].dwAlarmActive := GVL_CELL_MANAGER.Error.dwAlarmActive;
astAlarmSource[1].xRobotStopRequired := FALSE;
astAlarmSource[1].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
astAlarmSource[1].stWarning := GVL_CELL_MANAGER.Diag.stWarning;

// Каждый владелец сохраняет собственные код и счётчик. Подмена Diag ячейки
// чужим событием приводила к откату на старое предупреждение в следующем скане.
// ALARM_MANAGER регистрирует все три канала независимо под источником CELL.
astAdditionalCellWarning[1] := GVL_MULTI_TYPE.ConfigStatus.stWarning;
astAdditionalCellWarning[2] := GVL_GEOMETRY_CONTROL.stCellWarning;

astAlarmSource[2].eSource := E_ALARM_SOURCE.ROBOT;
astAlarmSource[2].dwAlarmActive := GVL_ROBOT.Error.dwAlarmActive;
astAlarmSource[2].xRobotStopRequired := FALSE;
astAlarmSource[2].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
astAlarmSource[2].stWarning := GVL_ROBOT.Diag.stWarning;

astAlarmSource[3].eSource := E_ALARM_SOURCE.MACHINE_1;
astAlarmSource[3].dwAlarmActive := GVL_MACHINE.Error[1].dwAlarmActive;
astAlarmSource[3].xRobotStopRequired := GVL_MACHINE.Status[1].xCriticalError;
astAlarmSource[3].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
astAlarmSource[3].stWarning := GVL_MACHINE.Diag[1].stWarning;

astAlarmSource[4].eSource := E_ALARM_SOURCE.MACHINE_2;
astAlarmSource[4].dwAlarmActive := GVL_MACHINE.Error[2].dwAlarmActive;
astAlarmSource[4].xRobotStopRequired := GVL_MACHINE.Status[2].xCriticalError;
astAlarmSource[4].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
astAlarmSource[4].stWarning := GVL_MACHINE.Diag[2].stWarning;

astAlarmSource[5].eSource := E_ALARM_SOURCE.MACHINE_3;
astAlarmSource[5].dwAlarmActive := GVL_MACHINE.Error[3].dwAlarmActive;
astAlarmSource[5].xRobotStopRequired := GVL_MACHINE.Status[3].xCriticalError;
astAlarmSource[5].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
astAlarmSource[5].stWarning := GVL_MACHINE.Diag[3].stWarning;

astAlarmSource[6].eSource := E_ALARM_SOURCE.MAGAZINE_LOGIC_1;
astAlarmSource[6].dwAlarmActive := GVL_MAGAZINE.astError[1].dwAlarmActive;
astAlarmSource[6].xRobotStopRequired := GVL_MAGAZINE.astStatus[1].xRobotStopRequired;
astAlarmSource[6].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
astAlarmSource[6].stWarning := astMagazineWarningMerged[1];

astAlarmSource[7].eSource := E_ALARM_SOURCE.MAGAZINE_LOGIC_2;
astAlarmSource[7].dwAlarmActive := GVL_MAGAZINE.astError[2].dwAlarmActive;
astAlarmSource[7].xRobotStopRequired := GVL_MAGAZINE.astStatus[2].xRobotStopRequired;
astAlarmSource[7].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
astAlarmSource[7].stWarning := astMagazineWarningMerged[2];

// Числовые коды 7 и 8 зарезервированы, чтобы старые записи SQLite не начали
// отображаться как аварии осей X/Y после удаления приводов магазинов.
astAlarmSource[8].eSource := E_ALARM_SOURCE.RESERVED_LEGACY_MAGAZINE_AXIS_1;
astAlarmSource[8].dwAlarmActive := DWORD#0;
astAlarmSource[8].xRobotStopRequired := FALSE;
astAlarmSource[8].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
astAlarmSource[8].stWarning.uiCode := UINT#0;
astAlarmSource[8].stWarning.udiSequence := UDINT#0;

astAlarmSource[9].eSource := E_ALARM_SOURCE.RESERVED_LEGACY_MAGAZINE_AXIS_2;
astAlarmSource[9].dwAlarmActive := DWORD#0;
astAlarmSource[9].xRobotStopRequired := FALSE;
astAlarmSource[9].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
astAlarmSource[9].stWarning.uiCode := UINT#0;
astAlarmSource[9].stWarning.udiSequence := UDINT#0;

astAlarmSource[10].eSource := E_ALARM_SOURCE.AXIS_X;
IF GVL_HMI.xModbusMode THEN astAlarmSource[10].dwAlarmActive := DWORD#0;
ELSE astAlarmSource[10].dwAlarmActive := GVL_AXIS.arrAxis[1].Error.dwAlarmActive; END_IF;
astAlarmSource[10].xRobotStopRequired := FALSE;
astAlarmSource[10].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
astAlarmSource[10].stWarning := GVL_AXIS.arrAxis[1].Diag.stWarning;

astAlarmSource[11].eSource := E_ALARM_SOURCE.AXIS_Y;
IF GVL_HMI.xModbusMode THEN astAlarmSource[11].dwAlarmActive := DWORD#0;
ELSE astAlarmSource[11].dwAlarmActive := GVL_AXIS.arrAxis[2].Error.dwAlarmActive; END_IF;
astAlarmSource[11].xRobotStopRequired := FALSE;
astAlarmSource[11].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
astAlarmSource[11].stWarning := GVL_AXIS.arrAxis[2].Diag.stWarning;

astAlarmSource[12].eSource := E_ALARM_SOURCE.AXIS_Z;
IF GVL_HMI.xModbusMode THEN astAlarmSource[12].dwAlarmActive := DWORD#0;
ELSE astAlarmSource[12].dwAlarmActive := GVL_AXIS.arrAxis[3].Error.dwAlarmActive; END_IF;
astAlarmSource[12].xRobotStopRequired := FALSE;
astAlarmSource[12].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
astAlarmSource[12].stWarning := GVL_AXIS.arrAxis[3].Diag.stWarning;

astAlarmSource[13].eSource := E_ALARM_SOURCE.AXIS_GROUP;
IF GVL_HMI.xModbusMode THEN astAlarmSource[13].dwAlarmActive := DWORD#0;
ELSE astAlarmSource[13].dwAlarmActive := GVL_AXIS_GROUP.AxisGroup.Error.dwAlarmActive; END_IF;
astAlarmSource[13].xRobotStopRequired := FALSE;
astAlarmSource[13].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
astAlarmSource[13].stWarning := GVL_AXIS_GROUP.AxisGroup.Diag.stWarning;

astAlarmSource[14].eSource := E_ALARM_SOURCE.MOTION_MANAGER;
IF GVL_HMI.xModbusMode THEN astAlarmSource[14].dwAlarmActive := DWORD#0;
ELSE astAlarmSource[14].dwAlarmActive := GVL_MOTION_MANAGER.stMotionManager.Error.dwAlarmActive; END_IF;
astAlarmSource[14].xRobotStopRequired := FALSE;
astAlarmSource[14].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
astAlarmSource[14].stWarning := GVL_MOTION_MANAGER.stMotionManager.Diag.stWarning;

astAlarmSource[15].eSource := E_ALARM_SOURCE.POINT_MANAGER;
IF GVL_HMI.xModbusMode THEN astAlarmSource[15].dwAlarmActive := DWORD#0;
ELSE astAlarmSource[15].dwAlarmActive := GVL_POINT_MANAGER.PointManager.Error.dwAlarmActive; END_IF;
astAlarmSource[15].xRobotStopRequired := FALSE;
astAlarmSource[15].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
astAlarmSource[15].stWarning := GVL_POINT_MANAGER.PointManager.Diag.stWarning;

astAlarmSource[16].eSource := E_ALARM_SOURCE.GRIPPER;
IF GVL_HMI.xModbusMode THEN astAlarmSource[16].dwAlarmActive := DWORD#0;
ELSE astAlarmSource[16].dwAlarmActive := GVL_ROBOT.GripperError.dwAlarmActive; END_IF;
astAlarmSource[16].xRobotStopRequired := FALSE;
astAlarmSource[16].xGlobalError := GVL_CELL_CONTROL.xGlobalError;
astAlarmSource[16].stWarning := GVL_ROBOT.GripperDiag.stWarning;

astAlarmSource[17].eSource := E_ALARM_SOURCE.CELL_SAFETY;
astAlarmSource[17].dwAlarmActive := CELL_SAFETY.Error.dwAlarmActive;
astAlarmSource[17].xRobotStopRequired := TRUE;
astAlarmSource[17].xGlobalError := CELL_SAFETY.Status.xGlobalError;
astAlarmSource[17].stWarning := CELL_SAFETY.Diag.stWarning;

astAlarmSource[20].eSource := E_ALARM_SOURCE.CONTROLLER_CPU_1;
astAlarmSource[20].dwAlarmActive := CONTROLLER_DIAGNOSTICS.Status.dwCpuAlarm1;
astAlarmSource[20].xGlobalError := TRUE;
astAlarmSource[20].stWarning := CONTROLLER_DIAGNOSTICS.stWarning;
astAlarmSource[21].eSource := E_ALARM_SOURCE.CONTROLLER_CPU_2;
astAlarmSource[21].dwAlarmActive := CONTROLLER_DIAGNOSTICS.Status.dwCpuAlarm2;
astAlarmSource[21].xGlobalError := TRUE;
astAlarmSource[22].eSource := E_ALARM_SOURCE.CONTROLLER_MODULES;
astAlarmSource[22].dwAlarmActive := CONTROLLER_DIAGNOSTICS.Status.dwModuleAlarm;
astAlarmSource[22].xGlobalError := TRUE;

ALARM_MANAGER(
    xControllerWarningResetAllowed := NOT CONTROLLER_DIAGNOSTICS.Status.xMemoryWarning
        OR CONTROLLER_DIAGNOSTICS.Status.xWarningResetAllowed,
	xResetWarnings := GVL_ALARM.Command.xResetWarnings,
	astAdditionalCellWarning := astAdditionalCellWarning,
	Sources := astAlarmSource,
	Status => GVL_ALARM.Status,
	Events => GVL_ALARM.Events
);
