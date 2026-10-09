export const commandsAllowedDuringTest = new Set([
  'cell.stop',
  'cell.reset',
  'robot.stop',
  'robot.reset',
  'hmi.heartbeat',
  'io.heartbeat',
  'io.manual.begin',
  'io.manual.end',
  'io.override',
  'io.output',
  'io.release',
  'io.releaseAll',
  'io.output.release',
  'io.outputs.releaseAll',
  'io.releaseEverything',
  'io.emergencyStop',
  // Ползунок только запоминает требование. PLC применит Dynamic Limits
  // безопасной транзакцией перед следующим тестовым сценарием.
  'simulation.accelerationFactor',
]);

export function isHmiCommandAllowedDuringTest(command, runActive) {
  return !runActive || commandsAllowedDuringTest.has(command);
}
