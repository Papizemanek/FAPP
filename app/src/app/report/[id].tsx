import { REPORT_REASONS } from '@fapp/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Body, Button, Chip, ErrorText, Field, Header, Screen, Title } from '@/components/ui';
import { api, errorMessage, type ReportReason } from '@/lib/api';

const reasons = Object.keys(REPORT_REASONS) as ReportReason[];

export default function Report() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      await api('POST', `/users/${id}/report`, { reason, details });
      Alert.alert('Děkujeme', `Nahlášení jsme přijali. ${name ?? 'Uživatele'} už neuvidíš.`);
      router.replace('/matches');
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
        <Title>Nahlásit{name ? ` ${name}` : ''}</Title>
        <Body muted>Nahlášení je anonymní. Zároveň tě zablokujeme, takže se už navzájem neuvidíte.</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {reasons.map((r) => (
            <Chip key={r} label={REPORT_REASONS[r]} selected={reason === r} onPress={() => setReason(r)} />
          ))}
        </View>
        <Field label="Podrobnosti (nepovinné)" value={details} onChangeText={setDetails} multiline />
        <ErrorText>{error}</ErrorText>
        <Button label="Nahlásit" onPress={send} loading={busy} disabled={!reason} />
      </ScrollView>
    </Screen>
  );
}
