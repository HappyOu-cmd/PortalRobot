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
	ALARM_MANAGER  : FB_ALARM_MANAGER; // Журнал аварий и предупреждений
	uiMachine      : UINT; // Индекс станка при обработке команд HMI
	iDetail        : SINT; // Индекс слота при передаче состояния магазина в HMI
	xRobotHmiPermit: BOOL; // Разрешение ручных команд робота с HMI
	stRobotHmiCommand : ST_ROBOT_COMMAND; // Команда робота с учётом оперативной остановки HMI
	astAlarmSource : ARRAY [1..13] OF ST_ALARM_SOURCE_DATA; // Унифицированные источники журнала
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Глобальные команды ячейки поступают через единый интерфейс HMI.
GVL_CELL_CONTROL.xEnable := GVL_HMI.xCellEnable;
GVL_CELL_CONTROL.xDisable := GVL_HMI.xCellDisable;
GVL_CELL_CONTROL.xStart := GVL_HMI.xCellStart;
GVL_CELL_CONTROL.xStop := GVL_HMI.xCellStop;
GVL_CELL_CONTROL.xReset := GVL_HMI.xCellReset;
GVL_CELL_CONTROL.xManual := GVL_HMI.xCellManual;
GVL_ALARM.Command.xResetWarnings := GVL_HMI.xAlarmResetWarnings;

// Ручные команды робота разрешены только вне автоматического цикла.
xRobotHmiPermit := GVL_CELL_CONTROL.xManual AND NOT GVL_CELL_MANAGER.Status.xRunning;

// =============================================================================
// ТОЧКИ СТАНКА 1
// =============================================================================
//Над станком 1
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_ABOVE].X := 2010;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_ABOVE].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_ABOVE].Z := 350;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_ABOVE].SpeedFactor := 1.0;

//В станке 1
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_INSIDE].X := 1920;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_INSIDE].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_INSIDE].Z := 800;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_INSIDE].SpeedFactor := 1.0;

//У патрона 1
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_APROACH].X := 2010;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_APROACH].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_APROACH].Z := 1730;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_APROACH].SpeedFactor := 1.0;

//В патроне 1 
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_POSITION].X := 1880;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_POSITION].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_POSITION].Z := 1730;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_POSITION].SpeedFactor := 1.0;

// =============================================================================
// ТОЧКИ СТАНКА 2
// =============================================================================
//Над станком 2
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_ABOVE].X := 6910;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_ABOVE].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_ABOVE].Z := 350;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_ABOVE].SpeedFactor := 1.0;

//В станке 2
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_INSIDE].X := 6820;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_INSIDE].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_INSIDE].Z := 800;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_INSIDE].SpeedFactor := 1.0;

//У патрона 2
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_APROACH].X := 6910;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_APROACH].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_APROACH].Z := 1730;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_APROACH].SpeedFactor := 1.0;

//В патроне 2 
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_POSITION].X := 6780;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_POSITION].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_POSITION].Z := 1730;
GVL_POINT.Points[E_POINT_NAME.MACHINE_2_CHUCK_POSITION].SpeedFactor := 1.0;

// =============================================================================
// ТОЧКИ СТАНКА 3
// =============================================================================
//Над станком 3
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_ABOVE].X := 11810;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_ABOVE].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_ABOVE].Z := 350;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_ABOVE].SpeedFactor := 1.0;

//В станке 3
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_INSIDE].X := 11810;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_INSIDE].Y := 90;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_INSIDE].Z := 800;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_INSIDE].SpeedFactor := 1.0;

//У патрона 3
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_APROACH].X := 11810;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_APROACH].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_APROACH].Z := 1730;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_APROACH].SpeedFactor := 1.0;

//В патроне 3
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_POSITION].X := 11680;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_POSITION].Y := 250;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_POSITION].Z := 1730;
GVL_POINT.Points[E_POINT_NAME.MACHINE_3_CHUCK_POSITION].SpeedFactor := 1.0;

