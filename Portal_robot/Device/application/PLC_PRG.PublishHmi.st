METHOD PRIVATE PublishHmi

// --- BEGIN IMPLEMENTATION ---

// Единый снимок состояния для внешней визуализации.
GVL_HMI.udiPlcHeartbeat := GVL_HMI.udiPlcHeartbeat + 1;
GVL_HMI.xHmiConnectionAlive := xHmiConnectionAlive;
GVL_HMI.xManualRecoveryActive := xManualRecoveryActive;
GVL_HMI.xGlobalError := GVL_CELL_CONTROL.xGlobalError;
GVL_HMI.xCellManual := GVL_CELL_CONTROL.xManual;
GVL_HMI.xErrorSimulationEnabled := GVL_CELL_SETTINGS.xErrorSimulationEnabled;
GVL_HMI.xSimulationAccelerationActive := GVL_CELL_SETTINGS.xSimulationAccelerationActive;
GVL_HMI.xSimulationAccelerationChangeAllowed := GVL_CELL_SETTINGS.xSimulationAccelerationChangeAllowed;
GVL_HMI.uiSimulationTimeFactorApplied := GVL_CELL_SETTINGS.uiSimulationTimeFactorApplied;
GVL_HMI.xSimulationAccelerationError := GVL_CELL_SETTINGS.xSimulationAccelerationError;
GVL_HMI.lrSafetyHomeX := GVL_POINT.Points[E_POINT_NAME.HOME_SAFETY].X;
GVL_HMI.lrSafetyHomeY := GVL_POINT.Points[E_POINT_NAME.HOME_SAFETY].Y;
GVL_HMI.lrSafetyHomeZ := GVL_POINT.Points[E_POINT_NAME.HOME_SAFETY].Z;
GVL_HMI.lrSafetyHomeSpeedFactor := GVL_POINT.Points[E_POINT_NAME.HOME_SAFETY].SpeedFactor;
GVL_HMI.lrSafetyHomeToleranceX := GVL_CELL_SETTINGS.lrSafetyHomeToleranceX;
GVL_HMI.lrSafetyHomeToleranceY := GVL_CELL_SETTINGS.lrSafetyHomeToleranceY;
GVL_HMI.lrSafetyHomeToleranceZ := GVL_CELL_SETTINGS.lrSafetyHomeToleranceZ;
GVL_HMI.stCellMachineTimeouts := GVL_CELL_SETTINGS.stMachineTimeouts;
GVL_HMI.xCellSettingsChangeAllowed := GVL_CELL_SETTINGS.xCellSettingsChangeAllowed;
GVL_HMI.xPointTableReady := xPointTableReady;
FOR uiPointEditorIndex := UINT#1 TO INT_TO_UINT(GVL_POINT.iEditablePointCount) DO
	GVL_HMI.astPointEditorPoints[uiPointEditorIndex] :=
		GVL_POINT.astRetainPoints[uiPointEditorIndex];
