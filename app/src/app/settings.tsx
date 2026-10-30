import { GENDERS, TRAVEL_CITIES, type TravelCityId } from '@yesyes/shared';
import { LOCALES } from '@yesyes/shared/i18n';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PickerSheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { Banner, Button, Chip, CodeField, ErrorText, Field, Header, Label, Screen, Stepper, Toggle } from '@/components/ui';
import { api, errorMessage, type Billing, type Gender, type Me } from '@/lib/api';
import { openPaywall, setBilling, showPaid, useBilling } from '@/lib/billing';
import { formatDate } from '@/lib/format';
import { i18n, useLocale, useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { colors, fonts } from '@/lib/theme';

const genderKeys = Object.keys(GENDERS) as Gender[];
const cityKeys = Object.keys(TRAVEL_CITIES) as TravelCityId[];

// Nastavení: koho hledám, bezpečnost, účet, předplatné, jazyk. Profil (co vidí ostatní) je zvlášť.
export default function Settings() {
  const t = useT();
  useLocale(); // výběr jazyka se po změně překreslí
  const { me, setMe, signOut } = useSession();
  const billing = useBilling();
  const [search, setSearch] = useState(() => toSearch(me));
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [languageOpen, setLanguageOpen] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteCode, setDeleteCode] = useState('');

  useEffect(() => setSearch(toSearch(me)), [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return <Screen />;

  const patch = (p: Partial<ReturnType<typeof toSearch>>) => {
    setSearch((f) => ({ ...f, ...p }));
    setSaved(false);
  };
  const toggle = (g: Gender) =>
    patch({ interestedIn: search.interestedIn.includes(g) ? search.interestedIn.filter((x) => x !== g) : [...search.interestedIn, g] });

  const saveSearch = async () => {
    setBusy(true);
    setError('');
    try {
      // Server ukládá profil celý – zbytek bereme z uloženého profilu.
      const body = { name: me.name, bio: me.bio, gender: me.gender, tags: me.tags, ...search };
      setMe(await api<Me>('PUT', '/me', body));
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Inkognito a „Na cestách“ (Plus). Bez předplatného otevře nabídku.
  const updateBilling = async (body: { incognito?: boolean; travelCity?: TravelCityId | null }) => {
    setError('');
    try {
      setBilling(await api<Billing>('PUT', '/billing/settings', body));
    } catch (err) {
      if (!openPaywall(err)) setError(errorMessage(err));
    }
  };

  const deleteAccount = async () => {
    try {
      await api('DELETE', '/me', { password: deletePassword, code: deleteCode });
      await signOut();
      router.replace('/welcome');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const safetyReady = me.trustedPhone && me.hasCheckinPin && me.hasDuressPin;

  return (
    <Screen>
      <Header title={t('settings.title')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 28 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 14 }}>
            <Text style={s.section}>{t('settings.search')}</Text>
            <View style={{ gap: 10 }}>
              <Label>{t('profile.showMe')}</Label>
              <View style={s.wrap}>
                {genderKeys.map((g) => (
                  <Chip key={g} label={t(`labels.gendersPlural.${g}`)} selected={search.interestedIn.includes(g)} onPress={() => toggle(g)} />
                ))}
              </View>
            </View>
            <Stepper label={t('profile.ageFrom')} value={search.ageMin} min={18} max={search.ageMax} onChange={(ageMin) => patch({ ageMin })} />
            <Stepper label={t('profile.ageTo')} value={search.ageMax} min={search.ageMin} max={99} onChange={(ageMax) => patch({ ageMax })} />
            <Stepper
              label={t('profile.distance')}
              value={search.maxDistanceKm}
              min={1}
              max={300}
              step={5}
              suffix={t('profile.distanceSuffix')}
              onChange={(maxDistanceKm) => patch({ maxDistanceKm })}
            />
            <ErrorText>{error}</ErrorText>
            <Button label={saved ? t('profile.saved') : t('common.save')} onPress={saveSearch} loading={busy} disabled={saved || search.interestedIn.length === 0} />
          </View>

          <View style={{ gap: 12 }}>
            <Text style={s.section}>{t('settings.safety')}</Text>
            <Banner
              tone={safetyReady ? 'safe' : 'warn'}
              icon="shieldCheck"
              title={t('profile.safety.title')}
              subtitle={safetyReady ? t('profile.safety.trusted', { name: me.trustedName }) : t('profile.safety.setup')}
              action={t('profile.safety.edit')}
              onPress={() => router.push('/safety-settings')}
            />
            <Banner
              tone={me.twoFactor ? 'safe' : 'neutral'}
              icon="shield"
              title={t('security.title')}
              subtitle={me.twoFactor ? t('security.twoFactor.on') : t('security.bannerOff')}
              action={t('profile.safety.edit')}
              onPress={() => router.push('/security')}
            />
          </View>

          {showPaid(billing) ? (
            <View style={{ gap: 12 }}>
              <Text style={s.section}>{t('settings.plan')}</Text>
              <Banner
                tone={billing.plan === 'free' ? 'neutral' : 'safe'}
                icon="crown"
                title={billing.plan === 'free' ? t('profile.plan.freeTitle') : t('profile.plan.title', { plan: t(`labels.plans.${billing.plan}`) })}
                subtitle={
                  billing.plan === 'free'
                    ? t('profile.plan.freeSubtitle')
                    : billing.planExpiresAt
                      ? t('profile.plan.validUntil', { date: formatDate(billing.planExpiresAt) })
                      : undefined
                }
                action={billing.plan === 'free' ? t('profile.plan.upgrade') : t('profile.plan.manage')}
                onPress={() => router.push('/premium')}
              />
              <Toggle label={t('profile.incognito.label')} hint={t('profile.incognito.hint')} value={billing.incognito} onChange={(incognito) => updateBilling({ incognito })} />
              <View style={{ gap: 10 }}>
                <Label>{t('profile.travel.label')}</Label>
                <View style={s.wrap}>
                  <Chip label={t('profile.travel.home')} selected={!billing.travelCity} onPress={() => updateBilling({ travelCity: null })} />
                  {cityKeys.map((c) => (
                    <Chip key={c} label={t(`labels.cities.${c}`)} selected={billing.travelCity === c} onPress={() => updateBilling({ travelCity: c })} />
                  ))}
                </View>
                <Text style={s.hint}>{t('profile.travel.hint')}</Text>
              </View>
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            <Text style={s.section}>{t('profile.language.title')}</Text>
            <Pressable accessibilityRole="button" onPress={() => setLanguageOpen(true)} style={s.select}>
              <Text style={s.selectText}>{LOCALES.find((l) => l.code === i18n.override)?.name ?? t('profile.language.device')}</Text>
              <Icon name="chevronDown" size={18} color={colors.muted} />
            </Pressable>
            <PickerSheet
              visible={languageOpen}
              title={t('profile.language.title')}
              options={[{ value: 'device', label: t('profile.language.device') }, ...LOCALES.map((l) => ({ value: l.code, label: l.name }))]}
              selected={i18n.override ?? 'device'}
              onSelect={(code) => void i18n.setLocale(code === 'device' ? null : code)}
              onClose={() => setLanguageOpen(false)}
            />
            <Text style={s.hint}>{t('profile.language.rtlHint')}</Text>
          </View>

          <View style={{ gap: 12 }}>
            <Text style={s.section}>{t('settings.account')}</Text>
            <Button
              variant="ghost"
              label={t('profile.signOut')}
              onPress={async () => {
                await signOut();
                router.replace('/welcome');
              }}
            />
            {showDelete ? (
              <View style={{ gap: 10 }}>
                <Field label={t('profile.deletePassword')} value={deletePassword} onChangeText={setDeletePassword} secureTextEntry />
                {me.twoFactor ? (
                  <CodeField label={t('security.twoFactor.codeOrBackup')} value={deleteCode} onChangeText={setDeleteCode} allowRecovery />
                ) : null}
                <Button
                  variant="danger"
                  label={t('profile.deleteForever')}
                  onPress={deleteAccount}
                  disabled={!deletePassword || (me.twoFactor && deleteCode.length < 6)}
                />
              </View>
            ) : (
              <Button variant="danger" label={t('profile.deleteAccount')} height={48} onPress={() => setShowDelete(true)} />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function toSearch(me: Me | null) {
  return {
    interestedIn: me?.interestedIn ?? [],
    ageMin: me?.ageMin ?? 18,
    ageMax: me?.ageMax ?? 99,
    maxDistanceKm: me?.maxDistanceKm ?? 50,
  };
}

const s = StyleSheet.create({
  section: { fontFamily: fonts.display, fontSize: 22, color: colors.text, letterSpacing: -0.4 },
  select: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
