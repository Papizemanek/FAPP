import { FEEDBACK_REASONS } from '@yesyes/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Checkbox, Chip, ErrorText, Field, Header, Screen, Title } from '@/components/ui';
import { api, errorMessage, type FeedbackReason } from '@/lib/api';
import { useLocale, useT } from '@/lib/i18n';
import { colors, fonts } from '@/lib/theme';

const reasons = Object.keys(FEEDBACK_REASONS) as FeedbackReason[];

// Kontakty ověřit před spuštěním (README).
const HELP: { id: 'whiteCircle' | 'police' | 'persefona'; phone?: string; url?: string; label: string }[] = [
  { id: 'whiteCircle', phone: '116006', label: '116 006' },
  { id: 'police', phone: '158', label: '158' },
  { id: 'persefona', url: 'https://www.persefona.cz', label: 'persefona.cz' },
];

export default function Feedback() {
  const t = useT();
  const locale = useLocale();
  const { id, name, gender } = useLocalSearchParams<{ id: string; name?: string; gender?: string }>();
  const [bad, setBad] = useState(false);
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [details, setDetails] = useState('');
  const [preserve, setPreserve] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const send = async (ok: boolean) => {
    setBusy(true);
    setError('');
    try {
      await api('POST', `/feedback/${id}`, ok ? { ok: true } : { ok: false, reason, details, preserve });
      if (!ok && (reason === 'consent' || reason === 'safety')) setShowHelp(true);
      else router.back();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (showHelp) {
    return (
      <Screen>
        <Header />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <Title style={{ fontSize: 30 }}>{t('feedback.helpTitle')}</Title>
          <Body muted>{t('feedback.helpIntro')}</Body>
          {locale === 'cs' ? (
            HELP.map((h) => (
              <Pressable
                key={h.id}
                accessibilityRole="link"
                onPress={() => Linking.openURL(h.phone ? `tel:${h.phone}` : h.url!).catch(() => {})}
                style={s.card}
              >
                <Text style={s.cardTitle}>{t(`feedback.helpCz.${h.id}.name`)}</Text>
                <Text style={s.cardDetail}>{t(`feedback.helpCz.${h.id}.detail`)}</Text>
                <Text selectable style={s.cardContact}>
                  {h.label}
                </Text>
              </Pressable>
            ))
          ) : (
            <View style={s.card}>
              <Text style={s.cardTitle}>{t('feedback.helpLocal.name')}</Text>
              <Text style={s.cardDetail}>{t('feedback.helpLocal.detail')}</Text>
            </View>
          )}
          <Body muted style={{ fontSize: 14 }}>
            {t('feedback.medical')}
          </Body>
          {preserve ? (
            <Body muted style={{ fontSize: 14 }}>
              {t('feedback.preserved')}
            </Body>
          ) : null}
          <Button label={t('feedback.backToApp')} onPress={() => router.replace('/')} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
        <Title style={{ fontSize: 30 }}>{t('feedback.title')}</Title>
        <Body muted>{name ? t('feedback.privacy', { name }) : t('feedback.privacyNoName')}</Body>
        {!bad ? (
          <View style={{ gap: 12 }}>
            <Button variant="safe" label={t('feedback.allGood')} onPress={() => send(true)} loading={busy} />
            <Button variant="ghost" label={t('feedback.somethingWrong')} onPress={() => setBad(true)} />
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {reasons.map((r) => (
                <Chip key={r} label={t(`labels.feedbackReasons.${r}`, r === 'safety' ? undefined : { gender })} selected={reason === r} onPress={() => setReason(r)} />
              ))}
            </View>
            <Field label={t('feedback.detailsLabel')} value={details} onChangeText={setDetails} multiline />
            <Checkbox checked={preserve} onToggle={() => setPreserve(!preserve)}>
              {t('feedback.preserve')}
            </Checkbox>
            <Body muted style={{ fontSize: 13 }}>
              {t('feedback.suspendNotice')}
            </Body>
            <Button label={t('feedback.send')} onPress={() => send(false)} loading={busy} disabled={!reason} />
          </View>
        )}
        <ErrorText>{error}</ErrorText>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { gap: 4, padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineSoft },
  cardTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  cardDetail: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  cardContact: { fontFamily: fonts.display, fontSize: 22, color: colors.safe, marginTop: 4 },
});
