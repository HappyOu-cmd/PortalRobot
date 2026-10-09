METHOD PRIVATE WritePhysicalOutputs

// --- BEGIN IMPLEMENTATION ---

// Единственная страница назначения выходов. Выполняется после всех владельцев команд.
// Не публикуем команды симулятора на железо при смене среды в текущем скане.
xPhysicalOutputEnable := GVL_PHYSICAL_IO.xNormalActive
	AND (GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.NORMAL);
IF xPhysicalOutputEnable THEN
	FOR uiMachine := 1 TO 3 DO
		IF GVL_MACHINE.Command[uiMachine].stIo.xCloseDoor
		AND NOT GVL_MACHINE.Command[uiMachine].stIo.xOpenDoor THEN
			GVL_PHYSICAL_IO.axMachineHatchClose[uiMachine] := TRUE;
		ELSIF GVL_MACHINE.Command[uiMachine].stIo.xOpenDoor
		AND NOT GVL_MACHINE.Command[uiMachine].stIo.xCloseDoor THEN
			GVL_PHYSICAL_IO.axMachineHatchClose[uiMachine] := FALSE;
		ELSIF NOT xPhysicalOutputWasEnabled THEN
			GVL_PHYSICAL_IO.axMachineHatchClose[uiMachine] := GVL_MACHINE.astPhysicalInput[uiMachine].xDoorClosed;
		END_IF;
	END_FOR;
	IF NOT GVL_HMI.xModbusMode AND GVL_PHYSICAL_IO.stGripperCommand.xExecute THEN
		CASE GVL_PHYSICAL_IO.stGripperCommand.eAction OF
			E_ROBOT_ACTION.UNCLAMP_1: axIoGripperBase[1] := TRUE;
			E_ROBOT_ACTION.CLAMP_1: axIoGripperBase[1] := FALSE;
			E_ROBOT_ACTION.UNCLAMP_2: axIoGripperBase[2] := TRUE;
			E_ROBOT_ACTION.CLAMP_2: axIoGripperBase[2] := FALSE;
			E_ROBOT_ACTION.ROTATE_TO_BLANK: axIoGripperBase[3] := FALSE;
			E_ROBOT_ACTION.ROTATE_TO_DETAIL: axIoGripperBase[3] := TRUE;
		END_CASE;
	END_IF;
END_IF;
// Внешний SC-500 остаётся единственным владельцем захватов в Modbus.
IF NOT xPhysicalOutputEnable OR GVL_HMI.xModbusMode THEN
	axIoGripperBase[1] := FALSE;
	axIoGripperBase[2] := FALSE;
	axIoGripperBase[3] := FALSE;
END_IF;
GVL_PHYSICAL_IO.xDoGripper1Open := axIoGripperBase[1];
GVL_PHYSICAL_IO.xDoGripper2Open := axIoGripperBase[2];
GVL_PHYSICAL_IO.xDoRotateToDetail := axIoGripperBase[3];

