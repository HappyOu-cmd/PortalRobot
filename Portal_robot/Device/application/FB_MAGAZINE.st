FUNCTION_BLOCK FB_MAGAZINE
VAR_INPUT
	stPoints             	: ST_MACHINE_POINTS;
	stRobotStatus  			: ST_ROBOT_STATUS;
	stMagazineCommand       : ST_MAGAZINE_COMMAND;
	xHmiEnable				: BOOL;
	xHmiDisable				: BOOL;
	
END_VAR
VAR_OUTPUT
	stRobotCommand 			: ST_ROBOT_COMMAND;
	stMagazineStatus      	: ST_MAGAZINE_STATUS;
	stMagazineDiag          : ST_MAGAZINE_DIAG;
	dwErrorActive        	: DWORD;
    dwErrorLast          	: DWORD;
END_VAR
VAR
	eGrantedOperation       : E_MAGAZINE_OPERATION;
	rtEnabledMagazine       : R_TRIG;
	rtDisabledMagaizne      : R_TRIG;
END_VAR

VAR_IN_OUT
	stDetail : ARRAY [1..GVL_CELL_SETTINGS.NumberDetail] OF ST_DETAIL;
END_VAR



// --- BEGIN IMPLEMENTATION ---

rtEnabledMagazine  (CLK :=xHmiEnable);
rtDisabledMagaizne  (CLK :=xHmiDisable);



IF NOT stMagazineStatus.xOutBlank
AND NOT stRobotStatus.xBlankAvailable
AND NOT stRobotStatus.xDetailAvailable THEN
    eGrantedOperation := E_MAGAZINE_OPERATION.TAKE;

ELSIF NOT stMagazineStatus.xOutFreeSlot 
AND stMagazineStatus.xOutBlank
AND stRobotStatus.xDetailAvailable THEN 
	eGrantedOperation := E_MAGAZINE_OPERATION.PUT;

ELSIF NOT stMagazineStatus.xOutFreeSlot 
AND NOT stMagazineStatus.xOutBlank 
AND stRobotStatus.xDetailAvailable THEN
	eGrantedOperation := E_MAGAZINE_OPERATION.CHANGE;
ELSE
	eGrantedOperation := E_MAGAZINE_OPERATION.NONE;
END_IF

stMagazineStatus.iCurrentBlank := FIND_BLANK(stDetail := stDetail);
stMagazineStatus.iCurrentFreeSlot := FIND_FREE_SLOT(stDetail := stDetail);
stMagazineStatus.xOutBlank := stMagazineStatus.iCurrentBlank = 0;
stMagazineStatus.xOutFreeSlot := stMagazineStatus.xOutFreeSlot = 0;