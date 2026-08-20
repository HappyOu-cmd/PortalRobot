FUNCTION_BLOCK FB_GRIPPER_FAULT_INJECTOR
VAR_INPUT
	Request       : ST_GRIPPER_FAULT_REQUEST; // Поддерживаемые неисправности захвата
	eActiveAction : E_ROBOT_ACTION; // Текущее действие виртуального захвата
END_VAR
VAR_OUTPUT
	xGripper1Fault : BOOL; // Действующая неисправность первого захвата
	xGripper2Fault : BOOL; // Действующая неисправность второго захвата
	xRotationFault : BOOL; // Действующая неисправность поворота
	xGlobalFault   : BOOL; // Действующая общая неисправность
	xActionFault   : BOOL; // Неисправность относится к текущему действию
	Status         : ST_FAULT_INJECTION_STATUS; // Состояние источника для HMI
END_VAR

// --- BEGIN IMPLEMENTATION ---

xGripper1Fault := Request.xEnabled AND Request.xGripper1Fault;
xGripper2Fault := Request.xEnabled AND Request.xGripper2Fault;
xRotationFault := Request.xEnabled AND Request.xRotationFault;
xGlobalFault := Request.xEnabled AND Request.xGlobalFault;

xActionFault := FALSE;
CASE eActiveAction OF
	E_ROBOT_ACTION.UNCLAMP_1,
	E_ROBOT_ACTION.CLAMP_1:
		xActionFault := xGripper1Fault;

	E_ROBOT_ACTION.UNCLAMP_2,
	E_ROBOT_ACTION.CLAMP_2:
		xActionFault := xGripper2Fault;

	E_ROBOT_ACTION.ROTATE_TO_BLANK,
	E_ROBOT_ACTION.ROTATE_TO_DETAIL:
		xActionFault := xRotationFault;
END_CASE;

Status.xAllowed := Request.xEnabled;
Status.xActive := xGripper1Fault
	OR xGripper2Fault
	OR xRotationFault
	OR xGlobalFault;
Status.xBusy := FALSE;
Status.xResetAllowed := NOT Status.xActive;
Status.xRejected := FALSE;
