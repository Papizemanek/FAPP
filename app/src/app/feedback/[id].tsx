import { FEEDBACK_REASONS } from '@fapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Checkbox, Chip, ErrorText, Field, Header, Screen, Title } from '@/components/ui';
import { api, errorMessage, type FeedbackReason } from '@/lib/api';
import { colors, fonts } from '@/lib/theme';

const reasons = Object.keys(FEEDBACK_REASONS) as FeedbackReason[];

// Kontakty ověřit před spuštěním (README).
const HELP = [
  { name: 'Linka pomoci obětem kriminality – Bílý kruh bezpečí', detail: 'Nonstop, zdarma, můžeš zůstat v anonymitě.', phone: '116006', label: '116 006' },
  { name: 'Policie ČR', detail: 'Když chceš čin oznámit – i později.', phone: '158', label: '158' },
  { name: 'Persefona', detail: 'Pomoc lidem, kteří zažili sexuální násilí.', url: 'https://www.persefona.cz', label: 'persefona.cz' },
];

export default function Feedback() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [bad, setBad] = useState(false);
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [details, setDetails] = useState('');
  const [preserve, setPreserve] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const send = async (ok: boolean) => {
    setBusy(true);
    setError('');
    try {
      await api('POST', `/feedback/${id}`, ok ? { ok: true } : { ok: false, reason, details, preserve });
      if (!ok && (reason === 'consent' || reason === 'safety')) setShowHelp(true);
      else router.back();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (showHelp) {
    return (
      <Screen>
        <Header />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <Title style={{ fontSize: 30 }}>Mrzí nás to</Title>
          <Body muted>
            Prověříme to a účet druhého jsme do kontroly pozastavili. Nemusíš se rozhodovat hned, co dál – a nic z toho
            není tvoje vina.
          </Body>
          {HELP.map((h) => (
            <Pressable
              key={h.name}
              accessibilityRole="link"
              onPress={() => Linking.openURL(h.phone ? `tel:${h.phone}` : h.url!).catch(() => {})}
              style={s.card}
            >
              <Text style={s.cardTitle}>{h.name}</Text>
              <Text style={s.cardDetail}>{h.detail}</Text>
              <Text selectable style={s.cardContact}>
                {h.label}
              </Text>
            </Pressable>
          ))}
          <Body muted style={{ fontSize: 14 }}>
            Pokud došlo k něčemu proti tvé vůli, vyhledej co nejdřív lékařskou pomoc – i kvůli prevenci těhotenství a
            infekcí, některé léky fungují jen do 72 hodin. Stopy se dají zajistit, když se ještě nesprchuješ a uschováš
            oblečení. Ale nic z toho není podmínkou – oznámit to můžeš i později.
          </Body>
          {preserve ? (
            <Body muted style={{ fontSize: 14 }}>
              Záznam schůzky (domluvu, zprávy, poplachy) jsme uchovali, kdybys ho potřeboval/a pro policii.
            </Body>
          ) : null}
          <Button label="Zpět do aplikace" onPress={() => router.replace('/')} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
        <Title style={{ fontSize: 30 }}>Jak proběhla schůzka?</Title>
        <Body muted>
          Odpověď uvidí jen náš tým, {name ?? 'protějšek'} ji nikdy neuvidí. Pomáhá nám udržet tu lidi, kteří respektují hranice.
        </Body>
        {!bad ? (
          <View style={{ gap: 12 }}>
            <Button variant="safe" label="Všechno bylo v pořádku" onPress={() => send(true)} loading={busy} />
            <Button variant="ghost" label="Něco nebylo v pořádku" onPress={() => setBad(true)} />
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {reasons.map((r) => (
                <Chip key={r} label={FEEDBACK_REASONS[r]} selected={reason === r} onPress={() => setReason(r)} />
              ))}
            </View>
            <Field label="Co se stalo? (nepovinné)" value={details} onChangeText={setDetails} multiline />
            <Checkbox checked={preserve} onToggle={() => setPreserve(!preserve)}>
              Uchovat záznam schůzky pro případné řešení s policií. Jinak se domluva po 48 hodinách maže.
            </Checkbox>
            <Body muted style={{ fontSize: 13 }}>
              Pokud tě někdo nerespektoval nebo jsi v ohrožení, účet pozastavíme hned a prověříme to.
            </Body>
            <Button label="Odeslat" onPress={() => send(false)} loading={busy} disabled={!reason} />
          </View>
        )}
        <ErrorText>{error}</ErrorText>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { gap: 4, padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineSoft },
  cardTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  cardDetail: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  cardContact: { fontFamily: fonts.display, fontSize: 22, color: colors.safe, marginTop: 4 },
});
