PROGRAM PLC_PRG
VAR
	AXIS_X         : FB_AXIS; // Управление осью X
	AXIS_Y         : FB_AXIS; // Управление осью Y
	AXIS_Z         : FB_AXIS; // Управление осью Z
	GROUP_XYZ      : FB_AXIS_GROUP; // Управление группой осей XYZ
	MOTION_MANAGER : FB_MOTION_MANAGER; // Менеджер движения по именованным точкам
	MACHINE_1      : FB_MACHINE; // Логика первого станка
	MACHINE_2      : FB_MACHINE; // Логика второго станка
	MACHINE_3      : FB_MACHINE; // Логика третьего станка
	MACHINE_1_SIM  : FB_MACHINE_SIMULATION; // Симуляция первого станка
	MACHINE_2_SIM  : FB_MACHINE_SIMULATION; // Симуляция второго станка
	MACHINE_3_SIM  : FB_MACHINE_SIMULATION; // Симуляция третьего станка
	MAGAZINE       : FB_MAGAZINE; // Управление магазином деталей
	ROBOT          : FB_ROBOT; // Координация движений и захвата робота
	CELL_MANAGER   : FB_CELL_MANAGER; // Автоматический цикл ячейки
	uiMachine      : UINT; // Индекс станка при обработке команд HMI
	iDetail        : SINT; // Индекс слота при передаче состояния магазина в HMI
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Глобальные команды ячейки поступают через единый интерфейс HMI.
GVL_CELL_CONTROL.xEnable := GVL_HMI.xCellEnable;
GVL_CELL_CONTROL.xDisable := GVL_HMI.xCellDisable;
GVL_CELL_CONTROL.xStart := GVL_HMI.xCellStart;
GVL_CELL_CONTROL.xStop := GVL_HMI.xCellStop;
GVL_CELL_CONTROL.xReset := GVL_HMI.xCellReset;
GVL_CELL_CONTROL.xManual := GVL_HMI.xCellManual;

// =============================================================================
// ТОЧКИ СТАНКА 1
// =============================================================================
//Над станком 1
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_ABOVE].X := 1920;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_ABOVE].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_ABOVE].Z := 0;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_ABOVE].SpeedFactor := 1.0;

//В станке 1
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_INSIDE].X := 1920;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_INSIDE].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_INSIDE].Z := 800;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_INSIDE].SpeedFactor := 1.0;

//У патрона 1
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_APROACH].X := 1920;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_APROACH].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_APROACH].Z := 1680;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_APROACH].SpeedFactor := 1.0;

//В патроне 1 
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_POSITION].X := 1700;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_POSITION].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_POSITION].Z := 1680;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_POSITION].SpeedFactor := 1.0;

// =============================================================================
// ТОЧКИ СТАНКА 2
// =============================================================================
//Над станком 2
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_ABOVE].X := 6820;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_ABOVE].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_ABOVE].Z := 0;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_ABOVE].SpeedFactor := 1.0;

//В станке 2
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_INSIDE].X := 6820;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_INSIDE].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_INSIDE].Z := 800;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_INSIDE].SpeedFactor := 1.0;

//У патрона 2
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_APROACH].X := 6820;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_APROACH].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_APROACH].Z := 1680;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_APROACH].SpeedFactor := 1.0;

//В патроне 2 
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_POSITION].X := 6600;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_POSITION].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_POSITION].Z := 1680;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_POSITION].SpeedFactor := 1.0;

// =============================================================================
// ТОЧКИ СТАНКА 3
// =============================================================================
//Над станком 3
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_ABOVE].X := 11720;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_ABOVE].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_ABOVE].Z := 0;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_ABOVE].SpeedFactor := 1.0;

//В станке 3
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_INSIDE].X := 11720;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_INSIDE].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_INSIDE].Z := 800;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_INSIDE].SpeedFactor := 1.0;

//У патрона 3
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_APROACH].X := 11720;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_APROACH].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_APROACH].Z := 1680;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_APROACH].SpeedFactor := 1.0;

//В патроне 3
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_POSITION].X := 11500;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_POSITION].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_POSITION].Z := 1680;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_POSITION].SpeedFactor := 1.0;

