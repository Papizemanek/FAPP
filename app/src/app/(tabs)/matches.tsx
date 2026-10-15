import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { HomeBanners } from '@/components/HomeBanners';
import { Avatar, Body, Screen, Title } from '@/components/ui';
import { api, type AgreementStatus, type MatchSummary } from '@/lib/api';
import { colors, fonts } from '@/lib/theme';

const statusPill: Partial<Record<AgreementStatus, { label: string; color: string }>> = {
  pending: { label: 'Domluva čeká', color: colors.warn },
  confirmed: { label: 'Domluva hotová', color: colors.safe },
  revoked: { label: 'Domluva zrušena', color: colors.alarm },
};

export default function Matches() {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setMatches(await api<MatchSummary[]>('GET', '/matches'));
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
        <Title>Zprávy</Title>
      </View>
      <HomeBanners />
      <FlatList
        data={matches}
        keyExtractor={(m) => String(m.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24, gap: 4 }}
        ListEmptyComponent={
          refreshing ? null : (
            <Body muted style={{ textAlign: 'center', marginTop: 48, paddingHorizontal: 24 }}>
              Zatím žádný match. Swipuj dál – jakmile se líbíte oba, objeví se tady.
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
                  {pill ? <Text style={[s.pill, { color: pill.color, borderColor: pill.color }]}>{pill.label}</Text> : null}
                </View>
                <Text style={s.preview} numberOfLines={1}>
                  {item.lastMessage ? `${item.lastMessage.mine ? 'Ty: ' : ''}${item.lastMessage.text}` : 'Nový match – napiš první.'}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, borderRadius: 16 },
  name: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  preview: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  pill: { fontFamily: fonts.semibold, fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
});
