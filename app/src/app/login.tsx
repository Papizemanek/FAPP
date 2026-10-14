import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Button, ErrorText, Field, Header, Screen, Title } from '@/components/ui';
import { api, errorMessage, type Me } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function Login() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ token: string; user: Me }>('POST', '/auth/login', { email, password });
      await signIn(res.token, res.user);
      router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
          <Title>Přihlášení</Title>
          <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Heslo" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
          <ErrorText>{error}</ErrorText>
          <Button label="Přihlásit se" onPress={submit} loading={busy} disabled={!email || !password} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
