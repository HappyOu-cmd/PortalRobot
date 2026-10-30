// v3 keeps both pallet inventories. `slots` is the robot side at load time;
// `operatorSlots` is the other physical pallet, never the HMI projection twice.
export function normalizeScenarioState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Сценарий не содержит initialState');
  const state = structuredClone(input);
  state.magazineMode ??= 0;
  if (![0, 1].includes(state.magazineMode)) throw new Error('Неизвестный тип магазинов сценария');
  const size = state.magazineMode === 1 ? 96 : 120;
  if (!Array.isArray(state.magazines)) {
    if (state.magazineMode !== 0 || !Array.isArray(state.slots)) throw new Error('Сценарий должен содержать два магазина');
    state.magazines = [
      { enabled: Boolean(state.magazineEnabled), slots: state.slots },
      { enabled: false, slots: state.slots.map(slot => ({ content: 0, productType: slot.productType })) },
    ];
    delete state.slots;
    delete state.magazineEnabled;
  }
  const uint = (value, label, max = 65535) => {
    if (!Number.isInteger(value) || value < 0 || value > max) throw new Error(`Некорректное поле ${label}`);
    return value;
  };
  const slots = (items, label) => {
    if (!Array.isArray(items) || items.length !== size) throw new Error(`${label}: требуется ${size} слотов`);
    return items.map((slot, index) => ({
      content: uint(slot?.content, `${label}, слот ${index + 1}: содержимое`),
      productType: uint(slot?.productType, `${label}, слот ${index + 1}: тип`),
    }));
  };
  if (state.magazines.length !== 2) throw new Error('Требуются ровно два магазина');
  state.magazines = state.magazines.map((magazine, index) => ({
    enabled: Boolean(magazine.enabled), slots: slots(magazine.slots, `Магазин ${index + 1}`),
    ...(state.magazineMode === 1 ? {
      operatorSlots: slots(magazine.operatorSlots, `Операторская палета ${index + 1}`),
      operatorLoaded: Boolean(magazine.operatorLoaded), autoSwap: Boolean(magazine.autoSwap),
    } : {}),
  }));
  for (let index = 0; index < size; index++) {
    const expected = state.magazines[0].slots[index].productType;
    if (state.magazines.some(m => m.slots[index].productType !== expected
      || (state.magazineMode === 1 && m.operatorSlots[index].productType !== expected))) {
      throw new Error(`Тип слота ${index + 1} должен совпадать во всех палетах магазинов`);
    }
  }
  if (!Array.isArray(state.machines) || state.machines.length !== 3) throw new Error('Требуются три станка');
  if (!Array.isArray(state.grippers) || state.grippers.length !== 2) throw new Error('Требуются два захвата');
  state.typeCount = uint(state.typeCount, 'typeCount');
  state.orientation = uint(state.orientation, 'orientation');
  state.machines = state.machines.map(m => ({ state: uint(m.state, 'machine.state'), productType: uint(m.productType, 'machine.productType') }));
  state.grippers = state.grippers.map(g => ({ content: uint(g.content, 'gripper.content'), productType: uint(g.productType, 'gripper.productType') }));
  const masks = state.faultMasks ?? {};
  state.faultMasks = {
    cell: uint(masks.cell ?? 0, 'faultMasks.cell', 0xffffffff), robot: uint(masks.robot ?? 0, 'faultMasks.robot', 0xffffffff),
    magazines: [0, 1].map(i => uint(masks.magazines?.[i] ?? (i === 0 ? masks.magazine : 0) ?? 0, 'faultMasks.magazines', 0xffffffff)),
    machines: [0, 1, 2].map(i => uint(masks.machines?.[i] ?? 0, 'faultMasks.machines', 0xffffffff)),
  };
  const geometry = state.geometry ?? {};
  state.geometry = {
    enabled: [0, 1].map(i => Boolean(geometry.enabled?.[i])),
    calls: [0, 1, 2].map(i => Boolean(geometry.calls?.[i])),
    waitWhenOccupied: geometry.waitWhenOccupied !== false,
  };
  return state;
}

export function scenarioWrites(input) {
  const s = normalizeScenarioState(input);
  const result = [];
  const add = (field, type, value) => result.push({ path: `stTestScenario.${field}`, type, value });
  add('uiSchemaVersion', 'UInt16', 3);
  add('uiMagazineMode', 'UInt16', s.magazineMode);
  add('uiTypeCount', 'UInt16', s.typeCount);
  add('uiOrientation', 'UInt16', s.orientation);
  add('xGeometryWaitWhenOccupied', 'Boolean', s.geometry.waitWhenOccupied);
  for (let i = 1; i <= 3; i++) {
    add(`auiMachineState[${i}]`, 'UInt16', s.machines[i - 1].state);
    add(`auiMachineType[${i}]`, 'UInt16', s.machines[i - 1].productType);
    add(`adwMachineFaultMask[${i}]`, 'UInt32', s.faultMasks.machines[i - 1]);
    add(`axGeometryCall[${i}]`, 'Boolean', s.geometry.calls[i - 1]);
  }
  for (let i = 1; i <= 2; i++) {
    const m = s.magazines[i - 1];
    add(`axMagazineEnabled[${i}]`, 'Boolean', m.enabled);
    add(`axOperatorLoaded[${i}]`, 'Boolean', Boolean(m.operatorLoaded));
    add(`axAutoSwap[${i}]`, 'Boolean', Boolean(m.autoSwap));
    add(`adwMagazineFaultMask[${i}]`, 'UInt32', s.faultMasks.magazines[i - 1]);
    add(`auiGripperContent[${i}]`, 'UInt16', s.grippers[i - 1].content);
    add(`auiGripperType[${i}]`, 'UInt16', s.grippers[i - 1].productType);
    add(`axGeometryEnabled[${i}]`, 'Boolean', s.geometry.enabled[i - 1]);
    for (let slot = 1; slot <= 120; slot++) {
      add(`aauiSlotContent[${i},${slot}]`, 'UInt16', m.slots[slot - 1]?.content ?? 0);
      add(`aauiOperatorSlotContent[${i},${slot}]`, 'UInt16', m.operatorSlots?.[slot - 1]?.content ?? 0);
    }
  }
  for (let slot = 1; slot <= 120; slot++) add(`auiSlotType[${slot}]`, 'UInt16', s.magazines[0].slots[slot - 1]?.productType ?? 1);
  add('dwCellFaultMask', 'UInt32', s.faultMasks.cell);
  add('dwRobotFaultMask', 'UInt32', s.faultMasks.robot);
  return result;
}

export async function writeScenarioBuffer(input, { write, commit, previousSequence = 0 }) {
  // Build and validate every field before the first write. The marker/pulse is
  // committed only after the full buffer succeeds, including empty tail slots.
  const writes = scenarioWrites(input);
  for (const entry of writes) await write(entry);
  const sequence = ((previousSequence + 1) >>> 0) || 1;
  await commit(sequence);
  return sequence;
}
