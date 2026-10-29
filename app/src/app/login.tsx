import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Body, Button, CodeField, ErrorText, Field, Header, Screen, Title } from '@/components/ui';
import { api, errorMessage, type LoginResult, type Me } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';

export default function Login() {
  const t = useT();
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Dvoufázové ověření: po heslu ještě kód z autentizační aplikace (nebo záložní kód).
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const finish = async (res: { token: string; user: Me }) => {
    await signIn(res.token, res.user);
    router.replace('/');
  };

  const submit = () =>
    run(async () => {
      const res = await api<LoginResult>('POST', '/auth/login', { email, password });
      if ('twoFactor' in res) {
        setChallenge(res.challenge);
        setCode('');
      } else {
        await finish(res);
      }
    });

  const submitCode = () =>
    run(async () => {
      try {
        await finish(await api<{ token: string; user: Me }>('POST', '/auth/login/2fa', { challenge, code }));
      } catch (err) {
        // Vypršelá výzva → zpátky na heslo.
        if (err instanceof Error && /401|vypršel|expired/i.test(err.message)) setChallenge(null);
        throw err;
      }
    });

  if (challenge) {
    return (
      <Screen>
        <Header onBack={() => setChallenge(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
            <Title>{t('login.twoFactorTitle')}</Title>
            <Body muted>{t('login.twoFactorHint')}</Body>
            <CodeField label={t('login.code')} value={code} onChangeText={setCode} allowRecovery />
            <ErrorText>{error}</ErrorText>
            <Button label={t('login.submit')} onPress={submitCode} loading={busy} disabled={code.length < 6} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
          <Title>{t('login.title')}</Title>
          <Field label={t('login.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label={t('login.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
          <ErrorText>{error}</ErrorText>
          <Button label={t('login.submit')} onPress={submit} loading={busy} disabled={!email || !password} />
          <Button variant="ghost" label={t('login.forgot')} onPress={() => router.push({ pathname: '/forgot', params: { email } })} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
