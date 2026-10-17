import type { ProductId } from '@fapp/shared';
import { router } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { t } from '@/lib/i18n';
import { api, ApiError, type Billing } from './api';

// Stav předplatného sdílený mezi obrazovkami. Placené prvky se ukazují jen v placeném režimu
// (BILLING_MODE=paid) nebo s darovaným předplatným – na startu je F*app celý zdarma.

let current: Billing | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function setBilling(next: Billing | null) {
  current = next;
  listeners.forEach((fn) => fn());
}

export async function refreshBilling() {
  try {
    setBilling(await api<Billing>('GET', '/billing'));
  } catch {
    // necháme poslední známý stav
  }
  return current;
}

export function useBilling() {
  const billing = useSyncExternalStore(subscribe, () => current, () => current);
  useEffect(() => {
    if (!current) void refreshBilling();
  }, []);
  return billing;
}

export const showPaid = (b: Billing | null): b is Billing => !!b && (b.mode === 'paid' || b.plan !== 'free');

/** Po swipu server vrací, kolik lajků zbývá – ať počítadlo nemusí znovu načítat celý stav. */
export function setLikesLeft(left: number | null | undefined) {
  if (!current || left === undefined || current.likes.remaining === left) return;
  setBilling({ ...current, likes: { ...current.likes, remaining: left } });
}

/** Nákup. Ve vývoji a v prototypu bez platby, v obchodech přes RevenueCat (viz README). */
export async function purchase(productId: ProductId) {
  if (current?.provider === 'revenuecat') {
    throw new ApiError(0, t('billing.storeNotConnected'));
  }
  setBilling(await api<Billing>('POST', '/billing/purchase', { productId }));
}

/** Chyba 402 = placená funkce → otevře nabídku. Vrací true, když nabídku otevřela. */
export function openPaywall(err: unknown) {
  if (!(err instanceof ApiError) || err.status !== 402) return false;
  const { code, plan, credit, resetAt } = err.data;
  router.push({ pathname: '/premium', params: { reason: code ?? '', plan: plan ?? '', credit: credit ?? '', resetAt: resetAt ?? '' } });
  return true;
}

// Webový prototyp: demo panel přepíná režim plateb a dá vědět, ať se stav načte znovu.
const g = globalThis as { addEventListener?: (type: string, fn: () => void) => void };
g.addEventListener?.('fapp-demo-billing', () => void refreshBilling());
