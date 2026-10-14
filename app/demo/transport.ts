// Demo: místo serveru odpovídá simulovaný backend v prohlížeči (viz mockServer.ts).
import { handle, latestSafetyId, resetDemo, shareView, skipTime } from './mockServer';
import { overlay } from './overlay';

export type TransportResponse = { status: number; json: unknown };

overlay.init({ shareView, latestSafetyId, skipTime, reset: resetDemo });

export async function transport(method: string, path: string, body: unknown, token: string | null): Promise<TransportResponse> {
  await new Promise((r) => setTimeout(r, 120)); // aby se načítání chovalo jako se sítí
  return handle(method, path, body === undefined ? undefined : JSON.parse(JSON.stringify(body)), token);
}
