// Webová verze: přihlášení a běžící schůzky v localStorage (zabezpečené úložiště telefonu prohlížeč nemá).
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
  async getActiveSafetyIds(): Promise<number[]> {
    try {
      return JSON.parse(get('yesyes.activeSafety') ?? '[]');
    } catch {
      return [];
    }
  },
  setActiveSafetyIds: async (ids: number[]) => set('yesyes.activeSafety', JSON.stringify(ids)),
  // Zámek Face ID web neumí.
  getAppLock: async () => false,
  setAppLock: async (_on: boolean) => {},
  getLanguage: async () => get('yesyes.language'),
  setLanguage: async (code: string | null) => set('yesyes.language', code),
};
