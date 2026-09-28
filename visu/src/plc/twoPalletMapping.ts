import { createTwinState, normalizeTwinConfig, TWIN_CONFIG_FIELDS, type TwinState, type TwinConfig } from '../model/twoPalletControl';
import type { ProductType, SlotType } from '../model/types';
export function mapTwinSnapshot(values: Record<string, unknown>, magazine: number, previous?: TwinState): TwinState {
  const old = previous ?? createTwinState();
  const root = `astTwinStatus[${magazine}]`;
  const num = (path: string, fallback = 0) => typeof values[path] === 'number' && Number.isFinite(values[path]) ? values[path] as number : fallback;
  const bool = (path: string) => values[path] === true;
  const state = { ...old, live: true, config: { ...old.config }, allowed: { ...old.allowed }, sensors: { ...old.sensors } };
  if (typeof values[`${root}.xAutoSwapEnabled`] === 'boolean') state.autoSwapEnabled = bool(`${root}.xAutoSwapEnabled`);
  const numbers = { robotPallet: 'uiRobotPallet', candidate: 'uiCandidate', selected: 'uiSelected', step: 'uiStep', faultStep: 'uiFaultStep', revision: 'udiRevision', error: 'dwError', reason: 'uiReason', p1: 'rP1', p2: 'rP2', lift: 'rLift' };
  for (const [key, field] of Object.entries(numbers)) Object.assign(state, { [key]: num(`${root}.${field}`, Number(old[key as keyof TwinState])) });
  state.robotPallet = state.robotPallet === 2 ? 2 : 1;
  for (const key of ['enabled', 'confirmed', 'ready', 'busy', 'homeRequired', 'configValid'] as const) state[key] = bool(`${root}.x${key[0].toUpperCase()}${key.slice(1)}`);
  for (const key of Object.keys(state.allowed) as (keyof TwinState['allowed'])[]) state.allowed[key] = bool(`${root}.x${key[0].toUpperCase()}${key.slice(1)}Allowed`);
  for (const key of ['homed', 'powered', 'standstill', 'driveError', 'axisBound', 'ioMapped'] as const) state[key] = bool(`${root}.Input.x${key[0].toUpperCase()}${key.slice(1)}`);
  state.position = num(`${root}.Input.lrPosition`, old.position);
  for (const key of Object.keys(state.sensors) as (keyof TwinState['sensors'])[]) state.sensors[key] = bool(`${root}.Input.x${key[0].toUpperCase()}${key.slice(1)}`);
  for (const key of Object.keys(TWIN_CONFIG_FIELDS) as (keyof TwinConfig)[]) {
    const path = `astTwinConfig[${magazine}].${TWIN_CONFIG_FIELDS[key]}`;
    Object.assign(state.config, { [key]: typeof old.config[key] === 'boolean' ? bool(path) : num(path, Number(old.config[key])) });
  }
  state.config = normalizeTwinConfig(state.config);
  state.pallets = [1, 2].map((pallet) => ({
    loaded: bool(`astTwinStore[${magazine}].axLoaded[${pallet}]`),
    slots: Array.from({ length: 96 }, (_, slot): SlotType => {
      const path = `astTwinStore[${magazine}].astPallet[${pallet}].aSlots[${slot + 1}]`;
      if (!bool(`${path}.xInPosition`)) return 'empty';
      return num(`${path}.eDetailType`) === 1 ? 'blank' : num(`${path}.eDetailType`) === 2 ? 'detail' : 'empty';
    }),
    productTypes: Array.from({ length: 96 }, (_, slot) => Math.max(1, Math.min(3, num(`astTwinStore[${magazine}].astPallet[${pallet}].aSlots[${slot + 1}].uiProductType`, 1))) as ProductType),
  })) as TwinState['pallets'];
  return state;
}
