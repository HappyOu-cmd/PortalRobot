TYPE ST_TEST_SCENARIO_BUFFER :
STRUCT
	udiLoadSeq : UDINT;
	uiTypeCount : UINT;
	xMagazineEnabled : BOOL;
	auiMachineState : ARRAY [1..3] OF UINT; // 0 disabled, 1 empty, 2 blank processing, 3 detail ready
	auiMachineType : ARRAY [1..3] OF UINT;
	auiSlotContent : ARRAY [1..120] OF UINT; // Zone 2 магазина 1: 0 empty, 1 blank, 2 detail
	auiSlotType : ARRAY [1..120] OF UINT;
	auiGripperContent : ARRAY [1..2] OF UINT;
	auiGripperType : ARRAY [1..2] OF UINT;
	uiOrientation : UINT; // 0 blank, 1 detail
	dwCellFaultMask : DWORD; // b0: противоречивое наличие детали в обоих захватах
	dwRobotFaultMask : DWORD; // b0 wrong action; b1..b4 grippers; b5..b8 point validation
	dwMagazineFaultMask : DWORD; // b0 wrong op; b1 no blank; b2 no slot; b3 invalid slot; b4 content; b5 geometry
	adwMachineFaultMask : ARRAY [1..3] OF DWORD; // b0 alarm; b1 door; b2 chuck; b3..b10 timeouts
END_STRUCT
END_TYPE
