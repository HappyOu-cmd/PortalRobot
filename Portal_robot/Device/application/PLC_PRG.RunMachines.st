METHOD PRIVATE RunMachines

// --- BEGIN IMPLEMENTATION ---

// Импульсные команды HMI изменяют сохранённое разрешение работы станка.
FOR uiMachine := 1 TO 3 DO
	IF GVL_HMI.axMachineDisable[uiMachine] THEN
		GVL_HMI.axMachineUsed[uiMachine] := FALSE;
	ELSIF GVL_HMI.axMachineEnable[uiMachine] THEN
		GVL_HMI.axMachineUsed[uiMachine] := TRUE;
	END_IF;
END_FOR;


MACHINE_1.stPoints.eAbove := E_POINT_NAME.MACHINE_1_ABOVE;
MACHINE_1.stPoints.eChuck := E_POINT_NAME.MACHINE_1_CHUCK_POSITION;
MACHINE_1.stPoints.eChuckApproach := E_POINT_NAME.MACHINE_1_CHUCK_APROACH;
MACHINE_1.stPoints.eInside := E_POINT_NAME.MACHINE_1_INSIDE;
MACHINE_1.stPoints.eNone := E_POINT_NAME.NONE;

// Виртуальные устройства исполняют команду предыдущего цикла. Затем слой
// инъекции формирует обратную связь, которую увидит технологический автомат.
MACHINE_1_SIM(
	xTestInitialize := xTestInitializePulse,
	uiTestInitialState := GVL_HMI.stTestScenario.auiMachineState[1],
	xSafetyDoorOpen := GVL_CELL_SETTINGS.xErrorSimulationEnabled
		AND GVL_HMI.axMachineSimSafetyDoorOpen[1],
	Command := GVL_MACHINE.Command[1].stIo,
	FaultRequest := astMachineFaultRequest[1],
	xSimulationAccelerationEnable := GVL_CELL_SETTINGS.xSimulationAccelerationActive,
	uiSimulationTimeFactor := GVL_CELL_SETTINGS.uiSimulationTimeFactorApplied,
	tDoorOpenTime := GVL_HMI.tMachineDoorOpenTime,
	tDoorCloseTime := GVL_HMI.tMachineDoorCloseTime,
	tChuckOpenTime := GVL_HMI.tMachineChuckOpenTime,
	tChuckCloseTime := GVL_HMI.tMachineChuckCloseTime,
	tCycleTime := GVL_HMI.tMachineCycleTime[1]
);
MACHINE_2_SIM(
	xTestInitialize := xTestInitializePulse,
	uiTestInitialState := GVL_HMI.stTestScenario.auiMachineState[2],
	xSafetyDoorOpen := GVL_CELL_SETTINGS.xErrorSimulationEnabled
		AND GVL_HMI.axMachineSimSafetyDoorOpen[2],
	Command := GVL_MACHINE.Command[2].stIo,
	FaultRequest := astMachineFaultRequest[2],
	xSimulationAccelerationEnable := GVL_CELL_SETTINGS.xSimulationAccelerationActive,
	uiSimulationTimeFactor := GVL_CELL_SETTINGS.uiSimulationTimeFactorApplied,
	tDoorOpenTime := GVL_HMI.tMachineDoorOpenTime,
	tDoorCloseTime := GVL_HMI.tMachineDoorCloseTime,
	tChuckOpenTime := GVL_HMI.tMachineChuckOpenTime,
	tChuckCloseTime := GVL_HMI.tMachineChuckCloseTime,
	tCycleTime := GVL_HMI.tMachineCycleTime[2]
);
MACHINE_3_SIM(
	xTestInitialize := xTestInitializePulse,
	uiTestInitialState := GVL_HMI.stTestScenario.auiMachineState[3],
	xSafetyDoorOpen := GVL_CELL_SETTINGS.xErrorSimulationEnabled
		AND GVL_HMI.axMachineSimSafetyDoorOpen[3],
	Command := GVL_MACHINE.Command[3].stIo,
	FaultRequest := astMachineFaultRequest[3],
	xSimulationAccelerationEnable := GVL_CELL_SETTINGS.xSimulationAccelerationActive,
	uiSimulationTimeFactor := GVL_CELL_SETTINGS.uiSimulationTimeFactorApplied,
	tDoorOpenTime := GVL_HMI.tMachineDoorOpenTime,
	tDoorCloseTime := GVL_HMI.tMachineDoorCloseTime,
	tChuckOpenTime := GVL_HMI.tMachineChuckOpenTime,
	tChuckCloseTime := GVL_HMI.tMachineChuckCloseTime,
	tCycleTime := GVL_HMI.tMachineCycleTime[3]
);

MACHINE_1_FAULT(
	Request := astMachineFaultRequest[1],
	MachineStatusRaw := MACHINE_1_SIM.Status,
	RobotStatusRaw := GVL_ROBOT.Status,
	NominalTimeouts := GVL_CELL_SETTINGS.stMachineTimeouts
);
MACHINE_2_FAULT(
	Request := astMachineFaultRequest[2],
	MachineStatusRaw := MACHINE_2_SIM.Status,
	RobotStatusRaw := GVL_ROBOT.Status,
	NominalTimeouts := GVL_CELL_SETTINGS.stMachineTimeouts
);
MACHINE_3_FAULT(
	Request := astMachineFaultRequest[3],
	MachineStatusRaw := MACHINE_3_SIM.Status,
	RobotStatusRaw := GVL_ROBOT.Status,
	NominalTimeouts := GVL_CELL_SETTINGS.stMachineTimeouts
);

