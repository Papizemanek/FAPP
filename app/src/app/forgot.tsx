import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Body, Button, CodeField, ErrorText, Field, Header, Screen, Title } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useT } from '@/lib/i18n';

// Obnova hesla: e-mail → kód z e-mailu + nové heslo. Server vždy odpoví stejně (nejde zjistit, kdo má účet)
// a po změně odhlásí všechna zařízení.
export default function Forgot() {
  const t = useT();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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

  const send = () =>
    run(async () => {
      await api('POST', '/auth/password/forgot', { email });
      setSent(true);
    });

  const reset = () =>
    run(async () => {
      await api('POST', '/auth/password/reset', { email, code, password });
      setDone(true);
    });

  return (
    <Screen>
      <Header />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
          <Title>{t('forgot.title')}</Title>
          {done ? (
            <>
              <Body muted>{t('forgot.done')}</Body>
              <Button label={t('forgot.toLogin')} onPress={() => router.replace('/login')} />
            </>
          ) : !sent ? (
            <>
              <Body muted>{t('forgot.intro')}</Body>
              <Field label={t('login.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
              <ErrorText>{error}</ErrorText>
              <Button label={t('forgot.send')} onPress={send} loading={busy} disabled={!email} />
            </>
          ) : (
            <>
              <Body muted>{t('forgot.sent', { email: email.trim() })}</Body>
              <CodeField label={t('register.code')} value={code} onChangeText={setCode} />
              <Field label={t('forgot.newPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
              <ErrorText>{error}</ErrorText>
              <Button label={t('forgot.save')} onPress={reset} loading={busy} disabled={code.length !== 6 || password.length < 10} />
              <Button variant="ghost" label={t('register.resend')} onPress={send} disabled={busy} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
