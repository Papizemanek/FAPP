import { router } from 'expo-router';
import type { MatchDetail } from '@/lib/api';
import { Banner } from './ui';

/** Pruh v chatu: co je potřeba udělat s dohodou (jediný krok navíc oproti běžné seznamce). */
export function AgreementBanner({ detail }: { detail: MatchDetail }) {
  const { agreement, partner, safety, id } = detail;
  const open = () => router.push(`/agreement/${id}`);

  if (safety.mine) {
    return (
      <Banner tone="safe" icon="shieldCheck" title="Schůzka probíhá" subtitle="Bezpečnostní režim je zapnutý." action="Otevřít" onPress={() => router.push(`/meetup/${id}`)} />
    );
  }
  if (!agreement || ['past', 'expired'].includes(agreement.status)) {
    return <Banner tone="safe" icon="shieldCheck" title="Dohoda zatím chybí" subtitle="Než se potkáte, potvrďte si ji oba." action="Navrhnout" onPress={open} />;
  }
  if (agreement.status === 'revoked') {
    return (
      <Banner
        tone="alarm"
        title={agreement.revokedByMe ? 'Odvolal/a jsi souhlas' : `${partner.name} odvolal/a souhlas`}
        subtitle="Schůzka se nekoná. Novou dohodu jde navrhnout kdykoli."
        action="Nová dohoda"
        onPress={open}
      />
    );
  }
  if (agreement.status === 'confirmed') {
    return (
      <Banner tone="safe" icon="shieldCheck" title="Dohoda platí" subtitle="Potvrdili jste ji oba." action="Zahájit schůzku" onPress={() => router.push(`/meetup/${id}`)} />
    );
  }
  if (!agreement.confirmedByMe) {
    return <Banner tone="warn" title={`${partner.name} navrhl/a dohodu`} subtitle="Přečti si ji a potvrď, nebo navrhni změnu." action="Zobrazit" onPress={open} />;
  }
  return <Banner tone="warn" title={`${partner.name} ještě nepotvrdil/a`} subtitle="Dohoda platí, až ji potvrdíte oba." action="Zobrazit" onPress={open} />;
}
