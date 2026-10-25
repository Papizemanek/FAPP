import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import { useT } from '@/lib/i18n';
import { colors, fonts } from '@/lib/theme';
import { Button } from './ui';

// Vysouvací panely místo systémových dialogů – vypadají stejně na iOS, Androidu i na webu.

function SheetFrame({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel={t('common.close')}>
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
  const t = useT();
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
        <Button label={t('common.back')} variant="ghost" height={48} onPress={onClose} />
      </View>
    </SheetFrame>
  );
}

export type SheetAction = { label: string; destructive?: boolean; onPress: () => void };

export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title: string; actions: SheetAction[]; onClose: () => void }) {
  const t = useT();
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
      <Button label={t('common.back')} variant="ghost" height={48} onPress={onClose} style={{ marginTop: 8 }} />
    </SheetFrame>
  );
}

/** Výběr jedné možnosti z delšího seznamu (např. jazyk). */
export function PickerSheet<T extends string>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <SheetFrame visible={visible} onClose={onClose}>
      <Text style={s.title}>{title}</Text>
      <ScrollView style={{ maxHeight: 420, marginTop: 4 }}>
        {options.map((o) => (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: o.value === selected }}
            onPress={() => {
              onClose();
              onSelect(o.value);
            }}
            style={({ pressed }) => [s.action, s.option, pressed && { backgroundColor: colors.surface2 }]}
          >
            <Text style={[s.actionText, o.value === selected && { color: colors.accent }]}>{o.label}</Text>
            {o.value === selected ? <Icon name="check" size={18} color={colors.accent} /> : null}
          </Pressable>
        ))}
      </ScrollView>
      <Button label={t('common.close')} variant="ghost" height={48} onPress={onClose} style={{ marginTop: 8 }} />
    </SheetFrame>
  );
}

const s = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backdrop: { flex: 1, backgroundColor: 'rgba(10, 8, 12, 0.72)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, gap: 8 },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  message: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.muted },
  action: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, borderRadius: 8 },
  actionText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
});
