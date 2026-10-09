TYPE ST_GEOMETRY_REQUEST :
STRUCT
	uiAction : UINT; // 1 Enable, 2 Disable, 3 Confirm, 4 Reject, 5 ManualRun, 6 Stop, 7 RemoveSimulation, 8 Call, 9 Auto, 10 Period, 11 Config, 12 Cancel, 13 Capture, 14 SimAlarm, 15 SimAlarmClear, 16 CellSettings
	uiStation : UINT;
	uiMachine : UINT;
	udiValue : UDINT;
	Config : ST_GEOMETRY_CONFIG;
END_STRUCT
END_TYPE
