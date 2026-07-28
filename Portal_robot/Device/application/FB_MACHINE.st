FUNCTION_BLOCK FB_MACHINE
VAR_INPUT
	xExecute             	: BOOL;
    xReset               	: BOOL; //Сброс ошибки конкретного станка
	xResetGlobal            : BOOL; //Глобальный сброс ошибки 
	xGlobalError         	: BOOL;
	xHmiSetPartLoaded    	: BOOL;
    xHmiSetPartEmpty     	: BOOL;
	xHmiEnable              : BOOL;
	xHmiDisable             : BOOL;
	stChangeRecipe 		 	: ARRAY [0..40] OF ST_MACHINE_RECIPE;
	stLoadRecipe 		 	: ARRAY [0..40] OF ST_MACHINE_RECIPE;
	stUnloadRecipe 		 	: ARRAY [0..40] OF ST_MACHINE_RECIPE;
	stPoints             	: ST_MACHINE_POINTS;
	stRobotStatus  			: ST_ROBOT_STATUS;
	stMachineStatus      	: ST_MACHINE_IO_STATUS;
END_VAR
VAR_OUTPUT
	stMachineCommand     	: ST_MACHINE_IO_COMMAND;
	stRobotCommand 			: ST_ROBOT_COMMAND;
	eState               	: E_MACHINE_STATE := E_MACHINE_STATE.DISABLED;
	ePartState           	: E_PART_STATE := E_PART_STATE.UNKNOWN;
	stPublic             	: ST_MACHINE_PUBLIC;
	dwErrorActive        	: DWORD;
    dwErrorLast          	: DWORD;
END_VAR
VAR
	uiIndex                 : UINT;
	tofErrorDoor            : TOF;
	rtExectue               : R_TRIG;
	rtEnabledMachine        : R_TRIG;
	rtDisabledMachine       : R_TRIG;
	rtCycleDone             : R_TRIG;
    rtSetPartLoaded         : R_TRIG;
    rtSetPartEmpty          : R_TRIG;
	xRetreatStarted         : BOOL;
	xRobotInsideMachine     : BOOL;
	xRobotDone              : BOOL;
	xServiceDoorCloseDemand : BOOL;
	xServiceDoorOpenDemand  : BOOL;
	xAutoDoorOpenLatched    : BOOL;
	eGrantedOperation       : E_MACHINE_OPERATION;
	eActualOperation        : E_MACHINE_OPERATION;
	stRecipe                : ARRAY [0..40] OF ST_MACHINE_RECIPE;
END_VAR

VAR CONSTANT
	ERR_WRONG_OPERATION     : DWORD := 1;   	// Приводит к глоабльной ошибке 
    ERR_WRONG_COMMAND       : DWORD := 2;   	// Приводит к глобальной ошибке
    ERR_ROBOT_MOTION        : DWORD := 4;   	// Приводит к глобальной ошибке (Другой блок не создаём новую ошибку)
    ERR_ROBOT_ACTION        : DWORD := 8;   	// Приводит к глобальной ошибке (Другой блок не создаём новую ошибку)
    ERR_DOOR_OPEN  			: DWORD := 16;  	// Не приводит к глобальной ошибке, уезжаем в другой станок
	ERR_DOOR_CLOSE 			: DWORD := 32;  	// Не приводит к глобальной ошибке, уезжаем в другой станок
	ERR_CHUCK_OPEN 			: DWORD := 64;  	// Приводит к глобальной ошибке
	ERR_CHUCK_CLOSE 		: DWORD := 128; 	// Приводит к глобальной ошибке 
	ERR_CYCLE_START			: DWORD := 256;     // Не приводит к глобальной ошибке
	ERR_SAFETY_STOP         : DWORD := 512;		// Глобальная ошибка из вне (Другой блок не создаём новую ошибку)
	ERR_UNKNOWN_DETAIL      : DWORD := 1028;    // Приводит к глобальной ошибке
	ERR_MACHINE_ALARM       : DWORD := 2048;    // Приводит к глобальной ошибке
	ERR_INDEX               : DWORD := 5092;    // Приводит к глобальной ошибке
	ERR_DOOR_ROBOT          : DWORD := 10184;   // Приводит к глобальной ошибке
	ERR_MACHINE_IDLE        : DWORD := 20368;   // Не приводит к глобальной ошибке
	
	MASK_CRITICAL_ERROR		: DWORD :=
								ERR_WRONG_OPERATION OR
								ERR_WRONG_COMMAND OR
								ERR_CHUCK_OPEN OR
								ERR_CHUCK_CLOSE OR 
								ERR_UNKNOWN_DETAIL OR
								ERR_MACHINE_ALARM OR
								ERR_INDEX OR
								ERR_DOOR_ROBOT;
								
	MASK_ALARM_ERROR		: DWORD := 
								ERR_DOOR_OPEN OR
								ERR_DOOR_CLOSE OR
								ERR_CYCLE_START OR
								ERR_MACHINE_IDLE;
								
	MASK_EXTERNAL_ERROR  	: DWORD :=
								ERR_SAFETY_STOP OR
								ERR_ROBOT_ACTION OR
								ERR_ROBOT_MOTION;
							
	
