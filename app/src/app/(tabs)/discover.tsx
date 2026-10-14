import { TAGS } from '@fapp/shared';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { HomeBanners } from '@/components/HomeBanners';
import { Icon } from '@/components/Icon';
import { Body, Button, IconButton, Logo, Screen } from '@/components/ui';
import { api, ApiError, errorMessage, imageSource, type Profile } from '@/lib/api';
import { useSession } from '@/lib/session';
import { avatarTones, colors, fonts } from '@/lib/theme';

const SWIPE_THRESHOLD = 110;
const { width: SCREEN_W } = Dimensions.get('window');

type Problem = { kind: 'location' | 'photo' | 'other'; message: string } | null;

export default function Discover() {
  const { setMe } = useSession();
  const [deck, setDeck] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<Problem>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const position = useRef(new Animated.ValueXY()).current;
  const locationSent = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setProblem(null);
    try {
      // Polohu (zaokrouhlenou na ~1 km) aktualizujeme jednou za spuštění, pokud ji uživatel povolil.
      if (!locationSent.current) {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.granted) {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setMe(await api('PUT', '/me/location', { lat: loc.coords.latitude, lng: loc.coords.longitude }));
          locationSent.current = true;
        }
      }
      setDeck(await api<Profile[]>('GET', '/discover'));
      setPhotoIndex(0);
    } catch (err) {
      const message = errorMessage(err);
      const kind = err instanceof ApiError && err.status === 409 ? (/poloh/i.test(message) ? 'location' : 'photo') : 'other';
      setProblem({ kind, message });
    } finally {
      setLoading(false);
    }
  }, [setMe]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const enableLocation = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.granted) await load();
  };

  const top = deck[0];

  const swipe = useCallback(
    (like: boolean) => {
      if (!top) return;
      void Haptics.impactAsync(like ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
      Animated.timing(position, { toValue: { x: (like ? 1 : -1) * SCREEN_W * 1.5, y: 0 }, duration: 220, useNativeDriver: false }).start(() => {
        setDeck((d) => d.slice(1));
        setPhotoIndex(0);
        position.setValue({ x: 0, y: 0 });
      });
      api<{ match: { id: number; partner: Profile } | null }>('POST', '/swipes', { targetId: top.id, like })
        .then(({ match }) => {
          if (match) {
            router.push({
              pathname: '/match',
              params: { matchId: String(match.id), name: match.partner.name, photo: match.partner.photos[0] ?? '' },
            });
          }
        })
        .catch(() => {});
    },
    [top, position],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: Animated.event([null, { dx: position.x, dy: position.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          if (g.dx > SWIPE_THRESHOLD) swipe(true);
          else if (g.dx < -SWIPE_THRESHOLD) swipe(false);
          else Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
      }),
    [position, swipe],
  );

  const rotate = position.x.interpolate({ inputRange: [-SCREEN_W, 0, SCREEN_W], outputRange: ['-12deg', '0deg', '12deg'] });
  const likeOpacity = position.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const nopeOpacity = position.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Screen edges={['top']}>
      <View style={s.topBar}>
        <Logo />
        <IconButton name="sliders" label="Nastavení hledání" onPress={() => router.push('/profile')} />
      </View>
      <HomeBanners />

      <View style={s.cardArea}>
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : problem ? (
          <View style={s.empty}>
            <Body muted style={{ textAlign: 'center' }}>{problem.message}</Body>
            {problem.kind === 'location' ? <Button label="Povolit polohu" onPress={enableLocation} /> : null}
            {problem.kind === 'photo' ? <Button label="Přidat fotku" onPress={() => router.push('/profile')} /> : null}
            {problem.kind === 'other' ? <Button variant="ghost" label="Zkusit znovu" onPress={load} /> : null}
          </View>
        ) : !top ? (
          <View style={s.empty}>
            <Body muted style={{ textAlign: 'center' }}>Teď tu poblíž nikdo další není. Zkus to později nebo si rozšiř hledání.</Body>
            <Button variant="ghost" label="Obnovit" onPress={load} />
          </View>
        ) : (
          <Animated.View
            {...pan.panHandlers}
            style={[s.card, { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] }]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              accessibilityLabel="Další fotka"
              onPress={() => setPhotoIndex((i) => (top.photos.length ? (i + 1) % top.photos.length : 0))}
            >
              {top.photos.length ? (
                <Image source={imageSource(top.photos[photoIndex])} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: avatarTones[top.id % avatarTones.length] }]} />
              )}
            </Pressable>
            {top.photos.length > 1 ? (
              <View style={s.photoDots} pointerEvents="none">
                {top.photos.map((p, i) => (
                  <View key={p} style={[s.photoDot, i === photoIndex && { backgroundColor: colors.text }]} />
                ))}
              </View>
            ) : null}
            <Animated.Text style={[s.stamp, s.stampLike, { opacity: likeOpacity }]}>CHCI</Animated.Text>
            <Animated.Text style={[s.stamp, s.stampNope, { opacity: nopeOpacity }]}>NE</Animated.Text>
            <View style={s.info} pointerEvents="none">
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                <Text style={s.name}>{top.name}</Text>
                <Text style={s.age}>{top.age}</Text>
                {top.verified ? <Icon name="shieldCheck" size={18} color={colors.safe} /> : null}
              </View>
              {top.distanceKm != null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="pin" size={16} color="#D9CFDC" />
                  <Text style={s.meta}>{top.distanceKm} km od tebe</Text>
                </View>
              ) : null}
              {top.bio ? <Text style={s.bio}>{top.bio}</Text> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {top.tags.map((t) => (
                  <Text key={t} style={s.tag}>
                    {TAGS[t]}
                  </Text>
                ))}
              </View>
            </View>
          </Animated.View>
        )}
      </View>

      <View style={s.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Přeskočit" disabled={!top} onPress={() => swipe(false)} style={s.nope}>
          <Icon name="close" size={28} strokeWidth={2.4} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Líbí se mi" disabled={!top} onPress={() => swipe(true)} style={s.like}>
          <Icon name="heart" size={32} color={colors.onAccent} fill={colors.onAccent} strokeWidth={1.5} />
        </Pressable>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  topBar: { height: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardArea: { flex: 1, paddingHorizontal: 14, justifyContent: 'center' },
  card: { flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: colors.surface2 },
  empty: { alignItems: 'center', gap: 16, paddingHorizontal: 24 },
  photoDots: { position: 'absolute', top: 10, left: 12, right: 12, flexDirection: 'row', gap: 4 },
  photoDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(245,239,233,0.35)' },
  stamp: { position: 'absolute', top: 40, fontFamily: fonts.display, fontSize: 40, paddingHorizontal: 12, borderWidth: 4, borderRadius: 12 },
  stampLike: { left: 24, color: colors.safe, borderColor: colors.safe, transform: [{ rotate: '-14deg' }] },
  stampNope: { right: 24, color: colors.alarm, borderColor: colors.alarm, transform: [{ rotate: '14deg' }] },
  info: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, gap: 10, backgroundColor: 'rgba(18,16,20,0.72)' },
  name: { fontFamily: fonts.display, fontSize: 32, color: colors.text },
  age: { fontFamily: fonts.medium, fontSize: 26, color: colors.text },
  meta: { fontFamily: fonts.regular, fontSize: 14, color: '#D9CFDC' },
  bio: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.text },
  tag: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(245,239,233,0.14)',
  },
  actions: { height: 112, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  nope: { width: 68, height: 68, borderRadius: 34, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  like: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
