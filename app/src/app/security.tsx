import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Banner, Body, Button, CodeField, ErrorText, Field, Header, Label, Screen } from '@/components/ui';
import { api, errorMessage, type DeviceSession, type Me } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { colors, fonts } from '@/lib/theme';

type TwoFactorStep = 'idle' | 'password' | 'scan' | 'codes' | 'disable';

// Zabezpečení účtu: změna hesla, dvoufázové ověření a přihlášená zařízení.
export default function Security() {
  const t = useT();
  const { me, setMe } = useSession();
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [step, setStep] = useState<TwoFactorStep>('idle');
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const loadSessions = useCallback(() => {
    api<DeviceSession[]>('GET', '/me/sessions').then(setSessions).catch(() => {});
  }, []);
  useEffect(loadSessions, [loadSessions]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = () =>
    run(async () => {
      await api('PUT', '/me/password', { password: currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setNotice(t('security.passwordChanged'));
      loadSessions();
    });

  const startTwoFactor = () =>
    run(async () => {
      setSecret(await api<{ secret: string; otpauthUrl: string }>('POST', '/me/2fa/setup', { password }));
      setPassword('');
      setCode('');
      setStep('scan');
    });

  const enableTwoFactor = () =>
    run(async () => {
      const res = await api<{ recoveryCodes: string[]; user: Me }>('POST', '/me/2fa/enable', { code });
      setMe(res.user);
      setRecoveryCodes(res.recoveryCodes);
      setSecret(null);
      setStep('codes');
    });

  const disableTwoFactor = () =>
    run(async () => {
      const res = await api<{ user: Me }>('POST', '/me/2fa/disable', { password, code });
      setMe(res.user);
      setPassword('');
      setCode('');
      setStep('idle');
    });

  const revoke = (id: number) => run(async () => {
    await api('DELETE', `/me/sessions/${id}`);
    loadSessions();
  });

  const revokeOthers = () => run(async () => {
    await api('POST', '/me/sessions/revoke-others');
    loadSessions();
  });

  const shareCodes = () => Share.share({ message: recoveryCodes.join('\n') }).catch(() => {});

  return (
    <Screen>
      <Header title={t('security.title')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 28 }} keyboardShouldPersistTaps="handled">
          {error ? <ErrorText>{error}</ErrorText> : null}
          {notice ? <Banner tone="safe" icon="shieldCheck" title={notice} /> : null}

          {/* Dvoufázové ověření */}
          <View style={{ gap: 12 }}>
            <Label>{t('security.twoFactor.title')}</Label>
            <Banner
              tone={me?.twoFactor ? 'safe' : 'warn'}
              icon="shieldCheck"
              title={me?.twoFactor ? t('security.twoFactor.on') : t('security.twoFactor.off')}
              subtitle={t('security.twoFactor.hint')}
            />
            {step === 'idle' && !me?.twoFactor ? <Button label={t('security.twoFactor.enable')} onPress={() => setStep('password')} /> : null}
            {step === 'idle' && me?.twoFactor ? (
              <Button variant="ghost" label={t('security.twoFactor.disable')} onPress={() => setStep('disable')} />
            ) : null}

            {step === 'password' ? (
              <>
                <Field label={t('security.currentPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
                <Button label={t('security.continue')} onPress={startTwoFactor} loading={busy} disabled={!password} />
                <Button variant="ghost" label={t('common.cancel')} onPress={() => setStep('idle')} />
              </>
            ) : null}

            {step === 'scan' && secret ? (
              <>
                <Body muted>{t('security.twoFactor.scan')}</Body>
                {Platform.OS !== 'web' ? (
                  <Button variant="ghost" label={t('security.twoFactor.openApp')} onPress={() => Linking.openURL(secret.otpauthUrl).catch(() => {})} />
                ) : null}
                <View style={s.secretBox}>
                  <Text style={s.secretLabel}>{t('security.twoFactor.key')}</Text>
                  <Text selectable style={s.secret}>
                    {secret.secret.match(/.{1,4}/g)?.join(' ')}
                  </Text>
                </View>
                <CodeField label={t('security.twoFactor.code')} value={code} onChangeText={setCode} />
                <Button label={t('security.twoFactor.confirm')} onPress={enableTwoFactor} loading={busy} disabled={code.length !== 6} />
                <Button variant="ghost" label={t('common.cancel')} onPress={() => setStep('idle')} />
              </>
            ) : null}

            {step === 'codes' ? (
              <>
                <Body>{t('security.twoFactor.codesIntro')}</Body>
                <View style={s.codes}>
                  {recoveryCodes.map((c) => (
                    <Text key={c} selectable style={s.code}>
                      {c}
                    </Text>
                  ))}
                </View>
                {Platform.OS !== 'web' ? <Button variant="ghost" label={t('security.twoFactor.saveCodes')} onPress={shareCodes} /> : null}
                <Button label={t('security.twoFactor.codesDone')} onPress={() => setStep('idle')} />
              </>
            ) : null}

            {step === 'disable' ? (
              <>
                <Field label={t('security.currentPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
                <CodeField label={t('security.twoFactor.codeOrBackup')} value={code} onChangeText={setCode} allowRecovery />
                <Button variant="danger" label={t('security.twoFactor.disable')} onPress={disableTwoFactor} loading={busy} disabled={!password || code.length < 6} />
                <Button variant="ghost" label={t('common.cancel')} onPress={() => setStep('idle')} />
              </>
            ) : null}
          </View>

          {/* Změna hesla */}
          <View style={{ gap: 12 }}>
            <Label>{t('security.password.title')}</Label>
            <Field label={t('security.currentPassword')} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="password" />
            <Field
              label={t('security.password.new')}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoComplete="new-password"
              hint={t('security.password.hint')}
            />
            <Button label={t('security.password.save')} onPress={changePassword} loading={busy} disabled={!currentPassword || newPassword.length < 10} />
          </View>

          {/* Přihlášená zařízení */}
          <View style={{ gap: 12 }}>
            <Label>{t('security.devices.title')}</Label>
            {sessions.map((d) => (
              <View key={d.id} style={s.device}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.deviceName}>{d.device || t('security.devices.unknown')}</Text>
                  <Text style={s.deviceMeta}>
                    {d.current ? t('security.devices.current') : t('security.devices.lastUsed', { date: formatDate(d.lastUsedAt, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) })}
                  </Text>
                </View>
                {!d.current ? (
                  <Pressable accessibilityRole="button" onPress={() => revoke(d.id)} style={s.revoke}>
                    <Text style={s.revokeText}>{t('security.devices.signOut')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            {sessions.length > 1 ? <Button variant="ghost" label={t('security.devices.signOutOthers')} onPress={revokeOthers} disabled={busy} /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  secretBox: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 6 },
  secretLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  secret: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, letterSpacing: 1 },
  codes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  code: { width: '47%', fontFamily: fonts.bold, fontSize: 16, color: colors.text, backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 10, textAlign: 'center', overflow: 'hidden' },
  device: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14 },
  deviceName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  deviceMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  revoke: { paddingHorizontal: 12, height: 36, borderRadius: 999, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  revokeText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
});
