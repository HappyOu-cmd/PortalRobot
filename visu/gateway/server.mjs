import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AttributeIds,
  BrowseDirection,
  ClientMonitoredItemGroup,
  ClientSubscription,
  DataType,
  MessageSecurityMode,
  NodeClass,
  NodeClassMask,
  OPCUAClient,
  SecurityPolicy,
  TimestampsToReturn,
  Variant,
} from 'node-opcua';
import { WebSocketServer } from 'ws';
import {
  CyclogramStore,
  classifyCyclogram,
  isTransientRobotActivity,
  stabilizeCyclogramStates,
  createCyclogramWorkbook,
  cyclogramExportFilename,
  cyclogramRequiredSymbols,
} from './cyclogram.mjs';
import { CellEventClassifier, CellEventStore, describeOperatorCommand } from './cell-events.mjs';
import { AuthStore, AuthStoreError } from './auth-store.mjs';
import { StatisticsStore, StatisticsStoreError } from './statistics-store.mjs';
import { TestStore } from './test-store.mjs';
import { isHmiCommandAllowedDuringTest } from './test-session.mjs';

const endpointUrl = process.env.OPCUA_ENDPOINT ?? 'opc.tcp://127.0.0.1:4840';
const gatewayPort = Number(process.env.GATEWAY_PORT ?? 3001);
const gatewayHost = process.env.GATEWAY_HOST ?? '127.0.0.1';
const reconnectDelayMs = Number(process.env.OPCUA_RECONNECT_MS ?? 3000);
const publishingIntervalMs = Math.max(10, Number(process.env.OPCUA_PUBLISHING_MS ?? 50));
const samplingIntervalMs = Math.max(10, Number(process.env.OPCUA_SAMPLING_MS ?? 50));
const uiRefreshIntervalMs = Math.max(20, Number(process.env.OPCUA_UI_REFRESH_MS ?? 50));
const cyclogramSettleMs = Math.max(40, Number(process.env.CYCLOGRAM_SETTLE_MS ?? 80));
const nonVisualSnapshotSymbols = new Set(['udiHmiHeartbeat', 'udiPlcHeartbeat']);
const plcRootName = process.env.OPCUA_GVL ?? 'GVL_HMI';
const cyclogramRetentionHours = Number(process.env.CYCLOGRAM_RETENTION_HOURS ?? 2160);
const cyclogramDbPath = process.env.CYCLOGRAM_DB_PATH ?? 'gateway/data/cyclogram.sqlite';
const cyclogramTimeZone = process.env.CYCLOGRAM_TIMEZONE ?? 'Asia/Yekaterinburg';
const cellEventsDbPath = process.env.CELL_EVENTS_DB_PATH ?? 'gateway/data/cell-events.sqlite';
const cellEventsRetentionDays = Number(process.env.CELL_EVENTS_RETENTION_DAYS ?? 90);
const testDbPath = process.env.TEST_DB_PATH ?? 'gateway/data/tests.sqlite';
const authDbPath = process.env.AUTH_DB_PATH ?? 'gateway/data/auth.sqlite';
const statisticsDbPath = process.env.STATISTICS_DB_PATH ?? 'gateway/data/statistics.sqlite';
const authSessionHours = Math.max(1, Number(process.env.AUTH_SESSION_HOURS ?? 12));
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = normalize(join(__dirname, '..', 'dist'));
const bundledTestPython = normalize(join(
  __dirname, '..', '..', 'robot_simulator', '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
));
const testRunnerPython = process.env.TEST_RUNNER_PYTHON
  ?? (existsSync(bundledTestPython) ? bundledTestPython : 'python');
const robotSimulatorControlUrl = process.env.ROBOT_SIM_CONTROL_URL ?? 'http://127.0.0.1:8765';

const faultStatusLeaves = ['xAllowed', 'xActive', 'xBusy', 'xResetAllowed', 'xRejected', 'udiRejectSequence'];
const faultStatusSymbols = (root) => faultStatusLeaves.map((leaf) => `${root}.${leaf}`);
const faultRequiredSymbols = [
  'xErrorSimulationEnable', 'xErrorSimulationEnabled', 'xSimAxisGroupErrorAllowed',
  'xSimulationAccelerationEnable', 'xSimulationAccelerationActive',
  'xSimulationAccelerationChangeAllowed', 'uiSimulationTimeFactor',
  'uiSimulationTimeFactorApplied', 'xSimulationAccelerationError',
  'xCellSettingsChangeAllowed',
  'lrSafetyHomeX', 'lrSafetyHomeY', 'lrSafetyHomeZ', 'lrSafetyHomeSpeedFactor',
  'lrSafetyHomeToleranceX', 'lrSafetyHomeToleranceY', 'lrSafetyHomeToleranceZ',
  'stCellMachineTimeouts.tRobotMove', 'stCellMachineTimeouts.tRobotAction',
  'stCellMachineTimeouts.tRobotRelease', 'stCellMachineTimeouts.tDoorOpen',
  'stCellMachineTimeouts.tDoorClose', 'stCellMachineTimeouts.tChuckOpen',
  'stCellMachineTimeouts.tChuckClose', 'stCellMachineTimeouts.tCycleStart',
  'xSimAxisGroupError', 'xSimRobotWrongAction', 'xSimCellBothGrippers',
  'xSimGripper1Fault', 'xSimGripper2Fault', 'xSimGripperRotationFault', 'xSimGripperGlobalFault',
  'xSimPointXOutOfLimit', 'xSimPointYOutOfLimit', 'xSimPointZOutOfLimit', 'xSimPointInvalidVelocity',
  'xSimMagazineWrongOperation', 'xSimMagazineNoBlank', 'xSimMagazineNoFreeSlot',
  'xSimMagazineInvalidSlot', 'xSimMagazineSlotContent', 'xSimMagazineGeometry',
  'tMachineDoorOpenTime', 'tMachineDoorCloseTime', 'tMachineChuckOpenTime', 'tMachineChuckCloseTime',
  'tGripper1OpenTime', 'tGripper1CloseTime', 'tGripper2OpenTime', 'tGripper2CloseTime', 'tGripperChangeTime',
  ...[1, 2, 3].flatMap((index) => [
    `axSimAxisJogConflict[${index}]`, `axMachineSimReset[${index}]`,
    `axMachineSimAlarm[${index}]`, `axMachineSimDoorFault[${index}]`, `axMachineSimChuckFault[${index}]`,
    `axMachineTimeoutRobotMove[${index}]`, `axMachineTimeoutRobotAction[${index}]`, `axMachineTimeoutRobotRelease[${index}]`,
    `axMachineTimeoutDoorOpen[${index}]`, `axMachineTimeoutDoorClose[${index}]`,
    `axMachineTimeoutChuckOpen[${index}]`, `axMachineTimeoutChuckClose[${index}]`, `axMachineTimeoutCycleStart[${index}]`,
    `tMachineCycleTime[${index}]`,
    ...faultStatusSymbols(`astAxisFaultStatus[${index}]`),
    ...faultStatusSymbols(`astMachineFaultStatus[${index}]`),
  ]),
  ...faultStatusSymbols('stAxisGroupFaultStatus'),
  ...faultStatusSymbols('stRobotFaultStatus'),
  ...faultStatusSymbols('stCellFaultStatus'),
  ...faultStatusSymbols('stGripperFaultStatus'),
  ...faultStatusSymbols('stPointFaultStatus'),
  ...faultStatusSymbols('stMagazineFaultStatus'),
];

