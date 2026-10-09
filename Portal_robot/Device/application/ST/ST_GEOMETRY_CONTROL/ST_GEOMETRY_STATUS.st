TYPE ST_GEOMETRY_STATUS :
STRUCT
	uiState : UINT; // 0 выключен, 1 свободен, 2 передача роботом, 3 транспорт, 4 ждёт изъятия, 5 восстановление, 6 авария, 7 ручной ход
	xEnabled : BOOL;
	xReady : BOOL;
	xOccupied : BOOL;
	xPartStored : BOOL; // Подтверждённая укладка, отдельно от резерва и неизвестности
	xReserved : BOOL;
	xPartAtEnd : BOOL;
	xDriveRunning : BOOL;
	xDriveAlarm : BOOL;
	xError : BOOL;
	xRobotStopRequired : BOOL;
	xEnableAllowed : BOOL;
	xDisableAllowed : BOOL;
	xConfirmAllowed : BOOL;
	xConfirmationActive : BOOL;
	xRecoveryRequired : BOOL; // Проверка всей ленты нужна независимо от попытки включения
	xManualStartAllowed : BOOL;
	xResetAllowed : BOOL;
	xResetBusy : BOOL;
	xConfigAllowed : BOOL;
	xPointWriteAllowed : BOOL; // Запись данных: связь/SoftMotion/валидные лимиты, без технологических блокировок
	xSimulationRemoveAllowed : BOOL;
	xSimulationAlarmAllowed : BOOL;
	xConfigured : BOOL;
	udiProducedPartsTotal : UDINT;
	udiPartId : UDINT;
	uiMachine : UINT;
	uiProductType : UINT;
	rTravel : REAL; // Положение модели 0..1; в NORMAL только оценка для изображения
END_STRUCT
END_TYPE
