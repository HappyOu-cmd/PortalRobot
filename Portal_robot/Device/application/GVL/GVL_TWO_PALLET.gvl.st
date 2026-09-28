{attribute 'qualified_only'}
VAR_GLOBAL
	Axis1 : REFERENCE TO AXIS_REF_SM3; // Каждый скан REF= Magazine_1 в RunTwoPalletAxis
	Axis2 : REFERENCE TO AXIS_REF_SM3; // Каждый скан REF= Magazine_2 в RunTwoPalletAxis
	astAxis : ARRAY [1..2] OF ST_AXIS;
	astInput : ARRAY [1..2] OF ST_TWO_PALLET_INPUT; // Физические входы: НЕ записываются из HMI
	astOutput : ARRAY [1..2] OF ST_TWO_PALLET_OUTPUT;
	astSimulationConfig : ARRAY [1..2] OF ST_TWO_PALLET_CONFIG; // Только виртуальная среда; не RETAIN
	astActiveConfig : ARRAY [1..2] OF ST_TWO_PALLET_CONFIG; // Конфигурация текущей среды
	astStatus : ARRAY [1..2] OF ST_TWO_PALLET_STATUS;
	astDiag : ARRAY [1..2] OF ST_TWO_PALLET_DIAG;
	astError : ARRAY [1..2] OF ST_TWO_PALLET_ERRORS;
	auiCommand : ARRAY [1..2] OF UINT;
	auiValue : ARRAY [1..2] OF UINT;
	audiRevision : ARRAY [1..2] OF UDINT;
	xModeChangeAllowed : BOOL;
	xModeChanged : BOOL;
	astStatic : ARRAY [1..2] OF ST_MAGAZINE_INVENTORY;
	axSimulationAutoSwapEnabled : ARRAY [1..2] OF BOOL; // Только виртуальная среда; не RETAIN
END_VAR
VAR_GLOBAL RETAIN
	uiMode : UINT := UINT#1; // По умолчанию два двухпалетных; 0: два статичных; 1: два двухпалетных
	astConfig : ARRAY [1..2] OF ST_TWO_PALLET_CONFIG;
	astStore : ARRAY [1..2] OF ST_TWO_PALLET_STORE;
	lrStaticPitchX : LREAL := 60.0;
	lrStaticPitchY : LREAL := 60.0;
	lrTwinPitchX : LREAL := 70.0;
	lrTwinPitchY : LREAL := 70.0;
	axAutoSwapEnabled : ARRAY [1..2] OF BOOL := [TRUE, TRUE];
	xAutoSwapDefaultsApplied : BOOL; // Однократная инициализация новой RETAIN-настройки
END_VAR