const requiredSymbols = [...new Set([
  'udiPlcHeartbeat',
  'xGlobalError',
  'stCellStatus.xRunning',
  'stCellStatus.xError',
  'stCellStatus.xStopPending',
  'stCellStatus.xReadyToStart',
  'stCellStatus.xStartAllowed',
  'stCellStatus.xStopAllowed',
  'stCellStatus.xResetAllowed',
  'stCellStatus.xManualAllowed',
  'stCellStatus.xAutomaticAllowed',
  'stCellStatus.xDrivesReady',
  'stCellStatus.xRobotReady',
  'stCellStatus.xMagazineReady',
  'stCellStatus.xSafetyHomeRequired',
  'stCellStatus.xRobotAtSafetyHome',
  'stCellStatus.xStartCheckCellIdle',
  'stCellStatus.xStartCheckAutomaticMode',
  'stCellStatus.xStartCheckNoBlockingError',
  'stCellStatus.xStartCheckRobotInterfaceReady',
  'stCellStatus.xStartCheckConfigurationValid',
  'stCellStatus.xStartCheckDrivesReady',
  'stCellStatus.xStartCheckRobotReady',
  'stCellStatus.xStartCheckMagazineReady',
  'stCellStatus.xStartCheckTaskAvailable',
  'stCellStatus.xStartCheckSafetyHome',
  'stCellStatus.uiStartConditionsMet',
  'stCellStatus.uiStartConditionsTotal',
  'stCellStatus.uiReadyMachines',
  'stCellStatus.uiSelectedMachine',
  'stCellStatus.xOperatorPromptActive',
  'stCellStatus.xOperatorChoiceAllowed',
  'stCellStatus.xOperatorCancelAllowed',
  'stCellStatus.uiOperatorPrompt',
  'stCellStatus.uiOperatorTypeMask',
  'stCellStatus.uiOperatorMachineMask',
  'stCellDiag.eState',
  'rLoadCNC_1',
  'rLoadCNC_2',
  'rLoadCNC_3',
  'rRobot',
  'xCellManual',
  'xModbusMode',
  'uiRobotControlModeRequest',
  'xRobotModeChangeAllowed',
  'xModbusSettingsChangeAllowed',
  'uiRobotModeRejectReason',
  'uiModbusSettingsRejectReason',
  'uiModbusIpOctet1',
  'uiModbusIpOctet2',
  'uiModbusIpOctet3',
  'uiModbusIpOctet4',
  'uiModbusPort',
  'uiModbusUnitId',
  'udiModbusResponseTimeoutMs',
  'udiModbusPollIntervalMs',
  'udiModbusHeartbeatTimeoutMs',
  'stRobotModbusStatus.xConfigValid',
  'stRobotModbusStatus.xConnected',
  'stRobotModbusStatus.xCommunicationAlive',
  'stRobotModbusStatus.xStatusFresh',
  'stRobotModbusStatus.xControllerOn',
  'stRobotModbusStatus.xAutomaticMode',
  'stRobotModbusStatus.xRemoteEnabled',
  'stRobotModbusStatus.xDrivesEnabled',
  'stRobotModbusStatus.xHomed',
  'stRobotModbusStatus.xEmergencyStop',
  'stRobotModbusStatus.xRobotAlarm',
  'stRobotModbusStatus.xPositionValid',
  'stRobotModbusStatus.xSimulatorActive',
  'stRobotModbusStatus.xReady',
  'stRobotModbusStatus.xBusy',
  'stRobotModbusStatus.xDone',
  'stRobotModbusStatus.xError',
  'stRobotModbusStatus.xCommandTimeout',
  'stRobotModbusStatus.uiAckSeq',
  'stRobotModbusStatus.uiExecutionState',
  'stRobotModbusStatus.uiAlarmCode',
  'stRobotModbusStatus.uiResultCode',
  'stRobotModbusStatus.uiActiveCommand',
  'stRobotModbusStatus.uiCurrentPoint',
  'stRobotModbusStatus.uiGripperStatus',
  'stRobotModbusStatus.uiRobotHeartbeat',
  'stRobotModbusStatus.uiStatusWord',
  'stRobotModbusStatus.uiOperationPhase',
  'stRobotModbusStatus.uiProtocolVersion',
  'stRobotModbusStatus.lrActualX',
  'stRobotModbusStatus.lrActualY',
  'stRobotModbusStatus.lrActualZ',
  'stRobotModbusStatus.udiClientError',
  'stRobotModbusStatus.udiReadError',
  'stRobotModbusStatus.udiWriteError',
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => `auiRobotModbusWriteRegisters[${index}]`),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
    .map((index) => `auiRobotModbusReadRegisters[${index}]`),
  'stRobotDiag.eState',
  'stRobotDiag.eActiveAction',
  'stRobotDiag.eActivePoint',
  'stRobotStatus.xGripper1Closed',
  'stRobotStatus.uiBlankPayloadType',
  'stRobotStatus.uiDetailPayloadType',
  'stRobotStatus.xPowerAllowed',
  'stRobotStatus.xStopAllowed',
  'stRobotStatus.xResetAllowed',
  'xRobotDrivesEnable',
  'xRobotDrivesDisable',
  'xRobotStop',
  'xRobotReset',
  'udiHmiHeartbeat',
  'xHmiConnectionAlive',
  'xManualRecoveryActive',
  'xRobotContinuousMode',
  'uiRobotManualSlot',
  'rRobotManualSpeedPercent',
  'lrRobotManualStep',
  'xRobotManualExecute',
  'stRobotHmiStatus.xDrivesPowered',
  'stRobotHmiStatus.xDrivesOff',
  'stRobotHmiStatus.xPowerTransitionActive',
  'stRobotHmiStatus.xDrivesEnableAllowed',
  'stRobotHmiStatus.xDrivesDisableAllowed',
  'stRobotHmiStatus.xResetAllowed',
  'stRobotHmiStatus.xStopAllowed',
  'stRobotHmiStatus.xPointsAllowed',
  'stRobotHmiStatus.xGripperAllowed',
  'stRobotHmiStatus.xGripper1OpenAllowed',
  'stRobotHmiStatus.xGripper1CloseAllowed',
  'stRobotHmiStatus.xGripper2OpenAllowed',
  'stRobotHmiStatus.xGripper2CloseAllowed',
  'stRobotHmiStatus.xRotateToBlankAllowed',
  'stRobotHmiStatus.xRotateToDetailAllowed',
  'stRobotHmiStatus.xCommandBusy',
  'stRobotHmiStatus.uiActiveAction',
  'stRobotHmiStatus.uiActivePoint',
  'stRobotHmiStatus.eRejectReason',
  ...[1, 2, 3].flatMap((index) => [
    `astAxisHmiCommand[${index}].xJogPositive`,
    `astAxisHmiCommand[${index}].xJogNegative`,
    `astAxisHmiCommand[${index}].xHome`,
    `astAxisHmiCommand[${index}].xMoveAbsolute`,
    `astAxisHmiCommand[${index}].xMoveRelative`,
    `astAxisHmiCommand[${index}].lrTargetPosition`,
    `astAxisHmiCommand[${index}].lrRelativeDistance`,
    `astAxisHmiStatus[${index}].xJogPositiveAllowed`,
    `astAxisHmiStatus[${index}].xJogNegativeAllowed`,
    `astAxisHmiStatus[${index}].xHomeAllowed`,
    `astAxisHmiStatus[${index}].xMoveAbsoluteAllowed`,
    `astAxisHmiStatus[${index}].xMoveRelativePositiveAllowed`,
    `astAxisHmiStatus[${index}].xMoveRelativeNegativeAllowed`,
    `astAxisHmiStatus[${index}].xDriveReady`,
    `astAxisHmiStatus[${index}].xBusy`,
    `astAxisHmiStatus[${index}].xError`,
    `astAxisHmiStatus[${index}].xHomed`,
    `astAxisHmiStatus[${index}].lrActualPosition`,
    `astAxisHmiStatus[${index}].lrTargetPosition`,
    `astAxisHmiStatus[${index}].lrDeviation`,
    `astAxisHmiStatus[${index}].lrMinPosition`,
    `astAxisHmiStatus[${index}].lrMaxPosition`,
    `astAxisHmiStatus[${index}].lrCommandVelocity`,
    `astAxisHmiStatus[${index}].lrMaxVelocity`,
    `astAxisHmiStatus[${index}].eRejectReason`,
    `astAxisHmiStatus[${index}].eState`,
  ]),
  'astMachineStatus[1].xEnabled',
  'astMachineStatus[1].xProcessing',
  'astMachineStatus[1].xAlarm',
  'astMachineStatus[1].xPowerAllowed',
  'astMachineStatus[1].xResetAllowed',
  'astMachineStatus[1].ePartType',
  'astMachineStatus[1].tCycleElapsed',
  'astMachineStatus[1].tCycleExpected',
  'astMachineStatus[1].tRemaining',
  'astMachineDiag[1].eState',
  'astMachineIoStatus[1].xDoorOpen',
  'axMachineSetBlank[1]',
  'axMachineSetDetail[1]',
  'axMachineAcceptDoor[1]',
  'axMachineRejectDoor[1]',
  'axMachineAcceptRun[1]',
  'axMachineRejectRun[1]',
  'stCellStatus.uiActiveMagazine',
  'uiRobotManualMagazine',
  'MagazineRows', 'MagazineColumns', 'MagazinePitchX', 'MagazinePitchY',
  ...[1, 2].flatMap((index) => [
    `astMagazineStatus[${index}].xEnabled`, `astMagazineStatus[${index}].xDisablePending`,
    `astMagazineStatus[${index}].xPowerAllowed`, `astMagazineStatus[${index}].xEnableSequenceAllowed`,
    `astMagazineStatus[${index}].xFillAllowed`,
    `astMagazineStatus[${index}].xClearAllowed`, `astMagazineStatus[${index}].xReady`,
    `astMagazineStatus[${index}].xBusy`, `astMagazineStatus[${index}].xDone`,
    `astMagazineStatus[${index}].xError`, `astMagazineStatus[${index}].xFinished`,
    `astMagazineStatus[${index}].xCanTake`, `astMagazineStatus[${index}].xCanPut`,
    `astMagazineStatus[${index}].xCanChange`, `astMagazineStatus[${index}].xCanEnable`,
    `astMagazineStatus[${index}].xEnableCheckPowered`, `astMagazineStatus[${index}].xEnableCheckHomed`,
    `astMagazineStatus[${index}].xEnableCheckPositionValid`, `astMagazineStatus[${index}].xEnableCheckStationary`,
    `astMagazineStatus[${index}].xEnableCheckNoError`, `astMagazineStatus[${index}].xEnableCheckRobotReleased`,
    `astMagazineStatus[${index}].xEnableCheckContent`, `astMagazineStatus[${index}].xEnableCheckInventoryVerified`,
    `astMagazineStatus[${index}].xHomed`, `astMagazineStatus[${index}].xPositionValid`,
    `astMagazineStatus[${index}].xRecoveryRequired`, `astMagazineStatus[${index}].xIndexAllowed`,
    `astMagazineStatus[${index}].xZone1EditAllowed`, `astMagazineStatus[${index}].xZone2EditAllowed`,
    `astMagazineStatus[${index}].xJogPositiveAllowed`, `astMagazineStatus[${index}].xJogNegativeAllowed`,
    `astMagazineStatus[${index}].xContentRecoveryAllowed`, `astMagazineStatus[${index}].xContentRecoveryActive`,
    `astMagazineStatus[${index}].xInventoryVerificationRequired`, `astMagazineStatus[${index}].xIndexing`,
    `astMagazineStatus[${index}].xIndexDone`, `astMagazineStatus[${index}].xAxisError`,
    `astMagazineStatus[${index}].udiProducedPartsTotal`,
    `astMagazineStatus[${index}].iCurrentBlank`, `astMagazineStatus[${index}].iCurrentFreeSlot`,
    `astMagazineStatus[${index}].iSelectedBlank`, `astMagazineStatus[${index}].iSelectedFreeSlot`,
    `astMagazineStatus[${index}].eActualOperation`, `astMagazineDiag[${index}].eState`,
    `astMagazineError[${index}].dwErrorActive`, `astMagazineError[${index}].dwErrorLast`,
    `astMagazineAxisStatus[${index}].xPowered`, `astMagazineAxisStatus[${index}].xBusy`,
    `astMagazineAxisStatus[${index}].xDone`, `astMagazineAxisStatus[${index}].xError`,
    `astMagazineAxisStatus[${index}].lrActualPosition`, `astMagazineAxisDiag[${index}].sStepName`,
    `astMagazineCommand[${index}].xEnable`, `astMagazineCommand[${index}].xDisable`,
    `astMagazineCommand[${index}].xPowerOn`, `astMagazineCommand[${index}].xPowerOff`,
    `astMagazineCommand[${index}].xHome`, `astMagazineCommand[${index}].xIndex`,
    `astMagazineCommand[${index}].xStop`, `astMagazineCommand[${index}].xReset`,
    `astMagazineCommand[${index}].xJogPositive`, `astMagazineCommand[${index}].xJogNegative`,
    `astMagazineCommand[${index}].xStartContentRecovery`, `astMagazineCommand[${index}].xConfirmRecovery`,
    `astMagazineCommand[${index}].xClearRecoveryZones`,
    `astMagazineCommand[${index}].xFillZone1`, `astMagazineCommand[${index}].xClearZone1`,
    `astMagazineCommand[${index}].xCycleZone1Slot`, `astMagazineCommand[${index}].xApplyZone1Slot`,
    `astMagazineCommand[${index}].uiEditZone`, `astMagazineCommand[${index}].uiEditSlot`, `astMagazineCommand[${index}].uiEditDetailType`,
    `astMagazineCommand[${index}].uiEditProductType`,
    `alrMagazineSafeZ_1[${index}]`, `alrMagazineSafeZ_2[${index}]`,
    ...[1, 2, 3].flatMap((zone) => Array.from({ length: zone === 3 ? 60 : 120 }, (_, slot) => [
      `astMagazineInventory[${index}].aZone${zone}[${slot + 1}].xInPosition`,
      `astMagazineInventory[${index}].aZone${zone}[${slot + 1}].eDetailType`,
      `astMagazineInventory[${index}].aZone${zone}[${slot + 1}].uiProductType`,
    ]).flat()),
  ]),
  'stMultiType.Config.uiTypeCount',
  'stMultiType.ConfigStatus.xMagazineConfigAllowed',
  'stMultiType.ConfigStatus.xTypeCountAllowed',
  'stMultiType.ConfigStatus.xConfigurationValid',
  'stMultiType.CycleStatus.uiSelectedType',
  'stMultiType.CycleStatus.xReturningBlank',
  ...[1, 2, 3].flatMap((index) => [
    `stMultiType.Config.auiMachineType[${index}]`,
    `stMultiType.ConfigStatus.axMachineTypeAllowed[${index}]`,
    `astMachineStatus[${index}].xEnabled`, `astMachineStatus[${index}].xProcessing`,
    `astMachineStatus[${index}].ePartType`,
  ]),
  ...Array.from({ length: 120 }, (_, index) => `stMultiType.Config.auiSlotType[${index + 1}]`),
  'stRobotStatus.xGripper1Closed', 'stRobotStatus.xGripper2Closed',
  'stRobotStatus.xGripper1Open', 'stRobotStatus.xGripper2Open',
  'stRobotStatus.xRotatedToBlank', 'stRobotStatus.xRotatedToDetail',
  'stRobotStatus.xBusy', 'stRobotStatus.xError', 'stRobotStatus.eCurrentPoint',
  'astMachineStatus[1].xDisablePending',
  'stAlarmStatus.uiActiveAlarmCount',
  'stAlarmStatus.uiActiveWarningCount',
  'astAlarmEvent[1].udiSequence',
  ...faultRequiredSymbols,
  ...cyclogramRequiredSymbols,
  'uiTestEnvironmentRequest', 'xTestEnvironmentApply', 'uiTestSpeedProfileRequest', 'xTestSpeedProfileApply',
  'xTestSessionActive', 'xTestScenarioApply', 'uiTestEnvironmentApplied', 'uiTestSpeedProfileApplied',
  'xTestEnvironmentChangeAllowed', 'xTestScenarioApplyAllowed', 'xSc500BenchKeyActive', 'xSc500BenchKeyLost',
  'uiTestRejectReason', 'udiTestScenarioAckSeq', 'uiTestScenarioResult', 'stTestScenario.udiLoadSeq',
  'stTestScenario.uiTypeCount', 'stTestScenario.xMagazineEnabled', 'stTestScenario.uiOrientation',
  'stTestScenario.dwCellFaultMask', 'stTestScenario.dwRobotFaultMask', 'stTestScenario.dwMagazineFaultMask',
  ...[1, 2, 3].map((index) => `stTestScenario.adwMachineFaultMask[${index}]`),
  ...[1, 2, 3].flatMap((index) => [`stTestScenario.auiMachineState[${index}]`, `stTestScenario.auiMachineType[${index}]`]),
  ...[1, 2].flatMap((index) => [`stTestScenario.auiGripperContent[${index}]`, `stTestScenario.auiGripperType[${index}]`]),
  ...Array.from({ length: 120 }, (_, index) => [`stTestScenario.auiSlotContent[${index + 1}]`, `stTestScenario.auiSlotType[${index + 1}]`]).flat(),
  'stTestObservability.udiAppliedScenarioSeq', 'stTestObservability.uiCellState',
  'stTestObservability.uiRobotState', 'stTestObservability.uiRobotAction', 'stTestObservability.uiRobotPoint',
  'stTestObservability.uiMagazineState', 'stTestObservability.uiMagazineOperation',
  'stTestObservability.uiTakeSlot', 'stTestObservability.uiPutSlot', 'stTestObservability.uiSelectedMachine',
  'stTestObservability.uiSelectedType', 'stTestObservability.uiErrorSource', 'stTestObservability.dwErrorCode',
  ...[1, 2, 3].flatMap((index) => [`stTestObservability.auiMachineState[${index}]`, `stTestObservability.auiMachineOperation[${index}]`]),
])];
const cyclogramSymbolSet = new Set(cyclogramRequiredSymbols);

