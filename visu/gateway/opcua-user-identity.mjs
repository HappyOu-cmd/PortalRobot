import { UserTokenType } from 'node-opcua';

export function opcuaUserIdentity(env = process.env) {
  const userName = env.OPCUA_USERNAME ?? '';
  const password = env.OPCUA_PASSWORD ?? '';
  if (!userName && !password) return { type: UserTokenType.Anonymous };
  if (!userName.trim() || !password) {
    throw new Error('Для входа в PLC задайте обе переменные OPCUA_USERNAME и OPCUA_PASSWORD.');
  }
  // Credentials belong to the PLC, separately from accounts in the web HMI.
  // Preserve password whitespace and never fall back to Anonymous after a login failure.
  return { type: UserTokenType.UserName, userName, password };
}
