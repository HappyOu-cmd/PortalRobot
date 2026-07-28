FUNCTION_BLOCK FB_HMI
VAR_INPUT
END_VAR
VAR_OUTPUT
END_VAR
VAR
END_VAR
VAR CONSTANT
	ERR_INTERNAL : DWORD := DWORD#16#0000_0001; // Зарезервированная внутренняя ошибка HMI
END_VAR
VAR_IN_OUT
	GroupData: ST_AXIS_GROUP; // Данные группы осей
	HMI: ST_HMI; // Команды и статусы интерфейса оператора
END_VAR

// --- BEGIN IMPLEMENTATION ---

HMI.Status.lrActualX := GroupData.Status.ActualX;
HMI.Status.lrActualY := GroupData.Status.ActualY;
HMI.Status.lrActualZ := GroupData.Status.ActualZ;
HMI.ActualX := HMI.Status.lrActualX;
HMI.ActualY := HMI.Status.lrActualY;
HMI.ActualZ := HMI.Status.lrActualZ;
HMI.Diag.xActive := TRUE;

// FB_HMI пока не содержит операций, способных сформировать собственную ошибку.
HMI.Error.dwErrorActive := DWORD#0;
HMI.Error.stErrorActive := UpdateErrorView(dwError := HMI.Error.dwErrorActive);
HMI.Error.stErrorLast := UpdateErrorView(dwError := HMI.Error.dwErrorLast);