// =============================================================================
// ТОЧКИ МАГАЗИНА
// =============================================================================
//Базовая точка магазина
GVL_POINT.Points[E_POINT_NAME.MAGAZINE_DETAIL].X := 3770;
GVL_POINT.Points[E_POINT_NAME.MAGAZINE_DETAIL].Y := 200;
GVL_POINT.Points[E_POINT_NAME.MAGAZINE_DETAIL].Z := 1570;
GVL_POINT.Points[E_POINT_NAME.MAGAZINE_DETAIL].SpeedFactor := 1.0;


GVL_AXIS.arrAxis[1].Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError;
GVL_AXIS.arrAxis[2].Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError;
GVL_AXIS.arrAxis[3].Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError;

GVL_AXIS.arrAxis[1].Command.xResetAllError := GVL_CELL_CONTROL.xReset;
GVL_AXIS.arrAxis[2].Command.xResetAllError := GVL_CELL_CONTROL.xReset;
GVL_AXIS.arrAxis[3].Command.xResetAllError := GVL_CELL_CONTROL.xReset;

GVL_AXIS.arrAxis[1].Command.xEnable := GVL_CELL_CONTROL.xEnable;
GVL_AXIS.arrAxis[2].Command.xEnable := GVL_CELL_CONTROL.xEnable;
GVL_AXIS.arrAxis[3].Command.xEnable := GVL_CELL_CONTROL.xEnable;

GVL_AXIS.arrAxis[1].Command.xDisable := GVL_CELL_CONTROL.xDisable;
GVL_AXIS.arrAxis[2].Command.xDisable := GVL_CELL_CONTROL.xDisable;
GVL_AXIS.arrAxis[3].Command.xDisable := GVL_CELL_CONTROL.xDisable;

GVL_AXIS_GROUP.AxisGroup.Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError;
GVL_AXIS_GROUP.AxisGroup.Command.xReset := GVL_CELL_CONTROL.xReset;
GVL_AXIS_GROUP.AxisGroup.Command.xPowerEnable := GVL_CELL_CONTROL.xEnable;
GVL_AXIS_GROUP.AxisGroup.Command.xDisable := GVL_CELL_CONTROL.xDisable;



AXIS_X(
	Axis:= X,
	AxisData := GVL_AXIS.arrAxis[1]
);

AXIS_Y(
	Axis:= Y,
	AxisData := GVL_AXIS.arrAxis[2]
);

AXIS_Z(
	Axis:= Z,
	AxisData := GVL_AXIS.arrAxis[3]
);
	
GROUP_XYZ(
	AxisGroup :=AXIS_GROUP, 
	GroupData :=GVL_AXIS_GROUP.AxisGroup
);

GVL_HMI.lrActualX := GVL_AXIS_GROUP.AxisGroup.Status.ActualX;
GVL_HMI.lrActualY := GVL_AXIS_GROUP.AxisGroup.Status.ActualY;
GVL_HMI.lrActualZ := GVL_AXIS_GROUP.AxisGroup.Status.ActualZ;

// Старые пути остаются только до штатного обновления визуализации.
GVL_HMI.HMI.ActualX := GVL_HMI.lrActualX;
GVL_HMI.HMI.ActualY := GVL_HMI.lrActualY;
GVL_HMI.HMI.ActualZ := GVL_HMI.lrActualZ;

CELL_MANAGER(
	xStart := GVL_CELL_CONTROL.xStart,
	xStop := GVL_CELL_CONTROL.xStop,
	xReset := GVL_CELL_CONTROL.xReset,
	xManual := GVL_CELL_CONTROL.xManual,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	stRobotStatus := GVL_ROBOT.Status,
	stMagazineStatus := GVL_MAGAZINE.Status,
	astMachineStatus := GVL_MACHINE.Status,
	Command => GVL_CELL_MANAGER.Command,
	Status => GVL_CELL_MANAGER.Status,
	Diag => GVL_CELL_MANAGER.Diag,
	Error => GVL_CELL_MANAGER.Error
);