// =============================================================================
// ТОЧКИ МАГАЗИНА
// =============================================================================
//Базовая точка магазина
GVL_POINT.Points[E_POINT_NAME.MAGAZINE_DETAIL].X := 4230;
GVL_POINT.Points[E_POINT_NAME.MAGAZINE_DETAIL].Y := 200;
GVL_POINT.Points[E_POINT_NAME.MAGAZINE_DETAIL].Z := 1600;
GVL_POINT.Points[E_POINT_NAME.MAGAZINE_DETAIL].SpeedFactor := 1.0;


GVL_AXIS.arrAxis[1].Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError;
GVL_AXIS.arrAxis[2].Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError;
GVL_AXIS.arrAxis[3].Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError;

GVL_AXIS.arrAxis[1].Command.xPowerPermit := NOT GVL_CELL_CONTROL.xGlobalError;
GVL_AXIS.arrAxis[2].Command.xPowerPermit := NOT GVL_CELL_CONTROL.xGlobalError;
GVL_AXIS.arrAxis[3].Command.xPowerPermit := NOT GVL_CELL_CONTROL.xGlobalError;

GVL_AXIS.arrAxis[1].Command.xResetAllError := GVL_CELL_CONTROL.xReset OR (xRobotHmiPermit AND GVL_HMI.xRobotReset);
GVL_AXIS.arrAxis[2].Command.xResetAllError := GVL_CELL_CONTROL.xReset OR (xRobotHmiPermit AND GVL_HMI.xRobotReset);
GVL_AXIS.arrAxis[3].Command.xResetAllError := GVL_CELL_CONTROL.xReset OR (xRobotHmiPermit AND GVL_HMI.xRobotReset);

GVL_AXIS.arrAxis[1].Command.xEnable := GVL_CELL_CONTROL.xEnable OR (xRobotHmiPermit AND GVL_HMI.xRobotDrivesEnable);
GVL_AXIS.arrAxis[2].Command.xEnable := GVL_CELL_CONTROL.xEnable OR (xRobotHmiPermit AND GVL_HMI.xRobotDrivesEnable);
GVL_AXIS.arrAxis[3].Command.xEnable := GVL_CELL_CONTROL.xEnable OR (xRobotHmiPermit AND GVL_HMI.xRobotDrivesEnable);

GVL_AXIS.arrAxis[1].Command.xDisable := GVL_CELL_CONTROL.xDisable OR (xRobotHmiPermit AND GVL_HMI.xRobotDrivesDisable);
GVL_AXIS.arrAxis[2].Command.xDisable := GVL_CELL_CONTROL.xDisable OR (xRobotHmiPermit AND GVL_HMI.xRobotDrivesDisable);
GVL_AXIS.arrAxis[3].Command.xDisable := GVL_CELL_CONTROL.xDisable OR (xRobotHmiPermit AND GVL_HMI.xRobotDrivesDisable);

GVL_AXIS.arrAxis[1].Command.xStop := xRobotHmiPermit AND GVL_HMI.xRobotStop;
GVL_AXIS.arrAxis[2].Command.xStop := xRobotHmiPermit AND GVL_HMI.xRobotStop;
GVL_AXIS.arrAxis[3].Command.xStop := xRobotHmiPermit AND GVL_HMI.xRobotStop;

GVL_AXIS_GROUP.AxisGroup.Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError;
GVL_AXIS_GROUP.AxisGroup.Command.xPowerPermit := NOT GVL_CELL_CONTROL.xGlobalError;
GVL_AXIS_GROUP.AxisGroup.Command.xReset := GVL_CELL_CONTROL.xReset OR (xRobotHmiPermit AND GVL_HMI.xRobotReset);
GVL_AXIS_GROUP.AxisGroup.Command.xPowerEnable := GVL_CELL_CONTROL.xEnable OR (xRobotHmiPermit AND GVL_HMI.xRobotDrivesEnable);
GVL_AXIS_GROUP.AxisGroup.Command.xDisable := GVL_CELL_CONTROL.xDisable OR (xRobotHmiPermit AND GVL_HMI.xRobotDrivesDisable);
GVL_AXIS_GROUP.AxisGroup.Command.xStopCmd := xRobotHmiPermit AND GVL_HMI.xRobotStop;



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
	xDrivesReady := GVL_AXIS.arrAxis[1].Status.xPowered
		AND GVL_AXIS.arrAxis[1].Status.xCanStartMotion
		AND NOT GVL_AXIS.arrAxis[1].Status.xError
		AND GVL_AXIS.arrAxis[2].Status.xPowered
		AND GVL_AXIS.arrAxis[2].Status.xCanStartMotion
		AND NOT GVL_AXIS.arrAxis[2].Status.xError
		AND GVL_AXIS.arrAxis[3].Status.xPowered
		AND GVL_AXIS.arrAxis[3].Status.xCanStartMotion
		AND NOT GVL_AXIS.arrAxis[3].Status.xError
		AND NOT GVL_AXIS_GROUP.AxisGroup.Status.xLocalError
		AND NOT GVL_AXIS_GROUP.AxisGroup.Status.xLogicalError
		AND NOT GVL_AXIS_GROUP.AxisGroup.Status.xGroupError,
	stRobotStatus := GVL_ROBOT.Status,
	stMagazineStatus := GVL_MAGAZINE.Status,
	astMachineStatus := GVL_MACHINE.Status,
	astMachineDiag := GVL_MACHINE.Diag,
	Command => GVL_CELL_MANAGER.Command,
	Status => GVL_CELL_MANAGER.Status,
	Diag => GVL_CELL_MANAGER.Diag,
	Error => GVL_CELL_MANAGER.Error
);

