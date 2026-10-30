import * as AppIcons from 'expo-alternate-app-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Banner, Body, Button, ErrorText, Field, Header, Label, Screen, Toggle } from '@/components/ui';
import { api, errorMessage, type Me } from '@/lib/api';
import { useAppLock } from '@/lib/appLock';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';

export default function SafetySettings() {
  const t = useT();
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
      <Header title={t('safetySettings.title')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 12 }}>
            <Label>{t('safetySettings.trustedLabel')}</Label>
            <Body muted style={{ fontSize: 14 }}>
              {t('safetySettings.trustedHint')}
            </Body>
            <Field label={t('safetySettings.nameLabel')} value={trustedName} onChangeText={setTrustedName} placeholder={t('safetySettings.namePlaceholder')} />
            <Field
              label={t('safetySettings.phoneLabel')}
              value={trustedPhone}
              onChangeText={setTrustedPhone}
              keyboardType="phone-pad"
              placeholder={t('safetySettings.phonePlaceholder')}
            />
          </View>

          <View style={{ gap: 12 }}>
            <Label>{t('safetySettings.pinsLabel')}</Label>
            <Body muted style={{ fontSize: 14 }}>
              {t('safetySettings.pinsHint')}
            </Body>
            {changePins ? (
              <>
                <Field label={t('safetySettings.checkinPinLabel')} value={checkinPin} onChangeText={setCheckinPin} keyboardType="number-pad" secureTextEntry maxLength={6} />
                <Field label={t('safetySettings.duressPinLabel')} value={duressPin} onChangeText={setDuressPin} keyboardType="number-pad" secureTextEntry maxLength={6} />
                {me?.hasCheckinPin ? <Field label={t('safetySettings.passwordLabel')} value={password} onChangeText={setPassword} secureTextEntry /> : null}
              </>
            ) : (
              <Banner tone="safe" icon="lock" title={t('safetySettings.pinsSet')} action={t('safetySettings.change')} onPress={() => setChangePins(true)} />
            )}
          </View>

          <View style={{ gap: 12 }}>
            <Label>{t('safetySettings.privacyLabel')}</Label>
            <Toggle
              label={t('safetySettings.appLock')}
              hint={t('safetySettings.appLockHint')}
              value={lock.enabled}
              onChange={(on) => void lock.setEnabled(on)}
            />
            <Toggle
              label={t('safetySettings.discreet')}
              hint={t('safetySettings.discreetHint')}
              value={discreet}
              onChange={setDiscreet}
            />
          </View>

          <ErrorText>{error}</ErrorText>
          {changePins && checkinPin.length >= 4 && checkinPin === duressPin ? (
            <ErrorText>{t('safetySettings.pinsMustDiffer')}</ErrorText>
          ) : null}
          <Button label={t('safetySettings.save')} onPress={save} loading={busy} disabled={!trustedName || !trustedPhone || !pinsValid} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
