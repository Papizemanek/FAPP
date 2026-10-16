import { CREDITS, FEATURES, PLANS, PRODUCTS, type CreditKind, type FeatureId, type PlanId, type ProductId } from '@fapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Banner, Body, Button, ErrorText, Header, Screen, Title } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { purchase, useBilling } from '@/lib/billing';
import { colors, fonts } from '@/lib/theme';

type PaidPlan = Exclude<PlanId, 'free'>;
const paidPlans: PaidPlan[] = ['plus', 'gold', 'platinum'];
const featureIds = Object.keys(FEATURES) as FeatureId[];
const durations = [1, 6, 12] as const;

const tagline: Record<PaidPlan, string> = {
  plus: 'Swipuj bez limitu a vrať omylem odmítnutý profil.',
  gold: 'Uvidíš, kdo tě lajkl – a matchneš jedním klepnutím.',
  platinum: 'Tvůj lajk uvidí jako první. A „Dnes večer“ kdykoli.',
};

const credits: { kind: CreditKind; detail: string; products: ProductId[] }[] = [
  { kind: 'boost', detail: '30 minut nahoře u lidí v okolí.', products: ['boost_1', 'boost_5'] },
  { kind: 'superlike', detail: 'Uvidí, že o něj/ni opravdu stojíš.', products: ['superlike_1', 'superlike_5'] },
  { kind: 'tonight', detail: 'Do 6:00 ráno výš a se štítkem „Dnes večer“.', products: ['tonight_1'] },
];

const productFor = (plan: PaidPlan, months: number) => `${plan}_${months}m` as ProductId;
const priceOf = (id: ProductId) => PRODUCTS[id].priceCzk;
const kc = (n: number) => `${n.toLocaleString('cs-CZ')} Kč`;
const day = (iso: string) => new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
const clock = (iso: string) => new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

