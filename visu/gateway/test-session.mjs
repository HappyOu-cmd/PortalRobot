export const commandsAllowedDuringTest = new Set([
  'cell.stop',
  'cell.reset',
  'robot.stop',
  'robot.reset',
  'hmi.heartbeat',
  // Ползунок только запоминает требование. PLC применит Dynamic Limits
  // безопасной транзакцией перед следующим тестовым сценарием.
  'simulation.accelerationFactor',
]);

export function isHmiCommandAllowedDuringTest(command, runActive) {
  return !runActive || commandsAllowedDuringTest.has(command);
}