GVL_MAGAZINE.AutoCommand := GVL_CELL_MANAGER.Command.stMagazine;
// Магазин включает только оператор; автоматическая логика может запросить отключение.
GVL_MAGAZINE.AutoCommand.xEnable := FALSE;
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
	xHmiSetBlank := GVL_HMI.axMachineSetBlank[1],
	xHmiSetDetail := GVL_HMI.axMachineSetDetail[1],
	xHmiAcceptDoor := GVL_HMI.axMachineAcceptDoor[1],
	xHmiRejectDoor := GVL_HMI.axMachineRejectDoor[1],
	xHmiAcceptRunCNC := GVL_HMI.axMachineAcceptRun[1],
	xHmiRejectRunCNC := GVL_HMI.axMachineRejectRun[1],
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
	xHmiSetBlank := GVL_HMI.axMachineSetBlank[2],
	xHmiSetDetail := GVL_HMI.axMachineSetDetail[2],
	xHmiAcceptDoor := GVL_HMI.axMachineAcceptDoor[2],
	xHmiRejectDoor := GVL_HMI.axMachineRejectDoor[2],
	xHmiAcceptRunCNC := GVL_HMI.axMachineAcceptRun[2],
	xHmiRejectRunCNC := GVL_HMI.axMachineRejectRun[2],
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
	xHmiSetBlank := GVL_HMI.axMachineSetBlank[3],
	xHmiSetDetail := GVL_HMI.axMachineSetDetail[3],
	xHmiAcceptDoor := GVL_HMI.axMachineAcceptDoor[3],
	xHmiRejectDoor := GVL_HMI.axMachineRejectDoor[3],
	xHmiAcceptRunCNC := GVL_HMI.axMachineAcceptRun[3],
	xHmiRejectRunCNC := GVL_HMI.axMachineRejectRun[3],
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
	Command := GVL_MACHINE.Command[1].stIo,
	Status => GVL_MACHINE.Status[1].stIo
);

MACHINE_2_SIM(
	Command := GVL_MACHINE.Command[2].stIo,
	Status => GVL_MACHINE.Status[2].stIo
);

MACHINE_3_SIM(
	Command := GVL_MACHINE.Command[3].stIo,
	Status => GVL_MACHINE.Status[3].stIo
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
	xHmiCycleSlot := GVL_HMI.xMagazineCycleSlot,
	uiHmiEditSlot := GVL_HMI.uiMagazineEditSlot,
	uiRows := GVL_HMI.MagazineRows,
	uiColumns := GVL_HMI.MagazineColumns,
	lrPitchX := GVL_HMI.MagazinePitchX,
	lrPitchY := GVL_HMI.MagazinePitchY,
	lrSafeZ_1 := GVL_HMI.MagazineSafeZ_1,
	lrSafeZ_2 := GVL_HMI.MagazineSafeZ_2,
	stDetail := GVL_DETAIL.arrDetail,
	stPoint := GVL_POINT.Points,
	Command => GVL_MAGAZINE.Command,
	Status => GVL_MAGAZINE.Status,
	Diag => GVL_MAGAZINE.Diag,
	Error => GVL_MAGAZINE.Error
);


 