const commandMap = {
  'cell.enable': { path: 'xCellEnable', dataType: DataType.Boolean, pulse: true },
  'cell.disable': { path: 'xCellDisable', dataType: DataType.Boolean, pulse: true },
  'cell.start': { path: 'xCellStart', dataType: DataType.Boolean, pulse: true },
  'cell.stop': { path: 'xCellStop', dataType: DataType.Boolean, pulse: true },
  'cell.reset': { path: 'xCellReset', dataType: DataType.Boolean, pulse: true },
  'cell.operatorCancel': { path: 'xCellOperatorCancel', dataType: DataType.Boolean, pulse: true },
  'alarms.resetWarnings': { path: 'xAlarmResetWarnings', dataType: DataType.Boolean, pulse: true },
  'cell.manual': { path: 'xCellManual', dataType: DataType.Boolean },
  'test.session': { path: 'xTestSessionActive', dataType: DataType.Boolean },
  'robot.modbus.ip1': { path: 'uiModbusIpOctet1', dataType: DataType.UInt16, transform: (v) => Math.max(0, Math.min(255, Math.round(Number(v)))) },
  'robot.modbus.ip2': { path: 'uiModbusIpOctet2', dataType: DataType.UInt16, transform: (v) => Math.max(0, Math.min(255, Math.round(Number(v)))) },
  'robot.modbus.ip3': { path: 'uiModbusIpOctet3', dataType: DataType.UInt16, transform: (v) => Math.max(0, Math.min(255, Math.round(Number(v)))) },
  'robot.modbus.ip4': { path: 'uiModbusIpOctet4', dataType: DataType.UInt16, transform: (v) => Math.max(0, Math.min(255, Math.round(Number(v)))) },
  'robot.modbus.port': { path: 'uiModbusPort', dataType: DataType.UInt16, transform: (v) => Math.max(1, Math.min(65535, Math.round(Number(v)))) },
  'robot.modbus.unitId': { path: 'uiModbusUnitId', dataType: DataType.UInt16, transform: (v) => Math.max(0, Math.min(255, Math.round(Number(v)))) },
  'robot.modbus.responseTimeout': { path: 'udiModbusResponseTimeoutMs', dataType: DataType.UInt32, transform: (v) => Math.max(50, Math.min(10000, Math.round(Number(v)))) },
  'robot.modbus.pollInterval': { path: 'udiModbusPollIntervalMs', dataType: DataType.UInt32, transform: (v) => Math.max(10, Math.min(5000, Math.round(Number(v)))) },
  'robot.modbus.heartbeatTimeout': { path: 'udiModbusHeartbeatTimeoutMs', dataType: DataType.UInt32, transform: (v) => Math.max(500, Math.min(30000, Math.round(Number(v)))) },
  'robot.modbus.apply': { path: 'xModbusSettingsApply', dataType: DataType.Boolean, pulse: true },
  'cell.settings.safetyHomeX': { path: 'lrSafetyHomeX', dataType: DataType.Double, transform: (v) => Number(v) },
  'cell.settings.safetyHomeY': { path: 'lrSafetyHomeY', dataType: DataType.Double, transform: (v) => Number(v) },
  'cell.settings.safetyHomeZ': { path: 'lrSafetyHomeZ', dataType: DataType.Double, transform: (v) => Number(v) },
  'cell.settings.safetyHomeSpeed': { path: 'lrSafetyHomeSpeedFactor', dataType: DataType.Double, transform: (v) => Math.max(0.11, Math.min(1, Number(v))) },
  'cell.settings.safetyHomeToleranceX': { path: 'lrSafetyHomeToleranceX', dataType: DataType.Double, transform: (v) => Math.max(0.1, Math.min(1000, Number(v))) },
  'cell.settings.safetyHomeToleranceY': { path: 'lrSafetyHomeToleranceY', dataType: DataType.Double, transform: (v) => Math.max(0.1, Math.min(1000, Number(v))) },
  'cell.settings.safetyHomeToleranceZ': { path: 'lrSafetyHomeToleranceZ', dataType: DataType.Double, transform: (v) => Math.max(0.1, Math.min(1000, Number(v))) },
  'cell.settings.timeoutRobotMove': { path: 'stCellMachineTimeouts.tRobotMove', dataType: DataType.Int64, transform: (v) => Math.max(1000, Math.min(600000, Math.round(Number(v) * 1000))) },
  'cell.settings.timeoutRobotAction': { path: 'stCellMachineTimeouts.tRobotAction', dataType: DataType.Int64, transform: (v) => Math.max(1000, Math.min(600000, Math.round(Number(v) * 1000))) },
  'cell.settings.timeoutRobotRelease': { path: 'stCellMachineTimeouts.tRobotRelease', dataType: DataType.Int64, transform: (v) => Math.max(1000, Math.min(600000, Math.round(Number(v) * 1000))) },
  'cell.settings.timeoutDoorOpen': { path: 'stCellMachineTimeouts.tDoorOpen', dataType: DataType.Int64, transform: (v) => Math.max(1000, Math.min(600000, Math.round(Number(v) * 1000))) },
  'cell.settings.timeoutDoorClose': { path: 'stCellMachineTimeouts.tDoorClose', dataType: DataType.Int64, transform: (v) => Math.max(1000, Math.min(600000, Math.round(Number(v) * 1000))) },
  'cell.settings.timeoutChuckOpen': { path: 'stCellMachineTimeouts.tChuckOpen', dataType: DataType.Int64, transform: (v) => Math.max(1000, Math.min(600000, Math.round(Number(v) * 1000))) },
  'cell.settings.timeoutChuckClose': { path: 'stCellMachineTimeouts.tChuckClose', dataType: DataType.Int64, transform: (v) => Math.max(1000, Math.min(600000, Math.round(Number(v) * 1000))) },
  'cell.settings.timeoutCycleStart': { path: 'stCellMachineTimeouts.tCycleStart', dataType: DataType.Int64, transform: (v) => Math.max(1000, Math.min(600000, Math.round(Number(v) * 1000))) },
  'multi.autoDistribute': { path: 'stMultiType.Command.xAutoDistribute', dataType: DataType.Boolean, pulse: true },
  'fault.enable': { path: 'xErrorSimulationEnable', dataType: DataType.Boolean },
  'simulation.accelerationEnable': { path: 'xSimulationAccelerationEnable', dataType: DataType.Boolean },
  'simulation.accelerationFactor': { path: 'uiSimulationTimeFactor', dataType: DataType.UInt16, transform: (v) => Math.max(1, Math.min(100, Math.round(Number(v)))) },
  'fault.axisGroup': { path: 'xSimAxisGroupError', dataType: DataType.Boolean, pulse: true },
  'fault.robotWrongAction': { path: 'xSimRobotWrongAction', dataType: DataType.Boolean, pulse: true },
  'fault.cellBothGrippers': { path: 'xSimCellBothGrippers', dataType: DataType.Boolean, pulse: true },
  'fault.gripper1': { path: 'xSimGripper1Fault', dataType: DataType.Boolean },
  'fault.gripper2': { path: 'xSimGripper2Fault', dataType: DataType.Boolean },
  'fault.gripperRotation': { path: 'xSimGripperRotationFault', dataType: DataType.Boolean },
  'fault.gripperGlobal': { path: 'xSimGripperGlobalFault', dataType: DataType.Boolean },
  'fault.pointXOutOfLimit': { path: 'xSimPointXOutOfLimit', dataType: DataType.Boolean, pulse: true },
  'fault.pointYOutOfLimit': { path: 'xSimPointYOutOfLimit', dataType: DataType.Boolean, pulse: true },
  'fault.pointZOutOfLimit': { path: 'xSimPointZOutOfLimit', dataType: DataType.Boolean, pulse: true },
  'fault.pointInvalidVelocity': { path: 'xSimPointInvalidVelocity', dataType: DataType.Boolean, pulse: true },
  'fault.magazineWrongOperation': { path: 'xSimMagazineWrongOperation', dataType: DataType.Boolean, pulse: true },
  'fault.magazineNoBlank': { path: 'xSimMagazineNoBlank', dataType: DataType.Boolean, pulse: true },
  'fault.magazineNoFreeSlot': { path: 'xSimMagazineNoFreeSlot', dataType: DataType.Boolean, pulse: true },
  'fault.magazineInvalidSlot': { path: 'xSimMagazineInvalidSlot', dataType: DataType.Boolean, pulse: true },
  'fault.magazineSlotContent': { path: 'xSimMagazineSlotContent', dataType: DataType.Boolean, pulse: true },
  'fault.magazineGeometry': { path: 'xSimMagazineGeometry', dataType: DataType.Boolean, pulse: true },
  'simulation.machineDoorOpen': { path: 'tMachineDoorOpenTime', dataType: DataType.Int64, transform: (v) => Math.max(50, Math.min(120000, Math.round(Number(v) * 1000))) },
  'simulation.machineDoorClose': { path: 'tMachineDoorCloseTime', dataType: DataType.Int64, transform: (v) => Math.max(50, Math.min(120000, Math.round(Number(v) * 1000))) },
  'simulation.machineChuckOpen': { path: 'tMachineChuckOpenTime', dataType: DataType.Int64, transform: (v) => Math.max(50, Math.min(120000, Math.round(Number(v) * 1000))) },
  'simulation.machineChuckClose': { path: 'tMachineChuckCloseTime', dataType: DataType.Int64, transform: (v) => Math.max(50, Math.min(120000, Math.round(Number(v) * 1000))) },
  'simulation.gripper1Open': { path: 'tGripper1OpenTime', dataType: DataType.Int64, transform: (v) => Math.max(50, Math.min(120000, Math.round(Number(v) * 1000))) },
  'simulation.gripper1Close': { path: 'tGripper1CloseTime', dataType: DataType.Int64, transform: (v) => Math.max(50, Math.min(120000, Math.round(Number(v) * 1000))) },
  'simulation.gripper2Open': { path: 'tGripper2OpenTime', dataType: DataType.Int64, transform: (v) => Math.max(50, Math.min(120000, Math.round(Number(v) * 1000))) },
  'simulation.gripper2Close': { path: 'tGripper2CloseTime', dataType: DataType.Int64, transform: (v) => Math.max(50, Math.min(120000, Math.round(Number(v) * 1000))) },
  'simulation.gripperChange': { path: 'tGripperChangeTime', dataType: DataType.Int64, transform: (v) => Math.max(50, Math.min(120000, Math.round(Number(v) * 1000))) },
  'robot.enableDrives': { path: 'xRobotDrivesEnable', dataType: DataType.Boolean, pulse: true },
  'robot.disableDrives': { path: 'xRobotDrivesDisable', dataType: DataType.Boolean, pulse: true },
  'robot.stop': { path: 'xRobotStop', dataType: DataType.Boolean, pulse: true },
  'robot.reset': { path: 'xRobotReset', dataType: DataType.Boolean, pulse: true },
  'hmi.heartbeat': { path: 'udiHmiHeartbeat', dataType: DataType.UInt32, transform: (v) => Math.max(0, Math.round(Number(v))) },
  'robot.continuousMode': { path: 'xRobotContinuousMode', dataType: DataType.Boolean },
  'robot.speedOverride': {
    path: 'rRobotManualSpeedPercent',
    dataType: DataType.Float,
    transform: (value) => {
      const numeric = Number(value);
      const bounded = Math.max(0.1, Math.min(100, Number.isFinite(numeric) ? numeric : 0.1));
      return Math.round(bounded * 10) / 10;
    },
  },
  'robot.manualStep': { path: 'lrRobotManualStep', dataType: DataType.Double, transform: (v) => [0.1, 1, 10, 100].includes(Number(v)) ? Number(v) : 1 },
  'magazine.rows': { path: 'MagazineRows', dataType: DataType.UInt16, transform: (v) => Math.max(1, Math.min(70, Math.round(Number(v)))) },
  'magazine.columns': { path: 'MagazineColumns', dataType: DataType.UInt16, transform: (v) => Math.max(1, Math.min(70, Math.round(Number(v)))) },
  'magazine.pitchX': { path: 'MagazinePitchX', dataType: DataType.Double, transform: (v) => Number(v) },
  'magazine.pitchY': { path: 'MagazinePitchY', dataType: DataType.Double, transform: (v) => Number(v) },
  'magazine.safeAbove': { path: 'MagazineSafeZ_1', dataType: DataType.Double, transform: (v) => Number(v) },
  'magazine.safeInside': { path: 'MagazineSafeZ_2', dataType: DataType.Double, transform: (v) => Number(v) },
};

let opcua = null;
let symbolNodes = new Map();
let latestValues = {};
const robotCoordinatePaths = ['lrActualX', 'lrActualY', 'lrActualZ'];
const robotCoordinatePathSet = new Set(robotCoordinatePaths);
const robotCoordinateSourceTimestamps = new Map();
let robotCoordinateSequence = 0;
let latestRobotCoordinateFrame = null;
let robotSourceClockOffsetMs = null;
let lastRobotSourceTimestampMs = null;

function dataValueTimestampMs(dataValue) {
  const timestamp = dataValue.sourceTimestamp ?? dataValue.serverTimestamp;
  const timestampMs = timestamp instanceof Date ? timestamp.getTime() : Number.NaN;
  return Number.isFinite(timestampMs) && timestampMs > 0 ? timestampMs : null;
}

function normalizeRobotSourceTimestamp(sourceTimestampMs, receivedTimestampMs) {
  if (!Number.isFinite(sourceTimestampMs)) return receivedTimestampMs;
  const candidateOffsetMs = receivedTimestampMs - sourceTimestampMs;
  const clockDiscontinuity = lastRobotSourceTimestampMs !== null
    && sourceTimestampMs < lastRobotSourceTimestampMs;
  const offsetDiscontinuity = robotSourceClockOffsetMs !== null
    && Math.abs(candidateOffsetMs - robotSourceClockOffsetMs) > 1_000;
  if (robotSourceClockOffsetMs === null || clockDiscontinuity || offsetDiscontinuity) {
    robotSourceClockOffsetMs = candidateOffsetMs;
  }
  lastRobotSourceTimestampMs = sourceTimestampMs;
  return sourceTimestampMs + robotSourceClockOffsetMs;
}

function captureRobotCoordinateFrame(receivedTimestampMs = Date.now(), sourceTimestampMs = null) {
  const coordinates = {
    x: Number(latestValues.lrActualX),
    y: Number(latestValues.lrActualY),
    z: Number(latestValues.lrActualZ),
  };
  if (!Object.values(coordinates).every(Number.isFinite)) return latestRobotCoordinateFrame;
  robotCoordinateSequence = (robotCoordinateSequence + 1) >>> 0;
  if (robotCoordinateSequence === 0) robotCoordinateSequence = 1;
  const normalizedTimestampMs = normalizeRobotSourceTimestamp(sourceTimestampMs, receivedTimestampMs);
  latestRobotCoordinateFrame = {
    sequence: robotCoordinateSequence,
    timestampMs: normalizedTimestampMs,
    sourceTimestampMs: Number.isFinite(sourceTimestampMs) ? sourceTimestampMs : receivedTimestampMs,
    coordinates,
  };
  return latestRobotCoordinateFrame;
}
let cyclogramConnected = false;
let stableCyclogramStates = null;
let transientRobotSince = null;
let cyclogramStore = null;
let cyclogramError = '';
try {
  cyclogramStore = new CyclogramStore({
    databasePath: cyclogramDbPath,
    retentionHours: cyclogramRetentionHours,
  });
} catch (error) {
  cyclogramError = error instanceof Error ? error.message : String(error);
  console.error(`[Cyclogram] Storage unavailable: ${cyclogramError}`);
}

let cellEventStore = null;
let cellEventError = '';
let authStore = null;
let authStoreError = '';
let statisticsStore = null;
let statisticsStoreError = '';
let testStore = null;
let testStoreError = '';
let activeTestRun = null;
const cellEventClassifier = new CellEventClassifier();
let lastSystemEventKey = '';
try {
  cellEventStore = new CellEventStore({
    databasePath: cellEventsDbPath,
    retentionDays: cellEventsRetentionDays,
  });
} catch (error) {
  cellEventError = error instanceof Error ? error.message : String(error);
  console.error(`[Cell events] Storage unavailable: ${cellEventError}`);
}

try {
  authStore = new AuthStore({
    databasePath: authDbPath,
    sessionTtlMs: authSessionHours * 60 * 60 * 1000,
    bootstrapUsername: process.env.AUTH_BOOTSTRAP_ADMIN_USERNAME ?? 'admin',
    bootstrapPassword: process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD ?? 'admin',
  });
} catch (error) {
  authStoreError = error instanceof Error ? error.message : String(error);
  console.error(`[Auth] Storage unavailable: ${authStoreError}`);
}

try {
  statisticsStore = new StatisticsStore({ databasePath: statisticsDbPath, timeZone: cyclogramTimeZone });
} catch (error) {
  statisticsStoreError = error instanceof Error ? error.message : String(error);
  console.error(`[Statistics] Storage unavailable: ${statisticsStoreError}`);
}

try {
  testStore = new TestStore(testDbPath);
  const recoveredTestRuns = testStore.recoverInterruptedRuns();
  if (recoveredTestRuns > 0) console.warn(`[Tests] Marked ${recoveredTestRuns} interrupted run(s) as ERROR`);
} catch (error) {
  testStoreError = error instanceof Error ? error.message : String(error);
  console.error(`[Tests] Storage unavailable: ${testStoreError}`);
}

function testHealth() {
  return { available: Boolean(testStore), activeRunId: activeTestRun?.id ?? null, error: testStoreError || null };
}

