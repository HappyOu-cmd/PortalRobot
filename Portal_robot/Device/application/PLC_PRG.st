PROGRAM PLC_PRG
VAR
	AXIS_X         : FB_AXIS; // Управление осью X
	AXIS_Y         : FB_AXIS; // Управление осью Y
	AXIS_Z         : FB_AXIS; // Управление осью Z
	GROUP_XYZ      : FB_AXIS_GROUP; // Управление группой осей XYZ
	HMI            : FB_HMI; // Обмен данными с визуализацией
	MOTION_MANAGER : FB_MOTION_MANAGER; // Менеджер движения по именованным точкам
	MACHINE_1      : FB_MACHINE; // Логика первого станка
	MACHINE_2      : FB_MACHINE; // Логика второго станка
	MACHINE_3      : FB_MACHINE; // Логика третьего станка
	MACHINE_1_SIM  : FB_MACHINE_SIMULATION; // Симуляция первого станка
	MACHINE_2_SIM  : FB_MACHINE_SIMULATION; // Симуляция второго станка
	MACHINE_3_SIM  : FB_MACHINE_SIMULATION; // Симуляция третьего станка
	MAGAZINE       : FB_MAGAZINE; // Управление магазином деталей
	ROBOT          : FB_ROBOT; // Координация движений и захвата робота
END_VAR

// --- BEGIN IMPLEMENTATION ---

//Над станком 1
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_ABOVE].X := 425;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_ABOVE].Y := 100;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_ABOVE].Z := 216;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_ABOVE].SpeedFactor := 1.0;

//В станке 1
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_INSIDE].X := 425;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_INSIDE].Y := 100;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_INSIDE].Z := 458;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_INSIDE].SpeedFactor := 1.0;

//У патрона 1
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_APROACH].X := 425;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_APROACH].Y := 100;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_APROACH].Z := 506;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_APROACH].SpeedFactor := 1.0;

//В патроне 1 
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_POSITION].X := 378;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_POSITION].Y := 100;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_POSITION].Z := 506;
GVL_POINT.Points[E_POINT_NAME.MACHINE_1_CHUCK_POSITION].SpeedFactor := 1.0;

GVL_AXIS.arrAxis[1].Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError;
GVL_AXIS.arrAxis[2].Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError;
GVL_AXIS.arrAxis[3].Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError;

GVL_AXIS.arrAxis[1].Command.xResetAllError := GVL_CELL_CONTROL.xReset;
GVL_AXIS.arrAxis[2].Command.xResetAllError := GVL_CELL_CONTROL.xReset;
GVL_AXIS.arrAxis[3].Command.xResetAllError := GVL_CELL_CONTROL.xReset;

GVL_AXIS_GROUP.AxisGroup.Command.xGlobalError := GVL_CELL_CONTROL.xGlobalError;
GVL_AXIS_GROUP.AxisGroup.Command.xReset := GVL_CELL_CONTROL.xReset;



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

HMI(
	GroupData := GVL_AXIS_GROUP.AxisGroup,
	HMI := GVL_HMI.HMI
);


MACHINE_1.stPoints.eAbove := E_POINT_NAME.MACHINE_1_ABOVE;
MACHINE_1.stPoints.eChuck := E_POINT_NAME.MACHINE_1_CHUCK_POSITION;
MACHINE_1.stPoints.eChuckApproach := E_POINT_NAME.MACHINE_1_CHUCK_APROACH;
MACHINE_1.stPoints.eInside := E_POINT_NAME.MACHINE_1_INSIDE;
MACHINE_1.stPoints.eNone := E_POINT_NAME.NONE;

MACHINE_1( 
	xResetGlobal := GVL_CELL_CONTROL.xReset,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	stChangeRecipe := GVL_CELL_SETTINGS.CHANGE_MACHINE,
	stMachineStatus := MACHINE_1_SIM.Status,
	stRobotStatus := ROBOT.Status
);

