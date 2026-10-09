{attribute 'qualified_only'}
VAR_GLOBAL
	astStatus : ARRAY [1..2] OF ST_GEOMETRY_STATUS;
	astSignals : ARRAY [1..2] OF ST_GEOMETRY_SIGNALS;
	astActiveConfig : ARRAY [1..2] OF ST_GEOMETRY_CONFIG;
	astActiveMemory : ARRAY [1..2] OF ST_GEOMETRY_MEMORY;
	astCalls : ARRAY [1..3] OF ST_GEOMETRY_CALL;
	astSimulationConfig : ARRAY [1..2] OF ST_GEOMETRY_CONFIG;
	astSimulationMemory : ARRAY [1..2] OF ST_GEOMETRY_MEMORY;
	astSimulationCalls : ARRAY [1..3] OF ST_GEOMETRY_CALL;
	axSimulationAlarm : ARRAY [1..2] OF BOOL;
	auiAction : ARRAY [1..2] OF UINT;
	astWarning : ARRAY [1..2] OF ST_WARNING_EVENT;
	stCellWarning : ST_WARNING_EVENT;
	astEvents : ARRAY [1..100] OF ST_GEOMETRY_EVENT;
	uiLastStation : UINT;
	uiEnvironment : UINT;
	xSupported : BOOL;
	xAutoChangeAllowed : BOOL;
	xSettingsAllowed : BOOL;
	axCallAllowed : ARRAY [1..3] OF BOOL;
	axCancelAllowed : ARRAY [1..3] OF BOOL;
	auiActiveCount : ARRAY [1..3] OF UINT;
	auiSimulationCount : ARRAY [1..3] OF UINT;
END_VAR
VAR_GLOBAL PERSISTENT RETAIN
	astConfig : ARRAY [1..2] OF ST_GEOMETRY_CONFIG;
	astMemory : ARRAY [1..2] OF ST_GEOMETRY_MEMORY;
	astRetainCalls : ARRAY [1..3] OF ST_GEOMETRY_CALL;
	udiNextCallId : UDINT;
	udiEventSequence : UDINT;
	xAutoEnabled : BOOL := FALSE;
	auiPeriod : ARRAY [1..3] OF UINT := [20, 20, 20];
	auiCount : ARRAY [1..3] OF UINT;
	xWaitWhenOccupied : BOOL := TRUE;
	tTransportTimeout : TIME := T#10S;
	tDriveFeedbackTimeout : TIME := T#3S;
	tResetPulse : TIME := T#1S;
END_VAR