async function simulatorControlHealth() {
  try {
    const response = await fetch(`${robotSimulatorControlUrl}/api/health`, {
      signal: AbortSignal.timeout(700),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value = await response.json();
    if (value.service !== 'portal-robot-simulator-control') throw new Error('неизвестный сервис');
    return {
      available: true,
      modbusRunning: Boolean(value.modbus?.running),
      sessionActive: Boolean(value.session?.active),
      apiVersion: Number(value.apiVersion ?? 0),
      error: value.modbus?.error || null,
    };
  } catch (error) {
    return {
      available: false, modbusRunning: false, sessionActive: false, apiVersion: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function cellEventHealth() {
  if (!cellEventStore) return { available: false, error: cellEventError || 'Хранилище журнала недоступно' };
  try { return cellEventStore.status(); }
  catch (error) {
    cellEventError = error instanceof Error ? error.message : String(error);
    return { available: false, error: cellEventError };
  }
}

function cyclogramHealth(now = Date.now()) {
  if (!cyclogramStore) return { available: false, error: cyclogramError || 'Хранилище циклограммы недоступно' };
  try {
    return cyclogramStore.status(now);
  } catch (error) {
    cyclogramError = error instanceof Error ? error.message : String(error);
    return { available: false, error: cyclogramError };
  }
}

let connectionState = {
  status: 'connecting', endpoint: endpointUrl, message: 'Подключение к OPC UA', symbols: 0, missing: requiredSymbols,
  cyclogram: cyclogramHealth(), cellEvents: cellEventHealth(),
};

const mimeTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary',
};

function jsonValue(value) {
  if (typeof value === 'bigint') return Number(value);
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === 'object') {
    if (typeof value.valueOf === 'function') {
      const primitive = value.valueOf();
      if (primitive !== value && typeof primitive !== 'object') return jsonValue(primitive);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item)]));
  }
  return value;
}

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(message) {
  const payload = JSON.stringify(message);
  const guestVisible = message.type === 'connection' || message.type === 'snapshot'
    || message.type === 'cyclogram-history' || message.type === 'cyclogram-update';
  for (const socket of webSocketServer.clients) {
    if (socket.isGuest && !guestVisible) continue;
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

function publishConnection() {
  broadcast({ type: 'connection', ...connectionState });
}

function publishSnapshot(values = latestValues, full = true) {
  const publishedValues = full
    ? values
    : Object.fromEntries(Object.entries(values).filter(([path]) => !nonVisualSnapshotSymbols.has(path)));
  if (!full && Object.keys(publishedValues).length === 0) return;
  const timestamp = Date.now();
  const hasRobotCoordinates = full || robotCoordinatePaths.some((path) => Object.hasOwn(publishedValues, path));
  const coordinateSourceTimestamps = robotCoordinatePaths
    .filter((path) => full || Object.hasOwn(publishedValues, path))
    .map((path) => robotCoordinateSourceTimestamps.get(path))
    .filter(Number.isFinite);
  const sourceTimestampMs = coordinateSourceTimestamps.length > 0
    ? Math.max(...coordinateSourceTimestamps)
    : null;
  const robotFrame = hasRobotCoordinates
    ? captureRobotCoordinateFrame(timestamp, sourceTimestampMs)
    : undefined;
  broadcast({ type: 'snapshot', timestamp, full, values: publishedValues, ...(robotFrame ? { robotFrame } : {}) });
}

function recordCellEvent(event, { broadcastEvent = true } = {}) {
  if (!cellEventStore) return null;
  try {
    const saved = cellEventStore.record(event);
    statisticsStore?.recordFact(saved);
    if (broadcastEvent) broadcast({ type: 'cell-event', event: saved, serverTime: Date.now() });
    return saved;
  } catch (error) {
    cellEventError = error instanceof Error ? error.message : String(error);
    console.error(`[Cell events] ${cellEventError}`);
    return null;
  }
}

function recordCellSnapshot(timestamp = Date.now()) {
  for (const event of cellEventClassifier.process(latestValues, timestamp)) recordCellEvent(event);
  recordProductionSnapshot(timestamp);
}

function recordProductionSnapshot(timestamp = Date.now()) {
  if (!statisticsStore) return;
  for (let magazine = 1; magazine <= 2; magazine += 1) {
    const path = `astMagazineStatus[${magazine}].udiProducedPartsTotal`;
    if (!Object.hasOwn(latestValues, path)) continue;
    const quantity = statisticsStore.consumeProductionCounter(magazine, latestValues[path], timestamp);
    if (quantity <= 0) continue;
    const event = {
      timestampMs: timestamp,
      sourceId: 4,
      eventType: 'production',
      status: 'completed',
      message: quantity === 1
        ? `Магазин ${magazine}: готовая деталь уложена в магазин`
        : `Магазин ${magazine}: учтено готовых деталей — ${quantity}`,
      code: `magazine:${magazine}`,
      details: { magazine, quantity },
    };
    if (!recordCellEvent(event)) statisticsStore.recordFact(event);
  }
}

function recordSystemEvent(status, message, details) {
  const key = `${status}:${message}`;
  if (key === lastSystemEventKey) return null;
  lastSystemEventKey = key;
  return recordCellEvent({
    timestampMs: Date.now(), sourceId: 8, eventType: 'connection', status, message, details,
  });
}

function hasCyclogramData() {
  return cyclogramRequiredSymbols.every((path) => Object.hasOwn(latestValues, path));
}

function recordCyclogram(timestamp = Date.now()) {
  if (!cyclogramStore || !cyclogramConnected || !hasCyclogramData()) return;
  try {
    const classified = classifyCyclogram(latestValues);
    if (isTransientRobotActivity(classified.robot)) transientRobotSince ??= timestamp;
    else transientRobotSince = null;
    stableCyclogramStates = stabilizeCyclogramStates(
      stableCyclogramStates,
      classified,
      { transientForMs: transientRobotSince === null ? 0 : timestamp - transientRobotSince },
    );
    const update = cyclogramStore.record(stableCyclogramStates, timestamp);
    statisticsStore?.recordEquipment(stableCyclogramStates, timestamp);
    if (update.changed) broadcast({ type: 'cyclogram-update', serverTime: timestamp, ...update });
  } catch (error) {
    cyclogramError = error instanceof Error ? error.message : String(error);
    console.error(`[Cyclogram] ${cyclogramError}`);
  }
}

function stopCyclogram(timestamp = Date.now()) {
  if (!cyclogramStore) return;
  try {
    const update = cyclogramStore.stop(timestamp);
    statisticsStore?.disconnectEquipment(timestamp);
    stableCyclogramStates = null;
    transientRobotSince = null;
    if (update.changed) broadcast({ type: 'cyclogram-update', serverTime: timestamp, ...update });
  } catch (error) {
    cyclogramError = error instanceof Error ? error.message : String(error);
    console.error(`[Cyclogram] ${cyclogramError}`);
  }
}

function publishCyclogramHistory(socket = null, timestamp = Date.now()) {
  if (!cyclogramStore) return;
  const message = {
    type: 'cyclogram-history',
    serverTime: timestamp,
    retentionMs: cyclogramStore.retentionMs,
    intervals: cyclogramStore.intervals({ nowMs: timestamp }),
  };
  if (socket) send(socket, message);
  else broadcast(message);
}

function clearCyclogram(timestamp = Date.now()) {
  if (!cyclogramStore) throw new Error(cyclogramError || 'Хранилище циклограммы недоступно');
  cyclogramStore.clear();
  stableCyclogramStates = null;
  transientRobotSince = null;
  if (cyclogramConnected && hasCyclogramData()) {
    stableCyclogramStates = classifyCyclogram(latestValues);
    cyclogramStore.record(stableCyclogramStates, timestamp, { forceCheckpoint: true });
  }
  publishCyclogramHistory(null, timestamp);
}

async function browseChildren(session, nodeId) {
  const result = await session.browse({
    nodeId, browseDirection: BrowseDirection.Forward, referenceTypeId: 'HierarchicalReferences',
    includeSubtypes: true, nodeClassMask: NodeClassMask.Object | NodeClassMask.Variable, resultMask: 63,
  });
  return result.references ?? [];
}

async function findGvlNode(session) {
  const queue = [{ nodeId: 'ObjectsFolder', depth: 0 }];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    const key = current.nodeId.toString();
    if (visited.has(key) || current.depth > 8) continue;
    visited.add(key);
    for (const child of await browseChildren(session, current.nodeId)) {
      if (child.browseName.name === plcRootName) return child.nodeId;
      if (child.nodeClass === NodeClass.Object) queue.push({ nodeId: child.nodeId, depth: current.depth + 1 });
    }
  }
  throw new Error(`В OPC UA не найден ${plcRootName}`);
}

async function collectLeafVariables(session, rootNodeId) {
  const leaves = new Map();
  const ignored = new Set(['Dimensions', 'IndexMin', 'IndexMax']);
  async function visit(nodeId, path, depth) {
    if (depth > 8) return;
    const children = (await browseChildren(session, nodeId)).filter(
      (child) => child.nodeClass === NodeClass.Variable && !ignored.has(child.browseName.name),
    );
    if (children.length === 0) {
      if (path) leaves.set(path, nodeId);
      return;
    }
    for (const child of children) {
      const childName = child.browseName.name;
      const pathParts = path.split('.');
      const parentName = pathParts.at(-1) ?? '';
      const childPath = path && childName.startsWith(`${parentName}[`)
        ? [...pathParts.slice(0, -1), childName].join('.')
        : path ? `${path}.${childName}` : childName;
      await visit(child.nodeId, childPath, depth + 1);
    }
  }
  await visit(rootNodeId, '', 0);
  return leaves;
}

async function readInitialValues(session, entries) {
  for (let offset = 0; offset < entries.length; offset += 50) {
    const chunk = entries.slice(offset, offset + 50);
    const requests = chunk.map(([, nodeId]) => ({ nodeId, attributeId: AttributeIds.Value }));
    const values = await session.read(requests);
    chunk.forEach(([path], index) => {
      const dataValue = values[index];
      if (!dataValue?.statusCode?.isGood()) return;
      latestValues[path] = jsonValue(dataValue.value.value);
      if (robotCoordinatePathSet.has(path)) {
        const timestampMs = dataValueTimestampMs(dataValue);
        if (timestampMs !== null) robotCoordinateSourceTimestamps.set(path, timestampMs);
      }
    });
  }
}

async function writeValue(path, dataType, value) {
  if (!opcua?.session) throw new Error('OPC UA не подключён');
  const nodeId = symbolNodes.get(path);
  if (!nodeId) throw new Error(`Переменная ${plcRootName}.${path} не опубликована`);
  const status = await opcua.session.writeSingleNode(nodeId, new Variant({ dataType, value }));
  if (!status.isGood()) throw new Error(`PLC отклонил запись ${path}: ${status.toString()}`);
  // Do not wait for the next subscription publish before reflecting a successful
  // write in the HMI. The following OPC UA notification remains authoritative.
  latestValues[path] = jsonValue(value);
  publishSnapshot({ [path]: latestValues[path] }, false);
}

async function pulseValue(path) {
  await writeValue(path, DataType.Boolean, true);
  setTimeout(() => writeValue(path, DataType.Boolean, false).catch(console.error), 150);
}

async function executeCommand(message) {
  const requestId = String(message.requestId ?? Date.now());
  if (message.command === 'test.environment.set') {
    const environment = Math.round(Number(message.value));
    if (![0, 1, 2].includes(environment)) throw new Error('Недопустимая тестовая среда');
    await writeValue('uiTestEnvironmentRequest', DataType.UInt16, environment);
    await writeValue('xTestEnvironmentApply', DataType.Boolean, true);
    setTimeout(() => writeValue('xTestEnvironmentApply', DataType.Boolean, false).catch(console.error), 150);
    return requestId;
  }
  if (message.command === 'test.speed.set') {
    const profile = Math.round(Number(message.value));
    if (![0, 1].includes(profile)) throw new Error('Недопустимый профиль скорости теста');
    await writeValue('uiTestSpeedProfileRequest', DataType.UInt16, profile);
    await writeValue('xTestSpeedProfileApply', DataType.Boolean, true);
    setTimeout(() => writeValue('xTestSpeedProfileApply', DataType.Boolean, false).catch(console.error), 150);
    return requestId;
  }
  if (message.command === 'test.faults.clear') {
    const paths = [
      'xErrorSimulationEnable', 'xSimCellBothGrippers', 'xSimRobotWrongAction',
      'xSimGripper1Fault', 'xSimGripper2Fault', 'xSimGripperRotationFault', 'xSimGripperGlobalFault',
      'xSimPointXOutOfLimit', 'xSimPointYOutOfLimit', 'xSimPointZOutOfLimit', 'xSimPointInvalidVelocity',
      'xSimMagazineWrongOperation', 'xSimMagazineNoBlank', 'xSimMagazineNoFreeSlot',
      'xSimMagazineInvalidSlot', 'xSimMagazineSlotContent', 'xSimMagazineGeometry',
      ...[1, 2, 3].flatMap((index) => [
        `axMachineSimAlarm[${index}]`, `axMachineSimDoorFault[${index}]`, `axMachineSimChuckFault[${index}]`,
        `axMachineTimeoutRobotMove[${index}]`, `axMachineTimeoutRobotAction[${index}]`,
        `axMachineTimeoutRobotRelease[${index}]`, `axMachineTimeoutDoorOpen[${index}]`,
        `axMachineTimeoutDoorClose[${index}]`, `axMachineTimeoutChuckOpen[${index}]`,
        `axMachineTimeoutChuckClose[${index}]`, `axMachineTimeoutCycleStart[${index}]`,
      ]),
    ];
    for (const path of paths) await writeValue(path, DataType.Boolean, false);
    return requestId;
  }
  if (message.command === 'test.scenario.apply') {
    const scenario = message.scenario;
    if (!scenario || !Array.isArray(scenario.slots) || scenario.slots.length !== 120) throw new Error('Сценарий должен содержать ровно 120 слотов');
    const machines = Array.isArray(scenario.machines) ? scenario.machines : [];
    const grippers = Array.isArray(scenario.grippers) ? scenario.grippers : [];
    await writeValue('stTestScenario.uiTypeCount', DataType.UInt16, Number(scenario.typeCount ?? 1));
    await writeValue('stTestScenario.xMagazineEnabled', DataType.Boolean, Boolean(scenario.magazineEnabled));
    for (let index = 1; index <= 3; index += 1) {
      await writeValue(`stTestScenario.auiMachineState[${index}]`, DataType.UInt16, Number(machines[index - 1]?.state ?? 0));
      await writeValue(`stTestScenario.auiMachineType[${index}]`, DataType.UInt16, Number(machines[index - 1]?.productType ?? 0));
    }
    for (let index = 1; index <= 120; index += 1) {
      await writeValue(`stTestScenario.auiSlotContent[${index}]`, DataType.UInt16, Number(scenario.slots[index - 1]?.content ?? 0));
      await writeValue(`stTestScenario.auiSlotType[${index}]`, DataType.UInt16, Number(scenario.slots[index - 1]?.productType ?? 0));
    }
    for (let index = 1; index <= 2; index += 1) {
      await writeValue(`stTestScenario.auiGripperContent[${index}]`, DataType.UInt16, Number(grippers[index - 1]?.content ?? 0));
      await writeValue(`stTestScenario.auiGripperType[${index}]`, DataType.UInt16, Number(grippers[index - 1]?.productType ?? 0));
    }
    await writeValue('stTestScenario.uiOrientation', DataType.UInt16, Number(scenario.orientation ?? 0));
    const faultMasks = scenario.faultMasks ?? {};
    await writeValue('stTestScenario.dwCellFaultMask', DataType.UInt32, Number(faultMasks.cell ?? 0) >>> 0);
    await writeValue('stTestScenario.dwRobotFaultMask', DataType.UInt32, Number(faultMasks.robot ?? 0) >>> 0);
    await writeValue('stTestScenario.dwMagazineFaultMask', DataType.UInt32, Number(faultMasks.magazine ?? 0) >>> 0);
    for (let index = 1; index <= 3; index += 1) {
      await writeValue(`stTestScenario.adwMachineFaultMask[${index}]`, DataType.UInt32, Number(faultMasks.machines?.[index - 1] ?? 0) >>> 0);
    }
    let loadSeq = Date.now() >>> 0;
    if (!loadSeq) loadSeq = 1;
    await writeValue('stTestScenario.udiLoadSeq', DataType.UInt32, loadSeq);
    await writeValue('xTestScenarioApply', DataType.Boolean, true);
    setTimeout(() => writeValue('xTestScenarioApply', DataType.Boolean, false).catch(console.error), 150);
    return requestId;
  }
  if (message.command === 'robot.axis.jog') {
    const axis = Math.round(Number(message.machine));
    const direction = message.direction === 'negative' ? 'xJogNegative' : message.direction === 'positive' ? 'xJogPositive' : '';
    if (!Number.isInteger(axis) || axis < 1 || axis > 3 || !direction) throw new Error('Неверный запрос Jog оси');
    await writeValue(`astAxisHmiCommand[${axis}].${direction}`, DataType.Boolean, Boolean(message.value));
    return requestId;
  }
  if (message.command === 'robot.axis.target') {
    const axis = Math.round(Number(message.machine));
    const target = Number(message.value);
    if (!Number.isInteger(axis) || axis < 1 || axis > 3 || !Number.isFinite(target)) throw new Error('Неверная целевая координата оси');
    await writeValue(`astAxisHmiCommand[${axis}].lrTargetPosition`, DataType.Double, target);
    return requestId;
  }
  if (message.command === 'robot.axis.home') {
    const axis = Math.round(Number(message.machine));
    if (!Number.isInteger(axis) || axis < 1 || axis > 3) throw new Error('Неверная команда Home оси');
    await writeValue(`astAxisHmiCommand[${axis}].xHome`, DataType.Boolean, true);
    setTimeout(() => writeValue(`astAxisHmiCommand[${axis}].xHome`, DataType.Boolean, false).catch(console.error), 150);
    return requestId;
  }
  if (message.command === 'robot.axis.moveRelative' || message.command === 'robot.axis.moveAbsolute') {
    const axis = Math.round(Number(message.machine));
    const value = Number(message.value);
    const suffix = message.command.endsWith('moveRelative') ? 'lrRelativeDistance' : 'lrTargetPosition';
    const executeLeaf = message.command.endsWith('moveRelative') ? 'xMoveRelative' : 'xMoveAbsolute';
    if (!Number.isInteger(axis) || axis < 1 || axis > 3 || !Number.isFinite(value)) throw new Error('Неверная команда перемещения оси');
    if (message.command.endsWith('moveRelative') && Math.abs(value) > 100) throw new Error('Шаг ручного перемещения должен быть не более 100 мм');
    await writeValue(`astAxisHmiCommand[${axis}].${suffix}`, DataType.Double, value);
    await writeValue(`astAxisHmiCommand[${axis}].${executeLeaf}`, DataType.Boolean, true);
    setTimeout(() => writeValue(`astAxisHmiCommand[${axis}].${executeLeaf}`, DataType.Boolean, false).catch(console.error), 150);
    return requestId;
  }
  if (message.command === 'robot.action') {
    const action = Math.round(Number(message.action));
    const point = Math.round(Number(message.point ?? 0));
    const slot = Math.round(Number(message.slot ?? 0));
    if (!Number.isInteger(action) || action < 1 || action > 7) throw new Error('Неверное ручное действие робота');
    if (action === 1 && (!Number.isInteger(point) || point < 1 || point > 16)) throw new Error('Для перехода укажите точку робота');
    const magazine = Math.round(Number(message.magazine ?? 1));
    if (action === 1 && point >= 14 && (!Number.isInteger(slot) || slot < 1 || slot > 120)) throw new Error('Для магазинной точки укажите слот');
    if (action === 1 && point >= 14 && ![1, 2].includes(magazine)) throw new Error('Для магазинной точки укажите магазин');
    await writeValue('uiRobotManualAction', DataType.UInt16, action);
    await writeValue('uiRobotManualPoint', DataType.UInt16, point);
    await writeValue('uiRobotManualSlot', DataType.UInt16, slot);
    await writeValue('uiRobotManualMagazine', DataType.UInt16, magazine);
    await writeValue('xRobotManualExecute', DataType.Boolean, true);
    setTimeout(() => writeValue('xRobotManualExecute', DataType.Boolean, false).catch(console.error), 150);
    return requestId;
  }
  if (message.command === 'multi.typeCount') {
    const typeCount = Math.round(Number(message.value));
    if (!Number.isInteger(typeCount) || typeCount < 1 || typeCount > 3) throw new Error('Количество типов должно быть от 1 до 3');
    await writeValue('stMultiType.Command.uiRequestedTypeCount', DataType.UInt16, typeCount);
    await writeValue('stMultiType.Command.xSetTypeCount', DataType.Boolean, true);
    setTimeout(() => writeValue('stMultiType.Command.xSetTypeCount', DataType.Boolean, false).catch(console.error), 150);
    return requestId;
  }
  if (message.command === 'cell.operatorChoice') {
    const choice = Math.round(Number(message.value));
    if (!Number.isInteger(choice) || choice < 1 || choice > 3) throw new Error('Недопустимый ответ предпускового опроса');
    await writeValue('uiCellOperatorChoice', DataType.UInt16, choice);
    await writeValue('xCellOperatorChoice', DataType.Boolean, true);
    setTimeout(() => writeValue('xCellOperatorChoice', DataType.Boolean, false).catch(console.error), 150);
    return requestId;
  }
  if (message.command === 'multi.machineType') {
    const machine = Math.round(Number(message.machine));
    const productType = Math.round(Number(message.value));
    if (!Number.isInteger(machine) || machine < 1 || machine > 3) throw new Error('Неверный номер станка');
    if (!Number.isInteger(productType) || productType < 1 || productType > 3) throw new Error('Неверный тип заготовки');
    await writeValue('stMultiType.Command.uiRequestedMachine', DataType.UInt16, machine);
    await writeValue('stMultiType.Command.uiRequestedMachineType', DataType.UInt16, productType);
    await writeValue('stMultiType.Command.xSetMachineType', DataType.Boolean, true);
    setTimeout(() => writeValue('stMultiType.Command.xSetMachineType', DataType.Boolean, false).catch(console.error), 150);
    return requestId;
  }
  if (message.command === 'robot.controlMode.set') {
    const mode = Math.round(Number(message.value));
    if (mode !== 0 && mode !== 1) throw new Error('Неверный режим управления роботом');
    await writeValue('uiRobotControlModeRequest', DataType.UInt16, mode);
    await writeValue('xRobotControlModeApply', DataType.Boolean, true);
    setTimeout(() => writeValue('xRobotControlModeApply', DataType.Boolean, false).catch(console.error), 150);
    return requestId;
  }
  if (message.command === 'multi.slotType') {
    const slot = Math.round(Number(message.slot));
    const productType = Math.round(Number(message.value));
    if (!Number.isInteger(slot) || slot < 1 || slot > 120) throw new Error('Неверный номер слота магазина');
    if (!Number.isInteger(productType) || productType < 1 || productType > 3) throw new Error('Неверный тип заготовки');
    await writeValue('stMultiType.Command.uiRequestedSlot', DataType.UInt16, slot);
    await writeValue('stMultiType.Command.uiRequestedSlotType', DataType.UInt16, productType);
    await writeValue('stMultiType.Command.xSetSlotType', DataType.Boolean, true);
    setTimeout(() => writeValue('stMultiType.Command.xSetSlotType', DataType.Boolean, false).catch(console.error), 150);
    return requestId;
  }
  if (message.command?.startsWith('magazine.') && !['magazine.rows', 'magazine.columns', 'magazine.pitchX', 'magazine.pitchY'].includes(message.command)) {
    const magazine = Math.round(Number(message.magazine));
    if (![1, 2].includes(magazine)) throw new Error('Неверный номер магазина');
    const action = message.command.slice('magazine.'.length);
    const pulseLeaves = {
      enable: 'xEnable', disable: 'xDisable', powerOn: 'xPowerOn', powerOff: 'xPowerOff',
      home: 'xHome', index: 'xIndex', stop: 'xStop', reset: 'xReset',
      fillZone1: 'xFillZone1', clearZone1: 'xClearZone1',
      startContentRecovery: 'xStartContentRecovery', confirmRecovery: 'xConfirmRecovery',
      clearRecoveryZones: 'xClearRecoveryZones',
    };
    if (action === 'jogPositive' || action === 'jogNegative') {
      await writeValue(`astMagazineCommand[${magazine}].${action === 'jogPositive' ? 'xJogPositive' : 'xJogNegative'}`, DataType.Boolean, Boolean(message.value));
      return requestId;
    }
    if (action === 'setZone1Slot' || action === 'setSlot') {
      const zone = action === 'setZone1Slot' ? 1 : Math.round(Number(message.zone));
      const slot = Math.round(Number(message.slot ?? message.value));
      const content = Math.round(Number(message.content));
      const productType = content === 0 ? 0 : Math.round(Number(message.productType));
      if (![1, 2].includes(zone)) throw new Error('Редактировать можно только Zone 1 или Zone 2');
      if (!Number.isInteger(slot) || slot < 1 || slot > 120) throw new Error(`Неверный номер слота Zone ${zone}`);
      if (![0, 1, 2].includes(content)) throw new Error('Состояние слота должно быть NONE, BLANK или DETAIL');
      if (content !== 0 && (!Number.isInteger(productType) || productType < 1 || productType > 3)) throw new Error('Неверный тип изделия');
      await writeValue(`astMagazineCommand[${magazine}].uiEditZone`, DataType.UInt16, zone);
      await writeValue(`astMagazineCommand[${magazine}].uiEditSlot`, DataType.UInt16, slot);
      await writeValue(`astMagazineCommand[${magazine}].uiEditDetailType`, DataType.UInt16, content);
      await writeValue(`astMagazineCommand[${magazine}].uiEditProductType`, DataType.UInt16, productType);
      await pulseValue(`astMagazineCommand[${magazine}].xApplyZone1Slot`);
      return requestId;
    }
    if (action === 'safeAbove' || action === 'safeInside') {
      const value = Number(message.value);
      if (!Number.isFinite(value)) throw new Error('Неверная координата магазина');
      await writeValue(`${action === 'safeAbove' ? 'alrMagazineSafeZ_1' : 'alrMagazineSafeZ_2'}[${magazine}]`, DataType.Double, value);
      return requestId;
    }
    const leaf = pulseLeaves[action];
    if (!leaf) throw new Error(`Команда магазина ${action} не разрешена`);
    await pulseValue(`astMagazineCommand[${magazine}].${leaf}`);
    return requestId;
  }
  let definition = commandMap[message.command];
  if (message.command === 'fault.axisJogConflict') {
    const index = Number(message.machine);
    if (!Number.isInteger(index) || index < 1 || index > 3) throw new Error('Неверный номер оси');
    definition = { path: `axSimAxisJogConflict[${index}]`, dataType: DataType.Boolean, pulse: true };
  }
  if (message.command?.startsWith('fault.machine.')) {
    const index = Number(message.machine);
    if (!Number.isInteger(index) || index < 1 || index > 3) throw new Error('Неверный номер станка');
    const action = message.command.slice('fault.machine.'.length);
    const machineFaultCommands = {
      simReset: { path: `axMachineSimReset[${index}]`, dataType: DataType.Boolean, pulse: true },
      machineAlarm: { path: `axMachineSimAlarm[${index}]`, dataType: DataType.Boolean },
      doorFault: { path: `axMachineSimDoorFault[${index}]`, dataType: DataType.Boolean },
      chuckFault: { path: `axMachineSimChuckFault[${index}]`, dataType: DataType.Boolean },
      timeoutRobotMove: { path: `axMachineTimeoutRobotMove[${index}]`, dataType: DataType.Boolean },
      timeoutRobotAction: { path: `axMachineTimeoutRobotAction[${index}]`, dataType: DataType.Boolean },
      timeoutRobotRelease: { path: `axMachineTimeoutRobotRelease[${index}]`, dataType: DataType.Boolean },
      timeoutDoorOpen: { path: `axMachineTimeoutDoorOpen[${index}]`, dataType: DataType.Boolean },
      timeoutDoorClose: { path: `axMachineTimeoutDoorClose[${index}]`, dataType: DataType.Boolean },
      timeoutChuckOpen: { path: `axMachineTimeoutChuckOpen[${index}]`, dataType: DataType.Boolean },
      timeoutChuckClose: { path: `axMachineTimeoutChuckClose[${index}]`, dataType: DataType.Boolean },
      timeoutCycleStart: { path: `axMachineTimeoutCycleStart[${index}]`, dataType: DataType.Boolean },
    };
    definition = machineFaultCommands[action];
  }
  if (message.command?.startsWith('machine.')) {
    const index = Number(message.machine);
    if (!Number.isInteger(index) || index < 1 || index > 3) throw new Error('Неверный номер станка');
    const action = message.command.slice('machine.'.length);
    const machineCommands = {
      enable: { path: `axMachineEnable[${index}]`, dataType: DataType.Boolean, pulse: true },
      disable: { path: `axMachineDisable[${index}]`, dataType: DataType.Boolean, pulse: true },
      reset: { path: `axMachineReset[${index}]`, dataType: DataType.Boolean, pulse: true },
      setBlank: { path: `axMachineSetBlank[${index}]`, dataType: DataType.Boolean, pulse: true },
      setDetail: { path: `axMachineSetDetail[${index}]`, dataType: DataType.Boolean, pulse: true },
      acceptDoor: { path: `axMachineAcceptDoor[${index}]`, dataType: DataType.Boolean, pulse: true },
      rejectDoor: { path: `axMachineRejectDoor[${index}]`, dataType: DataType.Boolean, pulse: true },
      acceptRun: { path: `axMachineAcceptRun[${index}]`, dataType: DataType.Boolean, pulse: true },
      rejectRun: { path: `axMachineRejectRun[${index}]`, dataType: DataType.Boolean, pulse: true },
      used: { path: `axMachineUsed[${index}]`, dataType: DataType.Boolean },
      cycleMode: { path: `xUseHmiCycleTime[${index}]`, dataType: DataType.Boolean },
      cycleTime: { path: `tMachineCycleTime[${index}]`, dataType: DataType.Int64, transform: (v) => Math.max(1000, Math.round(Number(v) * 1000)) },
    };
    definition = machineCommands[action];
  }
  if (!definition) throw new Error(`Команда ${message.command} не разрешена`);
  const rawValue = message.value ?? true;
  const value = definition.transform ? definition.transform(rawValue) : Boolean(rawValue);
  await writeValue(definition.path, definition.dataType, value);
  if (definition.pulse) setTimeout(() => writeValue(definition.path, definition.dataType, false).catch(console.error), 150);
  return requestId;
}

async function connectOpcUa() {
  connectionState = { ...connectionState, status: 'connecting', message: 'Подключение к OPC UA', cyclogram: cyclogramHealth(), cellEvents: cellEventHealth() };
  publishConnection();
  const client = OPCUAClient.create({
    applicationName: 'Portal Robot HMI Gateway', endpointMustExist: false, keepSessionAlive: true,
    securityMode: MessageSecurityMode.None, securityPolicy: SecurityPolicy.None,
    connectionStrategy: { initialDelay: 500, maxDelay: 2000, maxRetry: 2 },
  });
  let cyclogramCheckpoint = null;
  let cyclogramChangeTimer = null;
  let publishTimer = null;
  let cellEventTimer = null;
  try {
    await client.connect(endpointUrl);
    const session = await client.createSession();
    const gvlNodeId = await findGvlNode(session);
    symbolNodes = await collectLeafVariables(session, gvlNodeId);
    const entries = [...symbolNodes.entries()];
    latestValues = {};
    robotCoordinateSourceTimestamps.clear();
    robotSourceClockOffsetMs = null;
    lastRobotSourceTimestampMs = null;
    latestRobotCoordinateFrame = null;
    await readInitialValues(session, entries);
    const subscription = ClientSubscription.create(session, {
      requestedPublishingInterval: publishingIntervalMs, requestedLifetimeCount: 100,
      requestedMaxKeepAliveCount: 20, maxNotificationsPerPublish: 1000,
      publishingEnabled: true, priority: 1,
    });
    let changedValues = {};
    cyclogramCheckpoint = setInterval(() => {
      // Related PLC tags arrive as separate notifications. Recording while the
      // debounce is active would persist a half-updated state as a micro idle.
      if (cyclogramChangeTimer === null) recordCyclogram(Date.now());
    }, 100);
    const monitored = [];
    for (let offset = 0; offset < entries.length; offset += 50) {
      const chunk = entries.slice(offset, offset + 50);
      const group = ClientMonitoredItemGroup.create(
        subscription,
        chunk.map(([, nodeId]) => ({ nodeId, attributeId: AttributeIds.Value })),
        { samplingInterval: samplingIntervalMs, discardOldest: true, queueSize: 1 },
        TimestampsToReturn.Both,
      );
      group.on('changed', (_item, dataValue, index) => {
        const path = chunk[index]?.[0];
        if (!path || !dataValue.statusCode.isGood()) return;
        const value = jsonValue(dataValue.value.value);
        latestValues[path] = value;
        changedValues[path] = value;
        if (robotCoordinatePathSet.has(path)) {
          const timestampMs = dataValueTimestampMs(dataValue);
          if (timestampMs !== null) robotCoordinateSourceTimestamps.set(path, timestampMs);
        }
        if (cellEventTimer !== null) clearTimeout(cellEventTimer);
        cellEventTimer = setTimeout(() => {
          cellEventTimer = null;
          recordCellSnapshot(Date.now());
        }, cyclogramSettleMs);
        if (cyclogramSymbolSet.has(path)) {
          if (cyclogramChangeTimer !== null) clearTimeout(cyclogramChangeTimer);
          cyclogramChangeTimer = setTimeout(() => {
            cyclogramChangeTimer = null;
            recordCyclogram(Date.now());
          }, cyclogramSettleMs);
        }
        if (publishTimer === null) {
          publishTimer = setTimeout(() => {
            publishTimer = null;
            const delta = changedValues;
            changedValues = {};
            if (Object.keys(delta).length > 0) publishSnapshot(delta, false);
          }, uiRefreshIntervalMs);
        }
      });
      monitored.push(group);
    }

    const missing = requiredSymbols.filter((path) => !symbolNodes.has(path));
    connectionState = {
      status: missing.length ? 'degraded' : 'connected', endpoint: endpointUrl,
      message: missing.length ? 'PLC подключён, но опубликован старый состав GVL_HMI' : 'PLC подключён',
      symbols: symbolNodes.size, missing, cyclogram: cyclogramHealth(), cellEvents: cellEventHealth(),
    };
    opcua = { client, session, subscription, monitored };
    cyclogramConnected = true;
    recordCyclogram(Date.now());
    recordCellSnapshot(Date.now());
    recordSystemEvent(missing.length ? 'warning' : 'restored', missing.length
      ? `OPC UA подключён частично: отсутствует ${missing.length} тегов`
      : 'Связь gateway с PLC по OPC UA установлена', { endpoint: endpointUrl, missing });
    publishConnection();
    publishSnapshot(latestValues, true);
    await new Promise((resolve) => {
      subscription.once('terminated', resolve);
      client.once('connection_lost', resolve);
    });
  } finally {
    if (cyclogramCheckpoint !== null) clearInterval(cyclogramCheckpoint);
    if (cyclogramChangeTimer !== null) clearTimeout(cyclogramChangeTimer);
    if (publishTimer !== null) clearTimeout(publishTimer);
    if (cellEventTimer !== null) {
      clearTimeout(cellEventTimer);
      recordCellSnapshot(Date.now());
    }
    cyclogramConnected = false;
    stopCyclogram(Date.now());
    if (opcua !== null) recordSystemEvent('lost', 'Связь gateway с PLC по OPC UA потеряна', { endpoint: endpointUrl });
    opcua = null;
    symbolNodes = new Map();
    try { await client.disconnect(); } catch { /* reconnect below */ }
  }
}

async function opcUaLoop() {
  while (true) {
    try {
      await connectOpcUa();
    } catch (error) {
      connectionState = {
        status: 'disconnected', endpoint: endpointUrl,
        message: error instanceof Error ? error.message : String(error),
        symbols: 0, missing: requiredSymbols, cyclogram: cyclogramHealth(), cellEvents: cellEventHealth(),
      };
      recordSystemEvent('error', `Ошибка подключения OPC UA: ${connectionState.message}`, { endpoint: endpointUrl });
      publishConnection();
      console.error(`[OPC UA] ${connectionState.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, reconnectDelayMs));
  }
}

const jsonResponse = (response, status, value, headers = {}) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(value));
};

const AUTH_COOKIE_NAME = 'portal_session';
const parseCookies = (header) => Object.fromEntries(String(header ?? '').split(';').map((part) => {
  const separator = part.indexOf('=');
  if (separator < 0) return ['', ''];
  const key = part.slice(0, separator).trim();
  const rawValue = part.slice(separator + 1).trim();
  try { return [key, decodeURIComponent(rawValue)]; }
  catch { return [key, rawValue]; }
}).filter(([key]) => key));
const requestSessionToken = (request) => parseCookies(request.headers.cookie)[AUTH_COOKIE_NAME] ?? '';
const requestSession = (request) => authStore?.getSession(requestSessionToken(request)) ?? null;
const sessionCookie = (request, token, maxAgeSeconds) => {
  const secure = request.socket?.encrypted || request.headers['x-forwarded-proto'] === 'https';
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${secure ? '; Secure' : ''}`;
};
const requireSession = (request) => {
  if (!authStore) throw new AuthStoreError(authStoreError || 'Хранилище пользователей недоступно', 503, 'AUTH_UNAVAILABLE');
  const session = requestSession(request);
  if (!session) throw new AuthStoreError('Требуется вход в систему', 401, 'AUTH_REQUIRED');
  return session;
};
const requireAdmin = (request) => {
  const session = requireSession(request);
  if (session.user.role !== 'admin') throw new AuthStoreError('Доступно только администратору', 403, 'ADMIN_REQUIRED');
  return session;
};
const authErrorResponse = (response, error) => jsonResponse(response,
  error instanceof AuthStoreError || error instanceof StatisticsStoreError ? error.status : 400,
  {
    error: error instanceof Error ? error.message : String(error),
    code: error instanceof AuthStoreError || error instanceof StatisticsStoreError ? error.code : 'AUTH_ERROR',
  });
const recordAuthEvent = (eventType, status, message, user = null, details = {}) => recordCellEvent({
  timestampMs: Date.now(), sourceId: 6, eventType, status, message,
  actor: user,
  details: { ...details, actor: user ? { id: user.id, username: user.username, displayName: user.displayName, role: user.role } : null },
});

function revokeOperatorSockets(reason = 'Управление перехвачено администратором') {
  if (typeof webSocketServer === 'undefined') return;
  for (const socket of webSocketServer.clients) {
    if (socket.authUserRole !== 'operator') continue;
    send(socket, { type: 'auth-revoked', reason });
    socket.close(4001, reason);
  }
}

async function stopCellBeforeOperatorLogout(user) {
  if (user?.role !== 'operator' || statisticsStore?.activeOperator()?.userId !== user.id) return;
  if (Boolean(latestValues['stCellStatus.xRunning'])) {
    recordCellEvent({
      timestampMs: Date.now(), sourceId: 6, eventType: 'operator-warning', status: 'active',
      message: 'Запрошен выход оператора во время автоматической обработки', actor: user,
    });
    await executeCommand({ requestId: `logout-${Date.now()}-stop`, command: 'cell.stop' });
    const deadline = Date.now() + 60_000;
    while (Boolean(latestValues['stCellStatus.xRunning']) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (Boolean(latestValues['stCellStatus.xRunning'])) {
      throw new AuthStoreError('PLC не подтвердил штатную остановку ячейки. Сеанс оператора оставлен активным', 409, 'CELL_STOP_NOT_CONFIRMED');
    }
  }
  if (stableCyclogramStates) statisticsStore?.recordEquipment(stableCyclogramStates, Date.now());
  statisticsStore?.closeActiveOperator(Date.now(), user.id);
}

const cellEventListParameter = (searchParams, name, { numeric = false } = {}) => {
  const value = searchParams.get(name);
  if (!value) return [];
  const items = value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 32);
  return numeric ? items.map(Number).filter(Number.isFinite) : items.filter((item) => /^[a-z0-9-]+$/i.test(item));
};

const decodeCellEventCursor = (value) => {
  if (!value) return null;
  let parsed;
  try { parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { throw new Error('Некорректный курсор журнала'); }
  if (!Number.isFinite(parsed?.timestampMs) || !Number.isInteger(Number(parsed?.id))) {
    throw new Error('Некорректный курсор журнала');
  }
  return { timestampMs: Math.round(parsed.timestampMs), id: Number(parsed.id) };
};

const encodeCellEventCursor = (cursor) => cursor
  ? Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
  : null;

async function requestJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error('Тело запроса слишком большое');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function currentScenario() {
  const typeCount = Math.max(1, Math.min(3, Number(latestValues['stMultiType.Config.uiTypeCount'] ?? 1)));
  const configuredType = (value) => Math.max(1, Math.min(typeCount, Number(value ?? 1)));
  const machines = [1, 2, 3].map((index) => {
    const enabled = Boolean(latestValues[`astMachineStatus[${index}].xEnabled`]);
    const processing = Boolean(latestValues[`astMachineStatus[${index}].xProcessing`]);
    const partType = Number(latestValues[`astMachineStatus[${index}].ePartType`] ?? 0);
    return {
      state: !enabled ? 0 : processing ? 2 : partType === 1 ? 3 : 1,
      productType: configuredType(latestValues[`stMultiType.Config.auiMachineType[${index}]`]),
    };
  });
  const slots = Array.from({ length: 120 }, (_, offset) => {
    const index = offset + 1;
    const root = `astMagazineInventory[1].aZone2[${index}]`;
    const present = Boolean(latestValues[`${root}.xInPosition`]);
    return {
      content: present ? Number(latestValues[`${root}.eDetailType`] ?? 0) : 0,
      productType: configuredType(present
        ? latestValues[`${root}.uiProductType`]
        : latestValues[`stMultiType.Config.auiSlotType[${index}]`]),
    };
  });
  return {
    typeCount, magazineEnabled: Boolean(latestValues['astMagazineStatus[1].xEnabled']), machines, slots,
    grippers: [
      { content: Boolean(latestValues['stRobotStatus.xGripper1Closed']) ? 1 : 0, productType: Boolean(latestValues['stRobotStatus.xGripper1Closed']) ? configuredType(latestValues['stRobotStatus.uiBlankPayloadType']) : 0 },
      { content: Boolean(latestValues['stRobotStatus.xGripper2Closed']) ? 2 : 0, productType: Boolean(latestValues['stRobotStatus.xGripper2Closed']) ? configuredType(latestValues['stRobotStatus.uiDetailPayloadType']) : 0 },
    ],
    orientation: Boolean(latestValues['stRobotStatus.xRotatedToDetail']) ? 1 : 0,
    faultMasks: { cell: 0, robot: 0, magazine: 0, machines: [0, 0, 0] },
  };
}

async function fallbackTestCleanup() {
  try {
    if (Boolean(latestValues['stCellStatus.xRunning']) && !Boolean(latestValues['stCellStatus.xStopPending'])) {
      await executeCommand({ requestId: `cleanup-${Date.now()}-stop`, command: 'cell.stop' });
    }
    await executeCommand({ requestId: `cleanup-${Date.now()}-faults`, command: 'test.faults.clear' });
    const stableDeadline = Date.now() + 15_000;
    while (!Boolean(latestValues.xTestEnvironmentChangeAllowed) && Date.now() < stableDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await executeCommand({ requestId: `cleanup-${Date.now()}-speed`, command: 'test.speed.set', value: 0 });
    await executeCommand({ requestId: `cleanup-${Date.now()}-environment`, command: 'test.environment.set', value: 0 });
  } catch (error) {
    console.error(`[Tests] Fallback PLC cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    try {
      await executeCommand({ requestId: `cleanup-${Date.now()}-session`, command: 'test.session', value: false });
    } catch (error) {
      console.error(`[Tests] Could not release PLC test session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function launchTestRun(config) {
  if (!testStore) throw new Error(testStoreError || 'Хранилище тестов недоступно');
  if (activeTestRun) throw new Error(`Уже выполняется прогон ${activeTestRun.id}`);
  const environment = String(config.environment ?? 'simulation').toLowerCase();
  const robotInterface = String(config.robotInterface ?? 'softmotion').toLowerCase();
  const speedProfile = String(config.speedProfile ?? 'realtime').toLowerCase();
  if (environment === 'sc500_bench' && robotInterface !== 'sc500-modbus') {
    throw new Error('Для стенда SC-500 разрешён только интерфейс SC500 Modbus');
  }
  if (environment !== 'sc500_bench' && robotInterface === 'sc500-modbus') {
    throw new Error('Интерфейс SC500 Modbus разрешён только в стендовой среде');
  }
  if (environment === 'sc500_bench' && speedProfile === 'fast') {
    throw new Error('FAST запрещён на стенде SC-500');
  }
  const selectedScenarios = Array.isArray(config.scenarioIds)
    ? config.scenarioIds.map((id) => testStore.getScenario(id)).filter(Boolean)
      .map((item) => ({ name: item.name, description: item.description, initialState: item.initialState, expectations: item.expectations }))
    : [];
  const runConfig = { ...config, scenarios: selectedScenarios };
  const run = testStore.createRun(runConfig);
  const token = randomUUID();
  const robotDir = normalize(join(__dirname, '..', '..', 'robot_simulator'));
  const processHandle = spawn(testRunnerPython, ['-m', 'robot_simulator.test_runner'], {
    cwd: robotDir,
    windowsHide: true,
    env: {
      ...process.env,
      PORTAL_TEST_RUN_ID: String(run.id), PORTAL_TEST_RUN_TOKEN: token,
      PORTAL_TEST_WS: `ws://127.0.0.1:${gatewayPort}/ws`,
      PORTAL_ROBOT_SIM_CONTROL_URL: robotSimulatorControlUrl,
    },
  });
  activeTestRun = { id: run.id, token, config: runConfig, process: processHandle, socket: null, stderr: '' };
  processHandle.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (activeTestRun?.id === run.id) activeTestRun.stderr = `${activeTestRun.stderr}${text}`.slice(-4000);
    console.error(`[Test runner ${run.id}] ${text.trim()}`);
  });
  processHandle.on('exit', async (code) => {
    if (activeTestRun?.id !== run.id) return;
    const stored = testStore.getRun(run.id);
    if (!stored?.finishedAt) {
      await fallbackTestCleanup();
      if (stored?.abortRequested) testStore.finishRun(run.id, 'ABORTED', 'Прогон остановлен оператором');
      else {
        const runnerError = activeTestRun.stderr.trim().split(/\r?\n/).filter(Boolean).at(-1);
        testStore.finishRun(
          run.id,
          code === 0 ? null : 'ERROR',
          code === 0 ? null : runnerError || `Python runner завершился с кодом ${code}`,
        );
      }
    }
    activeTestRun = null;
    broadcast({ type: 'test-run-update', run: testStore.getRun(run.id) });
  });
  return run;
}

const httpServer = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', 'http://gateway.local');
  const scenarioMatch = requestUrl.pathname.match(/^\/api\/test-scenarios\/(\d+)$/);
  const runMatch = requestUrl.pathname.match(/^\/api\/test-runs\/(\d+)(\/abort)?$/);
  const userMatch = requestUrl.pathname.match(/^\/api\/users\/(\d+)$/);
  const shiftTemplateMatch = requestUrl.pathname.match(/^\/api\/statistics\/shift-templates\/(\d+)$/);
  const statisticsIntervalMatch = requestUrl.pathname.match(/^\/api\/statistics\/operator-intervals\/(\d+)$/);
  if (requestUrl.pathname === '/api/auth/session' && request.method === 'GET') {
    if (!authStore) { jsonResponse(response, 503, { authenticated: false, error: authStoreError || 'Хранилище пользователей недоступно' }); return; }
    const session = requestSession(request);
    jsonResponse(response, 200, session
      ? { authenticated: true, user: session.user, expiresAt: session.expiresAt }
      : { authenticated: false, user: null });
    return;
  }
  if (requestUrl.pathname === '/api/auth/login' && request.method === 'POST') {
    let attemptedUsername = '';
    try {
      if (!authStore) throw new AuthStoreError(authStoreError || 'Хранилище пользователей недоступно', 503, 'AUTH_UNAVAILABLE');
      const body = await requestJson(request);
      attemptedUsername = String(body.username ?? '').trim().replace(/[\r\n]/g, ' ').slice(0, 32);
      const login = authStore.login(body.username, body.password);
      if (stableCyclogramStates) statisticsStore?.recordEquipment(stableCyclogramStates, Date.now());
      if (login.user.role === 'admin') {
        statisticsStore?.closeActiveOperator(Date.now());
        authStore.revokeRoleSessions('operator');
        revokeOperatorSockets('Управление перехвачено администратором');
      } else {
        authStore.revokeRoleSessions('operator', login.token);
        revokeOperatorSockets(`Управление передано оператору ${login.user.displayName}`);
        statisticsStore?.openOperator(login.user, Date.now(), 'login');
      }
      recordAuthEvent('auth-login', 'accepted', `Пользователь ${login.user.username} вошёл в систему`, login.user);
      jsonResponse(response, 200, { authenticated: true, user: login.user, expiresAt: login.expiresAt }, {
        'Set-Cookie': sessionCookie(request, login.token, (login.expiresAt - Date.now()) / 1000),
      });
    } catch (error) {
      recordAuthEvent('auth-login', 'rejected', `Неуспешный вход${attemptedUsername ? `: ${attemptedUsername}` : ''}`, null);
      authErrorResponse(response, error);
    }
    return;
  }
  if (requestUrl.pathname === '/api/auth/logout' && request.method === 'POST') {
    try {
      const token = requestSessionToken(request);
      const session = requestSession(request);
      if (session) await stopCellBeforeOperatorLogout(session.user);
      authStore?.logout(token);
      if (session) recordAuthEvent('auth-logout', 'completed', `Пользователь ${session.user.username} вышел из системы`, session.user);
      jsonResponse(response, 200, { authenticated: false, user: null }, {
        'Set-Cookie': sessionCookie(request, '', 0),
      });
    } catch (error) { authErrorResponse(response, error); }
    return;
  }
  if (requestUrl.pathname === '/api/users' && request.method === 'GET') {
    try { requireAdmin(request); jsonResponse(response, 200, authStore.listUsers()); }
    catch (error) { authErrorResponse(response, error); }
    return;
  }
  if (requestUrl.pathname === '/api/users' && request.method === 'POST') {
    try {
      const actor = requireAdmin(request).user;
      const user = authStore.createUser(await requestJson(request));
      recordAuthEvent('user-created', 'completed', `Создан пользователь ${user.username}`, actor, { targetUserId: user.id, targetRole: user.role });
      jsonResponse(response, 201, user);
    } catch (error) { authErrorResponse(response, error); }
    return;
  }
  if (userMatch && request.method === 'PUT') {
    try {
      const actor = requireAdmin(request).user;
      const body = await requestJson(request);
      if (actor.id === Number(userMatch[1]) && (body.enabled === false || (body.role !== undefined && body.role !== 'admin'))) {
        throw new AuthStoreError('Нельзя отключить или понизить собственную учётную запись', 409, 'SELF_DISABLE');
      }
      const user = authStore.updateUser(userMatch[1], body);
      recordAuthEvent('user-updated', 'completed', `Изменён пользователь ${user.username}`, actor, { targetUserId: user.id, targetRole: user.role, enabled: user.enabled });
      jsonResponse(response, 200, user);
    } catch (error) { authErrorResponse(response, error); }
    return;
  }
  if (userMatch && request.method === 'DELETE') {
    try {
      const actor = requireAdmin(request).user;
      const deleted = authStore.deleteUser(userMatch[1], actor.id);
      recordAuthEvent('user-deleted', 'completed', `Удалён пользователь ${deleted.username}`, actor, { targetUserId: deleted.id, targetRole: deleted.role });
      jsonResponse(response, 200, { ok: true });
    } catch (error) { authErrorResponse(response, error); }
    return;
  }
  if (requestUrl.pathname.startsWith('/api/') && requestUrl.pathname !== '/api/health') {
    try { requireSession(request); }
    catch (error) { authErrorResponse(response, error); return; }
  }
  try {
    if (requestUrl.pathname === '/api/statistics/summary' && request.method === 'GET') {
      if (!statisticsStore) { jsonResponse(response, 503, { error: statisticsStoreError || 'Хранилище статистики недоступно' }); return; }
      const session = requireSession(request);
      const requestedUser = requestUrl.searchParams.get('userId');
      const userId = session.user.role === 'operator'
        ? session.user.id
        : requestedUser === null || requestedUser === '' || requestedUser === 'all'
          ? null
          : requestedUser === 'unassigned' ? 'unassigned' : Number(requestedUser);
      if (userId !== null && userId !== 'unassigned' && !Number.isInteger(userId)) throw new StatisticsStoreError('Некорректный пользователь');
      const fromParam = requestUrl.searchParams.get('from');
      const toParam = requestUrl.searchParams.get('to');
      const statisticsUser = Number.isInteger(userId) ? authStore?.getUser(userId) : null;
      jsonResponse(response, 200, statisticsStore.summary({
        preset: requestUrl.searchParams.get('preset'),
        fromMs: fromParam === null || fromParam === '' ? undefined : Number(fromParam),
        toMs: toParam === null || toParam === '' ? undefined : Number(toParam),
        userId,
        shiftPlan: statisticsUser?.shiftPlan ?? null,
      }));
      return;
    }
    if (requestUrl.pathname === '/api/statistics/shift-templates' && request.method === 'GET') {
      requireAdmin(request);
      if (!statisticsStore) throw new StatisticsStoreError(statisticsStoreError || 'Хранилище статистики недоступно', 503);
      jsonResponse(response, 200, statisticsStore.templates());
      return;
    }
    if (requestUrl.pathname === '/api/statistics/shift-templates' && request.method === 'POST') {
      requireAdmin(request);
      if (!statisticsStore) throw new StatisticsStoreError(statisticsStoreError || 'Хранилище статистики недоступно', 503);
      jsonResponse(response, 201, statisticsStore.createTemplate(await requestJson(request)));
      return;
    }
    if (shiftTemplateMatch && request.method === 'PUT') {
      requireAdmin(request);
      jsonResponse(response, 200, statisticsStore.updateTemplate(shiftTemplateMatch[1], await requestJson(request)));
      return;
    }
    if (shiftTemplateMatch && request.method === 'DELETE') {
      requireAdmin(request);
      statisticsStore.deleteTemplate(shiftTemplateMatch[1]);
      jsonResponse(response, 200, { ok: true });
      return;
    }
    if (requestUrl.pathname === '/api/statistics/operator-intervals' && request.method === 'GET') {
      requireAdmin(request);
      const rawUserId = requestUrl.searchParams.get('userId');
      jsonResponse(response, 200, statisticsStore.intervals({
        fromMs: Number(requestUrl.searchParams.get('from')),
        toMs: Number(requestUrl.searchParams.get('to')),
        userId: rawUserId ? Number(rawUserId) : null,
      }));
      return;
    }
    if (statisticsIntervalMatch && request.method === 'PUT') {
      requireAdmin(request);
      const body = await requestJson(request);
      const target = authStore.getUser(body.userId);
      if (!target || target.role !== 'operator') throw new StatisticsStoreError('Выбранный оператор не найден');
      jsonResponse(response, 200, statisticsStore.updateInterval(statisticsIntervalMatch[1], {
        ...body, userId: target.id, username: target.username, displayName: target.displayName,
      }));
      return;
    }
    if (statisticsIntervalMatch && request.method === 'DELETE') {
      requireAdmin(request);
      if (!statisticsStore.deleteInterval(statisticsIntervalMatch[1])) throw new StatisticsStoreError('Интервал не найден', 404);
      jsonResponse(response, 200, { ok: true });
      return;
    }
    if (requestUrl.pathname === '/api/statistics/range' && request.method === 'DELETE') {
      requireAdmin(request);
      const body = await requestJson(request);
      jsonResponse(response, 200, statisticsStore.hardDeleteRange({
        fromMs: body.fromMs, toMs: body.toMs,
        userId: body.userId === null || body.userId === undefined || body.userId === '' ? null : Number(body.userId),
        equipment: body.equipment !== false, facts: body.facts !== false, intervals: body.intervals !== false,
      }));
      return;
    }
    if (requestUrl.pathname === '/api/cell-event-actors' && request.method === 'GET') {
      if (!cellEventStore) { jsonResponse(response, 503, { error: cellEventError || 'Хранилище журнала недоступно' }); return; }
      const actors = new Map();
      for (const user of authStore?.listUsers() ?? []) {
        actors.set(user.id, {
          id: user.id, username: user.username, displayName: user.displayName,
          role: user.role, enabled: user.enabled,
        });
      }
      for (const actor of cellEventStore.actors()) {
        if (!actors.has(actor.id)) actors.set(actor.id, { ...actor, role: null, enabled: false });
      }
      jsonResponse(response, 200, [...actors.values()].sort((left, right) =>
        left.displayName.localeCompare(right.displayName, 'ru') || left.id - right.id));
      return;
    }
    if (requestUrl.pathname === '/api/cell-events' && request.method === 'GET') {
      if (!cellEventStore) { jsonResponse(response, 503, { error: cellEventError || 'Хранилище журнала недоступно' }); return; }
      const numberParameter = (name) => {
        const raw = requestUrl.searchParams.get(name);
        if (raw === null || raw === '') return undefined;
        const value = Number(raw);
        if (!Number.isFinite(value)) throw new Error(`Некорректный параметр журнала: ${name}`);
        return value;
      };
      const level = requestUrl.searchParams.get('level') ?? 'all';
      const order = requestUrl.searchParams.get('order') ?? 'desc';
      if (!['all', 'info', 'warning', 'error'].includes(level)) throw new Error('Некорректный уровень событий');
      if (!['asc', 'desc'].includes(order)) throw new Error('Некорректный порядок событий');
      const result = cellEventStore.query({
        fromMs: numberParameter('from'), toMs: numberParameter('to'),
        sourceIds: cellEventListParameter(requestUrl.searchParams, 'sources', { numeric: true }),
        statuses: cellEventListParameter(requestUrl.searchParams, 'statuses'),
        eventTypes: cellEventListParameter(requestUrl.searchParams, 'eventTypes'),
        level, text: requestUrl.searchParams.get('text') ?? '',
        operationId: requestUrl.searchParams.get('operationId') ?? '',
        commandSeq: requestUrl.searchParams.get('commandSeq') ?? '',
        code: requestUrl.searchParams.get('code') ?? '', order,
        actorUserId: numberParameter('actorUserId'),
        cursor: decodeCellEventCursor(requestUrl.searchParams.get('cursor')),
        limit: numberParameter('limit') ?? 100,
      });
      jsonResponse(response, 200, {
        serverTime: Date.now(), retentionMs: cellEventStore.retentionMs,
        total: result.count, events: result.events,
        nextCursor: encodeCellEventCursor(result.nextCursor), hasMore: result.hasMore,
      });
      return;
    }
    if (requestUrl.pathname === '/api/test-system/status') {
      jsonResponse(response, 200, { ...testHealth(), simulatorControl: await simulatorControlHealth(), plc: {
        connected: connectionState.status === 'connected', requestedEnvironment: Number(latestValues.uiTestEnvironmentRequest ?? 0),
        appliedEnvironment: Number(latestValues.uiTestEnvironmentApplied ?? 0), speedProfile: Number(latestValues.uiTestSpeedProfileApplied ?? 0),
        environmentChangeAllowed: Boolean(latestValues.xTestEnvironmentChangeAllowed), scenarioApplyAllowed: Boolean(latestValues.xTestScenarioApplyAllowed),
        robotReady: Boolean(latestValues['stCellStatus.xRobotReady']),
        simulatorActive: Boolean(latestValues['stRobotModbusStatus.xSimulatorActive']), benchKey: Boolean(latestValues.xSc500BenchKeyActive),
        benchKeyLost: Boolean(latestValues.xSc500BenchKeyLost), rejectReason: Number(latestValues.uiTestRejectReason ?? 0),
      } });
      return;
    }
    if (requestUrl.pathname === '/api/test-scenarios' && request.method === 'GET') { jsonResponse(response, 200, testStore?.listScenarios() ?? []); return; }
    if (requestUrl.pathname === '/api/test-scenarios' && request.method === 'POST') { jsonResponse(response, 201, testStore.saveScenario(await requestJson(request))); return; }
    if (requestUrl.pathname === '/api/test-scenarios/capture-current' && request.method === 'POST') {
      const body = await requestJson(request);
      jsonResponse(response, 201, testStore.saveScenario({ name: body.name ?? `Снимок ${new Date().toLocaleString('ru-RU')}`, description: body.description ?? 'Создано из текущего состояния PLC', schemaVersion: 1, initialState: currentScenario(), expectations: {} }));
      return;
    }
    if (scenarioMatch && request.method === 'PUT') { jsonResponse(response, 200, testStore.saveScenario(await requestJson(request), scenarioMatch[1])); return; }
    if (scenarioMatch && request.method === 'DELETE') { jsonResponse(response, testStore.deleteScenario(scenarioMatch[1]) ? 200 : 404, { ok: true }); return; }
    if (requestUrl.pathname === '/api/test-runs' && request.method === 'GET') { jsonResponse(response, 200, testStore?.listRuns(Number(requestUrl.searchParams.get('limit') ?? 50)) ?? []); return; }
    if (requestUrl.pathname === '/api/test-runs' && request.method === 'POST') { jsonResponse(response, 202, launchTestRun(await requestJson(request))); return; }
    if (runMatch && !runMatch[2] && request.method === 'GET') { const run = testStore?.getRun(runMatch[1]); jsonResponse(response, run ? 200 : 404, run ?? { error: 'Прогон не найден' }); return; }
    if (runMatch?.[2] && request.method === 'POST') {
      const run = testStore?.requestAbort(runMatch[1]);
      if (activeTestRun?.id === Number(runMatch[1])) {
        if (activeTestRun.socket) send(activeTestRun.socket, { type: 'test-abort-requested' });
        const abortRunId = activeTestRun.id;
        setTimeout(() => {
          if (activeTestRun?.id === abortRunId) activeTestRun.process.kill();
        }, 45_000).unref();
      }
      jsonResponse(response, run ? 202 : 404, run ?? { error: 'Прогон не найден' }); return;
    }
  } catch (error) {
    jsonResponse(response, 400, { error: error instanceof Error ? error.message : String(error) });
    return;
  }
  if (requestUrl.pathname === '/api/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ...connectionState, cyclogram: cyclogramHealth(), cellEvents: cellEventHealth() }));
    return;
  }
  if (requestUrl.pathname === '/api/cyclogram/export') {
    if (!cyclogramStore) {
      response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: cyclogramError || 'Хранилище циклограммы недоступно' }));
      return;
    }
    const now = Date.now();
    const scope = requestUrl.searchParams.get('scope') ?? 'all';
    const requestedFrom = Number(requestUrl.searchParams.get('from'));
    const requestedTo = Number(requestUrl.searchParams.get('to'));
    const rangeFrom = scope === 'all' ? now - cyclogramStore.retentionMs : requestedFrom;
    const rangeTo = scope === 'all' ? now : requestedTo;
    if (!Number.isFinite(rangeFrom) || !Number.isFinite(rangeTo) || rangeFrom >= rangeTo) {
      response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Некорректный временной диапазон циклограммы' }));
      return;
    }
    try {
      const from = Math.max(now - cyclogramStore.retentionMs, Math.round(rangeFrom));
      const to = Math.min(now, Math.round(rangeTo));
      if (from >= to) {
        response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'Запрошенный диапазон находится вне доступной истории циклограммы' }));
        return;
      }
      const buffer = await createCyclogramWorkbook(cyclogramStore.intervals({ fromMs: from, toMs: to, nowMs: now }), {
        fromMs: from, toMs: to, exportedAtMs: now, timeZone: cyclogramTimeZone,
      });
      response.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${cyclogramExportFilename(now, cyclogramTimeZone)}"`,
        'Content-Length': buffer.length,
      });
      response.end(buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: message }));
    }
    return;
  }
  const requestPath = requestUrl.pathname === '/' ? '/index.html' : decodeURIComponent(requestUrl.pathname);
  const relativePath = normalize(requestPath).replace(/^([/\\])+/, '');
  let filePath = normalize(join(distDir, relativePath));
  if (!filePath.startsWith(distDir) || !existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(distDir, 'index.html');
  if (!existsSync(filePath)) {
    response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Сначала выполните npm run build');
    return;
  }
  response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(response);
});

