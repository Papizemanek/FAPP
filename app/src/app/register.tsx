import { GENDERS } from '@yesyes/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Body, Button, Checkbox, Chip, CodeField, ErrorText, Field, Header, Label, Screen, Title } from '@/components/ui';
import { api, errorMessage, type Gender, type Me } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';

const genderKeys = Object.keys(GENDERS) as Gender[];

/** „31. 12. 1995“ nebo „31.12.1995“ → „1995-12-31“ */
// Číslice z klávesnic jiných písem (arabské, dévanágarí, bengálské, gurmukhí, gudžarátí, urijské, tamilské, telugské,
// kannadské, malajálamské, thajské, plné šířky) → ASCII.
const DIGIT_ZEROS = [0x660, 0x6f0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xe50, 0xff10];
const asciiDigits = (s: string) =>
  s.replace(/[^\x00-\x7f]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const zero = DIGIT_ZEROS.find((z) => code >= z && code <= z + 9);
    return zero === undefined ? ch : String(code - zero);
  });

function parseBirthdate(input: string) {
  const m = asciiDigits(input.trim()).match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]?\s*(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export default function Register() {
  const t = useT();
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
  // Druhý krok: kód z e-mailu (server neprozradí, jestli e-mail už má účet – případně pošle jen upozornění).
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');

  const toggleInterest = (g: Gender) => setInterestedIn((list) => (list.includes(g) ? list.filter((x) => x !== g) : [...list, g]));

  const submit = async () => {
    const iso = parseBirthdate(birthdate);
    if (!iso) return setError(t('register.birthdateInvalid'));
    setBusy(true);
    setError('');
    try {
      await api('POST', '/auth/register', {
        name,
        email,
        password,
        birthdate: iso,
        gender,
        interestedIn,
        confirmAdult: adult,
        acceptRules: rules,
      });
      setCodeSent(true);
      setCode('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ token: string; user: Me }>('POST', '/auth/register/verify', { email, code });
      await signIn(res.token, res.user);
      router.replace('/verify');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (codeSent) {
    return (
      <Screen>
        <Header onBack={() => setCodeSent(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 18 }} keyboardShouldPersistTaps="handled">
            <Title>{t('register.codeTitle')}</Title>
            <Body muted>{t('register.codeSent', { email: email.trim() })}</Body>
            <CodeField value={code} onChangeText={setCode} label={t('register.code')} />
            <ErrorText>{error}</ErrorText>
            <Button label={t('register.confirmCode')} onPress={confirm} loading={busy} disabled={code.replace(/\D/g, '').length !== 6} />
            <Button variant="ghost" label={t('register.resend')} onPress={submit} disabled={busy} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  const ready = name && email && password.length >= 10 && birthdate && gender && interestedIn.length > 0 && adult && rules;

  return (
    <Screen>
      <Header />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 18 }} keyboardShouldPersistTaps="handled">
          <Title>{t('register.title')}</Title>
          <Field label={t('register.name')} value={name} onChangeText={setName} autoComplete="given-name" />
          <Field label={t('register.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label={t('register.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
          <Field label={t('register.birthdate')} placeholder={t('register.birthdatePlaceholder')} value={birthdate} onChangeText={setBirthdate} keyboardType="numbers-and-punctuation" />

          <View style={{ gap: 10 }}>
            <Label>{t('register.iAm')}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {genderKeys.map((g) => (
                <Chip key={g} label={t(`labels.genders.${g}`)} selected={gender === g} onPress={() => setGender(g)} />
              ))}
            </View>
          </View>
          <View style={{ gap: 10 }}>
            <Label>{t('register.showMe')}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {genderKeys.map((g) => (
                <Chip key={g} label={t(`labels.gendersPlural.${g}`)} selected={interestedIn.includes(g)} onPress={() => toggleInterest(g)} />
              ))}
            </View>
          </View>

          <Checkbox checked={adult} onToggle={() => setAdult(!adult)} tone="accent">
            {t('register.confirmAdult')}
          </Checkbox>
          <Checkbox checked={rules} onToggle={() => setRules(!rules)} tone="accent">
            {t('register.acceptRules')}
          </Checkbox>
          <Body muted style={{ fontSize: 13 }}>
            {t('register.verifyNote')}
          </Body>
          <ErrorText>{error}</ErrorText>
          <Button label={t('register.continue')} onPress={submit} loading={busy} disabled={!ready} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
