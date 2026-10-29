import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { accessHeaders, API_URL } from './config';
import { i18n } from './i18n';

// Popis zařízení pro seznam přihlášení v nastavení zabezpečení („iPhone 15 · iOS 19“).
const DEVICE = [Device.modelName, Platform.OS === 'web' ? null : `${Device.osName ?? Platform.OS} ${Device.osVersion ?? ''}`.trim()]
  .filter(Boolean)
  .join(' · ');

// Web: přihlášení drží server v cookie HttpOnly (JavaScript k němu nemá přístup), token je jen značka „cookie“.
// X-Requested-With chrání změny před CSRF – formulář z cizího webu takovou hlavičku poslat neumí.
const clientHeaders: Record<string, string> = {
  'X-Requested-With': 'yesyes',
  ...(Platform.OS === 'web' ? { 'X-Client': 'web' } : {}),
  ...(DEVICE ? { 'X-Device': DEVICE } : {}),
};

export type TransportResponse = { status: number; json: unknown };

/**
 * Jediné místo, kde aplikace mluví se serverem. Demo sestavení (app/demo) ho nahrazuje
 * simulovaným backendem v prohlížeči – zbytek aplikace zůstává stejný.
 */
export async function transport(method: string, path: string, body: unknown, token: string | null): Promise<TransportResponse> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...accessHeaders,
      ...clientHeaders,
      // Jazyk chyb, SMS pro důvěryhodnou osobu a notifikací.
      'Accept-Language': i18n.locale,
      // Jazyk zvolený v aplikaci – server podle něj posílá SMS důvěryhodné osobě a notifikace.
      'X-App-Locale': i18n.locale,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  return { status: res.status, json: res.status === 204 ? null : await res.json().catch(() => null) };
}
