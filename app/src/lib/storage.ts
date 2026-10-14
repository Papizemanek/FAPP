import * as SecureStore from 'expo-secure-store';

// AFTER_FIRST_UNLOCK: token a seznam běžících schůzek musí jít přečíst i z úlohy na pozadí,
// když je telefon zamčený (sdílení polohy během schůzky).
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

const KEYS = {
  token: 'fapp.token',
  activeSafety: 'fapp.activeSafety',
  appLock: 'fapp.appLock',
} as const;

export const storage = {
  getToken: () => SecureStore.getItemAsync(KEYS.token, options),
  setToken: (token: string | null) =>
    token ? SecureStore.setItemAsync(KEYS.token, token, options) : SecureStore.deleteItemAsync(KEYS.token, options),

  async getActiveSafetyIds(): Promise<number[]> {
    try {
      return JSON.parse((await SecureStore.getItemAsync(KEYS.activeSafety, options)) ?? '[]');
    } catch {
      return [];
    }
  },
  setActiveSafetyIds: (ids: number[]) => SecureStore.setItemAsync(KEYS.activeSafety, JSON.stringify(ids), options),

  getAppLock: async () => (await SecureStore.getItemAsync(KEYS.appLock, options)) === '1',
  setAppLock: (on: boolean) => SecureStore.setItemAsync(KEYS.appLock, on ? '1' : '0', options),
};
