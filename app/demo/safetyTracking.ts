// Demo: poloha během schůzky se simuluje v mockServer.ts (prohlížeč nemá polohu na pozadí).
export const SAFETY_LOCATION_TASK = 'yesyes-safety-location';
export async function reportLocation() {}
export async function ensureBackgroundPermission() {
  return true;
}
export async function startSafetyTracking(_sessionId: number) {}
export async function stopSafetyTracking(_sessionId: number) {}
