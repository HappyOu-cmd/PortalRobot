// Isolated visual fixture. No gateway process, OPC connection, cookies or databases.
// Run manually: node tests/mobile-ui-preview.mjs. Never exposed outside localhost.
import { createServer } from 'vite';
import { MobilePointsService } from '../gateway/mobile-points.mjs';

const user = { id: 1, username: 'ui-test', displayName: 'Тест UI — без PLC', role: 'operator' };
const point = { x: 100, y: 200, z: 300, speedFactor: 0.5, configured: true, checkAllowed: true, checkRejectCode: 0 };
const state = {
  online: true, manualMode: true, modbusMode: false, phoneSpeedLimitPercent: 10,
  robot: { continuousMode: true, speedOverridePercent: 10, manualStep: 1, drivesPowered: true, drivesOff: false,
    drivesEnableAllowed: false, drivesDisableAllowed: true, resetAllowed: true, stopAllowed: true, commandBusy: false },
  axes: Array.from({ length: 3 }, () => ({ jogPositiveAllowed: true, jogNegativeAllowed: true,
    moveRelativePositiveAllowed: true, moveRelativeNegativeAllowed: true, actualPosition: 0, driveReady: true })),
  points: Array.from({ length: 12 }, (_, i) => ({ ...point, index: i + 1 })),
  captureAllowed: true, saveAllowed: true, coordinates: { x: 0, y: 0, z: 0 }, checkSpeedPercent: 10,
  active: false, activeIndex: 0, checkState: 0, runSeq: 0,
};
let completion;
const service = new MobilePointsService({
  authenticate: () => user,
  primary: () => ({ token: 'fixture', user, expiresAt: Date.now() + 3600_000 }),
  snapshot: () => structuredClone(state),
  heartbeat: async () => {},
  stop: async () => { clearTimeout(completion); state.active = false; state.checkState = 3; },
  stopRobot: async () => {},
  execute: async (message) => {
    message._assertAuthorized?.();
    message._pointEditorResult = point;
    if (message.command === 'robot.point.check') {
      message._pointEditorSequence = ++state.runSeq;
      state.active = true; state.checkState = 1; state.activeIndex = message.index;
      completion = setTimeout(() => { state.active = false; state.checkState = 2; }, 2500);
    }
    if (message.command === 'robot.continuousMode') state.robot.continuousMode = message.value;
  },
});
const login = service.login('ui-test', 'fixture');
const server = await createServer({
  server: { host: '127.0.0.1', port: 5178, strictPort: true, open: false },
  plugins: [{ name: 'isolated-mobile-ui', configResolved(config) { config.server.proxy = {}; }, configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (!request.url?.startsWith('/api/')) return next();
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      try {
        const url = new URL(request.url, 'http://localhost');
        let result;
        if (url.pathname === '/api/mobile-points/session') result = service.sessionView(service.getSession(login.token));
        else if (url.pathname === '/api/mobile-points/state') result = await service.state(login.token, url.searchParams.get('visible') !== '0');
        else if (url.pathname === '/api/mobile-points/action' && request.method === 'POST') {
          let text = '';
          for await (const chunk of request) text += chunk;
          result = await service.action(login.token, JSON.parse(text));
        } else { response.statusCode = 404; result = { error: 'Fixture endpoint only; no live gateway' }; }
        response.end(JSON.stringify(result));
      } catch (error) { response.statusCode = error.status || 409; response.end(JSON.stringify({ error: error.message })); }
    });
  } }],
});
await server.listen();
const timer = setInterval(() => void service.tick(), 250);
console.log(`UI FIXTURE — NO PLC: http://127.0.0.1:${server.httpServer.address().port}/mobile`);
const close = async () => { clearInterval(timer); clearTimeout(completion); await server.close(); process.exit(0); };
process.on('SIGINT', close);
process.on('SIGTERM', close);