END_VAR
// --- BEGIN IMPLEMENTATION ---

(* 
	1. Добавить таймауты (использовать уже существующие ошибки)
*)

rtEnabledMachine (CLK :=xHmiEnable);
rtDisabledMachine (CLK :=xHmiDisable);
rtCycleDone(CLK := stMachineStatus.xCycleDone);
rtSetPartLoaded(CLK := xHmiSetPartLoaded);
rtSetPartEmpty(CLK := xHmiSetPartEmpty);

// Команды по умолчанию
stMachineCommand.xOpenDoor := FALSE;
stMachineCommand.xCloseDoor := FALSE;
stMachineCommand.xClampChuck := FALSE;
stMachineCommand.xUnclampChuck := FALSE;
stMachineCommand.xStartCycle := FALSE;
stMachineCommand.xReset := xReset;

stRobotCommand.xExecute := FALSE;
stRobotCommand.xStop := FALSE;
stRobotCommand.eAction := E_ROBOT_ACTION.NONE;
xServiceDoorOpenDemand := FALSE;
xServiceDoorCloseDemand := FALSE;

IF stMachineStatus.xChuckClamped AND NOT stMachineStatus.xAlarm THEN
	ePartState := E_PART_STATE.LOADED;
ELSIF stMachineStatus.xChuckUnclamped AND NOT stMachineStatus.xAlarm THEN
	ePartState := E_PART_STATE.EMPTY;
ELSE
	ePartState := E_PART_STATE.UNKNOWN;
END_IF


// // Ручное подтверждение состояния детали
// IF (eState = E_MACHINE_STATE.IDLE)
// AND NOT stMachineStatus.xCycleActive THEN
//     IF rtSetPartLoaded.Q THEN
//         ePartState := E_PART_STATE.LOADED;
//     END_IF;
// 
//     IF rtSetPartEmpty.Q THEN
//         ePartState := E_PART_STATE.EMPTY;
//     END_IF;
// END_IF;

// Автоматическое открытие после окончания обработки
IF rtCycleDone.Q 
	AND NOT stMachineStatus.xAlarm 
	AND NOT stMachineStatus.xCycleActive 
	AND (eState = E_MACHINE_STATE.IDLE) 
	AND NOT xGlobalError THEN
    xAutoDoorOpenLatched := TRUE;
END_IF;

IF stMachineStatus.xDoorOpen THEN
    xAutoDoorOpenLatched := FALSE;
END_IF;

IF (ePartState = E_PART_STATE.EMPTY)
AND stRobotStatus.xBlankAvailable THEN
    eGrantedOperation := E_MACHINE_OPERATION.LOAD;