MACHINE_1(
	xTestInitialize := xTestInitializePulse,
	uiTestInitialState := GVL_HMI.stTestScenario.auiMachineState[1],
	uiTestProductType := GVL_HMI.stTestScenario.auiMachineType[1],
	xExecute := GVL_CELL_MANAGER.Command.axMachineExecute[1],
	xReset := GVL_HMI.axMachineReset[1],
	xResetGlobal := GVL_CELL_CONTROL.xReset,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xManualMode := GVL_CELL_CONTROL.xManual,
	xAutomaticUseEnabled := GVL_HMI.axMachineUsed[1],
	xHmiOpenSafetyDoor := GVL_HMI.axMachineManualSafetyDoorOpen[1],
	xHmiCloseSafetyDoor := GVL_HMI.axMachineManualSafetyDoorClose[1],
	xHmiOpenHatch := GVL_HMI.axMachineManualHatchOpen[1],
	xHmiCloseHatch := GVL_HMI.axMachineManualHatchClose[1],
	xHmiOpenChuck := GVL_HMI.axMachineManualChuckOpen[1],
	xHmiCloseChuck := GVL_HMI.axMachineManualChuckClose[1],
	xHmiEnable := GVL_HMI.axMachineEnable[1] AND GVL_HMI.axMachineUsed[1],
	xHmiDisable := GVL_HMI.axMachineDisable[1],
	xHmiSetBlank := GVL_HMI.axMachineSetBlank[1],
	xHmiSetDetail := GVL_HMI.axMachineSetDetail[1],
	xHmiAcceptDoor := GVL_HMI.axMachineAcceptDoor[1],
	xHmiRejectDoor := GVL_HMI.axMachineRejectDoor[1],
	xHmiAcceptRunCNC := GVL_HMI.axMachineAcceptRun[1],
	xHmiRejectRunCNC := GVL_HMI.axMachineRejectRun[1],
	xUseHmiCycleTime := GVL_HMI.xUseHmiCycleTime[1],
	tHmiCycleTime := GVL_HMI.tMachineCycleTime[1],
	stTimeouts := MACHINE_1_FAULT.Timeouts,
	stChangeRecipe := GVL_CELL_SETTINGS.CHANGE_MACHINE,
	stLoadRecipe := GVL_CELL_SETTINGS.LOAD_MACHINE,
	stUnloadRecipe := GVL_CELL_SETTINGS.UNLOAD_MACHINE,
	stMachineStatus := MACHINE_1_FAULT.MachineStatus,
	stRobotStatus := MACHINE_1_FAULT.RobotStatus,
	Command => GVL_MACHINE.Command[1],
	Status => GVL_MACHINE.Status[1],
	Diag => GVL_MACHINE.Diag[1],
	Error => GVL_MACHINE.Error[1]
);

MACHINE_2.stPoints.eAbove := E_POINT_NAME.MACHINE_2_ABOVE;
MACHINE_2.stPoints.eChuck := E_POINT_NAME.MACHINE_2_CHUCK_POSITION;
MACHINE_2.stPoints.eChuckApproach := E_POINT_NAME.MACHINE_2_CHUCK_APROACH;
MACHINE_2.stPoints.eInside := E_POINT_NAME.MACHINE_2_INSIDE;
MACHINE_2.stPoints.eNone := E_POINT_NAME.NONE;

