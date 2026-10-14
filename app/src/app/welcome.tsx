import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, Logo, Screen } from '@/components/ui';
import { colors, fonts } from '@/lib/theme';

export default function Welcome() {
  return (
    <Screen style={{ paddingHorizontal: 24, paddingVertical: 32 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <Logo size={76} />
        <Text style={{ fontFamily: fonts.regular, fontSize: 18, lineHeight: 26, color: colors.muted, textAlign: 'center' }}>
          Sex bez okolků.{'\n'}
          <Text style={{ fontFamily: fonts.semibold, color: colors.text }}>
            <Text style={{ color: colors.accent }}>*</Text>Jen se souhlasem obou.
          </Text>
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        <Button label="Vytvořit účet" onPress={() => router.push('/register')} />
        <Button label="Přihlásit se" variant="ghost" onPress={() => router.push('/login')} />
        <Text style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: 'center', marginTop: 8 }}>
          Jen pro 18+. Každý tu má ověřenou totožnost.
        </Text>
      </View>
    </Screen>
  );
}
