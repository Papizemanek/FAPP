import { REVOKE_COOLDOWN_DAYS } from '@yesyes/shared';
import { router } from 'expo-router';
import { View } from 'react-native';
import type { MatchDetail } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Banner } from './ui';

/** Pruh v chatu: co je potřeba udělat s domluvou (jediný krok navíc oproti běžné seznamce). */
export function AgreementBanner({ detail }: { detail: MatchDetail }) {
  const t = useT();
  const { agreement, partner, safety, id } = detail;
  const open = () => router.push(`/agreement/${id}`);

  // Odstrašení: protějšek ví, že druhý není sám – důvěryhodná osoba ví, kde a s kým je.
  const partnerSafety = safety.partner.active ? (
    <Banner
      tone="safe"
      icon="shieldCheck"
      title={t('agreementBanner.partnerSafetyTitle', { name: partner.name })}
      subtitle={t('agreementBanner.partnerSafetySubtitle')}
    />
  ) : null;

  const main = (() => {
    if (safety.mine) {
      return (
        <Banner
          tone="safe"
          icon="shieldCheck"
          title={t('agreementBanner.meetupTitle')}
          subtitle={t('agreementBanner.meetupSubtitle')}
          action={t('common.open')}
          onPress={() => router.push(`/meetup/${id}`)}
        />
      );
    }
    if (!agreement || ['past', 'expired'].includes(agreement.status)) {
      return (
        <Banner
          tone="safe"
          icon="shieldCheck"
          title={t('agreementBanner.missingTitle')}
          subtitle={t('agreementBanner.missingSubtitle')}
          action={t('agreementBanner.fill')}
          onPress={open}
        />
      );
    }
    if (agreement.status === 'revoked') {
      const cooldown =
        agreement.revokedByMe === false && !!agreement.revokedAt && Date.now() < Date.parse(agreement.revokedAt) + REVOKE_COOLDOWN_DAYS * 86400_000;
      return (
        <Banner
          tone="alarm"
          title={agreement.revokedByMe ? t('agreementBanner.revokedByMeTitle') : t('agreementBanner.revokedByPartnerTitle', { name: partner.name })}
          subtitle={cooldown ? t('agreementBanner.revokedCooldownSubtitle', { name: partner.name }) : t('agreementBanner.revokedSubtitle')}
          action={cooldown ? undefined : t('agreementBanner.newAgreement')}
          onPress={cooldown ? undefined : open}
        />
      );
    }
    if (agreement.status === 'confirmed') {
      return (
        <Banner
          tone="safe"
          icon="shieldCheck"
          title={t('agreementBanner.confirmedTitle')}
          subtitle={t('agreementBanner.confirmedSubtitle')}
          action={t('common.show')}
          onPress={open}
        />
      );
    }
    if (!agreement.confirmedByMe) {
      return (
        <Banner
          tone="warn"
          title={agreement.partnerFilled ? t('agreementBanner.partnerFilledTitle', { name: partner.name }) : t('agreementBanner.waitingForYouTitle')}
          subtitle={t('agreementBanner.fillYoursSubtitle')}
          action={t('agreementBanner.fill')}
          onPress={open}
        />
      );
    }
    return (
      <Banner
        tone="warn"
        title={t('agreementBanner.partnerPendingTitle', { name: partner.name })}
        subtitle={t('agreementBanner.partnerPendingSubtitle')}
        action={t('common.show')}
        onPress={open}
      />
    );
  })();

  return (
    <View style={{ gap: 8 }}>
      {main}
      {partnerSafety}
    </View>
  );
}
