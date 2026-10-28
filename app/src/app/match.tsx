import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Avatar, Body, Button, Screen } from '@/components/ui';
import { api, type MatchDetail, type Tag } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { colors, fonts } from '@/lib/theme';

export default function MatchModal() {
  const t = useT();
  const { matchId, name } = useLocalSearchParams<{ matchId: string; name: string }>();
  const { me } = useSession();
  const [partnerPhoto, setPartnerPhoto] = useState<string | null>(null);
  const [shared, setShared] = useState<Tag[]>([]);

  useEffect(() => {
    api<MatchDetail>('GET', `/matches/${matchId}`)
      .then((d) => {
        setPartnerPhoto(d.partner.photos[0] ?? null);
        setShared(d.partner.sharedYes ?? []);
      })
      .catch(() => {});
  }, [matchId]);

  return (
    <Screen style={{ paddingHorizontal: 24, paddingVertical: 32 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 32 }}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ borderWidth: 4, borderColor: colors.bg, borderRadius: 70 }}>
            <Avatar name={me?.name ?? '?'} photo={me?.photos[0]} size={128} index={1} />
          </View>
          <View style={{ marginLeft: -24, borderWidth: 4, borderColor: colors.bg, borderRadius: 70 }}>
            <Avatar name={name ?? '?'} photo={partnerPhoto} size={128} />
          </View>
        </View>
        <View style={{ gap: 10, alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 48, color: colors.accent, letterSpacing: -1.5 }}>{t('match.title')}</Text>
          <Body muted style={{ textAlign: 'center', fontSize: 16 }}>
            {t('match.body', { name: name ?? '' })}
          </Body>
        </View>
        {shared.length > 0 ? (
          <View style={{ gap: 10, alignItems: 'center' }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.muted }}>
              {t('match.sharedYes')}
              <Text style={{ color: colors.accent }}>*</Text>
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
              {shared.map((tag) => (
                <Text key={tag} style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.text, backgroundColor: colors.accentBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, overflow: 'hidden' }}>
                  {t(`labels.tags.${tag}`)}
                </Text>
              ))}
            </View>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 12 }}>
        <Button label={t('match.sendMessage')} onPress={() => router.replace(`/chat/${matchId}`)} />
        <Button variant="ghost" label={t('match.keepDiscovering')} onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