ELSIF (ePartState = E_PART_STATE.LOADED) THEN
    IF stRobotStatus.xBlankAvailable THEN
        eGrantedOperation := E_MACHINE_OPERATION.CHANGE;
    ELSE
        eGrantedOperation := E_MACHINE_OPERATION.UNLOAD;
    END_IF;
ELSIF (ePartState = E_PART_STATE.UNKNOWN) THEN
	eGrantedOperation := E_MACHINE_OPERATION.NONE;
END_IF;

// Включение и отключение блока
IF rtDisabledMachine.Q AND (eState = E_MACHINE_STATE.IDLE) THEN
    eState := E_MACHINE_STATE.DISABLED;
ELSIF rtEnabledMachine.Q AND eState = E_MACHINE_STATE.DISABLED AND NOT stMachineStatus.xAlarm THEN
    eState := E_MACHINE_STATE.IDLE;
ELSIF rtEnabledMachine.Q AND eState = E_MACHINE_STATE.DISABLED AND stMachineStatus.xAlarm THEN
	eState := E_MACHINE_STATE.ERROR;
END_IF;

IF xGlobalError
AND (eState <> E_MACHINE_STATE.IDLE)
AND (eState <> E_MACHINE_STATE.DISABLED)
AND (eState <> E_MACHINE_STATE.ERROR) THEN
    dwErrorActive := dwErrorActive OR ERR_SAFETY_STOP;
    eState := E_MACHINE_STATE.ERROR;
END_IF;

IF stMachineStatus.xAlarm AND (eState = E_MACHINE_STATE.IDLE) THEN
	dwErrorActive := dwErrorActive OR ERR_MACHINE_IDLE;
    eState := E_MACHINE_STATE.ERROR;
END_IF

//Останавливаем робота, если кто-то попытался закрыть дверь в станке в момент его работы
tofErrorDoor(
			PT:= T#100MS,
			IN:=stMachineStatus.xDoorOpen
);

xRobotInsideMachine := (eState = E_MACHINE_STATE.ROBOT_ACTION) 
						OR (eState = E_MACHINE_STATE.ROBOT_MOVE) 
						OR (eState = E_MACHINE_STATE.RELEASE_ROBOT_ACTION);
						
IF xRobotInsideMachine AND NOT tofErrorDoor.Q THEN
	stRobotCommand.xStop := TRUE;	
	dwErrorActive := dwErrorActive OR ERR_DOOR_ROBOT;
    eState := E_MACHINE_STATE.ERROR;
END_IF