MACHINE_2.stPoints.eAbove := E_POINT_NAME.MACHINE_2_ABOVE;
MACHINE_2.stPoints.eChuck := E_POINT_NAME.MACHINE_2_CHUCK_POSITION;
MACHINE_2.stPoints.eChuckApproach := E_POINT_NAME.MACHINE_2_CHUCK_APROACH;
MACHINE_2.stPoints.eInside := E_POINT_NAME.MACHINE_2_INSIDE;
MACHINE_2.stPoints.eNone := E_POINT_NAME.NONE;

MACHINE_2( 
	xResetGlobal := GVL_CELL_CONTROL.xReset,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	stChangeRecipe := GVL_CELL_SETTINGS.CHANGE_MACHINE,
	stMachineStatus := MACHINE_2_SIM.Status,
	stRobotStatus := ROBOT.Status
);

MACHINE_3.stPoints.eAbove := E_POINT_NAME.MACHINE_3_ABOVE;
MACHINE_3.stPoints.eChuck := E_POINT_NAME.MACHINE_3_CHUCK_POSITION;
MACHINE_3.stPoints.eChuckApproach := E_POINT_NAME.MACHINE_3_CHUCK_APROACH;
MACHINE_3.stPoints.eInside := E_POINT_NAME.MACHINE_3_INSIDE;
MACHINE_3.stPoints.eNone := E_POINT_NAME.NONE;

MACHINE_3( 
	xResetGlobal := GVL_CELL_CONTROL.xReset,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	stChangeRecipe := GVL_CELL_SETTINGS.CHANGE_MACHINE,
	stMachineStatus := MACHINE_3_SIM.Status,
	stRobotStatus := ROBOT.Status
);
	 
MACHINE_1_SIM(
	Command := MACHINE_1.Command.stIo
);

MACHINE_2_SIM(
	Command := MACHINE_2.Command.stIo
);

MACHINE_3_SIM(
	Command := MACHINE_3.Command.stIo
);


MAGAZINE(
	stRobotStatus := ROBOT.Status,
	stMagazineCommand := GVL_ROBOT.stMagazineAutoCommand,
	stHmiCommand := GVL_HMI.HMI.Command.stRobot,
	xManual := GVL_CELL_CONTROL.xManual,
	xReset := GVL_CELL_CONTROL.xReset,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xMode := GVL_HMI.HMI.Command.xModbusMode,
	xHmiEnable := GVL_HMI.HMI.Command.xMagazineEnable,
	xHmiDisable := GVL_HMI.HMI.Command.xMagazineDisable,
	uiRows := GVL_CELL_SETTINGS.MagazineRows,
	uiColumns := GVL_CELL_SETTINGS.MagazineColumns,
	lrPitchX := GVL_CELL_SETTINGS.MagazinePitchX,
	lrPitchY := GVL_CELL_SETTINGS.MagazinePitchY,
	lrSafeZ := GVL_CELL_SETTINGS.MagazineSafeZ,
	stDetail := GVL_DETAIL.arrDetail,
	stPoint := GVL_POINT.Points
);


 

ROBOT(
	stMachine_1_command := MACHINE_1.Command.stRobot,
	stMachine_2_command := MACHINE_2.Command.stRobot,
	stMachine_3_command := MACHINE_3.Command.stRobot,
	stMagazineCommand := MAGAZINE.Command,
	stHmiCommand := GVL_HMI.HMI.Command.stRobot,
	xReset := GVL_CELL_CONTROL.xReset,
	xManual := GVL_CELL_CONTROL.xManual,
	xMode := GVL_HMI.HMI.Command.xModbusMode,
	xGlobalError := GVL_CELL_CONTROL.xGlobalError,
	xModbusBusy := GVL_ROBOT.xModbusBusy,
	xModbusDone := GVL_ROBOT.xModbusDone,
	xModbusError := GVL_ROBOT.xModbusError,

    stPoint := GVL_POINT.Points,

    stMotionManager := GVL_MOTION_MANAGER.stMotionManager,
    GroupData := GVL_AXIS_GROUP.AxisGroup,
    stPointManager := GVL_POINT_MANAGER.PointManager
);

GVL_ROBOT.stModbusCommand := ROBOT.ModbusCommand;
