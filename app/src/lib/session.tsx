import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setAuthToken, setSessionReady, setUnauthorizedHandler, type Me } from './api';
import { setBilling } from './billing';
import { i18n } from './i18n';
import { registerPushToken } from './notifications';
import { storage } from './storage';

type Session = {
  status: 'loading' | 'signedOut' | 'signedIn';
  me: Me | null;
  signIn: (token: string, me: Me) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<Me | null>;
  setMe: (me: Me) => void;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Session['status']>('loading');
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => i18n.setSelfGender(me?.gender ?? null), [me?.gender]);

  const clear = useCallback(async () => {
    setAuthToken(null);
    await storage.setToken(null);
    setMe(null);
    setBilling(null);
    setStatus('signedOut');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const fresh = await api<Me>('GET', '/me');
      setMe(fresh);
      return fresh;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void clear());
    (async () => {
      const token = await storage.getToken().catch(() => null);
      setAuthToken(token);
      setSessionReady();
      if (!token) return setStatus('signedOut');
      const fresh = await refresh();
      if (fresh) {
        setStatus('signedIn');
        void registerPushToken();
      } else {
        await clear();
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, [clear, refresh]);

  const signIn = useCallback(async (token: string, user: Me) => {
    setAuthToken(token);
    await storage.setToken(token);
    setBilling(null);
    setMe(user);
    setStatus('signedIn');
    void registerPushToken();
  }, []);

  const signOut = useCallback(async () => {
    await api('POST', '/auth/logout').catch(() => {});
    await clear();
  }, [clear]);

  const value = useMemo(() => ({ status, me, signIn, signOut, refresh, setMe }), [status, me, signIn, signOut, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession mimo SessionProvider');
  return ctx;
}
