import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, fonts } from '@/lib/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/**
 * Zadání PINu. Běžný i nouzový PIN tu vypadají a chovají se úplně stejně –
 * kdo kouká přes rameno, nepozná, který z nich byl zadaný.
 */
export function PinPad({
  visible,
  title,
  subtitle,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onSubmit: (pin: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setPin('');
      setError('');
    }
  }, [visible]);

  const press = (key: string) => {
    if (busy) return;
    setError('');
    if (key === '⌫') return setPin((p) => p.slice(0, -1));
    if (key && pin.length < 6) setPin((p) => p + key);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(pin);
    } catch (err) {
      setError(errorMessage(err));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
          <View style={s.dots} accessibilityLabel={t('pinPad.entered', { count: pin.length })}>
            {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
              <View key={i} style={[s.dot, i < pin.length && s.dotOn]} />
            ))}
          </View>
          <Text style={s.error}>{error}</Text>
          <View style={s.grid}>
            {KEYS.map((key, i) => (
              <Pressable
                key={i}
                disabled={!key}
                accessibilityLabel={key === '⌫' ? t('common.delete') : key}
                onPress={() => press(key)}
                style={({ pressed }) => [s.key, !key && { opacity: 0 }, pressed && { backgroundColor: colors.surface2 }]}
              >
                <Text style={s.keyText}>{key}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.actions}>
            <Pressable onPress={onClose} style={[s.action, s.ghost]} accessibilityRole="button">
              <Text style={s.actionText}>{t('common.back')}</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={pin.length < 4 || busy}
              style={[s.action, { backgroundColor: pin.length >= 4 ? colors.safe : colors.lineSoft }]}
              accessibilityRole="button"
            >
              <Text style={[s.actionText, { color: pin.length >= 4 ? colors.onAccent : colors.faint }]}>{t('common.confirm')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10, 8, 12, 0.72)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, gap: 8 },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.text, textAlign: 'center' },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 12 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.lineStrong },
  dotOn: { backgroundColor: colors.text, borderColor: colors.text },
  error: { minHeight: 20, fontFamily: fonts.semibold, fontSize: 14, color: colors.alarm, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  key: { width: '33.33%', height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  keyText: { fontFamily: fonts.semibold, fontSize: 26, color: colors.text },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  action: { flex: 1, height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  ghost: { borderWidth: 1.5, borderColor: colors.lineStrong },
  actionText: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
});
