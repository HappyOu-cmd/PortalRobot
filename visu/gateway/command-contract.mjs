// Stable wire IDs: append new entries; never reorder existing entries.
export const pulsePaths = [
  "xCellEnable",
  "xCellDisable",
  "xCellStart",
  "xCellStop",
  "xCellReset",
  "xSafetyRelayReset",
  "xCellOperatorCancel",
  "xAlarmResetWarnings",
  "xModbusSettingsApply",
  "stMultiType.Command.xAutoDistribute",
  "xSimAxisGroupError",
  "xSimRobotWrongAction",
  "xSimCellBothGrippers",
  "xSimPointXOutOfLimit",
  "xSimPointYOutOfLimit",
  "xSimPointZOutOfLimit",
  "xSimPointInvalidVelocity",
  "xSimMagazineWrongOperation",
  "xSimMagazineNoBlank",
  "xSimMagazineNoFreeSlot",
  "xSimMagazineInvalidSlot",
  "xSimMagazineSlotContent",
  "xSimMagazineGeometry",
  "xRobotDrivesEnable",
  "xRobotDrivesDisable",
  "xRobotStop",
  "xRobotReset",
  "xTestEnvironmentApply",
  "xTestSpeedProfileApply",
  "xTestScenarioApply",
  "xPointCheckStop",
  "xRobotManualExecute",
  "stMultiType.Command.xSetTypeCount",
  "xCellOperatorChoice",
  "stMultiType.Command.xSetMachineType",
  "xRobotControlModeApply",
  "stMultiType.Command.xSetSlotType",
  "astAxisHmiCommand[1].xHome",
  "astAxisHmiCommand[1].xMoveAbsolute",
  "astAxisHmiCommand[1].xMoveRelative",
  "axSimAxisJogConflict[1]",
  "axMachineSimReset[1]",
  "axMachineEnable[1]",
  "axMachineDisable[1]",
  "axMachineReset[1]",
  "axMachineSetBlank[1]",
  "axMachineSetDetail[1]",
  "axMachineAcceptDoor[1]",
  "axMachineRejectDoor[1]",
  "axMachineAcceptRun[1]",
  "axMachineRejectRun[1]",
  "axMachineManualSafetyDoorOpen[1]",
  "axMachineManualSafetyDoorClose[1]",
  "axMachineManualHatchOpen[1]",
  "axMachineManualHatchClose[1]",
  "axMachineManualHatchUnlock[1]",
  "axMachineManualHatchLock[1]",
  "axMachineManualChuckOpen[1]",
  "axMachineManualChuckClose[1]",
  "astAxisHmiCommand[2].xHome",
  "astAxisHmiCommand[2].xMoveAbsolute",
  "astAxisHmiCommand[2].xMoveRelative",
  "axSimAxisJogConflict[2]",
  "axMachineSimReset[2]",
  "axMachineEnable[2]",
  "axMachineDisable[2]",
  "axMachineReset[2]",
  "axMachineSetBlank[2]",
  "axMachineSetDetail[2]",
  "axMachineAcceptDoor[2]",
  "axMachineRejectDoor[2]",
  "axMachineAcceptRun[2]",
  "axMachineRejectRun[2]",
  "axMachineManualSafetyDoorOpen[2]",
  "axMachineManualSafetyDoorClose[2]",
  "axMachineManualHatchOpen[2]",
  "axMachineManualHatchClose[2]",
  "axMachineManualHatchUnlock[2]",
  "axMachineManualHatchLock[2]",
  "axMachineManualChuckOpen[2]",
  "axMachineManualChuckClose[2]",
  "astAxisHmiCommand[3].xHome",
  "astAxisHmiCommand[3].xMoveAbsolute",
  "astAxisHmiCommand[3].xMoveRelative",
  "axSimAxisJogConflict[3]",
  "axMachineSimReset[3]",
  "axMachineEnable[3]",
  "axMachineDisable[3]",
  "axMachineReset[3]",
  "axMachineSetBlank[3]",
  "axMachineSetDetail[3]",
  "axMachineAcceptDoor[3]",
  "axMachineRejectDoor[3]",
  "axMachineAcceptRun[3]",
  "axMachineRejectRun[3]",
  "axMachineManualSafetyDoorOpen[3]",
  "axMachineManualSafetyDoorClose[3]",
  "axMachineManualHatchOpen[3]",
  "axMachineManualHatchClose[3]",
  "axMachineManualHatchUnlock[3]",
  "axMachineManualHatchLock[3]",
  "axMachineManualChuckOpen[3]",
  "axMachineManualChuckClose[3]",
  "astMagazineCommand[1].xEnable",
  "astMagazineCommand[1].xDisable",
  "astMagazineCommand[1].xStop",
  "astMagazineCommand[1].xReset",
  "astMagazineCommand[1].xFill",
  "astMagazineCommand[1].xClear",
  "astMagazineCommand[1].xApplySlot",
  "astMagazineCommand[1].xApplyPitchX",
  "astMagazineCommand[1].xApplyPitchY",
  "astMagazineCommand[2].xEnable",
  "astMagazineCommand[2].xDisable",
  "astMagazineCommand[2].xStop",
  "astMagazineCommand[2].xReset",
  "astMagazineCommand[2].xFill",
  "astMagazineCommand[2].xClear",
  "astMagazineCommand[2].xApplySlot",
  "astMagazineCommand[2].xApplyPitchX",
  "astMagazineCommand[2].xApplyPitchY"
];

