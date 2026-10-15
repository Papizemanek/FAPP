import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { fonts } from '@/lib/theme';

/**
 * Falešný příchozí hovor – nenápadná výmluva, jak ze schůzky odejít („volá mi ségra, musím jít“).
 * Vypadá jako obyčejný hovor, nic na něm neprozrazuje F*app.
 */
export function FakeCall({ visible, caller, onClose }: { visible: boolean; caller: string; onClose: () => void }) {
  const [answeredAt, setAnsweredAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) return;
    setAnsweredAt(null);
    try {
      Vibration.vibrate([0, 800, 700], true);
    } catch {
      // vibrace nemusí být dostupná
    }
    return () => Vibration.cancel();
  }, [visible]);

  useEffect(() => {
    if (answeredAt === null) return;
    timer.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [answeredAt]);

  const answer = () => {
    Vibration.cancel();
    setNow(Date.now());
    setAnsweredAt(Date.now());
  };
  const hangUp = () => {
    Vibration.cancel();
    onClose();
  };

  const seconds = answeredAt ? Math.floor((now - answeredAt) / 1000) : 0;
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={hangUp}>
      <View style={s.wrap}>
        <View style={{ alignItems: 'center', gap: 10, marginTop: 80 }}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{caller.slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={s.name}>{caller}</Text>
          <Text style={s.state}>{answeredAt ? duration : 'mobil volá…'}</Text>
        </View>
        {answeredAt ? (
          <View style={s.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Zavěsit" onPress={hangUp} style={[s.round, { backgroundColor: '#E5484D' }]}>
              <Text style={s.roundText}>Zavěsit</Text>
            </Pressable>
          </View>
        ) : (
          <View style={s.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Odmítnout" onPress={hangUp} style={[s.round, { backgroundColor: '#E5484D' }]}>
              <Text style={s.roundText}>Odmítnout</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Přijmout" onPress={answer} style={[s.round, { backgroundColor: '#30A46C' }]}>
              <Text style={s.roundText}>Přijmout</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0B0B0D', justifyContent: 'space-between', paddingBottom: 72 },
  avatar: { width: 112, height: 112, borderRadius: 56, backgroundColor: '#3A3A40', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.semibold, fontSize: 44, color: '#FFFFFF' },
  name: { fontFamily: fonts.semibold, fontSize: 32, color: '#FFFFFF' },
  state: { fontFamily: fonts.regular, fontSize: 17, color: '#A0A0A8' },
  actions: { flexDirection: 'row', justifyContent: 'space-evenly' },
  round: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  roundText: { fontFamily: fonts.semibold, fontSize: 13, color: '#FFFFFF' },
});

export const FAKE_CALL_DELAY_SECONDS = 30;
