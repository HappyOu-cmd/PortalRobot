METHOD PRIVATE PublishGeometryControl
VAR
	uiWarningEvent : UINT;
	xWaitWarningActive : BOOL;
END_VAR

// --- BEGIN IMPLEMENTATION ---

GVL_HMI.astGeometryStatus := GVL_GEOMETRY_CONTROL.astStatus;
// Подсветка следует накопленному предупреждению, включая его сброс в этом скане.
xWaitWarningActive := FALSE;
FOR uiWarningEvent := UINT#1 TO UINT#100 DO
	IF GVL_ALARM.Events[uiWarningEvent].xActive
	AND (GVL_ALARM.Events[uiWarningEvent].eSource = E_ALARM_SOURCE.CELL)
	AND (GVL_ALARM.Events[uiWarningEvent].eSeverity = E_ALARM_SEVERITY.WARNING)
	AND (GVL_ALARM.Events[uiWarningEvent].uiCode = UINT#52) THEN xWaitWarningActive := TRUE; END_IF;
END_FOR;
FOR uiGeometry := UINT#1 TO UINT#2 DO
	GVL_HMI.astGeometryStatus[uiGeometry].xCallWaitWarning := xWaitWarningActive
		AND (GVL_GEOMETRY_CONTROL.astStatus[uiGeometry].xEnabled
			OR NOT (GVL_GEOMETRY_CONTROL.astStatus[1].xEnabled OR GVL_GEOMETRY_CONTROL.astStatus[2].xEnabled));
END_FOR;
GVL_HMI.astGeometryConfig := GVL_GEOMETRY_CONTROL.astActiveConfig;
GVL_HMI.astGeometryCalls := GVL_GEOMETRY_CONTROL.astCalls;
GVL_HMI.auiGeometryPeriod := Persistent_Value.auiPeriod;
GVL_HMI.auiGeometryCount := GVL_GEOMETRY_CONTROL.auiActiveCount;
GVL_HMI.axGeometryCallAllowed := GVL_GEOMETRY_CONTROL.axCallAllowed;
GVL_HMI.axGeometryCancelAllowed := GVL_GEOMETRY_CONTROL.axCancelAllowed;
GVL_HMI.xGeometryAutoEnabled := Persistent_Value.xAutoEnabled;
GVL_HMI.xGeometryAutoChangeAllowed := GVL_GEOMETRY_CONTROL.xAutoChangeAllowed;
GVL_HMI.xGeometrySupported := GVL_GEOMETRY_CONTROL.xSupported;
GVL_HMI.xGeometryWaitWhenOccupied := Persistent_Value.xWaitWhenOccupied;
GVL_HMI.tGeometryTransportTimeout := Persistent_Value.tTransportTimeout;
GVL_HMI.tGeometryFeedbackTimeout := Persistent_Value.tDriveFeedbackTimeout;
GVL_HMI.tGeometryResetPulse := Persistent_Value.tResetPulse;
GVL_HMI.tGeometryWaitWarningTimeout := Persistent_Value.tWaitWarningTimeout;
GVL_HMI.xGeometrySettingsAllowed := GVL_GEOMETRY_CONTROL.xSettingsAllowed;
// Снимок FIFO имеет версию: gateway читает одинаковый Seq до/после payload.
GVL_HMI.udiGeometryEventSequence := UDINT#0;
GVL_HMI.astGeometryEvents := GVL_GEOMETRY_CONTROL.astEvents;
GVL_HMI.udiGeometryEventSequence := Persistent_Value.udiEventSequence;
IF GVL_CELL_SETTINGS.eTestEnvironment = E_CELL_TEST_ENVIRONMENT.NORMAL THEN
	Persistent_Value.astMemory := GVL_GEOMETRY_CONTROL.astActiveMemory;
	Persistent_Value.astRetainCalls := GVL_GEOMETRY_CONTROL.astCalls;
	Persistent_Value.auiCount := GVL_GEOMETRY_CONTROL.auiActiveCount;
ELSE
	GVL_GEOMETRY_CONTROL.astSimulationMemory := GVL_GEOMETRY_CONTROL.astActiveMemory;
	GVL_GEOMETRY_CONTROL.astSimulationCalls := GVL_GEOMETRY_CONTROL.astCalls;
	GVL_GEOMETRY_CONTROL.auiSimulationCount := GVL_GEOMETRY_CONTROL.auiActiveCount;
END_IF;
// Фиксированные владельцы счётчиков: переключение среды не меняет идентичность
// OPC UA тега и не превращает старое значение NORMAL в выпуск SIMULATION.
FOR uiGeometry := UINT#1 TO UINT#2 DO
	GVL_HMI.audiGeometryProducedNormal[uiGeometry] := Persistent_Value.astMemory[uiGeometry].udiProducedPartsTotal;
	GVL_HMI.audiGeometryProducedSimulation[uiGeometry] := GVL_GEOMETRY_CONTROL.astSimulationMemory[uiGeometry].udiProducedPartsTotal;
END_FOR;
