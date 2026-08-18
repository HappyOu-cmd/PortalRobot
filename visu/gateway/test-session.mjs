export const commandsAllowedDuringTest = new Set([
  'cell.stop',
  'cell.reset',
  'robot.stop',
  'robot.reset',
  'hmi.heartbeat',
]);

export function isHmiCommandAllowedDuringTest(command, runActive) {
  return !runActive || commandsAllowedDuringTest.has(command);
}
