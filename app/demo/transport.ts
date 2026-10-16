// Demo: místo serveru odpovídá simulovaný backend v prohlížeči (viz mockServer.ts).
import { billingMode, exhaustLikes, handle, latestSafetyId, resetDemo, setBillingMode, shareView, skipTime } from './mockServer';
import { overlay } from './overlay';

export type TransportResponse = { status: number; json: unknown };

// Po změně režimu plateb si aplikace znovu načte stav předplatného (viz src/lib/billing.ts).
const billingChanged = () => globalThis.dispatchEvent?.(new Event('fapp-demo-billing'));

overlay.init({
  shareView,
  latestSafetyId,
  skipTime,
  reset: () => {
    resetDemo();
    billingChanged();
  },
  billingMode,
  setBillingMode: (mode) => {
    setBillingMode(mode);
    billingChanged();
  },
  exhaustLikes: () => {
    exhaustLikes();
    billingChanged();
  },
});

export async function transport(method: string, path: string, body: unknown, token: string | null): Promise<TransportResponse> {
  await new Promise((r) => setTimeout(r, 120)); // aby se načítání chovalo jako se sítí
  return handle(method, path, body === undefined ? undefined : JSON.parse(JSON.stringify(body)), token);
}