CASE eState OF
	E_MACHINE_STATE.DISABLED:
	;
	E_MACHINE_STATE.IDLE:
		uiIndex := 0;
		xRobotDone := FALSE;
		IF xExecute THEN
			IF (stRobotStatus.eCurrentPoint = stPoints.eAbove)
			AND ePartState <> E_PART_STATE.UNKNOWN
			AND NOT stMachineStatus.xAlarm
			AND NOT stMachineStatus.xCycleActive
    		AND NOT stRobotStatus.xBusy 
			AND NOT stRobotStatus.xError
			AND NOT xGlobalError THEN
				eActualOperation := eGrantedOperation;
				eState := E_MACHINE_STATE.CHOSE;
			ELSIF ePartState = E_PART_STATE.UNKNOWN THEN
				dwErrorActive := dwErrorActive OR ERR_UNKNOWN_DETAIL;
				eState := E_MACHINE_STATE.ERROR ;
			END_IF
		END_IF
		
	E_MACHINE_STATE.CHOSE:
		CASE eActualOperation OF 
			E_MACHINE_OPERATION.CHANGE:
				stRecipe := stChangeRecipe;
				eState := E_MACHINE_STATE.READ;
			E_MACHINE_OPERATION.LOAD:
				stRecipe := stLoadRecipe;
				eState := E_MACHINE_STATE.READ;
			E_MACHINE_OPERATION.UNLOAD:
				stRecipe := stUnloadRecipe;
				eState := E_MACHINE_STATE.READ;
		ELSE
			dwErrorActive := dwErrorActive OR ERR_WRONG_OPERATION ;
			eState := E_MACHINE_STATE.ERROR;
		END_CASE
		
	E_MACHINE_STATE.READ:
		CASE stRecipe[uiIndex].eCommand OF
			E_MACHINE_STATE.ROBOT_MOVE:
				eState := E_MACHINE_STATE.ROBOT_MOVE;
				
			E_MACHINE_STATE.ROBOT_ACTION:
				eState := E_MACHINE_STATE.ROBOT_ACTION;
				
			E_MACHINE_STATE.DOOR_OPEN:
				eState := E_MACHINE_STATE.DOOR_OPEN;
				
			E_MACHINE_STATE.DOOR_CLOSE:
				eState := E_MACHINE_STATE.DOOR_CLOSE;
				
			E_MACHINE_STATE.CHUCK_OPEN:
				eState := E_MACHINE_STATE.CHUCK_OPEN;
				
			E_MACHINE_STATE.CHUCK_CLOSE:
				eState := E_MACHINE_STATE.CHUCK_CLOSE;
				
			E_MACHINE_STATE.CYCLE_START:
				eState := E_MACHINE_STATE.CYCLE_START;
				
			E_MACHINE_STATE.DONE:
				eState := E_MACHINE_STATE.DONE;
				
		ELSE
			dwErrorActive := dwErrorActive OR ERR_WRONG_COMMAND;
			eState := E_MACHINE_STATE.ERROR;
		END_CASE
	
	E_MACHINE_STATE.NEXT:
			uiIndex := uiIndex + 1;
			IF uiIndex > 40 THEN
				dwErrorActive := dwErrorActive OR ERR_INDEX;
				eState := E_MACHINE_STATE.ERROR;
			ELSE
				eState := E_MACHINE_STATE.READ;
			END_IF;
	
	E_MACHINE_STATE.ROBOT_MOVE:
		stRobotCommand.xExecute  := TRUE;
		stRobotCommand.eAction   := E_ROBOT_ACTION.MOVE_TO_POINT;
		xRetreatStarted          := stRecipe[uiIndex].xRetreatStarted;
		IF stRecipe[uiIndex].stPoint = E_MACHINE_POINTS.ABOVE  THEN
			stRobotCommand.eSetPoint := stPoints.eAbove;
		ELSIF stRecipe[uiIndex].stPoint = E_MACHINE_POINTS.CHUCK THEN
			stRobotCommand.eSetPoint := stPoints.eChuck;
		ELSIF stRecipe[uiIndex].stPoint = E_MACHINE_POINTS.CHUCK_APPROACH THEN
			stRobotCommand.eSetPoint := stPoints.eChuckApproach;
		ELSIF stRecipe[uiIndex].stPoint = E_MACHINE_POINTS.INSIDE THEN
			stRobotCommand.eSetPoint := stPoints.eInside;
		END_IF

		IF stRobotStatus.xError THEN
			dwErrorActive := dwErrorActive OR ERR_ROBOT_MOTION;
			eState := E_MACHINE_STATE.ERROR ;
			
		ELSIF stMachineStatus.xAlarm THEN
			stRobotCommand.xStop := TRUE;
			dwErrorActive := dwErrorActive OR ERR_MACHINE_ALARM;
			eState := E_MACHINE_STATE.ERROR ;
			
		ELSIF stRobotStatus.xDone THEN
        	eState := E_MACHINE_STATE.RELEASE_ROBOT_ACTION;
			
    	END_IF;
	
	E_MACHINE_STATE.ROBOT_ACTION:
		stRobotCommand.xExecute  := TRUE;
		stRobotCommand.eAction   := stRecipe[uiIndex].eRobotAction;
		
		IF stMachineStatus.xAlarm THEN
			stRobotCommand.xStop := TRUE;
			dwErrorActive := dwErrorActive OR ERR_MACHINE_ALARM;
			eState := E_MACHINE_STATE.ERROR ;
	
		ELSIF stRobotStatus.xError THEN
			dwErrorActive := dwErrorActive OR ERR_ROBOT_ACTION;
			eState := E_MACHINE_STATE.ERROR ;
			
		ELSIF stRobotStatus.xDone THEN   
        	eState := E_MACHINE_STATE.RELEASE_ROBOT_ACTION;
    	END_IF;
		
	E_MACHINE_STATE.RELEASE_ROBOT_ACTION:
		IF NOT stRobotStatus.xBusy
    	AND NOT stRobotStatus.xDone
		AND NOT stRobotStatus.xError THEN
			xRobotDone := stRecipe[uiIndex].xRobotDone;
        	eState := E_MACHINE_STATE.NEXT;
			
		ELSIF stRobotStatus.xError AND  stRecipe[uiIndex].eRobotAction = E_ROBOT_ACTION.MOVE_TO_POINT THEN
			dwErrorActive := dwErrorActive OR ERR_ROBOT_MOTION;
			eState := E_MACHINE_STATE.ERROR;
			
		ELSIF stRobotStatus.xError THEN
			dwErrorActive := dwErrorActive OR ERR_ROBOT_ACTION;
			eState := E_MACHINE_STATE.ERROR;
    	END_IF;
		
	E_MACHINE_STATE.DOOR_OPEN:
		xServiceDoorOpenDemand := TRUE;

    	IF stMachineStatus.xDoorOpen
    	AND NOT stMachineStatus.xAlarm THEN
			xServiceDoorOpenDemand := FALSE;
        	eState := E_MACHINE_STATE.NEXT;
		ELSIF stMachineStatus.xAlarm THEN
			dwErrorActive := dwErrorActive OR ERR_DOOR_OPEN;
			eState := E_MACHINE_STATE.ERROR;
    	END_IF;
	
	E_MACHINE_STATE.DOOR_CLOSE: 
		xServiceDoorCloseDemand := TRUE;

    	IF stMachineStatus.xDoorClosed
    	AND NOT stMachineStatus.xAlarm THEN
			xServiceDoorCloseDemand := FALSE;
        	eState := E_MACHINE_STATE.NEXT;
		ELSIF stMachineStatus.xAlarm THEN
			dwErrorActive := dwErrorActive OR ERR_DOOR_CLOSE;
			eState := E_MACHINE_STATE.ERROR;
    	END_IF;
		
	E_MACHINE_STATE.CHUCK_OPEN: 
		stMachineCommand.xUnclampChuck := TRUE;

    	IF stMachineStatus.xChuckUnclamped 
		AND NOT stMachineStatus.xAlarm  THEN
			stMachineCommand.xUnclampChuck := FALSE;
       		eState := E_MACHINE_STATE.NEXT;
		ELSIF stMachineStatus.xAlarm THEN
			stMachineCommand.xUnclampChuck := FALSE;
			dwErrorActive := dwErrorActive OR ERR_CHUCK_OPEN;
			eState := E_MACHINE_STATE.ERROR;
    	END_IF;
		
	
	E_MACHINE_STATE.CHUCK_CLOSE: 
		stMachineCommand.xClampChuck := TRUE;

    	IF stMachineStatus.xChuckClamped 
		AND NOT stMachineStatus.xAlarm  THEN
			stMachineCommand.xClampChuck := FALSE;
       		eState := E_MACHINE_STATE.NEXT;
		ELSIF stMachineStatus.xAlarm THEN
			stMachineCommand.xClampChuck := FALSE;
			dwErrorActive := dwErrorActive OR ERR_CHUCK_CLOSE;
			eState := E_MACHINE_STATE.ERROR;
    	END_IF;
		
	E_MACHINE_STATE.CYCLE_START:
		IF stMachineStatus.xChuckClamped
    	AND stMachineStatus.xDoorClosed THEN
        	stMachineCommand.xStartCycle := TRUE;
		END_IF;
		
        IF stMachineStatus.xCycleActive AND NOT stMachineStatus.xAlarm THEN
			stMachineCommand.xStartCycle := FALSE;
            eState := E_MACHINE_STATE.NEXT;
		ELSIF stMachineStatus.xAlarm THEN
			stMachineCommand.xStartCycle := FALSE;
			dwErrorActive := dwErrorActive OR ERR_CHUCK_CLOSE;
			eState := E_MACHINE_STATE.ERROR;
        END_IF;
	
	E_MACHINE_STATE.DONE:
		CASE eActualOperation OF 
			E_MACHINE_OPERATION.CHANGE, E_MACHINE_OPERATION.LOAD:
				eActualOperation := E_MACHINE_OPERATION.NONE;
				ePartState := E_PART_STATE.LOADED;						
			E_MACHINE_OPERATION.UNLOAD:
				eActualOperation := E_MACHINE_OPERATION.NONE;
				ePartState := E_PART_STATE.EMPTY;
		END_CASE
		
		IF NOT xExecute THEN
			xRobotDone := FALSE;	
			eState := E_MACHINE_STATE.IDLE;
		END_IF
		
    E_MACHINE_STATE.ERROR:
		uiIndex := 0;
		eActualOperation := E_MACHINE_OPERATION.NONE;
		eGrantedOperation := E_MACHINE_OPERATION.NONE;

    	IF (xReset OR xResetGlobal)
    	AND NOT xGlobalError
    	AND NOT xExecute 
		AND NOT stMachineStatus.xAlarm THEN
			dwErrorLast := dwErrorActive;
        	dwErrorActive := DWORD#0;
        	eState := E_MACHINE_STATE.DISABLED;
    	END_IF;
