import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/lib/theme';
import { Button } from './ui';

// Vysouvací panely místo systémových dialogů – vypadají stejně na iOS, Androidu i na webu.

function SheetFrame({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Zavřít">
        <Pressable style={s.sheet} onPress={() => {}}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  destructive,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <SheetFrame visible={visible} onClose={onClose}>
      <Text style={s.title}>{title}</Text>
      {message ? <Text style={s.message}>{message}</Text> : null}
      <View style={{ gap: 10, marginTop: 8 }}>
        <Button
          label={confirmLabel}
          variant={destructive ? 'danger' : 'accent'}
          onPress={() => {
            onClose();
            onConfirm();
          }}
        />
        <Button label="Zpět" variant="ghost" height={48} onPress={onClose} />
      </View>
    </SheetFrame>
  );
}

export type SheetAction = { label: string; destructive?: boolean; onPress: () => void };

export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title: string; actions: SheetAction[]; onClose: () => void }) {
  return (
    <SheetFrame visible={visible} onClose={onClose}>
      <Text style={s.title}>{title}</Text>
      <View style={{ marginTop: 4 }}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              a.onPress();
            }}
            style={({ pressed }) => [s.action, pressed && { backgroundColor: colors.surface2 }]}
          >
            <Text style={[s.actionText, a.destructive && { color: colors.alarm }]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
      <Button label="Zpět" variant="ghost" height={48} onPress={onClose} style={{ marginTop: 8 }} />
    </SheetFrame>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10, 8, 12, 0.72)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, gap: 8 },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  message: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.muted },
  action: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, borderRadius: 8 },
  actionText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
});
