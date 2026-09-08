export type RobotControlTab = 'jog' | 'position' | 'diagnostics' | 'registers' | 'points' | 'grippers';

export function appliedMotionTab(continuousMode: boolean): Extract<RobotControlTab, 'jog' | 'position'> {
  return continuousMode ? 'jog' : 'position';
}

export function initialRobotControlTab(modbusMode: boolean, continuousMode: boolean): RobotControlTab {
  return modbusMode ? 'diagnostics' : appliedMotionTab(continuousMode);
}

export function reconcileRobotControlTab(
  current: RobotControlTab,
  modbusMode: boolean,
  continuousMode: boolean,
): RobotControlTab {
  if (modbusMode) return current === 'jog' || current === 'position' ? 'diagnostics' : current;
  if (current === 'diagnostics' || current === 'registers' || current === 'jog' || current === 'position') {
    return appliedMotionTab(continuousMode);
  }
  return current;
}
