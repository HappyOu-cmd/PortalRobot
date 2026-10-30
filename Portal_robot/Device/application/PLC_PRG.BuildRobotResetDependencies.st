METHOD PRIVATE BuildRobotResetDependencies
VAR
	uiOwner : UINT;
	dwOwnerBit : DWORD;
END_VAR

// --- BEGIN IMPLEMENTATION ---

// Снимок после вызовов владельцев, перед FB_ROBOT. Не смешиваем первичную
// причину оборудования с зависимой ошибкой родителя и не изменяем GVL-теги.
stRobotResetDependencies.dwStopOwners := DWORD#0;
stRobotResetDependencies.dwLiveCauses := DWORD#0;
stRobotResetDependencies.dwResetBusy := DWORD#0;
FOR uiOwner := UINT#1 TO UINT#3 DO
	dwOwnerBit := SHL(DWORD#1, uiOwner - UINT#1);
	IF GVL_MACHINE.Status[uiOwner].xCriticalError THEN
		stRobotResetDependencies.dwStopOwners := stRobotResetDependencies.dwStopOwners OR dwOwnerBit;
		IF GVL_MACHINE.Status[uiOwner].stIo.xAlarm THEN
			stRobotResetDependencies.dwLiveCauses := stRobotResetDependencies.dwLiveCauses OR dwOwnerBit;
		END_IF;
	END_IF;
END_FOR;
FOR uiOwner := UINT#1 TO UINT#2 DO
	dwOwnerBit := SHL(DWORD#1, uiOwner + UINT#2);
	IF GVL_MAGAZINE.astPartStatus[uiOwner].xRobotStopRequired THEN
		stRobotResetDependencies.dwStopOwners := stRobotResetDependencies.dwStopOwners OR dwOwnerBit;
	END_IF;
	dwOwnerBit := SHL(DWORD#1, uiOwner + UINT#4);
	IF GVL_GEOMETRY_CONTROL.xSupported AND GVL_GEOMETRY_CONTROL.astStatus[uiOwner].xRobotStopRequired THEN
		stRobotResetDependencies.dwStopOwners := stRobotResetDependencies.dwStopOwners OR dwOwnerBit;
		IF GEOMETRY[uiOwner].xDriveAlarm THEN
			stRobotResetDependencies.dwLiveCauses := stRobotResetDependencies.dwLiveCauses OR dwOwnerBit;
		END_IF;
	END_IF;
	IF GVL_GEOMETRY_CONTROL.xSupported AND GVL_GEOMETRY_CONTROL.astStatus[uiOwner].xResetBusy THEN
		stRobotResetDependencies.dwResetBusy := stRobotResetDependencies.dwResetBusy OR dwOwnerBit;
	END_IF;
	dwOwnerBit := SHL(DWORD#1, uiOwner + UINT#6);
	IF (GVL_TWO_PALLET.uiMode = UINT#1) AND axTwinRobotStopLatched[uiOwner] THEN
		stRobotResetDependencies.dwStopOwners := stRobotResetDependencies.dwStopOwners OR dwOwnerBit;
		IF TWIN[uiOwner].Input.xDriveError THEN
			stRobotResetDependencies.dwLiveCauses := stRobotResetDependencies.dwLiveCauses OR dwOwnerBit;
		END_IF;
	END_IF;
END_FOR;