stRobotHmiCommand := GVL_HMI.stRobotCommand;
stRobotHmiCommand.xStop := stRobotHmiCommand.xStop OR (xRobotHmiPermit AND GVL_HMI.xRobotStop);

ROBOT(
	stMachine_1_command := GVL_MACHINE.Command[1].stRobot,
	stMachine_2_command := GVL_MACHINE.Command[2].stRobot,
	stMachine_3_command := GVL_MACHINE.Command[3].stRobot,
	stMagazineCommand := GVL_MAGAZINE.Command,
	stCellCommand := GVL_CELL_MANAGER.Command.stRobot,
	stHmiCommand := stRobotHmiCommand,
	xReset := GVL_CELL_CONTROL.xReset OR (xRobotHmiPermit AND GVL_HMI.xRobotReset),
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
	Error => GVL_ROBOT.Error,
	GripperDiag => GVL_ROBOT.GripperDiag,
	GripperError => GVL_ROBOT.GripperError
);

// В журнал передаются только собственные первопричины и предупреждения владельцев блоков.
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

astAlarmSource[6].eSource := E_ALARM_SOURCE.MAGAZINE;
astAlarmSource[6].dwAlarmActive := GVL_MAGAZINE.Error.dwAlarmActive;
astAlarmSource[6].stWarning := GVL_MAGAZINE.Diag.stWarning;

astAlarmSource[7].eSource := E_ALARM_SOURCE.AXIS_X;
astAlarmSource[7].dwAlarmActive := GVL_AXIS.arrAxis[1].Error.dwAlarmActive;
astAlarmSource[7].stWarning := GVL_AXIS.arrAxis[1].Diag.stWarning;

astAlarmSource[8].eSource := E_ALARM_SOURCE.AXIS_Y;
astAlarmSource[8].dwAlarmActive := GVL_AXIS.arrAxis[2].Error.dwAlarmActive;
astAlarmSource[8].stWarning := GVL_AXIS.arrAxis[2].Diag.stWarning;

astAlarmSource[9].eSource := E_ALARM_SOURCE.AXIS_Z;
astAlarmSource[9].dwAlarmActive := GVL_AXIS.arrAxis[3].Error.dwAlarmActive;
astAlarmSource[9].stWarning := GVL_AXIS.arrAxis[3].Diag.stWarning;

astAlarmSource[10].eSource := E_ALARM_SOURCE.AXIS_GROUP;
astAlarmSource[10].dwAlarmActive := GVL_AXIS_GROUP.AxisGroup.Error.dwAlarmActive;
astAlarmSource[10].stWarning := GVL_AXIS_GROUP.AxisGroup.Diag.stWarning;

astAlarmSource[11].eSource := E_ALARM_SOURCE.MOTION_MANAGER;
astAlarmSource[11].dwAlarmActive := GVL_MOTION_MANAGER.stMotionManager.Error.dwAlarmActive;
astAlarmSource[11].stWarning := GVL_MOTION_MANAGER.stMotionManager.Diag.stWarning;

astAlarmSource[12].eSource := E_ALARM_SOURCE.POINT_MANAGER;
astAlarmSource[12].dwAlarmActive := GVL_POINT_MANAGER.PointManager.Error.dwAlarmActive;
astAlarmSource[12].stWarning := GVL_POINT_MANAGER.PointManager.Diag.stWarning;

astAlarmSource[13].eSource := E_ALARM_SOURCE.GRIPPER;
astAlarmSource[13].dwAlarmActive := GVL_ROBOT.GripperError.dwAlarmActive;
astAlarmSource[13].stWarning := GVL_ROBOT.GripperDiag.stWarning;

ALARM_MANAGER(
	xResetAll := GVL_CELL_CONTROL.xReset,
	xResetWarnings := GVL_ALARM.Command.xResetWarnings,
	Sources := astAlarmSource,
	Status => GVL_ALARM.Status,
	Events => GVL_ALARM.Events
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
GVL_HMI.stAlarmStatus := GVL_ALARM.Status;
GVL_HMI.astAlarmEvent := GVL_ALARM.Events;

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
