METHOD PRIVATE PublishGeometryControl

// --- BEGIN IMPLEMENTATION ---

GVL_HMI.astGeometryStatus := GVL_GEOMETRY_CONTROL.astStatus;
GVL_HMI.astGeometryConfig := GVL_GEOMETRY_CONTROL.astActiveConfig;
GVL_HMI.astGeometryCalls := GVL_GEOMETRY_CONTROL.astCalls;
GVL_HMI.auiGeometryPeriod := GVL_GEOMETRY_CONTROL.auiPeriod;
GVL_HMI.auiGeometryCount := GVL_GEOMETRY_CONTROL.auiActiveCount;
GVL_HMI.axGeometryCallAllowed := GVL_GEOMETRY_CONTROL.axCallAllowed;
GVL_HMI.axGeometryCancelAllowed := GVL_GEOMETRY_CONTROL.axCancelAllowed;
GVL_HMI.xGeometryAutoEnabled := GVL_GEOMETRY_CONTROL.xAutoEnabled;
GVL_HMI.xGeometryAutoChangeAllowed := GVL_GEOMETRY_CONTROL.xAutoChangeAllowed;
GVL_HMI.xGeometrySupported := GVL_GEOMETRY_CONTROL.xSupported;
GVL_HMI.xGeometryWaitWhenOccupied := GVL_GEOMETRY_CONTROL.xWaitWhenOccupied;
GVL_HMI.tGeometryTransportTimeout := GVL_GEOMETRY_CONTROL.tTransportTimeout;
GVL_HMI.tGeometryFeedbackTimeout := GVL_GEOMETRY_CONTROL.tDriveFeedbackTimeout;
GVL_HMI.tGeometryResetPulse := GVL_GEOMETRY_CONTROL.tResetPulse;
GVL_HMI.xGeometrySettingsAllowed := GVL_GEOMETRY_CONTROL.xSettingsAllowed;
// Снимок FIFO имеет версию: gateway читает одинаковый Seq до/после payload.
GVL_HMI.udiGeometryEventSequence := UDINT#0;
GVL_HMI.astGeometryEvents := GVL_GEOMETRY_CONTROL.astEvents;
GVL_HMI.udiGeometryEventSequence := GVL_GEOMETRY_CONTROL.udiEventSequence;
IF GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.NORMAL THEN
	GVL_GEOMETRY_CONTROL.astMemory := GVL_GEOMETRY_CONTROL.astActiveMemory;
	GVL_GEOMETRY_CONTROL.astRetainCalls := GVL_GEOMETRY_CONTROL.astCalls;
	GVL_GEOMETRY_CONTROL.auiCount := GVL_GEOMETRY_CONTROL.auiActiveCount;
ELSE
	GVL_GEOMETRY_CONTROL.astSimulationMemory := GVL_GEOMETRY_CONTROL.astActiveMemory;
	GVL_GEOMETRY_CONTROL.astSimulationCalls := GVL_GEOMETRY_CONTROL.astCalls;
	GVL_GEOMETRY_CONTROL.auiSimulationCount := GVL_GEOMETRY_CONTROL.auiActiveCount;
END_IF;
// Фиксированные владельцы счётчиков: переключение среды не меняет идентичность
// OPC UA тега и не превращает старое значение NORMAL в выпуск SIMULATION.
FOR uiGeometry := UINT#1 TO UINT#2 DO
	GVL_HMI.audiGeometryProducedNormal[uiGeometry] := GVL_GEOMETRY_CONTROL.astMemory[uiGeometry].udiProducedPartsTotal;
	GVL_HMI.audiGeometryProducedSimulation[uiGeometry] := GVL_GEOMETRY_CONTROL.astSimulationMemory[uiGeometry].udiProducedPartsTotal;
END_FOR;
