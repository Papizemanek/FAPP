import { API_URL } from './config';

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
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: res.status === 204 ? null : await res.json().catch(() => null) };
}
