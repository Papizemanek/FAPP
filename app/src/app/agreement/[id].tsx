import { ACTIVITIES, DETERRENCE_TEXT, INTENT_TEXT, NOTICE_TEXT, REVOKE_COOLDOWN_DAYS, WISHES } from '@fapp/shared';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ConfirmSheet } from '@/components/Sheet';
import { Banner, Body, Button, Checkbox, Chip, ErrorText, Field, Header, Label, Screen, Toggle } from '@/components/ui';
import { api, errorMessage, type Activity, type Agreement, type MatchDetail, type Wish } from '@/lib/api';
import { colors, fonts } from '@/lib/theme';

const activityKeys = Object.keys(ACTIVITIES) as Activity[];
const wishKeys = Object.keys(WISHES) as Wish[];
const DAYS = 7;
const weekday = (d: Date) => d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

type Form = {
  wishes: Record<Activity, Wish>;
  note: string;
  dayOffset: number;
  time: string;
  place: string;
  safeword: string;
  condom: boolean;
  sober: boolean;
  publicFirst: boolean;
};

const noWishes = () => Object.fromEntries(activityKeys.map((k) => [k, 'no'])) as Record<Activity, Wish>;

function formFrom(a: Agreement | null): Form {
  const base: Form = { wishes: noWishes(), note: '', dayOffset: 0, time: '21:00', place: '', safeword: '', condom: true, sober: true, publicFirst: false };
  if (!a) return base;
  const meet = new Date(a.meetAt);
  return {
    wishes: { ...base.wishes, ...(a.myWishes ?? {}) },
    note: a.myNote,
    dayOffset: Math.max(0, Math.round((startOfDay(meet).getTime() - startOfDay(new Date()).getTime()) / 86400_000)),
    time: `${String(meet.getHours()).padStart(2, '0')}:${String(meet.getMinutes()).padStart(2, '0')}`,
    place: a.place,
    safeword: a.safeword,
    condom: a.condom,
    sober: a.sober,
    publicFirst: a.publicFirst,
  };
}

/**
 * Domluva: každý si naslepo vyplní, na co má chuť (ano / možná / ne). Druhý uvidí jen shodu,
 * nikdy cizí „ne“. Potvrzuje se představa a poučení, že domluva není souhlas – souhlas platí jen na místě.
 */
