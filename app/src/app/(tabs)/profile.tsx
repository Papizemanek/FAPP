import { GENDERS, MAX_PROFILE_PHOTOS, TAG_GROUP, TRAVEL_CITIES, YES_GROUPS, type TravelCityId, type YesGroup } from '@yesyes/shared';
import { LOCALES } from '@yesyes/shared/i18n';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ConfirmSheet, PickerSheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { Banner, Button, Chip, ErrorText, Field, Label, Screen, Stepper, Title, Toggle } from '@/components/ui';
import { api, errorMessage, imageSource, type Billing, type Gender, type Me, type Tag } from '@/lib/api';
import { openPaywall, setBilling, showPaid, useBilling } from '@/lib/billing';
import { formatDate } from '@/lib/format';
import { i18n, useLocale, useT } from '@/lib/i18n';
import { pickPhotoBase64 } from '@/lib/photos';
import { useSession } from '@/lib/session';
import { colors, fonts } from '@/lib/theme';

const yesGroups = Object.entries(YES_GROUPS) as [YesGroup, (typeof YES_GROUPS)[YesGroup]][];
const genderKeys = Object.keys(GENDERS) as Gender[];
const cityKeys = Object.keys(TRAVEL_CITIES) as TravelCityId[];

export default function ProfileScreen() {
  const t = useT();
  useLocale(); // výběr jazyka v profilu se po změně překreslí
  const { me, setMe, signOut } = useSession();
  const [form, setForm] = useState(() => toForm(me));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  // Ikona filtru na objevování otevírá profil rovnou u nastavení hledání.
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [searchY, setSearchY] = useState<number | null>(null);
  useEffect(() => {
    if (focus === 'search' && searchY != null) scrollRef.current?.scrollTo({ y: Math.max(0, searchY - 12), animated: true });
  }, [focus, searchY]);
  const [saved, setSaved] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [photoToRemove, setPhotoToRemove] = useState<string | null>(null);
  const billing = useBilling();

  // Formulář se přenačte jen při změně účtu – přidání fotky nesmaže rozepsané úpravy.
  useEffect(() => setForm(toForm(me)), [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return <Screen />;

  const patch = (p: Partial<ReturnType<typeof toForm>>) => {
    setForm((f) => ({ ...f, ...p }));
    setSaved(false);
  };
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      setMe(await api<Me>('PUT', '/me', { ...form, gender: me.gender }));
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const addPhoto = async () => {
    try {
      const base64 = await pickPhotoBase64();
      if (base64) setMe(await api<Me>('POST', '/me/photos', { jpegBase64: base64 }));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const removePhoto = async (photoId: string) => {
    try {
      setMe(await api<Me>('DELETE', `/me/photos/${photoId}`));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const deleteAccount = async () => {
    try {
      await api('DELETE', '/me', { password: deletePassword });
      await signOut();
      router.replace('/welcome');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const safetyReady = me.trustedPhone && me.hasCheckinPin && me.hasDuressPin;

  // Inkognito a „Na cestách“ (Plus). Bez předplatného otevře nabídku.
  const updateBilling = async (body: { incognito?: boolean; travelCity?: TravelCityId | null }) => {
    setError('');
    try {
      setBilling(await api<Billing>('PUT', '/billing/settings', body));
    } catch (err) {
      if (!openPaywall(err)) setError(errorMessage(err));
    }
  };

  return (
    <Screen edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={s.top}>
          <Title>{t('profile.title')}</Title>
          <Pressable onPress={save} style={s.done} accessibilityRole="button">
            <Text style={s.doneText}>{busy ? t('profile.saving') : saved ? t('profile.saved') : t('profile.done')}</Text>
          </Pressable>
        </View>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 20 }} keyboardShouldPersistTaps="handled">
          {me.status === 'suspended' ? (
            <Banner tone="alarm" title={t('profile.suspended.title')} subtitle={t('profile.suspended.subtitle')} />
          ) : null}

          <View style={s.photos}>
            {Array.from({ length: MAX_PROFILE_PHOTOS }, (_, i) => {
              const url = me.photos[i];
              return url ? (
                <Pressable key={url} onLongPress={() => setPhotoToRemove(me.photoIds[i])} style={s.photo} accessibilityLabel={t('profile.photoA11y')}>
                  <Image source={imageSource(url)} style={StyleSheet.absoluteFill} contentFit="cover" />
                </Pressable>
              ) : (
                <Pressable key={i} onPress={addPhoto} style={[s.photo, s.photoEmpty]} accessibilityLabel={t('profile.addPhoto')}>
                  <Icon name="plus" color={colors.muted} />
                </Pressable>
              );
            })}
          </View>
          <Text style={s.hint}>{t('profile.photoHint')}</Text>

          <Field label={t('profile.name')} value={form.name} onChangeText={(name) => patch({ name })} />
          <Field label={t('profile.bio')} value={form.bio} onChangeText={(bio) => patch({ bio })} multiline placeholder={t('profile.bioPlaceholder')} />

          <View style={{ gap: 14 }}>
            <View style={{ gap: 6 }}>
              <Text style={s.yesTitle}>
                {t('profile.yes.title')}
                <Text style={{ color: colors.accent }}>*</Text>
              </Text>
              <Text style={s.hint2}>{t('profile.yes.hint')}</Text>
            </View>
            {yesGroups.map(([group, { max, matchOnly, tags }]) => (
              <View key={group} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <Label>{t(`labels.yesGroups.${group}`)}</Label>
                  <Text style={s.hint2}>{matchOnly ? t('profile.yes.matchOnly') : t('profile.yes.upTo', { count: max })}</Text>
                </View>
                <View style={s.wrap}>
                  {(Object.keys(tags) as Tag[]).map((tag) => (
                    <Chip key={tag} label={t(`labels.tags.${tag}`)} selected={form.tags.includes(tag)} onPress={() => patch({ tags: toggleYes(form.tags, tag) })} />
                  ))}
                </View>
              </View>
            ))}
            <Text style={s.hint2}>
              <Text style={{ color: colors.accent }}>*</Text>
              {t('profile.yes.footnote')}
            </Text>
          </View>

          <Banner
            tone={safetyReady ? 'safe' : 'warn'}
            icon="shieldCheck"
            title={t('profile.safety.title')}
            subtitle={safetyReady ? t('profile.safety.trusted', { name: me.trustedName }) : t('profile.safety.setup')}
            action={t('profile.safety.edit')}
            onPress={() => router.push('/safety-settings')}
          />

          {showPaid(billing) ? (
            <View style={{ gap: 12 }}>
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
              <Toggle
                label={t('profile.incognito.label')}
                hint={t('profile.incognito.hint')}
                value={billing.incognito}
                onChange={(incognito) => updateBilling({ incognito })}
              />
              <View style={{ gap: 10 }}>
                <Label>{t('profile.travel.label')}</Label>
                <View style={s.wrap}>
                  <Chip label={t('profile.travel.home')} selected={!billing.travelCity} onPress={() => updateBilling({ travelCity: null })} />
                  {cityKeys.map((c) => (
                    <Chip key={c} label={t(`labels.cities.${c}`)} selected={billing.travelCity === c} onPress={() => updateBilling({ travelCity: c })} />
                  ))}
                </View>
                <Text style={s.hint2}>{t('profile.travel.hint')}</Text>
              </View>
            </View>
          ) : null}

          <View style={{ gap: 10 }} onLayout={(e) => setSearchY(e.nativeEvent.layout.y)}>
            <Label>{t('profile.showMe')}</Label>
            <View style={s.wrap}>
              {genderKeys.map((g) => (
                <Chip key={g} label={t(`labels.gendersPlural.${g}`)} selected={form.interestedIn.includes(g)} onPress={() => patch({ interestedIn: toggle(form.interestedIn, g) })} />
              ))}
            </View>
          </View>
          <Stepper label={t('profile.ageFrom')} value={form.ageMin} min={18} max={form.ageMax} onChange={(ageMin) => patch({ ageMin })} />
          <Stepper label={t('profile.ageTo')} value={form.ageMax} min={form.ageMin} max={99} onChange={(ageMax) => patch({ ageMax })} />
          <Stepper label={t('profile.distance')} value={form.maxDistanceKm} min={1} max={300} step={5} suffix={t('profile.distanceSuffix')} onChange={(maxDistanceKm) => patch({ maxDistanceKm })} />

          <ErrorText>{error}</ErrorText>
          <Button label={t('profile.save')} onPress={save} loading={busy} />

          <View style={{ gap: 10 }}>
            <Label>{t('profile.language.title')}</Label>
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
            <Text style={s.hint2}>{t('profile.language.rtlHint')}</Text>
          </View>

          <Button variant="ghost" label={t('profile.signOut')} onPress={async () => { await signOut(); router.replace('/welcome'); }} />
          {showDelete ? (
            <View style={{ gap: 10 }}>
              <Field label={t('profile.deletePassword')} value={deletePassword} onChangeText={setDeletePassword} secureTextEntry />
              <Button variant="danger" label={t('profile.deleteForever')} onPress={deleteAccount} disabled={!deletePassword} />
            </View>
          ) : (
            <Button variant="danger" label={t('profile.deleteAccount')} height={48} onPress={() => setShowDelete(true)} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <ConfirmSheet
        visible={!!photoToRemove}
        title={t('profile.removePhoto.title')}
        confirmLabel={t('profile.removePhoto.confirm')}
        destructive
        onConfirm={() => photoToRemove && removePhoto(photoToRemove)}
        onClose={() => setPhotoToRemove(null)}
      />
    </Screen>
  );
}

/** Výběr štítku s limitem skupiny: u skupiny s jedním štítkem přepne, u plné skupiny nic nepřidá. */
function toggleYes(list: Tag[], tag: Tag): Tag[] {
  if (list.includes(tag)) return list.filter((x) => x !== tag);
  const group = TAG_GROUP[tag];
  const { max } = YES_GROUPS[group];
  const inGroup = list.filter((x) => TAG_GROUP[x] === group);
  if (max === 1) return [...list.filter((x) => TAG_GROUP[x] !== group), tag];
  return inGroup.length >= max ? list : [...list, tag];
}

function toForm(me: Me | null) {
  return {
    name: me?.name ?? '',
    bio: me?.bio ?? '',
    tags: me?.tags ?? [],
    interestedIn: me?.interestedIn ?? [],
    ageMin: me?.ageMin ?? 18,
    ageMax: me?.ageMax ?? 99,
    maxDistanceKm: me?.maxDistanceKm ?? 50,
  };
}

const s = StyleSheet.create({
  select: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  top: { height: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  done: { height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.accent, justifyContent: 'center' },
  doneText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onAccent },
  photos: { flexDirection: 'row', gap: 10 },
  photo: { flex: 1, height: 150, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface2 },
  photoEmpty: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#5A5160', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: -10 },
  hint2: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  yesTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.text, letterSpacing: -0.5 },
});
