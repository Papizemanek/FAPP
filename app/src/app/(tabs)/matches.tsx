import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { HomeBanners } from '@/components/HomeBanners';
import { Icon } from '@/components/Icon';
import { Avatar, Body, Screen, Title } from '@/components/ui';
import { api, type AgreementStatus, type Likes, type MatchSummary } from '@/lib/api';
import { showPaid, useBilling } from '@/lib/billing';
import { useT } from '@/lib/i18n';
import { colors, fonts } from '@/lib/theme';

const statusPill: Partial<Record<AgreementStatus, { labelKey: string; color: string }>> = {
  pending: { labelKey: 'matches.agreement.pending', color: colors.warn },
  confirmed: { labelKey: 'matches.agreement.confirmed', color: colors.safe },
  revoked: { labelKey: 'matches.agreement.revoked', color: colors.alarm },
};

export default function Matches() {
  const t = useT();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [likes, setLikes] = useState<Likes | null>(null);
  const billing = useBilling();
  const paid = showPaid(billing);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setMatches(await api<MatchSummary[]>('GET', '/matches'));
      setLikes(await api<Likes>('GET', '/likes'));
    } catch {
      // ponecháme poslední stav
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen edges={['top']}>
      <View style={{ height: 64, paddingHorizontal: 20, justifyContent: 'center' }}>
        <Title>{t('matches.title')}</Title>
      </View>
      <HomeBanners />
      {paid ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/likes')} style={({ pressed }) => [s.likes, pressed && { opacity: 0.85 }]}>
          <View style={s.likesIcon}>
            <Icon name="heart" size={22} color={colors.onAccent} fill={colors.onAccent} strokeWidth={1.5} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{t('matches.likes')}</Text>
            <Text style={s.preview}>
              {likes?.count
                ? t(billing.features.seeLikes ? 'matches.likedBy' : 'matches.likedByLocked', { count: likes.count })
                : t('matches.likesHint')}
            </Text>
          </View>
          <Icon name="chevron" color={colors.muted} />
        </Pressable>
      ) : null}
      <FlatList
        data={matches}
        keyExtractor={(m) => String(m.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24, gap: 4 }}
        ListEmptyComponent={
          refreshing ? null : (
            <Body muted style={{ textAlign: 'center', marginTop: 48, paddingHorizontal: 24 }}>
              {t('matches.empty')}
            </Body>
          )
        }
        renderItem={({ item, index }) => {
          const pill = item.agreementStatus ? statusPill[item.agreementStatus] : undefined;
          return (
            <Pressable onPress={() => router.push(`/chat/${item.id}`)} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surface }]}>
              <Avatar name={item.partner.name} photo={item.partner.photos[0]} size={56} index={index} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.name}>
                    {item.partner.name}, {item.partner.age}
                  </Text>
                  {pill ? <Text style={[s.pill, { color: pill.color, borderColor: pill.color }]}>{t(pill.labelKey)}</Text> : null}
                </View>
                <Text style={s.preview} numberOfLines={1}>
                  {item.lastMessage
                    ? item.lastMessage.mine
                      ? t('matches.lastMessageMine', { text: item.lastMessage.text })
                      : item.lastMessage.text
                    : t('matches.newMatch')}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  likes: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 14, marginBottom: 6, padding: 10, borderRadius: 16, backgroundColor: colors.surface },
  likesIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, borderRadius: 16 },
  name: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  preview: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  pill: { fontFamily: fonts.semibold, fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
});
