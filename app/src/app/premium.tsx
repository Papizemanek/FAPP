import { CREDITS, FEATURES, PLANS, PRODUCTS, type CreditKind, type FeatureId, type PlanId, type ProductId } from '@yesyes/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Banner, Body, Button, ErrorText, Header, Screen, Title } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { purchase, useBilling } from '@/lib/billing';
import { formatDate, formatPrice, formatTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { colors, fonts } from '@/lib/theme';

type PaidPlan = Exclude<PlanId, 'free'>;
const paidPlans: PaidPlan[] = ['plus', 'gold', 'platinum'];
const featureIds = Object.keys(FEATURES) as FeatureId[];
const durations = [1, 6, 12] as const;

const credits: { kind: CreditKind; products: ProductId[] }[] = [
  { kind: 'boost', products: ['boost_1', 'boost_5'] },
  { kind: 'superlike', products: ['superlike_1', 'superlike_5'] },
  { kind: 'tonight', products: ['tonight_1'] },
];

const productFor = (plan: PaidPlan, months: number) => `${plan}_${months}m` as ProductId;
const priceOf = (id: ProductId) => PRODUCTS[id].priceCzk;

/** Nabídka předplatného po vzoru Tinderu. Bezpečnost je vždy zdarma – tady se prodává jen pohodlí a viditelnost. */
export default function Premium() {
  const t = useT();
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
          <Title>{t('premium.free.title')}</Title>
          <Body muted>{t('premium.free.body')}</Body>
          <Button label={t('premium.back')} onPress={() => router.back()} />
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
          <Title style={{ textAlign: 'center' }}>{t('premium.done')}</Title>
          <Body muted style={{ textAlign: 'center' }}>{done}</Body>
          <Button label={t('premium.continue')} onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
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
      ? params.resetAt
        ? t('premium.reason.likeLimitAt', { time: formatTime(params.resetAt) })
        : t('premium.reason.likeLimit')
      : params.reason === 'no_credit' && params.credit && params.credit in CREDITS
        ? t('premium.reason.noCredit', { credit: t(`labels.credits.${params.credit}`) })
        : params.reason === 'upgrade'
          ? t('premium.reason.upgrade', { plan: t(`labels.plans.${initial}`) })
          : null;

  const creditSection = (
    <View style={{ gap: 10 }}>
      <Text style={s.section}>{t('premium.oneOff')}</Text>
      {credits.map((c) => (
        <View key={c.kind} style={[s.creditRow, params.credit === c.kind && { borderColor: colors.accent }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.featureName}>
              {t(`labels.credits.${c.kind}`)}
              {billing && creditBalance(billing, c.kind) > 0 ? (
                <Text style={s.owned}>{`  · ${t('premium.owned', { count: creditBalance(billing, c.kind) })}`}</Text>
              ) : null}
            </Text>
            <Text style={s.featureDetail}>{t(`premium.creditDetail.${c.kind}`)}</Text>
          </View>
          {c.products.map((id) => {
            const p = PRODUCTS[id];
            const amount = p.kind === 'credit' ? p.amount : 1;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={t('premium.buyCredit', { amount, credit: t(`labels.credits.${c.kind}`), price: formatPrice(p.priceCzk) })}
                disabled={!!busy}
                onPress={() => buy(id, t(`premium.creditBought.${c.kind}`, { count: amount }))}
                style={({ pressed }) => [s.priceChip, pressed && { opacity: 0.8 }]}
              >
                <Text style={s.priceChipTop}>{amount}×</Text>
                <Text style={s.priceChipBottom}>{formatPrice(p.priceCzk)}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );

  return (
    <Screen>
      <Header title={t('premium.title')} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 18 }}>
        {reason ? <Banner tone="warn" icon="heart" title={reason} /> : null}
        {billing && billing.plan !== 'free' ? (
          <Banner
            tone="safe"
            icon="crown"
            title={t('premium.currentPlan', { plan: t(`labels.plans.${billing.plan}`) })}
            subtitle={billing.planExpiresAt ? t('premium.validUntil', { date: formatDate(billing.planExpiresAt) }) : undefined}
          />
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
              <Text style={[s.segmentText, plan === p && { color: colors.onAccent }]}>{t(`labels.plans.${p}`)}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ gap: 6 }}>
          <Title style={{ fontSize: 30 }}>{t('premium.planTitle', { plan: t(`labels.plans.${plan}`) })}</Title>
          <Body muted>{t(`premium.tagline.${plan}`)}</Body>
        </View>

        <View style={{ gap: 12 }}>
          {featureIds.map((f) => {
            const included = PLANS[FEATURES[f].plan].rank <= rank;
            return (
              <View key={f} style={[s.feature, !included && { opacity: 0.4 }]} accessibilityLabel={t(included ? 'premium.featureIncluded' : 'premium.featureNotIncluded', { feature: t(`labels.features.${f}.name`) })}>
                <Icon name={included ? 'check' : 'close'} size={18} color={included ? colors.accent : colors.faint} strokeWidth={2.6} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={s.featureName}>{t(`labels.features.${f}.name`)}</Text>
                  <Text style={s.featureDetail}>{t(`labels.features.${f}.detail`)}</Text>
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
                <Text style={s.durationMonths}>{t('premium.months', { count: m })}</Text>
                <Text style={s.durationPrice}>{formatPrice(perMonth)}</Text>
                <Text style={s.durationNote}>{save > 0 ? t('premium.perMonthSave', { percent: save }) : t('premium.perMonth')}</Text>
              </Pressable>
            );
          })}
        </View>

        <Button
          label={t('premium.continueWithPrice', { price: formatPrice(priceOf(selected)) })}
          loading={busy === selected}
          disabled={!!busy && busy !== selected}
          onPress={() => buy(selected, t('premium.planBought', { plan: t(`labels.plans.${plan}`), count: months }))}
        />
        <ErrorText>{error}</ErrorText>
        <Text style={s.fine}>
          {months > 1
            ? t('premium.renewalUpfront', { total: formatPrice(priceOf(selected)), monthly: formatPrice(monthly) })
            : t('premium.renewal')}
        </Text>

        {creditFirst ? null : creditSection}

        <Banner tone="safe" icon="shieldCheck" title={t('premium.safetyFree.title')} subtitle={t('premium.safetyFree.subtitle')} />
        {billing?.provider === 'dev' ? <Text style={s.fine}>{t('premium.devNote')}</Text> : null}
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
