/** Feedback only. TRUE on the emergency input means the mushroom is pressed. */
export interface MpgPendantState {
  emergencyStopPressed: boolean;
  axisX: boolean;
  axisY: boolean;
  axisZ: boolean;
  multiplier1: boolean;
  multiplier10: boolean;
  multiplier100: boolean;
}

export const DEFAULT_MPG_PENDANT: Readonly<MpgPendantState> = {
  emergencyStopPressed: false,
  axisX: false, axisY: false, axisZ: false,
  multiplier1: false, multiplier10: false, multiplier100: false,
};

export function getMpgAxis(state: MpgPendantState): 'OFF' | 'X' | 'Y' | 'Z' {
  if (Number(state.axisX) + Number(state.axisY) + Number(state.axisZ) !== 1) return 'OFF';
  return state.axisX ? 'X' : state.axisY ? 'Y' : 'Z';
}

export function getMpgMultiplier(state: MpgPendantState): 'x1' | 'x10' | 'x100' | null {
  if (Number(state.multiplier1) + Number(state.multiplier10) + Number(state.multiplier100) !== 1) return null;
  return state.multiplier1 ? 'x1' : state.multiplier10 ? 'x10' : 'x100';
}
