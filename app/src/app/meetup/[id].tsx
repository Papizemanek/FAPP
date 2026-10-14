import { CHECK_IN_GRACE_MINUTES, CHECK_IN_OPTIONS } from '@fapp/shared';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Modal, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';
import { Icon } from '@/components/Icon';
import { PinPad } from '@/components/PinPad';
import { Banner, Body, Button, Chip, ErrorText, Header, Label, Screen } from '@/components/ui';
import { api, errorMessage, type MatchDetail, type SafetySession } from '@/lib/api';
import { cancelCheckInReminder, scheduleCheckInReminder } from '@/lib/notifications';
import { ensureBackgroundPermission, startSafetyTracking, stopSafetyTracking } from '@/lib/safetyTracking';
import { useSession } from '@/lib/session';
import { colors, fonts } from '@/lib/theme';

type PinAction = 'checkin' | 'end' | 'cancelSos' | null;

export default function Meetup() {
  const { id, safetyId } = useLocalSearchParams<{ id: string; safetyId?: string }>();
  const { me, refresh } = useSession();
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [session, setSession] = useState<SafetySession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [minutes, setMinutes] = useState(30);
  const [pinAction, setPinAction] = useState<PinAction>(null);
  const [sosOpen, setSosOpen] = useState(false);
  const [bgGranted, setBgGranted] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [d, active] = await Promise.all([
      Number(id) > 0 ? api<MatchDetail>('GET', `/matches/${id}`).catch(() => null) : Promise.resolve(null),
      api<SafetySession[]>('GET', '/safety/active').catch(() => [] as SafetySession[]),
    ]);
    setDetail(d);
    const mine = active.find((s) => String(s.id) === safetyId || String(s.matchId) === id) ?? null;
    setSession(mine);
    if (mine?.status === 'sos') setSosOpen(true);
    setLoaded(true);
    void refresh();
  }, [id, safetyId, refresh]);

  useFocusEffect(
    useCallback(() => {
      void load();
      Location.getBackgroundPermissionsAsync().then((p) => setBgGranted(p.granted)).catch(() => {});
    }, [load]),
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => setNow(Date.now()), [session]);

  const partnerName = session?.partner.name ?? detail?.partner.name ?? '';
  const trustedName = session?.trustedName ?? me?.trustedName ?? '';
  const ready = !!me?.trustedPhone && !!me?.hasCheckinPin && !!me?.hasDuressPin;
  const agreementOk = detail?.agreement?.status === 'confirmed';

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const granted = await ensureBackgroundPermission();
      setBgGranted(granted);
      const s = await api<SafetySession>('POST', `/matches/${id}/safety`, { checkInMinutes: minutes });
      if (granted) await startSafetyTracking(s.id);
      await scheduleCheckInReminder(s.id, s.nextCheckInDue, !!me?.discreet).catch(() => {});
      setSession(s);
      if (!granted) {
        Alert.alert(
          'Poloha jen s otevřenou aplikací',
          `Bez povolení „Vždy“ uvidí ${trustedName} jen polohu z doby, kdy máš F*app otevřený. Hlídání check-inů funguje i tak.`,
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async (pin: string) => {
    if (!session) return;
    if (pinAction === 'checkin') {
      const s = await api<SafetySession>('POST', `/safety/${session.id}/checkin`, { pin });
      setSession(s);
      await scheduleCheckInReminder(s.id, s.nextCheckInDue, !!me?.discreet).catch(() => {});
    } else if (pinAction === 'cancelSos') {
      setSession(await api<SafetySession>('POST', `/safety/${session.id}/sos/cancel`, { pin }));
      setSosOpen(false);
    } else if (pinAction === 'end') {
      await api<SafetySession>('POST', `/safety/${session.id}/end`, { pin });
      await stopSafetyTracking(session.id);
      await cancelCheckInReminder(session.id);
      setPinAction(null);
      Alert.alert('Schůzka ukončena', `${trustedName} dostal/a zprávu, že jsi v pořádku.`);
      router.back();
      return;
    }
    setPinAction(null);
  };

  const sos = async () => {
    if (!session) return;
    setSosOpen(true);
    try {
      setSession(await api<SafetySession>('POST', `/safety/${session.id}/sos`));
    } catch (err) {
      Alert.alert('Poplach se nepodařilo odeslat', `${errorMessage(err)} Zkus to znovu nebo zavolej ${trustedName}.`);
    }
  };

  const revoke = () => {
    const agreement = detail?.agreement;
    if (!agreement || agreement.status === 'revoked') return;
    Alert.alert('Odvolat souhlas?', `${partnerName} dostane oznámení. Bezpečnostní režim poběží dál, dokud ho neukončíš.`, [
      { text: 'Zpět', style: 'cancel' },
      {
        text: 'Odvolat',
        style: 'destructive',
        onPress: async () => {
          await api('POST', `/agreements/${agreement.id}/revoke`).catch(() => {});
          await load();
        },
      },
    ]);
  };

  if (!loaded) return <Screen />;

  // --- příprava ---
  if (!session) {
    return (
      <Screen>
        <Header title={`Schůzka · ${partnerName}`} />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
          {!agreementOk ? (
            <Banner tone="warn" title="Nejdřív potvrzená dohoda" subtitle="Schůzku jde zahájit, až dohodu potvrdíte oba." action="Dohoda" onPress={() => router.replace(`/agreement/${id}`)} />
          ) : null}
          {!ready ? (
            <Banner
              tone="warn"
              title="Nastav si bezpečnost"
              subtitle="Důvěryhodnou osobu, PIN a nouzový PIN."
              action="Nastavit"
              onPress={() => router.push('/safety-settings')}
            />
          ) : null}
          <View style={{ gap: 12 }}>
            <Point icon="pin" text={`${trustedName || 'Tvoje důvěryhodná osoba'} dostane SMS s odkazem. Uvidí, kde jsi, s kým a jestli jsi v pořádku.`} />
            <Point icon="check" text="V pravidelném intervalu potvrdíš PINem, že jsi OK. Když se neozveš, pošleme upozornění – i kdyby se ti vybil telefon." />
            <Point icon="lock" text="Nouzový PIN vypadá úplně stejně jako běžný, ale potichu spustí poplach." />
            <Point icon="shield" text={`${partnerName} uvidí jen, že máš bezpečnostní režim zapnutý. Nic víc.`} />
          </View>
          <View style={{ gap: 10 }}>
            <Label>Potvrzovat, že jsem OK, každých</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CHECK_IN_OPTIONS.map((m) => (
                <Chip key={m} tone="safe" label={`${m} min`} selected={minutes === m} onPress={() => setMinutes(m)} />
              ))}
            </View>
          </View>
          <ErrorText>{error}</ErrorText>
          <Button variant="safe" label="Zahájit schůzku" onPress={start} loading={busy} disabled={!ready || !agreementOk} />
        </ScrollView>
      </Screen>
    );
  }

  // --- probíhající schůzka ---
  const due = Date.parse(session.nextCheckInDue);
  const left = Math.min(session.checkInMinutes, Math.ceil((due - now) / 60_000));
  const overdue = now > due + CHECK_IN_GRACE_MINUTES * 60_000;

  return (
    <Screen>
      <Header title={`Schůzka · ${partnerName}`} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 14, paddingBottom: 12 }}>
        <View style={s.map}>
          <MapView
            style={StyleSheet.absoluteFill}
            showsUserLocation
            followsUserLocation
            userInterfaceStyle="dark"
            initialRegion={{ latitude: 50.08, longitude: 14.43, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
          />
          <View style={s.mapPill}>
            <View style={s.dot} />
            <Text style={s.mapPillText}>Polohu vidí {trustedName}</Text>
          </View>
        </View>
        {!bgGranted ? (
          <Banner
            tone="warn"
            title="Poloha jen s otevřenou aplikací"
            subtitle="Povol polohu „Vždy“, ať ji vidí i se zhasnutým displejem."
            action="Nastavení"
            onPress={() => Linking.openSettings()}
          />
        ) : null}

        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={s.cardLabel}>{left > 0 ? 'Další check-in za' : 'Check-in'}</Text>
            <Text style={[s.countdown, left <= 0 && { color: overdue ? colors.alarm : colors.warn }]}>{left > 0 ? `${left} min` : 'teď'}</Text>
          </View>
          <Button variant="safe" label="Jsem v pořádku" onPress={() => setPinAction('checkin')} />
          <Text style={s.cardHint}>
            {overdue
              ? `${trustedName} dostal/a upozornění. Potvrď PINem, že jsi v pořádku.`
              : `Když se do ${CHECK_IN_GRACE_MINUTES} minut po termínu neozveš, ${trustedName} dostane upozornění s tvou polohou.`}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="shield" size={18} color={detail?.safety.partner.active ? colors.safe : colors.faint} />
          <Body muted style={{ flex: 1, fontSize: 14 }}>
            {detail?.safety.partner.active
              ? `${partnerName} má taky zapnutý bezpečnostní režim.`
              : `${partnerName} bezpečnostní režim zapnutý nemá.`}
          </Body>
        </View>
        <Button variant="ghost" label="Poslat odkaz znovu" height={44} onPress={() => Share.share({ message: session.shareUrl })} />
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 10 }}>
        <Button variant="sos" label="SOS – podrž" onLongPress={sos} height={64} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="ghost" label="Odvolat souhlas" height={48} style={{ flex: 1 }} onPress={revoke} disabled={!detail?.agreement || detail.agreement.status === 'revoked'} />
          <Button variant="ghost" label="Ukončit schůzku" height={48} style={{ flex: 1 }} onPress={() => setPinAction('end')} />
        </View>
      </View>

      <Modal visible={sosOpen} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={s.sheetBackdrop}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Poplach odeslán</Text>
            <Body>
              {trustedName} dostal/a tvoji přesnou polohu a informaci, s kým jsi. {partnerName} nic neuvidí.
            </Body>
            <Button variant="ghost" label="Byl to omyl – jsem OK" onPress={() => setPinAction('cancelSos')} />
            <Button variant="ghost" label="Skrýt (poplach trvá dál)" height={44} onPress={() => setSosOpen(false)} />
          </View>
        </View>
        <PinPad
          visible={pinAction === 'cancelSos'}
          title="Potvrď PINem"
          subtitle="Že jsi v pořádku."
          onSubmit={submitPin}
          onClose={() => setPinAction(null)}
        />
      </Modal>

      <PinPad
        visible={pinAction === 'checkin' || pinAction === 'end'}
        title="Potvrď PINem"
        subtitle={pinAction === 'end' ? 'Že je schůzka u konce a jsi v pořádku.' : 'Že jsi v pořádku.'}
        onSubmit={submitPin}
        onClose={() => setPinAction(null)}
      />
    </Screen>
  );
}

function Point({ icon, text }: { icon: 'pin' | 'check' | 'lock' | 'shield'; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View style={s.pointIcon}>
        <Icon name={icon} size={18} color={colors.safe} />
      </View>
      <Body style={{ flex: 1, fontSize: 14 }}>{text}</Body>
    </View>
  );
}

const s = StyleSheet.create({
  map: { height: 230, borderRadius: 20, overflow: 'hidden', backgroundColor: '#1E1B22', borderWidth: 1, borderColor: colors.lineSoft },
  mapPill: { position: 'absolute', left: 12, bottom: 12, height: 32, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, backgroundColor: 'rgba(18,16,20,0.85)' },
  mapPillText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.safe },
  card: { gap: 14, padding: 18, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineSoft },
  cardLabel: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  countdown: { fontFamily: fonts.display, fontSize: 34, color: colors.text, letterSpacing: -1 },
  cardHint: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
  pointIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(10,8,12,0.72)', justifyContent: 'flex-end' },
  sheet: { padding: 24, paddingBottom: 40, gap: 14, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.alarmLine },
  sheetTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.alarm },
});
