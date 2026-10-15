export interface ControllerDiagnostics {
  url: string;
  status: 'disabled' | 'connecting' | 'online' | 'offline' | 'unauthorized';
  observedAt: number | null;
  error: string | null;
  resources: {
    cpuLoadPercent: number | null;
    memoryUsedPercent: number | null;
    storageUsedPercent: number | null;
    temperatureCelsius: number | null;
    uptime: string | null;
    applicationRunning: boolean | null;
    debugMode: boolean | null;
    networkTxKbPerSecond: number | null;
    networkRxKbPerSecond: number | null;
    led: { code: string | null; message: string | null; normal: boolean | null };
  } | null;
  identity: {
    observedAt: number | null;
    error: string | null;
    data: {
      name: string | null;
      model: string | null;
      serialNumber: string | null;
      firmwareVersion: string | null;
      hardwareVersion: string | null;
      busVersion: string | null;
      highSpeedIoVersion: string | null;
      buildDate: string | null;
      vendor: string | null;
    } | null;
  };
  modules: {
    observedAt: number | null;
    error: string | null;
    data: { slot: number; type: number | null; errorCode: number | null; message: string }[] | null;
  };
}
