export const twinConfigTypes = {
  xConfigured: 'Boolean', xP1LockOut: 'Boolean', lrExchange: 'Double', lrWorkP1: 'Double', lrWorkP2: 'Double',
  lrHome: 'Double', lrTolerance: 'Double', lrVelocity: 'Double', lrAcceleration: 'Double', lrDeceleration: 'Double',
  lrJerk: 'Double', tCylinder: 'UInt32', tMove: 'UInt32', tHome: 'UInt32', tPulse: 'UInt32',
  xSignalPatternsConfigured: 'Boolean', uiP1Signals: 'UInt16', uiP2Signals: 'UInt16',
};
const statusFields = ['uiStep', 'uiFaultStep', 'uiCandidate', 'uiRobotPallet', 'uiSelected', 'udiRevision', 'xEnabled', 'xConfirmed',
  'xReady', 'xBusy', 'xError', 'xHomeRequired', 'xConfigValid', 'xAutoSwapEnabled', 'xConfirmAllowed', 'xStartAllowed', 'xEnableAllowed', 'xSwapAllowed',
  'xPowerAllowed', 'xDriveResetAllowed', 'xHomeAllowed', 'xLowerAllowed', 'xRaiseAllowed', 'xSelectAllowed',
  'xLockAllowed', 'xStopAllowed',
  'xMoveAllowed', 'xJogAllowed', 'xTeachOperatorAllowed', 'xTeachWorkAllowed', 'xResetAllowed', 'xEditAllowed',
  'xEdit1Allowed', 'xEdit2Allowed', 'xConfigAllowed', 'uiReason', 'dwError', 'rP1', 'rP2', 'rLift'];
const inputFields = ['xIoMapped', 'xLiftDown', 'xLiftUp', 'xLockIn', 'xLockOut', 'xStopIn', 'xStopOut',
  'xLimitNegative', 'xLimitPositive', 'xHomeSensor', 'xAxisBound', 'xPowered', 'xHomed', 'xStandstill', 'xDriveError', 'xMotionDone', 'lrPosition'];
export const twinSymbols = ['uiMagazineMode', 'xMagazineModeAllowed', 'udiTwinCommandSeq', 'udiTwinAckSeq', 'uiTwinResult',
  'udiTwinIssuedAtMs', 'stTwinRequest.uiMagazine', 'stTwinRequest.uiCommand', 'stTwinRequest.uiValue',
  'stTwinRequest.uiSlot', 'stTwinRequest.uiContent', 'stTwinRequest.uiProductType', 'stTwinRequest.udiRevision',
  ...Object.keys(twinConfigTypes).map((field) => `stTwinRequest.Config.${field}`),
  ...[1, 2].flatMap((m) => [
    ...statusFields.map((field) => `astTwinStatus[${m}].${field}`),
    ...inputFields.map((field) => `astTwinStatus[${m}].Input.${field}`),
    ...Object.keys(twinConfigTypes).map((field) => `astTwinConfig[${m}].${field}`),
    ...[1, 2].flatMap((p) => [`astTwinStore[${m}].axLoaded[${p}]`,
      ...Array.from({ length: 96 }, (_, slot) => ['xInPosition', 'eDetailType', 'uiProductType']
        .map((field) => `astTwinStore[${m}].astPallet[${p}].aSlots[${slot + 1}].${field}`)).flat(),
    ]),
  ]),
];
export async function executeTwinCommand(message, { channel, write, types }) {
  const mode = message.command === 'twin.mode';
  const magazine = mode ? 0 : message.magazine;
  const action = mode ? 25 : message.action;
  if (!Number.isInteger(magazine) || magazine < (mode ? 0 : 1) || magazine > 2
    || !Number.isInteger(action) || action < 1 || action > (mode ? 25 : 33)) throw new Error('Неверная команда двухпалетного магазина');
  const value = message.value ?? 0;
  const maxValue = mode || action === 33 ? 1 : 2;
  if (!Number.isInteger(value) || value < 0 || value > maxValue || (action === 33 && message.value === undefined)) {
    throw new Error(action === 33 ? 'Неверное состояние автоматической смены палет' : 'Неверный номер палеты/тип магазина');
  }
  const revision = message.revision ?? 0;
  if (!Number.isInteger(revision) || revision < 0 || revision > 0xffffffff) throw new Error('Неверное подтверждение расстановки');
  const slot = action === 23 ? message.slot : 0, content = action === 23 ? message.content : 0, productType = action === 23 ? message.productType : 1;
  if (action === 23 && (!Number.isInteger(slot) || slot < 1 || slot > 96 || ![0, 1, 2].includes(content)
    || ![1, 2, 3].includes(productType))) throw new Error('Неверное содержимое слота палеты');
  if (action === 24) {
    for (const [field, type] of Object.entries(twinConfigTypes)) {
      const v = message.twinConfig?.[field];
      if (type === 'Boolean' ? typeof v !== 'boolean' : !Number.isFinite(v) || Math.abs(v) > 1e7
        || (type === 'UInt32' && (!Number.isInteger(v) || v < 0))
        || (type === 'UInt16' && (!Number.isInteger(v) || v < 0 || v > 63))) {
        throw new Error(`Некорректный параметр магазина: ${field}`);
      }
    }
  }
  const sequence = await channel.run({ request: 'udiTwinCommandSeq', ack: 'udiTwinAckSeq', result: 'uiTwinResult', issued: 'udiTwinIssuedAtMs' }, async () => {
    for (const [field, v] of Object.entries({ uiMagazine: magazine, uiCommand: action, uiValue: value,
      uiSlot: slot, uiContent: content, uiProductType: productType })) await write(`stTwinRequest.${field}`, types.UInt16, v);
    await write('stTwinRequest.udiRevision', types.UInt32, revision);
    if (action === 24) for (const [field, type] of Object.entries(twinConfigTypes)) {
      await write(`stTwinRequest.Config.${field}`, types[type], message.twinConfig[field]);
    }
  }, (result) => {
    if (result !== 1) throw new Error(result === 4 ? 'Команда магазина устарела; проверьте связь' : 'PLC отклонил команду магазина: проверьте условия и журнал');
  });
  return { path: 'udiTwinCommandSeq', sequence };
}