END_FOR;
GVL_HMI.auiPointEditorPointId[1] := TO_UINT(E_POINT_NAME.MACHINE_1_ABOVE);
GVL_HMI.auiPointEditorPointId[2] := TO_UINT(E_POINT_NAME.MACHINE_1_INSIDE);
GVL_HMI.auiPointEditorPointId[3] := TO_UINT(E_POINT_NAME.MACHINE_1_CHUCK_APROACH);
GVL_HMI.auiPointEditorPointId[4] := TO_UINT(E_POINT_NAME.MACHINE_1_CHUCK_POSITION);
GVL_HMI.auiPointEditorPointId[5] := TO_UINT(E_POINT_NAME.MACHINE_2_ABOVE);
GVL_HMI.auiPointEditorPointId[6] := TO_UINT(E_POINT_NAME.MACHINE_2_INSIDE);
GVL_HMI.auiPointEditorPointId[7] := TO_UINT(E_POINT_NAME.MACHINE_2_CHUCK_APROACH);
GVL_HMI.auiPointEditorPointId[8] := TO_UINT(E_POINT_NAME.MACHINE_2_CHUCK_POSITION);
GVL_HMI.auiPointEditorPointId[9] := TO_UINT(E_POINT_NAME.MACHINE_3_ABOVE);
GVL_HMI.auiPointEditorPointId[10] := TO_UINT(E_POINT_NAME.MACHINE_3_INSIDE);
GVL_HMI.auiPointEditorPointId[11] := TO_UINT(E_POINT_NAME.MACHINE_3_CHUCK_APROACH);
GVL_HMI.auiPointEditorPointId[12] := TO_UINT(E_POINT_NAME.MACHINE_3_CHUCK_POSITION);
GVL_HMI.auiPointEditorPointId[13] := TO_UINT(E_POINT_NAME.HOME_SAFETY);
GVL_HMI.auiPointEditorPointId[14] := TO_UINT(E_POINT_NAME.MAGAZINE_1_DETAIL);
GVL_HMI.auiPointEditorPointId[15] := TO_UINT(E_POINT_NAME.MAGAZINE_2_DETAIL);
GVL_HMI.xModbusMode := GVL_ROBOT_MODBUS.xModeActive;
GVL_HMI.xRobotModeChangeAllowed := GVL_ROBOT_MODBUS.xRobotModeChangeAllowed;
GVL_HMI.xModbusSettingsChangeAllowed := GVL_ROBOT_MODBUS.xSettingsChangeAllowed;
GVL_HMI.stRobotModbusStatus := GVL_ROBOT_MODBUS.Status;
uiMagazine := GVL_CELL_MANAGER.Status.uiActiveMagazine;
IF (uiMagazine < UINT#1) OR (uiMagazine > UINT#2) THEN
	uiMagazine := UINT#1;
END_IF;
GVL_HMI.stTestObservability.udiAppliedScenarioSeq := GVL_HMI.udiTestScenarioAckSeq;
GVL_HMI.stTestObservability.uiCellState := TO_UINT(GVL_CELL_MANAGER.Diag.eState);
GVL_HMI.stTestObservability.uiRobotState := TO_UINT(GVL_ROBOT.Diag.eState);
GVL_HMI.stTestObservability.uiRobotAction := TO_UINT(GVL_ROBOT.Diag.eActiveAction);
GVL_HMI.stTestObservability.uiRobotPoint := TO_UINT(GVL_ROBOT.Diag.eActivePoint);
GVL_HMI.stTestObservability.uiMagazineState := TO_UINT(GVL_MAGAZINE.astDiag[uiMagazine].eState);
GVL_HMI.stTestObservability.uiMagazineOperation := TO_UINT(GVL_MAGAZINE.astStatus[uiMagazine].eActualOperation);
GVL_HMI.stTestObservability.uiTakeSlot := SINT_TO_UINT(GVL_MAGAZINE.astStatus[uiMagazine].iSelectedBlank);
GVL_HMI.stTestObservability.uiPutSlot := SINT_TO_UINT(GVL_MAGAZINE.astStatus[uiMagazine].iSelectedFreeSlot);
GVL_HMI.stTestObservability.uiSelectedMachine := GVL_CELL_MANAGER.Status.uiSelectedMachine;
GVL_HMI.stTestObservability.uiSelectedType := GVL_MULTI_TYPE.CycleStatus.uiSelectedType;
GVL_HMI.stTestObservability.uiErrorSource := UINT#0;
GVL_HMI.stTestObservability.dwErrorCode := DWORD#0;
FOR uiMachine := 1 TO 3 DO
	GVL_HMI.stTestObservability.auiMachineState[uiMachine] := TO_UINT(GVL_MACHINE.Diag[uiMachine].eState);
	GVL_HMI.stTestObservability.auiMachineOperation[uiMachine] := TO_UINT(GVL_MACHINE.Diag[uiMachine].eActualOperation);
END_FOR;
IF GVL_ROBOT.Error.dwErrorActive <> DWORD#0 THEN
	GVL_HMI.stTestObservability.uiErrorSource := UINT#2;
	GVL_HMI.stTestObservability.dwErrorCode := GVL_ROBOT.Error.dwErrorActive;
ELSIF GVL_MAGAZINE.astError[1].dwErrorActive <> DWORD#0 THEN
	GVL_HMI.stTestObservability.uiErrorSource := UINT#3;
GVL_HMI.stTestObservability.dwErrorCode := GVL_MAGAZINE.astError[1].dwErrorActive;
ELSIF GVL_MAGAZINE.astError[2].dwErrorActive <> DWORD#0 THEN
	GVL_HMI.stTestObservability.uiErrorSource := UINT#7;
	GVL_HMI.stTestObservability.dwErrorCode := GVL_MAGAZINE.astError[2].dwErrorActive;
ELSIF GVL_CELL_MANAGER.Error.dwErrorActive <> DWORD#0 THEN
	GVL_HMI.stTestObservability.uiErrorSource := UINT#1;
	GVL_HMI.stTestObservability.dwErrorCode := GVL_CELL_MANAGER.Error.dwErrorActive;
ELSE
	FOR uiMachine := 1 TO 3 DO
		IF GVL_MACHINE.Error[uiMachine].dwErrorActive <> DWORD#0 THEN
			GVL_HMI.stTestObservability.uiErrorSource := uiMachine + UINT#3;
			GVL_HMI.stTestObservability.dwErrorCode := GVL_MACHINE.Error[uiMachine].dwErrorActive;
		END_IF;
	END_FOR;
END_IF;
FOR uiMachine := 1 TO 9 DO
	GVL_HMI.auiRobotModbusWriteRegisters[uiMachine] :=
		GVL_ROBOT_MODBUS.auiWriteRegisters[uiMachine - 1];
END_FOR;
FOR uiMachine := 1 TO 17 DO
	GVL_HMI.auiRobotModbusReadRegisters[uiMachine] :=
		GVL_ROBOT_MODBUS.auiReadRegisters[uiMachine - 1];
END_FOR;
GVL_HMI.xSimAxisGroupErrorAllowed := GVL_AXIS_GROUP.AxisGroup.Status.xSimErrorAllowed;
GVL_HMI.astAxisFaultStatus[1] := AXIS_X.FaultStatus;
GVL_HMI.astAxisFaultStatus[2] := AXIS_Y.FaultStatus;
GVL_HMI.astAxisFaultStatus[3] := AXIS_Z.FaultStatus;
GVL_HMI.stAxisGroupFaultStatus := GROUP_XYZ.FaultStatus;
GVL_HMI.stGripperFaultStatus := ROBOT.FaultStatus.stGripper;
GVL_HMI.stRobotFaultStatus := ROBOT.FaultStatus.stRobot;
GVL_HMI.stCellFaultStatus := CELL_MANAGER.FaultStatus;
GVL_HMI.stPointFaultStatus := ROBOT.FaultStatus.stPoint;
GVL_HMI.stMagazineFaultStatus := fbMagazine1.FaultStatus;
GVL_HMI.astMagazineFaultStatus[1] := fbMagazine1.FaultStatus;
GVL_HMI.astMagazineFaultStatus[2] := fbMagazine2.FaultStatus;
GVL_HMI.rLoadCNC_1 := GVL_STATISTIC.stStatistic.stMachineStat.rLoadCNC_1;
GVL_HMI.rLoadCNC_2 := GVL_STATISTIC.stStatistic.stMachineStat.rLoadCNC_2;
GVL_HMI.rLoadCNC_3 := GVL_STATISTIC.stStatistic.stMachineStat.rLoadCNC_3;
GVL_HMI.rRobot := GVL_STATISTIC.stStatistic.stRobotStat.rRobot;

GVL_HMI.stCellStatus := GVL_CELL_MANAGER.Status;
GVL_HMI.stCellStatus.xResetAllowed := xAlarmResetAllowed;
GVL_HMI.stCellDiag := GVL_CELL_MANAGER.Diag;
GVL_HMI.stCellError := GVL_CELL_MANAGER.Error;
GVL_HMI.stMultiType.Config := GVL_MULTI_TYPE.Config;
GVL_HMI.stMultiType.ConfigStatus := GVL_MULTI_TYPE.ConfigStatus;
GVL_HMI.stMultiType.CycleStatus := GVL_MULTI_TYPE.CycleStatus;

GVL_HMI.stRobotStatus := GVL_ROBOT.Status;
GVL_HMI.stRobotDiag := GVL_ROBOT.Diag;
GVL_HMI.stRobotError := GVL_ROBOT.Error;
GVL_HMI.stGripperDiag := GVL_ROBOT.GripperDiag;
GVL_HMI.stGripperError := GVL_ROBOT.GripperError;
GVL_HMI.stAxisGroupStatus := GVL_AXIS_GROUP.AxisGroup.Status;
GVL_HMI.stAxisGroupDiag := GVL_AXIS_GROUP.AxisGroup.Diag;
GVL_HMI.stAxisGroupError := GVL_AXIS_GROUP.AxisGroup.Error;
GVL_HMI.stMotionManagerStatus := GVL_MOTION_MANAGER.stMotionManager.Status;
GVL_HMI.stMotionManagerDiag := GVL_MOTION_MANAGER.stMotionManager.Diag;
GVL_HMI.stMotionManagerError := GVL_MOTION_MANAGER.stMotionManager.Error;
GVL_HMI.stPointManagerStatus := GVL_POINT_MANAGER.PointManager.Status;
GVL_HMI.stPointManagerDiag := GVL_POINT_MANAGER.PointManager.Diag;
GVL_HMI.stPointManagerError := GVL_POINT_MANAGER.PointManager.Error;

FOR uiMachine := 1 TO 3 DO
	GVL_HMI.astAxisStatus[uiMachine] := GVL_AXIS.arrAxis[uiMachine].Status;
	GVL_HMI.astAxisDiag[uiMachine] := GVL_AXIS.arrAxis[uiMachine].Diag;
	GVL_HMI.astAxisError[uiMachine] := GVL_AXIS.arrAxis[uiMachine].Error;
END_FOR;

GVL_HMI.stMagazineStatus := GVL_MAGAZINE.astStatus[1];
GVL_HMI.stMagazineDiag := GVL_MAGAZINE.astDiag[1];
GVL_HMI.stMagazineError := GVL_MAGAZINE.astError[1];
FOR uiMagazine := UINT#1 TO UINT#2 DO
	GVL_HMI.astMagazineStatus[uiMagazine] := GVL_MAGAZINE.astStatus[uiMagazine];
	GVL_HMI.astMagazineDiag[uiMagazine] := GVL_MAGAZINE.astDiag[uiMagazine];
	GVL_HMI.astMagazineError[uiMagazine] := GVL_MAGAZINE.astError[uiMagazine];
	GVL_HMI.astMagazineInventory[uiMagazine] := GVL_DETAIL.astMagazine[uiMagazine];
	GVL_HMI.astMagazineAxisStatus[uiMagazine] := GVL_MAGAZINE_AXIS.astAxis[uiMagazine].Status;
	GVL_HMI.astMagazineAxisDiag[uiMagazine] := GVL_MAGAZINE_AXIS.astAxis[uiMagazine].Diag;
	GVL_HMI.astMagazineAxisError[uiMagazine] := GVL_MAGAZINE_AXIS.astAxis[uiMagazine].Error;
END_FOR;
GVL_HMI.stAlarmStatus := GVL_ALARM.Status;
GVL_HMI.astAlarmEvent := GVL_ALARM.Events;

FOR uiMachine := 1 TO 3 DO
	GVL_HMI.astMachineStatus[uiMachine] := GVL_MACHINE.Status[uiMachine];
	GVL_HMI.astMachineDiag[uiMachine] := GVL_MACHINE.Diag[uiMachine];
	GVL_HMI.astMachineError[uiMachine] := GVL_MACHINE.Error[uiMachine];
	CASE uiMachine OF
		1:
			GVL_HMI.astMachineFaultStatus[uiMachine] := MACHINE_1_FAULT.Status;
			GVL_HMI.astMachineFaultStatus[uiMachine].xResetAllowed :=
				MACHINE_1_SIM.Diag.xResetAllowed OR GVL_MACHINE.Status[uiMachine].xResetAllowed;
		2:
			GVL_HMI.astMachineFaultStatus[uiMachine] := MACHINE_2_FAULT.Status;
			GVL_HMI.astMachineFaultStatus[uiMachine].xResetAllowed :=
				MACHINE_2_SIM.Diag.xResetAllowed OR GVL_MACHINE.Status[uiMachine].xResetAllowed;
		3:
			GVL_HMI.astMachineFaultStatus[uiMachine] := MACHINE_3_FAULT.Status;
			GVL_HMI.astMachineFaultStatus[uiMachine].xResetAllowed :=
				MACHINE_3_SIM.Diag.xResetAllowed OR GVL_MACHINE.Status[uiMachine].xResetAllowed;
	END_CASE;
END_FOR;

GVL_HMI.astMachineIoStatus[1] := MACHINE_1_FAULT.MachineStatus;
GVL_HMI.astMachineIoStatus[2] := MACHINE_2_FAULT.MachineStatus;
GVL_HMI.astMachineIoStatus[3] := MACHINE_3_FAULT.MachineStatus;
GVL_HMI.astMachineRawIoStatus[1] := MACHINE_1_SIM.Status;
GVL_HMI.astMachineRawIoStatus[2] := MACHINE_2_SIM.Status;
GVL_HMI.astMachineRawIoStatus[3] := MACHINE_3_SIM.Status;
GVL_HMI.astMachineTimeouts[1] := MACHINE_1_FAULT.Timeouts;
GVL_HMI.astMachineTimeouts[2] := MACHINE_2_FAULT.Timeouts;
GVL_HMI.astMachineTimeouts[3] := MACHINE_3_FAULT.Timeouts;
GVL_HMI.astMachineSimDiag[1] := MACHINE_1_SIM.Diag;
GVL_HMI.astMachineSimDiag[2] := MACHINE_2_SIM.Diag;
GVL_HMI.astMachineSimDiag[3] := MACHINE_3_SIM.Diag;
GVL_HMI.astMachineSimError[1] := MACHINE_1_SIM.Error;
GVL_HMI.astMachineSimError[2] := MACHINE_2_SIM.Error;
GVL_HMI.astMachineSimError[3] := MACHINE_3_SIM.Error;

FOR iDetail := 1 TO GVL_CELL_SETTINGS.NumberDetail DO
	GVL_HMI.astMagazineSlot[iDetail] := GVL_DETAIL.astMagazine[1].aZone2[iDetail];
END_FOR;
