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
    state.magazine = state.magazine.map(() => 'empty');
    state.magazineState = { ...state.magazineState, enabled: false, finished: true, canTake: false, canChange: false };
    return state;
  },
  magazineBusy(): CellState {
    const state = cloneState();
    state.magazineState = { ...state.magazineState, enabled: true, ready: true, busy: true, actualOperation: 'CHANGE' };
    return state;
  },
};
