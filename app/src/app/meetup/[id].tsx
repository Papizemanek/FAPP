import { CHECK_IN_GRACE_MINUTES, CHECK_IN_OPTIONS } from '@yesyes/shared';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';
import { FAKE_CALL_DELAY_SECONDS, FakeCall } from '@/components/FakeCall';
import { ConfirmSheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { PinPad } from '@/components/PinPad';
import { Banner, Body, Button, Chip, ErrorText, Header, Label, Screen } from '@/components/ui';
import { api, errorMessage, type MatchDetail, type SafetySession } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { showNotice } from '@/lib/notice';
import { useT } from '@/lib/i18n';
import { cancelCheckInReminder, scheduleCheckInReminder, scheduleFakeCallNotification } from '@/lib/notifications';
import { ensureBackgroundPermission, startSafetyTracking, stopSafetyTracking } from '@/lib/safetyTracking';
import { useSession } from '@/lib/session';
import { colors, fonts } from '@/lib/theme';

type PinAction = 'checkin' | 'end' | 'cancelSos' | null;

const EARLY_START_MS = 60 * 60_000;

export default function Meetup() {
  usePreventScreenCapture();
  const t = useT();
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
  const [confirmEarly, setConfirmEarly] = useState(false);
  const [fakeCallAt, setFakeCallAt] = useState<number | null>(null);
  const [fakeCallOpen, setFakeCallOpen] = useState(false);

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
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => setNow(Date.now()), [session]);

  // Falešný hovor: za chvíli „zazvoní“ telefon. Když je aplikace na pozadí, přijde notifikace.
  useEffect(() => {
    if (fakeCallAt === null) return;
    const timer = setTimeout(() => {
      setFakeCallAt(null);
      setFakeCallOpen(true);
    }, Math.max(0, fakeCallAt - Date.now()));
    return () => clearTimeout(timer);
  }, [fakeCallAt]);

  const scheduleFakeCall = () => {
    setFakeCallAt(Date.now() + FAKE_CALL_DELAY_SECONDS * 1000);
    void scheduleFakeCallNotification(FAKE_CALL_DELAY_SECONDS, fakeCaller).catch(() => {});
  };

  const partnerName = session?.partner.name ?? detail?.partner.name ?? '';
  const trustedName = session?.trustedName ?? me?.trustedName ?? '';
  const fakeCaller = trustedName || t('meetup.fakeCallerDefault');
  const ready = !!me?.trustedPhone && !!me?.hasCheckinPin && !!me?.hasDuressPin;
  const agreementOk = detail?.agreement?.status === 'confirmed';
  const meetAt = detail?.agreement?.meetAt ?? null;
  const meetWhen = meetAt ? formatDate(meetAt, { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  // Víc než hodinu před schůzkou se zeptáme – jinak by check-in a SMS důvěryhodné osobě běžely zbytečně brzy.
  const tooEarly = meetAt != null && Date.parse(meetAt) - Date.now() > EARLY_START_MS;

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
      showNotice(t('meetup.endedTitle'), t('meetup.endedMessage', { name: trustedName }));
      router.back();
      return;
    }
    setPinAction(null);
  };

  const sos = async () => {
    if (!session) return;
    setSosOpen(true);
    setError('');
    try {
      setSession(await api<SafetySession>('POST', `/safety/${session.id}/sos`));
    } catch (err) {
      setSosOpen(false);
      setError(t('meetup.sosFailed', { error: errorMessage(err), name: trustedName }));
    }
  };

  if (!loaded) return <Screen />;

  // --- příprava ---
  if (!session) {
    return (
      <Screen>
        <Header title={t('meetup.title', { name: partnerName })} />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
          {!agreementOk ? (
            <Banner
              tone="warn"
              title={t('meetup.needAgreementTitle')}
              subtitle={t('meetup.needAgreementSubtitle')}
              action={t('meetup.needAgreementAction')}
              onPress={() => router.replace(`/agreement/${id}`)}
            />
          ) : null}
          {!ready ? (
            <Banner
              tone="warn"
              title={t('meetup.setupTitle')}
              subtitle={t('meetup.setupSubtitle')}
              action={t('meetup.setupAction')}
              onPress={() => router.push('/safety-settings')}
            />
          ) : null}
          <View style={{ gap: 12 }}>
            <Point icon="pin" text={trustedName ? t('meetup.pointTrusted', { name: trustedName }) : t('meetup.pointTrustedNoName')} />
            <Point icon="check" text={t('meetup.pointCheckIn')} />
            <Point icon="lock" text={t('meetup.pointDuress')} />
            <Point icon="shield" text={t('meetup.pointPartner', { name: partnerName })} />
            <Point icon="user" text={t('consent.deterrence')} />
          </View>
          <View style={{ gap: 10 }}>
            <Label>{t('meetup.intervalLabel')}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CHECK_IN_OPTIONS.map((m) => (
                <Chip key={m} tone="safe" label={t('meetup.minutes', { count: m })} selected={minutes === m} onPress={() => setMinutes(m)} />
              ))}
            </View>
          </View>
          {meetWhen ? <Body muted>{t('meetup.meetingAt', { when: meetWhen, place: detail?.agreement?.place ?? '' })}</Body> : null}
          <ErrorText>{error}</ErrorText>
          <Button
            variant="safe"
            label={t('meetup.start')}
            onPress={() => (tooEarly ? setConfirmEarly(true) : start())}
            loading={busy}
            disabled={!ready || !agreementOk}
          />
        </ScrollView>
        <ConfirmSheet
          visible={confirmEarly}
          title={t('meetup.earlyTitle')}
          message={t('meetup.earlyMessage', { when: meetWhen, name: trustedName || t('meetup.fakeCallerDefault') })}
          confirmLabel={t('meetup.earlyConfirm')}
          onConfirm={start}
          onClose={() => setConfirmEarly(false)}
        />
      </Screen>
    );
  }

  // --- probíhající schůzka ---
  const due = Date.parse(session.nextCheckInDue);
  const left = Math.min(session.checkInMinutes, Math.ceil((due - now) / 60_000));
  const overdue = now > due + CHECK_IN_GRACE_MINUTES * 60_000;

  return (
    <Screen>
      <Header
        title={t('meetup.title', { name: partnerName })}
        // Domluvu (i její zrušení) má schůzka v hlavičce – dole jsou jen SOS a konec, ať se ve stresu nic nesplete.
        right={
          <Pressable accessibilityRole="link" onPress={() => router.push(`/agreement/${id}`)} style={s.headerLink}>
            <Text style={s.headerLinkText}>{t('meetup.agreementLink')}</Text>
          </Pressable>
        }
      />
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
            <Text style={s.mapPillText}>{t('meetup.locationVisibleTo', { name: trustedName })}</Text>
          </View>
        </View>
        {!bgGranted ? (
          <Banner
            tone="warn"
            title={t('meetup.bgLocationTitle')}
            subtitle={t('meetup.bgLocationSubtitle')}
            action={t('meetup.bgLocationAction')}
            onPress={() => Linking.openSettings()}
          />
        ) : null}

        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={s.cardLabel}>{left > 0 ? t('meetup.nextCheckIn') : t('meetup.checkIn')}</Text>
            <Text style={[s.countdown, left <= 0 && { color: overdue ? colors.alarm : colors.warn }]}>{left > 0 ? t('meetup.minutes', { count: left }) : t('meetup.now')}</Text>
          </View>
          <Button variant="safe" label={t('meetup.imOk')} onPress={() => setPinAction('checkin')} />
          <Text style={s.cardHint}>
            {overdue
              ? t('meetup.overdueHint', { name: trustedName })
              : t('meetup.graceHint', { count: CHECK_IN_GRACE_MINUTES, name: trustedName })}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="shield" size={18} color={detail?.safety.partner.active ? colors.safe : colors.faint} />
          <Body muted style={{ flex: 1, fontSize: 14 }}>
            {detail?.safety.partner.active
              ? t('meetup.partnerSafetyOn', { name: partnerName })
              : t('meetup.partnerSafetyOff', { name: partnerName })}
          </Body>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            variant="ghost"
            label={fakeCallAt ? t('meetup.fakeCallIn', { count: Math.max(1, Math.ceil((fakeCallAt - now) / 1000)) }) : t('meetup.fakeCall')}
            height={44}
            style={{ flex: 1 }}
            onPress={fakeCallAt ? () => setFakeCallAt(null) : scheduleFakeCall}
          />
          <Button variant="ghost" label={t('meetup.shareLink')} height={44} style={{ flex: 1 }} onPress={() => Share.share({ message: session.shareUrl }).catch(() => {})} />
        </View>
        <Body muted style={{ fontSize: 13 }}>{t('meetup.fakeCallHint', { count: FAKE_CALL_DELAY_SECONDS })}</Body>
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 10 }}>
        <ErrorText>{error}</ErrorText>
        <Button variant="sos" label={t('meetup.sos')} onLongPress={sos} height={64} />
        <Button variant="ghost" label={t('meetup.end')} height={48} onPress={() => setPinAction('end')} />
      </View>

      <Modal visible={sosOpen} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={s.sheetBackdrop}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{t('meetup.sosSentTitle')}</Text>
            <Body>{t('meetup.sosSentBody', { trusted: trustedName, partner: partnerName })}</Body>
            <Button variant="ghost" label={t('meetup.sosMistake')} onPress={() => setPinAction('cancelSos')} />
            <Button variant="ghost" label={t('meetup.sosHide')} height={44} onPress={() => setSosOpen(false)} />
          </View>
        </View>
        <PinPad
          visible={pinAction === 'cancelSos'}
          title={t('meetup.pinTitle')}
          subtitle={t('meetup.pinSubtitleOk')}
          onSubmit={submitPin}
          onClose={() => setPinAction(null)}
        />
      </Modal>


      <FakeCall visible={fakeCallOpen} caller={fakeCaller} onClose={() => setFakeCallOpen(false)} />

      <PinPad
        visible={pinAction === 'checkin' || pinAction === 'end'}
        title={t('meetup.pinTitle')}
        subtitle={pinAction === 'end' ? t('meetup.pinSubtitleEnd') : t('meetup.pinSubtitleOk')}
        onSubmit={submitPin}
        onClose={() => setPinAction(null)}
      />
    </Screen>
  );
}

function Point({ icon, text }: { icon: 'pin' | 'check' | 'lock' | 'shield' | 'user'; text: string }) {
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
  headerLink: { height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  headerLinkText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
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