export default function AgreementScreen() {
  usePreventScreenCapture();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [form, setForm] = useState<Form>(formFrom(null));
  const [dirty, setDirty] = useState(false);
  const [logisticsDirty, setLogisticsDirty] = useState(false);
  const [intent, setIntent] = useState(false);
  const [notice, setNotice] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<MatchDetail>('GET', `/matches/${id}`);
      setDetail(d);
      const editable = d.agreement && ['pending', 'confirmed'].includes(d.agreement.status);
      setForm(formFrom(editable ? d.agreement : null));
      setDirty(false);
      setLogisticsDirty(false);
      setIntent(false);
      setNotice(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const agreement = detail?.agreement ?? null;
  const partnerName = detail?.partner.name ?? '';
  const editable = !!agreement && ['pending', 'confirmed'].includes(agreement.status);

  const update = (patch: Partial<Form>, logistics = false) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
    if (logistics && editable) setLogisticsDirty(true);
    setIntent(false);
    setNotice(false);
  };
  const setWish = (key: Activity, wish: Wish) => update({ wishes: { ...form.wishes, [key]: wish } });

  // Po zrušení domluvy druhým může novou otevřít jen on/ona (ochrana před nátlakem).
  const blockedByCooldown =
    agreement?.status === 'revoked' &&
    agreement.revokedByMe === false &&
    !!agreement.revokedAt &&
    Date.now() < Date.parse(agreement.revokedAt) + REVOKE_COOLDOWN_DAYS * 86400_000;

  const needsSave = !editable || dirty || !agreement?.confirmedByMe;

  const meetAt = useMemo(() => {
    const m = form.time.match(/^(\d{1,2})[:.](\d{2})$/);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
    const d = startOfDay(new Date());
    d.setDate(d.getDate() + form.dayOffset);
    d.setHours(Number(m[1]), Number(m[2]));
    return d;
  }, [form.dayOffset, form.time]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      if (!meetAt) throw new Error('Čas zadej jako HH:MM, třeba 21:00.');
      // Neměněný čas pošleme přesně tak, jak ho uložil server – jinak by vypadal jako změna.
      const sameTime = editable && agreement && !logisticsDirty;
      await api('POST', `/matches/${id}/agreement`, {
        meetAt: sameTime ? agreement.meetAt : meetAt.toISOString(),
        place: form.place,
        safeword: form.safeword,
        condom: form.condom,
        sober: form.sober,
        publicFirst: form.publicFirst,
        wishes: form.wishes,
        note: form.note,
        intent,
        notice,
        ...(editable && agreement ? { baseVersion: agreement.version } : {}),
      });
    });

  const revoke = () => run(() => api('POST', `/agreements/${agreement!.id}/revoke`));

  const status = (() => {
    if (agreement?.status === 'revoked') {
      return blockedByCooldown ? (
        <Banner tone="alarm" title={`${partnerName} domluvu zrušil/a`} subtitle={`Novou domluvu teď může otevřít jen ${partnerName}.`} />
      ) : (
        <Banner tone="alarm" title="Domluva byla zrušena" subtitle="Můžeš otevřít novou." />
      );
    }
    if (!editable) return <Banner tone="warn" title="Nová domluva" subtitle="Každý vyplní svou část zvlášť. Uvidíte jen, na čem se shodnete." />;
    if (logisticsDirty) return <Banner tone="warn" title="Měníš čas, místo nebo pravidla" subtitle={`${partnerName} je bude muset potvrdit znovu.`} />;
    if (agreement?.status === 'confirmed' && !dirty) {
      return <Banner tone="safe" icon="shieldCheck" title="Domluvu jste vyplnili oba" subtitle="Na místě se můžete kdykoli rozhodnout jinak." />;
    }
    if (agreement?.confirmedByMe) return <Banner tone="warn" title="Tvoje část je hotová" subtitle={`${partnerName} ještě nevyplnil/a nebo nepotvrdil/a.`} />;
    if (agreement?.partnerFilled) return <Banner tone="warn" title={`${partnerName} svou část vyplnil/a`} subtitle="Vyplň tu svoji – uvidíte jen shodu." />;
    return <Banner tone="warn" title="Vyplň svou část" subtitle="Uvidíte jen, na čem se shodnete." />;
  })();

  if (blockedByCooldown) {
    return (
      <Screen>
        <Header title={partnerName ? `Domluva · ${partnerName}` : 'Domluva'} />
        <View style={{ padding: 20, gap: 18 }}>{status}</View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title={partnerName ? `Domluva · ${partnerName}` : 'Domluva'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 20 }} keyboardShouldPersistTaps="handled">
          {status}

          {editable && agreement?.overlap ? (
            <View style={s.card}>
              <Text style={s.cardTitle}>Na čem se shodnete</Text>
              {agreement.overlap.yes.length + agreement.overlap.maybe.length === 0 ? (
                <Body muted style={{ fontSize: 14 }}>Zatím žádná shoda.</Body>
              ) : null}
              {agreement.overlap.yes.length ? (
                <View style={{ gap: 8 }}>
                  <Label>Chcete oba</Label>
                  <View style={s.wrap}>
                    {agreement.overlap.yes.map((a) => (
                      <Text key={a} style={[s.pill, s.pillYes]}>
                        {ACTIVITIES[a]}
                      </Text>
                    ))}
                  </View>
                </View>
              ) : null}
              {agreement.overlap.maybe.length ? (
                <View style={{ gap: 8 }}>
                  <Label>Možná – domluvíte se na místě</Label>
                  <View style={s.wrap}>
                    {agreement.overlap.maybe.map((a) => (
                      <Text key={a} style={s.pill}>
                        {ACTIVITIES[a]}
                      </Text>
                    ))}
                  </View>
                </View>
              ) : null}
              {agreement.partnerNote ? <Body style={{ fontSize: 14 }}>{`${partnerName}: „${agreement.partnerNote}“`}</Body> : null}
              <Text style={s.hint}>Co jeden z vás nechce, neuvidí nikdo – ani to, kdo to nechtěl.</Text>
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            <Label>Na co mám chuť</Label>
            <Text style={s.hint}>{partnerName ? `${partnerName} uvidí jen shodu. Tvoje „ne“ neuvidí nikdo.` : 'Druhý uvidí jen shodu.'}</Text>
            {activityKeys.map((a) => (
              <View key={a} style={s.wishRow}>
                <Text style={s.wishLabel}>{ACTIVITIES[a]}</Text>
                <View style={s.segment} accessibilityRole="radiogroup" accessibilityLabel={ACTIVITIES[a]}>
                  {wishKeys.map((w) => {
                    const on = form.wishes[a] === w;
                    return (
                      <Pressable
                        key={w}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`${ACTIVITIES[a]}: ${WISHES[w]}`}
                        onPress={() => setWish(a, w)}
                        style={[s.segmentItem, on && (w === 'yes' ? s.segYes : w === 'maybe' ? s.segMaybe : s.segNo)]}
                      >
                        <Text style={[s.segmentText, on && { color: w === 'no' ? colors.text : colors.onAccent }]}>{WISHES[w]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
          <Field
            label="Moje hranice (uvidí je i druhý)"
            value={form.note}
            onChangeText={(note) => update({ note })}
            multiline
            placeholder="Např. žádné focení, nejdřív se chci poznat."
          />

          <View style={{ gap: 12 }}>
            <Label>Praktické věci – platí pro oba</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {Array.from({ length: DAYS }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() + i);
                return (
                  <Chip key={i} label={i === 0 ? 'Dnes' : i === 1 ? 'Zítra' : weekday(d)} selected={form.dayOffset === i} onPress={() => update({ dayOffset: i }, true)} />
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ width: 110 }}>
                <Field label="Čas" value={form.time} onChangeText={(time) => update({ time }, true)} keyboardType="numbers-and-punctuation" placeholder="21:00" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Kde" value={form.place} onChangeText={(place) => update({ place }, true)} placeholder="Např. u mě, Vinohrady" />
              </View>
            </View>
            <Field label="Stopslovo" value={form.safeword} onChangeText={(safeword) => update({ safeword }, true)} placeholder="Slovo, které všechno zastaví" />
            <Toggle label="Vždy kondom" value={form.condom} onChange={(condom) => update({ condom }, true)} />
            <Toggle label="Střízliví" hint="Opilost není souhlas." value={form.sober} onChange={(sober) => update({ sober }, true)} />
            <Toggle
              label="Nejdřív se potkáme na veřejném místě"
              hint="Kavárna nebo bar – jestli pokračovat, rozhodnete osobně."
              value={form.publicFirst}
              onChange={(publicFirst) => update({ publicFirst }, true)}
            />
          </View>

          {needsSave ? (
            <View style={{ gap: 10 }}>
              <Checkbox checked={intent} onToggle={() => setIntent(!intent)}>
                {INTENT_TEXT}
              </Checkbox>
              <Checkbox checked={notice} onToggle={() => setNotice(!notice)}>
                {NOTICE_TEXT}
              </Checkbox>
            </View>
          ) : null}
          <Body muted style={{ fontSize: 13 }}>
            {DETERRENCE_TEXT} {partnerName} může během schůzky sdílet tvoje jméno, fotku a místo schůzky se svou důvěryhodnou osobou.
          </Body>
          <ErrorText>{error}</ErrorText>

          <View style={{ gap: 10, paddingBottom: 12 }}>
            {needsSave ? (
              <Button
                label="Uložit a potvrdit"
                onPress={save}
                loading={busy}
                disabled={!intent || !notice || !form.place || form.safeword.length < 2 || !meetAt}
              />
            ) : agreement?.status === 'confirmed' ? (
              <Button variant="safe" label="Zahájit schůzku" onPress={() => router.push(`/meetup/${id}`)} />
            ) : null}
            {editable && !dirty ? <Button variant="danger" label="Zrušit domluvu" onPress={() => setConfirmRevoke(true)} height={48} /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ConfirmSheet
        visible={confirmRevoke}
        title="Zrušit domluvu?"
        message={`Schůzka se nekoná. Nemusíš nic vysvětlovat – ${partnerName} dostane jen oznámení.`}
        confirmLabel="Zrušit domluvu"
        destructive
        onConfirm={revoke}
        onClose={() => setConfirmRevoke(false)}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { gap: 12, padding: 16, borderRadius: 18, backgroundColor: colors.safeBg, borderWidth: 1, borderColor: colors.safeLine },
  cardTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  pillYes: { borderColor: colors.safe, backgroundColor: colors.bg },
  hint: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
  wishRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  wishLabel: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  segment: { flexDirection: 'row', borderRadius: 999, borderWidth: 1, borderColor: colors.line, padding: 3, gap: 2 },
  segmentItem: { minWidth: 58, height: 36, paddingHorizontal: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  segYes: { backgroundColor: colors.safe },
  segMaybe: { backgroundColor: colors.warn },
  segNo: { backgroundColor: colors.surface2 },
});