GVL_MAGAZINE.AutoCommand := GVL_CELL_MANAGER.Command.stMagazine;
GVL_MAGAZINE.AutoCommand.xEnable := GVL_CELL_CONTROL.xEnable;
GVL_MAGAZINE.AutoCommand.xDisable := GVL_CELL_CONTROL.xDisable;

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

MACHINE_1( 
	xExecute := GVL_CELL_MANAGER.Command.axMachineExecute[1],
	xReset := GVL_HMI.axMachineReset[1],
	xResetGlobal := GVL_CELL_CONTROL.xReset,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xHmiEnable := GVL_HMI.axMachineEnable[1] AND GVL_HMI.axMachineUsed[1],
	xHmiDisable := GVL_HMI.axMachineDisable[1],
	xUseHmiCycleTime := GVL_HMI.xUseHmiCycleTime[1],
	tHmiCycleTime := GVL_HMI.tMachineCycleTime[1],
	stChangeRecipe := GVL_CELL_SETTINGS.CHANGE_MACHINE,
	stLoadRecipe := GVL_CELL_SETTINGS.LOAD_MACHINE,
	stUnloadRecipe := GVL_CELL_SETTINGS.UNLOAD_MACHINE,
	stMachineStatus := MACHINE_1_SIM.Status,
	stRobotStatus := GVL_ROBOT.Status,
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
	xExecute := GVL_CELL_MANAGER.Command.axMachineExecute[2],
	xReset := GVL_HMI.axMachineReset[2],
	xResetGlobal := GVL_CELL_CONTROL.xReset,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xHmiEnable := GVL_HMI.axMachineEnable[2] AND GVL_HMI.axMachineUsed[2],
	xHmiDisable := GVL_HMI.axMachineDisable[2],
	xUseHmiCycleTime := GVL_HMI.xUseHmiCycleTime[2],
	tHmiCycleTime := GVL_HMI.tMachineCycleTime[2],
	stChangeRecipe := GVL_CELL_SETTINGS.CHANGE_MACHINE,
	stLoadRecipe := GVL_CELL_SETTINGS.LOAD_MACHINE,
	stUnloadRecipe := GVL_CELL_SETTINGS.UNLOAD_MACHINE,
	stMachineStatus := MACHINE_2_SIM.Status,
	stRobotStatus := GVL_ROBOT.Status,
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
	xExecute := GVL_CELL_MANAGER.Command.axMachineExecute[3],
	xReset := GVL_HMI.axMachineReset[3],
	xResetGlobal := GVL_CELL_CONTROL.xReset,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xHmiEnable := GVL_HMI.axMachineEnable[3] AND GVL_HMI.axMachineUsed[3],
	xHmiDisable := GVL_HMI.axMachineDisable[3],
	xUseHmiCycleTime := GVL_HMI.xUseHmiCycleTime[3],
	tHmiCycleTime := GVL_HMI.tMachineCycleTime[3],
	stChangeRecipe := GVL_CELL_SETTINGS.CHANGE_MACHINE,
	stLoadRecipe := GVL_CELL_SETTINGS.LOAD_MACHINE,
	stUnloadRecipe := GVL_CELL_SETTINGS.UNLOAD_MACHINE,
	stMachineStatus := MACHINE_3_SIM.Status,
	stRobotStatus := GVL_ROBOT.Status,
	Command => GVL_MACHINE.Command[3],
	Status => GVL_MACHINE.Status[3],
	Diag => GVL_MACHINE.Diag[3],
	Error => GVL_MACHINE.Error[3]
);
	 
MACHINE_1_SIM(
	Command := GVL_MACHINE.Command[1].stIo
);

MACHINE_2_SIM(
	Command := GVL_MACHINE.Command[2].stIo
);

MACHINE_3_SIM(
	Command := GVL_MACHINE.Command[3].stIo
);


