/**
 * Build an HTTP URL for gateway REST endpoints.
 *
 * VITE_GATEWAY_URL is the WebSocket endpoint used by the PLC client.  When the
 * HMI is opened from a different computer, relative `/api/*` URLs point at the
 * web server instead of the gateway and Vite/proxy commonly answers with the
 * HMI index page.  Derive the REST origin from the same configured endpoint so
 * every gateway-backed screen uses one connection target.
 */
export function gatewayApiUrlFromEndpoint(path: string, configured?: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const endpointValue = configured?.trim();
  if (!endpointValue) return normalizedPath;

  try {
    const endpoint = new URL(endpointValue);
    if (endpoint.protocol === 'ws:') endpoint.protocol = 'http:';
    else if (endpoint.protocol === 'wss:') endpoint.protocol = 'https:';
    else if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') return normalizedPath;
    return `${endpoint.origin}${normalizedPath}`;
  } catch {
    // Keep the relative fallback for a malformed optional build-time setting;
    // the WebSocket client will report the actual connection problem separately.
    return normalizedPath;
  }
}

export function gatewayApiUrl(path: string): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return gatewayApiUrlFromEndpoint(path, env?.VITE_GATEWAY_URL);
}
