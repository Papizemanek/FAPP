// Webová verze: poloha z prohlížeče (navigator.geolocation). Na pozadí prohlížeč polohu nedává –
// sdílení během schůzky běží jen s otevřenou aplikací (viz webapp/safetyTracking.ts).
const geo = () => globalThis.navigator?.geolocation;
const granted = { granted: true, status: 'granted', canAskAgain: true };
const denied = { granted: false, status: 'denied', canAskAgain: true };

const toLocation = (p) => ({
  coords: {
    latitude: p.coords.latitude,
    longitude: p.coords.longitude,
    accuracy: p.coords.accuracy,
    altitude: p.coords.altitude,
    altitudeAccuracy: p.coords.altitudeAccuracy,
    heading: p.coords.heading,
    speed: p.coords.speed,
  },
  timestamp: p.timestamp,
});

const current = (opts = {}) =>
  new Promise((resolve, reject) => {
    if (!geo()) return reject(new Error('Poloha není v tomto prohlížeči dostupná.'));
    geo().getCurrentPosition((p) => resolve(toLocation(p)), reject, {
      enableHighAccuracy: (opts.accuracy ?? 3) >= 4,
      timeout: 20000,
      maximumAge: 30000,
    });
  });

async function permission() {
  try {
    const s = await globalThis.navigator.permissions.query({ name: 'geolocation' });
    return s.state === 'granted' ? granted : s.state === 'denied' ? { ...denied, canAskAgain: false } : { ...denied, status: 'undetermined' };
  } catch {
    return { ...denied, status: 'undetermined' };
  }
}

module.exports = {
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
  getForegroundPermissionsAsync: permission,
  // Prohlížeč se zeptá až při prvním čtení polohy.
  requestForegroundPermissionsAsync: () => current().then(() => granted, () => denied),
  getBackgroundPermissionsAsync: permission,
  requestBackgroundPermissionsAsync: permission,
  getCurrentPositionAsync: current,
  hasStartedLocationUpdatesAsync: async () => false,
  startLocationUpdatesAsync: async () => {},
  stopLocationUpdatesAsync: async () => {},
  watchPositionAsync: async (opts, cb) => {
    const id = geo()?.watchPosition((p) => cb(toLocation(p)), () => {}, { enableHighAccuracy: true, maximumAge: 15000 });
    return { remove: () => id != null && geo()?.clearWatch(id) };
  },
};
