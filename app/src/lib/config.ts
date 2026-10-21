export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

// Uzavřený testovací provoz: server bez tohoto klíče nic neukáže (ACCESS_KEY na serveru).
// Klíč je zabudovaný v sestavení – testovací buildy proto nedávej nikomu mimo testery.
const ACCESS_KEY = process.env.EXPO_PUBLIC_ACCESS_KEY ?? '';
export const accessHeaders: Record<string, string> = ACCESS_KEY ? { 'X-Access-Key': ACCESS_KEY } : {};
