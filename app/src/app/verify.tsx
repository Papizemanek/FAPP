import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Banner, Body, Button, ErrorText, Screen, Title } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

type VerificationState = { status: 'none' | 'pending' | 'approved' | 'declined'; message: string };

export default function Verify() {
  const t = useT();
  const { refresh, signOut } = useSession();
  const [state, setState] = useState<VerificationState | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api<VerificationState>('GET', '/verification');
      setState(s);
      if (s.status === 'approved') {
        await refresh();
        router.replace('/discover');
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const { url } = await api<{ provider: string; url: string | null }>('POST', '/verification/start');
      if (url) {
        await WebBrowser.openAuthSessionAsync(url, 'yesyes://verify');
        await load();
      } else {
        setDevMode(true); // vývojový server bez skutečného ověřovatele
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const devDecide = async () => {
    setBusy(true);
    try {
      await api('POST', '/verification/dev-decide', { approved: true });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 20, flexGrow: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
          <Icon name="shieldCheck" size={48} color={colors.safe} />
          <Title style={{ fontSize: 32 }}>{t('verify.title')}</Title>
          <Body muted>{t('verify.intro')}</Body>
          <Body muted>{t('verify.privacy')}</Body>
          {state?.status === 'pending' ? (
            <Banner tone="warn" title={t('verify.pending.title')} subtitle={t('verify.pending.subtitle')} action={t('verify.pending.refresh')} onPress={load} />
          ) : null}
          {state?.status === 'declined' ? <Banner tone="alarm" title={t('verify.declined')} subtitle={state.message} /> : null}
          <ErrorText>{error}</ErrorText>
        </View>
        <View style={{ gap: 12 }}>
          {devMode ? (
            <Button variant="safe" label={t('verify.devApprove')} onPress={devDecide} loading={busy} />
          ) : (
            <Button label={state?.status === 'declined' ? t('verify.retry') : t('verify.start')} onPress={start} loading={busy} />
          )}
          <Button variant="ghost" label={t('verify.signOut')} onPress={async () => { await signOut(); router.replace('/welcome'); }} />
        </View>
      </ScrollView>
    </Screen>
  );
}