GVL_PHYSICAL_IO.xDoMachine1HatchClosed := xPhysicalOutputEnable AND GVL_PHYSICAL_IO.axMachineHatchClose[1];
GVL_PHYSICAL_IO.xDoMachine1HatchUnLock := xPhysicalOutputEnable AND GVL_MACHINE.Command[1].stIo.xHatchUnLock;
GVL_PHYSICAL_IO.xDoMachine1ClampChuck := xPhysicalOutputEnable AND GVL_MACHINE.Command[1].stIo.xClampChuck AND NOT GVL_MACHINE.Command[1].stIo.xUnclampChuck;
GVL_PHYSICAL_IO.xDoMachine1UnclampChuck := xPhysicalOutputEnable AND GVL_MACHINE.Command[1].stIo.xUnclampChuck AND NOT GVL_MACHINE.Command[1].stIo.xClampChuck;
GVL_PHYSICAL_IO.xDoMachine1StartCycle := xPhysicalOutputEnable AND GVL_MACHINE.Command[1].stIo.xStartCycle;
GVL_PHYSICAL_IO.xDoMachine2HatchClosed := xPhysicalOutputEnable AND GVL_PHYSICAL_IO.axMachineHatchClose[2];
GVL_PHYSICAL_IO.xDoMachine2HatchUnLock := xPhysicalOutputEnable AND GVL_MACHINE.Command[2].stIo.xHatchUnLock;
GVL_PHYSICAL_IO.xDoMachine2ClampChuck := xPhysicalOutputEnable AND GVL_MACHINE.Command[2].stIo.xClampChuck AND NOT GVL_MACHINE.Command[2].stIo.xUnclampChuck;
GVL_PHYSICAL_IO.xDoMachine2UnclampChuck := xPhysicalOutputEnable AND GVL_MACHINE.Command[2].stIo.xUnclampChuck AND NOT GVL_MACHINE.Command[2].stIo.xClampChuck;
GVL_PHYSICAL_IO.xDoMachine2StartCycle := xPhysicalOutputEnable AND GVL_MACHINE.Command[2].stIo.xStartCycle;
GVL_PHYSICAL_IO.xDoMachine3HatchClosed := xPhysicalOutputEnable AND GVL_PHYSICAL_IO.axMachineHatchClose[3];
GVL_PHYSICAL_IO.xDoMachine3HatchUnLock := xPhysicalOutputEnable AND GVL_MACHINE.Command[3].stIo.xHatchUnLock;
GVL_PHYSICAL_IO.xDoMachine3ClampChuck := xPhysicalOutputEnable AND GVL_MACHINE.Command[3].stIo.xClampChuck AND NOT GVL_MACHINE.Command[3].stIo.xUnclampChuck;
GVL_PHYSICAL_IO.xDoMachine3UnclampChuck := xPhysicalOutputEnable AND GVL_MACHINE.Command[3].stIo.xUnclampChuck AND NOT GVL_MACHINE.Command[3].stIo.xClampChuck;
GVL_PHYSICAL_IO.xDoMachine3StartCycle := xPhysicalOutputEnable AND GVL_MACHINE.Command[3].stIo.xStartCycle;
GVL_PHYSICAL_IO.xDoDoor1Unlock := xPhysicalOutputEnable AND GVL_CELL_SAFETY_IO.axDoorUnlockOutput[1];
GVL_PHYSICAL_IO.xDoDoor2Unlock := xPhysicalOutputEnable AND GVL_CELL_SAFETY_IO.axDoorUnlockOutput[2];
GVL_PHYSICAL_IO.xDoDoor3Unlock := xPhysicalOutputEnable AND GVL_CELL_SAFETY_IO.axDoorUnlockOutput[3];
GVL_PHYSICAL_IO.xDoDoor4Unlock := xPhysicalOutputEnable AND GVL_CELL_SAFETY_IO.axDoorUnlockOutput[4];
GVL_PHYSICAL_IO.xDoSafetyRelayReset := xPhysicalOutputEnable AND GVL_CELL_SAFETY_IO.xSafetyRelayResetOutput;
GVL_PHYSICAL_IO.xDoSignalTowerGreenOutput := xPhysicalOutputEnable AND GVL_CELL_SAFETY_IO.xSignalTowerGreenOutput;
GVL_PHYSICAL_IO.xDoSignalTowerAmberOutput := xPhysicalOutputEnable AND GVL_CELL_SAFETY_IO.xSignalTowerAmberOutput;
GVL_PHYSICAL_IO.xDoSignalTowerRedOutput := xPhysicalOutputEnable AND GVL_CELL_SAFETY_IO.xSignalTowerRedOutput;
GVL_PHYSICAL_IO.xDoDoor1ButtonLamp := xPhysicalOutputEnable AND GVL_CELL_SAFETY_IO.axDoorButtonLampOutput[1];
GVL_PHYSICAL_IO.xDoDoor2ButtonLamp := xPhysicalOutputEnable AND GVL_CELL_SAFETY_IO.axDoorButtonLampOutput[2];
GVL_PHYSICAL_IO.xDoDoor3ButtonLamp := xPhysicalOutputEnable AND GVL_CELL_SAFETY_IO.axDoorButtonLampOutput[3];
GVL_PHYSICAL_IO.xDoDoor4ButtonLamp := xPhysicalOutputEnable AND GVL_CELL_SAFETY_IO.axDoorButtonLampOutput[4];
GVL_PHYSICAL_IO.xDoMagazine1LockIn := xPhysicalOutputEnable AND (GVL_TWO_PALLET.uiMode = UINT#1) AND GVL_TWO_PALLET.astOutput[1].xLockIn AND NOT GVL_TWO_PALLET.astOutput[1].xLockOut;
GVL_PHYSICAL_IO.xDoMagazine1LockOut := xPhysicalOutputEnable AND (GVL_TWO_PALLET.uiMode = UINT#1) AND GVL_TWO_PALLET.astOutput[1].xLockOut AND NOT GVL_TWO_PALLET.astOutput[1].xLockIn;
GVL_PHYSICAL_IO.xDoMagazine1StopIn := xPhysicalOutputEnable AND (GVL_TWO_PALLET.uiMode = UINT#1) AND GVL_TWO_PALLET.astOutput[1].xStopIn AND NOT GVL_TWO_PALLET.astOutput[1].xStopOut;
GVL_PHYSICAL_IO.xDoMagazine1StopOut := xPhysicalOutputEnable AND (GVL_TWO_PALLET.uiMode = UINT#1) AND GVL_TWO_PALLET.astOutput[1].xStopOut AND NOT GVL_TWO_PALLET.astOutput[1].xStopIn;
GVL_PHYSICAL_IO.xDoMagazine1LiftUp := xPhysicalOutputEnable AND (GVL_TWO_PALLET.uiMode = UINT#1) AND GVL_TWO_PALLET.astOutput[1].xLiftUp AND NOT GVL_TWO_PALLET.astOutput[1].xLiftDown;
GVL_PHYSICAL_IO.xDoMagazine1LiftDown := xPhysicalOutputEnable AND (GVL_TWO_PALLET.uiMode = UINT#1) AND GVL_TWO_PALLET.astOutput[1].xLiftDown AND NOT GVL_TWO_PALLET.astOutput[1].xLiftUp;
GVL_PHYSICAL_IO.xDoMagazine2LockIn := xPhysicalOutputEnable AND (GVL_TWO_PALLET.uiMode = UINT#1) AND GVL_TWO_PALLET.astOutput[2].xLockIn AND NOT GVL_TWO_PALLET.astOutput[2].xLockOut;
GVL_PHYSICAL_IO.xDoMagazine2LockOut := xPhysicalOutputEnable AND (GVL_TWO_PALLET.uiMode = UINT#1) AND GVL_TWO_PALLET.astOutput[2].xLockOut AND NOT GVL_TWO_PALLET.astOutput[2].xLockIn;
GVL_PHYSICAL_IO.xDoMagazine2StopIn := xPhysicalOutputEnable AND (GVL_TWO_PALLET.uiMode = UINT#1) AND GVL_TWO_PALLET.astOutput[2].xStopIn AND NOT GVL_TWO_PALLET.astOutput[2].xStopOut;
GVL_PHYSICAL_IO.xDoMagazine2StopOut := xPhysicalOutputEnable AND (GVL_TWO_PALLET.uiMode = UINT#1) AND GVL_TWO_PALLET.astOutput[2].xStopOut AND NOT GVL_TWO_PALLET.astOutput[2].xStopIn;
GVL_PHYSICAL_IO.xDoMagazine2LiftUp := xPhysicalOutputEnable AND (GVL_TWO_PALLET.uiMode = UINT#1) AND GVL_TWO_PALLET.astOutput[2].xLiftUp AND NOT GVL_TWO_PALLET.astOutput[2].xLiftDown;
GVL_PHYSICAL_IO.xDoMagazine2LiftDown := xPhysicalOutputEnable AND (GVL_TWO_PALLET.uiMode = UINT#1) AND GVL_TWO_PALLET.astOutput[2].xLiftDown AND NOT GVL_TWO_PALLET.astOutput[2].xLiftUp;


GVL_PHYSICAL_IO.xDoCellAlarmHorn := xPhysicalOutputEnable AND GVL_CELL_SAFETY_IO.xAlarmHornOutput;
GVL_PHYSICAL_IO.xDoGk1DriveRun := xPhysicalOutputEnable AND GEOMETRY[1].xRunOutput;
GVL_PHYSICAL_IO.xDoGk1DriveReset := xPhysicalOutputEnable AND GEOMETRY[1].xResetOutput;

GVL_PHYSICAL_IO.xDoGk2DriveRun := xPhysicalOutputEnable AND GEOMETRY[2].xRunOutput;
GVL_PHYSICAL_IO.xDoGk2DriveReset := xPhysicalOutputEnable AND GEOMETRY[2].xResetOutput;

ApplyIoOutputOverrides();

xPhysicalOutputWasEnabled := xPhysicalOutputEnable;
