TYPE ST_TWO_PALLET_DIAG :
STRUCT
	eState : E_TWO_PALLET_STATE := E_TWO_PALLET_STATE.IDLE;
	eFaultState : E_TWO_PALLET_STATE := E_TWO_PALLET_STATE.IDLE;
	uiReason : UINT; // Первая причина блокировки подтверждения/включения магазина
	stWarning : ST_WARNING_EVENT;
END_STRUCT
END_TYPE
