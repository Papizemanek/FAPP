import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { API_URL } from './config';
import { storage } from './storage';

// Sdílení polohy během schůzky – běží i se zhasnutým displejem a na pozadí.
// Úloha se musí definovat hned při startu JS (import v kořenovém layoutu), protože ji systém
// může spustit i bez otevřené aplikace.

export const SAFETY_LOCATION_TASK = 'fapp-safety-location';

async function postLocation(sessionId: number, token: string, loc: Location.LocationObject, battery: number | null) {
  const res = await fetch(`${API_URL}/api/safety/${sessionId}/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
      battery,
    }),
  });
  return res.status;
}

/** Pošle polohu do všech běžících schůzek. Ukončené (409/404) ze seznamu vyřadí. */
export async function reportLocation(loc: Location.LocationObject) {
  const [token, ids] = await Promise.all([storage.getToken(), storage.getActiveSafetyIds()]);
  if (!token || ids.length === 0) return;
  const battery = await Battery.getBatteryLevelAsync().catch(() => null);
  const stillActive: number[] = [];
  for (const id of ids) {
    try {
      const status = await postLocation(id, token, loc, battery != null && battery >= 0 ? battery : null);
      if (status !== 404 && status !== 409) stillActive.push(id);
    } catch {
      stillActive.push(id); // bez signálu – zkusíme to s další polohou
    }
  }
  if (stillActive.length !== ids.length) {
    await storage.setActiveSafetyIds(stillActive);
    if (stillActive.length === 0) await stopUpdates();
  }
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(SAFETY_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  await reportLocation(data.locations[data.locations.length - 1]);
});

async function stopUpdates() {
  if (await Location.hasStartedLocationUpdatesAsync(SAFETY_LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(SAFETY_LOCATION_TASK);
  }
}

/** Požádá o polohu „vždy“. Vrací false, pokud ji uživatel nepovolil. */
export async function ensureBackgroundPermission(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted';
}

export async function startSafetyTracking(sessionId: number) {
  const ids = await storage.getActiveSafetyIds();
  if (!ids.includes(sessionId)) await storage.setActiveSafetyIds([...ids, sessionId]);
  await Location.startLocationUpdatesAsync(SAFETY_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 30_000,
    distanceInterval: 20,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      // Neutrální text – notifikace je vidět na zamčené obrazovce.
      notificationTitle: 'Sdílení polohy je zapnuté',
      notificationBody: 'Ukončíš ho v aplikaci.',
      notificationColor: '#62E0B5',
      killServiceOnDestroy: false,
    },
  });
  const now = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  if (now) await reportLocation(now);
}

export async function stopSafetyTracking(sessionId: number) {
  const ids = (await storage.getActiveSafetyIds()).filter((id) => id !== sessionId);
  await storage.setActiveSafetyIds(ids);
  if (ids.length === 0) await stopUpdates();
}
