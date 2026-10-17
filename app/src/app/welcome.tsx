import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, Logo, Screen } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { colors, fonts } from '@/lib/theme';

export default function Welcome() {
  const t = useT();
  return (
    <Screen style={{ paddingHorizontal: 24, paddingVertical: 32 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <Logo size={76} />
        <Text style={{ fontFamily: fonts.regular, fontSize: 18, lineHeight: 26, color: colors.muted, textAlign: 'center' }}>
          {t('welcome.tagline')}
          {'\n'}
          <Text style={{ fontFamily: fonts.semibold, color: colors.text }}>
            <Text style={{ color: colors.accent }}>*</Text>
            {t('welcome.taglineStrong')}
          </Text>
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        <Button label={t('welcome.createAccount')} onPress={() => router.push('/register')} />
        <Button label={t('welcome.signIn')} variant="ghost" onPress={() => router.push('/login')} />
        <Text style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: 'center', marginTop: 8 }}>
          {t('welcome.adultsOnly')}
        </Text>
      </View>
    </Screen>
  );
}
