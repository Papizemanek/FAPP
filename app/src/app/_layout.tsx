// Úlohu pro sdílení polohy na pozadí je nutné zaregistrovat hned při startu.
import '@/lib/safetyTracking';
import '@/lib/notifications';

import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, useFonts } from '@expo-google-fonts/manrope';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppLockProvider } from '@/lib/appLock';
import { SessionProvider, useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

function useNotificationNavigation() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const data = response?.notification.request.content.data as { type?: string; matchId?: number } | undefined;
    if (data?.type === 'likes') return void router.push('/likes');
    if (!data?.matchId) return;
    if (data.type === 'message' || data.type === 'match') router.push(`/chat/${data.matchId}`);
    if (data.type === 'agreement') router.push(`/agreement/${data.matchId}`);
  }, [response]);
}

function Navigation() {
  const { status } = useSession();
  useNotificationNavigation();
  return (
    <AppLockProvider signedIn={status === 'signedIn'}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="match" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="premium" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack>
    </AppLockProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_800ExtraBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SessionProvider>
        <Navigation />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
