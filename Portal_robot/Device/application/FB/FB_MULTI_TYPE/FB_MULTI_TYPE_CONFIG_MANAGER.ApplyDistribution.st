METHOD PRIVATE ApplyDistribution
VAR
	uiMachine       : UINT; // Индекс станка
	uiType          : UINT; // Индекс типа
	uiSlot          : UINT; // Индекс слота
	uiAssigned      : UINT; // Число уже назначенных слотов
	uiRemaining     : UINT; // Остаток после целочисленного деления
	uiBestType      : UINT; // Тип с наибольшей дробной частью
	uiBestRemainder : UINT; // Наибольшая дробная часть
	auiMachineShare : ARRAY [1..3] OF UINT; // Число станков типа
	auiQuota        : ARRAY [1..3] OF UINT; // Число слотов типа
	auiRemainder    : ARRAY [1..3] OF UINT; // Остаток квоты
	axExtraAssigned : ARRAY [1..3] OF BOOL; // Дополнительный слот уже выдан типу
END_VAR

// --- BEGIN IMPLEMENTATION ---

FOR uiType := UINT#1 TO UINT#3 DO
	auiMachineShare[uiType] := UINT#0;
	auiQuota[uiType] := UINT#0;
	auiRemainder[uiType] := UINT#0;
	axExtraAssigned[uiType] := FALSE;
END_FOR;

FOR uiMachine := UINT#1 TO UINT#3 DO
	IF (Config.auiMachineType[uiMachine] >= UINT#1)
	AND (Config.auiMachineType[uiMachine] <= Config.uiTypeCount) THEN
		auiMachineShare[Config.auiMachineType[uiMachine]] :=
			auiMachineShare[Config.auiMachineType[uiMachine]] + UINT#1;
	END_IF;
END_FOR;

uiAssigned := UINT#0;
FOR uiType := UINT#1 TO Config.uiTypeCount DO
	auiQuota[uiType] := (Status.uiActiveSlotCount * auiMachineShare[uiType]) / UINT#3;
	auiRemainder[uiType] := (Status.uiActiveSlotCount * auiMachineShare[uiType]) MOD UINT#3;
	uiAssigned := uiAssigned + auiQuota[uiType];
END_FOR;

uiRemaining := Status.uiActiveSlotCount - uiAssigned;
WHILE uiRemaining > UINT#0 DO
	uiBestType := UINT#0;
	uiBestRemainder := UINT#0;
	FOR uiType := UINT#1 TO Config.uiTypeCount DO
		IF NOT axExtraAssigned[uiType]
		AND ((uiBestType = UINT#0) OR (auiRemainder[uiType] > uiBestRemainder)) THEN
			uiBestType := uiType;
			uiBestRemainder := auiRemainder[uiType];
		END_IF;
	END_FOR;
	IF uiBestType = UINT#0 THEN
		uiBestType := UINT#1;
	END_IF;
	auiQuota[uiBestType] := auiQuota[uiBestType] + UINT#1;
	axExtraAssigned[uiBestType] := TRUE;
	uiRemaining := uiRemaining - UINT#1;
END_WHILE;

uiSlot := UINT#1;
FOR uiType := UINT#1 TO Config.uiTypeCount DO
	uiAssigned := UINT#0;
	WHILE (uiAssigned < auiQuota[uiType])
	AND (uiSlot <= Status.uiActiveSlotCount) DO
		Config.auiSlotType[uiSlot] := uiType;
		uiAssigned := uiAssigned + UINT#1;
		uiSlot := uiSlot + UINT#1;
	END_WHILE;
END_FOR;

FOR uiSlot := Status.uiActiveSlotCount + UINT#1 TO SINT_TO_UINT(GVL_CELL_SETTINGS.NumberDetail) DO
	Config.auiSlotType[uiSlot] := UINT#0;
END_FOR;
