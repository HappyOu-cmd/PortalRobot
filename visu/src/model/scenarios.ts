import { DEFAULT_STATE } from './defaults';
import type { CellState } from './types';

const cloneState = (): CellState => structuredClone(DEFAULT_STATE);

export const HMI_SCENARIOS = {
  normal(): CellState {
    return cloneState();
  },
  alarm(): CellState {
    const state = cloneState();
    state.machines[1] = {
      ...state.machines[1],
      mode: 'error',
      currentStep: 'Авария станка',
      activeErrors: ['Не закрыта дверь станка'],
      canAcceptService: false,
    };
    return state;
  },
  emptyMagazine(): CellState {
    const state = cloneState();
    state.magazines[0].zones = state.magazines[0].zones.map((zone) => zone.map(() => 'empty')) as CellState['magazines'][number]['zones'];
    state.magazines[0].state = { ...state.magazines[0].state, enabled: false, finished: true, canTake: false, canChange: false };
    return state;
  },
  magazineBusy(): CellState {
    const state = cloneState();
    state.magazines[0].state = { ...state.magazines[0].state, enabled: true, ready: true, busy: true, actualOperation: 'CHANGE' };
    return state;
  },
};
