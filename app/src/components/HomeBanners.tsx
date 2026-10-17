import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { api, type PendingFeedback, type SafetySession } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Banner } from './ui';

/** Upozornění nahoře na hlavních obrazovkách: probíhající schůzka a hodnocení po schůzce. */
export function HomeBanners() {
  const t = useT();
  const [active, setActive] = useState<SafetySession[]>([]);
  const [feedback, setFeedback] = useState<PendingFeedback[]>([]);

  useFocusEffect(
    useCallback(() => {
      api<SafetySession[]>('GET', '/safety/active').then(setActive).catch(() => {});
      api<PendingFeedback[]>('GET', '/feedback/pending').then(setFeedback).catch(() => {});
    }, []),
  );

  if (active.length === 0 && feedback.length === 0) return null;
  return (
    <View style={{ gap: 8, paddingHorizontal: 14, paddingBottom: 8 }}>
      {active.map((s) => (
        <Banner
          key={s.id}
          tone={s.status === 'ok' ? 'safe' : 'warn'}
          icon="shieldCheck"
          title={t('homeBanners.meetupTitle', { name: s.partner.name })}
          subtitle={s.status === 'overdue' ? t('homeBanners.missedCheckIn') : t('homeBanners.safetyOn')}
          action={t('common.open')}
          onPress={() => router.push(`/meetup/${s.matchId ?? 0}?safetyId=${s.id}`)}
        />
      ))}
      {feedback.slice(0, 1).map((f) => (
        <Banner
          key={f.agreementId}
          icon="shield"
          title={t('homeBanners.feedbackTitle')}
          subtitle={t('homeBanners.feedbackSubtitle', { name: f.partnerName })}
          action={t('homeBanners.feedbackAction')}
          onPress={() => router.push(`/feedback/${f.agreementId}?name=${encodeURIComponent(f.partnerName)}`)}
        />
      ))}
    </View>
  );
}