END_CASE;

IF (eState <> E_MACHINE_STATE.ERROR)
AND NOT xGlobalError THEN
    IF xServiceDoorCloseDemand 
	AND NOT (xAutoDoorOpenLatched OR xServiceDoorOpenDemand)
	AND NOT stMachineStatus.xAlarm THEN
        stMachineCommand.xCloseDoor := TRUE;

    ELSIF (xAutoDoorOpenLatched OR xServiceDoorOpenDemand)
	AND NOT xServiceDoorCloseDemand
    AND NOT stMachineStatus.xCycleActive
    AND NOT stMachineStatus.xAlarm THEN
        stMachineCommand.xOpenDoor := TRUE;
    END_IF;
END_IF;

stPublic.xCanAcceptService := (eState = E_MACHINE_STATE.IDLE) 
			AND (stRobotStatus.eCurrentPoint = stPoints.eAbove)
			AND ePartState <> E_PART_STATE.UNKNOWN
			AND NOT stMachineStatus.xAlarm
			AND NOT stMachineStatus.xCycleActive
    		AND NOT stRobotStatus.xBusy 
			AND NOT stRobotStatus.xError
			AND NOT xGlobalError;

stPublic.xProcessing := stMachineStatus.xCycleActive;
stPublic.xPartReady := stMachineStatus.xCycleDone;
stPublic.xRobotReleased := xRobotDone;
stPublic.xDone := (eState = E_MACHINE_STATE.DONE);
stPublic.xBusy := (eState <> E_MACHINE_STATE.IDLE)
    AND (eState <> E_MACHINE_STATE.DISABLED)
    AND (eState <> E_MACHINE_STATE.ERROR)
	AND (eState <> E_MACHINE_STATE.DONE);
stPublic.xError := (eState = E_MACHINE_STATE.ERROR);
stPublic.xCriticalError := (dwErrorActive AND MASK_CRITICAL_ERROR) <> DWORD#0;
stPublic.xAlarmError    := (dwErrorActive AND MASK_ALARM_ERROR) <> DWORD#0;
stPublic.xExternalError := (dwErrorActive AND MASK_EXTERNAL_ERROR) <> DWORD#0;
							
stPublic.ePartState := ePartState;