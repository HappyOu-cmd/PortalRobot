METHOD PRIVATE RunAlarms

// --- BEGIN IMPLEMENTATION ---

// Единая кнопка подсвечивается только тогда, когда существует хотя бы одна авария
// и каждый активный владелец общей команды готов принять тот же импульс сброса.
// Диагностические защёлки симуляторов станков сюда не входят: они обслуживаются
// отдельной командой «Сброс симулятора» на экране инъекций.
xAlarmResetRequired := GVL_CELL_MANAGER.Status.xError
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

xAlarmResetAllowed := xAlarmResetRequired
	AND (NOT GVL_CELL_MANAGER.Status.xError OR GVL_CELL_MANAGER.Status.xResetAllowed)
	AND (NOT GVL_ROBOT.Status.xError OR GVL_ROBOT.Status.xResetAllowed)
	AND (NOT GVL_MACHINE.Status[1].xError OR GVL_MACHINE.Status[1].xResetAllowed)
	AND (NOT GVL_MACHINE.Status[2].xError OR GVL_MACHINE.Status[2].xResetAllowed)
	AND (NOT GVL_MACHINE.Status[3].xError OR GVL_MACHINE.Status[3].xResetAllowed)
	AND (NOT GVL_MAGAZINE.astStatus[1].xError
		OR ((GVL_MAGAZINE.astError[1].dwAlarmActive = DWORD#0) OR fbMagazine1.FaultStatus.xResetAllowed)
		AND (NOT GVL_MAGAZINE.astStatus[1].xAxisError OR MAGAZINE_AXIS_1.FaultStatus.xResetAllowed))
	AND (NOT GVL_MAGAZINE.astStatus[2].xError
		OR ((GVL_MAGAZINE.astError[2].dwAlarmActive = DWORD#0) OR fbMagazine2.FaultStatus.xResetAllowed)
		AND (NOT GVL_MAGAZINE.astStatus[2].xAxisError OR MAGAZINE_AXIS_2.FaultStatus.xResetAllowed))
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

// В журнал передаются все активные ошибки и предупреждения каждого функционального блока.
astAlarmSource[1].eSource := E_ALARM_SOURCE.CELL;
astAlarmSource[1].dwAlarmActive := GVL_CELL_MANAGER.Error.dwAlarmActive;
astAlarmSource[1].stWarning := GVL_CELL_MANAGER.Diag.stWarning;

astAlarmSource[2].eSource := E_ALARM_SOURCE.ROBOT;
astAlarmSource[2].dwAlarmActive := GVL_ROBOT.Error.dwAlarmActive;
astAlarmSource[2].stWarning := GVL_ROBOT.Diag.stWarning;

astAlarmSource[3].eSource := E_ALARM_SOURCE.MACHINE_1;
astAlarmSource[3].dwAlarmActive := GVL_MACHINE.Error[1].dwAlarmActive;
astAlarmSource[3].stWarning := GVL_MACHINE.Diag[1].stWarning;

astAlarmSource[4].eSource := E_ALARM_SOURCE.MACHINE_2;
astAlarmSource[4].dwAlarmActive := GVL_MACHINE.Error[2].dwAlarmActive;
astAlarmSource[4].stWarning := GVL_MACHINE.Diag[2].stWarning;

astAlarmSource[5].eSource := E_ALARM_SOURCE.MACHINE_3;
astAlarmSource[5].dwAlarmActive := GVL_MACHINE.Error[3].dwAlarmActive;
astAlarmSource[5].stWarning := GVL_MACHINE.Diag[3].stWarning;

astAlarmSource[6].eSource := E_ALARM_SOURCE.MAGAZINE_LOGIC_1;
astAlarmSource[6].dwAlarmActive := GVL_MAGAZINE.astError[1].dwAlarmActive;
astAlarmSource[6].stWarning := GVL_MAGAZINE.astDiag[1].stWarning;

astAlarmSource[7].eSource := E_ALARM_SOURCE.MAGAZINE_LOGIC_2;
astAlarmSource[7].dwAlarmActive := GVL_MAGAZINE.astError[2].dwAlarmActive;
astAlarmSource[7].stWarning := GVL_MAGAZINE.astDiag[2].stWarning;

astAlarmSource[8].eSource := E_ALARM_SOURCE.MAGAZINE_AXIS_1;
astAlarmSource[8].dwAlarmActive := GVL_MAGAZINE_AXIS.astAxis[1].Error.dwAlarmActive;
astAlarmSource[8].stWarning := GVL_MAGAZINE_AXIS.astAxis[1].Diag.stWarning;

astAlarmSource[9].eSource := E_ALARM_SOURCE.MAGAZINE_AXIS_2;
astAlarmSource[9].dwAlarmActive := GVL_MAGAZINE_AXIS.astAxis[2].Error.dwAlarmActive;
astAlarmSource[9].stWarning := GVL_MAGAZINE_AXIS.astAxis[2].Diag.stWarning;

astAlarmSource[10].eSource := E_ALARM_SOURCE.AXIS_X;
IF GVL_HMI.xModbusMode THEN astAlarmSource[10].dwAlarmActive := DWORD#0;
ELSE astAlarmSource[10].dwAlarmActive := GVL_AXIS.arrAxis[1].Error.dwAlarmActive; END_IF;
astAlarmSource[10].stWarning := GVL_AXIS.arrAxis[1].Diag.stWarning;

astAlarmSource[11].eSource := E_ALARM_SOURCE.AXIS_Y;
IF GVL_HMI.xModbusMode THEN astAlarmSource[11].dwAlarmActive := DWORD#0;
ELSE astAlarmSource[11].dwAlarmActive := GVL_AXIS.arrAxis[2].Error.dwAlarmActive; END_IF;
astAlarmSource[11].stWarning := GVL_AXIS.arrAxis[2].Diag.stWarning;

astAlarmSource[12].eSource := E_ALARM_SOURCE.AXIS_Z;
IF GVL_HMI.xModbusMode THEN astAlarmSource[12].dwAlarmActive := DWORD#0;
ELSE astAlarmSource[12].dwAlarmActive := GVL_AXIS.arrAxis[3].Error.dwAlarmActive; END_IF;
astAlarmSource[12].stWarning := GVL_AXIS.arrAxis[3].Diag.stWarning;

astAlarmSource[13].eSource := E_ALARM_SOURCE.AXIS_GROUP;
IF GVL_HMI.xModbusMode THEN astAlarmSource[13].dwAlarmActive := DWORD#0;
ELSE astAlarmSource[13].dwAlarmActive := GVL_AXIS_GROUP.AxisGroup.Error.dwAlarmActive; END_IF;
astAlarmSource[13].stWarning := GVL_AXIS_GROUP.AxisGroup.Diag.stWarning;

astAlarmSource[14].eSource := E_ALARM_SOURCE.MOTION_MANAGER;
IF GVL_HMI.xModbusMode THEN astAlarmSource[14].dwAlarmActive := DWORD#0;
ELSE astAlarmSource[14].dwAlarmActive := GVL_MOTION_MANAGER.stMotionManager.Error.dwAlarmActive; END_IF;
astAlarmSource[14].stWarning := GVL_MOTION_MANAGER.stMotionManager.Diag.stWarning;

astAlarmSource[15].eSource := E_ALARM_SOURCE.POINT_MANAGER;
IF GVL_HMI.xModbusMode THEN astAlarmSource[15].dwAlarmActive := DWORD#0;
ELSE astAlarmSource[15].dwAlarmActive := GVL_POINT_MANAGER.PointManager.Error.dwAlarmActive; END_IF;
astAlarmSource[15].stWarning := GVL_POINT_MANAGER.PointManager.Diag.stWarning;

astAlarmSource[16].eSource := E_ALARM_SOURCE.GRIPPER;
IF GVL_HMI.xModbusMode THEN astAlarmSource[16].dwAlarmActive := DWORD#0;
ELSE astAlarmSource[16].dwAlarmActive := GVL_ROBOT.GripperError.dwAlarmActive; END_IF;
astAlarmSource[16].stWarning := GVL_ROBOT.GripperDiag.stWarning;

ALARM_MANAGER(
	xResetWarnings := GVL_ALARM.Command.xResetWarnings,
	Sources := astAlarmSource,
	Status => GVL_ALARM.Status,
	Events => GVL_ALARM.Events
);
