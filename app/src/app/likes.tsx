import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { ActionSheet } from '@/components/Sheet';
import { Avatar, Body, Button, ErrorText, Header, Screen } from '@/components/ui';
import { api, errorMessage, type Likes, type Profile } from '@/lib/api';
import { openPaywall, setLikesLeft, useBilling } from '@/lib/billing';
import { avatarTones, colors, fonts } from '@/lib/theme';

type Tab = 'received' | 'sent';

/** Kdo tě lajkl (Gold) a koho jsi lajkl/a ty (Platinum). Bez předplatného jen počet – fotky se vůbec neposílají. */
export default function LikesScreen() {
  const billing = useBilling();
  const [tab, setTab] = useState<Tab>('received');
  const [likes, setLikes] = useState<Likes | null>(null);
  const [sent, setSent] = useState<Profile[] | null>(null);
  const [picked, setPicked] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setLikes(await api<Likes>('GET', '/likes'));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openSent = async () => {
    setTab('sent');
    if (!billing?.features.sentLikes) return;
    try {
      setSent(await api<Profile[]>('GET', '/likes/sent'));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const answer = async (profile: Profile, like: boolean) => {
    setLikes((l) => (l ? { count: Math.max(0, l.count - 1), profiles: l.profiles.filter((p) => p.id !== profile.id) } : l));
    try {
      const res = await api<{ match: { id: number } | null; likesLeft?: number | null }>('POST', '/swipes', { targetId: profile.id, like });
      setLikesLeft(res.likesLeft);
      if (res.match) router.push({ pathname: '/match', params: { matchId: String(res.match.id), name: profile.name } });
    } catch (err) {
      if (!openPaywall(err)) setError(errorMessage(err));
      void load();
    }
  };

  const canSee = !!billing?.features.seeLikes;
  const count = likes?.count ?? 0;

  return (
    <Screen>
      <Header title="Lajky" />
      <View style={s.tabs}>
        <TabButton label={`Lajkli tě${count ? ` · ${count}` : ''}`} active={tab === 'received'} onPress={() => setTab('received')} />
        <TabButton label="Odeslané" active={tab === 'sent'} onPress={openSent} />
      </View>
      <ErrorText>{error}</ErrorText>

      {tab === 'received' ? (
        canSee ? (
          <FlatList
            data={likes?.profiles ?? []}
            keyExtractor={(p) => String(p.id)}
            numColumns={2}
            columnWrapperStyle={{ gap: 12 }}
            contentContainerStyle={{ padding: 20, gap: 12 }}
            ListEmptyComponent={<Body muted style={{ textAlign: 'center', marginTop: 40 }}>Zatím tě nikdo nový nelajkl.</Body>}
            renderItem={({ item, index }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.age}`}
                onPress={() => setPicked(item)}
                style={[s.tile, { backgroundColor: avatarTones[index % avatarTones.length] }]}
              >
                <Avatar name={item.name} photo={item.photos[0]} size={84} index={index} />
                <Text style={s.tileName}>
                  {item.name}, {item.age}
                </Text>
                {item.superLike ? (
                  <View style={s.badge}>
                    <Icon name="star" size={12} color={colors.onAccent} fill={colors.onAccent} strokeWidth={1.5} />
                    <Text style={s.badgeText}>Super lajk</Text>
                  </View>
                ) : item.distanceKm != null ? (
                  <Text style={s.tileMeta}>{item.distanceKm} km</Text>
                ) : null}
              </Pressable>
            )}
          />
        ) : (
          <Locked
            title={count ? `Lajklo tě ${count} ${count === 1 ? 'člověk' : count < 5 ? 'lidi' : 'lidí'}` : 'Lajky uvidíš tady'}
            text="S F*app Gold uvidíš, kdo to je, a matchneš jedním klepnutím."
            cta="Zobrazit s Gold"
            plan="gold"
            tiles={Math.min(Math.max(count, 2), 6)}
          />
        )
      ) : billing?.features.sentLikes ? (
        <FlatList
          data={sent ?? []}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ padding: 20, gap: 8 }}
          ListEmptyComponent={<Body muted style={{ textAlign: 'center', marginTop: 40 }}>Za posledních 7 dní žádné lajky bez matche.</Body>}
          renderItem={({ item, index }) => (
            <View style={s.row}>
              <Avatar name={item.name} photo={item.photos[0]} size={52} index={index} />
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>
                  {item.name}, {item.age}
                </Text>
                <Text style={s.tileMeta}>{item.superLike ? 'Super lajk · čeká' : 'Čeká na odpověď'}</Text>
              </View>
            </View>
          )}
        />
      ) : (
        <Locked
          title="Koho jsi lajkl/a"
          text="S F*app Platinum uvidíš svoje lajky za posledních 7 dní."
          cta="Zobrazit s Platinum"
          plan="platinum"
          tiles={2}
        />
      )}

      <ActionSheet
        visible={!!picked}
        title={picked ? `${picked.name}, ${picked.age}` : ''}
        actions={
          picked
            ? [
                { label: 'Lajknout zpátky', onPress: () => answer(picked, true) },
                { label: 'Přeskočit', onPress: () => answer(picked, false) },
              ]
            : []
        }
        onClose={() => setPicked(null)}
      />
    </Screen>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[s.tab, active && s.tabOn]}>
      <Text style={[s.tabText, active && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function Locked({ title, text, cta, plan, tiles }: { title: string; text: string; cta: string; plan: 'gold' | 'platinum'; tiles: number }) {
  return (
    <View style={{ padding: 20, gap: 16 }}>
      <View style={s.lockedGrid}>
        {Array.from({ length: tiles }, (_, i) => (
          <View key={i} style={[s.lockedTile, { backgroundColor: avatarTones[i % avatarTones.length] }]}>
            <Icon name="lock" color={colors.muted} />
          </View>
        ))}
      </View>
      <Text style={s.lockedTitle}>{title}</Text>
      <Body muted>{text}</Body>
      <Button label={cta} onPress={() => router.push({ pathname: '/premium', params: { plan } })} />
    </View>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  tab: { height: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  tabOn: { borderColor: colors.accent, backgroundColor: colors.accentBg },
  tabText: { fontFamily: fonts.bold, fontSize: 14, color: colors.muted },
  tile: { flex: 1, height: 190, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
  tileName: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  tileMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.warn },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, color: colors.onAccent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, borderRadius: 16, backgroundColor: colors.surface },
  rowName: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  lockedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  lockedTile: { width: '30%', aspectRatio: 0.8, borderRadius: 18, alignItems: 'center', justifyContent: 'center', opacity: 0.7 },
  lockedTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.text },
});
