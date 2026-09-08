// The latest explicit HMI login owns the mobile companion. Other open HMI
// sessions may remain connected, but cannot steal ownership by reconnecting.
export class PrimaryHmiSession {
  constructor(getSession) {
    this.getSession = getSession;
    this.selected = null;
  }

  select(token, session) {
    this.selected = { token, createdAt: session.createdAt };
  }

  current(sockets) {
    const sessions = new Map();
    for (const socket of sockets) {
      if (socket.readyState !== socket.OPEN || socket.isGuest || !socket.authToken
          || sessions.has(socket.authToken)) continue;
      const session = this.getSession(socket.authToken);
      if (!session) continue;
      sessions.set(socket.authToken, { token: socket.authToken, ...session });
      // Recover ownership after gateway restart using login time, not heartbeat
      // time or socket order. Keep the selected login while its socket reconnects.
      if (!this.selected || session.createdAt > this.selected.createdAt) {
        this.select(socket.authToken, session);
      }
    }
    return sessions.get(this.selected?.token) ?? null;
  }
}