/** Nabídka předplatného po vzoru Tinderu. Bezpečnost je vždy zdarma – tady se prodává jen pohodlí a viditelnost. */
export default function Premium() {
  const params = useLocalSearchParams<{ reason?: string; plan?: string; credit?: string; resetAt?: string }>();
  const billing = useBilling();
  const initial = paidPlans.includes(params.plan as PaidPlan) ? (params.plan as PaidPlan) : params.reason === 'like_limit' ? 'plus' : 'gold';
  const [plan, setPlan] = useState<PaidPlan>(initial);
  const [months, setMonths] = useState<number>(6);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const buy = async (productId: ProductId, label: string) => {
    setBusy(productId);
    setError('');
    try {
      await purchase(productId);
      setDone(label);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (billing && !billing.canPurchase) {
    return (
      <Screen>
        <Header />
        <View style={{ padding: 20, gap: 14 }}>
          <Title>F*app je teď zdarma</Title>
          <Body muted>Placené funkce zapneme později. Bezpečnost – ověření, domluva, bezpečnostní režim i SOS – zůstane zdarma vždycky.</Body>
          <Button label="Zpět" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen>
        <View style={s.done}>
          <View style={s.doneIcon}>
            <Icon name="check" size={36} color={colors.onAccent} strokeWidth={3} />
          </View>
          <Title style={{ textAlign: 'center' }}>Hotovo</Title>
          <Body muted style={{ textAlign: 'center' }}>{done}</Body>
          <Button label="Pokračovat" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
        </View>
      </Screen>
    );
  }

  const rank = PLANS[plan].rank;
  const selected = productFor(plan, months);
  const monthly = Math.round(priceOf(selected) / months);
  const creditFirst = params.reason === 'no_credit';
  const reason =
    params.reason === 'like_limit'
      ? `Došly ti lajky. ${params.resetAt ? `Další přibudou v ${clock(params.resetAt)}.` : 'Další přibudou za chvíli.'}`
      : params.reason === 'no_credit' && params.credit && params.credit in CREDITS
        ? `${CREDITS[params.credit as CreditKind]} je jednorázově, nebo v předplatném.`
        : params.reason === 'upgrade'
          ? `Tohle je součástí F*app ${PLANS[initial].name}.`
          : null;

  const creditSection = (
    <View style={{ gap: 10 }}>
      <Text style={s.section}>Jednorázově</Text>
      {credits.map((c) => (
        <View key={c.kind} style={[s.creditRow, params.credit === c.kind && { borderColor: colors.accent }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.featureName}>
              {CREDITS[c.kind]}
              {billing && creditBalance(billing, c.kind) > 0 ? <Text style={s.owned}>{`  · máš ${creditBalance(billing, c.kind)}`}</Text> : null}
            </Text>
            <Text style={s.featureDetail}>{c.detail}</Text>
          </View>
          {c.products.map((id) => {
            const p = PRODUCTS[id];
            const amount = p.kind === 'credit' ? p.amount : 1;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={`Koupit ${amount}× ${CREDITS[c.kind]} za ${kc(p.priceCzk)}`}
                disabled={!!busy}
                onPress={() => buy(id, amount > 1 ? `Máš ${amount}× ${CREDITS[c.kind].toLowerCase()} navíc.` : `Máš ${CREDITS[c.kind].toLowerCase()} navíc.`)}
                style={({ pressed }) => [s.priceChip, pressed && { opacity: 0.8 }]}
              >
                <Text style={s.priceChipTop}>{amount}×</Text>
                <Text style={s.priceChipBottom}>{kc(p.priceCzk)}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );

  return (
    <Screen>
      <Header title="Předplatné" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 18 }}>
        {reason ? <Banner tone="warn" icon="heart" title={reason} /> : null}
        {billing && billing.plan !== 'free' ? (
          <Banner tone="safe" icon="crown" title={`Máš F*app ${PLANS[billing.plan].name}`} subtitle={billing.planExpiresAt ? `Platí do ${day(billing.planExpiresAt)}.` : undefined} />
        ) : null}

        {creditFirst ? creditSection : null}

        <View style={s.segment}>
          {paidPlans.map((p) => (
            <Pressable
              key={p}
              accessibilityRole="tab"
              accessibilityState={{ selected: plan === p }}
              onPress={() => setPlan(p)}
              style={[s.segmentItem, plan === p && s.segmentOn]}
            >
              <Text style={[s.segmentText, plan === p && { color: colors.onAccent }]}>{PLANS[p].name}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ gap: 6 }}>
          <Title style={{ fontSize: 30 }}>{`F*app ${PLANS[plan].name}`}</Title>
          <Body muted>{tagline[plan]}</Body>
        </View>

        <View style={{ gap: 12 }}>
          {featureIds.map((f) => {
            const included = PLANS[FEATURES[f].plan].rank <= rank;
            return (
              <View key={f} style={[s.feature, !included && { opacity: 0.4 }]} accessibilityLabel={`${FEATURES[f].name}: ${included ? 'v ceně' : 'není v ceně'}`}>
                <Icon name={included ? 'check' : 'close'} size={18} color={included ? colors.accent : colors.faint} strokeWidth={2.6} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={s.featureName}>{FEATURES[f].name}</Text>
                  <Text style={s.featureDetail}>{FEATURES[f].detail}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {durations.map((m) => {
            const id = productFor(plan, m);
            const perMonth = Math.round(priceOf(id) / m);
            const save = Math.round((1 - perMonth / priceOf(productFor(plan, 1))) * 100);
            return (
              <Pressable
                key={m}
                accessibilityRole="radio"
                accessibilityState={{ checked: months === m }}
                onPress={() => setMonths(m)}
                style={[s.duration, months === m && s.durationOn]}
              >
                <Text style={s.durationMonths}>{m === 1 ? '1 měsíc' : `${m} měsíců`}</Text>
                <Text style={s.durationPrice}>{kc(perMonth)}</Text>
                <Text style={s.durationNote}>{save > 0 ? `za měsíc · −${save}\u00a0%` : 'za měsíc'}</Text>
              </Pressable>
            );
          })}
        </View>

        <Button
          label={`Pokračovat · ${kc(priceOf(selected))}`}
          loading={busy === selected}
          disabled={!!busy && busy !== selected}
          onPress={() => buy(selected, `Máš F*app ${PLANS[plan].name}${months > 1 ? ` na ${months} měsíců` : ''}.`)}
        />
        <ErrorText>{error}</ErrorText>
        <Text style={s.fine}>
          {months > 1 ? `Zaplatíš ${kc(priceOf(selected))} najednou (${kc(monthly)} měsíčně). ` : ''}
          Předplatné se obnovuje automaticky, zrušit ho jde kdykoli v nastavení App Store nebo Google Play. Cena je pro všechny
          stejná.
        </Text>

        {creditFirst ? null : creditSection}

        <Banner tone="safe" icon="shieldCheck" title="Bezpečnost je vždy zdarma" subtitle="Ověření, domluva, bezpečnostní režim, SOS i nahlašování." />
        {billing?.provider === 'dev' ? <Text style={s.fine}>Prototyp: nic se nezaplatí, nákup se jen nasimuluje.</Text> : null}
      </ScrollView>
    </Screen>
  );
}

function creditBalance(billing: NonNullable<ReturnType<typeof useBilling>>, kind: CreditKind) {
  if (kind === 'boost') return billing.boost.credits;
  if (kind === 'superlike') return billing.superLikes.credits;
  return billing.tonight.credits;
}

const s = StyleSheet.create({
  segment: { flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineSoft },
  segmentItem: { flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.accent },
  segmentText: { fontFamily: fonts.bold, fontSize: 15, color: colors.muted },
  feature: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  featureName: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  featureDetail: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  owned: { fontFamily: fonts.semibold, fontSize: 13, color: colors.safe },
  duration: { flex: 1, padding: 12, gap: 2, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  durationOn: { borderColor: colors.accent, backgroundColor: colors.accentBg },
  durationMonths: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  durationPrice: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  durationNote: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  fine: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.faint },
  section: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  creditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface },
  priceChip: { minWidth: 64, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: 'center' },
  priceChipTop: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  priceChipBottom: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  done: { flex: 1, padding: 24, gap: 16, alignItems: 'center', justifyContent: 'center' },
  doneIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
