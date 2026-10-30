import { useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { t } from './i18n';
import { colors, fonts } from './theme';

// Krátké oznámení s tlačítkem OK. Na rozdíl od Alert.alert funguje i ve webové verzi
// (tam Alert.alert z React Native nic neukáže).

type Notice = { title: string; message?: string } | null;
let current: Notice = null;
const listeners = new Set<() => void>();
const set = (n: Notice) => {
  current = n;
  listeners.forEach((fn) => fn());
};

export const showNotice = (title: string, message?: string) => set({ title, message });

export function NoticeHost() {
  const notice = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => current,
  );
  return (
    <Modal visible={!!notice} transparent animationType="fade" onRequestClose={() => set(null)}>
      <Pressable style={s.backdrop} onPress={() => set(null)}>
        <Pressable style={s.card} accessibilityRole="alert">
          <Text style={s.title}>{notice?.title}</Text>
          {notice?.message ? <Text style={s.message}>{notice.message}</Text> : null}
          <View style={{ marginTop: 8 }}>
            <Button label={t('common.ok')} height={48} onPress={() => set(null)} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 8, borderWidth: 1, borderColor: colors.line, maxWidth: 440, width: '100%', alignSelf: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  message: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.muted },
});
