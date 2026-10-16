import { GENDERS, MAX_PROFILE_PHOTOS, PLANS, TAGS, TRAVEL_CITIES, type TravelCityId } from '@fapp/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ConfirmSheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { Banner, Button, Chip, ErrorText, Field, Label, Screen, Stepper, Title, Toggle } from '@/components/ui';
import { api, errorMessage, imageSource, type Billing, type Gender, type Me, type Tag } from '@/lib/api';
import { openPaywall, setBilling, showPaid, useBilling } from '@/lib/billing';
import { pickPhotoBase64 } from '@/lib/photos';
import { useSession } from '@/lib/session';
import { colors, fonts } from '@/lib/theme';

const tagKeys = Object.keys(TAGS) as Tag[];
const genderKeys = Object.keys(GENDERS) as Gender[];
const plural: Record<Gender, string> = { man: 'Muže', woman: 'Ženy', nonbinary: 'Nebinární' };
const cityKeys = Object.keys(TRAVEL_CITIES) as TravelCityId[];
const day = (iso: string) => new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });

export default function ProfileScreen() {
  const { me, setMe, signOut } = useSession();
  const [form, setForm] = useState(() => toForm(me));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
          <Title>Profil</Title>
          <Pressable onPress={save} style={s.done} accessibilityRole="button">
            <Text style={s.doneText}>{busy ? 'Ukládám…' : saved ? 'Uloženo' : 'Hotovo'}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 20 }} keyboardShouldPersistTaps="handled">
          {me.status === 'suspended' ? (
            <Banner tone="alarm" title="Účet je pozastavený" subtitle="Prověřujeme nahlášení. Bezpečnostní režim ti funguje dál." />
          ) : null}

          <View style={s.photos}>
            {Array.from({ length: MAX_PROFILE_PHOTOS }, (_, i) => {
              const url = me.photos[i];
              return url ? (
                <Pressable key={url} onLongPress={() => setPhotoToRemove(me.photoIds[i])} style={s.photo} accessibilityLabel="Fotka – podrž pro smazání">
                  <Image source={imageSource(url)} style={StyleSheet.absoluteFill} contentFit="cover" />
                </Pressable>
              ) : (
                <Pressable key={i} onPress={addPhoto} style={[s.photo, s.photoEmpty]} accessibilityLabel="Přidat fotku">
                  <Icon name="plus" color={colors.muted} />
                </Pressable>
              );
            })}
          </View>
          <Text style={s.hint}>Bez nahoty – fotky musí projít pravidly obchodů s aplikacemi. Podrž fotku pro smazání.</Text>

          <Field label="Jméno" value={form.name} onChangeText={(name) => patch({ name })} />
          <Field label="O mně" value={form.bio} onChangeText={(bio) => patch({ bio })} multiline placeholder="Pár vět o sobě." />

          <View style={{ gap: 10 }}>
            <Label>Co hledám</Label>
            <View style={s.wrap}>
              {tagKeys.map((t) => (
                <Chip key={t} label={TAGS[t]} selected={form.tags.includes(t)} onPress={() => patch({ tags: toggle(form.tags, t) })} />
              ))}
            </View>
          </View>

          <Banner
            tone={safetyReady ? 'safe' : 'warn'}
            icon="shieldCheck"
            title="Bezpečnost a soukromí"
            subtitle={safetyReady ? `Důvěryhodná osoba: ${me.trustedName}` : 'Nastav důvěryhodnou osobu a PIN.'}
            action="Upravit"
            onPress={() => router.push('/safety-settings')}
          />

          {showPaid(billing) ? (
            <View style={{ gap: 12 }}>
              <Banner
                tone={billing.plan === 'free' ? 'neutral' : 'safe'}
                icon="crown"
                title={billing.plan === 'free' ? 'F*app Plus, Gold a Platinum' : `F*app ${PLANS[billing.plan].name}`}
                subtitle={
                  billing.plan === 'free'
                    ? 'Neomezené lajky, kdo tě lajkl, boost a další.'
                    : billing.planExpiresAt
                      ? `Platí do ${day(billing.planExpiresAt)}.`
                      : undefined
                }
                action={billing.plan === 'free' ? 'Vylepšit' : 'Spravovat'}
                onPress={() => router.push('/premium')}
              />
              <Toggle
                label="Inkognito"
                hint="Uvidí tě jen ti, koho lajkneš. (Plus)"
                value={billing.incognito}
                onChange={(incognito) => updateBilling({ incognito })}
              />
              <View style={{ gap: 10 }}>
                <Label>Na cestách (Plus)</Label>
                <View style={s.wrap}>
                  <Chip label="Doma" selected={!billing.travelCity} onPress={() => updateBilling({ travelCity: null })} />
                  {cityKeys.map((c) => (
                    <Chip key={c} label={TRAVEL_CITIES[c].name} selected={billing.travelCity === c} onPress={() => updateBilling({ travelCity: c })} />
                  ))}
                </View>
                <Text style={s.hint2}>Swipuješ v jiném městě ještě před cestou a lidé tam tě uvidí se štítkem „Na cestách“.</Text>
              </View>
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            <Label>Koho mi ukazovat</Label>
            <View style={s.wrap}>
              {genderKeys.map((g) => (
                <Chip key={g} label={plural[g]} selected={form.interestedIn.includes(g)} onPress={() => patch({ interestedIn: toggle(form.interestedIn, g) })} />
              ))}
            </View>
          </View>
          <Stepper label="Věk od" value={form.ageMin} min={18} max={form.ageMax} onChange={(ageMin) => patch({ ageMin })} />
          <Stepper label="Věk do" value={form.ageMax} min={form.ageMin} max={99} onChange={(ageMax) => patch({ ageMax })} />
          <Stepper label="Vzdálenost" value={form.maxDistanceKm} min={1} max={300} step={5} suffix=" km" onChange={(maxDistanceKm) => patch({ maxDistanceKm })} />

          <ErrorText>{error}</ErrorText>
          <Button label="Uložit profil" onPress={save} loading={busy} />
          <Button variant="ghost" label="Odhlásit se" onPress={async () => { await signOut(); router.replace('/welcome'); }} />
          {showDelete ? (
            <View style={{ gap: 10 }}>
              <Field label="Heslo pro smazání účtu" value={deletePassword} onChangeText={setDeletePassword} secureTextEntry />
              <Button variant="danger" label="Smazat účet natrvalo" onPress={deleteAccount} disabled={!deletePassword} />
            </View>
          ) : (
            <Button variant="danger" label="Smazat účet" height={48} onPress={() => setShowDelete(true)} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <ConfirmSheet
        visible={!!photoToRemove}
        title="Smazat fotku?"
        confirmLabel="Smazat"
        destructive
        onConfirm={() => photoToRemove && removePhoto(photoToRemove)}
        onClose={() => setPhotoToRemove(null)}
      />
    </Screen>
  );
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
  top: { height: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  done: { height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.accent, justifyContent: 'center' },
  doneText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onAccent },
  photos: { flexDirection: 'row', gap: 10 },
  photo: { flex: 1, height: 150, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface2 },
  photoEmpty: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#5A5160', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: -10 },
  hint2: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