const webSocketServer = new WebSocketServer({ server: httpServer, path: '/ws' });
webSocketServer.on('connection', (socket, request) => {
  const socketUrl = new URL(request.url ?? '/ws', 'http://gateway.local');
  if (socketUrl.searchParams.get('role') === 'test-runner') {
    const runId = Number(socketUrl.searchParams.get('runId'));
    const token = socketUrl.searchParams.get('token');
    if (!activeTestRun || activeTestRun.id !== runId || activeTestRun.token !== token) {
      socket.close(4003, 'invalid test session');
      return;
    }
    activeTestRun.socket = socket;
    testStore.progress(runId, { status: 'RUNNING', stage: 'connected', caseIndex: 0, caseCount: 0 });
    send(socket, { type: 'test-run-config', config: activeTestRun.config });
    send(socket, { type: 'snapshot', timestamp: Date.now(), full: true, values: latestValues });
    if (testStore.getRun(runId)?.abortRequested) send(socket, { type: 'test-abort-requested' });
    socket.on('message', async (payload) => {
      let message;
      try {
        message = JSON.parse(payload.toString());
        if (message.type === 'test-heartbeat') {
          await executeCommand({ command: 'hmi.heartbeat', value: message.value });
        } else if (message.type === 'test-command') {
          const requestId = await executeCommand(message);
          send(socket, { type: 'ack', requestId, ok: true });
        } else if (message.type === 'test-progress') {
          const run = testStore.progress(runId, { ...message, status: 'RUNNING' });
          broadcast({ type: 'test-run-update', run });
        } else if (message.type === 'test-case-result') {
          const run = testStore.addCase(runId, message);
          broadcast({ type: 'test-run-update', run });
        } else if (message.type === 'test-run-finished') {
          const stored = testStore.getRun(runId);
          const run = stored?.abortRequested
            ? testStore.finishRun(runId, 'ABORTED', 'Прогон остановлен оператором после безопасной очистки')
            : testStore.finishRun(runId);
          broadcast({ type: 'test-run-update', run });
        }
      } catch (error) {
        send(socket, { type: 'ack', requestId: String(message?.requestId ?? ''), ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });
    return;
  }
  const authToken = requestSessionToken(request);
  const connectedSession = authStore?.getSession(authToken) ?? null;
  const guestConnection = !connectedSession;
  socket.isGuest = guestConnection;
  socket.authUserId = connectedSession?.user.id ?? null;
  socket.authUserRole = connectedSession?.user.role ?? null;
  send(socket, { type: 'connection', ...connectionState, readOnly: guestConnection });
  const timestamp = Date.now();
  const robotFrame = latestRobotCoordinateFrame ?? captureRobotCoordinateFrame(timestamp);
  send(socket, {
    type: 'snapshot', timestamp, full: true, values: latestValues,
    ...(robotFrame ? { robotFrame } : {}),
  });
  if (cyclogramStore) {
    publishCyclogramHistory(socket);
  }
  socket.on('message', async (payload) => {
    let message;
    try {
      const liveSession = authStore?.getSession(authToken);
      if (!guestConnection && !liveSession) {
        socket.close(4001, 'session expired');
        return;
      }
      message = JSON.parse(payload.toString());
      if (message.type === 'cyclogram-clear') {
        if (!liveSession) throw new AuthStoreError('Авторизуйтесь в аккаунт. Управление запрещено', 401, 'AUTH_REQUIRED');
        throw new AuthStoreError('История циклограммы защищена статистикой и не удаляется через HMI', 403, 'STATISTICS_HISTORY_PROTECTED');
      }
      if (message.type !== 'command') return;
      if (!liveSession && message.command !== 'hmi.heartbeat') {
        throw new AuthStoreError('Авторизуйтесь в аккаунт. Управление запрещено', 401, 'AUTH_REQUIRED');
      }
      if (!isHmiCommandAllowedDuringTest(message.command, Boolean(activeTestRun))) {
        throw new Error(`Команда заблокирована эксклюзивным тестовым прогоном ${activeTestRun.id}`);
      }
      const requestId = String(message.requestId ?? Date.now());
      const description = describeOperatorCommand(message);
      const actorDetails = { ...description.details, actor: liveSession ? {
        id: liveSession.user.id, username: liveSession.user.username, role: liveSession.user.role,
      } : null };
      if (message.command !== 'hmi.heartbeat') recordCellEvent({
        timestampMs: Date.now(), sourceId: 6, eventType: 'operator-command', status: 'requested',
        message: description.label, requestId, actor: liveSession?.user ?? null, details: actorDetails,
      });
      const acceptedRequestId = await executeCommand(message);
      if (message.command !== 'hmi.heartbeat') recordCellEvent({
        timestampMs: Date.now(), sourceId: 6, eventType: 'operator-command', status: 'accepted',
        message: `${description.label}: передано в PLC`, requestId, actor: liveSession?.user ?? null, details: actorDetails,
      });
      send(socket, { type: 'ack', requestId: acceptedRequestId, ok: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (message?.type === 'command' && message.command !== 'hmi.heartbeat') {
        const description = describeOperatorCommand(message);
        const actor = authStore?.getSession(authToken)?.user ?? null;
        recordCellEvent({
          timestampMs: Date.now(), sourceId: 6, eventType: 'operator-command', status: 'rejected',
          message: `${description.label}: отклонено — ${errorMessage}`,
          requestId: String(message?.requestId ?? ''), actor,
          details: { ...description.details, actor: actor
            ? { id: actor.id, username: actor.username, role: actor.role }
            : null },
        });
      }
      send(socket, { type: 'ack', requestId: String(message?.requestId ?? ''), ok: false, error: errorMessage });
    }
  });
});

httpServer.listen(gatewayPort, gatewayHost, () => {
  console.log(`[Gateway] http://${gatewayHost}:${gatewayPort}`);
  console.log(`[OPC UA] ${endpointUrl}`);
  recordSystemEvent('started', 'Gateway визуализации запущен', { gateway: `http://${gatewayHost}:${gatewayPort}`, opcUa: endpointUrl });
});

opcUaLoop().catch(console.error);

const closeStores = () => {
  recordSystemEvent('stopped', 'Gateway визуализации остановлен');
  cyclogramStore?.closeDatabase();
  cellEventStore?.close();
  authStore?.close();
  statisticsStore?.close();
  testStore?.close();
};
const shutdown = () => {
  closeStores();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
