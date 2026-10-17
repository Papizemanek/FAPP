import { Redirect, Tabs } from 'expo-router';
import { Icon } from '@/components/Icon';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  const t = useT();
  const { status, me } = useSession();
  if (status === 'signedOut') return <Redirect href="/welcome" />;
  if (me && me.verificationStatus !== 'approved') return <Redirect href="/verify" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.lineSoft, height: 72 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{ title: t('tabs.discover'), tabBarIcon: ({ color }) => <Icon name="asterisk" size={26} color={color} strokeWidth={2.2} /> }}
      />
      <Tabs.Screen name="matches" options={{ title: t('tabs.matches'), tabBarIcon: ({ color }) => <Icon name="chat" size={26} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: ({ color }) => <Icon name="user" size={26} color={color} /> }} />
    </Tabs>
  );
}
