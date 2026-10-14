import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Avatar, Body, Button, Screen } from '@/components/ui';
import { useSession } from '@/lib/session';
import { colors, fonts } from '@/lib/theme';

export default function MatchModal() {
  const { matchId, name, photo } = useLocalSearchParams<{ matchId: string; name: string; photo?: string }>();
  const { me } = useSession();
  return (
    <Screen style={{ paddingHorizontal: 24, paddingVertical: 32 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 32 }}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ borderWidth: 4, borderColor: colors.bg, borderRadius: 70 }}>
            <Avatar name={me?.name ?? '?'} photo={me?.photos[0]} size={128} index={1} />
          </View>
          <View style={{ marginLeft: -24, borderWidth: 4, borderColor: colors.bg, borderRadius: 70 }}>
            <Avatar name={name ?? '?'} photo={photo || null} size={128} />
          </View>
        </View>
        <View style={{ gap: 10, alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 48, color: colors.accent, letterSpacing: -1.5 }}>Je to match!</Text>
          <Body muted style={{ textAlign: 'center', fontSize: 16 }}>
            Ty a {name} se chcete.{'\n'}Napiš a domluvte se na dohodě.
          </Body>
        </View>
      </View>
      <View style={{ gap: 12 }}>
        <Button label="Napsat zprávu" onPress={() => router.replace(`/chat/${matchId}`)} />
        <Button variant="ghost" label="Pokračovat v objevování" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
