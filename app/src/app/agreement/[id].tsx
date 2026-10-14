import { ACTIVITIES, CONSENT_TEXT } from '@fapp/shared';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Banner, Body, Button, Checkbox, Chip, ErrorText, Field, Header, Label, Screen, Toggle } from '@/components/ui';
import { api, errorMessage, type Activity, type Agreement, type MatchDetail } from '@/lib/api';

const activityKeys = Object.keys(ACTIVITIES) as Activity[];
const DAYS = 7;
const weekday = (d: Date) => d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

type Form = {
  activities: Activity[];
  condom: boolean;
  sober: boolean;
  dayOffset: number;
  time: string;
  place: string;
  safeword: string;
  note: string;
};

function formFrom(a: Agreement | null): Form {
  if (!a) return { activities: ['kissing'], condom: true, sober: true, dayOffset: 0, time: '21:00', place: '', safeword: '', note: '' };
  const meet = new Date(a.meetAt);
  const dayOffset = Math.max(0, Math.round((startOfDay(meet).getTime() - startOfDay(new Date()).getTime()) / 86400_000));
  const time = `${String(meet.getHours()).padStart(2, '0')}:${String(meet.getMinutes()).padStart(2, '0')}`;
  return { activities: a.activities, condom: a.condom, sober: a.sober, dayOffset, time, place: a.place, safeword: a.safeword, note: a.note };
}

export default function AgreementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [form, setForm] = useState<Form>(formFrom(null));
  const [dirty, setDirty] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<MatchDetail>('GET', `/matches/${id}`);
      setDetail(d);
      const editable = d.agreement && ['pending', 'confirmed'].includes(d.agreement.status);
      setForm(formFrom(editable ? d.agreement : null));
      setDirty(!editable);
      setConsent(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const update = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
    setConsent(false);
  };

  const agreement = detail?.agreement ?? null;
  const partnerName = detail?.partner.name ?? '';
  const editable = !!agreement && ['pending', 'confirmed'].includes(agreement.status);
  const needsConsent = dirty || !editable || (agreement?.status === 'pending' && !agreement.confirmedByMe);

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

  const propose = () =>
    run(async () => {
      if (!meetAt) throw new Error('Čas zadej jako HH:MM, třeba 21:00.');
      await api('POST', `/matches/${id}/agreement`, {
        meetAt: meetAt.toISOString(),
        place: form.place,
        activities: form.activities,
        note: form.note,
        condom: form.condom,
        sober: form.sober,
        safeword: form.safeword,
        consent,
      });
    });

  const confirm = () => run(() => api('POST', `/agreements/${agreement!.id}/confirm`, { version: agreement!.version, consent }));

  const revoke = () =>
    Alert.alert('Odvolat souhlas?', `Schůzka se nekoná. Nemusíš nic vysvětlovat – ${partnerName} dostane jen oznámení.`, [
      { text: 'Zpět', style: 'cancel' },
      { text: 'Odvolat', style: 'destructive', onPress: () => run(() => api('POST', `/agreements/${agreement!.id}/revoke`)) },
    ]);

  const status = (() => {
    if (!agreement || !editable) {
      if (agreement?.status === 'revoked') return <Banner tone="alarm" title="Souhlas byl odvolán" subtitle="Můžeš navrhnout novou dohodu." />;
      return <Banner tone="warn" title="Nová dohoda" subtitle="Platí, až ji potvrdíte oba." />;
    }
    if (agreement.status === 'confirmed' && !dirty) return <Banner tone="safe" icon="shieldCheck" title="Potvrzeno oběma. Platí jen tohle." />;
    if (dirty) return <Banner tone="warn" title="Upravuješ dohodu" subtitle="Změna = oba ji musíte potvrdit znovu." />;
    if (agreement.confirmedByMe) return <Banner tone="warn" title="Potvrdil/a jsi." subtitle={`${partnerName} ještě nepotvrdil/a.`} />;
    return <Banner tone="warn" title={`${partnerName} navrhl/a dohodu`} subtitle="Přečti si ji. Potvrď, nebo navrhni změnu." />;
  })();

  return (
    <Screen>
      <Header title={partnerName ? `Dohoda · ${partnerName}` : 'Dohoda'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 18 }} keyboardShouldPersistTaps="handled">
          {status}

          <View style={{ gap: 10 }}>
            <Label>Co ano – co tu není, to není</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {activityKeys.map((a) => (
                <Chip
                  key={a}
                  tone="safe"
                  label={ACTIVITIES[a]}
                  selected={form.activities.includes(a)}
                  onPress={() => update({ activities: form.activities.includes(a) ? form.activities.filter((x) => x !== a) : [...form.activities, a] })}
                />
              ))}
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Toggle label="Vždy kondom" value={form.condom} onChange={(v) => update({ condom: v })} />
            </View>
            <View style={{ flex: 1 }}>
              <Toggle label="Střízliví" value={form.sober} onChange={(v) => update({ sober: v })} />
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <Label>Kdy</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {Array.from({ length: DAYS }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() + i);
                return <Chip key={i} label={i === 0 ? 'Dnes' : i === 1 ? 'Zítra' : weekday(d)} selected={form.dayOffset === i} onPress={() => update({ dayOffset: i })} />;
              })}
            </ScrollView>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ width: 110 }}>
              <Field label="Čas" value={form.time} onChangeText={(t) => update({ time: t })} keyboardType="numbers-and-punctuation" placeholder="21:00" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Kde" value={form.place} onChangeText={(t) => update({ place: t })} placeholder="Např. u mě, Vinohrady" />
            </View>
          </View>
          <Field label="Stopslovo" value={form.safeword} onChangeText={(t) => update({ safeword: t })} placeholder="Slovo, které všechno zastaví" />
          <Field label="Upřesnění a hranice (nepovinné)" value={form.note} onChangeText={(t) => update({ note: t })} multiline placeholder="Např. žádné focení." />

          {needsConsent ? (
            <Checkbox checked={consent} onToggle={() => setConsent(!consent)}>
              {CONSENT_TEXT}
            </Checkbox>
          ) : null}
          <Body muted style={{ fontSize: 13 }}>
            Dohoda není smlouva. „Ne“ nebo stopslovo má vždy přednost. {partnerName} může během schůzky sdílet tvoje jméno, fotku a místo schůzky se
            svou důvěryhodnou osobou.
          </Body>
          <ErrorText>{error}</ErrorText>

          <View style={{ gap: 10, paddingBottom: 12 }}>
            {dirty || !editable ? (
              <Button
                label={editable ? 'Navrhnout změnu' : 'Navrhnout a potvrdit'}
                onPress={propose}
                loading={busy}
                disabled={!consent || form.activities.length === 0 || !form.place || form.safeword.length < 2 || !meetAt}
              />
            ) : agreement && agreement.status === 'pending' && !agreement.confirmedByMe ? (
              <Button label="Potvrdit dohodu" onPress={confirm} loading={busy} disabled={!consent} />
            ) : agreement?.status === 'confirmed' ? (
              <Button variant="safe" label="Zahájit schůzku" onPress={() => router.push(`/meetup/${id}`)} />
            ) : null}
            {editable && agreement && !dirty ? <Button variant="danger" label="Odvolat souhlas" onPress={revoke} height={48} /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
