export type MobileUser = { id: number; username: string; displayName: string; role: string };
export type MobileSession = {
  authenticated: boolean;
  user: MobileUser | null;
  cellUser?: MobileUser | null;
  error?: string;
};

// Poll even on the login screen: its account belongs to the main HMI and may
// change without any action on the phone. A login/logout supersedes older reads.
export function watchMobileSession({ read, onSession, onError, intervalMs = 1000 }: {
  read: () => Promise<MobileSession>;
  onSession: (session: MobileSession) => void;
  onError: (error: unknown) => void;
  intervalMs?: number;
}) {
  let stopped = false;
  let revision = 0;
  let pending: Promise<void> | null = null;
  const refresh = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (pending) return pending;
    const requestRevision = revision;
    const request = Promise.resolve().then(read).then((session) => {
      if (!stopped && requestRevision === revision) onSession(session);
    }).catch((error: unknown) => {
      if (!stopped && requestRevision === revision) onError(error);
    }).finally(() => {
      if (pending === request) pending = null;
    });
    pending = request;
    return request;
  };
  const timer = setInterval(() => { void refresh(); }, intervalMs);
  void refresh();
  return {
    refresh,
    replace(session: MobileSession) {
      if (stopped) return;
      revision += 1;
      pending = null;
      onSession(session);
    },
    stop() {
      stopped = true;
      revision += 1;
      clearInterval(timer);
    },
  };
}
