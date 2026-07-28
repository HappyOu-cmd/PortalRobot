TYPE ST_POINT_MANAGER :
STRUCT
	xExecute : BOOL;
	xBusy    : BOOL;
	xDone    : BOOL;
	xInvalid   : BOOL;
	
	eState   : E_POINT_MANAGER_STATE;
	
	dwErrorActive : DWORD;
	dwErrorLast : DWORD;
	
	stErrorActive : ST_POINT_MANAGER_ERROR;
	stErrorLast  : ST_POINT_MANAGER_ERROR;
	
	lrX_MinLimit : LREAL;
	lrY_MinLimit : LREAL;
	lrZ_MinLimit : LREAL;

	lrX_MaxLimit : LREAL;
	lrY_MaxLimit : LREAL;
	lrZ_MaxLimit : LREAL;
END_STRUCT
END_TYPE
