import { TAGS, TRAVEL_CITIES } from '@fapp/shared';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { HomeBanners } from '@/components/HomeBanners';
import { Icon, type IconName } from '@/components/Icon';
import { ConfirmSheet } from '@/components/Sheet';
import { Body, Button, IconButton, Logo, Screen } from '@/components/ui';
import { api, ApiError, errorMessage, imageSource, type Billing, type Profile } from '@/lib/api';
import { openPaywall, refreshBilling, setBilling, setLikesLeft, showPaid, useBilling } from '@/lib/billing';
import { useSession } from '@/lib/session';
import { avatarTones, colors, fonts } from '@/lib/theme';

const SWIPE_THRESHOLD = 110;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type Problem = { kind: 'location' | 'photo' | 'other'; message: string } | null;
type SwipeResult = { match: { id: number; partner: Profile } | null; likesLeft?: number | null };
type Sheet = 'boost' | 'tonight' | 'tonightOff' | null;

const clock = (iso: string) => new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
const premium = (params: Record<string, string>) => router.push({ pathname: '/premium', params });

export default function Discover() {
  const { setMe } = useSession();
  const [deck, setDeck] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<Problem>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const position = useRef(new Animated.ValueXY()).current;
  const locationSent = useRef(false);
  const billing = useBilling();
  const paid = showPaid(billing);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 3500);
  }, []);

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
      void refreshBilling();
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
    (like: boolean, superLike = false) => {
      if (!top) return;
      // Limit a kredity známe dopředu – kartu neodhazujeme, když by se swipe stejně nepovedl.
      if (like && !superLike && billing?.likes.remaining === 0) {
        premium({ reason: 'like_limit', resetAt: billing.likes.resetAt ?? '' });
        return;
      }
      if (superLike && billing && billing.superLikes.weeklyLeft === 0 && billing.superLikes.credits === 0) {
        premium({ reason: 'no_credit', credit: 'superlike' });
        return;
      }
      const profile = top;
      void Haptics.impactAsync(like ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
      const toValue = superLike ? { x: 0, y: -SCREEN_H } : { x: (like ? 1 : -1) * SCREEN_W * 1.5, y: 0 };
      Animated.timing(position, { toValue, duration: 220, useNativeDriver: false }).start(() => {
        setDeck((d) => d.slice(1));
        setPhotoIndex(0);
        position.setValue({ x: 0, y: 0 });
      });
      api<SwipeResult>('POST', '/swipes', { targetId: profile.id, like, super: superLike })
        .then(({ match, likesLeft }) => {
          setLikesLeft(likesLeft);
          if (superLike) void refreshBilling();
          if (likesLeft != null && likesLeft > 0 && likesLeft <= 10) say(`Zbývá ${likesLeft} lajků.`);
          if (match) {
            router.push({
              pathname: '/match',
              params: { matchId: String(match.id), name: match.partner.name },
            });
          }
        })
        .catch((err) => {
          // Placená funkce: kartu vrátíme a ukážeme nabídku.
          if (err instanceof ApiError && err.status === 402) {
            setDeck((d) => [profile, ...d.filter((p) => p.id !== profile.id)]);
            openPaywall(err);
          }
        });
    },
    [top, position, billing, say],
  );

  const rewind = async () => {
    if (!billing?.features.rewind) return premium({ reason: 'upgrade', plan: 'plus' });
    try {
      const { profile } = await api<{ profile: Profile }>('POST', '/swipes/rewind');
      setDeck((d) => [profile, ...d.filter((p) => p.id !== profile.id)]);
      setPhotoIndex(0);
      void refreshBilling();
    } catch (err) {
      if (!openPaywall(err)) say(errorMessage(err));
    }
  };

  const onBoost = () => {
    if (!billing) return;
    if (billing.boost.activeUntil) return say(`Boost běží do ${clock(billing.boost.activeUntil)}.`);
    if (billing.boost.monthlyLeft > 0 || billing.boost.credits > 0) return setSheet('boost');
    premium({ reason: 'no_credit', credit: 'boost' });
  };

  const onTonight = () => {
    if (!billing) return;
    if (billing.tonight.activeUntil) return setSheet('tonightOff');
    if (billing.tonight.included || billing.tonight.credits > 0) return setSheet('tonight');
    premium({ reason: 'no_credit', credit: 'tonight' });
  };

  const billingCall = async (method: string, path: string, done: string) => {
    try {
      setBilling(await api<Billing>(method, path));
      say(done);
    } catch (err) {
      if (!openPaywall(err)) say(errorMessage(err));
    }
  };


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
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {paid ? (
            <>
              <IconButton
                name="moon"
                label={billing.tonight.activeUntil ? 'Dnes večer – zapnuto' : 'Dnes večer'}
                color={billing.tonight.activeUntil ? colors.warn : undefined}
                onPress={onTonight}
              />
              <IconButton
                name="bolt"
                label={billing.boost.activeUntil ? 'Boost běží' : 'Boost'}
                color={billing.boost.activeUntil ? colors.accent : undefined}
                onPress={onBoost}
              />
            </>
          ) : null}
          <IconButton name="sliders" label="Nastavení hledání" onPress={() => router.push('/profile')} />
        </View>
      </View>
      {paid && billing.travelCity ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={s.travel}>
          <Icon name="globe" size={16} color={colors.accent} />
          <Text style={s.travelText}>{`Na cestách · ${TRAVEL_CITIES[billing.travelCity].name}`}</Text>
          <Text style={[s.travelText, { color: colors.muted }]}>Změnit</Text>
        </Pressable>
      ) : null}
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
              {top.superLike || top.tonight || top.traveling ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {top.superLike ? <Badge icon="star" label="Dal/a ti super lajk" color={colors.warn} /> : null}
                  {top.tonight ? <Badge icon="moon" label="Dnes večer" color={colors.accent} /> : null}
                  {top.traveling ? <Badge icon="globe" label="Na cestách" color={colors.muted} /> : null}
                </View>
              ) : null}
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

      {notice ? <Text style={s.notice}>{notice}</Text> : null}
      <View style={s.actions}>
        {paid ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Vrátit poslední swipe" onPress={rewind} style={s.small}>
            <Icon name="undo" size={22} color={colors.warn} strokeWidth={2.2} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Přeskočit" disabled={!top} onPress={() => swipe(false)} style={s.nope}>
          <Icon name="close" size={28} strokeWidth={2.4} />
        </Pressable>
        {paid ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Super lajk" disabled={!top} onPress={() => swipe(true, true)} style={s.small}>
            <Icon name="star" size={22} color={colors.warn} fill={colors.warn} strokeWidth={1.5} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Líbí se mi" disabled={!top} onPress={() => swipe(true)} style={s.like}>
          <Icon name="heart" size={32} color={colors.onAccent} fill={colors.onAccent} strokeWidth={1.5} />
        </Pressable>
      </View>

      <ConfirmSheet
        visible={sheet === 'boost'}
        title="Spustit boost?"
        message={`30 minut budeš nahoře u lidí v okolí. ${
          billing?.boost.monthlyLeft ? 'Použije se měsíční boost z předplatného.' : `Zbývá ti ${billing?.boost.credits ?? 0}×.`
        }`}
        confirmLabel="Spustit boost"
        onConfirm={() => billingCall('POST', '/billing/boost', 'Boost běží – 30 minut jsi nahoře.')}
        onClose={() => setSheet(null)}
      />
      <ConfirmSheet
        visible={sheet === 'tonight'}
        title="Zapnout „Dnes večer“?"
        message={`Do 6:00 ráno budeš u lidí v okolí výš a se štítkem „Dnes večer“. Vypnout to jde kdykoli.${
          billing?.tonight.included ? '' : ` Zbývá ti ${billing?.tonight.credits ?? 0}×.`
        }`}
        confirmLabel="Zapnout"
        onConfirm={() => billingCall('POST', '/billing/tonight', 'Dnes večer je zapnuté do 6:00.')}
        onClose={() => setSheet(null)}
      />
      <ConfirmSheet
        visible={sheet === 'tonightOff'}
        title="„Dnes večer“ je zapnuté"
        message={billing?.tonight.activeUntil ? `Platí do ${clock(billing.tonight.activeUntil)}.` : undefined}
        confirmLabel="Vypnout"
        destructive
        onConfirm={() => billingCall('DELETE', '/billing/tonight', 'Dnes večer je vypnuté.')}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}

function Badge({ icon, label, color }: { icon: IconName; label: string; color: string }) {
  return (
    <View style={[s.badge, { borderColor: color }]}>
      <Icon name={icon} size={13} color={color} fill={icon === 'star' ? color : 'none'} strokeWidth={2} />
      <Text style={[s.badgeText, { color }]}>{label}</Text>
    </View>
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
  actions: { height: 112, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  small: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  notice: { textAlign: 'center', fontFamily: fonts.semibold, fontSize: 14, color: colors.text, paddingTop: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, backgroundColor: 'rgba(18,16,20,0.6)' },
  badgeText: { fontFamily: fonts.bold, fontSize: 12 },
  travel: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', marginBottom: 8, paddingHorizontal: 14, height: 34, borderRadius: 999, backgroundColor: colors.accentBg, borderWidth: 1, borderColor: colors.accent },
  travelText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  nope: { width: 68, height: 68, borderRadius: 34, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  like: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