MACHINE_2(
	xTestInitialize := xTestInitializePulse,
	uiTestInitialState := GVL_HMI.stTestScenario.auiMachineState[2],
	uiTestProductType := GVL_HMI.stTestScenario.auiMachineType[2],
	xExecute := GVL_CELL_MANAGER.Command.axMachineExecute[2],
	xReset := GVL_HMI.axMachineReset[2],
	xResetGlobal := GVL_CELL_CONTROL.xReset,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xManualMode := GVL_CELL_CONTROL.xManual,
	xAutomaticUseEnabled := GVL_HMI.axMachineUsed[2],
	xHmiOpenSafetyDoor := GVL_HMI.axMachineManualSafetyDoorOpen[2],
	xHmiCloseSafetyDoor := GVL_HMI.axMachineManualSafetyDoorClose[2],
	xHmiOpenHatch := GVL_HMI.axMachineManualHatchOpen[2],
	xHmiCloseHatch := GVL_HMI.axMachineManualHatchClose[2],
	xHmiOpenChuck := GVL_HMI.axMachineManualChuckOpen[2],
	xHmiCloseChuck := GVL_HMI.axMachineManualChuckClose[2],
	xHmiEnable := GVL_HMI.axMachineEnable[2] AND GVL_HMI.axMachineUsed[2],
	xHmiDisable := GVL_HMI.axMachineDisable[2],
	xHmiSetBlank := GVL_HMI.axMachineSetBlank[2],
	xHmiSetDetail := GVL_HMI.axMachineSetDetail[2],
	xHmiAcceptDoor := GVL_HMI.axMachineAcceptDoor[2],
	xHmiRejectDoor := GVL_HMI.axMachineRejectDoor[2],
	xHmiAcceptRunCNC := GVL_HMI.axMachineAcceptRun[2],
	xHmiRejectRunCNC := GVL_HMI.axMachineRejectRun[2],
	xUseHmiCycleTime := GVL_HMI.xUseHmiCycleTime[2],
	tHmiCycleTime := GVL_HMI.tMachineCycleTime[2],
	stTimeouts := MACHINE_2_FAULT.Timeouts,
	stChangeRecipe := GVL_CELL_SETTINGS.CHANGE_MACHINE,
	stLoadRecipe := GVL_CELL_SETTINGS.LOAD_MACHINE,
	stUnloadRecipe := GVL_CELL_SETTINGS.UNLOAD_MACHINE,
	stMachineStatus := MACHINE_2_FAULT.MachineStatus,
	stRobotStatus := MACHINE_2_FAULT.RobotStatus,
	Command => GVL_MACHINE.Command[2],
	Status => GVL_MACHINE.Status[2],
	Diag => GVL_MACHINE.Diag[2],
	Error => GVL_MACHINE.Error[2]
);

MACHINE_3.stPoints.eAbove := E_POINT_NAME.MACHINE_3_ABOVE;
MACHINE_3.stPoints.eChuck := E_POINT_NAME.MACHINE_3_CHUCK_POSITION;
MACHINE_3.stPoints.eChuckApproach := E_POINT_NAME.MACHINE_3_CHUCK_APROACH;
MACHINE_3.stPoints.eInside := E_POINT_NAME.MACHINE_3_INSIDE;
MACHINE_3.stPoints.eNone := E_POINT_NAME.NONE;

MACHINE_3(
	xTestInitialize := xTestInitializePulse,
	uiTestInitialState := GVL_HMI.stTestScenario.auiMachineState[3],
	uiTestProductType := GVL_HMI.stTestScenario.auiMachineType[3],
	xExecute := GVL_CELL_MANAGER.Command.axMachineExecute[3],
	xReset := GVL_HMI.axMachineReset[3],
	xResetGlobal := GVL_CELL_CONTROL.xReset,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xManualMode := GVL_CELL_CONTROL.xManual,
	xAutomaticUseEnabled := GVL_HMI.axMachineUsed[3],
	xHmiOpenSafetyDoor := GVL_HMI.axMachineManualSafetyDoorOpen[3],
	xHmiCloseSafetyDoor := GVL_HMI.axMachineManualSafetyDoorClose[3],
	xHmiOpenHatch := GVL_HMI.axMachineManualHatchOpen[3],
	xHmiCloseHatch := GVL_HMI.axMachineManualHatchClose[3],
	xHmiOpenChuck := GVL_HMI.axMachineManualChuckOpen[3],
	xHmiCloseChuck := GVL_HMI.axMachineManualChuckClose[3],
	xHmiEnable := GVL_HMI.axMachineEnable[3] AND GVL_HMI.axMachineUsed[3],
	xHmiDisable := GVL_HMI.axMachineDisable[3],
	xHmiSetBlank := GVL_HMI.axMachineSetBlank[3],
	xHmiSetDetail := GVL_HMI.axMachineSetDetail[3],
	xHmiAcceptDoor := GVL_HMI.axMachineAcceptDoor[3],
	xHmiRejectDoor := GVL_HMI.axMachineRejectDoor[3],
	xHmiAcceptRunCNC := GVL_HMI.axMachineAcceptRun[3],
	xHmiRejectRunCNC := GVL_HMI.axMachineRejectRun[3],
	xUseHmiCycleTime := GVL_HMI.xUseHmiCycleTime[3],
	tHmiCycleTime := GVL_HMI.tMachineCycleTime[3],
	stTimeouts := MACHINE_3_FAULT.Timeouts,
	stChangeRecipe := GVL_CELL_SETTINGS.CHANGE_MACHINE,
	stLoadRecipe := GVL_CELL_SETTINGS.LOAD_MACHINE,
	stUnloadRecipe := GVL_CELL_SETTINGS.UNLOAD_MACHINE,
	stMachineStatus := MACHINE_3_FAULT.MachineStatus,
	stRobotStatus := MACHINE_3_FAULT.RobotStatus,
	Command => GVL_MACHINE.Command[3],
	Status => GVL_MACHINE.Status[3],
	Diag => GVL_MACHINE.Diag[3],
	Error => GVL_MACHINE.Error[3]
);

// Публичный IO-снимок совпадает с обратной связью, которую анализирует FB_MACHINE.
GVL_MACHINE.Status[1].stIo := MACHINE_1_FAULT.MachineStatus;
GVL_MACHINE.Status[2].stIo := MACHINE_2_FAULT.MachineStatus;
GVL_MACHINE.Status[3].stIo := MACHINE_3_FAULT.MachineStatus;
