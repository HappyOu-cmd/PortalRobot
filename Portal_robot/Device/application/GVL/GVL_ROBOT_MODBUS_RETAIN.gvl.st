{attribute 'qualified_only'}
VAR_GLOBAL RETAIN
	eControlMode      : E_ROBOT_CONTROL_MODE := E_ROBOT_CONTROL_MODE.SOFTMOTION;
	aIpAddress        : ARRAY [0..3] OF BYTE := [BYTE#0, BYTE#0, BYTE#0, BYTE#0];
	uiPort            : UINT := UINT#502;
	uiUnitId          : UINT := UINT#1;
	tResponseTimeout  : TIME := T#500MS;
	tPollInterval     : TIME := T#50MS;
	tHeartbeatTimeout : TIME := T#2S;
END_VAR
