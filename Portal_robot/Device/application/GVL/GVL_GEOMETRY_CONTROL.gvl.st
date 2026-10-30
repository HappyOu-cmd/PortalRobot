{attribute 'qualified_only'}
VAR_GLOBAL
	astStatus : ARRAY [1..2] OF ST_GEOMETRY_STATUS;
	astSignals : ARRAY [1..2] OF ST_GEOMETRY_SIGNALS;
	astActiveConfig : ARRAY [1..2] OF ST_GEOMETRY_CONFIG;
	astActiveMemory : ARRAY [1..2] OF ST_GEOMETRY_MEMORY;
	astCalls : ARRAY [1..3] OF ST_GEOMETRY_CALL;
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
