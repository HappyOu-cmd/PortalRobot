FUNCTION_BLOCK FB_GRIPPER_SIMULATION
VAR_INPUT
	xExecute : BOOL;
    xReset   : BOOL;
    eAction  : E_ROBOT_ACTION;

    xSimGripper1Fault : BOOL;
    xSimGripper2Fault : BOOL;
    xSimRotationFault : BOOL;
    xSimGlobalFault   : BOOL;

    tGripperTime : TIME := T#3S;
    tRotateTime  : TIME := T#3S;
END_VAR
VAR_OUTPUT
	stStatus: ST_GRIPPER_STATUS;
END_VAR
VAR
	eState        : E_GRIPPER_STATE := E_GRIPPER_STATE.IDLE;
    eActiveAction : E_ROBOT_ACTION := E_ROBOT_ACTION.NONE;

    tonAction      : TON;
    xActionFault   : BOOL;
    tActionTime    : TIME;
    xInitialized   : BOOL;
    dwErrorActive  : DWORD;
END_VAR
VAR CONSTANT 
	ERR_GRIPPER_1   : DWORD := DWORD#16#0000_0001;
    ERR_GRIPPER_2   : DWORD := DWORD#16#0000_0002;
    ERR_GRIP_ROTATE : DWORD := DWORD#16#0000_0004;
    ERR_GRIP_ACTION : DWORD := DWORD#16#0000_0008;
    ERR_GRIP_GLOBAL : DWORD := DWORD#16#0000_0010;
END_VAR

// --- BEGIN IMPLEMENTATION ---

IF NOT xInitialized THEN
    stStatus.xGripper1Open := FALSE;
    stStatus.xGripper1Closed := TRUE;

    stStatus.xGripper2Open := TRUE;
    stStatus.xGripper2Closed := FALSE;

    stStatus.xRotatedToBlank := TRUE;
    stStatus.xRotatedToDetail := FALSE;

    xInitialized := TRUE;
END_IF;


xActionFault := FALSE;
tActionTime := tGripperTime;

CASE eActiveAction OF

    E_ROBOT_ACTION.UNCLAMP_1,
    E_ROBOT_ACTION.CLAMP_1:
        xActionFault := xSimGripper1Fault;

    E_ROBOT_ACTION.UNCLAMP_2,
    E_ROBOT_ACTION.CLAMP_2:
        xActionFault := xSimGripper2Fault;

    E_ROBOT_ACTION.ROTATE_TO_BLANK,
    E_ROBOT_ACTION.ROTATE_TO_DETAIL:
        xActionFault := xSimRotationFault;
        tActionTime := tRotateTime;

END_CASE;


tonAction(
    IN := (eState = E_GRIPPER_STATE.EXECUTE)
          AND NOT xActionFault
          AND NOT xSimGlobalFault,
    PT := tActionTime
);


CASE eState OF

    E_GRIPPER_STATE.IDLE:

        stStatus.xBusy := FALSE;
        stStatus.xDone := FALSE;
        stStatus.xError := FALSE;

        IF xExecute THEN
            eActiveAction := eAction;

            CASE eAction OF

                E_ROBOT_ACTION.UNCLAMP_1,
                E_ROBOT_ACTION.CLAMP_1,
                E_ROBOT_ACTION.UNCLAMP_2,
                E_ROBOT_ACTION.CLAMP_2,
                E_ROBOT_ACTION.ROTATE_TO_BLANK,
                E_ROBOT_ACTION.ROTATE_TO_DETAIL:

                    eState := E_GRIPPER_STATE.EXECUTE;

            ELSE
                dwErrorActive := dwErrorActive OR ERR_GRIP_ACTION;
                eState := E_GRIPPER_STATE.ERROR;
            END_CASE;
        END_IF;


    E_GRIPPER_STATE.EXECUTE:

        stStatus.xBusy := TRUE;
        stStatus.xDone := FALSE;

        IF xSimGlobalFault THEN
            dwErrorActive := dwErrorActive OR ERR_GRIP_GLOBAL;
            eState := E_GRIPPER_STATE.ERROR;

        ELSIF xActionFault THEN

            CASE eActiveAction OF

                E_ROBOT_ACTION.UNCLAMP_1,
                E_ROBOT_ACTION.CLAMP_1:
                    dwErrorActive := dwErrorActive OR ERR_GRIPPER_1;

                E_ROBOT_ACTION.UNCLAMP_2,
                E_ROBOT_ACTION.CLAMP_2:
                    dwErrorActive := dwErrorActive OR ERR_GRIPPER_2;

                E_ROBOT_ACTION.ROTATE_TO_BLANK,
                E_ROBOT_ACTION.ROTATE_TO_DETAIL:
                    dwErrorActive := dwErrorActive OR ERR_GRIP_ROTATE;

            END_CASE;

            eState := E_GRIPPER_STATE.ERROR;

        ELSIF tonAction.Q THEN

            CASE eActiveAction OF

                E_ROBOT_ACTION.UNCLAMP_1:
                    stStatus.xGripper1Open := TRUE;
                    stStatus.xGripper1Closed := FALSE;

                E_ROBOT_ACTION.CLAMP_1:
                    stStatus.xGripper1Open := FALSE;
                    stStatus.xGripper1Closed := TRUE;

                E_ROBOT_ACTION.UNCLAMP_2:
                    stStatus.xGripper2Open := TRUE;
                    stStatus.xGripper2Closed := FALSE;

                E_ROBOT_ACTION.CLAMP_2:
                    stStatus.xGripper2Open := FALSE;
                    stStatus.xGripper2Closed := TRUE;

                E_ROBOT_ACTION.ROTATE_TO_BLANK:
                    stStatus.xRotatedToBlank := TRUE;
                    stStatus.xRotatedToDetail := FALSE;

                E_ROBOT_ACTION.ROTATE_TO_DETAIL:
                    stStatus.xRotatedToBlank := FALSE;
                    stStatus.xRotatedToDetail := TRUE;

            END_CASE;

            eState := E_GRIPPER_STATE.DONE;
        END_IF;


    E_GRIPPER_STATE.DONE:

        stStatus.xBusy := FALSE;
        stStatus.xDone := TRUE;

        IF NOT xExecute THEN
            stStatus.xDone := FALSE;
            eActiveAction := E_ROBOT_ACTION.NONE;
            eState := E_GRIPPER_STATE.IDLE;
        END_IF;


    E_GRIPPER_STATE.ERROR:

        stStatus.xBusy := FALSE;
        stStatus.xDone := FALSE;
        stStatus.xError := TRUE;

        IF xReset
        AND NOT xExecute
        AND NOT xSimGlobalFault
        AND NOT xSimGripper1Fault
        AND NOT xSimGripper2Fault
        AND NOT xSimRotationFault THEN

            dwErrorActive := DWORD#0;
            stStatus.xError := FALSE;
            eActiveAction := E_ROBOT_ACTION.NONE;
            eState := E_GRIPPER_STATE.IDLE;
        END_IF;

END_CASE;