MAGAZINE(
	stRobotStatus := GVL_ROBOT.Status,
	stMagazineCommand := GVL_MAGAZINE.AutoCommand,
	stHmiCommand := GVL_HMI.stRobotCommand,
	xManual := GVL_CELL_CONTROL.xManual AND NOT GVL_CELL_MANAGER.Status.xRunning,
	xReset := GVL_CELL_CONTROL.xReset,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xMode := GVL_HMI.xModbusMode,
	xHmiEnable := GVL_HMI.xMagazineEnable,
	xHmiDisable := GVL_HMI.xMagazineDisable,
	xHmiFillBlanks := GVL_HMI.xMagazineFillBlanks,
	xHmiClear := GVL_HMI.xMagazineClear,
	uiRows := GVL_HMI.MagazineRows,
	uiColumns := GVL_HMI.MagazineColumns,
	lrPitchX := GVL_HMI.MagazinePitchX,
	lrPitchY := GVL_HMI.MagazinePitchY,
	lrSafeZ := GVL_HMI.MagazineSafeZ,
	stDetail := GVL_DETAIL.arrDetail,
	stPoint := GVL_POINT.Points,
	Command => GVL_MAGAZINE.Command,
	Status => GVL_MAGAZINE.Status,
	Diag => GVL_MAGAZINE.Diag,
	Error => GVL_MAGAZINE.Error
);


 

ROBOT(
	stMachine_1_command := GVL_MACHINE.Command[1].stRobot,
	stMachine_2_command := GVL_MACHINE.Command[2].stRobot,
	stMachine_3_command := GVL_MACHINE.Command[3].stRobot,
	stMagazineCommand := GVL_MAGAZINE.Command,
	stCellCommand := GVL_CELL_MANAGER.Command.stRobot,
	stHmiCommand := GVL_HMI.stRobotCommand,
	xReset := GVL_CELL_CONTROL.xReset,
	xManual := GVL_CELL_CONTROL.xManual AND NOT GVL_CELL_MANAGER.Status.xRunning,
	xMode := GVL_HMI.xModbusMode,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xModbusBusy := GVL_ROBOT.xModbusBusy,
	xModbusDone := GVL_ROBOT.xModbusDone,
	xModbusError := GVL_ROBOT.xModbusError,

    stPoint := GVL_POINT.Points,

    stMotionManager := GVL_MOTION_MANAGER.stMotionManager,
    GroupData := GVL_AXIS_GROUP.AxisGroup,
    stPointManager := GVL_POINT_MANAGER.PointManager,
	Command => GVL_ROBOT.Command,
	ModbusCommand => GVL_ROBOT.ModbusCommand,
	Status => GVL_ROBOT.Status,
	Diag => GVL_ROBOT.Diag,
	Error => GVL_ROBOT.Error
);

// Единый снимок состояния для внешней визуализации.
GVL_HMI.udiPlcHeartbeat := GVL_HMI.udiPlcHeartbeat + 1;
GVL_HMI.xGlobalError := GVL_CELL_CONTROL.xGlobalError;

GVL_HMI.stCellStatus := GVL_CELL_MANAGER.Status;
GVL_HMI.stCellDiag := GVL_CELL_MANAGER.Diag;
GVL_HMI.stCellError := GVL_CELL_MANAGER.Error;

GVL_HMI.stRobotStatus := GVL_ROBOT.Status;
GVL_HMI.stRobotDiag := GVL_ROBOT.Diag;
GVL_HMI.stRobotError := GVL_ROBOT.Error;

GVL_HMI.stMagazineStatus := GVL_MAGAZINE.Status;
GVL_HMI.stMagazineDiag := GVL_MAGAZINE.Diag;
GVL_HMI.stMagazineError := GVL_MAGAZINE.Error;

FOR uiMachine := 1 TO 3 DO
	GVL_HMI.astMachineStatus[uiMachine] := GVL_MACHINE.Status[uiMachine];
	GVL_HMI.astMachineDiag[uiMachine] := GVL_MACHINE.Diag[uiMachine];
	GVL_HMI.astMachineError[uiMachine] := GVL_MACHINE.Error[uiMachine];
END_FOR;

GVL_HMI.astMachineIoStatus[1] := MACHINE_1_SIM.Status;
GVL_HMI.astMachineIoStatus[2] := MACHINE_2_SIM.Status;
GVL_HMI.astMachineIoStatus[3] := MACHINE_3_SIM.Status;

FOR iDetail := 1 TO GVL_CELL_SETTINGS.NumberDetail DO
	GVL_HMI.astMagazineSlot[iDetail] := GVL_DETAIL.arrDetail[iDetail];
END_FOR;
