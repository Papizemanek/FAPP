import { REVOKE_COOLDOWN_DAYS } from '@fapp/shared';
import { router } from 'expo-router';
import { View } from 'react-native';
import type { MatchDetail } from '@/lib/api';
import { Banner } from './ui';

/** Pruh v chatu: co je potřeba udělat s domluvou (jediný krok navíc oproti běžné seznamce). */
export function AgreementBanner({ detail }: { detail: MatchDetail }) {
  const { agreement, partner, safety, id } = detail;
  const open = () => router.push(`/agreement/${id}`);

  // Odstrašení: protějšek ví, že druhý není sám – důvěryhodná osoba ví, kde a s kým je.
  const partnerSafety = safety.partner.active ? (
    <Banner
      tone="safe"
      icon="shieldCheck"
      title={`${partner.name} má zapnutý bezpečnostní režim`}
      subtitle="Důvěryhodná osoba ví, kde a s kým je."
    />
  ) : null;

  const main = (() => {
    if (safety.mine) {
      return (
        <Banner tone="safe" icon="shieldCheck" title="Schůzka probíhá" subtitle="Bezpečnostní režim je zapnutý." action="Otevřít" onPress={() => router.push(`/meetup/${id}`)} />
      );
    }
    if (!agreement || ['past', 'expired'].includes(agreement.status)) {
      return <Banner tone="safe" icon="shieldCheck" title="Domluva zatím chybí" subtitle="Každý vyplní, na co má chuť – uvidíte jen shodu." action="Vyplnit" onPress={open} />;
    }
    if (agreement.status === 'revoked') {
      const cooldown =
        agreement.revokedByMe === false && !!agreement.revokedAt && Date.now() < Date.parse(agreement.revokedAt) + REVOKE_COOLDOWN_DAYS * 86400_000;
      return (
        <Banner
          tone="alarm"
          title={agreement.revokedByMe ? 'Zrušil/a jsi domluvu' : `${partner.name} zrušil/a domluvu`}
          subtitle={cooldown ? `Schůzka se nekoná. Novou domluvu může otevřít jen ${partner.name}.` : 'Schůzka se nekoná.'}
          action={cooldown ? undefined : 'Nová domluva'}
          onPress={cooldown ? undefined : open}
        />
      );
    }
    if (agreement.status === 'confirmed') {
      return (
        <Banner tone="safe" icon="shieldCheck" title="Domluva je hotová" subtitle="Na místě se můžete kdykoli rozhodnout jinak." action="Zobrazit" onPress={open} />
      );
    }
    if (!agreement.confirmedByMe) {
      return (
        <Banner
          tone="warn"
          title={agreement.partnerFilled ? `${partner.name} vyplnil/a domluvu` : 'Domluva čeká na tebe'}
          subtitle="Vyplň, na co máš chuť ty – uvidíte jen shodu."
          action="Vyplnit"
          onPress={open}
        />
      );
    }
    return <Banner tone="warn" title={`${partner.name} ještě nevyplnil/a`} subtitle="Domluva je hotová, až ji vyplníte oba." action="Zobrazit" onPress={open} />;
  })();

  return (
    <View style={{ gap: 8 }}>
      {main}
      {partnerSafety}
    </View>
  );
}
