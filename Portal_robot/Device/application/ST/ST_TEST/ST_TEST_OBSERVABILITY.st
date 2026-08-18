TYPE ST_TEST_OBSERVABILITY :
STRUCT
	udiAppliedScenarioSeq : UDINT;
	uiCellState : UINT;
	uiRobotState : UINT;
	uiRobotAction : UINT;
	uiRobotPoint : UINT;
	uiMagazineState : UINT;
	uiMagazineOperation : UINT;
	uiTakeSlot : UINT;
	uiPutSlot : UINT;
	auiMachineState : ARRAY [1..3] OF UINT;
	auiMachineOperation : ARRAY [1..3] OF UINT;
	uiSelectedMachine : UINT;
	uiSelectedType : UINT;
	uiErrorSource : UINT;
	dwErrorCode : DWORD;
END_STRUCT
END_TYPE
