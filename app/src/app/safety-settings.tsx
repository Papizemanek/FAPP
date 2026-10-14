import * as AppIcons from 'expo-alternate-app-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Banner, Body, Button, ErrorText, Field, Header, Label, Screen, Toggle } from '@/components/ui';
import { api, errorMessage, type Me } from '@/lib/api';
import { useAppLock } from '@/lib/appLock';
import { useSession } from '@/lib/session';

export default function SafetySettings() {
  const { me, setMe } = useSession();
  const lock = useAppLock();
  const [trustedName, setTrustedName] = useState(me?.trustedName ?? '');
  const [trustedPhone, setTrustedPhone] = useState(me?.trustedPhone ?? '');
  const [discreet, setDiscreet] = useState(!!me?.discreet);
  const [changePins, setChangePins] = useState(!me?.hasCheckinPin);
  const [checkinPin, setCheckinPin] = useState('');
  const [duressPin, setDuressPin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Profil se po studeném startu načítá asynchronně – formulář naplníme, až dorazí.
  useEffect(() => {
    if (!me) return;
    setTrustedName(me.trustedName);
    setTrustedPhone(me.trustedPhone);
    setDiscreet(me.discreet);
    setChangePins(!me.hasCheckinPin);
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = { trustedName, trustedPhone, discreet };
      if (changePins) Object.assign(body, { checkinPin, duressPin, password });
      const updated = await api<Me>('PUT', '/me/safety', body);
      setMe(updated);
      if (AppIcons.supportsAlternateIcons) {
        await AppIcons.setAlternateAppIcon(discreet ? 'Discreet' : null).catch(() => {});
      }
      router.back();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const pinsValid = !changePins || (/^\d{4,6}$/.test(checkinPin) && /^\d{4,6}$/.test(duressPin) && checkinPin !== duressPin && (!me?.hasCheckinPin || password));

  return (
    <Screen>
      <Header title="Bezpečnost a soukromí" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 12 }}>
            <Label>Důvěryhodná osoba</Label>
            <Body muted style={{ fontSize: 14 }}>
              Když zahájíš schůzku, pošleme jí SMS s odkazem na tvoji polohu. Upozorníme ji, když se neozveš nebo spustíš poplach.
            </Body>
            <Field label="Jméno" value={trustedName} onChangeText={setTrustedName} placeholder="Např. Petra" />
            <Field label="Telefon" value={trustedPhone} onChangeText={setTrustedPhone} keyboardType="phone-pad" placeholder="777 123 456" />
          </View>

          <View style={{ gap: 12 }}>
            <Label>PIN a nouzový PIN</Label>
            <Body muted style={{ fontSize: 14 }}>
              PINem během schůzky potvrzuješ, že jsi v pořádku. Nouzový PIN vypadá úplně stejně, ale potichu pošle poplach – použij ho, když tě
              někdo nutí aplikaci „uklidnit“.
            </Body>
            {changePins ? (
              <>
                <Field label="PIN (4–6 číslic)" value={checkinPin} onChangeText={setCheckinPin} keyboardType="number-pad" secureTextEntry maxLength={6} />
                <Field label="Nouzový PIN (jiný než PIN)" value={duressPin} onChangeText={setDuressPin} keyboardType="number-pad" secureTextEntry maxLength={6} />
                {me?.hasCheckinPin ? <Field label="Heslo k účtu (pro změnu PINů)" value={password} onChangeText={setPassword} secureTextEntry /> : null}
              </>
            ) : (
              <Banner tone="safe" icon="lock" title="PINy jsou nastavené" action="Změnit" onPress={() => setChangePins(true)} />
            )}
          </View>

          <View style={{ gap: 12 }}>
            <Label>Soukromí</Label>
            <Toggle
              label="Zámek aplikace"
              hint="Face ID, otisk nebo kód telefonu při každém otevření."
              value={lock.enabled}
              onChange={(on) => void lock.setEnabled(on)}
            />
            <Toggle
              label="Diskrétní režim"
              hint="Neutrální ikona a notifikace bez obsahu – nikdo nepozná, o jakou aplikaci jde."
              value={discreet}
              onChange={setDiscreet}
            />
          </View>

          <ErrorText>{error}</ErrorText>
          <Button label="Uložit" onPress={save} loading={busy} disabled={!trustedName || !trustedPhone || !pinsValid} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
