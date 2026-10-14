import { FEEDBACK_REASONS } from '@fapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Body, Button, Chip, ErrorText, Field, Header, Screen, Title } from '@/components/ui';
import { api, errorMessage, type FeedbackReason } from '@/lib/api';

const reasons = Object.keys(FEEDBACK_REASONS) as FeedbackReason[];

export default function Feedback() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [bad, setBad] = useState(false);
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (ok: boolean) => {
    setBusy(true);
    setError('');
    try {
      await api('POST', `/feedback/${id}`, ok ? { ok: true } : { ok: false, reason, details });
      router.back();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
        <Title style={{ fontSize: 30 }}>Jak proběhla schůzka{name ? ` s ${name}` : ''}?</Title>
        <Body muted>
          Odpověď uvidí jen náš tým, {name ?? 'protějšek'} ji nikdy neuvidí. Pomáhá nám udržet tu lidi, kteří respektují hranice.
        </Body>
        {!bad ? (
          <View style={{ gap: 12 }}>
            <Button variant="safe" label="Všechno proběhlo podle dohody" onPress={() => send(true)} loading={busy} />
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
