import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, AppState, StyleSheet, View } from 'react-native';
import { Body, Button, Logo, Title } from '@/components/ui';
import { i18n, useT } from '@/lib/i18n';
import { api, errorMessage, type SafetySession } from './api';
import { storage } from './storage';
import { colors } from './theme';

// Zámek aplikace (Face ID / otisk / kód telefonu). Po návratu z pozadí po víc než 30 s se aplikace zamkne.
// I na zamčené obrazovce jde při probíhající schůzce spustit SOS – bezpečí má přednost.

const RELOCK_AFTER_MS = 30_000;

type AppLock = { enabled: boolean; setEnabled: (on: boolean) => Promise<boolean> };
const AppLockContext = createContext<AppLock>({ enabled: false, setEnabled: async () => false });
export const useAppLock = () => useContext(AppLockContext);

async function authenticate() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync());
  if (!enrolled) return true; // bez zabezpečení telefonu nemá zámek čím ověřit – nezamykat natrvalo
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: i18n.t('appLock.prompt'), cancelLabel: i18n.t('common.cancel') });
  return result.success;
}

export function AppLockProvider({ children, signedIn }: { children: ReactNode; signedIn: boolean }) {
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    storage.getAppLock().then((on) => {
      setEnabledState(on);
      setLocked(on);
      if (on) ScreenCapture.enableAppSwitcherProtectionAsync().catch(() => {});
    });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundAt.current = Date.now();
      if (state === 'active' && enabled && backgroundAt.current && Date.now() - backgroundAt.current > RELOCK_AFTER_MS) {
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, [enabled]);

  const setEnabled = useCallback(async (on: boolean) => {
    if (on && !(await authenticate())) return false;
    await storage.setAppLock(on);
    setEnabledState(on);
    if (on) await ScreenCapture.enableAppSwitcherProtectionAsync().catch(() => {});
    else await ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
    return true;
  }, []);

  return (
    <AppLockContext.Provider value={{ enabled, setEnabled }}>
      {children}
      {locked && enabled ? <LockScreen signedIn={signedIn} onUnlock={() => setLocked(false)} /> : null}
    </AppLockContext.Provider>
  );
}

function LockScreen({ onUnlock, signedIn }: { onUnlock: () => void; signedIn: boolean }) {
  const t = useT();
  const [active, setActive] = useState<SafetySession[]>([]);

  const unlock = useCallback(async () => {
    if (await authenticate()) onUnlock();
  }, [onUnlock]);

  useEffect(() => {
    void unlock();
    if (signedIn) api<SafetySession[]>('GET', '/safety/active').then(setActive).catch(() => {});
  }, [unlock, signedIn]);

  const sos = async () => {
    try {
      await Promise.all(active.map((s) => api('POST', `/safety/${s.id}/sos`)));
      const name = active[0]?.trustedName;
      Alert.alert(t('appLock.sosSentTitle'), name ? t('appLock.sosSentBody', { name }) : t('appLock.sosSentBodyNoName'));
    } catch (err) {
      Alert.alert(t('appLock.sosFailedTitle'), errorMessage(err));
    }
  };

  return (
    <View style={[StyleSheet.absoluteFill, s.wrap]}>
      <View style={s.center}>
        <Logo size={56} />
        <Title style={{ fontSize: 22 }}>{t('appLock.lockedTitle')}</Title>
        <Body muted>{t('appLock.lockedBody')}</Body>
      </View>
      <View style={{ gap: 12 }}>
        {active.length > 0 ? <Button variant="sos" label={t('appLock.sosHold')} onLongPress={sos} height={64} /> : null}
        <Button label={t('appLock.unlock')} onPress={unlock} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: colors.bg, padding: 24, paddingTop: 80, paddingBottom: 48, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
