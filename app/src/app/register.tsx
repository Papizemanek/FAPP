import { GENDERS } from '@fapp/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Body, Button, Checkbox, Chip, ErrorText, Field, Header, Label, Screen, Title } from '@/components/ui';
import { api, errorMessage, type Gender, type Me } from '@/lib/api';
import { useSession } from '@/lib/session';

const genderKeys = Object.keys(GENDERS) as Gender[];
const plural: Record<Gender, string> = { man: 'Muže', woman: 'Ženy', nonbinary: 'Nebinární' };

/** „31. 12. 1995“ nebo „31.12.1995“ → „1995-12-31“ */
function parseBirthdate(input: string) {
  const m = input.trim().match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export default function Register() {
  const { signIn } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [interestedIn, setInterestedIn] = useState<Gender[]>([]);
  const [adult, setAdult] = useState(false);
  const [rules, setRules] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleInterest = (g: Gender) => setInterestedIn((list) => (list.includes(g) ? list.filter((x) => x !== g) : [...list, g]));

  const submit = async () => {
    const iso = parseBirthdate(birthdate);
    if (!iso) return setError('Datum narození zadej jako DD. MM. RRRR.');
    setBusy(true);
    setError('');
    try {
      const res = await api<{ token: string; user: Me }>('POST', '/auth/register', {
        name,
        email,
        password,
        birthdate: iso,
        gender,
        interestedIn,
        confirmAdult: adult,
        acceptRules: rules,
      });
      await signIn(res.token, res.user);
      router.replace('/verify');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const ready = name && email && password.length >= 10 && birthdate && gender && interestedIn.length > 0 && adult && rules;

  return (
    <Screen>
      <Header />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 18 }} keyboardShouldPersistTaps="handled">
          <Title>Vytvořit účet</Title>
          <Field label="Jméno (uvidí ho ostatní)" value={name} onChangeText={setName} autoComplete="given-name" />
          <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Heslo (aspoň 10 znaků)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
          <Field label="Datum narození" placeholder="DD. MM. RRRR" value={birthdate} onChangeText={setBirthdate} keyboardType="numbers-and-punctuation" />

          <View style={{ gap: 10 }}>
            <Label>Jsem</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {genderKeys.map((g) => (
                <Chip key={g} label={GENDERS[g]} selected={gender === g} onPress={() => setGender(g)} />
              ))}
            </View>
          </View>
          <View style={{ gap: 10 }}>
            <Label>Koho mi ukazovat</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {genderKeys.map((g) => (
                <Chip key={g} label={plural[g]} selected={interestedIn.includes(g)} onPress={() => toggleInterest(g)} />
              ))}
            </View>
          </View>

          <Checkbox checked={adult} onToggle={() => setAdult(!adult)} tone="accent">
            Je mi 18 let nebo víc.
          </Checkbox>
          <Checkbox checked={rules} onToggle={() => setRules(!rules)} tone="accent">
            Souhlasím s pravidly komunity a se zpracováním svých údajů, včetně údajů o sexuálním životě, pro fungování F*app.
          </Checkbox>
          <Body muted style={{ fontSize: 13 }}>
            Hned potom ověříme tvou totožnost a věk (doklad a selfie). Doklad si neukládáme.
          </Body>
          <ErrorText>{error}</ErrorText>
          <Button label="Pokračovat" onPress={submit} loading={busy} disabled={!ready} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
