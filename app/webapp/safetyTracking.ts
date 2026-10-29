// Webová verze: poloha během schůzky se posílá, dokud je aplikace otevřená (prohlížeč nemá polohu
// na pozadí). Přístup k serveru zajišťuje přihlašovací cookie z pozvánky, klíč se neposílá.
import { storage } from './storage';

export const SAFETY_LOCATION_TASK = 'yesyes-safety-location';

type Loc = { coords: { latitude: number; longitude: number; accuracy: number | null } };
let watchId: number | null = null;

async function battery(): Promise<number | null> {
  try {
    const b = await (globalThis.navigator as unknown as { getBattery?: () => Promise<{ level: number }> }).getBattery?.();
    return b ? b.level : null;
  } catch {
    return null;
  }
}

export async function reportLocation(loc: Loc) {
  const [token, ids] = await Promise.all([storage.getToken(), storage.getActiveSafetyIds()]);
  if (!token || ids.length === 0) return;
  const level = await battery();
  const stillActive: number[] = [];
  for (const id of ids) {
    try {
      const res = await fetch(`/api/safety/${id}/location`, {
        method: 'POST',
        credentials: 'same-origin',
        // Přihlášení je v cookie; X-Requested-With server vyžaduje u každé změny (ochrana proti CSRF).
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Requested-With': 'yesyes', 'X-Client': 'web' },
        body: JSON.stringify({ lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy, battery: level }),
      });
      if (res.status !== 404 && res.status !== 409) stillActive.push(id);
    } catch {
      stillActive.push(id);
    }
  }
  if (stillActive.length !== ids.length) {
    await storage.setActiveSafetyIds(stillActive);
    if (stillActive.length === 0) stopWatch();
  }
}

function startWatch() {
  const geo = globalThis.navigator?.geolocation;
  if (!geo || watchId != null) return;
  let last = 0;
  watchId = geo.watchPosition(
    (p) => {
      // nejvýš jednou za 30 s, stejně jako v telefonu
      if (Date.now() - last < 30_000) return;
      last = Date.now();
      void reportLocation(p as unknown as Loc);
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 15_000 },
  );
}

function stopWatch() {
  if (watchId != null) globalThis.navigator?.geolocation?.clearWatch(watchId);
  watchId = null;
}

// Po znovuotevření aplikace naváže na běžící schůzky.
void storage.getActiveSafetyIds().then((ids) => ids.length > 0 && startWatch());

export async function ensureBackgroundPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    const geo = globalThis.navigator?.geolocation;
    if (!geo) return resolve(false);
    geo.getCurrentPosition(() => resolve(true), () => resolve(false), { timeout: 20_000 });
  });
}

export async function startSafetyTracking(sessionId: number) {
  const ids = await storage.getActiveSafetyIds();
  if (!ids.includes(sessionId)) await storage.setActiveSafetyIds([...ids, sessionId]);
  startWatch();
}

export async function stopSafetyTracking(sessionId: number) {
  const ids = (await storage.getActiveSafetyIds()).filter((id) => id !== sessionId);
  await storage.setActiveSafetyIds(ids);
  if (ids.length === 0) stopWatch();
}
