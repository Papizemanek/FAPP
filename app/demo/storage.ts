// Demo: přihlášení v localStorage místo zabezpečeného úložiště telefonu.
const get = (k: string) => {
  try {
    return globalThis.localStorage?.getItem(k) ?? null;
  } catch {
    return null;
  }
};
const set = (k: string, v: string | null) => {
  try {
    if (v === null) globalThis.localStorage?.removeItem(k);
    else globalThis.localStorage?.setItem(k, v);
  } catch {
    // bez úložiště zůstane přihlášení jen do zavření stránky
  }
};

export const storage = {
  getToken: async () => get('yesyes.token'),
  setToken: async (token: string | null) => set('yesyes.token', token),
  getActiveSafetyIds: async (): Promise<number[]> => [],
  setActiveSafetyIds: async (_ids: number[]) => {},
  getAppLock: async () => false,
  setAppLock: async (_on: boolean) => {},
  getLanguage: async () => get('yesyes.language'),
  setLanguage: async (code: string | null) => set('yesyes.language', code),
};
