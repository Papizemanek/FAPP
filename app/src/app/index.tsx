import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

export default function Index() {
  const { status, me } = useSession();
  if (status === 'loading') return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (status === 'signedOut' || !me) return <Redirect href="/welcome" />;
  if (me.verificationStatus !== 'approved') return <Redirect href="/verify" />;
  return <Redirect href="/discover" />;
}