export const pulseProtocols = new Map(pulsePaths.map((path, index) => [path, {
  issued: `audiHmiCommandIssuedAtMs[${index + 1}]`, result: `auiHmiCommandResult[${index + 1}]`,
  request: `audiHmiCommandSeq[${index + 1}]`, ack: `audiHmiCommandAckSeq[${index + 1}]`,
}]));
export const settingPaths = [
  "lrSafetyHomeToleranceX",
  "lrSafetyHomeToleranceY",
  "lrSafetyHomeToleranceZ",
  "rPointCheckSpeedPercent",
  "stCellMachineTimeouts.tRobotMove",
  "stCellMachineTimeouts.tRobotAction",
  "stCellMachineTimeouts.tRobotRelease",
  "stCellMachineTimeouts.tDoorOpen",
  "stCellMachineTimeouts.tDoorClose",
  "stCellMachineTimeouts.tHatchUnlock",
  "stCellMachineTimeouts.tChuckOpen",
  "stCellMachineTimeouts.tChuckClose",
  "stCellMachineTimeouts.tCycleStart"
];
export const settingProtocol = { issued: 'udiCellSettingIssuedAtMs', request: 'udiCellSettingCommandSeq', ack: 'udiCellSettingAckSeq', result: 'uiCellSettingResult' };
export const commandSymbols = [...pulseProtocols.values()].flatMap((protocol) => Object.values(protocol)).concat(Object.values(settingProtocol), ['uiCellSettingIndex', 'lrCellSettingRequest', 'udiHmiCommandClockMs']);

// Protect the entire payload preparation, including after timeout/reconnect.
// Stops have no payload and use their own counters; they never wait for this lock.
export function payloadProtocols(message) {
  const command = message.command;
  let key;
  let paths;
  if (['robot.axis.target', 'robot.axis.home', 'robot.axis.moveAbsolute', 'robot.axis.moveRelative'].includes(command)) {
    key = `axis-${message.machine}`;
    paths = ['xHome', 'xMoveAbsolute', 'xMoveRelative'].map((leaf) => `astAxisHmiCommand[${message.machine}].${leaf}`);
  } else if (command?.startsWith('multi.')) {
    key = 'multi';
    paths = pulsePaths.filter((path) => path.startsWith('stMultiType.Command.'));
  } else if (command?.startsWith('robot.modbus.')) {
    key = 'modbus-settings'; paths = ['xModbusSettingsApply'];
  } else if (['test.environment.set', 'test.speed.set'].includes(command)) {
    key = 'test-profile'; paths = ['xTestEnvironmentApply', 'xTestSpeedProfileApply'];
  } else if (['test.scenario.apply', 'test.faults.clear'].includes(command)) {
    key = 'test-scenario'; paths = ['xTestScenarioApply'];
  } else if (['magazine.setSlot', 'magazine.pitchX', 'magazine.pitchY'].includes(command)) {
    key = `magazine-edit-${message.magazine}`;
    paths = ['xApplySlot', 'xApplyPitchX', 'xApplyPitchY'].map((leaf) => `astMagazineCommand[${message.magazine}].${leaf}`);
  } else {
    const path = { 'robot.action': 'xRobotManualExecute', 'cell.operatorChoice': 'xCellOperatorChoice', 'robot.controlMode.set': 'xRobotControlModeApply' }[command];
    if (path) { key = path; paths = [path]; }
  }
  if (!key) return null;
  const protocols = paths.map((path) => pulseProtocols.get(path));
  if (protocols.some((protocol) => !protocol)) throw new Error('Неверный адрес канала команды');
  return { key: `payload-${key}`, protocols };
}
