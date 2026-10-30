import { MAX_PROFILE_PHOTOS, TAG_GROUP, YES_GROUPS, type YesGroup } from '@yesyes/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ConfirmSheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { Banner, Chip, ErrorText, Field, IconButton, Label, Screen, Title } from '@/components/ui';
import { api, errorMessage, imageSource, type Me, type Tag } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { pickPhotoBase64 } from '@/lib/photos';
import { useSession } from '@/lib/session';
import { colors, fonts } from '@/lib/theme';

const yesGroups = Object.entries(YES_GROUPS) as [YesGroup, (typeof YES_GROUPS)[YesGroup]][];

export default function ProfileScreen() {
  const t = useT();
  const { me, setMe } = useSession();
  const [form, setForm] = useState(() => toForm(me));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  const [photoToRemove, setPhotoToRemove] = useState<string | null>(null);

  // Formulář se přenačte jen při změně účtu – přidání fotky nesmaže rozepsané úpravy.
  useEffect(() => setForm(toForm(me)), [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return <Screen />;

  const patch = (p: Partial<ReturnType<typeof toForm>>) => {
    setForm((f) => ({ ...f, ...p }));
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      setMe(await api<Me>('PUT', '/me', { ...form, gender: me.gender, interestedIn: me.interestedIn, ageMin: me.ageMin, ageMax: me.ageMax, maxDistanceKm: me.maxDistanceKm }));
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

  const safetyReady = me.trustedPhone && me.hasCheckinPin && me.hasDuressPin;

  return (
    <Screen edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={s.top}>
          <Title>{t('profile.title')}</Title>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconButton name="settings" label={t('settings.title')} onPress={() => router.push('/settings')} />
            <Pressable onPress={save} style={[s.done, saved && s.doneSaved]} accessibilityRole="button">
              <Text style={[s.doneText, saved && s.doneTextSaved]}>{busy ? t('profile.saving') : saved ? t('profile.saved') : t('common.save')}</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 20 }} keyboardShouldPersistTaps="handled">
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

          {!safetyReady ? (
            <Banner
              tone="warn"
              icon="shieldCheck"
              title={t('profile.safety.title')}
              subtitle={t('profile.safety.setup')}
              action={t('profile.safety.edit')}
              onPress={() => router.push('/safety-settings')}
            />
          ) : null}
          <ErrorText>{error}</ErrorText>
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
  };
}

const s = StyleSheet.create({
  select: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  top: { height: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  done: { height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.accent, justifyContent: 'center' },
  doneText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onAccent },
  doneSaved: { backgroundColor: colors.surface2 },
  doneTextSaved: { color: colors.muted },
  photos: { flexDirection: 'row', gap: 10 },
  photo: { flex: 1, height: 150, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface2 },
  photoEmpty: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#5A5160', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: -10 },
  hint2: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  yesTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.text, letterSpacing: -0.5 },
});
